import articles from '../data/articles.json';
import { Article } from './types/article';
import { ArticleList } from './components/ArticleList';
import { FeaturedArticle } from './components/FeaturedArticle';
import { ThemeToggle } from './components/ThemeToggle';
import styles from './page.module.css';

export default function Home() {
  const all = articles as Article[];

  const sorted = [...all].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Today's featured: find by featured flag
  const featured = sorted.find((a) => a.featured);

  // Regular list: all articles (featured one stays in list too, just with a badge)
  const listArticles = sorted;

  return (
    <div className={styles.page}>
      <ThemeToggle />
      <header className={styles.header}>
        <h1 className={styles.title}>AI 研究速览</h1>
        <p className={styles.subtitle}>
          自动聚合 arXiv · HuggingFace · Anthropic · OpenAI 最新研究，中文摘要每日更新
        </p>
        <p className={styles.count}>{sorted.length} 篇</p>
      </header>
      <main className={styles.main}>
        {featured && <FeaturedArticle article={featured} />}
        <ArticleList articles={listArticles} />
      </main>
      <footer className={styles.footer}>
        <p>数据来源：arXiv · HuggingFace Daily Papers · Anthropic Blog · OpenAI Blog</p>
        <p>翻译由 Claude API 自动生成 · 每日北京时间 10:00 更新</p>
      </footer>
    </div>
  );
}
