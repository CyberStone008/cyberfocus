import articles from '../../../data/articles.json';
import podcastsData from '../../../data/podcasts.json';
import sourcesConfigRaw from '../../../data/sources.json';
import { Article } from '../../types/article';
import { SOURCES, SourceStatus } from '../../lib/sources-config';
import { SourcesView } from '../../components/SourcesView';
import styles from './page.module.css';

const PODCAST_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

/** 播客源由 data/sources.json 的 "podcasts" 配置驱动；这里映射成信源卡片在「精选播客」板块展示。 */
function buildPodcastSources(disabledIds: Set<string>) {
  const cfg = (sourcesConfigRaw as { podcasts?: any[] }).podcasts ?? [];
  const pstats: Record<string, { count: number; latest: string | null }> = {};
  for (const e of podcastsData as any[]) {
    const s = e.source;
    if (!s) continue;
    if (!pstats[s]) pstats[s] = { count: 0, latest: null };
    pstats[s].count++;
    if (e.publishedAt && (!pstats[s].latest || e.publishedAt > pstats[s].latest!)) pstats[s].latest = e.publishedAt;
  }
  return cfg.map((p, i) => {
    const st = pstats[p.source];
    const isEnabled = p.disabled !== true && !disabledIds.has(p.id) && !disabledIds.has(p.source);
    return {
      id: p.id,
      name: p.source,
      abbr: String(p.source ?? '').slice(0, 2),
      avatarColor: PODCAST_COLORS[i % PODCAST_COLORS.length],
      label: p.lang === 'zh' ? '中文播客' : '英文播客',
      description: `${p.lang === 'zh' ? '中文（免翻译）' : '英文（自动翻译）'}播客 · 每批最多 ${p.max ?? 8} 集 · RSS：${p.feedUrl}`,
      url: p.feedUrl,
      type: 'pull' as const,
      frequency: '每日',
      category: 'social' as const,
      boards: ['podcast'] as ('podcast')[],
      status: (!isEnabled ? 'paused' : st ? 'active' : 'idle') as SourceStatus,
      articleCount: st?.count ?? 0,
      latestAt: st?.latest ?? null,
      enabled: isEnabled,
    };
  });
}

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

  const allSources   = [...sourcesWithStats, ...buildPodcastSources(disabledIds)];
  const totalCount   = allSources.length;
  const activeCount  = allSources.filter((s) => s.status === 'active').length;
  const failingCount = allSources.filter((s) => s.status === 'failing' || s.status === 'paused').length;

  const boardOverrides = (sourcesConfigRaw as any).boardOverrides ?? {};

  return (
    <div className={styles.page}>
      <SourcesView
        sources={allSources}
        totalCount={totalCount}
        activeCount={activeCount}
        failingCount={failingCount}
        boardOverrides={boardOverrides}
      />
    </div>
  );
}
