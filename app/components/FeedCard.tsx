import Link from 'next/link';
import { Article } from '../types/article';
import styles from './FeedCard.module.css';

const SOURCE_SCORES: Record<string, number> = {
  'Anthropic Blog':   90,
  'OpenAI Blog':      86,
  'HuggingFace Daily': 79,
  'arXiv cs.AI':      72,
};

const SOURCE_TAGS: Record<string, string[]> = {
  'Anthropic Blog':    ['Anthropic', '博客'],
  'OpenAI Blog':       ['OpenAI', '博客'],
  'HuggingFace Daily': ['每日精选', '论文'],
  'arXiv cs.AI':       ['arXiv', '论文'],
};

function scoreClass(s: number) {
  if (s >= 85) return styles.scoreHigh;
  if (s >= 75) return styles.scoreMid;
  return styles.scoreLow;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function FeedCard({ article }: { article: Article }) {
  const score    = article.featured ? 93 : (SOURCE_SCORES[article.source] ?? 70);
  // Build a fresh array every render — never mutate the module-level SOURCE_TAGS constant
  const baseTags = SOURCE_TAGS[article.source] ?? [];
  const tags     = article.featured ? ['精选', ...baseTags] : [...baseTags];
  if (article.docType === 'Paper' && !tags.includes('论文')) tags.push('论文');

  const hasDetail = Boolean(article.contentMd && article.slug);
  const desc = article.abstractZh ?? article.abstractEn ?? '';
  const time = formatTime(article.publishedAt);

  const inner = (
    <>
      <div className={styles.meta}>
        <span className={styles.source}>
          {article.source}
          <span className={styles.sourceDot} />
          {article.docType ?? 'Blog'}
        </span>
        <span className={`${styles.score} ${scoreClass(score)}`}>{score}</span>
      </div>

      <div className={styles.title}>{article.titleZh ?? article.titleEn}</div>

      {desc && <div className={styles.desc}>{desc}</div>}

      <div className={styles.tags}>
        {tags.map((t) => (
          <span key={t} className={styles.tag}>{t}</span>
        ))}
        {hasDetail && <span className={styles.readBadge}>中文全文</span>}
      </div>

      {article.featured && desc && (
        <div className={styles.reason}>
          <span className={styles.reasonIcon}>✦</span>
          {desc.slice(0, 80)}{desc.length > 80 ? '…' : ''}
        </div>
      )}
    </>
  );

  if (hasDetail) {
    return (
      <Link href={`/articles/${article.slug}`} className={styles.card}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.card}>
      {inner}
    </a>
  );
}

export { formatTime };
