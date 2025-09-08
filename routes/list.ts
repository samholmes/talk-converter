import { Hono } from 'hono';
import { ensureDirs, youtubeDir, talksDir, listMP4, listTalkDirs } from './utils';

const listRoutes = new Hono();

// List videos
listRoutes.get('/api/list', async (c) => {
  await ensureDirs();
  const live = await listMP4(youtubeDir);
  
  // Get both old-style MP4 files and new directory structure
  const oldTalks = await listMP4(talksDir);
  const newTalks = await listTalkDirs();
  
  // Combine talks - new structure takes precedence
  const talkNames = new Set(newTalks.map(t => t.name));
  const talks = [
    ...newTalks.map(t => ({
      name: t.name,
      title: t.title,
      url: `/media/talks/${encodeURIComponent(t.name)}/video.mp4`
    })),
    // Add old-style MP4s that aren't in new structure
    ...oldTalks
      .filter(name => !talkNames.has(name.replace('.mp4', '')))
      .map(name => ({
        name: name,
        title: name.replace('.mp4', ''),
        url: `/media/talks/${encodeURIComponent(name)}`
      }))
  ];
  
  return c.json({
    liveStreams: live.map((name) => ({ 
      name, 
      url: `/media/youtube/${encodeURIComponent(name)}` 
    })),
    talks
  });
});

export default listRoutes;