import Link from 'next/link';
import { notFound } from 'next/navigation';
import articles from '../../../../data/articles.json';
import { Article } from '../../../types/article';
import { ArticleHeader } from '../../../components/ArticleHeader';
import { MarkdownContent } from '../../../components/MarkdownContent';
import { TableOfContents } from '../../../components/TableOfContents';
import { ArticleNavigation } from '../../../components/ArticleNavigation';
import { ArticleFooter } from '../../../components/ArticleFooter';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { ShareButton } from '../../../components/ShareButton';
import { extractToc, mergeBilingualHeadings, isMostlyLatin } from '../../../lib/toc';
import styles from './page.module.css';

const data = articles as Article[];

export function generateStaticParams() {
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

  const withContent = data
    .filter((a) => a.contentMd && a.slug)
    .sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  const currentIndex = withContent.findIndex((a) => a.slug === slug);
  const prev = currentIndex > 0 ? withContent[currentIndex - 1] : undefined;
  const next = currentIndex < withContent.length - 1 ? withContent[currentIndex + 1] : undefined;

  const contentMd = (() => {
    let lines = article.contentMd.split('\n');
    const norm = (s: string) => s.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').trim();
    const titleZh = (article.titleZh ?? '').replace(/\*\*/g, '').trim();
    const titleEn = (article.titleEn ?? '').replace(/\*\*/g, '').trim();

    // 1) Strip the leading title heading + its bilingual subtitle when either
    //    side matches the title shown in ArticleHeader. The two languages are
    //    translated separately, so only one side may match (e.g. the EN subtitle).
    const fi = lines.findIndex((l) => /^#{1,3}\s/.test(l));
    if (fi !== -1) {
      const matches = (t: string) => !!t && (t === titleZh || t === titleEn);
      let k = fi + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      const subIdx = k < lines.length && /^#{1,3}\s/.test(lines[k]) ? k : -1;
      if (matches(norm(lines[fi])) || (subIdx !== -1 && matches(norm(lines[subIdx])))) {
        const end = subIdx !== -1 && (matches(norm(lines[subIdx])) || isMostlyLatin(norm(lines[subIdx]))) ? subIdx : fi;
        lines = lines.slice(0, fi).concat(lines.slice(end + 1));
      }
    }

    // 2) Collapse bilingual section heading pairs (dedup TOC + content).
    return mergeBilingualHeadings(lines.join('\n')).trimStart();
  })();

  const toc = extractToc(contentMd);
  const showToc = toc.length >= 3;

  return (
    <div className={styles.page}>
      <ThemeToggle />
      <nav className={styles.topNav}>
        <Link
          href={article.category === 'research' || article.seriesSlug ? '/reports' : '/feed'}
          className={styles.backLink}
        >
          ← 返回列表
        </Link>
      </nav>

      <div className={`${styles.layout} ${showToc ? styles.layoutWithSidebar : ''}`}>
        {showToc && (
          <aside className={styles.sidebar}>
            <TableOfContents entries={toc} />
          </aside>
        )}

        <main className={styles.main}>
          <div className={styles.shareRow}>
            <ShareButton shortSlug={slug} />
          </div>
          <ArticleHeader article={article} />

          {showToc && (
            <div className={styles.mobileToc}>
              <TableOfContents entries={toc} />
            </div>
          )}

          <MarkdownContent content={contentMd} />

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
