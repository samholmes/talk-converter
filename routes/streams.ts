import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, youtubeDir, sanitize } from './utils';

const streamsRoutes = new Hono();

// Rename a stream video
streamsRoutes.put('/api/streams/:filename/rename', async (c) => {
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
  const oldDirPath = path.join(youtubeDir, filename.replace('.mp4', ''));
  const oldFilePath = path.join(youtubeDir, filename);
  const oldFsFilePath = path.join(youtubeDir, filename.replace('.mp4', '.fs.mp4'));
  const newDirPath = path.join(youtubeDir, sanitizedName);
  
  try {
    // Check if new name already exists
    const newStats = await fs.stat(newDirPath).catch(() => null);
    if (newStats) {
      return c.json({ success: false, error: 'A stream with that name already exists' }, 400);
    }
    
    // Check if it's a directory-based stream
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
        return c.json({ success: false, error: 'Stream not found' }, 404);
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
      const originalId = path.parse(filename).name;
      const metadata = {
        title: newName,
        createdAt: Date.now(),
        sourceVideo: originalId
      };
      await fs.writeFile(path.join(newDirPath, 'metadata.json'), JSON.stringify(metadata, null, 2));
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error renaming stream:', error);
    return c.json({ success: false, error: 'Failed to rename stream' }, 500);
  }
});

// Upload an mp4 as a new stream
streamsRoutes.post('/api/streams/upload', async (c) => {
  await ensureDirs();

  const formData = await c.req.formData();
  const file = formData.get('file');
  const title = formData.get('title');

  if (!(file instanceof File) || !file.name.endsWith('.mp4')) {
    return c.json({ success: false, error: 'An mp4 file is required' }, 400);
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return c.json({ success: false, error: 'A title is required' }, 400);
  }

  const dirName = sanitize(title.trim());
  const dirPath = path.join(youtubeDir, dirName);

  const existing = await fs.stat(dirPath).catch(() => null);
  if (existing) {
    return c.json({ success: false, error: 'A stream with that name already exists' }, 400);
  }

  try {
    await fs.mkdir(dirPath, { recursive: true });

    const videoPath = path.join(dirPath, 'video.mp4');
    const buffer = await file.arrayBuffer();
    await fs.writeFile(videoPath, Buffer.from(buffer));

    const metadata = {
      title: title.trim(),
      createdAt: Date.now()
    };
    await fs.writeFile(path.join(dirPath, 'metadata.json'), JSON.stringify(metadata, null, 2));

    return c.json({ success: true, name: dirName });
  } catch (error) {
    console.error('Error uploading stream:', error);
    // Clean up on failure
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    return c.json({ success: false, error: 'Failed to upload stream' }, 500);
  }
});

export default streamsRoutes;