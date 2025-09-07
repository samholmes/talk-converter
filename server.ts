import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import fs from 'fs/promises';
import path from 'path';

// Types
interface Segment { start: number; end: number; title: string }
interface Proc {
  id: string;
  sourceType: 'youtube' | 'talks';
  filename: string;
  sourcePath: string;
  segments: Segment[];
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  currentIndex: number;
  total: number;
  logs: string[];
  outputs: string[];
}

// Paths
const rootDir = process.cwd();
const youtubeDir = path.join(rootDir, '__youtube');
const talksDir = path.join(rootDir, '__talks');

// In-memory state
const processes = new Map<string, Proc>();
const subscribers = new Map<string, Set<(event: string, data: string) => void>>();

// Utility
const ensureDirs = async () => {
  await fs.mkdir(youtubeDir, { recursive: true });
  await fs.mkdir(talksDir, { recursive: true });
};

const listMP4 = async (dir: string) => {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.toLowerCase().endsWith('.mp4'))
      .filter((f) => !f.toLowerCase().endsWith('.fs.mp4'))
      .sort();
  } catch {
    return [];
  }
};

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

// Cache in-flight conversions to avoid duplicate work
const convertJobs = new Map<string, Promise<string>>();

async function ensureFastStart(fp: string): Promise<{ path: string; fast: boolean }> {
  const dir = path.dirname(fp);
  const { name } = path.parse(fp);
  const out = path.join(dir, `${name}.fs.mp4`);

  // If up-to-date faststart file exists, use it
  try {
    const [src, dst] = await Promise.all([
      fs.stat(fp).catch(() => null),
      fs.stat(out).catch(() => null),
    ]);
    if (src && dst && dst.mtimeMs >= src.mtimeMs && dst.size > 0) {
      return { path: out, fast: true };
    }
  } catch { }

  // Start conversion once per source file
  if (!convertJobs.has(fp)) {
    const job = (async () => {
      const tmp = `${out}.tmp`;
      try { await fs.rm(tmp).catch(() => { }); } catch { }
      const p = Bun.spawn([
        'ffmpeg', '-y', '-i', fp, '-c', 'copy', '-movflags', '+faststart', tmp,
      ], { stdout: 'pipe', stderr: 'pipe' });
      await p.exited;
      if (p.exitCode !== 0) throw new Error('ffmpeg faststart failed');
      await fs.rename(tmp, out).catch(async () => {
        await fs.cp(tmp, out);
        await fs.rm(tmp).catch(() => { });
      });
      return out;
    })().finally(() => convertJobs.delete(fp));
    convertJobs.set(fp, job);
  }

  try {
    const result = await convertJobs.get(fp)!;
    return { path: result, fast: true };
  } catch {
    // Fallback to original if conversion fails
    return { path: fp, fast: false };
  }
}

function broadcast(procId: string, event: string, data: unknown) {
  const subs = subscribers.get(procId);
  if (!subs) return;
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  for (const send of subs) {
    try {
      send('message', payload);
    } catch {
      // ignore
    }
  }
}

function attachSubscriber(procId: string, send: (event: string, data: string) => void) {
  let set = subscribers.get(procId);
  if (!set) {
    set = new Set();
    subscribers.set(procId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
  };
}

async function runProcess(proc: Proc) {
  processes.set(proc.id, proc);
  broadcast(proc.id, 'status', { status: proc.status, currentIndex: proc.currentIndex, total: proc.total });
  for (let i = 0; i < proc.segments.length; i++) {
    proc.currentIndex = i;
    const seg = proc.segments[i];
    broadcast(proc.id, 'progress', { currentIndex: proc.currentIndex, total: proc.total, segment: seg });

    const videoId = path.parse(proc.filename).name;
    const url = `https://youtube.com/watch?v=${videoId}`;
    const timestamps = `${seg.start},${seg.end}`;

    const p = Bun.spawn(['bun', 'run', 'index.ts', url, timestamps, seg.title], {
      cwd: rootDir,
      env: { ...process.env, SKIP_POST_PROCESSING: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const readStream = async (stream: ReadableStream<Uint8Array>, which: 'stdout' | 'stderr') => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (!line) continue;
          proc.logs.push(line);
          if (proc.logs.length > 2000) proc.logs.splice(0, proc.logs.length - 2000);
          broadcast(proc.id, 'log', { which, line });
        }
      }
    };

    await Promise.all([readStream(p.stdout!, 'stdout'), readStream(p.stderr!, 'stderr')]);
    const exitCode = await p.exited;

    if (exitCode !== 0) {
      proc.status = 'failed';
      broadcast(proc.id, 'status', { status: proc.status });
      return;
    }

    // Track expected output
    const outPath = path.join(talksDir, `${sanitize(seg.title)}.mp4`);
    proc.outputs.push(outPath);
    broadcast(proc.id, 'output', { path: outPath });
  }

  proc.status = 'completed';
  proc.completedAt = Date.now();
  broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
}

const app = new Hono();

// Static: index.html and assets
app.get('/', serveStatic({ path: './public/index.html' }));
app.use('/public/*', serveStatic({ root: './' }));

// Serve media files with HTTP Range for scrubbing
app.get('/media/:type/:file', async (c: any) => {
  await ensureDirs();
  const type = c.req.param('type');
  const file = decodeURIComponent(c.req.param('file'));
  if (file.includes('..') || file.includes('/')) return c.text('Invalid path', 400);
  const base = type === 'youtube' ? youtubeDir : type === 'talks' ? talksDir : null;
  if (!base) return c.text('Invalid type', 400);
  const fp = path.join(base, file);

  // Ensure faststart version for proper scrubbing
  const target = await ensureFastStart(fp);
  const bunFile = Bun.file(target.path);
  if (!(await bunFile.exists())) return c.notFound();

  const size = bunFile.size;
  const range = c.req.header('range') || c.req.header('Range');

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) {
      return new Response('Malformed Range', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (isNaN(start) && !isNaN(end)) {
      start = size - end;
      end = size - 1;
    }
    if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= size) {
      return new Response('Unsatisfiable Range', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const chunk = bunFile.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'no-cache',
      },
    });
  }

  return new Response(bunFile, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Cache-Control': 'no-cache',
    },
  });
});

// List videos
app.get('/api/list', async (c: any) => {
  await ensureDirs();
  const live = await listMP4(youtubeDir);
  const talks = await listMP4(talksDir);
  return c.json({
    liveStreams: live.map((name) => ({ name, url: `/media/youtube/${encodeURIComponent(name)}` })),
    talks: talks.map((name) => ({ name, url: `/media/talks/${encodeURIComponent(name)}` })),
  });
});

// Start a segmentation process
app.post('/api/process', async (c: any) => {
  await ensureDirs();
  const body = (await c.req.json().catch(() => null)) as
    | { sourceType: 'youtube' | 'talks'; filename: string; segments: Segment[] }
    | null;
  if (!body || !body.sourceType || !body.filename || !Array.isArray(body.segments)) {
    return c.text('Invalid payload', 400);
  }
  const base = body.sourceType === 'youtube' ? youtubeDir : talksDir;
  const sourcePath = path.join(base, body.filename);
  const id = crypto.randomUUID();

  const proc: Proc = {
    id,
    sourceType: body.sourceType,
    filename: body.filename,
    sourcePath,
    segments: body.segments,
    status: 'running',
    startedAt: Date.now(),
    currentIndex: 0,
    total: body.segments.length,
    logs: [],
    outputs: [],
  };

  // Fire & forget
  runProcess(proc).catch((err) => {
    proc.logs.push(String(err?.stack || err));
    proc.status = 'failed';
    broadcast(proc.id, 'status', { status: proc.status });
  });

  return c.json({ id });
});

// Process status
app.get('/api/process/:id', (c: any) => {
  const id = c.req.param('id');
  const proc = processes.get(id);
  if (!proc) return c.notFound();
  return c.json({
    id: proc.id,
    status: proc.status,
    currentIndex: proc.currentIndex,
    total: proc.total,
    outputs: proc.outputs,
    logs: proc.logs,
  });
});

// SSE for live updates
app.get('/api/process/:id/stream', (c: any) => {
  const id = c.req.param('id');
  const proc = processes.get(id);
  if (!proc) return c.notFound();
  return streamSSE(c, async (stream: any) => {
    const send = (event: string, data: string) => stream.writeSSE({ event, data });
    const detach = attachSubscriber(id, send);

    // Send initial snapshot
    await stream.writeSSE({ event: 'message', data: JSON.stringify({ event: 'snapshot', data: proc }) });

    stream.onAbort(() => {
      detach();
    });
  });
});

const port = Number(process.env.PORT || 3000);
console.log(`Server listening on http://localhost:${port}`);
export default {
  port,
  fetch: app.fetch,
};
