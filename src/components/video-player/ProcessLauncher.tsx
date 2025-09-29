import { api } from '../../api';
import type { SegmentDraft } from './types';

interface ProcessLauncherProps {
  sourceType: 'youtube' | 'talks';
  filename: string;
  onStarted: (processId: string, title: string) => void;
}

export function useProcessLauncher({
  sourceType,
  filename,
  onStarted,
}: ProcessLauncherProps) {
  const launch = async (segment: SegmentDraft): Promise<void> => {
    try {
      const { id: processId } = await api.startProcess(sourceType, filename, [segment]);
      onStarted(processId, segment.title);
    } catch (error) {
      console.error('Failed to launch process:', error);
      throw error;
    }
  };

  return { launch };
}