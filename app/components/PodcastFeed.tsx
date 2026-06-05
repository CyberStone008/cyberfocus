'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Article } from '../types/article';
import { getDateKey, todayKey, yesterdayKey, daysAgoFromKey } from '../lib/date';
import styles from './PodcastFeed.module.css';

type Episode = Article & { duration?: string | null; contentMd?: string };

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
  const excerpt      = (ep.abstractZh ?? ep.abstractEn ?? '').trim().slice(0, 140);
  const hasAnalysis  = !!ep.contentMd && !!ep.slug;

  return (
    <div className={styles.card}>
      {/* Invisible stretched link for the whole card */}
      <a
        href={ep.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.cardLink}
        aria-label={title}
      />

      {/* Meta row */}
      <div className={styles.cardMeta}>
        <span className={styles.sourceTag}>
          <span className={styles.sourceAbbr}>Lx</span>
          {ep.source}
        </span>
        {ep.duration && (
          <span className={styles.durationBadge}>⏱ {ep.duration}</span>
        )}
        <span className={styles.cardDate}>{getDateKey(ep.publishedAt)}</span>

        {/* Action buttons — sit above the stretched link */}
        <span className={styles.cardActions}>
          {hasAnalysis ? (
            <Link
              href={`/podcast/${ep.slug}`}
              className={`${styles.actionBtn} ${styles.actionBtnView}`}
              onClick={(e) => e.stopPropagation()}
            >
              查看解读 →
            </Link>
          ) : (
            <a
              href={ep.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.actionBtn} ${styles.actionBtnListen}`}
              onClick={(e) => e.stopPropagation()}
            >
              收听原版 →
            </a>
          )}
        </span>
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
          <span className={styles.title}>🎙️ 顶级播客</span>
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
