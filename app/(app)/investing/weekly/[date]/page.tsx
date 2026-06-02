import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MarkdownContent } from '../../../../components/MarkdownContent';
import { TableOfContents } from '../../../../components/TableOfContents';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { extractToc } from '../../../../lib/toc';
import styles from './page.module.css';

const DIR = resolve(process.cwd(), 'data/weekly-reports');
const RE  = /^\d{4}-\d{2}-\d{2}$/;

function listIds(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => b.localeCompare(a));
}

export function generateStaticParams() {
  return listIds().map((date) => ({ date }));
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: `行业周报 · ${date} | CyberFocus` };
}

export default async function WeeklyDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!RE.test(date)) notFound();
  const filePath = join(DIR, `${date}.md`);
  if (!existsSync(filePath)) notFound();

  const md = readFileSync(filePath, 'utf8');
  const stripped = md.replace(/^#\s+[^\n]*\n+/, '');
  const toc = extractToc(stripped);
  const showToc = toc.length >= 3;

  const allIds = listIds();
  const idx = allIds.indexOf(date);
  const newer = idx > 0 ? allIds[idx - 1] : undefined;
  const older = idx < allIds.length - 1 ? allIds[idx + 1] : undefined;

  const [y, m, d] = date.split('-').map(Number);

  return (
    <div className={styles.page}>
      <ThemeToggle />
      <nav className={styles.topNav}>
        <Link href="/investing/weekly" className={styles.backLink}>← 行业周报</Link>
      </nav>

      <div className={`${styles.layout} ${showToc ? styles.layoutWithSidebar : ''}`}>
        {showToc && <aside className={styles.sidebar}><TableOfContents entries={toc} /></aside>}

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerMetaRow}>
              <span className={styles.metaBadge}>📰 行业周报</span>
              <span className={styles.metaItem}>📅 {y}年{m}月{d}日（周六）</span>
              <span className={styles.metaItem}>📋 Thesis 追踪</span>
            </div>
            <h1 className={styles.title}>美股行业周报 · {date}</h1>
            <p className={styles.subtitle}>周复盘 + 前期判断兑现追踪 + 七行业扫描 · 与策略快报错位互补</p>
          </header>

          {showToc && <div className={styles.mobileToc}><TableOfContents entries={toc} /></div>}

          <MarkdownContent content={stripped} />

          {(newer || older) && (
            <nav className={styles.reportNav}>
              {older ? (
                <Link href={`/investing/weekly/${older}`} className={styles.navPrev}>
                  <span className={styles.navLabel}>← 上一期</span>
                  <span className={styles.navTitle}>{older}</span>
                </Link>
              ) : <div />}
              {newer ? (
                <Link href={`/investing/weekly/${newer}`} className={styles.navNext}>
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
