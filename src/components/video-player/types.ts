export interface SegmentDraft {
  start: number;
  end: number;
  title: string;
}

export interface VideoSource {
  type: 'youtube' | 'talks';
  filename: string;
  url: string;
  label: string;
}

export type SegmentMode = 'idle' | 'marking' | 'complete';

export interface SegmentState {
  mode: SegmentMode;
  start?: number;
  end?: number;
  title: string;
}

export interface TimelineOverlayProps {
  toPercent: (time: number) => number;
  fromPercent: (percent: number) => number;
}