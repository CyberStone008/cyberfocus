import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Article } from '../../../types/article';
import { ArticleHeader } from '../../../components/ArticleHeader';
import { MarkdownContent } from '../../../components/MarkdownContent';
import { TableOfContents } from '../../../components/TableOfContents';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { ShareButton } from '../../../components/ShareButton';
import { extractToc } from '../../../lib/toc';
import styles from './page.module.css';

type Episode = Article & { duration?: string | null; analyzedAt?: string };

function loadPodcasts(): Episode[] {
  const path = resolve(process.cwd(), 'data/podcasts.json');
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return []; }
}

export function generateStaticParams() {
  return loadPodcasts()
    .filter((e) => e.contentMd && e.slug)
    .map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ep = loadPodcasts().find((e) => e.slug === slug);
  if (!ep) return {};
  return {
    title: `${ep.titleZh ?? ep.titleEn} | 播客解读`,
    description: ep.abstractZh ?? ep.abstractEn,
  };
}

export default async function PodcastDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const episodes = loadPodcasts();
  const ep = episodes.find((e) => e.slug === slug);

  if (!ep || !ep.contentMd) notFound();

  // Sibling navigation — only among episodes with analyses
  const analysed = episodes
    .filter((e) => e.contentMd && e.slug)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const idx  = analysed.findIndex((e) => e.slug === slug);
  const prev = idx > 0 ? analysed[idx - 1] : undefined;
  const next = idx < analysed.length - 1 ? analysed[idx + 1] : undefined;

  // Strip duplicate leading heading if it matches the title
  const contentMd = (() => {
    const lines = ep.contentMd.split('\n');
    const firstH = lines.findIndex((l) => /^#{1,2}\s/.test(l));
    if (firstH === -1) return ep.contentMd;
    const headingText = lines[firstH].replace(/^#{1,2}\s+/, '').trim();
    const titleText   = (ep.titleZh ?? ep.titleEn).trim();
    if (headingText === titleText) {
      return lines.slice(0, firstH).concat(lines.slice(firstH + 1)).join('\n').trimStart();
    }
    return ep.contentMd;
  })();

  const toc     = extractToc(contentMd);
  const showToc = toc.length >= 3;

  // Cast episode to Article for shared components
  const asArticle: Article = {
    ...ep,
    authors:  ep.authors ?? [],
    docType:  undefined,
    category: 'podcast' as const,
  };

  return (
    <div className={styles.page}>
      <ThemeToggle />

      <nav className={styles.topNav}>
        <Link href="/podcast" className={styles.backLink}>
          ← 精选播客
        </Link>
      </nav>

      <div className={`${styles.layout} ${showToc ? styles.layoutWithSidebar : ''}`}>
        {showToc && (
          <aside className={styles.sidebar}>
            <TableOfContents entries={toc} />
          </aside>
        )}

        <main className={styles.main}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <ShareButton />
          </div>
          {/* Custom header — shows duration badge instead of docType */}
          <PodcastDetailHeader ep={ep} />

          {showToc && (
            <div className={styles.mobileToc}>
              <TableOfContents entries={toc} />
            </div>
          )}

          <MarkdownContent content={contentMd} />

          {/* Navigation */}
          {(prev || next) && (
            <nav className={styles.episodeNav}>
              {prev ? (
                <Link href={`/podcast/${prev.slug}`} className={styles.navPrev}>
                  <span className={styles.navLabel}>← 上一集</span>
                  <span className={styles.navTitle}>{prev.titleZh ?? prev.titleEn}</span>
                </Link>
              ) : <div />}
              {next ? (
                <Link href={`/podcast/${next.slug}`} className={styles.navNext}>
                  <span className={styles.navLabel}>下一集 →</span>
                  <span className={styles.navTitle}>{next.titleZh ?? next.titleEn}</span>
                </Link>
              ) : <div />}
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Custom episode header ── */
function PodcastDetailHeader({ ep }: { ep: Episode }) {
  const date = ep.publishedAt?.slice(0, 10) ?? '';
  return (
    <header className={styles.header}>
      <h1 className={styles.titleZh}>{ep.titleZh ?? ep.titleEn}</h1>
      {ep.titleZh && <p className={styles.titleEn}>{ep.titleEn}</p>}
      <div className={styles.metaRow}>
        <span className={styles.metaBadge}>🎙️ Lex Fridman Podcast</span>
        {ep.duration && <span className={styles.metaItem}>⏱ {ep.duration}</span>}
        {date && <span className={styles.metaItem}>📅 {date}</span>}
        <a
          href={ep.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.listenLink}
        >
          收听原版 →
        </a>
      </div>
    </header>
  );
}
