'use client';

import Link from 'next/link';
import styles from './SectorReportList.module.css';

export type SectorReport = {
  id: string;             // YYYY-MM-slug (also URL slug)
  year: number;
  month: number;
  slug: string;           // e.g., "power-datacenter"
  title: string;          // 中文 (from H1)
  focus: string;          // 一句话定调 (from blockquote)
  wordCount: number;
  generatedAt: string;
};

// Sector chip metadata
const SECTOR_META: Record<string, { emoji: string; label: string }> = {
  'power-datacenter':  { emoji: '⚡', label: '电力 / 数据中心' },
  'ai-compute':        { emoji: '🤖', label: 'AI 算力' },
  'semiconductors':    { emoji: '💾', label: '半导体' },
  'cloud-saas':        { emoji: '☁️',  label: '云 / SaaS' },
  'energy':            { emoji: '🛢', label: '能源 / 油气' },
  'ai-applications':   { emoji: '✨', label: 'AI 应用层' },
  'fintech-banks':     { emoji: '🏦', label: '金融科技 / 银行' },
  'year-review':       { emoji: '📊', label: '年度综合' },
};

function getSectorMeta(slug: string) {
  return SECTOR_META[slug] ?? { emoji: '📈', label: slug };
}

function formatMonthLabel(year: number, month: number): string {
  const today = new Date();
  const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  if (isThisMonth) return `本月 · ${year}年${month}月`;
  return `${year}年${month}月`;
}

/* ── Report Card ── */
function ReportCard({ report, isLatest }: { report: SectorReport; isLatest: boolean }) {
  const meta = getSectorMeta(report.slug);

  return (
    <Link href={`/investing/sectors/${report.id}`} className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={styles.sectorBadge}>
            <span className={styles.sectorEmoji}>{meta.emoji}</span>
            {meta.label}
          </span>
          {isLatest && <span className={styles.latestBadge}>最新</span>}
        </div>
        <div className={styles.cardHeaderRight}>
          <span className={styles.dateLabel}>{formatMonthLabel(report.year, report.month)}</span>
        </div>
      </div>

      <h3 className={styles.cardTitle}>{report.title}</h3>

      <div className={styles.focus}>
        {report.focus || '（暂无摘要）'}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.tagList}>
          <span className={styles.tag}>横纵分析法</span>
          <span className={styles.tag}>5000-8000 字</span>
          <span className={styles.tag}>10+ 公司估值横截面</span>
          <span className={styles.tag}>3 watch lists</span>
        </div>
        <div className={styles.cardMeta}>
          <span>{report.wordCount.toLocaleString()} 字</span>
          <span>·</span>
          <span>25-30 分钟</span>
          <span className={styles.cardArrow}>→</span>
        </div>
      </div>
    </Link>
  );
}

/* ── Main list ── */
export function SectorReportList({ reports }: { reports: SectorReport[] }) {
  const latest = reports[0];
  const older  = reports.slice(1);

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        {reports.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🏗</div>
            <p className={styles.emptyText}>首份月度深度生成中</p>
            <p className={styles.emptySub}>
              <strong>5 月主题：电力 / 数据中心</strong>—— AI 资本开支的真正瓶颈
            </p>
            <p className={styles.emptyHint}>
              定时任务 <code>us-stock-sector-deep-dive</code> 每月 1 日早 8 点自动生成；
              首份正在后台编写中（约 5000-8000 字），完成后会自动出现在这里。
            </p>
          </div>
        ) : (
          <>
            {/* Featured: latest */}
            <section className={styles.section}>
              <div className={styles.sectionLabel}>📌 最新一期</div>
              <ReportCard report={latest} isLatest />
            </section>

            {/* Archive */}
            {older.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionLabel}>📚 往期归档</div>
                <div className={styles.archiveList}>
                  {older.map((r) => (
                    <ReportCard key={r.id} report={r} isLatest={false} />
                  ))}
                </div>
              </section>
            )}

            {/* About */}
            <section className={styles.about}>
              <div className={styles.aboutTitle}>关于本栏目</div>
              <p className={styles.aboutText}>
                <strong>月度深度</strong>每月 1 日早 8:00（北京时间）按行业轮转自动生成，方法论结合
                {' '}<em>market-researcher</em> 的行业研究框架与
                {' '}<em>横纵分析法（HV Analysis）</em>：纵向追行业演进 + 横向比同业估值。
              </p>
              <p className={styles.aboutText}>
                <strong>行业轮转</strong>：5 月 电力 / 数据中心 · 6 月 AI 算力 · 7 月 半导体 · 8 月 云 / SaaS · 9 月 能源 · 10 月 AI 应用层 · 11 月 金融 · 12 月 年度综合
              </p>
              <p className={styles.aboutText}>
                每篇 5000-8000 字，含 10+ 家公司估值横截面 + 顶级机构观点对照 + 3 个 watch list（quality compounder / 均值回归 / 特殊机会）。
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
