import { useState, useRef, useEffect } from 'react';
import type { VideoSource, SegmentDraft } from './types';
import { PlaybackControls } from './PlaybackControls';
import { TimelineScrubber } from './TimelineScrubber';
import { SegmentPopover } from './SegmentPopover';
import { useProcessLauncher } from './ProcessLauncher';

interface VideoPlayerShellProps {
  source: VideoSource;
  onProcessStart: (processId: string, title: string) => void;
  onDelete?: () => void;
}

export function VideoPlayerShell({
  source,
  onProcessStart,
  onDelete,
}: VideoPlayerShellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentState, setSegmentState] = useState<{ mode: 'idle' | 'marking' | 'complete'; start?: number; end?: number }>({ mode: 'idle' });

  const { launch } = useProcessLauncher({
    sourceType: source.type,
    filename: source.filename,
    onStarted: onProcessStart,
  });

  useEffect(() => {
    if (videoRef.current && source.url) {
      videoRef.current.src = source.url;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setSegmentState({ mode: 'idle' });
    }
  }, [source.url]);

  const handleTogglePlay = () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleSubmitSegment = async (segment: SegmentDraft): Promise<void> => {
    await launch(segment);
    setSegmentState({ mode: 'idle' });
  };

  const handleToggleSegment = () => {
    if (segmentState.mode === 'idle') {
      setSegmentState({ mode: 'marking', start: currentTime });
    } else if (segmentState.mode === 'marking' && segmentState.start !== undefined) {
      const end = currentTime;
      if (end > segmentState.start) {
        setSegmentState({ ...segmentState, mode: 'complete', end });
      }
    }
  };

  // Render the segment dot for the handle
  const renderSegmentDot = () => {
    const hasSegment = segmentState.start !== undefined;
    const isActive = segmentState.mode === 'marking';
    const shouldShow = isActive || !hasSegment;

    if (!shouldShow) return null;

    return (
      <div
        className={`segment-dot ${!isActive && !hasSegment ? 'inactive' : ''} ${isActive ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleSegment();
        }}
      />
    );
  };

  return (
    <div id="videoUI">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <strong id="currentLabel">
            {source.type === 'youtube' ? 'Live Stream' : 'Talk'}: {source.label}
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

        <PlaybackControls
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          currentTime={currentTime}
          duration={duration}
        >
          <TimelineScrubber
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            segmentDot={renderSegmentDot()}
            minTime={segmentState.mode === 'marking' ? segmentState.start : undefined}
          >
            {(props) => (
              <>
                {/* Render the segment overlay */}
                {(segmentState.start !== undefined && (segmentState.mode === 'marking' || segmentState.end !== undefined)) && (
                  <div
                    id="segHighlight"
                    className="seg"
                    style={{
                      left: `${props.toPercent(segmentState.start)}%`,
                      width: `${segmentState.end ? props.toPercent(segmentState.end) - props.toPercent(segmentState.start) : props.toPercent(currentTime) - props.toPercent(segmentState.start)}%`,
                      display: 'block',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                )}
                
                {/* Render the title popover */}
                {segmentState.mode === 'complete' && segmentState.start !== undefined && segmentState.end !== undefined && (
                  <SegmentPopover
                    start={segmentState.start}
                    end={segmentState.end}
                    leftPercent={props.toPercent(segmentState.start) + (props.toPercent(segmentState.end) - props.toPercent(segmentState.start)) / 2}
                    onConfirm={async (title: string) => {
                      await handleSubmitSegment({
                        start: Math.floor(segmentState.start!),
                        end: Math.floor(segmentState.end!),
                        title,
                      });
                    }}
                    onCancel={() => setSegmentState({ mode: 'idle' })}
                  />
                )}
              </>
            )}
          </TimelineScrubber>
        </PlaybackControls>
      </div>

      {source.type === 'talks' && onDelete && (
        <div id="videoActions" className="video-actions">
          <button
            id="deleteVideoBtn"
            className="button-secondary delete-video-btn"
            onClick={onDelete}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete Talk
          </button>
        </div>
      )}
    </div>
  );
}