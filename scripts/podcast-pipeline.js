#!/usr/bin/env node
/**
 * podcast-pipeline.js
 *
 * Fetches latest podcast episodes, translates English titles (Lex Fridman),
 * and writes/merges into data/podcasts.json.
 *
 * Usage:
 *   node scripts/podcast-pipeline.js
 *   DRY_RUN=true node scripts/podcast-pipeline.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fetchPodcasts } from './fetch/podcasts.js';
import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from './translate/claude-cli.js';

const PODCASTS_PATH = resolve(process.cwd(), 'data/podcasts.json');
const MAX_EPISODES  = 200;
const DRY_RUN       = process.env.DRY_RUN === 'true';

function loadPodcasts() {
  try { return JSON.parse(readFileSync(PODCASTS_PATH, 'utf8')); }
  catch { return []; }
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : text.trim();
  return JSON.parse(raw);
}

async function translateEpisodeTitles(episodes) {
  const needsTranslation = episodes.filter((e) => !e.titleZh && e.titleEn);
  if (needsTranslation.length === 0) return;

  const client = isCliMode()
    ? claudeCliClient
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const BATCH = 10;

  for (let i = 0; i < needsTranslation.length; i += BATCH) {
    const chunk = needsTranslation.slice(i, i + BATCH);
    const items = chunk.map((e, idx) => ({
      index: idx,
      title: e.titleEn,
      abstract: (e.abstractEn ?? '').slice(0, 200),
    }));

    try {
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `你是专业的中文编辑。将以下播客单集标题和简介翻译成简体中文，保留专有名词（人名、品牌等）用英文。

输入列表：
${JSON.stringify(items, null, 2)}

返回等长 JSON 数组，每项包含 "index"、"titleZh"（中文标题）、"abstractZh"（中文简介，无则返回空字符串）。
只返回 JSON，不要其他文字。`,
        }],
      });

      const results = extractJson(res.content[0].text);
      for (const r of results) {
        const ep = chunk[r.index];
        if (ep && r.titleZh) {
          ep.titleZh   = r.titleZh;
          ep.abstractZh = r.abstractZh || null;
        }
      }
      console.log(`[podcast-pipeline] Translated ${Math.min(i + BATCH, needsTranslation.length)}/${needsTranslation.length}`);
    } catch (err) {
      console.warn(`[podcast-pipeline] Translation batch failed: ${err.message}`);
    }

    if (i + BATCH < needsTranslation.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

async function run() {
  console.log('=== Podcast Pipeline ===');

  const existing  = loadPodcasts();
  const existingIds = new Set(existing.map((e) => e.id));

  const fetched = await fetchPodcasts(existingIds);
  console.log(`[podcast-pipeline] ${fetched.length} new episodes fetched`);

  if (DRY_RUN) {
    fetched.forEach((e) => console.log(`  ${e.id}: ${e.titleEn}`));
    return;
  }

  const canTranslate = process.env.ANTHROPIC_API_KEY || isCliMode();

  // Translate new episodes
  if (fetched.length > 0 && canTranslate) {
    await translateEpisodeTitles(fetched);
  }

  // Back-fill translation for any existing episodes still missing titleZh
  const untranslatedExisting = existing.filter((e) => !e.titleZh && e.titleEn);
  if (untranslatedExisting.length > 0 && canTranslate) {
    console.log(`[podcast-pipeline] Back-filling ${untranslatedExisting.length} existing episodes missing titleZh…`);
    await translateEpisodeTitles(untranslatedExisting);
  } else if (!canTranslate) {
    console.log('[podcast-pipeline] No ANTHROPIC_API_KEY — skipping translation');
  }

  const hasChanges = fetched.length > 0 || untranslatedExisting.length > 0;
  if (!hasChanges) {
    console.log('[podcast-pipeline] No new episodes or missing translations. Done.');
    return;
  }

  const merged = [...fetched, ...existing]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_EPISODES);

  writeFileSync(PODCASTS_PATH, JSON.stringify(merged, null, 2));
  console.log(`[podcast-pipeline] Wrote ${merged.length} episodes to data/podcasts.json`);
  console.log('=== Done ===');
}

run().catch((err) => { console.error(err); process.exit(1); });
