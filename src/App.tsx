import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayerShell } from './components/video-player/VideoPlayerShell';
import { ActivityLogs } from './components/ActivityLogs';
import { EmptyState } from './components/EmptyState';
import type { VideoInfo, CurrentMedia } from './types';
import { api } from './api';

type AppMode = 'none' | 'video' | 'activity';

interface Activity {
  id: string;
  type: 'segment' | 'add-intro';
  title: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  currentIndex?: number;
  total?: number;
  outputs?: string[];
}

export function App() {
  const [mode, setMode] = useState<AppMode>('none');
  const [liveStreams, setLiveStreams] = useState<VideoInfo[]>([]);
  const [talks, setTalks] = useState<VideoInfo[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [current, setCurrent] = useState<CurrentMedia>({
    type: null,
    filename: null,
    url: null,
    title: null
  });
  const [currentActivity, setCurrentActivity] = useState<string | null>(null);

  const refreshLists = async () => {
    try {
      const data = await api.list();
      setLiveStreams(data.liveStreams);
      setTalks(data.talks);
    } catch (error) {
      console.error('Failed to refresh lists:', error);
    }
  };

  const refreshActivities = async () => {
    try {
      const data = await api.getActivities();
      setActivities(data);
    } catch (error) {
      console.error('Failed to refresh activities:', error);
    }
  };

  useEffect(() => {
    refreshLists();
    refreshActivities();
    
    const interval = setInterval(refreshActivities, 2000);
    return () => clearInterval(interval);
  }, []);

  const selectVideo = (type: 'youtube' | 'talks', video: VideoInfo) => {
    if (video.isProcessing && video.processId) {
      setCurrentActivity(video.processId);
      setMode('activity');
      setCurrent({ type: null, filename: null, url: null, title: null });
    } else {
      setCurrent({
        type,
        filename: video.name,
        url: video.url,
        title: video.title
      });
      setMode('video');
      setCurrentActivity(null);
    }
  };

  const selectActivity = (activityId: string) => {
    setCurrentActivity(activityId);
    setMode('activity');
    setCurrent({ type: null, filename: null, url: null, title: null });
  };



  const handleActivityStart = (activityId: string) => {
    refreshActivities();
    selectActivity(activityId);
  };

  const handleActivityComplete = async (_activityId: string, _outputs: string[], status: 'completed' | 'failed') => {
    await refreshActivities();
    
    if (status === 'failed') {
      return;
    }
    
    await refreshLists();
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      await api.deleteTalk(filename);
      await refreshLists();
      if (current.filename === filename) {
        setMode('none');
        setCurrent({ type: null, filename: null, url: null, title: null });
      }
    } catch (error) {
      console.error('Failed to delete talk:', error);
      alert('Failed to delete talk');
    }
  };

  const handleRename = async (type: 'youtube' | 'talks', filename: string, newName: string) => {
    try {
      if (type === 'talks') {
        await api.renameTalk(filename, newName);
      } else {
        await api.renameStream(filename, newName);
      }
      
      // Refresh lists after rename
      const data = await api.list();
      setLiveStreams(data.liveStreams);
      setTalks(data.talks);
      
      // Update current media if it was renamed
      if (current.filename === filename) {
        const sanitizedName = newName.replace(/[^a-zA-Z0-9]/g, '_');
        const videos = type === 'talks' ? data.talks : data.liveStreams;
        const newVideo = videos.find(v => v.name === sanitizedName);
          
        if (newVideo) {
          setCurrent({
            type,
            filename: newVideo.name,
            url: newVideo.url,
            title: newVideo.title
          });
        }
      }
    } catch (error) {
      console.error(`Failed to rename ${type === 'talks' ? 'talk' : 'stream'}:`, error);
      alert(`Failed to rename ${type === 'talks' ? 'talk' : 'stream'}`);
    }
  };

  return (
    <div className="app">
      <Sidebar
        liveStreams={liveStreams}
        talks={talks}
        activities={activities}
        onSelectVideo={selectVideo}
        onSelectActivity={selectActivity}
        selectedVideo={mode === 'video' ? current : null}
        selectedProcess={null}
        selectedActivity={mode === 'activity' ? currentActivity : null}
      />
      <main>
        {mode === 'video' && current.url && current.type && current.filename && (
          <VideoPlayerShell
            source={{
              type: current.type,
              filename: current.filename,
              url: current.url,
              label: current.title || current.filename,
            }}
            onProcessStart={handleActivityStart}
            onDelete={current.type === 'talks' ? () => handleDelete(current.filename!) : undefined}
            onRename={(newName) => handleRename(current.type!, current.filename!, newName)}
          />
        )}
        {mode === 'activity' && currentActivity && (
          <ActivityLogs
            activityId={currentActivity}
            onComplete={(outputs: string[], status: 'completed' | 'failed') => handleActivityComplete(currentActivity, outputs, status)}
          />
        )}
        {mode === 'none' && <EmptyState />}
      </main>
    </div>
  );
}