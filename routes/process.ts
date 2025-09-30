import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import path from 'path';
import type { Segment, Proc } from './types';
import { ensureDirs, youtubeDir, talksDir } from './utils';
import { processes, broadcast, attachSubscriber, eventBuffer } from './state';
import { runProcess } from './processor';

const processRoutes = new Hono();

// Start a segmentation process
processRoutes.post('/api/process', async (c) => {
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