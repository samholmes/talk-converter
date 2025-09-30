export interface VideoInfo {
  name: string;
  url: string;
  title?: string;
  processId?: string;
  isProcessing?: boolean;
}

export interface ListResponse {
  liveStreams: VideoInfo[];
  talks: VideoInfo[];
}

export interface CurrentMedia {
  type: 'youtube' | 'talks' | null;
  filename: string | null;
  url: string | null;
  title?: string | null;
}

export interface Segment {
  start: number;
  end: number;
  title: string;
}

export interface ProcessInfo {
  id: string;
  title: string;
  status?: 'processing' | 'done' | 'failed';
}

export interface ProcessMessage {
  event: string;
  data: any;
}

export interface ProcessSnapshot {
  id: string;
  status: string;
  currentIndex: number;
  total: number;
  outputs: string[];
  logs: string[];
}

export interface ProcessProgress {
  currentIndex: number;
  total: number;
  segment: Segment;
}

export interface ProcessStatus {
  status: string;
  outputs?: string[];
}