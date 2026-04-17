import { normalizeId } from '../utils/dedup.js';
import { slugify } from '../utils/slug.js';
import { isTodayBJ, maxPerSource } from '../utils/date-filter.js';

const API_URL = 'https://huggingface.co/api/daily_papers';
const MAX_ITEMS = maxPerSource();

export async function fetchHuggingFace() {
  try {
    console.log('[huggingface] Fetching daily papers...');
    const res = await fetch(API_URL, {
      headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const results = [];

    for (const entry of data) {
      if (results.length >= MAX_ITEMS) break;
      const paper = entry.paper;
      if (!paper?.id) continue;

      // Only today's (Beijing time) papers
      if (!isTodayBJ(paper.publishedAt)) continue;

      // HuggingFace paper.id is the arXiv ID — normalize to arxiv: namespace
      const canonicalId = normalizeId(paper.id, 'huggingface');

      const authors = (paper.authors || [])
        .map((a) => a.name || a)
        .filter(Boolean)
        .slice(0, 5);

      const institution =
        paper.organization?.fullname ||
        paper.organization?.name ||
        'HuggingFace Daily';

      const titleEn = (paper.title || '').trim();
      results.push({
        id: canonicalId,
        slug: `${slugify(titleEn)}-${paper.id.replace('.', '-')}`,
        source: 'HuggingFace Daily',
        sourceUrl: `https://arxiv.org/abs/${paper.id}`,
        publishedAt: paper.publishedAt
          ? new Date(paper.publishedAt).toISOString()
          : new Date().toISOString(),
        titleEn,
        titleZh: null,
        abstractEn: (paper.summary || paper.ai_summary || '').slice(0, 400),
        abstractZh: null,
        authors,
        institution,
        docType: 'Paper',
        thumbnail: entry.thumbnail || paper.thumbnail || undefined,
      });
    }

    console.log(`[huggingface] ${results.length} papers fetched`);
    return results;
  } catch (err) {
    console.warn(`[huggingface] Fetch failed: ${err.message}`);
    return [];
  }
}
