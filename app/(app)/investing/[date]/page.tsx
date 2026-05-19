import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MarkdownContent } from '../../../components/MarkdownContent';
import { TableOfContents } from '../../../components/TableOfContents';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { extractToc } from '../../../lib/toc';
import styles from './page.module.css';

const BRIEFS_DIR = resolve(process.cwd(), 'data/strategy-briefs');

function listBriefDates(): string[] {
  if (!existsSync(BRIEFS_DIR)) return [];
  return readdirSync(BRIEFS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace('.md', ''))
    .sort((a, b) => b.localeCompare(a));
}

export function generateStaticParams() {
  return listBriefDates().map((date) => ({ date }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return {
    title: `美股策略快报 · ${date} | CyberFocus`,
    description: `${date} 美股策略简报：AI / 算力 / 电力 / 半导体 / 云 / SaaS / 能源`,
  };
}

function formatDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const w = new Date(y, m - 1, d).getDay();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][w];
  return `${y}年${m}月${d}日 · ${week}`;
}

export default async function StrategyBriefDetailPage({
  params,
}: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const filePath = join(BRIEFS_DIR, `${date}.md`);
  if (!existsSync(filePath)) notFound();

  const contentMd = readFileSync(filePath, 'utf8');

  // Drop the first heading "# 美股策略快报 · YYYY-MM-DD" — header renders it
  const stripped = contentMd.replace(/^#\s+美股策略快报[^\n]*\n+/, '');

  const toc     = extractToc(stripped);
  const showToc = toc.length >= 3;

  // Sibling navigation
  const allDates = listBriefDates();
  const idx  = allDates.indexOf(date);
  const newer = idx > 0 ? allDates[idx - 1] : undefined; // newer = earlier in sorted desc list
  const older = idx < allDates.length - 1 ? allDates[idx + 1] : undefined;

  return (
    <div className={styles.page}>
      <ThemeToggle />

      <nav className={styles.topNav}>
        <Link href="/investing" className={styles.backLink}>
          ← 价值投资
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
              <span className={styles.metaBadge}>📈 美股策略快报</span>
              <span className={styles.metaItem}>📅 {formatDate(date)}</span>
            </div>
            <h1 className={styles.title}>美股策略快报 · {date}</h1>
            <p className={styles.subtitle}>
              AI 综合 Apollo Slok / Goldman / JPM / Morgan Stanley / Howard Marks 等顶级机构观点 · 行业 strategist 视角
            </p>
          </header>

          {showToc && (
            <div className={styles.mobileToc}>
              <TableOfContents entries={toc} />
            </div>
          )}

          <MarkdownContent content={stripped} />

          {(newer || older) && (
            <nav className={styles.briefNav}>
              {older ? (
                <Link href={`/investing/${older}`} className={styles.navPrev}>
                  <span className={styles.navLabel}>← 上一期</span>
                  <span className={styles.navTitle}>{older}</span>
                </Link>
              ) : <div />}
              {newer ? (
                <Link href={`/investing/${newer}`} className={styles.navNext}>
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
