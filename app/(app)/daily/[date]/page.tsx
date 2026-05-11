import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Article } from '../../../types/article';
import styles from './page.module.css';

const DAILY_DIR = resolve(process.cwd(), 'data/daily');

/* ── Types ── */
interface DailySummary { aiNews: string[]; papers: string[]; hrOrgs: string[] }
interface DailyDoc { date: string; generatedAt?: string; summary?: DailySummary; articles: Article[] }

/* ── Source sets ── */
const HR_SOURCES = new Set([
  'Korn Ferry','Mercer','ManpowerGroup','Randstad','Adecco Group',
  '科锐国际','FESCO','中智咨询','智联招聘','BOSS直聘','FESCO Adecco',
]);
const PAPER_SOURCES = new Set(['arXiv cs.AI','arXiv cs.LG','HuggingFace Daily']);

/* ── Helpers ── */
function loadDaily(date: string): DailyDoc | null {
  const path = resolve(DAILY_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(raw)) return { date, articles: raw };
    return raw as DailyDoc;
  } catch { return null; }
}

function availableDates(): string[] {
  if (!existsSync(DAILY_DIR)) return [];
  return readdirSync(DAILY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

/** Load just the first article headline for each date (for sidebar preview) */
function loadDatePreviews(dates: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of dates) {
    try {
      const raw = JSON.parse(readFileSync(resolve(DAILY_DIR, `${d}.json`), 'utf8'));
      const articles: Article[] = Array.isArray(raw) ? raw : (raw.articles ?? []);
      const first = articles[0];
      out[d] = first ? (first.titleZh ?? first.titleEn ?? '').slice(0, 22) : '';
    } catch { out[d] = ''; }
  }
  return out;
}

/** Group date strings by YYYY-MM */
function groupByMonth(dates: string[]): Array<{ month: string; dates: string[] }> {
  const map = new Map<string, string[]>();
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (!map.has(m)) map.set(m, []);
    map.get(m)!.push(d);
  }
  return [...map.entries()].map(([month, ds]) => ({ month, dates: ds }));
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

function dayNum(dateKey: string) { return parseInt(dateKey.slice(8), 10); }

/* Chinese date formatters */
const CN_DIGITS = ['〇','一','二','三','四','五','六','七','八','九'];
function digitToCN(n: number) { return CN_DIGITS[n]; }
function numToCN(n: number): string {
  if (n < 10) return CN_DIGITS[n];
  if (n === 10) return '十';
  if (n < 20) return `十${CN_DIGITS[n - 10]}`;
  if (n === 20) return '二十';
  if (n < 30) return `二十${CN_DIGITS[n - 20]}`;
  return `三十${n > 30 ? CN_DIGITS[n - 30] : ''}`;
}
function toChineseDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const yStr = String(y).split('').map(Number).map(digitToCN).join('');
  return `${yStr}年${numToCN(m)}月${numToCN(d)}日`;
}
function weekdayCN(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(y, m - 1, d).getDay()];
}
function volStr(dateKey: string) { return `VOL.${dateKey.replace(/-/g, '.')}`; }

/* ── Static params ── */
export async function generateStaticParams() {
  return availableDates().map((date) => ({ date }));
}

/* ── Page ── */
export default async function DailyPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const doc = loadDaily(date);
  if (!doc) notFound();

  const allDates   = availableDates();
  const previews   = loadDatePreviews(allDates);
  const monthGroups = groupByMonth(allDates);
  const { articles } = doc;

  const aiNewsArticles = articles.filter((a) => !HR_SOURCES.has(a.source) && !PAPER_SOURCES.has(a.source));
  const paperArticles  = articles.filter((a) => PAPER_SOURCES.has(a.source));
  const hrOrgArticles  = articles.filter((a) => HR_SOURCES.has(a.source) || a.tags?.includes('人服动态'));

  const sections = [
    { id: 'ai',    num: '01', label: 'AI 动态',   en: '今日动态',   items: aiNewsArticles },
    { id: 'paper', num: '02', label: '论文速递',   en: '学术论文',   items: paperArticles  },
    { id: 'hr',    num: '03', label: '人力资源动态', en: '职场与人才', items: hrOrgArticles  },
  ].filter((s) => s.items.length > 0);

  return (
    <div className={styles.root}>

      {/* ── Date panel (left) ── */}
      <aside className={styles.datePanel}>
        {/* Latest */}
        <Link href={`/daily/${allDates[0]}`} className={styles.latestCard}>
          <div className={styles.latestLabel}>最新一期</div>
          <div className={styles.latestDate}>{allDates[0]}</div>
        </Link>

        {/* Month groups */}
        <div className={styles.dateList}>
          {monthGroups.map(({ month, dates: mDates }) => (
            <div key={month} className={styles.monthGroup}>
              <div className={styles.monthHeader}>
                <span>{formatMonthLabel(month)}</span>
                <span className={styles.monthCount}>{mDates.length}</span>
              </div>
              {mDates.map((d) => (
                <Link
                  key={d}
                  href={`/daily/${d}`}
                  className={`${styles.dateItem} ${d === date ? styles.dateItemActive : ''}`}
                >
                  <span className={styles.dateDay}>{dayNum(d)} 日</span>
                  <span className={styles.datePreview}>{previews[d]}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link href="/daily" className={styles.allLink}>全部日报 →</Link>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.main}>

        {/* ── Hero ── */}
        <div className={styles.hero}>
          <div className={styles.heroMeta}>
            <span className={styles.heroLine} />
            {volStr(date)}
            <span className={styles.heroDot}>·</span>
            {articles.length} 篇
            <span className={styles.heroDot}>·</span>
            每日精选
          </div>

          <h1 className={styles.heroTitle}>
            <span className={styles.heroTitleAccent}>AI</span>
            {' '}日报
          </h1>

          <div className={styles.heroDateRow}>
            <span className={styles.heroDateCN}>{toChineseDate(date)}&nbsp;&nbsp;&nbsp;{weekdayCN(date)}</span>
            <span className={styles.heroDateRight}>每日自动更新</span>
          </div>

          <div className={styles.heroDivider} />
        </div>

        {/* ── Summary bullets (if available) ── */}
        {doc.summary && (sections.some((s) => {
          const key = s.id === 'ai' ? 'aiNews' : s.id === 'paper' ? 'papers' : 'hrOrgs';
          return (doc.summary![key as keyof DailySummary]?.length ?? 0) > 0;
        })) && (
          <div className={styles.summaryBlock}>
            <div className={styles.summaryLabel}>今日要点</div>
            {sections.map((s) => {
              const key = s.id === 'ai' ? 'aiNews' : s.id === 'paper' ? 'papers' : 'hrOrgs';
              const bullets = doc.summary![key as keyof DailySummary] ?? [];
              if (!bullets.length) return null;
              return (
                <div key={s.id} className={styles.summarySection}>
                  <span className={styles.summarySectionLabel}>{s.label}</span>
                  {bullets.map((b, i) => (
                    <div key={i} className={styles.summaryBullet}>
                      <span className={styles.summaryBulletDot}>—</span>
                      {b}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Article sections ── */}
        {sections.map((s) => (
          <section key={s.id} id={s.id} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNum}>{s.num}</span>
              <span className={styles.sectionName}>{s.label}</span>
              <span className={styles.sectionEn}>{s.en}</span>
              <span className={styles.sectionCount}>{s.items.length}&nbsp;篇</span>
            </div>

            <div className={styles.articleList}>
              {s.items.map((a) => <ArticleItem key={a.id} article={a} />)}
            </div>
          </section>
        ))}

        {articles.length === 0 && (
          <div className={styles.empty}>该日期暂无数据</div>
        )}
      </main>
    </div>
  );
}

/* ── Article Item ── */
function ArticleItem({ article: a }: { article: Article }) {
  const title   = a.titleZh ?? a.titleEn;
  const hasZh   = !!a.titleZh;
  const excerpt = (a.abstractZh ?? a.abstractEn ?? '').trim();
  // Filter out excerpts that are just "title  publication" (Google News pattern)
  const showExcerpt = excerpt && excerpt !== a.titleEn && excerpt.length > a.titleEn.length + 4;

  return (
    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.article}>
      <div className={styles.articleTitle}>{title}</div>

      <div className={styles.articleMeta}>
        <span className={styles.articleSource}>{a.source}</span>
        {a.docType === 'Report' && <span className={styles.articleReport}>报告</span>}
        {hasZh && <span className={styles.articleSourceEn}>{a.titleEn}</span>}
      </div>

      {showExcerpt && (
        <div className={styles.articleExcerpt}>{excerpt}</div>
      )}
    </a>
  );
}
