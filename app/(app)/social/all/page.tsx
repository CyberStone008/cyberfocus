import articles from '../../../../data/articles.json';
import { Article } from '../../../types/article';
import { SocialFeed } from '../../../components/SocialFeed';
import { toSocialItem } from '../../../lib/feed-projection';

export default function SocialAllPage() {
  const social = (articles as Article[])
    .filter((a) => a.category === 'social')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(toSocialItem);

  return <SocialFeed articles={social} />;
}
