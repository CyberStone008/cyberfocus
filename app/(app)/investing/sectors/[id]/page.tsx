import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MarkdownContent } from '../../../../components/MarkdownContent';
import { TableOfContents } from '../../../../components/TableOfContents';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { extractToc } from '../../../../lib/toc';
import styles from './page.module.css';

const SECTORS_DIR = resolve(process.cwd(), 'data/sector-reports');
const FILENAME_RE = /^(\d{4})-(\d{2})-(.+)\.md$/;

const SECTOR_LABEL: Record<string, { emoji: string; label: string }> = {
  'power-datacenter':  { emoji: '⚡', label: '电力 / 数据中心' },
  'ai-compute':        { emoji: '🤖', label: 'AI 算力' },
  'semiconductors':    { emoji: '💾', label: '半导体' },
  'cloud-saas':        { emoji: '☁️',  label: '云 / SaaS' },
  'energy':            { emoji: '🛢', label: '能源 / 油气' },
  'ai-applications':   { emoji: '✨', label: 'AI 应用层' },
  'fintech-banks':     { emoji: '🏦', label: '金融科技 / 银行' },
  'year-review':       { emoji: '📊', label: '年度综合' },
};

function listReportIds(): string[] {
  if (!existsSync(SECTORS_DIR)) return [];
  return readdirSync(SECTORS_DIR)
    .filter((f) => FILENAME_RE.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => b.localeCompare(a));
}

export function generateStaticParams() {
  return listReportIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `行业深度 · ${id} | CyberFocus`,
  };
}

export default async function SectorReportDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const filePath = join(SECTORS_DIR, `${id}.md`);
  if (!existsSync(filePath)) notFound();

  const m = id.match(/^(\d{4})-(\d{2})-(.+)$/);
  if (!m) notFound();

  const year  = m[1];
  const month = m[2];
  const slug  = m[3];
  const meta  = SECTOR_LABEL[slug] ?? { emoji: '📈', label: slug };

  const contentMd = readFileSync(filePath, 'utf8');

  // Drop the first heading "# 美股行业深度 · ..." since we render our own
  const stripped = contentMd.replace(/^#\s+[^\n]*\n+/, '');

  const toc     = extractToc(stripped);
  const showToc = toc.length >= 3;

  // Sibling navigation
  const allIds = listReportIds();
  const idx    = allIds.indexOf(id);
  const newer  = idx > 0 ? allIds[idx - 1] : undefined;
  const older  = idx < allIds.length - 1 ? allIds[idx + 1] : undefined;

  return (
    <div className={styles.page}>
      <ThemeToggle />

      <nav className={styles.topNav}>
        <Link href="/investing/sectors" className={styles.backLink}>
          ← 月度深度
        </Link>
      </nav>

      <div className={`${styles.layout} ${showToc ? styles.layoutWithSidebar : ''}`}>
        {showToc && (
          <aside className={styles.sidebar}>
            <TableOfContents entries={toc} />
          </aside>
        )}

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerMetaRow}>
              <span className={styles.metaBadge}>
                <span className={styles.metaEmoji}>{meta.emoji}</span>
                {meta.label}
              </span>
              <span className={styles.metaItem}>📅 {year}年{Number(month)}月</span>
              <span className={styles.metaItem}>📚 横纵分析法</span>
            </div>
            <h1 className={styles.title}>美股行业深度 · {year}-{month} · {meta.label}</h1>
            <p className={styles.subtitle}>
              方法论结合 market-researcher 行业研究框架 + 横纵分析法 · 5000-8000 字 · 阅读时长 25-30 分钟
            </p>
          </header>

          {showToc && (
            <div className={styles.mobileToc}>
              <TableOfContents entries={toc} />
            </div>
          )}

          <MarkdownContent content={stripped} />

          {(newer || older) && (
            <nav className={styles.reportNav}>
              {older ? (
                <Link href={`/investing/sectors/${older}`} className={styles.navPrev}>
                  <span className={styles.navLabel}>← 上一期</span>
                  <span className={styles.navTitle}>{older}</span>
                </Link>
              ) : <div />}
              {newer ? (
                <Link href={`/investing/sectors/${newer}`} className={styles.navNext}>
                  <span className={styles.navLabel}>下一期 →</span>
                  <span className={styles.navTitle}>{newer}</span>
                </Link>
              ) : <div />}
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}
