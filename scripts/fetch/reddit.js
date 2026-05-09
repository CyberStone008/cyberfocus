import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const MAX_NEW = Math.max(maxPerSource(), 8);

const SUBREDDITS = [
  { sub: 'MachineLearning', sourceId: 'Reddit ML',       limit: 25 },
  { sub: 'LocalLLaMA',      sourceId: 'Reddit LocalLLaMA', limit: 25 },
];

async function fetchSubreddit(sub, sourceId, processedIds, limit) {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
  });
  if (!res.ok) throw new Error(`Reddit ${sub} returned ${res.status}`);

  const json = await res.json();
  const posts = json?.data?.children ?? [];
  const results = [];

  for (const { data: post } of posts) {
    if (!post || post.stickied) continue;
    if (results.length >= MAX_NEW) break;

    const canonicalId = `reddit:${post.id}`;
    if (processedIds && processedIds.has(canonicalId)) continue;

    const pubDate = post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : null;
    if (!isRecentBJ(pubDate, 2)) continue;

    const postUrl = post.url?.startsWith('https://www.reddit.com')
      ? post.url
      : (post.url || `https://www.reddit.com${post.permalink}`);

    results.push({
      id: canonicalId,
      slug: slugify(`reddit-${post.id}-${post.title}`),
      source: sourceId,
      sourceUrl: postUrl,
      commentUrl: `https://www.reddit.com${post.permalink}`,
      publishedAt: pubDate || new Date().toISOString(),
      titleEn: post.title,
      titleZh: null,
      abstractEn: post.selftext ? post.selftext.slice(0, 300) : '',
      abstractZh: null,
      authors: [`u/${post.author}`],
      institution: `Reddit r/${sub}`,
      docType: 'Blog',
      category: 'social',
      score: post.score || 0,
      commentCount: post.num_comments || 0,
      tags: post.link_flair_text ? [post.link_flair_text] : [],
    });
  }

  return results;
}

export async function fetchReddit(processedIds, disabledIds = new Set()) {
  const all = [];
  const activeSubreddits = SUBREDDITS.filter((s) => !disabledIds.has(s.sourceId));
  for (const { sub, sourceId, limit } of activeSubreddits) {
    try {
      console.log(`[reddit] Fetching r/${sub}...`);
      const items = await fetchSubreddit(sub, sourceId, processedIds, limit);
      console.log(`[reddit] r/${sub}: ${items.length} new posts`);
      all.push(...items);
    } catch (err) {
      console.warn(`[reddit] r/${sub} failed: ${err.message}`);
    }
  }
  return all;
}
