import { Article } from '../types/article';
import { getDateKey } from '../lib/date';
import styles from './ArticleFooter.module.css';

function formatDate(iso: string) {
  return getDateKey(iso);
}

export function ArticleFooter({ article }: { article: Article }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <span className={styles.label}>📌 原文链接：</span>
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {article.sourceUrl}
        </a>
      </div>
      {article.translator && (
        <div className={styles.row}>
          <span className={styles.label}>✍️ 翻译：</span>
          <span>
            {article.translator.model} · {formatDate(article.translator.translatedAt)}
          </span>
        </div>
      )}
      <div className={styles.disclaimer}>
        ⚠️ 翻译仅供学习交流使用，内容版权归原作者所有。
      </div>
    </footer>
  );
}
