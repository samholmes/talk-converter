import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayerShell } from './components/video-player/VideoPlayerShell';
import { ProcessLogs } from './components/ProcessLogs';
import { EmptyState } from './components/EmptyState';
import type { VideoInfo, CurrentMedia } from './types';
import { api } from './api';

type AppMode = 'none' | 'video' | 'process';

export function App() {
  const [mode, setMode] = useState<AppMode>('none');
  const [liveStreams, setLiveStreams] = useState<VideoInfo[]>([]);
  const [talks, setTalks] = useState<VideoInfo[]>([]);
  const [current, setCurrent] = useState<CurrentMedia>({
    type: null,
    filename: null,
    url: null,
    title: null
  });
  const [currentProcess, setCurrentProcess] = useState<string | null>(null);

  // Refresh lists on mount and after processing
  const refreshLists = async () => {
    try {
      const data = await api.list();
      setLiveStreams(data.liveStreams);
      setTalks(data.talks);
      
      // TODO: Load active processes from server if needed
    } catch (error) {
      console.error('Failed to refresh lists:', error);
    }
  };

  useEffect(() => {
    refreshLists();
  }, []);

  const selectVideo = (type: 'youtube' | 'talks', video: VideoInfo) => {
    if (video.isProcessing && video.processId) {
      // If it's a processing video, show the process view
      setCurrentProcess(video.processId);
      setMode('process');
      setCurrent({ type: null, filename: null, url: null, title: null });
    } else {
      // Normal video selection
      setCurrent({
        type,
        filename: video.name,
        url: video.url,
        title: video.title
      });
      setMode('video');
      setCurrentProcess(null);
    }
  };



  const handleProcessStart = (processId: string, title?: string) => {
    // Add a temporary processing talk to the talks list
    const processingTalk: VideoInfo = {
      name: processId,
      url: '',
      title: title || 'Processing...',
      processId: processId,
      isProcessing: true
    };
    
    setTalks(prev => [...prev, processingTalk]);
    
    // Select the processing talk
    selectVideo('talks', processingTalk);
  };

  const handleProcessComplete = async (processId: string, outputs: string[], status: 'completed' | 'failed') => {
    // Remove the processing talk from the list
    setTalks(prev => prev.filter(t => t.processId !== processId));
    
    if (status === 'failed') {
      setMode('none');
      setCurrent({ type: null, filename: null, url: null, title: null });
      setCurrentProcess(null);
      return;
    }
    
    // Refresh talks list to get the new talk
    const data = await api.list();
    setLiveStreams(data.liveStreams);
    setTalks(data.talks);
    
    // Find and select the new video if available
    if (status === 'completed' && outputs && outputs.length > 0) {
      const outputPath = outputs[0];
      const dirName = outputPath.split('/').pop();
      
      // Find the newly created talk in the refreshed data
      const newTalk = data.talks.find(t => t.name === dirName);
      if (newTalk) {
        selectVideo('talks', newTalk);
      }
    }
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
        onSelectVideo={selectVideo}
        selectedVideo={mode === 'video' ? current : null}
        selectedProcess={mode === 'process' ? currentProcess : null}
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
            onProcessStart={handleProcessStart}
            onDelete={current.type === 'talks' ? () => handleDelete(current.filename!) : undefined}
            onRename={(newName) => handleRename(current.type!, current.filename!, newName)}
          />
        )}
        {mode === 'process' && currentProcess && (
          <ProcessLogs
            processId={currentProcess}
            onComplete={(outputs: string[], status: 'completed' | 'failed') => handleProcessComplete(currentProcess, outputs, status)}
          />
        )}
        {mode === 'none' && <EmptyState />}
      </main>
    </div>
  );
}