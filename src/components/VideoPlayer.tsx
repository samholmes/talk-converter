import { useState, useRef, useEffect } from 'react';
import type { CurrentMedia, Segment } from '../types';
import { api } from '../api';

interface VideoPlayerProps {
  current: CurrentMedia;
  onProcessStart: (processId: string, title?: string) => void;
  onDelete?: () => void;
}

export function VideoPlayer({ current, onProcessStart, onDelete }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentActive, setSegmentActive] = useState(false);
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentTitle, setSegmentTitle] = useState('');
  const [showTitlePopover, setShowTitlePopover] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  useEffect(() => {
    if (videoRef.current && current.url) {
      videoRef.current.src = current.url;
      setSegmentActive(false);
      setSegmentStart(0);
      setSegmentTitle('');
      setShowTitlePopover(false);
    }
  }, [current.url]);

  const formatTime = (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSegmentToggle = () => {
    if (!segmentActive) {
      setSegmentStart(currentTime);
      setShowTitlePopover(true);
    } else {
      const end = Math.floor(currentTime);
      if (end <= Math.floor(segmentStart)) return;
      submitSegment({ start: Math.floor(segmentStart), end, title: segmentTitle });
    }
  };

  const handleTitleConfirm = () => {
    if (!segmentTitle.trim()) return;
    setSegmentActive(true);
    setShowTitlePopover(false);
  };

  const handleTitleCancel = () => {
    setShowTitlePopover(false);
    setSegmentTitle('');
    setSegmentStart(0);
  };

  const submitSegment = async (segment: Segment) => {
    try {
      const { id: processId } = await api.startProcess(current.type!, current.filename!, [segment]);
      onProcessStart(processId, segmentTitle);
      
      // Reset segment state
      setSegmentActive(false);
      setSegmentStart(0);
      setSegmentTitle('');
    } catch (error) {
      console.error('Failed to submit segment:', error);
      alert('Failed to start processing');
    }
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleScrubberHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    setHoverTime(time);
    setHoverX(x);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const segmentLeft = duration > 0 ? (segmentStart / duration) * 100 : 0;
  const segmentWidth = segmentActive && duration > 0 
    ? ((currentTime - segmentStart) / duration) * 100 
    : 0;

  return (
    <div id="videoUI">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <strong id="currentLabel">
            {current.type === 'youtube' ? 'Live Stream' : 'Talk'}: {current.filename}
          </strong>
        </div>
        <span id="status" className="muted"></span>
      </div>
      
      <div className="player">
        <video
          ref={videoRef}
          id="player"
          controls={false}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        
        <div className="glass-controls">
          <div className="left">
            <button 
              id="btnPlay"
              className="icon-btn"
              onClick={handlePlayPause}
              data-tooltip="Play/Pause"
              aria-label="Play/Pause"
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M8 5v14l11-7L8 5z"/>
                </svg>
              )}
            </button>
          </div>
          
          <div className="center">
            <div 
              id="scrubber" 
              className="scrubber"
              onClick={handleScrubberClick}
              onMouseMove={handleScrubberHover}
              onMouseLeave={() => setHoverTime(null)}
            >
              <div className="buffer" style={{ width: '0%' }}></div>
              <div className="progress" style={{ width: `${progressPercent}%` }}></div>
              <div 
                id="segHighlight" 
                className="seg"
                style={{ 
                  left: `${segmentLeft}%`, 
                  width: `${segmentWidth}%`,
                  display: segmentActive || segmentStart > 0 ? 'block' : 'none'
                }}
              ></div>
              <div className="handle" style={{ left: `${progressPercent}%` }}></div>
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
          </div>
          
          <div className="right">
            <span id="timeLabel" className="muted">{formatTime(currentTime)} / {formatTime(duration)}</span>
            
            <div className="seg-controls">
              <button 
                id="btnSegment"
                className="icon-btn"
                onClick={handleSegmentToggle}
                data-tooltip={segmentActive ? 'End segment' : 'Mark segment start'}
                aria-label={segmentActive ? 'End segment' : 'Mark segment start'}
              >
                {segmentActive ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M4 3h2v18H4V3zm3 0h9l-1.5 3L18 9h-9l1.5-3L7 3z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 21 20" width="20" height="20" fill="currentColor" stroke="currentColor">
                    <path d="M12 2a1 1 0 0 1 1 1v5.586l1.293-1.293a1 1 0 0 1 1.414 1.414l-3.707 3.707a1 1 0 0 1-1.414 0L6.879 8.707A1 1 0 1 1 8.293 7.293L9.586 8.586V3a1 1 0 0 1 1-1h1.414Z"/>
                  </svg>
                )}
              </button>

              <div 
                id="titlePopover"
                className={`popover ${showTitlePopover ? '' : 'hidden'}`}
              >
                <div className="popover-content">
                  <input
                    type="text"
                    id="titleInputPrompt"
                    placeholder="Title"
                    value={segmentTitle}
                    onChange={(e) => setSegmentTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTitleConfirm();
                      if (e.key === 'Escape') handleTitleCancel();
                    }}
                    autoFocus
                  />
                  <div className="popover-actions">
                    <button id="confirmTitle" className="icon-btn" onClick={handleTitleConfirm} data-tooltip="Confirm" aria-label="Confirm">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor">
                        <path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.4-1.4z"/>
                      </svg>
                    </button>
                    <button id="cancelTitle" className="icon-btn" onClick={handleTitleCancel} data-tooltip="Cancel" aria-label="Cancel">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor">
                        <path d="M18.3 5.71L12 12.01 5.7 5.7 4.29 7.12l6.3 6.3-6.3 6.29 1.41 1.42 6.3-6.3 6.29 6.3 1.42-1.42-6.3-6.3 6.3-6.29z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      
      {current.type === 'talks' && onDelete && (
        <div id="videoActions" className="video-actions">
          <button 
            id="deleteVideoBtn" 
            className="button-secondary delete-video-btn"
            onClick={onDelete}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Delete Talk
          </button>
        </div>
      )}
    </div>
  );
}