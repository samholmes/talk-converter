import { useRef, useState } from 'react';
import { VideoInfo, CurrentMedia } from '../types';

interface Activity {
  id: string;
  type: 'segment' | 'add-intro';
  title: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  currentIndex?: number;
  total?: number;
}

interface SidebarProps {
  liveStreams: VideoInfo[];
  talks: VideoInfo[];
  activities: Activity[];
  onSelectVideo: (type: 'youtube' | 'talks', video: VideoInfo) => void;
  onSelectActivity: (activityId: string) => void;
  onAddStream: (file: File, title: string) => Promise<void>;
  selectedVideo: CurrentMedia | null;
  selectedProcess: string | null;
  selectedActivity: string | null;
}

export function Sidebar({
  liveStreams,
  talks,
  activities,
  onSelectVideo,
  onSelectActivity,
  onAddStream,
  selectedVideo,
  selectedProcess,
  selectedActivity
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setTitleInput(file.name.replace(/\.mp4$/i, '').replace(/[_-]/g, ' '));
    e.target.value = '';
  };

  const handleUploadConfirm = async () => {
    if (!pendingFile || !titleInput.trim()) return;
    setUploading(true);
    try {
      await onAddStream(pendingFile, titleInput.trim());
    } finally {
      setPendingFile(null);
      setTitleInput('');
      setUploading(false);
    }
  };

  const handleUploadCancel = () => {
    setPendingFile(null);
    setTitleInput('');
  };

  const getActivityIcon = (type: 'segment' | 'add-intro') => {
    return type === 'segment' ? '✂️' : '🎬';
  };

  const getStatusIcon = (status: 'running' | 'completed' | 'failed') => {
    if (status === 'running') return '⟳';
    if (status === 'completed') return '✓';
    return '✗';
  };

  return (
    <aside>
      <div className="sidebar-main">
        <div className="section">
          <div className="section-header">
            <h2>Live Streams</h2>
            <button
              className="add-btn icon-btn"
              onClick={() => fileInputRef.current?.click()}
              data-tooltip="Add stream"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,.mp4"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {pendingFile && (
            <div className="upload-prompt">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Stream title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUploadConfirm();
                  if (e.key === 'Escape') handleUploadCancel();
                }}
                disabled={uploading}
              />
              <div className="upload-prompt-actions">
                <button onClick={handleUploadConfirm} disabled={uploading || !titleInput.trim()}>
                  {uploading ? 'Uploading...' : 'Add'}
                </button>
                <button className="cancel-btn" onClick={handleUploadCancel} disabled={uploading}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <ul id="liveList">
            {liveStreams.map((video) => (
              <li
                key={video.name}
                className={selectedVideo?.filename === video.name ? 'selected' : ''}
                onClick={() => onSelectVideo('youtube', video)}
              >
                {video.title || video.name}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="section">
          <h2>Talks</h2>
          <ul id="talkList">
            {talks.map((video) => {
              const isSelected = video.isProcessing 
                ? selectedProcess === video.processId 
                : selectedVideo?.filename === video.name;
              const isProcessing = video.isProcessing;
              
              return (
                <li
                  key={video.name}
                  className={`${isSelected ? 'selected' : ''} ${isProcessing ? 'processing' : ''}`}
                  onClick={() => onSelectVideo('talks', video)}
                >
                  {video.title || video.name}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {activities.length > 0 && (
        <div className="activities-section">
          <h2>Activities</h2>
          <ul id="activitiesList">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className={`activity-item ${selectedActivity === activity.id ? 'selected' : ''} ${activity.status}`}
                onClick={() => onSelectActivity(activity.id)}
              >
                <div className="activity-header">
                  <span className="activity-icon">{getActivityIcon(activity.type)}</span>
                  <span className="activity-title">{activity.title}</span>
                  <span className={`activity-status ${activity.status}`}>
                    {getStatusIcon(activity.status)}
                  </span>
                </div>
                {activity.total && (
                  <div className="activity-progress">
                    <span className="muted">{activity.currentIndex}/{activity.total}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}