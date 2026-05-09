'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Article } from '../types/article';
import { FeedCard } from './FeedCard';
import styles from './FeedList.module.css';

const SOURCES = ['Anthropic Blog', 'OpenAI Blog', 'arXiv cs.AI', 'HuggingFace Daily'];
const DOC_TYPES = ['Paper', 'Blog', 'Report'];
const TIME_OPTIONS = [
  { label: '今天',    value: 'today' },
  { label: '近 7 天', value: '7d'   },
  { label: '近 30 天',value: '30d'  },
  { label: '全部',    value: 'all'  },
];

type FilterKey = 'source' | 'docType' | 'time';
type ActiveFilters = Record<FilterKey, string | null>;

const STORAGE_KEY = 'feedFilters';

function loadSavedFilters(): ActiveFilters {
  if (typeof window === 'undefined') return { source: null, docType: null, time: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { source: null, docType: null, time: null };
    return JSON.parse(raw);
  } catch {
    return { source: null, docType: null, time: null };
  }
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return `今天 · ${d.getMonth() + 1}月${d.getDate()}日`;
  if (diffDays === 1) return `昨天 · ${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDatePill(dateKey: string) {
  const [, m, d] = dateKey.split('-');
  const now = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateKey === now) return '今天';
  if (dateKey === yesterday) return '昨天';
  return `${parseInt(m)}月${parseInt(d)}日`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDateKey(iso: string) {
  return iso.slice(0, 10);
}

function matchesTime(iso: string, filter: string | null) {
  if (!filter || filter === 'all') return true;
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (filter === 'today') return diffMs < 86400000;
  if (filter === '7d')   return diffMs < 7 * 86400000;
  if (filter === '30d')  return diffMs < 30 * 86400000;
  return true;
}

interface FeedListProps {
  articles: Article[];
  title?: string;
  subtitle?: string;
}

export function FeedList({ articles, title = '精选', subtitle = '今日 AI 动态' }: FeedListProps) {
  const [query, setQuery]     = useState('');
  const [filters, setFilters] = useState<ActiveFilters>({ source: null, docType: null, time: null });
  const [openMenu, setOpenMenu] = useState<FilterKey | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const feedRef   = useRef<HTMLDivElement>(null);
  const dateNavRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setFilters(loadSavedFilters());
  }, []);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return articles.filter((a) => {
      if (q) {
        const haystack = ((a.titleZh ?? '') + ' ' + (a.titleEn ?? '') + ' ' + (a.abstractZh ?? '') + ' ' + a.source).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.source  && a.source  !== filters.source)  return false;
      if (filters.docType && a.docType !== filters.docType)  return false;
      if (!matchesTime(a.publishedAt, filters.time))         return false;
      return true;
    });
  }, [articles, query, filters]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of filtered) {
      const key = getDateKey(a.publishedAt);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

  // IntersectionObserver — track which date section is in view
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || dateKeys.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveDate(visible[0].target.id.replace('date-', ''));
        }
      },
      { root: feed, threshold: 0.1, rootMargin: '-20% 0px -60% 0px' },
    );

    dateKeys.forEach((key) => {
      const el = document.getElementById(`date-${key}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [dateKeys]);

  // Scroll active date pill into view in the nav strip
  useEffect(() => {
    if (!activeDate || !dateNavRef.current) return;
    const pill = dateNavRef.current.querySelector(`[data-date="${activeDate}"]`) as HTMLElement | null;
    if (pill) pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeDate]);

  function setFilter(key: FilterKey, value: string) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
    setOpenMenu(null);
  }

  function removeFilter(key: FilterKey) {
    setFilters((prev) => ({ ...prev, [key]: null }));
  }

  function toggleMenu(key: FilterKey) {
    setOpenMenu((prev) => (prev === key ? null : key));
  }

  function jumpToDate(dateKey: string) {
    const el = document.getElementById(`date-${dateKey}`);
    const feed = feedRef.current;
    if (!el || !feed) return;
    // getBoundingClientRect gives viewport-relative coords; combining with
    // the feed's current scrollTop gives the correct intra-container offset.
    const feedRect = feed.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    const target   = feed.scrollTop + (elRect.top - feedRect.top) - 16;
    feed.scrollTo({ top: target, behavior: 'smooth' });
  }

  // Show date nav only when time filter is not 'today' and there are multiple dates
  const showDateNav = filters.time !== 'today' && dateKeys.length > 1;

  // Time label for topbar badge
  const timeLabel = filters.time
    ? (TIME_OPTIONS.find((o) => o.value === filters.time)?.label ?? '')
    : null;

  return (
    <div className={styles.root}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div>
          <span className={styles.topbarTitle}>{title}</span>
          <span className={styles.topbarSub}>· {subtitle}</span>
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.topbarCount}>{filtered.length} 篇</span>
          <button className={styles.topbarBtn} onClick={() => window.location.reload()}>↺ 刷新</button>
        </div>
      </div>

      {/* Search bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索标题、来源、关键词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.searchClear} onClick={() => setQuery('')}>✕</button>
          )}
        </div>
        <div className={styles.filterRow} onClick={() => openMenu && setOpenMenu(null)}>
          <span className={styles.filterLabel}>筛选</span>

          {/* Source */}
          <div className={styles.filterDropdown} onClick={(e) => e.stopPropagation()}>
            <button
              className={`${styles.filterBtn}${filters.source ? ' ' + styles.active : ''}${openMenu === 'source' ? ' ' + styles.open : ''}`}
              onClick={() => toggleMenu('source')}
            >
              {filters.source ?? '来源'}
              <span className={styles.filterArrow}>▾</span>
            </button>
            {openMenu === 'source' && (
              <div className={styles.filterMenu}>
                {SOURCES.map((s) => (
                  <div
                    key={s}
                    className={`${styles.filterOption}${filters.source === s ? ' ' + styles.selected : ''}`}
                    onClick={() => setFilter('source', s)}
                  >
                    <span className={styles.checkmark}>{filters.source === s ? '✓' : ''}</span>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DocType */}
          <div className={styles.filterDropdown} onClick={(e) => e.stopPropagation()}>
            <button
              className={`${styles.filterBtn}${filters.docType ? ' ' + styles.active : ''}${openMenu === 'docType' ? ' ' + styles.open : ''}`}
              onClick={() => toggleMenu('docType')}
            >
              {filters.docType ?? '类型'}
              <span className={styles.filterArrow}>▾</span>
            </button>
            {openMenu === 'docType' && (
              <div className={styles.filterMenu}>
                {DOC_TYPES.map((t) => (
                  <div
                    key={t}
                    className={`${styles.filterOption}${filters.docType === t ? ' ' + styles.selected : ''}`}
                    onClick={() => setFilter('docType', t)}
                  >
                    <span className={styles.checkmark}>{filters.docType === t ? '✓' : ''}</span>
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time */}
          <div className={styles.filterDropdown} onClick={(e) => e.stopPropagation()}>
            <button
              className={`${styles.filterBtn}${filters.time ? ' ' + styles.active : ''}${openMenu === 'time' ? ' ' + styles.open : ''}`}
              onClick={() => toggleMenu('time')}
            >
              {filters.time ? TIME_OPTIONS.find((o) => o.value === filters.time)?.label : '时间段'}
              <span className={styles.filterArrow}>▾</span>
            </button>
            {openMenu === 'time' && (
              <div className={styles.filterMenu}>
                {TIME_OPTIONS.map((o) => (
                  <div
                    key={o.value}
                    className={`${styles.filterOption}${filters.time === o.value ? ' ' + styles.selected : ''}`}
                    onClick={() => setFilter('time', o.value)}
                  >
                    <span className={styles.checkmark}>{filters.time === o.value ? '✓' : ''}</span>
                    {o.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active chips */}
          <div className={styles.chips}>
            {(Object.entries(filters) as [FilterKey, string | null][]).map(([key, val]) =>
              val ? (
                <div key={key} className={styles.chip}>
                  {key === 'time' ? (TIME_OPTIONS.find((o) => o.value === val)?.label ?? val) : val}
                  <button className={styles.chipRemove} onClick={() => removeFilter(key)}>✕</button>
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Date-jump navigation strip */}
        {showDateNav && (
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

      {/* Feed */}
      <div className={styles.feed} ref={feedRef}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◌</div>
            <div>没有符合条件的内容</div>
            <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>试试调整筛选条件或关键词</div>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([dateKey, items]) => (
            <div key={dateKey} id={`date-${dateKey}`}>
              <div className={styles.dateDivider}>
                {formatDateLabel(items[0].publishedAt)}
              </div>
              {items.map((article) => (
                <div key={article.id} className={styles.feedItem}>
                  <div className={styles.timelineCol}>
                    <span className={styles.timelineTime}>{formatTime(article.publishedAt)}</span>
                  </div>
                  <div className={styles.connectorCol}>
                    <div className={styles.connectorDot} />
                    <div className={styles.connectorLine} />
                  </div>
                  <FeedCard article={article} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
