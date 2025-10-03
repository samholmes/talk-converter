import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, talksDir, sanitize, rootDir } from './utils';
import type { TalkMetadata, TalkEdit } from './types';

const talksRoutes = new Hono();

// Helper to recursively remove directory
async function removeDirectory(dir: string) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? removeDirectory(fullPath) : fs.unlink(fullPath);
      })
    );
    await fs.rmdir(dir);
  } catch (error) {
    console.error(`Error removing directory ${dir}:`, error);
  }
}

// Rename a talk video
talksRoutes.put('/api/talks/:filename/rename', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  const body = await c.req.json();
  const { newName } = body;
  
  if (!newName || typeof newName !== 'string') {
    return c.text('New name is required', 400);
  }
  
  if (filename.includes('..') || filename.includes('/') || newName.includes('..') || newName.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const sanitizedName = sanitize(newName);
  const oldDirPath = path.join(talksDir, filename.replace('.mp4', ''));
  const oldFilePath = path.join(talksDir, filename);
  const oldFsFilePath = path.join(talksDir, filename.replace('.mp4', '.fs.mp4'));
  const newDirPath = path.join(talksDir, sanitizedName);
  
  try {
    // Check if new name already exists
    const newStats = await fs.stat(newDirPath).catch(() => null);
    if (newStats) {
      return c.json({ success: false, error: 'A talk with that name already exists' }, 400);
    }
    
    // Check if it's a directory-based talk
    const dirStats = await fs.stat(oldDirPath).catch(() => null);
    if (dirStats?.isDirectory()) {
      // Read existing metadata
      const metadataPath = path.join(oldDirPath, 'metadata.json');
      let metadata;
      try {
        metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      } catch {
        metadata = { title: newName };
      }
      
      // Update metadata title
      metadata.title = newName;
      
      // Write updated metadata
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      // Rename directory
      await fs.rename(oldDirPath, newDirPath);
    } else {
      // Old style: Convert to new directory structure
      const fileStats = await fs.stat(oldFilePath).catch(() => null);
      if (!fileStats) {
        return c.json({ success: false, error: 'Talk not found' }, 404);
      }
      
      // Create new directory
      await fs.mkdir(newDirPath, { recursive: true });
      
      // Move video file
      await fs.rename(oldFilePath, path.join(newDirPath, 'video.mp4'));
      
      // Move fast-start file if it exists
      try {
        await fs.rename(oldFsFilePath, path.join(newDirPath, 'video.fs.mp4'));
      } catch {
        // Fast-start file might not exist
      }
      
      // Create metadata
      const metadata = {
        title: newName,
        createdAt: Date.now(),
        sourceVideo: filename
      };
      await fs.writeFile(path.join(newDirPath, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error renaming talk:', error);
    return c.json({ success: false, error: 'Failed to rename talk' }, 500);
  }
});

// Delete a talk video (supports both file and directory structures)
talksRoutes.delete('/api/talks/:filename', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  
  if (filename.includes('..') || filename.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const dirPath = path.join(talksDir, filename.replace('.mp4', ''));
  const filePath = path.join(talksDir, filename);
  const fsFilePath = path.join(talksDir, filename.replace('.mp4', '.fs.mp4'));
  
  try {
    // Check if it's a directory-based talk
    const stats = await fs.stat(dirPath).catch(() => null);
    if (stats?.isDirectory()) {
      // Delete entire directory
      await removeDirectory(dirPath);
    } else {
      // Old style: Delete individual files
      await fs.unlink(filePath).catch(() => {});
      await fs.unlink(fsFilePath).catch(() => {});
    }
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete file' }, 500);
  }
});

// Get talk metadata
talksRoutes.get('/api/talks/:filename/metadata', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  
  if (filename.includes('..') || filename.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const dirName = filename.replace(/\.mp4$/i, '');
  const dirPath = path.join(talksDir, dirName);
  
  try {
    const stats = await fs.stat(dirPath).catch(() => null);
    if (!stats?.isDirectory()) {
      return c.json({ success: false, error: 'Talk not found' }, 404);
    }
    
    const metadataPath = path.join(dirPath, 'metadata.json');
    let metadata: TalkMetadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    } catch {
      metadata = { title: dirName, createdAt: Date.now() };
    }
    
    return c.json(metadata);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return c.json({ success: false, error: 'Failed to fetch metadata' }, 500);
  }
});

// Delete a talk edit
talksRoutes.delete('/api/talks/:filename/edits/:editFilename', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  const editFilename = decodeURIComponent(c.req.param('editFilename'));
  
  if (filename.includes('..') || filename.includes('/') || editFilename.includes('..') || editFilename.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const dirName = filename.replace(/\.mp4$/i, '');
  const dirPath = path.join(talksDir, dirName);
  
  try {
    const stats = await fs.stat(dirPath).catch(() => null);
    if (!stats?.isDirectory()) {
      return c.json({ success: false, error: 'Talk not found' }, 404);
    }
    
    // Read metadata
    const metadataPath = path.join(dirPath, 'metadata.json');
    let metadata: TalkMetadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    } catch {
      return c.json({ success: false, error: 'Metadata not found' }, 404);
    }
    
    // Find and remove the edit from metadata
    if (!metadata.edits) {
      return c.json({ success: false, error: 'Edit not found' }, 404);
    }
    
    const editIndex = metadata.edits.findIndex(e => e.filename === editFilename);
    if (editIndex === -1) {
      return c.json({ success: false, error: 'Edit not found' }, 404);
    }
    
    metadata.edits.splice(editIndex, 1);
    
    // Delete the video file
    const editPath = path.join(dirPath, editFilename);
    await fs.unlink(editPath).catch(() => {});
    
    // Delete fast-start version if exists
    const fsPath = editPath.replace(/\.mp4$/i, '.fs.mp4');
    await fs.unlink(fsPath).catch(() => {});
    
    // Save updated metadata
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting edit:', error);
    return c.json({ success: false, error: 'Failed to delete edit' }, 500);
  }
});

// Add intro to a talk video
talksRoutes.post('/api/talks/:filename/add-intro', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  
  if (filename.includes('..') || filename.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const dirName = filename.replace(/\.mp4$/i, '');
  const dirPath = path.join(talksDir, dirName);
  
  try {
    const stats = await fs.stat(dirPath).catch(() => null);
    if (!stats?.isDirectory()) {
      return c.json({ success: false, error: 'Talk not found' }, 404);
    }
    
    const videoPath = path.join(dirPath, 'video.mp4');
    const videoStats = await fs.stat(videoPath).catch(() => null);
    if (!videoStats) {
      return c.json({ success: false, error: 'Talk video not found' }, 404);
    }
    
    // Read metadata
    const metadataPath = path.join(dirPath, 'metadata.json');
    let metadata: TalkMetadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    } catch {
      metadata = { title: dirName, createdAt: Date.now() };
    }
    
    // Generate timestamp-based filename
    const timestamp = Date.now();
    const outputFilename = `${timestamp}.mp4`;
    const outputPath = path.join(dirPath, outputFilename);
    
    // Check intro file exists
    const introPath = path.join(rootDir, 'assets', 'DEVxIntro.mp4');
    const introStats = await fs.stat(introPath).catch(() => null);
    if (!introStats) {
      return c.json({ success: false, error: 'Intro video not found' }, 404);
    }
    
    // Run ffmpeg to concatenate using filter_complex for proper sync
    const p = Bun.spawn([
      'ffmpeg', '-y',
      '-i', introPath,
      '-i', videoPath,
      '-filter_complex',
      '[0:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];' +
      '[1:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];' +
      '[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[vout][aout]',
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'fast',
      '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
      outputPath
    ], { stdout: 'pipe', stderr: 'pipe' });
    
    await p.exited;
    
    if (p.exitCode !== 0) {
      return c.json({ success: false, error: 'Failed to concatenate videos' }, 500);
    }
    
    // Update metadata
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
    
    return c.json({ success: true, edit });
  } catch (error) {
    console.error('Error adding intro:', error);
    return c.json({ success: false, error: 'Failed to add intro' }, 500);
  }
});

export default talksRoutes;
