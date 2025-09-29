import { useState, useRef, type ReactNode } from 'react';
import type { TimelineOverlayProps } from './types';

interface TimelineScrubberProps {
  duration: number;
  currentTime: number;
  bufferedRanges?: TimeRanges;
  onSeek: (time: number) => void;
  onHover?: (time: number | null) => void;
  children?: (props: TimelineOverlayProps) => ReactNode;
  segmentDot?: ReactNode;
}

export function TimelineScrubber({
  duration,
  currentTime,
  onSeek,
  onHover,
  children,
  segmentDot,
}: TimelineScrubberProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const toPercent = (time: number): number => {
    if (duration === 0) return 0;
    return (time / duration) * 100;
  };

  const fromPercent = (percent: number): number => {
    return (percent / 100) * duration;
  };

  const formatTime = (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const time = fromPercent(percent);
    onSeek(time);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const time = fromPercent(percent);
    setHoverTime(time);
    setHoverX(x);
    onHover?.(time);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    onHover?.(null);
  };

  const progressPercent = toPercent(currentTime);

  return (
    <div
      ref={scrubberRef}
      id="scrubber"
      className="scrubber"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="buffer" style={{ width: '0%' }}></div>
      <div className="progress" style={{ width: `${progressPercent}%` }}></div>

      {children?.({ toPercent, fromPercent })}

      <div className="handle" style={{ left: `${progressPercent}%` }}>
        {segmentDot}
      </div>

      {hoverTime !== null && (
        <div
          id="hoverTip"
          className="hover-tip"
          style={{ left: `${hoverX}px` }}
        >
          {formatTime(hoverTime)}
        </div>
      )}
    </div>
  );
}