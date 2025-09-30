import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, talksDir, sanitize } from './utils';

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
        createdAt: Date.now()
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

export default talksRoutes;