import articles from '../../../data/articles.json';
import { Article } from '../../types/article';
import { FeedList } from '../../components/FeedList';

export default function FeedPage() {
  const sorted = (articles as Article[]).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return <FeedList articles={sorted} />;
}
