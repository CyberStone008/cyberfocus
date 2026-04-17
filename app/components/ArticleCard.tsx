import Link from 'next/link';
import { Article } from '../types/article';
import { SourceBadge } from './SourceBadge';
import styles from './ArticleCard.module.css';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export function ArticleCard({ article }: { article: Article }) {
  const hasDetail = Boolean(article.contentMd && article.slug);

  const content = (
    <>
      <div className={styles.meta}>
        <span className={styles.date}>{formatDate(article.publishedAt)}</span>
        <SourceBadge source={article.source} />
        {hasDetail && <span className={styles.detailBadge}>中文全文</span>}
      </div>

      <h2 className={styles.titleZh}>{article.titleZh ?? article.titleEn}</h2>

      <p className={styles.titleEn}>{article.titleEn}</p>

      {(article.abstractZh || article.abstractEn) && (
        <p className={styles.abstract}>{article.abstractZh ?? article.abstractEn}</p>
      )}

      {article.authors.length > 0 && (
        <p className={styles.authors}>
          {article.authors.slice(0, 3).join('、')}
          {article.authors.length > 3 ? ` 等` : ''}
          {article.institution ? ` · ${article.institution}` : ''}
        </p>
      )}
    </>
  );

  if (hasDetail) {
    return (
      <Link href={`/articles/${article.slug}`} className={styles.card}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={article.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.card}
    >
      {content}
    </a>
  );
}
