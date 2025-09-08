import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, talksDir } from './utils';

const talksRoutes = new Hono();

// Delete a talk video
talksRoutes.delete('/api/talks/:filename', async (c) => {
  await ensureDirs();
  const filename = decodeURIComponent(c.req.param('filename'));
  
  if (filename.includes('..') || filename.includes('/')) {
    return c.text('Invalid path', 400);
  }
  
  const filePath = path.join(talksDir, filename);
  const fsFilePath = path.join(talksDir, filename.replace('.mp4', '.fs.mp4'));
  
  try {
    // Delete both the original file and the faststart version if it exists
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(fsFilePath).catch(() => {});
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to delete file' }, 500);
  }
});

export default talksRoutes;