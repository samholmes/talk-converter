export interface Segment {
  start: number;
  end: number;
  title: string;
}

export interface TalkEdit {
  filename: string;
  timestamp: number;
  description: string;
}

export interface TalkMetadata {
  title: string;
  createdAt: number;
  sourceVideo?: string;
  duration?: number;
  edits?: TalkEdit[];
}

export interface Proc {
  id: string;
  sourceType: 'youtube' | 'talks';
  filename: string;
  sourcePath: string;
  sourceVideoId?: string;
  segments: Segment[];
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  currentIndex: number;
  total: number;
  logs: string[];
  outputs: string[];
}
