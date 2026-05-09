import articles from '../../../data/articles.json';
import sourcesConfigRaw from '../../../data/sources.json';
import { Article } from '../../types/article';
import { SOURCES, SourceStatus } from '../../lib/sources-config';
import { SourcesView } from '../../components/SourcesView';
import styles from './page.module.css';

function buildStats() {
  const map: Record<string, { count: number; latest: string | null }> = {};
  for (const a of articles as Article[]) {
    if (!map[a.source]) map[a.source] = { count: 0, latest: null };
    map[a.source].count++;
    if (!map[a.source].latest || a.publishedAt > map[a.source].latest!) {
      map[a.source].latest = a.publishedAt;
    }
  }
  return map;
}

function deriveStatus(id: string, hasStat: boolean, isEnabled: boolean): SourceStatus {
  if (!isEnabled) return 'paused';
  if (id === 'HuggingFace Daily') return 'failing';
  if (hasStat) return 'active';
  return 'idle';
}

export default function SourcesPage() {
  const stats = buildStats();
  const disabledIds = new Set((sourcesConfigRaw as { disabled?: string[] }).disabled ?? []);

  const sourcesWithStats = SOURCES.map((src) => {
    const stat = stats[src.id];
    const isEnabled = !disabledIds.has(src.id);
    return {
      ...src,
      status: deriveStatus(src.id, !!stat, isEnabled),
      articleCount: stat?.count ?? 0,
      latestAt:     stat?.latest ?? null,
      enabled:      isEnabled,
    };
  });

  const totalCount   = sourcesWithStats.length;
  const activeCount  = sourcesWithStats.filter((s) => s.status === 'active').length;
  const failingCount = sourcesWithStats.filter((s) => s.status === 'failing' || s.status === 'paused').length;

  const boardOverrides = (sourcesConfigRaw as any).boardOverrides ?? {};

  return (
    <div className={styles.page}>
      <SourcesView
        sources={sourcesWithStats}
        totalCount={totalCount}
        activeCount={activeCount}
        failingCount={failingCount}
        boardOverrides={boardOverrides}
      />
    </div>
  );
}
