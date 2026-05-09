/**
 * Google DeepMind blog fetcher
 * Uses Google News RSS (same approach as hr-orgs) since DeepMind has no public RSS feed.
 */

import { createHash } from 'crypto';

const LOOKBACK_DAYS = 7;
const MAX_ITEMS = 10;

function hash6(str) {
  return createHash('sha1').update(str).digest('hex').slice(0, 8);
}

function parseGoogleNewsDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function stripCdata(str) {
  return str?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() ?? '';
}

export async function fetchDeepMind() {
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400_000;

  // Search specifically for Google DeepMind research / blog posts
  const queries = [
    'Google DeepMind research blog',
    'DeepMind AI model release announcement',
  ];

  const articles = [];
  const seen = new Set();

  for (const q of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS reader)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const [, block] of items) {
        const title     = stripCdata(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
        const rawLink   = stripCdata(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
        const rawGuid   = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] || '';
        const link      = rawLink || rawGuid;
        const pubDate   = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '';
        const source    = stripCdata(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '');

        if (!title || !link) continue;

        const publishedAt = parseGoogleNewsDate(pubDate);
        if (!publishedAt || new Date(publishedAt).getTime() < cutoff) continue;

        // Only keep articles from DeepMind / Google DeepMind sources
        const titleLower  = title.toLowerCase();
        const sourceLower = source.toLowerCase();
        const isDeepMind  =
          sourceLower.includes('deepmind') ||
          titleLower.includes('deepmind') ||
          sourceLower.includes('google research') ||
          (sourceLower.includes('google') && titleLower.includes('gemini'));

        if (!isDeepMind) continue;

        const id = `deepmind:${hash6(link)}`;
        if (seen.has(id)) continue;
        seen.add(id);

        articles.push({
          id,
          source: 'Google DeepMind',
          sourceUrl: link,
          publishedAt,
          titleEn: title,
          abstractEn: `${source ? `[${source}] ` : ''}${title}`,
          authors: [],
          category: 'research',
        });

        if (articles.length >= MAX_ITEMS) break;
      }
    } catch (err) {
      console.warn(`[deepmind] fetch error for "${q}": ${err.message}`);
    }

    if (articles.length >= MAX_ITEMS) break;
  }

  console.log(`[deepmind] ${articles.length} new articles`);
  return articles;
}
