import fs from 'fs/promises';
import path from 'path';

// Paths
export const rootDir = process.cwd();
export const youtubeDir = path.join(rootDir, '__youtube');
export const talksDir = path.join(rootDir, '__talks');

// Utility functions
export const ensureDirs = async () => {
  await fs.mkdir(youtubeDir, { recursive: true });
  await fs.mkdir(talksDir, { recursive: true });
};

export const listMP4 = async (dir: string) => {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.toLowerCase().endsWith('.mp4'))
      .filter((f) => !f.toLowerCase().endsWith('.fs.mp4'))
      .sort();
  } catch {
    return [];
  }
};

export const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

// Cache in-flight conversions to avoid duplicate work
const convertJobs = new Map<string, Promise<string>>();

export async function ensureFastStart(fp: string): Promise<{ path: string; fast: boolean }> {
  const dir = path.dirname(fp);
  const { name } = path.parse(fp);
  const out = path.join(dir, `${name}.fs.mp4`);

  // If up-to-date faststart file exists, use it
  try {
    const [src, dst] = await Promise.all([
      fs.stat(fp).catch(() => null),
      fs.stat(out).catch(() => null),
    ]);
    if (src && dst && dst.mtimeMs >= src.mtimeMs && dst.size > 0) {
      return { path: out, fast: true };
    }
  } catch { }

  // Start conversion once per source file
  if (!convertJobs.has(fp)) {
    const job = (async () => {
      const tmp = `${out}.tmp`;
      try { await fs.rm(tmp).catch(() => { }); } catch { }
      const p = Bun.spawn([
        'ffmpeg', '-y', '-i', fp, '-c', 'copy', '-movflags', '+faststart', tmp,
      ], { stdout: 'pipe', stderr: 'pipe' });
      await p.exited;
      if (p.exitCode !== 0) throw new Error('ffmpeg faststart failed');
      await fs.rename(tmp, out).catch(async () => {
        await fs.cp(tmp, out);
        await fs.rm(tmp).catch(() => { });
      });
      return out;
    })().finally(() => convertJobs.delete(fp));
    convertJobs.set(fp, job);
  }

  try {
    const result = await convertJobs.get(fp)!;
    return { path: result, fast: true };
  } catch {
    // Fallback to original if conversion fails
    return { path: fp, fast: false };
  }
}