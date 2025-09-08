export interface Segment { 
  start: number; 
  end: number; 
  title: string;
}

export interface Proc {
  id: string;
  sourceType: 'youtube' | 'talks';
  filename: string;
  sourcePath: string;
  segments: Segment[];
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  currentIndex: number;
  total: number;
  logs: string[];
  outputs: string[];
}