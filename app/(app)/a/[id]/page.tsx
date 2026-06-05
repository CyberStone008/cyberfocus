import { notFound } from 'next/navigation';
import articles from '../../../../data/articles.json';
import { Article } from '../../../types/article';
import { shortId } from '../../../lib/shortid';
import { Redirect } from '../../../components/Redirect';

// Short shareable links: /a/<id> → redirects to /articles/<slug>/.
// One static page per article with content, baked with the redirect target.
const data = articles as Article[];
const withContent = data.filter((a) => a.contentMd && a.slug);

export function generateStaticParams() {
  return withContent.map((a) => ({ id: shortId(a.slug as string) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = withContent.find((a) => shortId(a.slug as string) === id);
  if (!article) return {};
  return {
    title: `${article.titleZh ?? article.titleEn} | AI 研究速览`,
    description: article.abstractZh ?? article.abstractEn,
  };
}

export default async function ShortLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = withContent.find((a) => shortId(a.slug as string) === id);
  if (!article) notFound();

  return <Redirect to={`/articles/${article.slug}/`} />;
}
