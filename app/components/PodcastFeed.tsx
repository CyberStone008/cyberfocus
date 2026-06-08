'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Article } from '../types/article';
import { getDateKey, todayKey, yesterdayKey, daysAgoFromKey } from '../lib/date';
import styles from './PodcastFeed.module.css';

type Episode = Article & { duration?: string | null; contentMd?: string };

/* 各播客源的徽标缩写 + 颜色（未配置的源用名称首字 + 灰色兜底）。 */
const PODCAST_META: Record<string, { abbr: string; color: string }> = {
  'Lex Fridman Podcast': { abbr: 'Lx', color: '#3b82f6' },
  '张小珺商业访谈录':     { abbr: '张', color: '#ec4899' },
  'No Priors':           { abbr: 'NP', color: '#8b5cf6' },
  '硅谷101':             { abbr: '硅', color: '#10b981' },
};
function podcastMeta(source: string) {
  return PODCAST_META[source] ?? { abbr: (source ?? '·').slice(0, 2), color: '#6b7280' };
}

/* ── Date helpers (grouping in Beijing time) ── */
function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const diffDays = daysAgoFromKey(dateKey);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays > 0 && diffDays < 7) return `${diffDays} 天前`;
  const thisYear = Number(todayKey().slice(0, 4));
  return y === thisYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

function formatDatePill(dateKey: string): string {
  if (dateKey === todayKey())     return '今天';
  if (dateKey === yesterdayKey()) return '昨天';
  const [y, m, d] = dateKey.split('-').map(Number);
  const thisYear  = Number(todayKey().slice(0, 4));
  return y === thisYear ? `${m}月${d}日` : `${y}年${m}月${d}日`;
}

/* ── Episode Card ── */
function EpisodeCard({ ep }: { ep: Episode }) {
  const title        = ep.titleZh ?? ep.titleEn;
  const showEngTitle = ep.titleZh && ep.titleEn && ep.titleZh !== ep.titleEn;
  // 优先用结论先行的一句话说明（基于节目简介/解读生成），没有再退回官方简介
  const excerpt      = (ep.tldrZh ?? ep.abstractZh ?? ep.abstractEn ?? '').trim().slice(0, 160);
  const hasAnalysis  = !!ep.contentMd && !!ep.slug;
  // Card click → the 解读 detail page when it exists; otherwise the original audio.
  const detailHref   = hasAnalysis ? `/podcast/${ep.slug}` : null;
  const meta         = podcastMeta(ep.source);

  return (
    <div className={styles.card}>
      {/* Invisible stretched link for the whole card */}
      <a
        href={detailHref ?? ep.sourceUrl}
        target={detailHref ? undefined : '_blank'}
        rel={detailHref ? undefined : 'noopener noreferrer'}
        className={styles.cardLink}
        aria-label={title}
      />

      {/* Meta row */}
      <div className={styles.cardMeta}>
        <span className={styles.sourceTag} style={{ color: meta.color, background: `${meta.color}1a` }}>
          <span className={styles.sourceAbbr} style={{ background: meta.color }}>{meta.abbr}</span>
          {ep.source}
        </span>
        {ep.duration && (
          <span className={styles.durationBadge}>⏱ {ep.duration}</span>
        )}
        <span className={styles.cardDate}>{getDateKey(ep.publishedAt)}</span>
      </div>

      {/* Content */}
      <div className={styles.cardContent}>
        {ep.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ep.thumbnail} alt="" className={styles.cardThumb} />
        )}
        <div className={styles.cardText}>
          <div className={styles.cardTitle}>{title}</div>
          {showEngTitle && <div className={styles.cardTitleEn}>{ep.titleEn}</div>}
          {excerpt && <p className={styles.cardExcerpt}>{excerpt}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Main Feed ── */
interface PodcastFeedProps { episodes: Episode[] }

export function PodcastFeed({ episodes }: PodcastFeedProps) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const feedRef    = useRef<HTMLDivElement>(null);
  const dateNavRef = useRef<HTMLDivElement>(null);

  /* Group by publish date */
  const grouped = useMemo(() => {
    const map = new Map<string, Episode[]>();
    for (const ep of episodes) {
      const key = getDateKey(ep.publishedAt);
      const arr = map.get(key) ?? [];
      arr.push(ep);
      map.set(key, arr);
    }
    return map;
  }, [episodes]);

  const dateKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

  /* Scroll feed to a date section */
  const scrollToDate = useCallback((key: string) => {
    setActiveDate(key);
    const el = feedRef.current?.querySelector(`[data-date="${key}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const analysedCount = episodes.filter((e) => e.contentMd).length;

  return (
    <div className={styles.root}>

      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <span className={styles.title}>🎙️ 精选播客</span>
          <span className={styles.sub}>· AI 领域精选播客集</span>
          {analysedCount > 0 && (
            <span className={styles.analysedBadge}>{analysedCount} 篇解读</span>
          )}
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.totalCount}>{episodes.length} 集</span>
        </div>
      </div>

      {/* ── Date nav pills ── */}
      {dateKeys.length > 0 && (
        <div className={styles.dateNav} ref={dateNavRef}>
          {dateKeys.map((key) => (
            <button
              key={key}
              className={`${styles.datePill} ${activeDate === key ? styles.datePillActive : ''}`}
              onClick={() => scrollToDate(key)}
            >
              {formatDatePill(key)}
              <span className={styles.datePillCount}>{grouped.get(key)!.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Feed ── */}
      <div className={styles.feed} ref={feedRef}>
        {episodes.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎙️</div>
            <p className={styles.emptyText}>暂无播客数据</p>
            <p className={styles.emptySub}>
              运行 <code>node scripts/podcast-pipeline.js</code> 抓取最新单集
            </p>
          </div>
        ) : (
          dateKeys.map((dateKey) => (
            <div key={dateKey} data-date={dateKey}>
              {/* Date divider */}
              <div className={styles.dateDivider}>{formatDateLabel(dateKey)}</div>

              {/* Timeline items */}
              {grouped.get(dateKey)!.map((ep, i, arr) => (
                <div key={ep.id} className={styles.feedItem}>
                  <div className={styles.connectorCol}>
                    <div className={styles.connectorDot} />
                    {i < arr.length - 1 && <div className={styles.connectorLine} />}
                  </div>
                  <EpisodeCard ep={ep} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
