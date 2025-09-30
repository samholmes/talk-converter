import { useState } from 'react';

interface SegmentPopoverProps {
  start: number;
  end: number;
  leftPercent: number;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export function SegmentPopover({
  start,
  end,
  leftPercent,
  onConfirm,
  onCancel,
}: SegmentPopoverProps) {
  const [title, setTitle] = useState('');

  const formatTime = (seconds: number): string => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  const handleConfirm = () => {
    if (!title.trim()) return;
    onConfirm(title);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="segment-popover"
      style={{
        left: `${leftPercent}%`,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="popover-content"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="muted" style={{ fontSize: '12px', marginBottom: '4px' }}>
          {formatTime(start)} - {formatTime(end)}
        </div>
        <input
          type="text"
          id="titleInputPrompt"
          autoComplete="off"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="popover-actions">
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleConfirm();
            }}
            aria-label="Confirm"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.4-1.4z" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            aria-label="Cancel"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M18.3 5.71L12 12.01 5.7 5.7 4.29 7.12l6.3 6.3-6.3 6.29 1.41 1.42 6.3-6.3 6.29 6.3 1.42-1.42-6.3-6.3 6.3-6.29z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
