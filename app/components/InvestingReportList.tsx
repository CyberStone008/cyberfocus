'use client';

import Link from 'next/link';
import styles from './SectorReportList.module.css';

export type ListItem = {
  id: string;        // URL id (date or quarter)
  title: string;
  focus: string;
  wordCount: number;
  badge: string;     // e.g. "📰 行业周报"
  dateLabel: string; // e.g. "本周 · 5月30日" / "2026 Q2"
  readMins: string;  // e.g. "10-12 分钟"
  tags: string[];
};

interface Props {
  items: ListItem[];
  hrefPrefix: string;            // e.g. "/investing/weekly"
  empty: { icon: string; title: string; sub: string; hint?: string };
  about: { title: string; lines: string[] };
}

function Card({ item, hrefPrefix, isLatest }: { item: ListItem; hrefPrefix: string; isLatest: boolean }) {
  return (
    <Link href={`${hrefPrefix}/${item.id}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.sectorBadge}>{item.badge}</span>
          {isLatest && <span className={styles.latestBadge}>最新</span>}
        </div>
        <div className={styles.cardHeaderRight}>
          <span className={styles.dateLabel}>{item.dateLabel}</span>
        </div>
      </div>

      <h3 className={styles.cardTitle}>{item.title}</h3>
      <div className={styles.focus}>{item.focus || '（暂无摘要）'}</div>

      <div className={styles.cardFooter}>
        <div className={styles.tagList}>
          {item.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
        </div>
        <div className={styles.cardMeta}>
          <span>{item.wordCount.toLocaleString()} 字</span>
          <span>·</span>
          <span>{item.readMins}</span>
          <span className={styles.cardArrow}>→</span>
        </div>
      </div>
    </Link>
  );
}

export function InvestingReportList({ items, hrefPrefix, empty, about }: Props) {
  const latest = items[0];
  const older  = items.slice(1);

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        {items.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>{empty.icon}</div>
            <p className={styles.emptyText}>{empty.title}</p>
            <p className={styles.emptySub}>{empty.sub}</p>
            {empty.hint && <p className={styles.emptyHint}>{empty.hint}</p>}
          </div>
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionLabel}>📌 最新一期</div>
              <Card item={latest} hrefPrefix={hrefPrefix} isLatest />
            </section>

            {older.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionLabel}>📚 往期归档</div>
                <div className={styles.archiveList}>
                  {older.map((it) => <Card key={it.id} item={it} hrefPrefix={hrefPrefix} isLatest={false} />)}
                </div>
              </section>
            )}

            <section className={styles.about}>
              <div className={styles.aboutTitle}>{about.title}</div>
              {about.lines.map((l, i) => <p key={i} className={styles.aboutText}>{l}</p>)}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
