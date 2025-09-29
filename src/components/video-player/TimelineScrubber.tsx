import { useState, useRef, useEffect, type ReactNode } from 'react';
import type { TimelineOverlayProps } from './types';

interface TimelineScrubberProps {
  duration: number;
  currentTime: number;
  bufferedRanges?: TimeRanges;
  onSeek: (time: number) => void;
  onHover?: (time: number | null) => void;
  children?: (props: TimelineOverlayProps) => ReactNode;
  segmentDot?: ReactNode;
  minTime?: number;
}

export function TimelineScrubber({
  duration,
  currentTime,
  onSeek,
  onHover,
  children,
  segmentDot,
  minTime = 0,
}: TimelineScrubberProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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

  const calculateTimeFromX = (clientX: number): number => {
    if (!scrubberRef.current) return currentTime;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    return Math.max(minTime, fromPercent(percent));
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const time = calculateTimeFromX(e.clientX);
    onSeek(time);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    const time = calculateTimeFromX(e.clientX);
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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const time = calculateTimeFromX(e.clientX);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onSeek, minTime, currentTime, duration]);

  const progressPercent = toPercent(currentTime);

  return (
    <div
      ref={scrubberRef}
      id="scrubber"
      className="scrubber"
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
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