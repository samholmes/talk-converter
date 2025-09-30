import { Hono } from 'hono';
import { ensureDirs, youtubeDir, talksDir, listMP4, listTalkDirs, listStreamDirs } from './utils';

const listRoutes = new Hono();

// List videos
listRoutes.get('/api/list', async (c) => {
  await ensureDirs();
  
  // Get both old-style MP4 files and new directory structure for streams
  const oldStreams = await listMP4(youtubeDir);
  const newStreams = await listStreamDirs();
  
  // Combine streams - new structure takes precedence
  const streamNames = new Set(newStreams.map(s => s.name));
  const liveStreams = [
    ...newStreams.map(s => ({
      name: s.name,
      title: s.title,
      url: `/media/youtube/${encodeURIComponent(s.name)}/video.mp4`
    })),
    // Add old-style MP4s that aren't in new structure
    ...oldStreams
      .filter(name => !streamNames.has(name.replace('.mp4', '')))
      .map(name => ({
        name: name,
        title: name.replace('.mp4', ''),
        url: `/media/youtube/${encodeURIComponent(name)}`
      }))
  ];
  
  // Get both old-style MP4 files and new directory structure for talks
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
    liveStreams,
    talks
  });
});

export default listRoutes;