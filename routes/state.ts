import type { Proc } from './types';

// In-memory state shared across routes
export const processes = new Map<string, Proc>();
export const subscribers = new Map<string, Set<(event: string, data: string) => void>>();

// Broadcasting functions
export function broadcast(procId: string, event: string, data: unknown) {
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