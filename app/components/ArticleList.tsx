'use client';

import { Article } from '../types/article';
import { ArticleCard } from './ArticleCard';
import styles from './ArticleList.module.css';

function YearDivider({ year }: { year: number }) {
  return (
    <div className={styles.yearDivider}>
      <span className={styles.yearLabel}>{year}</span>
    </div>
  );
}

export function ArticleList({ articles }: { articles: Article[] }) {
  let currentYear: number | null = null;

  return (
    <div className={styles.list}>
      {articles.map((article) => {
        const year = new Date(article.publishedAt).getFullYear();
        const showDivider = year !== currentYear;
        currentYear = year;

        return (
          <div key={article.id}>
            {showDivider && <YearDivider year={year} />}
            <ArticleCard article={article} />
          </div>
        );
      })}
    </div>
  );
}
