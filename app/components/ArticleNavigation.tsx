import Link from 'next/link';
import { Article } from '../types/article';
import styles from './ArticleNavigation.module.css';

interface Props {
  prev?: Pick<Article, 'slug' | 'titleZh' | 'titleEn'>;
  next?: Pick<Article, 'slug' | 'titleZh' | 'titleEn'>;
}

export function ArticleNavigation({ prev, next }: Props) {
  if (!prev && !next) return null;

  return (
    <nav className={styles.nav} aria-label="文章导航">
      {prev ? (
        <Link href={`/articles/${prev.slug}`} className={`${styles.link} ${styles.prev}`}>
          <span className={styles.direction}>← 上一篇</span>
          <span className={styles.title}>{prev.titleZh ?? prev.titleEn}</span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link href={`/articles/${next.slug}`} className={`${styles.link} ${styles.next}`}>
          <span className={styles.direction}>下一篇 →</span>
          <span className={styles.title}>{next.titleZh ?? next.titleEn}</span>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
