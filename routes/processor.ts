import path from 'path';
import type { Proc } from './types';
import { processes, broadcast } from './state';
import { rootDir, talksDir, sanitize } from './utils';

export async function runProcess(proc: Proc) {
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