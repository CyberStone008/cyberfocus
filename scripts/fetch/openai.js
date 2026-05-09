import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

// OpenAI individual pages are protected by Cloudflare (JS challenge).
// We derive articles from the public research sitemap instead:
// - URL + lastmod from sitemap.xml/research/
// - Title inferred from URL slug (high quality, e.g. "evaluating-chain-of-thought-monitorability")
// - Abstract left empty; the translation step can optionally fill it via Claude

const SITEMAP_URL = 'https://openai.com/sitemap.xml/research/';
const MAX_NEW = maxPerSource();

// Common AI/tech abbreviations that should be fully uppercase
const ABBREVS = new Set([
  'gpt', 'ai', 'ml', 'llm', 'rlhf', 'rl', 'api', 'gpu', 'tpu',
  'swe', 'qa', 'nlp', 'cv', 'vqa', 'vit', 'bert', 'gnn', 'gan',
  'agi', 'rnn', 'lstm', 'moe', 'kv', 'cot', 'rag',
]);

function slugToTitle(slug) {
  return slug
    .split('-')
    .map((w) => (ABBREVS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function parseXmlLocLastmod(xml) {
  const entries = [];
  // Match each <url>...</url> block
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of urlBlocks) {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
    const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!locMatch) continue;
    const loc = locMatch[1].trim();
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : null;
    entries.push({ loc, lastmod });
  }
  return entries;
}

export async function fetchOpenAI(processedIds) {
  try {
    console.log('[openai] Fetching research sitemap...');
    const res = await fetch(SITEMAP_URL, {
      headers: { 'User-Agent': 'ai-research-aggregator/1.0 (sitemap reader)' },
    });
    if (!res.ok) {
      console.warn(`[openai] Sitemap returned ${res.status}. Skipping.`);
      return [];
    }

    const xml = await res.text();
    const entries = parseXmlLocLastmod(xml);

    // Keep only /index/... article pages, exclude bare /news/ index
    const articles = entries.filter(
      (e) => /openai\.com\/index\/[a-z0-9-]+\/?$/.test(e.loc)
    );

    // Sort newest first by lastmod
    articles.sort((a, b) => {
      if (!a.lastmod) return 1;
      if (!b.lastmod) return -1;
      return new Date(b.lastmod) - new Date(a.lastmod);
    });

    console.log(`[openai] Found ${articles.length} research articles in sitemap`);

    const results = [];

    for (const { loc, lastmod } of articles) {
      if (results.length >= MAX_NEW) break;

      // Only articles from the last 3 days (processedIds handles dedup)
      if (!isRecentBJ(lastmod, 3)) continue;

      const urlSlug = loc.replace(/\/$/, '').split('/').pop();
      const canonicalId = `openai:${urlSlug}`;

      if (processedIds && processedIds.has(canonicalId)) continue;

      const titleEn = slugToTitle(urlSlug);

      results.push({
        id: canonicalId,
        slug: slugify(titleEn),
        source: 'OpenAI Blog',
        sourceUrl: loc,
        publishedAt: lastmod ? new Date(lastmod).toISOString() : new Date().toISOString(),
        titleEn,
        titleZh: null,
        abstractEn: '',
        abstractZh: null,
        authors: ['OpenAI'],
        institution: 'OpenAI',
        docType: 'Blog',
        category: 'research',
        tags: [],
      });

      console.log(`[openai] Added: ${urlSlug}`);
    }

    console.log(`[openai] ${results.length} new articles`);
    return results;
  } catch (err) {
    console.warn(`[openai] Fetch failed: ${err.message}`);
    return [];
  }
}
