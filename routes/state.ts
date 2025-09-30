import type { Proc } from './types';

// In-memory state shared across routes
export const processes = new Map<string, Proc>();
export const subscribers = new Map<string, Set<(event: string, data: string) => void>>();
export const eventBuffer = new Map<string, Array<{event: string, data: string, ts: number}>>();

// Broadcasting functions
export function broadcast(procId: string, event: string, data: unknown) {
  const payload = JSON.stringify({ event, data, ts: Date.now() });
  
  // Buffer the event
  if (!eventBuffer.has(procId)) {
    eventBuffer.set(procId, []);
  }
  const buffer = eventBuffer.get(procId)!;
  buffer.push({ event: 'message', data: payload, ts: Date.now() });
  
  // Keep only last 100 events
  if (buffer.length > 100) {
    buffer.splice(0, buffer.length - 100);
  }
  
  // Send to all subscribers
  const subs = subscribers.get(procId);
  if (!subs) return;
  
  for (const send of subs) {
    try {
      send('message', payload);
    } catch {
      // ignore
    }
  }
}

export function attachSubscriber(procId: string, send: (event: string, data: string) => void) {
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