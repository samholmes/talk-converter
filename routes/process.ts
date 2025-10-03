import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import fs from 'fs/promises';
import path from 'path';
import type { Segment, Proc } from './types';
import { ensureDirs, youtubeDir, talksDir } from './utils';
import { processes, broadcast, attachSubscriber, eventBuffer } from './state';
import { runActivity } from './processor';

const processRoutes = new Hono();

const safeStat = async (target: string) => fs.stat(target).catch(() => null);

interface StreamMetadata {
  title?: string;
  createdAt?: number;
  sourceVideo?: string;
  [key: string]: unknown;
}

const resolveTalkSource = async (filename: string) => {
  const normalized = filename.replace(/\.mp4$/i, '');
  const dirPath = path.join(talksDir, normalized);
  const dirStats = await safeStat(dirPath);

  if (dirStats?.isDirectory()) {
    const videoPath = path.join(dirPath, 'video.mp4');
    const videoStats = await safeStat(videoPath);
    if (videoStats) {
      return videoPath;
    }
    return null;
  }

  const legacyName = filename.endsWith('.mp4') ? filename : `${normalized}.mp4`;
  const legacyPath = path.join(talksDir, legacyName);
  const legacyStats = await safeStat(legacyPath);
  if (legacyStats) {
    return legacyPath;
  }

  return null;
};

const resolveYoutubeSource = async (filename: string) => {
  const normalized = filename.replace(/\.mp4$/i, '');
  const dirPath = path.join(youtubeDir, normalized);
  const metadataPath = path.join(dirPath, 'metadata.json');
  let metadata: StreamMetadata | null = null;

  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(raw) as StreamMetadata;
  } catch {
    metadata = null;
  }

  const candidates = [
    path.join(dirPath, 'video.mp4'),
    path.join(dirPath, 'video.fs.mp4'),
    path.join(youtubeDir, `${normalized}.mp4`),
    path.join(youtubeDir, filename.endsWith('.mp4') ? filename : `${filename}.mp4`),
  ];

  let sourceVideoId: string | undefined = typeof metadata?.sourceVideo === 'string'
    ? metadata!.sourceVideo!
    : undefined;

  if (!sourceVideoId) {
    const maybeId = path.extname(filename).toLowerCase() === '.mp4'
      ? path.parse(filename).name
      : filename;
    if (/^[A-Za-z0-9_-]{6,}$/.test(maybeId)) {
      sourceVideoId = maybeId;
    }
  }

  for (const candidate of candidates) {
    const stats = await safeStat(candidate);
    if (stats?.isFile()) {
      return { sourcePath: candidate, sourceVideoId };
    }
  }

  const fallbackPath = sourceVideoId ? path.join(youtubeDir, `${sourceVideoId}.mp4`) : null;
  return { sourcePath: fallbackPath, sourceVideoId };
};

// Start a segmentation process
processRoutes.post('/api/process', async (c) => {
  await ensureDirs();
  
  const body = (await c.req.json().catch(() => null)) as
    | { sourceType: 'youtube' | 'talks'; filename: string; segments: Segment[] }
    | null;
    
  if (!body || !body.sourceType || !body.filename || !Array.isArray(body.segments)) {
    return c.text('Invalid payload', 400);
  }

  const { sourceType } = body;
  const filename = body.filename;

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return c.text('Invalid filename', 400);
  }

  let sourcePath: string | null = null;
  let sourceVideoId: string | undefined;

  if (sourceType === 'talks') {
    sourcePath = await resolveTalkSource(filename);
    if (!sourcePath) {
      console.warn('Talk source video not found', { filename });
      return c.json({ success: false, error: 'Talk video not found' }, 404);
    }
  } else {
    const resolved = await resolveYoutubeSource(filename);
    sourcePath = resolved.sourcePath;
    sourceVideoId = resolved.sourceVideoId;

    if (!sourcePath && !sourceVideoId) {
      console.warn('YouTube source could not be resolved', { filename });
      return c.json({ success: false, error: 'Stream video not found' }, 404);
    }
  }

  if (!sourcePath) {
    if (sourceType === 'youtube' && sourceVideoId) {
      sourcePath = path.join(youtubeDir, `${sourceVideoId}.mp4`);
    } else {
      console.warn('Source path resolution failed', { filename, sourceType });
      return c.json({ success: false, error: 'Source video not accessible' }, 500);
    }
  }

  const id = crypto.randomUUID();

  const activity: Proc = {
    id,
    type: 'segment',
    title: `Segment ${body.segments.length} clip${body.segments.length > 1 ? 's' : ''}`,
    status: 'running',
    startedAt: Date.now(),
    currentIndex: 0,
    total: body.segments.length,
    logs: [],
    outputs: [],
    metadata: {
      sourceType,
      filename,
      sourcePath,
      sourceVideoId,
      segments: body.segments,
    }
  };

  // Fire & forget
  runActivity(activity).catch((err: Error) => {
    activity.logs.push(String(err?.stack || err));
    activity.status = 'failed';
    broadcast(activity.id, 'status', { status: activity.status });
  });

  return c.json({ id });
});

// Process status
processRoutes.get('/api/process/:id', (c) => {
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
processRoutes.get('/api/process/:id/stream', (c) => {
  const id = c.req.param('id');
  const proc = processes.get(id);
  
  if (!proc) return c.notFound();
  
  // Set headers for SSE
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('Content-Type', 'text/event-stream');
  
  return streamSSE(c, async (stream) => {
    // Send SSE events as default 'message' events
    const send = (_event: string, data: string) => {
      stream.writeSSE({ data });
    };
    const detach = attachSubscriber(id, send);

    // Send initial snapshot
    await stream.writeSSE({ 
      data: JSON.stringify({ event: 'snapshot', data: proc }) 
    });
    
    // Send any buffered events
    const buffer = eventBuffer.get(id);
    if (buffer) {
      for (const evt of buffer) {
        try {
          await stream.writeSSE({ event: evt.event, data: evt.data });
        } catch {
          // Stream might be closed
          break;
        }
      }
    }

    // Keep connection alive with periodic heartbeats
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ event: 'heartbeat', ts: Date.now() }) });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000); // Every 30 seconds

    stream.onAbort(() => {
      clearInterval(heartbeat);
      detach();
    });
  });
});

export default processRoutes;