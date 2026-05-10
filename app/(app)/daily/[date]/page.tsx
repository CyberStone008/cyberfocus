import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Article } from '../../../types/article';
import styles from './page.module.css';

const DAILY_DIR = resolve(process.cwd(), 'data/daily');

/* ── Types ── */
interface DailySummary {
  aiNews: string[];
  papers: string[];
  hrOrgs: string[];
}

interface DailyDoc {
  date: string;
  generatedAt?: string;
  summary?: DailySummary;
  articles: Article[];
}

/* ── Helpers ── */
function loadDaily(date: string): DailyDoc | null {
  const path = resolve(DAILY_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    // Handle old plain-array format
    if (Array.isArray(raw)) return { date, articles: raw };
    return raw as DailyDoc;
  } catch {
    return null;
  }
}

function availableDates(): string[] {
  if (!existsSync(DAILY_DIR)) return [];
  return readdirSync(DAILY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return `今天 · ${y}年${m}月${d}日`;
  if (dateKey === yesterday) return `昨天 · ${y}年${m}月${d}日`;
  return `${y}年${m}月${d}日`;
}

function formatDatePill(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return '今天';
  if (dateKey === yesterday) return '昨天';
  return `${m}月${d}日`;
}

/* ── Static params ── */
export async function generateStaticParams() {
  return availableDates().map((date) => ({ date }));
}

/* ── Page ── */
export default async function DailyPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const doc = loadDaily(date);
  if (!doc) notFound();

  const dates = availableDates();
  const { summary, articles } = doc;
  const currentDate = date;

  const HR_SOURCES = new Set([
    'Korn Ferry', 'Mercer', 'ManpowerGroup', 'Randstad', 'Adecco Group',
    '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
  ]);
  const PAPER_SOURCES = new Set(['arXiv cs.AI', 'arXiv cs.LG', 'HuggingFace Daily']);

  const aiNewsArticles = articles.filter(
    (a) => !HR_SOURCES.has(a.source) && !PAPER_SOURCES.has(a.source),
  );
  const paperArticles = articles.filter((a) => PAPER_SOURCES.has(a.source));
  const hrOrgArticles = articles.filter(
    (a) => HR_SOURCES.has(a.source) || a.tags?.includes('人服动态'),
  );

  return (
    <div className={styles.root}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/daily" className={styles.backLink}>← 日报</Link>
          <span className={styles.headerDate}>{formatDateLabel(date)}</span>
          {doc.generatedAt && (
            <span className={styles.headerMeta}>
              生成于 {new Date(doc.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
        </div>

        {/* Date pills */}
        <div className={styles.datePills}>
          {dates.slice(0, 10).map((d) => (
            <Link
              key={d}
              href={`/daily/${d}`}
              className={`${styles.datePill} ${d === currentDate ? styles.datePillActive : ''}`}
            >
              {formatDatePill(d)}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {/* ── Summary cards ── */}
        {summary && (
          <div className={styles.summaryGrid}>
            {summary.aiNews.length > 0 && (
              <SummaryCard
                icon="🤖"
                title="AI 动态"
                bullets={summary.aiNews}
                count={aiNewsArticles.length}
                anchor="#ai-news"
              />
            )}
            {summary.papers.length > 0 && (
              <SummaryCard
                icon="📄"
                title="论文速递"
                bullets={summary.papers}
                count={paperArticles.length}
                anchor="#papers"
              />
            )}
            {summary.hrOrgs.length > 0 && (
              <SummaryCard
                icon="🏢"
                title="人力资源动态"
                bullets={summary.hrOrgs}
                count={hrOrgArticles.length}
                anchor="#hr-orgs"
              />
            )}
            {!summary.aiNews.length && !summary.papers.length && !summary.hrOrgs.length && (
              <div className={styles.noSummary}>今日摘要尚未生成，下次 pipeline 运行后自动更新</div>
            )}
          </div>
        )}

        {/* ── Article sections ── */}
        {aiNewsArticles.length > 0 && (
          <ArticleSection id="ai-news" icon="🤖" title="AI 动态" articles={aiNewsArticles} />
        )}
        {paperArticles.length > 0 && (
          <ArticleSection id="papers" icon="📄" title="论文速递" articles={paperArticles} />
        )}
        {hrOrgArticles.length > 0 && (
          <ArticleSection id="hr-orgs" icon="🏢" title="人力资源动态" articles={hrOrgArticles} />
        )}

        {articles.length === 0 && (
          <div className={styles.empty}>该日期暂无数据</div>
        )}
      </div>
    </div>
  );
}

/* ── Summary Card ── */
function SummaryCard({
  icon, title, bullets, count, anchor,
}: {
  icon: string;
  title: string;
  bullets: string[];
  count: number;
  anchor: string;
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryCardHeader}>
        <span className={styles.summaryCardIcon}>{icon}</span>
        <span className={styles.summaryCardTitle}>{title}</span>
        <a href={anchor} className={styles.summaryCardCount}>{count} 条 →</a>
      </div>
      <ul className={styles.summaryBullets}>
        {bullets.map((b, i) => (
          <li key={i} className={styles.summaryBullet}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

/* ── Article Section ── */
function ArticleSection({
  id, icon, title, articles,
}: {
  id: string;
  icon: string;
  title: string;
  articles: Article[];
}) {
  return (
    <section id={id} className={styles.articleSection}>
      <div className={styles.sectionHeader}>
        <span>{icon}</span>
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionCount}>{articles.length} 条</span>
      </div>
      <div className={styles.articleList}>
        {articles.map((a) => (
          <a
            key={a.id}
            href={a.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.articleRow}
          >
            <span className={styles.articleSource}>{a.source}</span>
            <span className={styles.articleTitle}>
              {a.titleZh ?? a.titleEn}
            </span>
            {a.titleZh && (
              <span className={styles.articleTitleEn}>{a.titleEn}</span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
