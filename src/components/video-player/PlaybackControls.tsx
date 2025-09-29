import type { ReactNode } from 'react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  duration: number;
  children?: ReactNode;
}

export function PlaybackControls({
  isPlaying,
  onTogglePlay,
  currentTime,
  duration,
  children,
}: PlaybackControlsProps) {
  const formatTime = (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  return (
    <div className="glass-controls">
      <div className="left">
        <button
          id="btnPlay"
          className="icon-btn"
          onClick={onTogglePlay}
          data-tooltip="Play/Pause"
          aria-label="Play/Pause"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
      </div>

      <div className="center" style={{ flex: 1 }}>
        {children}
      </div>

      <div className="right">
        <span id="timeLabel" className="muted">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}