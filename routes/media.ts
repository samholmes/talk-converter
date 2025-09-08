import { Hono } from 'hono';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirs, youtubeDir, talksDir, ensureFastStart } from './utils';

const mediaRoutes = new Hono();

// Serve media files with HTTP Range for scrubbing
mediaRoutes.get('/media/:type/:file', async (c) => {
  try {
    await ensureDirs();
    const type = c.req.param('type');
    const file = decodeURIComponent(c.req.param('file'));
    
    if (file.includes('..') || file.includes('/')) {
      return c.text('Invalid path', 400);
    }
    
    const base = type === 'youtube' ? youtubeDir : type === 'talks' ? talksDir : null;
    if (!base) return c.text('Invalid type', 400);
    
    const fp = path.join(base, file);
    console.log('Media request:', { type, file, fp });

    // Ensure faststart version for proper scrubbing
    const target = await ensureFastStart(fp);
    
    // Check if file exists
    try {
      await fs.access(target.path);
    } catch {
      return c.notFound();
    }
    
    const stats = await fs.stat(target.path);
    const size = stats.size;
    const range = c.req.header('range') || c.req.header('Range');

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (!m) {
        return new Response('Malformed Range', { 
          status: 416, 
          headers: { 'Content-Range': `bytes */${size}` } 
        });
      }
      
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      
      if (isNaN(start) && !isNaN(end)) {
        start = size - end;
        end = size - 1;
      }
      
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= size) {
        return new Response('Unsatisfiable Range', { 
          status: 416, 
          headers: { 'Content-Range': `bytes */${size}` } 
        });
      }
      
      // Read the file chunk
      const fileHandle = await fs.open(target.path, 'r');
      const buffer = Buffer.alloc(end - start + 1);
      await fileHandle.read(buffer, 0, buffer.length, start);
      await fileHandle.close();
      
      return new Response(buffer, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1),
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Full file response
    const bunFile = Bun.file(target.path);
    return new Response(bunFile.stream(), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(size),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Media handler error:', error);
    return c.text('Internal Server Error: ' + (error instanceof Error ? error.message : String(error)), 500);
  }
});

export default mediaRoutes;