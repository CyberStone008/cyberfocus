'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Fuse from 'fuse.js';
import { Article } from '../types/article';
import { SOURCES } from '../lib/sources-config';
import { IS_PUBLIC } from '../lib/public-mode';
import { getDateKey, todayKey, yesterdayKey } from '../lib/date';
import styles from './ReportFeed.module.css';

/* ── Source meta — built from sources-config + legacy overrides ── */
const CONFIG_META = Object.fromEntries(
  SOURCES.map((s) => [s.id, { color: s.avatarColor, abbr: s.abbr }])
);
const SOURCE_META: Record<string, { color: string; abbr: string }> = {
  ...CONFIG_META,
  'Anthropic Blog': { color: '#c96442', abbr: 'An' },
  'Claude Blog':    { color: '#d97757', abbr: 'Cl' },
  'OpenAI Blog':    { color: '#10a37f', abbr: 'OA' },
  'SITUATIONAL AWARENESS - The Decade Ahead': { color: '#6366f1', abbr: 'SA' },
};

/* ── Series meta — display info per seriesSlug ── */
const SERIES_META: Record<string, { title: string; titleEn: string; author: string }> = {
  'situational-awareness': {
    title:   '形势感知：未来十年',
    titleEn: 'Situational Awareness: The Decade Ahead',
    author:  'Leopold Aschenbrenner',
  },
};

/* ── 置顶（pin to top）── 出现在「AI 报告速览」最前面，且不在日期时间轴重复 */
const PINNED_SERIES = new Set<string>(['situational-awareness']);
const PINNED_IDS    = new Set<string>([]); // 置顶单篇文章用其 id

/* ── Feed entry types (article or collapsed series) ── */
type FeedEntry =
  | { type: 'article'; article: Article }
  | { type: 'series';  seriesSlug: string; articles: Article[] };


/* ── Helpers ── */
/** True if the article was fetched within the last 24 hours */
function isNew(article: Article): boolean {
  if (!article.fetchedAt) return false;
  return Date.now() - new Date(article.fetchedAt).getTime() < 24 * 3600 * 1000;
}

/**
 * Date key used for feed grouping = the article's FETCH date (when it appeared
 * on the site), in Beijing time. ReportFeed serves the low-frequency 报告/机构
 * boards, whose items are usually published days before we surface them (HR via
 * Google News lags badly). Grouping by publish date would bury freshly-surfaced
 * items in the past and leave "今天" perpetually empty. So these two boards group
 * by fetch date — the social/daily feeds keep publish-date grouping.
 * Fallback to publishedAt for any legacy item missing fetchedAt.
 */
function getGroupDate(article: Article): string {
  return getDateKey(article.fetchedAt ?? article.publishedAt);
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (dateKey === todayKey())     return `今天 · ${m}月${d}日`;
  if (dateKey === yesterdayKey()) return `昨天 · ${m}月${d}日`;
  return `${y}年${m}月${d}日`;
}

function formatDatePill(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (dateKey === todayKey())     return '今天';
  if (dateKey === yesterdayKey()) return '昨天';
  const thisYear = Number(todayKey().slice(0, 4));
  return Number(y) === thisYear ? `${m}月${d}日` : `${y}年${m}月`;
}

/* ── Main Component ── */
interface ReportFeedProps {
  articles: Article[];
  title?: string;
  subtitle?: string;
  showSourceFilter?: boolean;
  showAnalysis?: boolean;
  showAddButton?: boolean;
}

export function ReportFeed({
  articles: initialArticles,
  title = 'AI 报告速览',
  subtitle,
  showSourceFilter = false,
  showAnalysis = true,
  showAddButton = true,
}: ReportFeedProps) {
  const [localArticles, setLocalArticles] = useState<Article[]>(initialArticles);
  const [query, setQuery]                 = useState('');
  const [activeDate, setActiveDate]       = useState<string | null>(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [reportOnly, setReportOnly]       = useState(false);
  const feedRef    = useRef<HTMLDivElement>(null);
  const dateNavRef = useRef<HTMLDivElement>(null);

  /* Unique sources present in articles (for filter chips) */
  const uniqueSources = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; color: string; abbr: string }[] = [];
    for (const a of localArticles) {
      if (!seen.has(a.source)) {
        seen.add(a.source);
        const meta = SOURCE_META[a.source] ?? { color: '#6b7280', abbr: a.source.slice(0, 2) };
        list.push({ id: a.source, ...meta });
      }
    }
    return list;
  }, [localArticles]);

  /* Subtitle: dynamic source list when showSourceFilter is true */
  const resolvedSubtitle = useMemo(() => {
    if (subtitle !== undefined) return subtitle;
    if (!showSourceFilter) return '· Anthropic · OpenAI';
    return uniqueSources.map((s) => `· ${s.id}`).join(' ');
  }, [subtitle, showSourceFilter, uniqueSources]);

  /* Called by AddReportModal when a new article is ready */
  const handleArticleAdded = useCallback((article: Article) => {
    setLocalArticles((prev) => {
      // If URL already existed, it's already in the list — no-op
      if (prev.find((a) => a.id === article.id)) return prev;
      return [article, ...prev];
    });
  }, []);

  /* Called when contentMd is generated for an existing article */
  const handleAnalysisGenerated = useCallback((id: string, contentMd: string, slug: string) => {
    setLocalArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, contentMd, slug } : a))
    );
  }, []);

  /* Count of Report-type articles (used in chip label) */
  const reportCount = useMemo(
    () => localArticles.filter((a) => a.docType === 'Report').length,
    [localArticles]
  );

  /* Fuse instance — rebuilt only when localArticles changes */
  const fuse = useMemo(
    () =>
      new Fuse(localArticles, {
        keys: [
          { name: 'titleZh',    weight: 0.4 },
          { name: 'titleEn',    weight: 0.3 },
          { name: 'abstractZh', weight: 0.2 },
          { name: 'abstractEn', weight: 0.05 },
          { name: 'source',     weight: 0.05 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [localArticles],
  );

  const filtered = useMemo(() => {
    let list = localArticles;
    if (reportOnly)     list = list.filter((a) => a.docType === 'Report');
    if (selectedSource) list = list.filter((a) => a.source === selectedSource);
    if (!query.trim()) return list;
    // Run Fuse on full article set first, then apply active filters to preserve correct counts
    const matched = new Set(fuse.search(query).map((r) => r.item.id));
    return list.filter((a) => matched.has(a.id));
  }, [localArticles, fuse, query, selectedSource, reportOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of filtered) {
      const key = getGroupDate(a);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

  // Pre-build feed entries — global series grouping (chapters may span date groups)
  const groupedEntries = useMemo(() => {
    // 1. Collect all series articles globally
    const seriesMap = new Map<string, Article[]>();
    for (const a of filtered) {
      if (a.seriesSlug) {
        const arr = seriesMap.get(a.seriesSlug) ?? [];
        arr.push(a);
        seriesMap.set(a.seriesSlug, arr);
      }
    }

    // 2. Determine the anchor date for each series (earliest chapter by seriesOrder)
    const seriesAnchorDate = new Map<string, string>();
    for (const [slug, articles] of seriesMap.entries()) {
      const sorted = [...articles].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
      seriesAnchorDate.set(slug, getGroupDate(sorted[0]));
      seriesMap.set(slug, sorted);
    }

    // 3. Build per-date entries, emitting series card once at its anchor date
    const seriesEmitted = new Set<string>();
    const map = new Map<string, FeedEntry[]>();

    for (const [key, items] of grouped.entries()) {
      const entries: FeedEntry[] = [];
      for (const a of items) {
        if (a.seriesSlug) {
          if (PINNED_SERIES.has(a.seriesSlug)) continue; // 置顶系列 → 不在时间轴重复
          const anchorDate = seriesAnchorDate.get(a.seriesSlug);
          if (!seriesEmitted.has(a.seriesSlug) && anchorDate === key) {
            entries.push({ type: 'series', seriesSlug: a.seriesSlug, articles: seriesMap.get(a.seriesSlug)! });
            seriesEmitted.add(a.seriesSlug);
          }
          // Individual chapter articles are always skipped (shown inside series card)
        } else if (PINNED_IDS.has(a.id)) {
          continue; // 置顶单篇 → 不在时间轴重复
        } else {
          entries.push({ type: 'article', article: a });
        }
      }
      if (entries.length > 0) map.set(key, entries);
    }
    return map;
  }, [filtered, grouped]);

  // ── Pinned (置顶) entries — rendered above the timeline ──
  const pinnedEntries = useMemo(() => {
    const out: FeedEntry[] = [];
    const seriesMap = new Map<string, Article[]>();
    for (const a of filtered) {
      if (a.seriesSlug && PINNED_SERIES.has(a.seriesSlug)) {
        const arr = seriesMap.get(a.seriesSlug) ?? [];
        arr.push(a);
        seriesMap.set(a.seriesSlug, arr);
      }
    }
    // preserve PINNED_SERIES order
    for (const slug of PINNED_SERIES) {
      const arts = seriesMap.get(slug);
      if (arts?.length) {
        out.push({ type: 'series', seriesSlug: slug, articles: [...arts].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0)) });
      }
    }
    for (const a of filtered) {
      if (!a.seriesSlug && PINNED_IDS.has(a.id)) out.push({ type: 'article', article: a });
    }
    return out;
  }, [filtered]);

  /* IntersectionObserver — highlight active date in nav strip */
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || dateKeys.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveDate(visible[0].target.id.replace('rdate-', ''));
        }
      },
      { root: feed, threshold: 0.1, rootMargin: '-10% 0px -70% 0px' },
    );
    dateKeys.forEach((key) => {
      const el = document.getElementById(`rdate-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [dateKeys]);

  /* Scroll active pill into view */
  useEffect(() => {
    if (!activeDate || !dateNavRef.current) return;
    const pill = dateNavRef.current.querySelector(`[data-date="${activeDate}"]`) as HTMLElement | null;
    if (pill) pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeDate]);

  function jumpToDate(dateKey: string) {
    const el = document.getElementById(`rdate-${dateKey}`);
    if (!el) return;
    const feed = feedRef.current;
    // Desktop: .feed scrolls internally. Mobile: the page (window) scrolls —
    // .appContent is overflow:visible there, so .feed isn't a scroll container
    // and feed.scrollTo() is a no-op. Detect which element actually scrolls.
    if (feed && feed.scrollHeight - feed.clientHeight > 4) {
      const feedRect = feed.getBoundingClientRect();
      const elRect   = el.getBoundingClientRect();
      feed.scrollTo({ top: feed.scrollTop + (elRect.top - feedRect.top) - 16, behavior: 'smooth' });
    } else {
      const top = window.scrollY + el.getBoundingClientRect().top - 64;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  return (
    <div className={styles.root}>
      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div>
          <span className={styles.topbarTitle}>{title}</span>
          {resolvedSubtitle && (
            <span className={styles.topbarSub}>{resolvedSubtitle}</span>
          )}
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.topbarCount}>{filtered.length} 篇</span>
          {showAddButton && !IS_PUBLIC && (
            <button
              className={styles.addReportBtn}
              onClick={() => setShowAddModal(true)}
              title="添加报告"
            >
              + 添加报告
            </button>
          )}
        </div>
      </div>

      {/* ── Add Report Modal ── */}
      {showAddModal && (
        <AddReportModal
          onClose={() => setShowAddModal(false)}
          onArticleAdded={handleArticleAdded}
          onAnalysisGenerated={handleAnalysisGenerated}
        />
      )}

      {/* ── Search + date nav ── */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索报告、关键词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.searchClear} onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        {/* ── Source filter chips (orgs page only) ── */}
        {showSourceFilter && uniqueSources.length > 0 && (
          <div className={styles.sourceFilter}>
            {/* "仅报告" toggle chip — shown first, visually distinct */}
            <button
              className={`${styles.reportFilterChip} ${reportOnly ? styles.reportFilterChipActive : ''}`}
              onClick={() => { setReportOnly((v) => !v); setSelectedSource(null); }}
              title="只显示已发布的报告"
            >
              📄 仅报告
              <span className={styles.sourceChipCount}>{reportCount}</span>
            </button>

            {/* Divider */}
            <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--border-strong)', fontSize: 16, userSelect: 'none', margin: '0 2px' }}>|</span>

            <button
              className={`${styles.sourceChip} ${!selectedSource && !reportOnly ? styles.sourceChipAll : ''}`}
              onClick={() => { setSelectedSource(null); setReportOnly(false); }}
            >
              全部
              <span className={styles.sourceChipCount}>{localArticles.length}</span>
            </button>
            {uniqueSources.map((s) => {
              const count = localArticles.filter((a) => a.source === s.id).length;
              const isActive = selectedSource === s.id;
              return (
                <button
                  key={s.id}
                  className={`${styles.sourceChip} ${isActive ? styles.sourceChipActive : ''}`}
                  style={isActive ? { borderColor: s.color, background: `${s.color}18`, color: s.color } : {}}
                  onClick={() => { setSelectedSource(isActive ? null : s.id); setReportOnly(false); }}
                >
                  <span className={styles.sourceChipDot} style={{ background: s.color }} />
                  {s.id}
                  <span className={styles.sourceChipCount}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {dateKeys.length > 1 && (
          <div className={styles.dateNav} ref={dateNavRef}>
            {dateKeys.map((key) => (
              <button
                key={key}
                data-date={key}
                className={`${styles.datePill}${activeDate === key ? ' ' + styles.datePillActive : ''}`}
                onClick={() => jumpToDate(key)}
              >
                {formatDatePill(key)}
                <span className={styles.datePillCount}>{grouped.get(key)!.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      <div className={styles.feed} ref={feedRef}>
        {localArticles.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <p>暂无报告数据</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>没有匹配的内容</div>
        ) : (
          <>
          {pinnedEntries.length > 0 && (
            <section className={styles.pinnedSection}>
              <div className={styles.pinnedLabel}>📌 置顶</div>
              {pinnedEntries.map((entry) => (
                <div
                  key={entry.type === 'series' ? `pin-series:${entry.seriesSlug}` : `pin:${entry.article.id}`}
                  className={styles.feedItem}
                >
                  <div className={styles.connectorCol}>
                    <div className={`${styles.connectorDot} ${styles.connectorDotPinned}`} />
                    <div className={styles.connectorLine} />
                  </div>
                  {entry.type === 'series' ? (
                    <SeriesCard seriesSlug={entry.seriesSlug} articles={entry.articles} />
                  ) : (
                    <ReportCard
                      article={entry.article}
                      showAnalysis={showAnalysis}
                      onAnalysisGenerated={handleAnalysisGenerated}
                    />
                  )}
                </div>
              ))}
            </section>
          )}
          {[...groupedEntries.entries()].map(([dateKey, entries]) => (
            <section key={dateKey} id={`rdate-${dateKey}`}>
              <div className={styles.dateDivider}>
                {formatDateLabel(dateKey)}
              </div>

              {entries.map((entry) => (
                <div
                  key={entry.type === 'series' ? `series:${entry.seriesSlug}` : entry.article.id}
                  className={styles.feedItem}
                >
                  <div className={styles.connectorCol}>
                    <div className={styles.connectorDot} />
                    <div className={styles.connectorLine} />
                  </div>
                  {entry.type === 'series' ? (
                    <SeriesCard seriesSlug={entry.seriesSlug} articles={entry.articles} />
                  ) : (
                    <ReportCard
                      article={entry.article}
                      showAnalysis={showAnalysis}
                      onAnalysisGenerated={handleAnalysisGenerated}
                    />
                  )}
                </div>
              ))}
            </section>
          ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Series Card ── */
function SeriesCard({ seriesSlug, articles }: { seriesSlug: string; articles: Article[] }) {
  const meta      = SERIES_META[seriesSlug];
  const source    = articles[0]?.source ?? seriesSlug;
  const color     = SOURCE_META[source]?.color ?? '#6366f1';
  const hasNew    = articles.some(isNew);

  // Chapter number labels in order
  const CHAPTER_LABELS = ['序章', 'I', 'II', 'IIIa', 'IIIb', 'IIIc', 'IV', 'V', '尾声'];

  const totalChars = articles.reduce((sum, a) => sum + (a.contentMd?.length ?? 0), 0);
  const firstSlug  = articles[0]?.slug;

  return (
    <div className={styles.seriesCard} style={{ borderColor: `${color}55` }}>
      {/* Badge */}
      <div className={styles.seriesBadge} style={{ color, background: `${color}18` }}>
        <span className={styles.seriesAbbr} style={{ background: color }}>
          {SOURCE_META[source]?.abbr ?? 'S'}
        </span>
        系列报告 · {articles.length} 章
        {hasNew && <span className={styles.newBadge} style={{ marginLeft: '6px' }}>新</span>}
      </div>

      {/* Title */}
      <div className={styles.seriesTitle}>
        {meta?.title ?? source}
      </div>
      {meta?.titleEn && (
        <div className={styles.seriesTitleEn}>{meta.titleEn}</div>
      )}
      <div className={styles.seriesAuthor}>
        {meta?.author ?? ''} · 中文精译
      </div>

      {/* Divider */}
      <div className={styles.seriesDivider} />

      {/* Chapter list */}
      <div className={styles.chapterList}>
        {articles.map((a, i) => {
          const chTitle = a.titleZh ?? a.titleEn;
          const label   = CHAPTER_LABELS[i] ?? String(i + 1);
          const href    = a.slug ? `/articles/${a.slug}` : a.sourceUrl;
          const isExt   = !a.slug;
          return (
            <a
              key={a.id}
              href={href}
              target={isExt ? '_blank' : undefined}
              rel={isExt ? 'noopener noreferrer' : undefined}
              className={styles.chapterItem}
            >
              <span className={styles.chapterNum}>{label}</span>
              <span className={styles.chapterName}>{chTitle}</span>
              <span className={styles.chapterArrow}>›</span>
            </a>
          );
        })}
      </div>

      {/* Footer */}
      <div className={styles.seriesFooter}>
        <span className={styles.seriesFooterLeft}>
          全文约 {Math.round(totalChars / 10000 * 10) / 10} 万字
        </span>
        {firstSlug && (
          <a href={`/articles/${firstSlug}`} className={styles.seriesReadBtn} style={{ color }}>
            从头阅读 →
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Report Card ── */
function ReportCard({
  article: a,
  showAnalysis = true,
  onAnalysisGenerated,
}: {
  article: Article;
  showAnalysis?: boolean;
  onAnalysisGenerated?: (id: string, contentMd: string, slug: string) => void;
}) {
  const meta     = SOURCE_META[a.source] ?? { color: '#6b7280', abbr: a.source.slice(0, 2) };
  const title    = a.titleZh ?? a.titleEn;
  const abstract = a.abstractZh ?? a.abstractEn ?? '';

  const [genState, setGenState] = useState<'idle' | 'loading' | 'done'>(
    a.contentMd ? 'done' : 'idle'
  );
  const [slug, setSlug] = useState<string>(a.slug);
  // Card click → the 解读 detail page when it exists; otherwise the original source.
  const detailHref = genState === 'done' && slug ? `/articles/${slug}` : null;

  async function handleGenerate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (genState !== 'idle') return;
    setGenState('loading');
    try {
      const res = await fetch('/api/generate-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      });
      const data = await res.json();
      if (data.success) {
        setSlug(data.slug);
        setGenState('done');
        onAnalysisGenerated?.(a.id, data.contentMd ?? '', data.slug);
      } else {
        console.error('[generate-analysis]', data.error);
        setGenState('idle');
      }
    } catch (err) {
      console.error('[generate-analysis]', err);
      setGenState('idle');
    }
  }

  return (
    <div className={styles.card}>
      <a
        href={detailHref ?? a.sourceUrl}
        target={detailHref ? undefined : '_blank'}
        rel={detailHref ? undefined : 'noopener noreferrer'}
        className={styles.cardLink}
        aria-label={title}
      />

      {/* Source tag + date + action button */}
      <div className={styles.cardMeta}>
        <span
          className={styles.sourceTag}
          style={{ color: meta.color, background: `${meta.color}18` }}
        >
          <span className={styles.sourceAbbr} style={{ background: meta.color }}>{meta.abbr}</span>
          {a.source}
        </span>
        {a.docType === 'Report' && <span className={styles.reportBadge}>报告</span>}
        {(a.addedManually || a.id?.startsWith('manual:')) && (
          <span className={styles.manualBadge}>手动添加</span>
        )}
        {isNew(a) && <span className={styles.newBadge}>新</span>}
        <span className={styles.cardDate}>{getDateKey(a.publishedAt)}</span>

        {/* Action button — sits above the stretched cardLink via z-index */}
        {showAnalysis && (
          <span className={styles.cardAction}>
            {genState === 'done' ? (
              <a
                href={a.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.actionBtn} ${styles.actionBtnView}`}
                onClick={(e) => e.stopPropagation()}
              >
                查看原文 →
              </a>
            ) : !IS_PUBLIC ? (
              <button
                className={`${styles.actionBtn} ${styles.actionBtnGen} ${genState === 'loading' ? styles.actionBtnLoading : ''}`}
                onClick={handleGenerate}
                disabled={genState === 'loading'}
              >
                {genState === 'loading' ? (
                  <>
                    <span className={styles.spinner} />
                    生成中…
                  </>
                ) : (
                  '生成解读'
                )}
              </button>
            ) : null}
          </span>
        )}
      </div>

      {/* Title */}
      <div className={styles.cardTitle}>{title}</div>
      {a.titleZh && (
        <div className={styles.cardTitleEn}>{a.titleEn}</div>
      )}

      {/* Abstract */}
      {abstract && (
        <div className={styles.cardAbstract}>{abstract}</div>
      )}
    </div>
  );
}

/* ── Add Report Modal ── */
type AddStep = 'idle' | 'adding' | 'generating' | 'done' | 'error';

function AddReportModal({
  onClose,
  onArticleAdded,
  onAnalysisGenerated,
}: {
  onClose: () => void;
  onArticleAdded: (article: Article) => void;
  onAnalysisGenerated: (id: string, contentMd: string, slug: string) => void;
}) {
  const [url, setUrl]         = useState('');
  const [step, setStep]       = useState<AddStep>('idle');
  const [errorMsg, setError]  = useState('');
  const [statusMsg, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Close on Escape */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  async function doAdd(withAnalysis: boolean) {
    const trimmed = url.trim();
    if (!trimmed) { setError('请输入文章链接'); return; }
    if (!/^https?:\/\//.test(trimmed)) { setError('链接须以 http:// 或 https:// 开头'); return; }

    setError('');
    setStep('adding');
    setStatus('正在获取文章信息…');

    // Step 1: add-report
    let article: Article;
    try {
      const res  = await fetch('/api/add-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? '获取文章信息失败');
        setStep('error');
        return;
      }
      article = data.article as Article;
      onArticleAdded(article);
    } catch {
      setError('网络错误，请重试');
      setStep('error');
      return;
    }

    if (!withAnalysis) {
      setStep('done');
      onClose();
      return;
    }

    // Step 2: generate-analysis
    setStep('generating');
    setStatus('正在生成解读（约需 30-60 秒）…');
    try {
      const res  = await fetch('/api/generate-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id }),
      });
      const data = await res.json();
      if (data.success) {
        onAnalysisGenerated(article.id, data.contentMd ?? '', data.slug);
      } else {
        // Non-fatal — card already added, just analysis failed
        console.error('[generate-analysis]', data.error);
      }
    } catch (err) {
      console.error('[generate-analysis]', err);
    }

    setStep('done');
    onClose();
  }

  const busy = step === 'adding' || step === 'generating';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>添加报告</span>
          <button className={styles.modalClose} onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <p className={styles.modalHint}>粘贴文章链接，自动获取标题和简介</p>

        <input
          ref={inputRef}
          className={styles.modalInput}
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) doAdd(false); }}
          disabled={busy}
        />

        {errorMsg && <p className={styles.modalError}>{errorMsg}</p>}
        {busy && <p className={styles.modalStatus}><span className={styles.spinner} /> {statusMsg}</p>}

        <div className={styles.modalActions}>
          <button
            className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
            onClick={() => doAdd(false)}
            disabled={busy}
          >
            生成卡片
          </button>
          <button
            className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
            onClick={() => doAdd(true)}
            disabled={busy}
          >
            生成卡片并解读
          </button>
        </div>
      </div>
    </div>
  );
}
