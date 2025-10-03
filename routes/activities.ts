import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { activities, attachSubscriber, eventBuffer } from './state';

const activitiesRoutes = new Hono();

// List all activities
activitiesRoutes.get('/api/activities', (c) => {
  const activityList = Array.from(activities.values()).map(activity => ({
    id: activity.id,
    type: activity.type,
    title: activity.title,
    status: activity.status,
    startedAt: activity.startedAt,
    completedAt: activity.completedAt,
    currentIndex: activity.currentIndex,
    total: activity.total,
    outputs: activity.outputs,
  }));
  
  return c.json(activityList);
});

// Get specific activity
activitiesRoutes.get('/api/activities/:id', (c) => {
  const id = c.req.param('id');
  const activity = activities.get(id);
  
  if (!activity) return c.notFound();
  
  return c.json({
    id: activity.id,
    type: activity.type,
    title: activity.title,
    status: activity.status,
    currentIndex: activity.currentIndex,
    total: activity.total,
    outputs: activity.outputs,
    logs: activity.logs,
  });
});

// SSE stream for activity updates
activitiesRoutes.get('/api/activities/:id/stream', (c) => {
  const id = c.req.param('id');
  const activity = activities.get(id);
  
  if (!activity) return c.notFound();
  
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
      data: JSON.stringify({ event: 'snapshot', data: activity }) 
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

export default activitiesRoutes;
