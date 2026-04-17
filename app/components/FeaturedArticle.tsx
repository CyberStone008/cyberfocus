import Link from 'next/link';
import { Article } from '../types/article';
import { SourceBadge } from './SourceBadge';
import styles from './FeaturedArticle.module.css';

interface Props {
  article: Article;
}

export function FeaturedArticle({ article }: Props) {
  const date = new Date(article.publishedAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const abstract = article.abstractZh ?? article.abstractEn ?? '';
  const excerpt = abstract.length > 160 ? abstract.slice(0, 160) + '…' : abstract;

  const hasDetailPage = Boolean(article.contentMd && article.slug);

  return (
    <section className={styles.section}>
      <div className={styles.label}>
        <span className={styles.star}>★</span> 今日精选
      </div>

      <div className={styles.card}>
        <div className={styles.meta}>
          <SourceBadge source={article.source} />
          <span className={styles.date}>{date}</span>
          {article.authors.length > 0 && (
            <span className={styles.authors}>
              {article.authors.slice(0, 3).join('、')}
              {article.authors.length > 3 ? ' 等' : ''}
            </span>
          )}
        </div>

        <h2 className={styles.titleZh}>
          {hasDetailPage ? (
            <Link href={`/articles/${article.slug}`} className={styles.titleLink}>
              {article.titleZh ?? article.titleEn}
            </Link>
          ) : (
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.titleLink}>
              {article.titleZh ?? article.titleEn}
            </a>
          )}
        </h2>

        {article.titleZh && (
          <p className={styles.titleEn}>{article.titleEn}</p>
        )}

        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}

        <div className={styles.footer}>
          {hasDetailPage ? (
            <Link href={`/articles/${article.slug}`} className={styles.cta}>
              阅读全文 →
            </Link>
          ) : (
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.cta}>
              查看原文 →
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
