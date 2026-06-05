import articles from '../../../data/articles.json';
import podcastsData from '../../../data/podcasts.json';
import sourcesConfig from '../../../data/sources.json';
import { Article } from '../../types/article';
import { SOURCES, getEffectiveBoards, BoardId } from '../../lib/sources-config';
import { SearchView, SearchItem } from '../../components/SearchView';

export const metadata = { title: '全站搜索 | CyberFocus' };

export default function SearchPage() {
  const overrides = (sourcesConfig as { boardOverrides?: Record<string, BoardId[]> }).boardOverrides ?? {};

  // Precompute source → kind once (research→报告, orgs→机构, social→社交).
  const kindBySource = new Map<string, string>();
  for (const s of SOURCES) {
    const b = getEffectiveBoards(s.id, s.boards, overrides);
    kindBySource.set(
      s.id,
      b.includes('research') ? '报告' : b.includes('orgs') ? '机构' : b.includes('social') ? '社交' : '文章',
    );
  }

  const articleItems: SearchItem[] = (articles as Article[]).map((a) => {
    const hasDetail = Boolean(a.contentMd && a.slug);
    return {
      id: a.id,
      kind: kindBySource.get(a.source) ?? '文章',
      titleZh: a.titleZh,
      titleEn: a.titleEn,
      source: a.source,
      publishedAt: a.publishedAt,
      href: hasDetail ? `/articles/${a.slug}` : (a.sourceUrl ?? ''),
      external: !hasDetail,
    };
  });

  const podcastItems: SearchItem[] = (podcastsData as unknown as Article[]).map((e) => {
    const hasDetail = Boolean(e.contentMd && e.slug);
    return {
      id: e.id,
      kind: '播客',
      titleZh: e.titleZh,
      titleEn: e.titleEn,
      source: e.source,
      publishedAt: e.publishedAt,
      href: hasDetail ? `/podcast/${e.slug}` : (e.sourceUrl ?? ''),
      external: !hasDetail,
    };
  });

  const index = [...articleItems, ...podcastItems]
    .filter((x) => (x.titleZh || x.titleEn) && x.href)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  return <SearchView index={index} />;
}
