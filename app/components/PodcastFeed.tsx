'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Article } from '../types/article';
import styles from './PodcastFeed.module.css';

type Episode = Article & { duration?: string | null; contentMd?: string };

const ALL_SOURCES = ['全部', 'Lex Fridman Podcast'] as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function EpisodeCard({ ep }: { ep: Episode }) {
  const title        = ep.titleZh ?? ep.titleEn;
  const excerpt      = (ep.abstractZh ?? ep.abstractEn ?? '').trim().slice(0, 120);
  const showEngTitle = ep.titleZh && ep.titleEn && ep.titleZh !== ep.titleEn;
  const hasAnalysis  = !!ep.contentMd;

  return (
    <div className={styles.card}>
      {ep.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ep.thumbnail} alt="" className={styles.cardThumb} />
      )}

      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>{title}</div>
        {showEngTitle && (
          <div className={styles.cardTitleEn}>{ep.titleEn}</div>
        )}
        <div className={styles.cardMeta}>
          <span className={styles.sourceBadge}>🎙️ Lex Fridman Podcast</span>
          {ep.duration && (
            <span className={styles.cardDuration}>⏱ {ep.duration}</span>
          )}
          <span className={styles.cardDate}>{formatDate(ep.publishedAt)}</span>
        </div>
        {excerpt && <p className={styles.cardExcerpt}>{excerpt}</p>}

        {/* Action buttons */}
        <div className={styles.cardActions}>
          {hasAnalysis && ep.slug && (
            <Link href={`/podcast/${ep.slug}`} className={styles.btnAnalysis}>
              📖 查看解读
            </Link>
          )}
          <a
            href={ep.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnListen}
          >
            收听原版 →
          </a>
        </div>
      </div>
    </div>
  );
}

interface PodcastFeedProps {
  episodes: Episode[];
}

export function PodcastFeed({ episodes }: PodcastFeedProps) {
  const [activeSource, setSource] = useState<string>('全部');

  const filtered = useMemo(() => {
    if (activeSource === '全部') return episodes;
    return episodes.filter((e) => e.source === activeSource);
  }, [episodes, activeSource]);

  const counts: Record<string, number> = useMemo(() => ({
    '全部': episodes.length,
    'Lex Fridman Podcast': episodes.filter((e) => e.source === 'Lex Fridman Podcast').length,
  }), [episodes]);

  const analysedCount = episodes.filter((e) => e.contentMd).length;

  return (
    <div className={styles.root}>

      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <span className={styles.title}>🎙️ 顶级播客</span>
          <span className={styles.sub}>· AI 领域精选播客集</span>
          {analysedCount > 0 && (
            <span className={styles.analysedBadge}>{analysedCount} 篇解读</span>
          )}
        </div>
        <div className={styles.filters}>
          {ALL_SOURCES.map((s) => (
            <button
              key={s}
              className={`${styles.filterBtn} ${activeSource === s ? styles.filterActive : ''}`}
              onClick={() => setSource(s)}
            >
              {s}
              {counts[s] > 0 && (
                <span className={styles.filterCount}>{counts[s]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎙️</div>
            <p className={styles.emptyText}>暂无播客数据</p>
            <p className={styles.emptySub}>
              运行 <code>node scripts/podcast-pipeline.js</code> 抓取最新单集
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {filtered.map((ep) => (
              <EpisodeCard key={ep.id} ep={ep} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
