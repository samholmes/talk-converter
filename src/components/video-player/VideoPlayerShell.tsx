import { useState, useRef, useEffect } from 'react';
import type { VideoSource, SegmentDraft } from './types';
import type { TalkMetadata } from '../../types';
import { PlaybackControls } from './PlaybackControls';
import { TimelineScrubber } from './TimelineScrubber';
import { SegmentPopover } from './SegmentPopover';
import { useProcessLauncher } from './ProcessLauncher';
import { api } from '../../api';

interface VideoPlayerShellProps {
  source: VideoSource;
  onProcessStart: (processId: string, title: string) => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
}

export function VideoPlayerShell({
  source,
  onProcessStart,
  onDelete,
  onRename,
}: VideoPlayerShellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentState, setSegmentState] = useState<{ mode: 'idle' | 'marking' | 'complete'; start?: number; end?: number }>({ mode: 'idle' });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [metadata, setMetadata] = useState<TalkMetadata | null>(null);
  const [selectedEdit, setSelectedEdit] = useState<string | null>(null);
  const [isAddingIntro, setIsAddingIntro] = useState(false);
  const [showControls, setShowControls] = useState(true);

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

  useEffect(() => {
    if (source.type === 'talks') {
      api.getTalkMetadata(source.filename).then((data) => {
        setMetadata(data);
      }).catch((err) => {
        console.error('Failed to load metadata:', err);
      });
    }
  }, [source.type, source.filename]);

  const handleAddIntro = async () => {
    if (source.type !== 'talks') return;

    setIsAddingIntro(true);
    try {
      const result = await api.addIntroToTalk(source.filename);
      if (result.id) {
        onProcessStart(result.id, `Add intro to ${source.label}`);
      }
    } catch (error) {
      console.error('Failed to add intro:', error);
      alert('Failed to add intro');
    } finally {
      setIsAddingIntro(false);
    }
  };

  const handleSelectEdit = (filename: string | null) => {
    setSelectedEdit(filename);
    if (videoRef.current) {
      const baseUrl = `/media/talks/${encodeURIComponent(source.filename)}`;
      const newUrl = filename ? `${baseUrl}/${filename}` : `${baseUrl}/video.mp4`;
      videoRef.current.src = newUrl;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  const formatEditDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleDeleteEdit = async (filename: string) => {
    if (!confirm('Are you sure you want to delete this version?')) {
      return;
    }

    if (source.type !== 'talks') return;

    try {
      await api.deleteTalkEdit(source.filename, filename);
      const updatedMetadata = await api.getTalkMetadata(source.filename);
      setMetadata(updatedMetadata);

      if (selectedEdit === filename) {
        setSelectedEdit(null);
        handleSelectEdit(null);
      }
    } catch (error) {
      console.error('Failed to delete edit:', error);
      alert('Failed to delete version');
    }
  };

  const getTalkVersionUrl = (filename: string | null) => {
    const baseUrl = `/media/talks/${encodeURIComponent(source.filename)}`;
    return filename ? `${baseUrl}/${encodeURIComponent(filename)}` : `${baseUrl}/video.mp4`;
  };

  const getTalkVersionDownloadName = () => {
    const talkName = source.label.replace(/\.[^/.]+$/, '');
    return `${talkName}.mp4`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;

      // Only handle arrow keys if no input is focused
      const isInputFocused = document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA';
      if (isInputFocused) return;

      const minTime = segmentState.mode === 'marking' ? segmentState.start || 0 : 0;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          const prevTime = Math.max(minTime, videoRef.current.currentTime - 1);
          videoRef.current.currentTime = prevTime;
          setCurrentTime(prevTime);
          break;
        case 'ArrowRight':
          e.preventDefault();
          const nextTime = Math.min(duration, videoRef.current.currentTime + 1);
          videoRef.current.currentTime = nextTime;
          setCurrentTime(nextTime);
          break;
        case ' ':
        case 'Space':
        case 'Spacebar':
          e.preventDefault();
          if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
          } else {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [duration, segmentState]);

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
      } else {
        // Cancel segment if end position is same as start
        setSegmentState({ mode: 'idle' });
      }
    }
  };

  // Render the segment handle
  const renderSegmentHandle = () => {
    const hasSegment = segmentState.start !== undefined;
    const isActive = segmentState.mode === 'marking';
    const shouldShow = isActive || !hasSegment;

    if (!shouldShow) return null;

    return (
      <div
        className={`segment-handle ${!isActive && !hasSegment ? 'inactive' : ''} ${isActive ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          handleToggleSegment();
        }}
      />
    );
  };

  const handleRename = () => {
    const currentTitle = source.label.replace('.mp4', '');
    setRenameValue(currentTitle);
    setIsRenaming(true);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && onRename) {
      onRename(renameValue.trim());
      setIsRenaming(false);
    }
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setRenameValue('');
  };

  return (
    <div id="videoUI">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {isRenaming ? (
          <div className="row" style={{ gap: '8px' }}>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') handleRenameCancel();
              }}
              autoFocus
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            />
            <button
              onClick={handleRenameSubmit}
              className="button"
              style={{ padding: '4px 12px', fontSize: '14px' }}
            >
              Save
            </button>
            <button
              onClick={handleRenameCancel}
              className="button-secondary"
              style={{ padding: '4px 12px', fontSize: '14px' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <strong id="currentLabel">
              {source.label}
            </strong>
            <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
              {onRename && (
                <button
                  onClick={handleRename}
                  className="edit-btn"
                  title="Rename"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>
              )}
              {source.type === 'talks' && onDelete && (
                <button
                  id="deleteVideoBtn"
                  className="delete-video-btn"
                  onClick={onDelete}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                  <span>Delete</span>
                </button>
              )}
              <span id="status" className="muted"></span>
            </div>
          </>
        )}
      </div>

      <div 
        className="player"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
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
          visible={showControls}
        >
          <TimelineScrubber
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            segmentDot={renderSegmentHandle()}
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

      {source.type === 'talks' && (
        <>
          <div className="tools-pane" style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Tools</h3>
            <button
              onClick={handleAddIntro}
              disabled={isAddingIntro}
              className="button"
              style={{ padding: '6px 12px', fontSize: '14px' }}
            >
              {isAddingIntro ? 'Adding Intro...' : 'Add Intro'}
            </button>
          </div>

          {metadata && (
            <div className="edits-list" style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Versions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'stretch'
                  }}
                >
                  <button
                    onClick={() => handleSelectEdit(null)}
                    className={selectedEdit === null ? 'edit-item selected' : 'edit-item'}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: selectedEdit === null ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      color: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ fontWeight: '500' }}>Original</div>
                    <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
                      {formatEditDate(metadata.createdAt)}
                    </div>
                  </button>
                    <a
                      href={getTalkVersionUrl(null)}
                      download={getTalkVersionDownloadName()}
                    className="button-secondary"
                    title="Download original"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z" />
                    </svg>
                  </a>
                </div>

                {metadata.edits?.map((edit) => (
                  <div
                    key={edit.filename}
                    style={{
                      display: 'flex',
                      gap: '4px',
                      alignItems: 'stretch'
                    }}
                  >
                    <button
                      onClick={() => handleSelectEdit(edit.filename)}
                      className={selectedEdit === edit.filename ? 'edit-item selected' : 'edit-item'}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: selectedEdit === edit.filename ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        color: '#fff',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      <div style={{ fontWeight: '500' }}>{edit.description}</div>
                      <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
                        {formatEditDate(edit.timestamp)}
                      </div>
                    </button>
                    <a
                      href={getTalkVersionUrl(edit.filename)}
                      download={getTalkVersionDownloadName()}
                      className="button-secondary"
                      title="Download this version"
                      style={{
                        padding: '8px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z" />
                      </svg>
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEdit(edit.filename);
                      }}
                      className="delete-btn"
                      title="Delete this version"
                      style={{
                        padding: '8px',
                        background: 'rgba(255,0,0,0.1)',
                        border: '1px solid rgba(255,0,0,0.3)',
                        borderRadius: '4px',
                        color: '#ff6b6b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
