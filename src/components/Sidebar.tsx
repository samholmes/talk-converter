import { VideoInfo, CurrentMedia } from '../types';

interface SidebarProps {
  liveStreams: VideoInfo[];
  talks: VideoInfo[];
  onSelectVideo: (type: 'youtube' | 'talks', video: VideoInfo) => void;
  selectedVideo: CurrentMedia | null;
  selectedProcess: string | null;
}

export function Sidebar({
  liveStreams,
  talks,
  onSelectVideo,
  selectedVideo,
  selectedProcess
}: SidebarProps) {
  return (
    <aside>
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
    </aside>
  );
}