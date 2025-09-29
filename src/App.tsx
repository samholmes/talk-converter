import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { VideoPlayerShell } from './components/video-player/VideoPlayerShell';
import { ProcessLogs } from './components/ProcessLogs';
import { EmptyState } from './components/EmptyState';
import type { VideoInfo, CurrentMedia, ProcessInfo } from './types';
import { api } from './api';

type AppMode = 'none' | 'video' | 'process';

export function App() {
  const [mode, setMode] = useState<AppMode>('none');
  const [liveStreams, setLiveStreams] = useState<VideoInfo[]>([]);
  const [talks, setTalks] = useState<VideoInfo[]>([]);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [current, setCurrent] = useState<CurrentMedia>({
    type: null,
    filename: null,
    url: null
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
    setCurrent({
      type,
      filename: video.name,
      url: video.url
    });
    setMode('video');
    setCurrentProcess(null);
  };

  const selectProcess = (processId: string) => {
    setCurrentProcess(processId);
    setMode('process');
    setCurrent({ type: null, filename: null, url: null });
  };

  const handleProcessStart = (processId: string, title?: string) => {
    setProcesses(prev => [...prev, { 
      id: processId, 
      title: title || 'Processing...', 
      status: 'processing' 
    }]);
    selectProcess(processId);
  };

  const handleProcessComplete = async (processId: string, outputs: string[], status: 'completed' | 'failed') => {
    // Update process status
    setProcesses(prev => prev.map(p => 
      p.id === processId ? { ...p, status: status === 'completed' ? 'done' : 'failed' } : p
    ));
    
    await refreshLists();
    
    // Auto-select the new video if available
    if (status === 'completed' && outputs && outputs.length > 0) {
      const outputPath = outputs[0];
      const dirName = outputPath.split('/').pop();
      if (dirName) {
        // Small delay to allow list to refresh
        setTimeout(() => {
          const newTalk = talks.find(t => t.name === dirName);
          if (newTalk) {
            selectVideo('talks', newTalk);
          }
        }, 500);
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
        setCurrent({ type: null, filename: null, url: null });
      }
    } catch (error) {
      console.error('Failed to delete talk:', error);
      alert('Failed to delete talk');
    }
  };

  return (
    <div className="app">
      <Sidebar
        liveStreams={liveStreams}
        talks={talks}
        processes={processes}
        onSelectVideo={selectVideo}
        onSelectProcess={selectProcess}
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
              label: current.filename,
            }}
            onProcessStart={handleProcessStart}
            onDelete={current.type === 'talks' ? () => handleDelete(current.filename!) : undefined}
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