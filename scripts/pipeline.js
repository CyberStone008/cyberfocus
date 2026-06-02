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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { fetchArxiv } from './fetch/arxiv.js';
import { fetchHuggingFace } from './fetch/huggingface.js';
import { fetchAnthropic } from './fetch/anthropic.js';
import { fetchOpenAI } from './fetch/openai.js';
import { fetchDeepMind } from './fetch/deepmind.js';
import { fetchHackerNews } from './fetch/hackernews.js';
import { fetchReddit } from './fetch/reddit.js';
import { fetchChineseBlogs } from './fetch/chinese-blogs.js';
import { fetchAINewsSearch } from './fetch/ai-news-search.js';
import { fetchHROrgNews } from './fetch/hr-orgs.js';
import { translateBatch } from './translate/claude.js';
import { pickFeatured, generateFeaturedContent, fetchAnySourceMd } from './translate/featured-content.js';
import { loadProcessed, saveProcessed, normalizeId } from './utils/dedup.js';
import { generateDailyDigest } from './summarize/daily-digest.js';
import { translateDailyArticles } from './summarize/translate-daily.js';

const SOURCES_CONFIG_PATH = resolve(process.cwd(), 'data/sources.json');
const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const DAILY_DIR    = resolve(process.cwd(), 'data/daily');

function loadSourcesConfig() {
  try {
    return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf8'));
  } catch {
    return { disabled: [], custom: [] };
  }
}
const MAX_ARTICLES  = 3000;
const DRY_RUN       = process.env.DRY_RUN === 'true';
// When set, only fetch + translate this one source (used by /api/trigger-fetch)
const SINGLE_SOURCE = process.env.SINGLE_SOURCE ?? null;

// Source IDs handled by multi-source fetchers (reddit / chinese-blogs / hr-orgs).
// Used to build an effective disabled-set in single-source mode.
const MULTI_SOURCE_IDS = [
  'Reddit ML', 'Reddit LocalLLaMA',
  '量子位', '雷锋网', '36氪',
  'Korn Ferry', 'Mercer', 'ManpowerGroup', 'Randstad', 'Adecco Group',
  '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
];

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

  await setupProxy();

  const useCli = process.env.USE_CLAUDE_CLI === 'true';
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN && !useCli) {
    console.error('[pipeline] ERROR: ANTHROPIC_API_KEY is not set (or set USE_CLAUDE_CLI=true)');
    process.exit(1);
  }
  if (useCli) console.log('[pipeline] Using local `claude` CLI for translation');

  const sourcesConfig = loadSourcesConfig();
  const disabledIds = new Set(sourcesConfig.disabled ?? []);

  if (SINGLE_SOURCE) {
    console.log(`[pipeline] SINGLE SOURCE mode: ${SINGLE_SOURCE}`);
  } else {
    console.log(`[pipeline] Disabled sources: ${[...disabledIds].join(', ') || '(none)'}`);
  }

  // In single-source mode, only the target runs; everything else is disabled
  function enabled(id) {
    if (SINGLE_SOURCE) return id === SINGLE_SOURCE;
    return !disabledIds.has(id);
  }
  function skip() { return Promise.resolve([]); }

  // For multi-source fetchers that accept a disabledIds set, build an effective set
  const effectiveDisabledIds = SINGLE_SOURCE
    ? new Set(MULTI_SOURCE_IDS.filter((id) => id !== SINGLE_SOURCE))
    : disabledIds;

  const processed = loadProcessed();
  console.log(`[pipeline] ${processed.size} already-processed IDs loaded`);

  // Build a title-fingerprint set from existing articles to block cross-run duplicates
  function titleFingerprint(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 9)
      .join(' ');
  }
  const allExistingArticles = loadArticles();
  const existingTitleFPs = new Set(
    allExistingArticles
      .filter((a) => a.source === 'Google AI News')
      .map((a) => titleFingerprint(a.titleEn))
  );
  // Separate fingerprint set for HR org sources (cross-outlet dedup)
  const HR_ORG_SOURCE_IDS = new Set([
    'ManpowerGroup', 'Mercer', 'Korn Ferry', 'Randstad', 'Adecco Group', 'Recruit Holdings',
    '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
  ]);
  const existingHROrgFPs = new Set(
    allExistingArticles
      .filter((a) => HR_ORG_SOURCE_IDS.has(a.source))
      .map((a) => titleFingerprint(a.titleEn))
  );

  // Wrap a fetcher so it never blocks the pipeline beyond `ms` milliseconds
  function timed(name, promise, ms = 120_000) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms)
    );
    return Promise.race([promise, timeout]);
  }

  // Fetch all sources in parallel; individual failures don't abort the run
  console.log('\n[pipeline] Fetching all sources...');
  const fetchResults = await Promise.allSettled([
    // Research sources
    timed('arxiv',      enabled('arXiv cs.AI')      ? fetchArxiv()               : skip()),
    timed('huggingface',enabled('HuggingFace Daily') ? fetchHuggingFace()         : skip()),
    timed('anthropic',  enabled('Anthropic Blog')    ? fetchAnthropic(processed)  : skip()),
    timed('openai',     enabled('OpenAI Blog')       ? fetchOpenAI(processed)     : skip()),
    timed('deepmind',   enabled('DeepMind Blog')     ? fetchDeepMind()            : skip()),
    // Social sources
    timed('hackernews', enabled('Hacker News')       ? fetchHackerNews(processed) : skip()),
    timed('reddit',     fetchReddit(processed, effectiveDisabledIds)),
    timed('chinese',    fetchChineseBlogs(processed, effectiveDisabledIds)),
    timed('ai-news',    enabled('Google AI News')    ? fetchAINewsSearch(processed, existingTitleFPs) : skip()),
    // HR / Orgs sources — Google News curl can be slow; give it more headroom
    timed('hr-orgs',    fetchHROrgNews(processed, effectiveDisabledIds, existingHROrgFPs), 300_000),
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

  // Backfill untranslated HR org articles already in articles.json
  // (e.g. articles added before translation ran, or whose translation failed)
  const HR_SOURCES = new Set([
    'ManpowerGroup', 'Mercer', 'Korn Ferry', 'Randstad', 'Adecco Group',
    '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
  ]);
  const CHINESE_HR_SOURCES = new Set(['科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco']);
  function isMostlyChinese(text) {
    const ch = (text.match(/[一-鿿]/g) || []).length;
    return ch / (text.length || 1) > 0.2;
  }

  const existingArticles = loadArticles();
  const untranslatedHR = existingArticles.filter(
    (a) => HR_SOURCES.has(a.source) && !a.titleZh
  );

  if (untranslatedHR.length > 0 && !DRY_RUN) {
    console.log(`\n[pipeline] Back-filling ${untranslatedHR.length} untranslated HR org articles...`);

    // Chinese-source: titleEn is already Chinese → copy directly
    const chineseHR = untranslatedHR.filter(
      (a) => CHINESE_HR_SOURCES.has(a.source) || isMostlyChinese(a.titleEn || '')
    );
    const englishHR = untranslatedHR.filter(
      (a) => !CHINESE_HR_SOURCES.has(a.source) && !isMostlyChinese(a.titleEn || '')
    );

    // Build a mutable map for quick lookup
    const articleMap = new Map(existingArticles.map((a) => [a.id, a]));

    for (const a of chineseHR) {
      const entry = articleMap.get(a.id);
      if (entry) {
        entry.titleZh    = entry.titleEn;
        entry.abstractZh = entry.abstractEn || null;
      }
    }

    if (englishHR.length > 0) {
      const translatedHR = await translateBatch(englishHR);
      for (const t of translatedHR) {
        const entry = articleMap.get(t.id);
        if (entry && t.titleZh) {
          entry.titleZh    = t.titleZh;
          entry.abstractZh = t.abstractZh;
        }
      }
    }

    const updatedArticles = [...articleMap.values()];
    writeFileSync(ARTICLES_PATH, JSON.stringify(updatedArticles, null, 2));
    console.log(`[pipeline] HR org back-fill complete`);
  }

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

  // --- Featured articles of the day (research only, up to 3) ---
  console.log('\n[pipeline] Selecting featured articles...');
  const todayBJ = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const researchItems = translated.filter((a) => a.category !== 'social');
  const featuredList = pickFeatured(researchItems, 3);

  if (featuredList.length === 0) {
    console.log('[pipeline] No new items to feature today');
  }

  for (const featured of featuredList) {
    console.log(`[pipeline] Featured: ${featured.titleEn} (${featured.source})`);
    try {
      // Try to fetch full source content with images for any blog/article source
      // arXiv / HuggingFace papers skip this (no article page to fetch)
      const skipFetch = ['arXiv cs.AI', 'arXiv cs.LG', 'HuggingFace Daily'].includes(featured.source);
      let sourceMd = null;
      if (!skipFetch) {
        console.log(`[pipeline] Fetching source content for: ${featured.sourceUrl}`);
        sourceMd = await fetchAnySourceMd(featured);
        if (sourceMd) console.log(`[pipeline] Source content: ${sourceMd.length} chars`);
        else console.log(`[pipeline] Source fetch failed — falling back to abstract-based generation`);
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
      console.warn(`[pipeline] Featured generation failed for "${featured.titleEn}": ${err.message}`);
    }
  }

  // ── Daily archive ────────────────────────────────────────────────────────
  // Write today's articles + AI-generated summary to data/daily/YYYY-MM-DD.json.
  // Format: { date, generatedAt, summary: { aiNews, papers, hrOrgs }, articles: [...] }
  // Re-runs on the same day merge articles but regenerate the summary.
  if (!existsSync(DAILY_DIR)) mkdirSync(DAILY_DIR, { recursive: true });
  const dailyPath = resolve(DAILY_DIR, `${todayBJ}.json`);

  // Load existing daily file (may be old plain-array format or new object format)
  let dailyExistingArticles = [];
  if (existsSync(dailyPath)) {
    try {
      const raw = JSON.parse(readFileSync(dailyPath, 'utf8'));
      dailyExistingArticles = Array.isArray(raw) ? raw : (raw.articles ?? []);
    } catch { /* ignore */ }
  }
  const dailyIds = new Set(dailyExistingArticles.map((a) => a.id));
  const dailyMerged = [
    ...translated.filter((a) => !dailyIds.has(a.id)),
    ...dailyExistingArticles,
  ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Fill in any missing titleZh before generating the digest
  console.log('\n[pipeline] Translating daily articles missing titleZh...');
  await translateDailyArticles(dailyMerged);

  // Generate daily summary
  console.log('\n[pipeline] Generating daily digest summary...');
  const summary = await generateDailyDigest(dailyMerged);

  const dailyDoc = {
    date:        todayBJ,
    generatedAt: new Date().toISOString(),
    summary,
    articles:    dailyMerged,
  };
  writeFileSync(dailyPath, JSON.stringify(dailyDoc, null, 2));
  console.log(`[pipeline] Wrote ${dailyMerged.length} articles + summary to data/daily/${todayBJ}.json`);

  // Clear previous day's featured flag from existing articles
  const existing = loadArticles().map((a) => ({
    ...a,
    featured: a.featuredDate === todayBJ ? a.featured : false,
  }));

  // Stamp newly-fetched articles with fetchedAt (ISO string) so the UI can show a "新" badge
  const fetchedAt = new Date().toISOString();
  const translatedStamped = translated.map((a) => ({ ...a, fetchedAt }));

  // Merge with existing articles — deduplicate by ID (new items take priority)
  const seenIds = new Set();
  const merged = [...translatedStamped, ...existing]
    .filter((a) => { if (seenIds.has(a.id)) return false; seenIds.add(a.id); return true; })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ARTICLES);

  // ── Safety guard against catastrophic truncation ──────────────────────────
  // On 2026-05-28, articles.json was silently overwritten from 1897 → 63 (a
  // corrupt mid-run state / bad rebase). Re-read the CURRENT on-disk count
  // fresh and REFUSE to write if the new count collapses by >50%. Better to
  // skip a day than to destroy the dataset and propagate it via git push.
  let onDiskCount = 0;
  try { onDiskCount = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8')).length; } catch { onDiskCount = 0; }
  const floor = Math.max(50, Math.floor(onDiskCount * 0.5));
  if (onDiskCount > 100 && merged.length < floor) {
    console.error(`[pipeline] 🛑 ABORT WRITE: merged=${merged.length} is <50% of on-disk=${onDiskCount} (floor=${floor}). Refusing to truncate articles.json. Investigate before re-running.`);
    process.exit(2);
  }

  // Write data files
  writeFileSync(ARTICLES_PATH, JSON.stringify(merged, null, 2));
  console.log(`[pipeline] Wrote ${merged.length} articles to data/articles.json (was ${onDiskCount} on disk)`);

  // Update processed IDs
  translated.forEach((a) => processed.add(a.id));
  saveProcessed(processed);
  console.log(`[pipeline] Updated processed-ids.json (${processed.size} total)`);

  // Write lastRunAt back to sources.json
  const updatedConfig = { ...sourcesConfig, lastRunAt: new Date().toISOString() };
  writeFileSync(SOURCES_CONFIG_PATH, JSON.stringify(updatedConfig, null, 2));
  console.log('[pipeline] Updated sources.json lastRunAt');

  console.log('\n=== Pipeline complete ===');
}

run().catch((err) => {
  console.error('[pipeline] Fatal error:', err);
  process.exit(1);
});
