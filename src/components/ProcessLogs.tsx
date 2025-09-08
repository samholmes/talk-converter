import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type { ProcessMessage, ProcessSnapshot } from '../types';

interface ProcessLogsProps {
  processId: string;
  onComplete: (outputs: string[], status: 'completed' | 'failed') => void;
}

export function ProcessLogs({ processId, onComplete }: ProcessLogsProps) {
  const [status, setStatus] = useState('Connecting to process stream...');
  const [logs, setLogs] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus('Connecting to process stream...');
    setLogs([]);

    const eventSource = api.streamProcess(processId, (msg: ProcessMessage) => {
      if (msg.event === 'snapshot') {
        const snapshot = msg.data as ProcessSnapshot;
        setStatus(`Status: ${snapshot.status} (${snapshot.currentIndex}/${snapshot.total})`);
        if (snapshot.logs && snapshot.logs.length > 0) {
          setLogs(snapshot.logs);
        }
      } else if (msg.event === 'log') {
        const { text } = msg.data;
        setLogs(prev => [...prev, text]);
        
        // Auto-scroll to bottom
        setTimeout(() => {
          logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 10);
      } else if (msg.event === 'status') {
        const { status: newStatus, outputs } = msg.data;
        setStatus(`Status: ${newStatus}`);
        
        if ((newStatus === 'completed' || newStatus === 'failed') && outputs) {
          onComplete(outputs, newStatus === 'completed' ? 'completed' : 'failed');
        }
      } else if (msg.event === 'progress') {
        const { currentIndex, total, segment } = msg.data;
        setStatus(`Processing segment ${currentIndex + 1}/${total}: "${segment.title}"`);
      }
    });

    eventSource.onopen = () => {
      setStatus('Connected, waiting for updates...');
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setStatus('Connection error, retrying...');
    };

    eventSourceRef.current = eventSource;

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [processId, onComplete]);

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