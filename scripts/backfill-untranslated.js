/**
 * Backfill titleZh / abstractZh for ANY article missing a translation.
 *
 * Why this exists: the cloud GitHub Actions runner fetches articles fine but its
 * translation step has been failing (likely ANTHROPIC_API_KEY issue), so it
 * accumulates English-only articles with titleZh: null. This script translates
 * them locally via Claude CLI.
 *
 * - Articles whose titleEn is already Chinese → copy titleEn → titleZh
 * - Articles with English titles → translate via Claude (batched)
 *
 * Usage:
 *   USE_CLAUDE_CLI=true node scripts/backfill-untranslated.js
 *   USE_CLAUDE_CLI=true MAX_BACKFILL=100 node scripts/backfill-untranslated.js  # cap this run
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { translateBatch } from './translate/claude.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const MAX_BACKFILL = process.env.MAX_BACKFILL ? parseInt(process.env.MAX_BACKFILL, 10) : Infinity;

/** Returns true if text is predominantly Chinese (CJK ratio > 20%) */
function isMostlyChinese(text) {
  if (!text) return false;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  return cjk / text.length > 0.2;
}

async function main() {
  const articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));

  const untranslated = articles.filter((a) => !a.titleZh);
  console.log(`Total: ${articles.length} | Untranslated: ${untranslated.length}`);
  if (untranslated.length === 0) { console.log('Nothing to backfill.'); return; }

  // Build a quick id → index map for in-place updates
  const idxById = new Map(articles.map((a, i) => [a.id, i]));

  // 1) Chinese-source articles: titleEn already Chinese → just copy
  const chineseOnes = untranslated.filter((a) => isMostlyChinese(a.titleEn));
  for (const a of chineseOnes) {
    const i = idxById.get(a.id);
    if (i == null) continue;
    articles[i].titleZh    = articles[i].titleEn;
    articles[i].abstractZh = articles[i].abstractZh || articles[i].abstractEn || null;
  }
  if (chineseOnes.length) console.log(`[copy] ${chineseOnes.length} Chinese-source articles copied titleEn → titleZh`);

  // 2) English articles → translate via Claude, in batches
  let english = untranslated.filter((a) => !isMostlyChinese(a.titleEn));
  if (english.length > MAX_BACKFILL) {
    console.log(`Capping to ${MAX_BACKFILL} (of ${english.length}) this run`);
    english = english.slice(0, MAX_BACKFILL);
  }

  const BATCH = 10;
  let done = 0;
  for (let s = 0; s < english.length; s += BATCH) {
    const slice = english.slice(s, s + BATCH);
    process.stdout.write(`[translate] batch ${Math.floor(s / BATCH) + 1}/${Math.ceil(english.length / BATCH)} (${slice.length}) … `);
    try {
      const translated = await translateBatch(slice);
      let ok = 0;
      for (const t of translated) {
        const i = idxById.get(t.id);
        if (i == null) continue;
        if (t.titleZh) {
          articles[i].titleZh    = t.titleZh;
          articles[i].abstractZh = t.abstractZh ?? articles[i].abstractZh ?? null;
          ok++;
        }
      }
      done += ok;
      console.log(`${ok}/${slice.length} ok`);
      // Persist incrementally so a crash mid-run doesn't lose progress
      writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  const stillMissing = articles.filter((a) => !a.titleZh).length;
  console.log(`\nDone. Translated ${done} | copied ${chineseOnes.length} | still missing ${stillMissing}`);
  writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
