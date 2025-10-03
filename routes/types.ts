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

export type ActivityType = 'segment' | 'add-intro';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  currentIndex?: number;
  total?: number;
  logs: string[];
  outputs: string[];
  metadata?: {
    sourceType?: 'youtube' | 'talks';
    filename?: string;
    talkName?: string;
    segments?: Segment[];
    sourceVideoId?: string;
    sourcePath?: string;
    talkDir?: string;
    introPath?: string;
    videoPath?: string;
  };
}

// Backward compatibility alias for existing code
export type Proc = Activity;
