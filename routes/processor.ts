import path from 'path';
import fs from 'fs/promises';
import type { Activity, TalkMetadata, TalkEdit } from './types';
import { activities, broadcast, subscribers, eventBuffer } from './state';
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

export async function runSegmentActivity(activity: Activity) {
  activities.set(activity.id, activity);
  broadcast(activity.id, 'status', { status: activity.status, currentIndex: activity.currentIndex, total: activity.total });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const segments = activity.metadata?.segments || [];
  const sourceType = activity.metadata?.sourceType;
  const sourcePath = activity.metadata?.sourcePath;
  const sourceVideoId = activity.metadata?.sourceVideoId;
  const filename = activity.metadata?.filename;
  
  for (let i = 0; i < segments.length; i++) {
    activity.currentIndex = i;
    const seg = segments[i];
    broadcast(activity.id, 'progress', { currentIndex: activity.currentIndex, total: activity.total, segment: seg });

    const timestamps = `${seg.start},${seg.end}`;
    
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
        activity.logs.push(note);
        broadcast(activity.id, 'log', { type: 'stdout', text: note });
      }
    } catch (error) {
      console.error(`Failed to prepare directory for ${seg.title}:`, error);
      activity.status = 'failed';
      activity.logs.push(`Failed to prepare directory: ${error instanceof Error ? error.message : String(error)}`);
      broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
      
      setTimeout(() => {
        activities.delete(activity.id);
        subscribers.delete(activity.id);
        eventBuffer.delete(activity.id);
      }, 30000);
      return;
    }

    const outputPath = path.join(talkDir, 'video.mp4');
    let command: string[] | null = null;

    if (sourceType === 'youtube') {
      let localSourcePath = sourcePath;
      let localStats = localSourcePath ? await statIfExists(localSourcePath) : null;

      if (!localStats && localSourcePath && !localSourcePath.endsWith('.mp4')) {
        const directoryCandidate = path.join(localSourcePath, 'video.mp4');
        const dirStats = await statIfExists(directoryCandidate);
        if (dirStats) {
          localSourcePath = directoryCandidate;
          localStats = dirStats;
        }
      }

      if (!localStats && localSourcePath && localSourcePath.endsWith('.mp4')) {
        const fastStartCandidate = localSourcePath.replace(/\.mp4$/i, '.fs.mp4');
        const fastStats = await statIfExists(fastStartCandidate);
        if (fastStats) {
          localSourcePath = fastStartCandidate;
          localStats = fastStats;
        }
      }

      if (localStats?.isFile() && localSourcePath) {
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
      } else if (sourceVideoId) {
        const url = `https://youtube.com/watch?v=${sourceVideoId}`;
        const fallbackMsg = `Falling back to download for source ${sourceVideoId}`;
        activity.logs.push(fallbackMsg);
        broadcast(activity.id, 'log', { type: 'stdout', text: fallbackMsg });
        command = ['bun', 'run', 'index.ts', url, timestamps, seg.title];
      } else {
        activity.status = 'failed';
        const errorMessage = `No local media or source ID available for ${filename || 'unknown'}`;
        activity.logs.push(errorMessage);
        broadcast(activity.id, 'log', { type: 'stderr', text: errorMessage });
        broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
        
        setTimeout(() => {
          activities.delete(activity.id);
          subscribers.delete(activity.id);
          eventBuffer.delete(activity.id);
        }, 30000);
        return;
      }
    } else {
      let activitySourcePath = sourcePath;
      let sourceStats = activitySourcePath ? await statIfExists(activitySourcePath) : null;

      if (!sourceStats && activitySourcePath && !activitySourcePath.endsWith('.mp4')) {
        const directoryCandidate = path.join(activitySourcePath, 'video.mp4');
        const dirStats = await statIfExists(directoryCandidate);

        if (dirStats) {
          activitySourcePath = directoryCandidate;
          sourceStats = dirStats;
        } else {
          const legacyCandidate = `${activitySourcePath}.mp4`;
          const legacyStats = await statIfExists(legacyCandidate);

          if (legacyStats) {
            activitySourcePath = legacyCandidate;
            sourceStats = legacyStats;
          }
        }
      }

      if (!sourceStats && activitySourcePath && activitySourcePath.endsWith('.mp4')) {
        const fastStartCandidate = activitySourcePath.replace(/\.mp4$/i, '.fs.mp4');
        const fastStats = await statIfExists(fastStartCandidate);
        if (fastStats) {
          activitySourcePath = fastStartCandidate;
          sourceStats = fastStats;
        }
      }

      if (!sourceStats) {
        activity.status = 'failed';
        const message = `Source file not found: ${activitySourcePath}`;
        activity.logs.push(message);
        broadcast(activity.id, 'log', { type: 'stderr', text: `Error: ${message}` });
        broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
        
        setTimeout(() => {
          activities.delete(activity.id);
          subscribers.delete(activity.id);
        }, 5000);
        return;
      }

      if (activitySourcePath) {
        command = [
          'ffmpeg', '-y',
          '-i', activitySourcePath,
          '-ss', String(seg.start),
          '-to', String(seg.end),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-c:a', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputPath
        ];
      }
    }

    if (!command) {
      continue;
    }

    const p = Bun.spawn(command, {
      cwd: rootDir,
      env: { 
        ...process.env, 
        SKIP_POST_PROCESSING: '1',
        OUTPUT_DIR: talkDir
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
          activity.logs.push(line);
          if (activity.logs.length > 2000) activity.logs.splice(0, activity.logs.length - 2000);
          broadcast(activity.id, 'log', { type: which, text: line });
        }
      }
    };

    await Promise.all([readStream(p.stdout!, 'stdout'), readStream(p.stderr!, 'stderr')]);
    const exitCode = await p.exited;

    if (exitCode !== 0) {
      activity.status = 'failed';
      broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
      
      setTimeout(() => {
        activities.delete(activity.id);
        subscribers.delete(activity.id);
        eventBuffer.delete(activity.id);
      }, 30000);
      return;
    }

    const metadata: TalkMetadata = {
      title: seg.title,
      createdAt: Date.now(),
      sourceVideo: sourceVideoId ?? filename,
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

    activity.outputs.push(talkDir);
    broadcast(activity.id, 'output', { path: talkDir });
  }

  activity.status = 'completed';
  activity.completedAt = Date.now();
  
  console.log(`Broadcasting completion for activity ${activity.id} with outputs:`, activity.outputs);
  broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
  
  setTimeout(() => {
    console.log(`Cleaning up activity ${activity.id}`);
    activities.delete(activity.id);
    subscribers.delete(activity.id);
    eventBuffer.delete(activity.id);
  }, 30000);
}

export async function runAddIntroActivity(activity: Activity) {
  activities.set(activity.id, activity);
  broadcast(activity.id, 'status', { status: activity.status });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const talkDir = activity.metadata?.talkDir;
  const introPath = activity.metadata?.introPath;
  const videoPath = activity.metadata?.videoPath;
  const talkName = activity.metadata?.talkName;
  
  if (!talkDir || !introPath || !videoPath) {
    activity.status = 'failed';
    activity.logs.push('Missing required paths for add-intro activity');
    broadcast(activity.id, 'status', { status: activity.status });
    setTimeout(() => {
      activities.delete(activity.id);
      subscribers.delete(activity.id);
      eventBuffer.delete(activity.id);
    }, 30000);
    return;
  }

  try {
    const timestamp = Date.now();
    const outputFilename = `${timestamp}.mp4`;
    const outputPath = path.join(talkDir, outputFilename);
    
    const introProbe = Bun.spawn([
      'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', introPath
    ], { stdout: 'pipe' });
    const introDurationText = await new Response(introProbe.stdout).text();
    const introDuration = parseFloat(introDurationText.trim());
    const xfadeOffset = Math.floor(introDuration - 1);
    
    const p = Bun.spawn([
      'ffmpeg', '-y',
      '-i', introPath,
      '-i', videoPath,
      '-filter_complex',
      '[0:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v0];' +
      '[1:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v1];' +
      `[v0][v1]xfade=transition=fade:duration=1:offset=${xfadeOffset},format=yuv420p[vout];` +
      '[0:a][1:a]concat=n=2:v=0:a=1[aout]',
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'fast',
      '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
      outputPath
    ], { stdout: 'pipe', stderr: 'pipe' });
    
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
          activity.logs.push(line);
          if (activity.logs.length > 2000) activity.logs.splice(0, activity.logs.length - 2000);
          broadcast(activity.id, 'log', { type: which, text: line });
        }
      }
    };

    await Promise.all([readStream(p.stdout!, 'stdout'), readStream(p.stderr!, 'stderr')]);
    const exitCode = await p.exited;
    
    if (exitCode !== 0) {
      activity.status = 'failed';
      broadcast(activity.id, 'status', { status: activity.status });
      setTimeout(() => {
        activities.delete(activity.id);
        subscribers.delete(activity.id);
        eventBuffer.delete(activity.id);
      }, 30000);
      return;
    }
    
    const metadataPath = path.join(talkDir, 'metadata.json');
    let metadata: TalkMetadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    } catch {
      metadata = { title: talkName || 'Unknown', createdAt: Date.now() };
    }
    
    const edit: TalkEdit = {
      filename: outputFilename,
      timestamp,
      description: 'Added intro clip'
    };
    
    if (!metadata.edits) {
      metadata.edits = [];
    }
    metadata.edits.push(edit);
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    activity.outputs.push(outputFilename);
    activity.status = 'completed';
    activity.completedAt = Date.now();
    
    broadcast(activity.id, 'status', { status: activity.status, outputs: activity.outputs });
    
    setTimeout(() => {
      activities.delete(activity.id);
      subscribers.delete(activity.id);
      eventBuffer.delete(activity.id);
    }, 30000);
  } catch (error) {
    activity.status = 'failed';
    activity.logs.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    broadcast(activity.id, 'status', { status: activity.status });
    setTimeout(() => {
      activities.delete(activity.id);
      subscribers.delete(activity.id);
      eventBuffer.delete(activity.id);
    }, 30000);
  }
}

export async function runActivity(activity: Activity) {
  if (activity.type === 'segment') {
    return runSegmentActivity(activity);
  } else if (activity.type === 'add-intro') {
    return runAddIntroActivity(activity);
  } else {
    throw new Error(`Unknown activity type: ${activity.type}`);
  }
}
