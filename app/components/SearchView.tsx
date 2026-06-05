'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import { getDateKey } from '../lib/date';
import styles from './SearchView.module.css';

// Minimal per-result shape — built on the server from articles.json + podcasts.json,
// projected down to just what a result row needs (no contentMd/abstracts), so the
// inlined index stays small even at a few thousand items.
export type SearchItem = {
  id: string;
  kind: string;        // 文章 / 报告 / 机构 / 社交 / 播客
  titleZh?: string | null;
  titleEn?: string | null;
  source: string;
  publishedAt: string;
  href: string;        // internal route, or external original URL
  external: boolean;
};

const KIND_COLOR: Record<string, string> = {
  报告: '#6366f1', 机构: '#0ea5e9', 社交: '#f97316', 播客: '#d97757', 文章: '#10b981',
};

export function SearchView({ index }: { index: SearchItem[] }) {
  const [q, setQ] = useState('');

  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: [
          { name: 'titleZh', weight: 0.5 },
          { name: 'titleEn', weight: 0.35 },
          { name: 'source', weight: 0.15 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [index],
  );

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return fuse.search(q).slice(0, 60).map((r) => r.item);
  }, [q, fuse]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>全站搜索</h1>
        <p className={styles.sub}>跨文章 · 报告 · 机构 · 播客，共 {index.length} 条</p>
      </div>

      <div className={styles.searchWrap}>
        <span className={styles.icon}>⌕</span>
        <input
          autoFocus
          className={styles.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题、来源、关键词…"
        />
        {q && <button className={styles.clear} onClick={() => setQ('')} aria-label="清空">✕</button>}
      </div>

      <div className={styles.results}>
        {!q.trim() ? (
          <div className={styles.empty}>输入关键词开始搜索</div>
        ) : results.length === 0 ? (
          <div className={styles.empty}>没有匹配「{q}」的内容</div>
        ) : (
          <>
            <div className={styles.count}>{results.length} 条结果{results.length === 60 ? '（仅显示前 60）' : ''}</div>
            {results.map((r) => (
              <ResultRow key={r.id} item={r} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ResultRow({ item }: { item: SearchItem }) {
  const inner = (
    <>
      <div className={styles.rowTop}>
        <span className={styles.kind} style={{ color: KIND_COLOR[item.kind] ?? 'var(--text-secondary)' }}>
          {item.kind}
        </span>
        <span className={styles.src}>{item.source}</span>
        <span className={styles.date}>{getDateKey(item.publishedAt)}</span>
        {item.external && <span className={styles.ext}>↗ 原文</span>}
      </div>
      <div className={styles.rowTitle}>{item.titleZh || item.titleEn}</div>
      {item.titleZh && item.titleEn && <div className={styles.rowEn}>{item.titleEn}</div>}
    </>
  );

  if (item.external) {
    return (
      <a className={styles.row} href={item.href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <Link className={styles.row} href={item.href}>
      {inner}
    </Link>
  );
}
