import articles from '../../../data/articles.json';
import sourcesConfig from '../../../data/sources.json';
import { Article } from '../../types/article';
import { ReportFeed } from '../../components/ReportFeed';
import { SOURCES, getEffectiveBoards, BoardId } from '../../lib/sources-config';

export default function ReportsPage() {
  const overrides = (sourcesConfig as any).boardOverrides as Record<string, BoardId[]> ?? {};
  const sourceIds = new Set(
    SOURCES
      .filter((s) => getEffectiveBoards(s.id, s.boards, overrides).includes('research'))
      .map((s) => s.id)
  );

  const sorted = (articles as Article[])
    .filter((a) => sourceIds.has(a.source) || a.category === 'research')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return <ReportFeed articles={sorted} />;
}
