import { Hono } from 'hono';
import { ensureDirs, youtubeDir, talksDir, listMP4 } from './utils';

const listRoutes = new Hono();

// List videos
listRoutes.get('/api/list', async (c) => {
  await ensureDirs();
  const live = await listMP4(youtubeDir);
  const talks = await listMP4(talksDir);
  
  return c.json({
    liveStreams: live.map((name) => ({ 
      name, 
      url: `/media/youtube/${encodeURIComponent(name)}` 
    })),
    talks: talks.map((name) => ({ 
      name, 
      url: `/media/talks/${encodeURIComponent(name)}` 
    })),
  });
});

export default listRoutes;