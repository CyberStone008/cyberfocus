import { Article } from '../types/article';
import { SocialItem } from '../components/SocialFeed';

// Projects a full Article row down to just the fields a social card renders.
// The feed pages serialize their entire filtered list into static HTML, so
// dropping unused heavy fields (abstracts, tags, contentMd, authors…) shrinks
// the payload dramatically — /social went from ~4.8MB of inlined data.
export function toSocialItem(a: Article): SocialItem {
  return {
    id: a.id,
    source: a.source,
    sourceUrl: a.sourceUrl,
    titleEn: a.titleEn,
    titleZh: a.titleZh,
    publishedAt: a.publishedAt,
    fetchedAt: a.fetchedAt,
    score: a.score,
    commentCount: a.commentCount,
    commentUrl: a.commentUrl,
  };
}
