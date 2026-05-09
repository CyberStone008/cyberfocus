import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const HN_API   = 'https://hacker-news.firebaseio.com/v0';
const MAX_NEW  = Math.max(maxPerSource(), 10); // social needs more items
const MAX_SCAN = 100; // top stories to scan

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'gemini', 'mistral', 'llama',
  'machine learning', 'deep learning', 'neural', 'transformer',
  'openai', 'anthropic', 'deepmind', 'hugging face', 'diffusion',
  'chatgpt', 'copilot', 'agent', 'rag', 'fine-tun', 'inference',
  'reinforcement', 'multimodal', 'embedding', 'vector',
  '大模型', '人工智能',
];

function isAiRelated(title = '', url = '') {
  const text = (title + ' ' + url).toLowerCase();
  return AI_KEYWORDS.some((kw) => text.includes(kw));
}

export async function fetchHackerNews(processedIds) {
  try {
    console.log('[hackernews] Fetching top stories...');
    const res = await fetch(`${HN_API}/topstories.json`);
    if (!res.ok) throw new Error(`HN API ${res.status}`);

    const ids = (await res.json()).slice(0, MAX_SCAN);
    const results = [];

    await Promise.all(
      ids.map(async (id) => {
        if (results.length >= MAX_NEW) return;
        try {
          const r = await fetch(`${HN_API}/item/${id}.json`);
          if (!r.ok) return;
          const item = await r.json();
          if (!item || item.type !== 'story' || !item.title) return;

          const canonicalId = `hn:${item.id}`;
          if (processedIds && processedIds.has(canonicalId)) return;

          const pubDate = item.time ? new Date(item.time * 1000).toISOString() : null;
          if (!isRecentBJ(pubDate, 2)) return;
          if (!isAiRelated(item.title, item.url || '')) return;

          results.push({
            id: canonicalId,
            slug: slugify(`hn-${item.id}-${item.title}`),
            source: 'Hacker News',
            sourceUrl: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            commentUrl: `https://news.ycombinator.com/item?id=${item.id}`,
            publishedAt: pubDate || new Date().toISOString(),
            titleEn: item.title,
            titleZh: null,
            abstractEn: '',
            abstractZh: null,
            authors: [item.by || 'HN'],
            institution: 'Hacker News',
            docType: 'Blog',
            category: 'social',
            score: item.score || 0,
            commentCount: item.descendants || 0,
            tags: [],
          });
        } catch { /* skip item */ }
      })
    );

    // Sort by score descending
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = results.slice(0, MAX_NEW);
    console.log(`[hackernews] ${top.length} new AI stories`);
    return top;
  } catch (err) {
    console.warn(`[hackernews] Fetch failed: ${err.message}`);
    return [];
  }
}
