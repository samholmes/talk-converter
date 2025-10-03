import type { Activity } from './types';

// In-memory state shared across routes
export const activities = new Map<string, Activity>();
export const subscribers = new Map<string, Set<(event: string, data: string) => void>>();
export const eventBuffer = new Map<string, Array<{event: string, data: string, ts: number}>>();

// Backward compatibility alias
export const processes = activities;

// Broadcasting functions
export function broadcast(activityId: string, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  
  // Buffer the event
  if (!eventBuffer.has(activityId)) {
    eventBuffer.set(activityId, []);
  }
  const buffer = eventBuffer.get(activityId)!;
  buffer.push({ event: 'message', data: payload, ts: Date.now() });
  
  // Keep only last 100 events
  if (buffer.length > 100) {
    buffer.splice(0, buffer.length - 100);
  }
  
  // Send to all subscribers
  const subs = subscribers.get(activityId);
  if (!subs) return;
  
  for (const send of subs) {
    try {
      send('message', payload);
    } catch {
      // ignore
    }
  }
}

export function attachSubscriber(activityId: string, send: (event: string, data: string) => void) {
  let set = subscribers.get(activityId);
  if (!set) {
    set = new Set();
    subscribers.set(activityId, set);
  }
  set.add(send);
  return () => {
    set!.delete(send);
  };
}
