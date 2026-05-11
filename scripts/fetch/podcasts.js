/**
 * podcasts.js
 *
 * Fetches episodes from curated podcast RSS feeds.
 * Currently supports: Lex Fridman, 硅谷101
 *
 * Returns an array of PodcastEpisode objects (compatible with the
 * Article interface, stored in data/podcasts.json).
 */

import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'itunesDuration'],
      ['itunes:subtitle', 'itunesSubtitle'],
      ['itunes:summary', 'itunesSummary'],
      ['itunes:image', 'itunesImage'],
      ['enclosure', 'enclosure'],
    ],
  },
  timeout: 30_000,
});

const FEEDS = [
  {
    id:      'lex-fridman',
    source:  'Lex Fridman Podcast',
    feedUrl: 'https://lexfridman.com/feed/podcast/',
    lang:    'en',   // needs translation
    max:     30,
  },
];

/** Normalise iTunes duration "H:MM:SS" / "MM:SS" / raw-seconds to "Xh Ym" */
function parseDuration(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // raw seconds
  if (/^\d+$/.test(s)) {
    const total = parseInt(s, 10);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  // H:MM:SS or MM:SS
  const parts = s.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m] = parts;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (parts.length === 2) {
    const [m] = parts;
    return `${m}m`;
  }
  return s; // fallback — return as-is
}

function makeId(feedId, item) {
  // Use guid → enclosure url → title+date as fallback
  const raw = item.guid || item.enclosure?.url || `${item.title}${item.pubDate}`;
  // Create a stable short hash-like slug from the raw string
  let hash = 0;
  for (let i = 0; i < Math.min(raw.length, 64); i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `podcast:${feedId}:${hash.toString(36)}`;
}

export async function fetchPodcasts(processedIds = new Set()) {
  const results = [];

  for (const feed of FEEDS) {
    try {
      console.log(`[podcasts] Fetching ${feed.source} (${feed.feedUrl})…`);
      const rss = await parser.parseURL(feed.feedUrl);

      const items = (rss.items ?? []).slice(0, feed.max);
      let added = 0;

      for (const item of items) {
        const id = makeId(feed.id, item);
        if (processedIds.has(id)) continue;

        const title   = (item.title ?? '').trim();
        const pubDate = item.pubDate ? new Date(item.pubDate).toISOString()
                                     : new Date().toISOString();
        const excerpt = (item.itunesSubtitle || item.itunesSummary || item.contentSnippet || item.content || '')
          .replace(/<[^>]+>/g, '')   // strip HTML
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400);

        const duration = parseDuration(item.itunesDuration);
        const sourceUrl = item.link || item.enclosure?.url || '';
        // itunesImage can be a string URL, { href }, or { $: { href } } depending on the feed
        const rawThumb = item.itunesImage;
        const thumbnail =
          typeof rawThumb === 'string' ? rawThumb
          : rawThumb?.href        ? rawThumb.href
          : rawThumb?.['$']?.href ? rawThumb['$'].href
          : null;

        results.push({
          id,
          source:      feed.source,
          sourceUrl,
          publishedAt: pubDate,
          titleEn:     title,
          titleZh:     feed.lang === 'zh' ? title : null,  // 硅谷101 is already Chinese
          abstractEn:  feed.lang === 'zh' ? null : excerpt,
          abstractZh:  feed.lang === 'zh' ? excerpt : null,
          authors:     [],
          category:    'podcast',
          duration,
          thumbnail,
          // slug required by Article type
          slug: id.replace(/[^a-z0-9]/gi, '-').toLowerCase(),
        });
        added++;
      }

      console.log(`[podcasts] ${feed.source}: ${added} new episodes`);
    } catch (err) {
      console.warn(`[podcasts] Failed to fetch ${feed.source}: ${err.message}`);
    }
  }

  return results;
}
