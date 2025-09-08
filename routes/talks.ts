import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, talksDir } from './utils';

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