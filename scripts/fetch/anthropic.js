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

async function fetchSitemapUrls() {
  const res = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  const xml = await res.text();

  const urls = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url.includes('/news/') && !url.endsWith('/news/')) {
      urls.push(url);
    }
  }
  return urls;
}

export async function fetchAnthropic(processedIds) {
  try {
    console.log('[anthropic] Fetching sitemap...');
    const allUrls = await fetchSitemapUrls();
    console.log(`[anthropic] Found ${allUrls.length} news URLs in sitemap`);

    const results = [];
    let scanned = 0;
    const MAX_SCAN = 40; // bail out after scanning this many pages per run

    for (const url of allUrls) {
      if (results.length >= MAX_NEW) break;
      if (scanned >= MAX_SCAN) break;
      scanned++;

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
        const dateStr = extractDate(html);

        if (!title) continue;
        // Only articles from the last 3 days (processedIds handles dedup)
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
