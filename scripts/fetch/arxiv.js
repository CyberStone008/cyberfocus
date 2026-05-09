import Parser from 'rss-parser';
import { normalizeId } from '../utils/dedup.js';
import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const parser = new Parser({
  customFields: {
    item: [
      ['arxiv:announce_type', 'announce_type'],
      ['dc:creator', 'creator'],
    ],
  },
});

const FEEDS = [
  { url: 'https://arxiv.org/rss/cs.AI', source: 'arXiv cs.AI' },
];

const MAX_PER_FEED = maxPerSource();

function extractArxivId(link) {
  const match = link.match(/arxiv\.org\/abs\/([0-9]+\.[0-9]+)/i);
  return match ? match[1] : null;
}

function stripAbstractPrefix(text) {
  if (!text) return '';
  return text
    .replace(/arXiv:\S+\s+Announce\s+Type:\s*\w+\s*Abstract:\s*/i, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export async function fetchArxiv() {
  const seenIds = new Set();
  const results = [];

  for (const { url, source } of FEEDS) {
    try {
      console.log(`[arxiv] Fetching ${source}...`);
      const feed = await parser.parseURL(url);
      let count = 0;

      for (const item of feed.items) {
        // Only process new announcements, skip cross-listings
        if (item.announce_type && item.announce_type !== 'new') continue;

        // Only recent papers (last 2 days, Beijing time) — arXiv updates ~8am BJT
        if (!isRecentBJ(item.pubDate, 2)) continue;

        const arxivId = extractArxivId(item.link || item.guid || '');
        if (!arxivId) continue;

        const canonicalId = normalizeId(arxivId, 'arxiv');
        // Skip if already seen across feeds
        if (seenIds.has(canonicalId)) continue;
        seenIds.add(canonicalId);

        const authors = (item.creator || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5);

        const titleEn = (item.title || '').trim();
        results.push({
          id: canonicalId,
          slug: `${slugify(titleEn)}-${arxivId.replace('.', '-')}`,
          source,
          sourceUrl: item.link || `https://arxiv.org/abs/${arxivId}`,
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          titleEn,
          titleZh: null,
          abstractEn: stripAbstractPrefix(item.contentSnippet || item.content || '').slice(0, 400),
          abstractZh: null,
          authors,
          institution: 'arXiv',
          docType: 'Paper',
          category: 'research',
        });

        count++;
        if (count >= MAX_PER_FEED) break;
      }

      console.log(`[arxiv] ${source}: ${count} new items`);
    } catch (err) {
      console.warn(`[arxiv] Failed to fetch ${source}: ${err.message}`);
    }
  }

  return results;
}
