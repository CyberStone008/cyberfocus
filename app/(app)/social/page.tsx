import articles from '../../../data/articles.json';
import sourcesConfig from '../../../data/sources.json';
import { Article } from '../../types/article';
import { SocialFeed } from '../../components/SocialFeed';
import { toSocialItem } from '../../lib/feed-projection';
import { dedupeNews } from '../../lib/dedupe';
import { SOURCES, getEffectiveBoards, BoardId } from '../../lib/sources-config';

export default function SocialPage() {
  const overrides = (sourcesConfig as any).boardOverrides as Record<string, BoardId[]> ?? {};
  const sourceIds = new Set(
    SOURCES
      .filter((s) => getEffectiveBoards(s.id, s.boards, overrides).includes('social'))
      .map((s) => s.id)
  );

  // Main view = recent window only; the full archive lives at /social/all.
  // Social sources publish in real time, so windowing by publishedAt is safe and
  // keeps the inlined static-HTML payload small (was 4.8MB with the full list).
  const RECENT_DAYS = 21;
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const sorted = (articles as Article[])
    .filter((a) => sourceIds.has(a.source))
    .filter((a) => new Date(a.publishedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const social = dedupeNews(sorted).map(toSocialItem);   // 同一新闻多源 → 只留代表条 + 标注 N 家报道

  return <SocialFeed articles={social} archiveHref="/social/all" />;
}
