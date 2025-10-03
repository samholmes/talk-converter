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
  selectedVideo,
  selectedProcess,
  selectedActivity
}: SidebarProps) {
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
          <h2>Live Streams</h2>
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