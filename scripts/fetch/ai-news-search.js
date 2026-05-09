/**
 * scripts/fetch/ai-news-search.js
 *
 * Fetch the latest AI news via Google News RSS (no API key required).
 * Multiple search queries are run to cover different angles; results are
 * deduplicated by URL before returning.
 */

import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { isRecentBJ } from '../utils/date-filter.js';

const parser = new Parser({ timeout: 12000 });

// ── Search queries ──────────────────────────────────────────────────────────
// Aligned with the 5 search angles used in the Cowork "Daily ai news" task:
//   1. General AI news
//   2. Major AI company updates (OpenAI / Anthropic / DeepMind / Meta)
//   3. LLM / model breakthrough or release
//   4. AI regulation & policy
//   5. AI product / funding / M&A
const QUERIES = [
  'AI news today artificial intelligence',
  'OpenAI OR Anthropic OR "Google DeepMind" OR "Meta AI" latest',
  'LLM OR "large language model" breakthrough OR release',
  'AI regulation OR "AI policy" OR "AI safety" news',
  'AI startup funding OR acquisition OR "product launch"',
];

const MAX_PER_QUERY  = 6;   // max items to keep per query after date filter
const LOOKBACK_DAYS  = 1;   // only keep articles from the last N days (Beijing time)

function buildFeedUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Google News URLs are redirects (CBMi… encoded).
 * We keep them as-is — browsers follow the redirect to the real article.
 * Resolving them via HEAD requests blocks the pipeline, so we skip that step.
 */
function resolveUrl(googleUrl) {
  return googleUrl;
}

/**
 * Extract the real source name from Google News item title.
 * Google News titles look like: "Article headline - Source Name"
 */
function parseSourceAndTitle(rawTitle) {
  const sep = rawTitle.lastIndexOf(' - ');
  if (sep > 0) {
    return {
      titleEn: rawTitle.slice(0, sep).trim(),
      source: rawTitle.slice(sep + 3).trim(),
    };
  }
  return { titleEn: rawTitle.trim(), source: 'Google News' };
}

function urlToId(url) {
  return `gnews:${createHash('md5').update(url).digest('hex').slice(0, 12)}`;
}

/** Normalize a title to a short fingerprint for duplicate detection */
function titleFingerprint(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')  // keep ASCII alnum + CJK
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 9)   // first 9 words / tokens
    .join(' ');
}

// ── Main export ─────────────────────────────────────────────────────────────
export async function fetchAINewsSearch(processedIds, existingTitles = new Set()) {
  const seenUrls   = new Set();
  const seenTitles = new Set(existingTitles); // pre-seed with already-stored titles
  const results    = [];

  for (const query of QUERIES) {
    let feed;
    try {
      // Use global fetch (proxy-aware) to download the XML, then parse as string
      const res = await fetch(buildFeedUrl(query), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ai-research-aggregator/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      feed = await parser.parseString(xml);
    } catch (err) {
      console.warn(`[ai-news-search] query "${query}" failed: ${err.message}`);
      continue;
    }

    let kept = 0;
    for (const item of feed.items ?? []) {
      if (kept >= MAX_PER_QUERY) break;

      const pubDate = item.isoDate || item.pubDate || null;
      if (!isRecentBJ(pubDate, LOOKBACK_DAYS)) continue;

      const rawTitle = item.title?.trim() ?? '';
      if (!rawTitle) continue;

      // Resolve the real URL (Google News uses a redirect)
      const realUrl = resolveUrl(item.link ?? '');
      if (seenUrls.has(realUrl)) continue;
      seenUrls.add(realUrl);

      const id = urlToId(realUrl);
      if (processedIds && processedIds.has(id)) continue;

      const { titleEn, source: publisher } = parseSourceAndTitle(rawTitle);

      // Skip near-duplicate titles (same story from different publishers)
      const fp = titleFingerprint(titleEn);
      if (seenTitles.has(fp)) continue;
      seenTitles.add(fp);

      const abstract = item.contentSnippet?.trim() ?? item.content?.trim() ?? '';

      results.push({
        id,
        slug: id.replace(':', '-'),
        source:      'Google AI News',
        sourceUrl:   realUrl,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        titleEn,
        titleZh:     null,
        abstractEn:  abstract.slice(0, 400),
        abstractZh:  null,
        authors:     [publisher],
        institution: publisher,
        docType:     'Blog',
        category:    'social',
        score:       0,
        commentCount: 0,
        tags:        ['AI News'],
      });

      kept++;
    }

    console.log(`[ai-news-search] "${query}": ${kept} new articles`);
  }

  console.log(`[ai-news-search] Total: ${results.length} new articles`);
  return results;
}
