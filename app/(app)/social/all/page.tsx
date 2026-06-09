import articles from '../../../../data/articles.json';
import { Article } from '../../../types/article';
import { SocialFeed } from '../../../components/SocialFeed';
import { toSocialItem } from '../../../lib/feed-projection';
import { dedupeNews } from '../../../lib/dedupe';

export default function SocialAllPage() {
  const sorted = (articles as Article[])
    .filter((a) => a.category === 'social')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const social = dedupeNews(sorted).map(toSocialItem);

  return <SocialFeed articles={social} />;
}
