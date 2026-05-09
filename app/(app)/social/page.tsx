import articles from '../../../data/articles.json';
import sourcesConfig from '../../../data/sources.json';
import { Article } from '../../types/article';
import { SocialFeed } from '../../components/SocialFeed';
import { SOURCES, getEffectiveBoards, BoardId } from '../../lib/sources-config';

export default function SocialPage() {
  const overrides = (sourcesConfig as any).boardOverrides as Record<string, BoardId[]> ?? {};
  const sourceIds = new Set(
    SOURCES
      .filter((s) => getEffectiveBoards(s.id, s.boards, overrides).includes('social'))
      .map((s) => s.id)
  );

  const social = (articles as Article[])
    .filter((a) => sourceIds.has(a.source))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return <SocialFeed articles={social} />;
}
