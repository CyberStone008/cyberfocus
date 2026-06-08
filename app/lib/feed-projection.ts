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
    tldrZh: a.tldrZh ?? null,
    publishedAt: a.publishedAt,
    fetchedAt: a.fetchedAt,
    score: a.score,
    commentCount: a.commentCount,
    commentUrl: a.commentUrl,
  };
}

// For ReportFeed (报告速览 / 机构动态): keep every field the cards render but
// DROP the heavy `contentMd` (full 解读 markdown). The feed never renders it —
// it only needs to know whether a 解读 exists and its length. That alone was
// ~1MB of inlined text on /reports.
export function toReportItem(a: Article): Article {
  const { contentMd, ...rest } = a;
  return {
    ...rest,
    hasContent: !!contentMd,
    contentLen: contentMd?.length ?? 0,
  };
}
