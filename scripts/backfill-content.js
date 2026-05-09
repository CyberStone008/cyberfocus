#!/usr/bin/env node
/**
 * Backfill contentMd for articles that have a slug but no full-text yet.
 *
 * Usage:
 *   USE_CLAUDE_CLI=true node scripts/backfill-content.js          # all without content
 *   USE_CLAUDE_CLI=true node scripts/backfill-content.js 4        # first N without content
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateFeaturedContent, fetchAnthropicSourceMd } from './translate/featured-content.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');

const limit = parseInt(process.argv[2] || '99', 10);

const articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));

// Candidates: have a slug but no contentMd
const candidates = articles
  .filter((a) => a.slug && !a.contentMd)
  .slice(0, limit);

if (candidates.length === 0) {
  console.log('[backfill] Nothing to do — all articles already have content.');
  process.exit(0);
}

console.log(`[backfill] Will generate content for ${candidates.length} article(s):`);
candidates.forEach((a) => console.log(`  - ${a.id}`));

for (const article of candidates) {
  console.log(`\n[backfill] Processing: ${article.titleEn}`);

  try {
    let sourceMd = null;

    if (article.source === 'Anthropic Blog') {
      console.log(`[backfill]   Fetching Anthropic source page...`);
      sourceMd = await fetchAnthropicSourceMd(article);
      if (sourceMd) {
        console.log(`[backfill]   Got source text (${sourceMd.length} chars)`);
      } else {
        console.log(`[backfill]   No source text — generating from abstract`);
      }
    }

    let contentMd, translator;
    if (sourceMd) {
      const { translateFullContent } = await import('./translate/full-content.js');
      ({ contentMd, translator } = await translateFullContent(article, sourceMd));
    } else {
      ({ contentMd, translator } = await generateFeaturedContent(article));
    }

    // Patch in-place
    const idx = articles.findIndex((a) => a.id === article.id);
    articles[idx] = { ...articles[idx], contentMd, translator };

    console.log(`[backfill]   ✓ Generated (${contentMd.length} chars)`);
  } catch (err) {
    console.error(`[backfill]   ✗ Failed: ${err.message}`);
  }
}

writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
console.log(`\n[backfill] Done. Wrote ${ARTICLES_PATH}`);
