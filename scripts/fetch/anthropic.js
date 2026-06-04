import { RateLimiter } from '../utils/rate-limiter.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const SITEMAP_URL = 'https://www.anthropic.com/sitemap.xml';
const MAX_NEW = maxPerSource();
const limiter = new RateLimiter(0.5); // 1 request per 2 seconds

function extractMeta(html, property) {
  const match =
    html.match(new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`, 'i')) ||
    html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${property}["']`, 'i'));
  return match ? match[1].trim() : null;
}

function extractDate(html) {
  // Try <time> tag
  const timeMatch = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
  if (timeMatch) return timeMatch[1];
  // Try JSON-LD
  const jsonldMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (jsonldMatch) return jsonldMatch[1];
  // Try og:article:published_time
  const ogDate = extractMeta(html, 'article:published_time');
  if (ogDate) return ogDate;
  return null;
}

function slugFromUrl(url) {
  return url.replace(/\/$/, '').split('/').pop();
}

// Returns [{loc, lastmod}] for /news/ posts. The sitemap HAS <lastmod> on every
// entry — use it to sort+filter so we only fetch the few RECENT pages, instead of
// scanning 40 alphabetically-ordered URLs (which timed out and missed new posts).
async function fetchSitemapUrls() {
  const res = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  const xml = await res.text();

  const entries = [];
  const re = /<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1].trim();
    const lastmod = m[2].trim();
    if (loc.includes('/news/') && !loc.endsWith('/news/')) {
      entries.push({ loc, lastmod });
    }
  }
  return entries;
}

const CANDIDATE_LASTMOD_DAYS = 7;  // pre-filter by sitemap lastmod (broad)
const MAX_CANDIDATES = 25;         // cap pages fetched per run (avoid timeout)

export async function fetchAnthropic(processedIds) {
  try {
    console.log('[anthropic] Fetching sitemap...');
    const all = await fetchSitemapUrls();
    console.log(`[anthropic] Found ${all.length} news URLs in sitemap`);

    // Only recent-by-lastmod, newest first, capped — so we fetch a handful, not 40+
    const candidates = all
      .filter((e) => e.lastmod && isRecentBJ(e.lastmod, CANDIDATE_LASTMOD_DAYS))
      .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod))
      .slice(0, MAX_CANDIDATES);
    console.log(`[anthropic] ${candidates.length} recent candidates (lastmod ≤ ${CANDIDATE_LASTMOD_DAYS}d)`);

    const results = [];

    for (const { loc: url, lastmod } of candidates) {
      if (results.length >= MAX_NEW) break;

      const slug = slugFromUrl(url);
      const canonicalId = `anthropic:${slug}`;

      if (processedIds.has(canonicalId)) continue;

      try {
        await limiter.wait();
        const res = await fetch(url, {
          headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;

        const html = await res.text();
        const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
        const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
        // Real publish date from page (datePublished/article:published_time); fall back to lastmod
        const dateStr = extractDate(html) || lastmod;

        if (!title) continue;
        // Genuinely new: real publish date within 3 days (filters re-touched old posts)
        if (!isRecentBJ(dateStr, 3)) continue;

        results.push({
          id: canonicalId,
          slug: slug,
          source: 'Anthropic Blog',
          sourceUrl: url,
          publishedAt: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
          titleEn: title.replace(' \\ Anthropic', '').replace(' | Anthropic', '').trim(),
          titleZh: null,
          abstractEn: (description || '').slice(0, 400),
          abstractZh: null,
          authors: ['Anthropic'],
          institution: 'Anthropic',
          docType: 'Blog',
          category: 'research',
        });

        console.log(`[anthropic] Added: ${slug}`);
      } catch (err) {
        console.warn(`[anthropic] Failed to fetch ${url}: ${err.message}`);
      }
    }

    console.log(`[anthropic] ${results.length} new articles`);
    return results;
  } catch (err) {
    console.warn(`[anthropic] Fetch failed: ${err.message}`);
    return [];
  }
}
