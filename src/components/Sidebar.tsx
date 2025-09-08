import { VideoInfo, ProcessInfo, CurrentMedia } from '../types';

interface SidebarProps {
  liveStreams: VideoInfo[];
  talks: VideoInfo[];
  processes: ProcessInfo[];
  onSelectVideo: (type: 'youtube' | 'talks', video: VideoInfo) => void;
  onSelectProcess: (processId: string) => void;
  selectedVideo: CurrentMedia | null;
  selectedProcess: string | null;
}

export function Sidebar({
  liveStreams,
  talks,
  processes,
  onSelectVideo,
  onSelectProcess,
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
              {video.name}
            </li>
          ))}
        </ul>
      </div>
      
      <div className="section">
        <h2>Talks</h2>
        <ul id="talkList">
          {talks.map((video) => (
            <li
              key={video.name}
              className={selectedVideo?.filename === video.name ? 'selected' : ''}
              onClick={() => onSelectVideo('talks', video)}
            >
              {video.title || video.name}
            </li>
          ))}
        </ul>
      </div>
      
      <div className="section">
        <h2>Processing</h2>
        <ul id="procList">
          {processes.map((proc) => (
            <li
              key={proc.id}
              className={`${proc.status || 'processing'} ${selectedProcess === proc.id ? 'selected' : ''}`}
              onClick={() => onSelectProcess(proc.id)}
            >
              {proc.status === 'done' ? 'Done: ' : 
               proc.status === 'failed' ? 'Failed: ' : 
               'Processing '}{proc.title}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}