'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import styles from './StrategyBriefFeed.module.css';

export type Brief = {
  date: string;          // YYYY-MM-DD
  narrative: string;     // 一句话叙事 preview
  wordCount: number;
  generatedAt: string;   // ISO
};

const SECTORS = [
  { emoji: '🤖', label: 'AI / 算力' },
  { emoji: '⚡', label: '电力' },
  { emoji: '💾', label: '半导体' },
  { emoji: '☁️',  label: '云 / SaaS' },
  { emoji: '🛢', label: '能源' },
];

/* ── Date label ── */
function formatDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const today = new Date();
  const ymd   = new Date(y, m - 1, d);
  const diff  = Math.floor((today.getTime() - ymd.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7)   return `${diff} 天前`;
  return y === today.getFullYear()
    ? `${m}月${d}日`
    : `${y}年${m}月${d}日`;
}

function weekdayCN(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w];
}

/* ── Brief Card ── */
function BriefCard({ brief, isLatest }: { brief: Brief; isLatest: boolean }) {
  return (
    <Link href={`/investing/${brief.date}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.briefBadge}>📈 美股策略快报</span>
          {isLatest && <span className={styles.latestBadge}>最新</span>}
        </div>
        <div className={styles.cardHeaderRight}>
          <span className={styles.dateLabel}>{formatDate(brief.date)}</span>
          <span className={styles.weekdayLabel}>· {weekdayCN(brief.date)}</span>
        </div>
      </div>

      <div className={styles.narrative}>
        {brief.narrative || '（暂无摘要）'}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.sectorList}>
          {SECTORS.map((s) => (
            <span key={s.label} className={styles.sectorChip}>
              <span className={styles.sectorEmoji}>{s.emoji}</span>
              {s.label}
            </span>
          ))}
        </div>
        <div className={styles.cardMeta}>
          <span>{brief.wordCount.toLocaleString()} 字</span>
          <span>·</span>
          <span>5-7 分钟</span>
          <span className={styles.cardArrow}>→</span>
        </div>
      </div>
    </Link>
  );
}

/* ── Main feed ── */
export function StrategyBriefFeed({ briefs }: { briefs: Brief[] }) {
  const latest = briefs[0];
  const olderBriefs = useMemo(() => briefs.slice(1), [briefs]);

  return (
    <div className={styles.root}>
      {/* Topbar & sub-nav now live in <InvestingNav /> at the page level */}

      {/* Body */}
      <div className={styles.body}>
        {briefs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📊</div>
            <p className={styles.emptyText}>尚未生成策略快报</p>
            <p className={styles.emptySub}>
              定时任务 <code>us-stock-strategy-brief</code> 将自动生成首份快报
            </p>
          </div>
        ) : (
          <>
            {/* Featured: latest brief */}
            <section className={styles.section}>
              <div className={styles.sectionLabel}>📌 最新一期</div>
              <BriefCard brief={latest} isLatest />
            </section>

            {/* Historical archive */}
            {olderBriefs.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionLabel}>📚 往期归档</div>
                <div className={styles.archiveList}>
                  {olderBriefs.map((b) => (
                    <BriefCard key={b.date} brief={b} isLatest={false} />
                  ))}
                </div>
              </section>
            )}

            {/* About box */}
            <section className={styles.about}>
              <div className={styles.aboutTitle}>关于本栏目</div>
              <p className={styles.aboutText}>
                <strong>策略快报</strong>每 2 天早上 7:00（北京时间）自动生成，由 AI 综合
                {' '}<em>Apollo Slok、Goldman Sachs、JPM Cembalest、Morgan Stanley、Howard Marks</em>
                {' '}等顶级机构观点，聚焦 <strong>AI / 算力 / 电力 / 半导体 / 云 / SaaS / 能源</strong> 等
                你关注的行业，按"机构 strategist 视角"重新组织成中文简报。
              </p>
              <p className={styles.aboutText}>
                <strong>试运行周期</strong>：5/18 - 5/30 共 6-7 份样本，结束后一起评估是否保留 / 优化 / 增加（行业周报、月度深度、季度宏观）。
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
