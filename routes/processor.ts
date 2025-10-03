import path from 'path';
import fs from 'fs/promises';
import type { Proc, TalkMetadata } from './types';
import { processes, broadcast, subscribers, eventBuffer } from './state';
import { rootDir, talksDir, sanitize } from './utils';

const statIfExists = async (target: string) => fs.stat(target).catch(() => null);

const resolveUniqueTalkDir = async (baseName: string) => {
  const safeBase = baseName || 'segment';
  let candidate = safeBase;
  let suffix = 1;

  while (true) {
    const candidatePath = path.join(talksDir, candidate);
    const existing = await statIfExists(candidatePath);
    if (!existing) {
      return { name: candidate, path: candidatePath };
    }
    candidate = `${safeBase}_${suffix++}`;
  }
};

export async function runProcess(proc: Proc) {
  processes.set(proc.id, proc);
  broadcast(proc.id, 'status', { status: proc.status, currentIndex: proc.currentIndex, total: proc.total });
  
  // Small delay to ensure SSE connections are established
  await new Promise(resolve => setTimeout(resolve, 100));
  
  for (let i = 0; i < proc.segments.length; i++) {
    proc.currentIndex = i;
    const seg = proc.segments[i];
    broadcast(proc.id, 'progress', { currentIndex: proc.currentIndex, total: proc.total, segment: seg });

    const timestamps = `${seg.start},${seg.end}`;
    
    // Create a directory for this talk
    const baseDirName = sanitize(seg.title).replace(/^_+|_+$/g, '');
    const fallbackDirName = baseDirName || `segment_${i + 1}`;

    let talkDirName: string;
    let talkDir: string;

    try {
      const resolvedDir = await resolveUniqueTalkDir(fallbackDirName);
      talkDirName = resolvedDir.name;
      talkDir = resolvedDir.path;
      await fs.mkdir(talkDir, { recursive: true });

      if (talkDirName !== baseDirName) {
        const note = `Adjusted output directory to ${talkDirName} to avoid collision`;
        proc.logs.push(note);
        broadcast(proc.id, 'log', { type: 'stdout', text: note });
      }
    } catch (error) {
      console.error(`Failed to prepare directory for ${seg.title}:`, error);
      proc.status = 'failed';
      proc.logs.push(`Failed to prepare directory: ${error instanceof Error ? error.message : String(error)}`);
      broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
      
      // Cleanup after failed process
      setTimeout(() => {
        processes.delete(proc.id);
        subscribers.delete(proc.id);
        eventBuffer.delete(proc.id);
      }, 30000); // 30 seconds
      return;
    }

    const outputPath = path.join(talkDir, 'video.mp4');
    let command: string[] | null = null;

    if (proc.sourceType === 'youtube') {
      let localSourcePath = proc.sourcePath;
      let localStats = await statIfExists(localSourcePath);

      if (!localStats && !localSourcePath.endsWith('.mp4')) {
        const directoryCandidate = path.join(localSourcePath, 'video.mp4');
        const dirStats = await statIfExists(directoryCandidate);
        if (dirStats) {
          localSourcePath = directoryCandidate;
          localStats = dirStats;
        }
      }

      if (!localStats && localSourcePath.endsWith('.mp4')) {
        const fastStartCandidate = localSourcePath.replace(/\.mp4$/i, '.fs.mp4');
        const fastStats = await statIfExists(fastStartCandidate);
        if (fastStats) {
          localSourcePath = fastStartCandidate;
          localStats = fastStats;
        }
      }

      if (localStats?.isFile()) {
        command = [
          'ffmpeg', '-y',
          '-i', localSourcePath,
          '-ss', String(seg.start),
          '-to', String(seg.end),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-c:a', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputPath
        ];
      } else if (proc.sourceVideoId) {
        const url = `https://youtube.com/watch?v=${proc.sourceVideoId}`;
        const fallbackMsg = `Falling back to download for source ${proc.sourceVideoId}`;
        proc.logs.push(fallbackMsg);
        broadcast(proc.id, 'log', { type: 'stdout', text: fallbackMsg });
        command = ['bun', 'run', 'index.ts', url, timestamps, seg.title];
      } else {
        proc.status = 'failed';
        const errorMessage = `No local media or source ID available for ${proc.filename}`;
        proc.logs.push(errorMessage);
        broadcast(proc.id, 'log', { type: 'stderr', text: errorMessage });
        broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
        
        setTimeout(() => {
          processes.delete(proc.id);
          subscribers.delete(proc.id);
          eventBuffer.delete(proc.id);
        }, 30000);
        return;
      }
    } else {
      // For talks, process the local file directly using ffmpeg
      let sourcePath = proc.sourcePath;
      let sourceStats = await statIfExists(sourcePath);

      if (!sourceStats && !sourcePath.endsWith('.mp4')) {
        const directoryCandidate = path.join(sourcePath, 'video.mp4');
        const dirStats = await statIfExists(directoryCandidate);

        if (dirStats) {
          sourcePath = directoryCandidate;
          sourceStats = dirStats;
        } else {
          const legacyCandidate = `${sourcePath}.mp4`;
          const legacyStats = await statIfExists(legacyCandidate);

          if (legacyStats) {
            sourcePath = legacyCandidate;
            sourceStats = legacyStats;
          }
        }
      }

      if (!sourceStats && sourcePath.endsWith('.mp4')) {
        const fastStartCandidate = sourcePath.replace(/\.mp4$/i, '.fs.mp4');
        const fastStats = await statIfExists(fastStartCandidate);
        if (fastStats) {
          sourcePath = fastStartCandidate;
          sourceStats = fastStats;
        }
      }

      if (!sourceStats) {
        proc.status = 'failed';
        const message = `Source file not found: ${sourcePath}`;
        proc.logs.push(message);
        broadcast(proc.id, 'log', { type: 'stderr', text: `Error: ${message}` });
        broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
        
        // Cleanup after failed process
        setTimeout(() => {
          processes.delete(proc.id);
          subscribers.delete(proc.id);
        }, 5000);
        return;
      }

      // Use ffmpeg directly to extract the segment
      command = [
        'ffmpeg', '-y',
        '-i', sourcePath,
        '-ss', String(seg.start),
        '-to', String(seg.end),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-c:a', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outputPath
      ];
    }

    if (!command) {
      continue;
    }

    // Pass the directory path to index.ts via environment variable
    const p = Bun.spawn(command, {

      cwd: rootDir,
      env: { 
        ...process.env, 
        SKIP_POST_PROCESSING: '1',
        OUTPUT_DIR: talkDir  // Tell index.ts where to save files
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const readStream = async (stream: ReadableStream<Uint8Array>, which: 'stdout' | 'stderr') => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (!line) continue;
          proc.logs.push(line);
          if (proc.logs.length > 2000) proc.logs.splice(0, proc.logs.length - 2000);
          broadcast(proc.id, 'log', { type: which, text: line });
        }
      }
    };

    await Promise.all([readStream(p.stdout!, 'stdout'), readStream(p.stderr!, 'stderr')]);
    const exitCode = await p.exited;

    if (exitCode !== 0) {
      proc.status = 'failed';
      broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
      
      // Cleanup after failed process
      setTimeout(() => {
        processes.delete(proc.id);
        subscribers.delete(proc.id);
        eventBuffer.delete(proc.id);
      }, 30000); // 30 seconds
      return;
    }

    // Create metadata file
    const metadata: TalkMetadata = {
      title: seg.title,
      createdAt: Date.now(),
      sourceVideo: proc.sourceVideoId ?? proc.filename,
      duration: seg.end - seg.start
    };
    
    try {
      await fs.writeFile(
        path.join(talkDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
    } catch (error) {
      console.error(`Failed to write metadata for ${seg.title}:`, error);
    }

    // Track the directory path as output
    proc.outputs.push(talkDir);
    broadcast(proc.id, 'output', { path: talkDir });
  }

  proc.status = 'completed';
  proc.completedAt = Date.now();
  
  // Ensure the final status is broadcast
  console.log(`Broadcasting completion for process ${proc.id} with outputs:`, proc.outputs);
  broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
  
  // Keep the process in memory longer to ensure clients receive the final status
  setTimeout(() => {
    console.log(`Cleaning up process ${proc.id}`);
    processes.delete(proc.id);
    subscribers.delete(proc.id);
    eventBuffer.delete(proc.id);
  }, 30000); // 30 seconds
}