'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { Article } from '../types/article';
import { SOCIAL_SOURCES } from '../lib/sources-config';
import { getDateKey, todayKey, yesterdayKey } from '../lib/date';
import styles from './SocialFeed.module.css';

/* ── Derive source meta from config ── */
const SOURCE_COLOR: Record<string, string> = {};
const SOURCE_ABBR:  Record<string, string> = {};
for (const s of SOCIAL_SOURCES) {
  SOURCE_COLOR[s.id] = s.avatarColor;
  SOURCE_ABBR[s.id]  = s.abbr;
}

/** True if the article was fetched within the last 24 hours */
function isNew(article: SocialItem): boolean {
  if (!article.fetchedAt) return false;
  return Date.now() - new Date(article.fetchedAt).getTime() < 24 * 3600 * 1000;
}

/* ── Helpers ── */
/**
 * Date key used for feed grouping = the post's PUBLISH date (not fetch date),
 * in Beijing time. The green "新" badge still uses fetchedAt to flag freshly
 * discovered items.
 */
function getGroupDate(article: SocialItem): string {
  return getDateKey(article.publishedAt);
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (dateKey === todayKey())     return `今天 · ${m}月${d}日`;
  if (dateKey === yesterdayKey()) return `昨天 · ${m}月${d}日`;
  return `${y}年${m}月${d}日`;
}

function formatDatePill(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  if (dateKey === todayKey())     return '今天';
  if (dateKey === yesterdayKey()) return '昨天';
  return `${m}月${d}日`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ── Types ── */
// Only the fields a social card actually renders. The page projects full
// Article rows down to this before passing them in, so the static HTML payload
// drops contentMd/abstracts/tags/etc. — /social was 4.8MB of inlined data.
export type SocialItem = Pick<
  Article,
  'id' | 'source' | 'sourceUrl' | 'titleEn' | 'titleZh' | 'publishedAt' | 'fetchedAt' | 'score' | 'commentCount' | 'commentUrl'
>;
interface Props { articles: SocialItem[]; view?: string; archiveHref?: string }

/* ── Main Component ── */
export function SocialFeed({ articles, archiveHref }: Props) {
  const [query, setQuery]       = useState('');
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const feedRef    = useRef<HTMLDivElement>(null);
  const dateNavRef = useRef<HTMLDivElement>(null);

  /* Fuse instance — rebuilt only when articles array changes */
  const fuse = useMemo(
    () =>
      new Fuse(articles, {
        keys: [
          { name: 'titleZh',  weight: 0.5 },
          { name: 'titleEn',  weight: 0.4 },
          { name: 'source',   weight: 0.1 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [articles],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return articles;
    return fuse.search(query).map((r) => r.item);
  }, [articles, fuse, query]);

  /* Group by date */
  const grouped = useMemo(() => {
    const map = new Map<string, SocialItem[]>();
    for (const a of filtered) {
      const key = getGroupDate(a);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    // Re-sort each group's articles by publishedAt desc
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      map.set(k, arr);
    }
    // Sort map entries by dateKey desc
    return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [filtered]);

  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

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
          setActiveDate(visible[0].target.id.replace('sdate-', ''));
        }
      },
      { root: feed, threshold: 0.1, rootMargin: '-10% 0px -70% 0px' },
    );
    dateKeys.forEach((key) => {
      const el = document.getElementById(`sdate-${key}`);
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
    const el = document.getElementById(`sdate-${dateKey}`);
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
          <span className={styles.topbarTitle}>精选热点</span>
          <span className={styles.topbarSub}>· 各平台 AI 热点聚合</span>
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.topbarCount}>{filtered.length} 条</span>
        </div>
      </div>

      {/* ── Search + date nav ── */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索热点、信源、关键词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.searchClear} onClick={() => setQuery('')}>✕</button>
          )}
        </div>

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
        {articles.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>◎</div>
            <p>暂无社交动态</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Pipeline 尚未从社交信源获取到数据，请稍后重新运行。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>没有匹配的内容</div>
        ) : (
          [...grouped.entries()].map(([dateKey, items]) => (
            <section key={dateKey} id={`sdate-${dateKey}`}>
              {/* Date divider */}
              <div className={styles.dateDivider}>
                {formatDateLabel(dateKey)}
              </div>

              {/* Timeline rows */}
              {items.map((a) => (
                <div key={a.id} className={styles.feedItem}>
                  {/* Time column */}
                  <div className={styles.timelineCol}>
                    <span className={styles.timelineTime}>{formatTime(a.publishedAt)}</span>
                  </div>

                  {/* Connector column */}
                  <div className={styles.connectorCol}>
                    <div className={styles.connectorDot} />
                    <div className={styles.connectorLine} />
                  </div>

                  {/* Card */}
                  <SocialCard article={a} />
                </div>
              ))}
            </section>
          ))
        )}

        {archiveHref && filtered.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
            <Link
              href={archiveHref}
              style={{
                display: 'inline-block',
                fontSize: 13,
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '7px 18px',
                textDecoration: 'none',
              }}
            >
              查看全部历史 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Social Card ── */
// Stretched-link pattern: outer div is position:relative,
// cardLink (<a>) is position:absolute inset-0 — covers the full card.
// discussLink uses position:relative z-index:1 to sit above the stretched link.
// This avoids any <a> nesting while keeping proper anchor semantics.
function SocialCard({ article: a }: { article: SocialItem }) {
  const color = SOURCE_COLOR[a.source] ?? '#6b7280';
  const abbr  = SOURCE_ABBR[a.source]  ?? a.source.slice(0, 2);
  const title = a.titleZh ?? a.titleEn;

  return (
    <div className={styles.card}>
      {/* Stretched invisible link covers the whole card */}
      <a
        href={a.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cardLink}
        aria-label={title}
      />

      {/* Source + stats row */}
      <div className={styles.cardMeta}>
        <span className={styles.sourceTag} style={{ color, background: `${color}18` }}>
          <span className={styles.sourceAbbr} style={{ background: color }}>{abbr}</span>
          {a.source}
        </span>
        {isNew(a) && <span className={styles.newBadge}>新</span>}
        {(a.score ?? 0) > 0 && (
          <span className={styles.stat}>▲ {a.score}</span>
        )}
        {(a.commentCount ?? 0) > 0 && (
          <span className={styles.stat}>💬 {a.commentCount}</span>
        )}
        {a.commentUrl && a.commentUrl !== a.sourceUrl && (
          // position:relative + z-index sits above the stretched cardLink
          <a
            href={a.commentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.discussLink}
          >
            查看讨论 →
          </a>
        )}
      </div>

      {/* Title */}
      <div className={styles.cardTitle}>{title}</div>
      {a.titleZh && a.titleEn !== title && (
        <div className={styles.cardTitleEn}>{a.titleEn}</div>
      )}
    </div>
  );
}
