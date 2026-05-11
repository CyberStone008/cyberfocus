import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Article } from '../../types/article';
import { PodcastFeed } from '../../components/PodcastFeed';

type Episode = Article & { duration?: string | null };

function loadPodcasts(): Episode[] {
  const path = resolve(process.cwd(), 'data/podcasts.json');
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return []; }
}

export default function PodcastPage() {
  const episodes = loadPodcasts();
  return <PodcastFeed episodes={episodes} />;
}
