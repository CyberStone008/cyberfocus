import articles from '../../../data/articles.json';
import sourcesConfig from '../../../data/sources.json';
import { Article } from '../../types/article';
import { ReportFeed } from '../../components/ReportFeed';
import { toReportItem } from '../../lib/feed-projection';
import { dedupeNews, isJunkTitle } from '../../lib/dedupe';
import { SOURCES, getEffectiveBoards, BoardId } from '../../lib/sources-config';

export default function OrgsPage() {
  const overrides = (sourcesConfig as any).boardOverrides as Record<string, BoardId[]> ?? {};
  const sourceIds = new Set(
    SOURCES
      .filter((s) => getEffectiveBoards(s.id, s.boards, overrides).includes('orgs'))
      .map((s) => s.id)
  );

  const sortedRaw = (articles as Article[])
    .filter((a) => sourceIds.has(a.source))
    .filter((a) => !isJunkTitle(a.titleEn, a.titleZh))   // 过滤纯日期等无内容标题
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const sorted = dedupeNews(sortedRaw).map(toReportItem);   // 同一机构动态多源 → 只留代表 + N 家报道

  return (
    <ReportFeed
      articles={sorted}
      title="人服机构动态"
      subtitle=""
      showSourceFilter={true}
      showAnalysis={false}
      showAddButton={false}
    />
  );
}
