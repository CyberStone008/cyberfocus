import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const HN_API   = 'https://hacker-news.firebaseio.com/v0';
const MAX_NEW  = Math.max(maxPerSource(), 10); // social needs more items
const MAX_SCAN = 100; // top stories to scan

/**
 * Word-boundary regex patterns to avoid false positives.
 * Example: plain `includes('ai')` would match "airshow", "aircraft", "main", "said".
 * Patterns are case-insensitive and require word boundaries where the keyword is short.
 */
const AI_PATTERNS = [
  // Short tokens that REQUIRE word boundaries to avoid false positives
  /\bai\b/i,                 // "AI" as standalone — not airshow / aircraft / main
  /\bai[-/]/i,               // "AI-", "AI/"  (e.g. "AI-powered", "AI/ML")
  /agentic/i,                // "agentic AI", "agentic trading"
  /\bllm[s]?\b/i,
  /\bgpt[-0-9]?/i,
  /\bagi\b/i,
  /\brag\b/i,                // RAG (retrieval) — not dragon/fragment
  /\bagent[s]?\b/i,          // agent / agents — not agency / fragment
  /\bvector\b/i,
  // Distinctive multi-letter tokens — safe to use substring
  /claude/i,
  /gemini/i,
  /mistral/i,
  /llama/i,
  /openai/i,
  /anthropic/i,
  /deepmind/i,
  /chatgpt/i,
  /copilot/i,
  /diffusion/i,
  /transformer/i,
  /inference/i,
  /multimodal/i,
  /embedding/i,
  /hugging\s*face/i,
  /reinforcement/i,
  /fine[- ]?tun/i,
  /machine\s+learning/i,
  /deep\s+learning/i,
  /neural\s+net/i,
  /大模型/,
  /人工智能/,
  /生成式/,
];

function isAiRelated(title = '', url = '') {
  const text = title + ' ' + url;
  return AI_PATTERNS.some((re) => re.test(text));
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
