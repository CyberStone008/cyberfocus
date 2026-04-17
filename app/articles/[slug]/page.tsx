import Link from 'next/link';
import { notFound } from 'next/navigation';
import articles from '../../../data/articles.json';
import { Article } from '../../types/article';
import { ArticleHeader } from '../../components/ArticleHeader';
import { MarkdownContent } from '../../components/MarkdownContent';
import { TableOfContents } from '../../components/TableOfContents';
import { ArticleNavigation } from '../../components/ArticleNavigation';
import { ArticleFooter } from '../../components/ArticleFooter';
import { ThemeToggle } from '../../components/ThemeToggle';
import { extractToc } from '../../lib/toc';
import styles from './page.module.css';

const data = articles as Article[];

export function generateStaticParams() {
  // Only generate pages for articles that have full Markdown content
  return data
    .filter((a) => a.contentMd && a.slug)
    .map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = data.find((a) => a.slug === slug);
  if (!article) return {};
  return {
    title: `${article.titleZh ?? article.titleEn} | AI 研究速览`,
    description: article.abstractZh ?? article.abstractEn,
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = data.find((a) => a.slug === slug);

  if (!article || !article.contentMd) {
    notFound();
  }

  // Determine prev/next by publishedAt order (desc)
  const withContent = data
    .filter((a) => a.contentMd && a.slug)
    .sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  const currentIndex = withContent.findIndex((a) => a.slug === slug);
  const prev = currentIndex > 0 ? withContent[currentIndex - 1] : undefined;
  const next = currentIndex < withContent.length - 1 ? withContent[currentIndex + 1] : undefined;

  const toc = extractToc(article.contentMd);
  const showToc = toc.length >= 3;

  return (
    <div className={styles.page}>
      <ThemeToggle />
      <nav className={styles.topNav}>
        <Link href="/" className={styles.backLink}>
          ← 返回首页
        </Link>
      </nav>

      <div className={styles.layout}>
        {showToc && (
          <aside className={styles.sidebar}>
            <TableOfContents entries={toc} />
          </aside>
        )}

        <main className={styles.main}>
          <ArticleHeader article={article} />

          {showToc && (
            <div className={styles.mobileToc}>
              <TableOfContents entries={toc} />
            </div>
          )}

          <MarkdownContent content={article.contentMd} />

          <ArticleFooter article={article} />

          <ArticleNavigation
            prev={prev && { slug: prev.slug, titleZh: prev.titleZh, titleEn: prev.titleEn }}
            next={next && { slug: next.slug, titleZh: next.titleZh, titleEn: next.titleEn }}
          />
        </main>
      </div>
    </div>
  );
}
