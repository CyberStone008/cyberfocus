#!/usr/bin/env node
/**
 * AI Research Aggregator — Data Pipeline
 *
 * Usage:
 *   node scripts/pipeline.js              # fetch, translate, write
 *   DRY_RUN=true node scripts/pipeline.js # fetch only, no write or translation
 *
 * Required env:
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fetchArxiv } from './fetch/arxiv.js';
import { fetchHuggingFace } from './fetch/huggingface.js';
import { fetchAnthropic } from './fetch/anthropic.js';
import { fetchOpenAI } from './fetch/openai.js';
import { fetchDeepMind } from './fetch/deepmind.js';
import { translateBatch } from './translate/claude.js';
import { pickFeatured, generateFeaturedContent, fetchAnthropicSourceMd } from './translate/featured-content.js';
import { loadProcessed, saveProcessed, normalizeId } from './utils/dedup.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const MAX_ARTICLES = 500;
const DRY_RUN = process.env.DRY_RUN === 'true';

function loadArticles() {
  try {
    return JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function run() {
  console.log('=== AI Research Pipeline ===');
  if (DRY_RUN) console.log('[pipeline] DRY RUN mode — no writes');

  const useCli = process.env.USE_CLAUDE_CLI === 'true';
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN && !useCli) {
    console.error('[pipeline] ERROR: ANTHROPIC_API_KEY is not set (or set USE_CLAUDE_CLI=true)');
    process.exit(1);
  }
  if (useCli) console.log('[pipeline] Using local `claude` CLI for translation');

  const processed = loadProcessed();
  console.log(`[pipeline] ${processed.size} already-processed IDs loaded`);

  // Fetch all sources in parallel; individual failures don't abort the run
  console.log('\n[pipeline] Fetching all sources...');
  const fetchResults = await Promise.allSettled([
    fetchArxiv(),
    fetchHuggingFace(),
    fetchAnthropic(processed),
    fetchOpenAI(processed),
    fetchDeepMind(),
  ]);

  const allFetched = fetchResults
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  const failed = fetchResults.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    failed.forEach((r) => console.warn(`[pipeline] Fetcher error: ${r.reason}`));
  }

  console.log(`\n[pipeline] Total fetched: ${allFetched.length} items`);

  // Deduplicate: filter items already processed, and deduplicate within this batch
  const seenInBatch = new Set();
  const newItems = allFetched.filter((item) => {
    if (processed.has(item.id)) return false;
    if (seenInBatch.has(item.id)) return false;
    seenInBatch.add(item.id);
    return true;
  });

  console.log(`[pipeline] New items to process: ${newItems.length}`);

  if (newItems.length === 0) {
    console.log('[pipeline] No new items. Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('[pipeline] DRY RUN — would translate and add:');
    newItems.forEach((item) => console.log(`  ${item.id}: ${item.titleEn}`));
    return;
  }

  // Translate
  console.log('\n[pipeline] Starting translation...');
  const translated = await translateBatch(newItems);

  const successCount = translated.filter((a) => a.titleZh).length;
  console.log(`\n[pipeline] Translation complete: ${successCount}/${translated.length} succeeded`);

  // --- Featured article of the day ---
  console.log('\n[pipeline] Selecting featured article...');
  const todayBJ = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const featured = pickFeatured(translated);

  if (featured) {
    console.log(`[pipeline] Featured: ${featured.titleEn} (${featured.source})`);
    try {
      // For Anthropic, try to get the real source text; fall back to abstract-based generation
      let sourceMd = null;
      if (featured.source === 'Anthropic Blog') {
        sourceMd = await fetchAnthropicSourceMd(featured);
      }

      const { contentMd, translator } = sourceMd
        ? await (async () => {
            const { translateFullContent } = await import('./translate/full-content.js');
            return translateFullContent(featured, sourceMd);
          })()
        : await generateFeaturedContent(featured);

      // Apply to the translated array
      const idx = translated.findIndex((a) => a.id === featured.id);
      if (idx !== -1) {
        translated[idx] = {
          ...translated[idx],
          contentMd,
          translator,
          featured: true,
          featuredDate: todayBJ,
        };
      }
      console.log(`[pipeline] Featured content generated (${contentMd.length} chars)`);
    } catch (err) {
      console.warn(`[pipeline] Featured generation failed: ${err.message}`);
    }
  } else {
    console.log('[pipeline] No new items to feature today');
  }

  // Clear previous day's featured flag from existing articles
  const existing = loadArticles().map((a) => ({
    ...a,
    featured: a.featuredDate === todayBJ ? a.featured : false,
  }));

  // Merge with existing articles
  const merged = [...translated, ...existing]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARTICLES);

  // Write data files
  writeFileSync(ARTICLES_PATH, JSON.stringify(merged, null, 2));
  console.log(`[pipeline] Wrote ${merged.length} articles to data/articles.json`);

  // Update processed IDs
  translated.forEach((a) => processed.add(a.id));
  saveProcessed(processed);
  console.log(`[pipeline] Updated processed-ids.json (${processed.size} total)`);

  console.log('\n=== Pipeline complete ===');
}

run().catch((err) => {
  console.error('[pipeline] Fatal error:', err);
  process.exit(1);
});
