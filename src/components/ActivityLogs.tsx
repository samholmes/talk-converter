import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type { ProcessMessage, ProcessSnapshot } from '../types';

interface ActivityLogsProps {
  activityId: string;
  onComplete?: (outputs: string[], status: 'completed' | 'failed') => void;
}

export function ActivityLogs({ activityId, onComplete }: ActivityLogsProps) {
  const [status, setStatus] = useState('Connecting to activity stream...');
  const [logs, setLogs] = useState<string[]>([]);
  const isDoneRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus('Connecting to activity stream...');
    setLogs([]);
    isDoneRef.current = false;

    const eventSource = api.streamActivity(activityId, (msg: ProcessMessage) => {
      console.log('Received SSE message:', msg);
      
      if (msg.event === 'snapshot') {
        const snapshot = msg.data as ProcessSnapshot;
        const isComplete = snapshot.status === 'completed' || snapshot.status === 'failed';
        isDoneRef.current = isComplete;
        setStatus(`Status: ${snapshot.status}${snapshot.total ? ` (${snapshot.currentIndex}/${snapshot.total})` : ''}`);
        if (snapshot.logs && snapshot.logs.length > 0) {
          setLogs(snapshot.logs);
        }
      } else if (msg.event === 'log') {
        const { text } = msg.data;
        setLogs(prev => [...prev, text]);
        
        setTimeout(() => {
          logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 10);
      } else if (msg.event === 'status') {
        const { status: newStatus, outputs } = msg.data;
        console.log('Received status update:', newStatus, 'with outputs:', outputs);
        const isComplete = newStatus === 'completed' || newStatus === 'failed';
        isDoneRef.current = isComplete;
        setStatus(`Status: ${newStatus}`);
        
        if (isComplete && onCompleteRef.current) {
          console.log('Activity completed/failed, calling onComplete');
          onCompleteRef.current(outputs || [], newStatus === 'completed' ? 'completed' : 'failed');
        }
      } else if (msg.event === 'progress') {
        const { currentIndex, total, segment } = msg.data;
        setStatus(`Processing segment ${currentIndex + 1}/${total}: "${segment.title}"`);
      }
    });

    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSource.onerror = (error) => {
      console.error('SSE error (auto-reconnecting):', error);
    };

    eventSourceRef.current = eventSource;

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [activityId]);

  return (
    <div id="logsUI">
      <span id="status">{status}</span>
      <pre id="logs">
        {logs.join('\n')}
        <div ref={logsEndRef} />
      </pre>
    </div>
  );
}
