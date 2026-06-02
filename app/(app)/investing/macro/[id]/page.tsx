import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MarkdownContent } from '../../../../components/MarkdownContent';
import { TableOfContents } from '../../../../components/TableOfContents';
import { ThemeToggle } from '../../../../components/ThemeToggle';
import { extractToc } from '../../../../lib/toc';
import styles from './page.module.css';

const DIR = resolve(process.cwd(), 'data/macro-reports');
const RE  = /^\d{4}-Q[1-4]$/;

function listIds(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => /^\d{4}-Q[1-4]\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort((a, b) => b.localeCompare(a));
}

export function generateStaticParams() {
  return listIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `季度宏观 · ${id} | CyberFocus` };
}

export default async function MacroDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RE.test(id)) notFound();
  const filePath = join(DIR, `${id}.md`);
  if (!existsSync(filePath)) notFound();

  const md = readFileSync(filePath, 'utf8');
  const stripped = md.replace(/^#\s+[^\n]*\n+/, '');
  const toc = extractToc(stripped);
  const showToc = toc.length >= 3;

  const allIds = listIds();
  const idx = allIds.indexOf(id);
  const newer = idx > 0 ? allIds[idx - 1] : undefined;
  const older = idx < allIds.length - 1 ? allIds[idx + 1] : undefined;

  const m = id.match(/^(\d{4})-Q([1-4])$/)!;

  return (
    <div className={styles.page}>
      <ThemeToggle />
      <nav className={styles.topNav}>
        <Link href="/investing/macro" className={styles.backLink}>← 季度宏观</Link>
      </nav>

      <div className={`${styles.layout} ${showToc ? styles.layoutWithSidebar : ''}`}>
        {showToc && <aside className={styles.sidebar}><TableOfContents entries={toc} /></aside>}

        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.headerMetaRow}>
              <span className={styles.metaBadge}>🌐 季度宏观</span>
              <span className={styles.metaItem}>📅 {m[1]} 年 第 {m[2]} 季度</span>
              <span className={styles.metaItem}>🧭 自上而下</span>
            </div>
            <h1 className={styles.title}>美股季度宏观 · {id}</h1>
            <p className={styles.subtitle}>regime 判定 + 宏观五要素 + 行业轮动时钟 + 资产配置 · 板块唯一自上而下栏目</p>
          </header>

          {showToc && <div className={styles.mobileToc}><TableOfContents entries={toc} /></div>}

          <MarkdownContent content={stripped} />

          {(newer || older) && (
            <nav className={styles.reportNav}>
              {older ? (
                <Link href={`/investing/macro/${older}`} className={styles.navPrev}>
                  <span className={styles.navLabel}>← 上一期</span>
                  <span className={styles.navTitle}>{older}</span>
                </Link>
              ) : <div />}
              {newer ? (
                <Link href={`/investing/macro/${newer}`} className={styles.navNext}>
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
