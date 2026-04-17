import { Article } from '../types/article';
import { SourceBadge } from './SourceBadge';
import styles from './ArticleHeader.module.css';

function formatDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function ArticleHeader({ article }: { article: Article }) {
  return (
    <header className={styles.header}>
      <h1 className={styles.titleZh}>{article.titleZh ?? article.titleEn}</h1>
      <p className={styles.titleEn}>{article.titleEn}</p>

      <div className={styles.metaRow}>
        <span className={styles.metaItem}>
          <span className={styles.metaIcon}>📅</span>
          {formatDate(article.publishedAt)}
        </span>
        <span className={styles.metaItem}>
          <span className={styles.metaIcon}>👤</span>
          {article.authors.slice(0, 3).join('、')}
          {article.authors.length > 3 ? ' 等' : ''}
        </span>
        {article.docType && (
          <span className={styles.metaItem}>
            <SourceBadge source={article.source} />
          </span>
        )}
      </div>

      <div className={styles.sourceRow}>
        <span className={styles.metaIcon}>🔗</span>
        <span className={styles.sourceLabel}>原文：</span>
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          {article.sourceUrl}
        </a>
      </div>

      {article.translator && (
        <div className={styles.translatorRow}>
          <span className={styles.metaIcon}>✍️</span>
          <span className={styles.sourceLabel}>翻译：</span>
          <span>{article.translator.model}</span>
          {article.translator.humanReviewer && (
            <span> · 校对 {article.translator.humanReviewer}</span>
          )}
        </div>
      )}

      {article.tags && article.tags.length > 0 && (
        <div className={styles.tagsRow}>
          {article.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              #{tag}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
