import type { ListResponse } from './types';

const API_BASE = '/api';

export const api = {
  async list(): Promise<ListResponse> {
    const response = await fetch(`${API_BASE}/list`);
    if (!response.ok) throw new Error('Failed to fetch list');
    return response.json();
  },

  async startProcess(sourceType: 'youtube' | 'talks', filename: string, segments: Array<{ start: number; end: number; title: string }>) {
    const response = await fetch(`${API_BASE}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType, filename, segments })
    });
    if (!response.ok) throw new Error('Failed to start process');
    return response.json() as Promise<{ id: string }>;
  },

  async getProcess(id: string) {
    const response = await fetch(`${API_BASE}/process/${id}`);
    if (!response.ok) throw new Error('Failed to get process');
    return response.json();
  },

  streamProcess(id: string, onMessage: (msg: any) => void): EventSource {
    const eventSource = new EventSource(`${API_BASE}/process/${id}/stream`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };
    return eventSource;
  },

  async deleteTalk(filename: string) {
    const response = await fetch(`${API_BASE}/talks/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete talk');
    return response.json();
  }
};