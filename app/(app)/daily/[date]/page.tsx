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

function formatFullDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const prefix = dateKey === today ? '今天 · ' : '';
  return `${prefix}${y}年${m}月${d}日`;
}

function formatPill(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const yest  = new Date(Date.now() + 8*3600*1000 - 86400000).toISOString().slice(0,10);
  if (dateKey === today) return '今天';
  if (dateKey === yest)  return '昨天';
  return `${m}月${d}日`;
}

function weekdayCN(dateKey: string): string {
  const days = ['周日','周一','周二','周三','周四','周五','周六'];
  const [y, m, d] = dateKey.split('-').map(Number);
  return days[new Date(y, m - 1, d).getDay()];
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

  const dates   = availableDates();
  const { summary, articles } = doc;

  const aiNewsArticles = articles.filter(
    (a) => !HR_SOURCES.has(a.source) && !PAPER_SOURCES.has(a.source),
  );
  const paperArticles  = articles.filter((a) => PAPER_SOURCES.has(a.source));
  const hrOrgArticles  = articles.filter(
    (a) => HR_SOURCES.has(a.source) || a.tags?.includes('人服动态'),
  );

  const sections = [
    { id: 'ai-news',  icon: '🤖', label: 'AI 动态',    bullets: summary?.aiNews  ?? [], items: aiNewsArticles },
    { id: 'papers',   icon: '📄', label: '论文速递',   bullets: summary?.papers  ?? [], items: paperArticles  },
    { id: 'hr-orgs',  icon: '🏢', label: '人力资源',   bullets: summary?.hrOrgs  ?? [], items: hrOrgArticles  },
  ].filter((s) => s.items.length > 0);

  const genTime = doc.generatedAt
    ? new Date(doc.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <div className={styles.root}>

      {/* ── Top bar ── */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <span className={styles.topbarLabel}>📋 AI 日报</span>
          <span className={styles.topbarDate}>{formatFullDate(date)} · {weekdayCN(date)}</span>
          {genTime && <span className={styles.topbarMeta}>生成于 {genTime}</span>}
        </div>
        <span className={styles.topbarCount}>{articles.length} 条</span>
      </div>

      {/* ── Date nav ── */}
      <div className={styles.dateNav}>
        {dates.slice(0, 10).map((d) => (
          <Link
            key={d}
            href={`/daily/${d}`}
            className={`${styles.datePill} ${d === date ? styles.datePillActive : ''}`}
          >
            {formatPill(d)}
          </Link>
        ))}
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>

        {/* ── Summary strip ── */}
        {summary && sections.some((s) => s.bullets.length > 0) && (
          <div className={styles.summaryStrip}>
            <div className={styles.summaryStripTitle}>今日要点</div>
            <div className={styles.summaryColumns}>
              {sections.filter((s) => s.bullets.length > 0).map((s) => (
                <div key={s.id} className={styles.summaryCol}>
                  <div className={styles.summaryColLabel}>
                    <span>{s.icon}</span> {s.label}
                  </div>
                  <ul className={styles.bulletList}>
                    {s.bullets.map((b, i) => (
                      <li key={i} className={styles.bullet}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sections ── */}
        {sections.map((s, idx) => (
          <section key={s.id} id={s.id} className={styles.section}>
            {/* Section header */}
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNum}>0{idx + 1}</span>
              <span className={styles.sectionIcon}>{s.icon}</span>
              <span className={styles.sectionLabel}>{s.label}</span>
              <div className={styles.sectionLine} />
              <span className={styles.sectionCount}>{s.items.length} 条</span>
            </div>

            {/* Cards grid */}
            <div className={styles.cardGrid}>
              {s.items.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        ))}

        {articles.length === 0 && (
          <div className={styles.empty}>该日期暂无数据</div>
        )}
      </div>
    </div>
  );
}

/* ── Article Card ── */
function ArticleCard({ article: a }: { article: Article }) {
  const title   = a.titleZh ?? a.titleEn;
  const hasZh   = !!a.titleZh;
  const excerpt = a.abstractZh ?? a.abstractEn ?? '';
  const isReport = a.docType === 'Report';

  return (
    <a
      href={a.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.card}
    >
      {/* Meta row */}
      <div className={styles.cardMeta}>
        <span className={styles.cardSource}>{a.source}</span>
        {isReport && <span className={styles.cardReport}>报告</span>}
      </div>

      {/* Title */}
      <div className={styles.cardTitle}>{title}</div>
      {hasZh && (
        <div className={styles.cardTitleEn}>{a.titleEn}</div>
      )}

      {/* Excerpt */}
      {excerpt && (
        <div className={styles.cardExcerpt}>{excerpt}</div>
      )}
    </a>
  );
}
