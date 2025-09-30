import path from 'path';
import fs from 'fs/promises';
import type { Proc, TalkMetadata } from './types';
import { processes, broadcast, subscribers, eventBuffer } from './state';
import { rootDir, talksDir, sanitize } from './utils';

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
    const talkDirName = sanitize(seg.title);
    const talkDir = path.join(talksDir, talkDirName);
    
    try {
      await fs.mkdir(talkDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create directory for ${seg.title}:`, error);
      proc.status = 'failed';
      proc.logs.push(`Failed to create directory: ${error}`);
      broadcast(proc.id, 'status', { status: proc.status, outputs: proc.outputs });
      
      // Cleanup after failed process
      setTimeout(() => {
        processes.delete(proc.id);
        subscribers.delete(proc.id);
        eventBuffer.delete(proc.id);
      }, 30000); // 30 seconds
      return;
    }

    let command: string[];
    
    if (proc.sourceType === 'youtube') {
      // For YouTube videos, use the YouTube URL
      const videoId = path.parse(proc.filename).name;
      const url = `https://youtube.com/watch?v=${videoId}`;
      command = ['bun', 'run', 'index.ts', url, timestamps, seg.title];
    } else {
      // For talks, process the local file directly using ffmpeg
      const sourcePath = proc.sourcePath.endsWith('.mp4') ? proc.sourcePath : `${proc.sourcePath}.mp4`;
      const outputPath = path.join(talkDir, 'video.mp4');
      
      // Check if source file exists
      try {
        await fs.access(sourcePath);
      } catch {
        proc.status = 'failed';
        proc.logs.push(`Source file not found: ${sourcePath}`);
        broadcast(proc.id, 'log', { type: 'stderr', text: `Error: Source file not found: ${sourcePath}` });
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
        'ffmpeg', '-i', sourcePath,
        '-ss', String(seg.start),
        '-to', String(seg.end),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outputPath
      ];
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
      sourceVideo: proc.filename,
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