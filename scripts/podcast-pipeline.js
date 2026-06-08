#!/usr/bin/env node
/**
 * podcast-pipeline.js
 *
 * Fetches latest podcast episodes, translates English titles (Lex Fridman),
 * generates Chinese analysis from transcripts, and writes to data/podcasts.json.
 *
 * Usage:
 *   node scripts/podcast-pipeline.js
 *   DRY_RUN=true node scripts/podcast-pipeline.js
 *   ANALYZE_SLUG=podcast-lex-fridman-xxxx node scripts/podcast-pipeline.js   # re-analyse one
 *   ANALYZE_ALL=true node scripts/podcast-pipeline.js                         # back-fill all missing
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fetchPodcasts } from './fetch/podcasts.js';
import { generatePodcastAnalysis } from './translate/podcast-analysis.js';
import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from './translate/claude-cli.js';
import { deepseekClient, isDeepSeekMode } from './translate/deepseek.js';

const PODCASTS_PATH = resolve(process.cwd(), 'data/podcasts.json');
const MAX_EPISODES  = 200;
const DRY_RUN       = process.env.DRY_RUN === 'true';
const ANALYZE_SLUG  = process.env.ANALYZE_SLUG ?? null;   // re-analyse a specific slug
const ANALYZE_ALL   = process.env.ANALYZE_ALL === 'true'; // back-fill all missing analyses
// How many new episodes per run get analysed (rate-limit protection for CI)
const MAX_ANALYSES_PER_RUN = Number(process.env.MAX_ANALYSES ?? '3');

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

  const client = isDeepSeekMode()
    ? deepseekClient
    : isCliMode()
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
          ep.titleZh    = r.titleZh;
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

  const existing    = loadPodcasts();
  const existingIds = new Set(existing.map((e) => e.id));

  const fetched = await fetchPodcasts(existingIds);
  console.log(`[podcast-pipeline] ${fetched.length} new episodes fetched`);

  if (DRY_RUN) {
    fetched.forEach((e) => console.log(`  ${e.id}: ${e.titleEn}`));
    return;
  }

  const canAI = isDeepSeekMode() || process.env.ANTHROPIC_API_KEY || isCliMode();

  // ── Title translation ──────────────────────────────────────────────────────
  if (fetched.length > 0 && canAI) {
    await translateEpisodeTitles(fetched);
  }
  const untranslatedExisting = existing.filter((e) => !e.titleZh && e.titleEn);
  if (untranslatedExisting.length > 0 && canAI) {
    console.log(`[podcast-pipeline] Back-filling ${untranslatedExisting.length} existing episodes missing titleZh…`);
    await translateEpisodeTitles(untranslatedExisting);
  } else if (!canAI) {
    console.log('[podcast-pipeline] No ANTHROPIC_API_KEY — skipping translation');
  }

  // ── Build merged list (new + existing) ────────────────────────────────────
  const merged = [...fetched, ...existing]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_EPISODES);

  // Snapshot IDs that already have contentMd BEFORE any mutation below
  // (merged and existing share object references — mutating ep.contentMd would
  //  otherwise fool the hasChanges check into thinking nothing changed)
  const preAnalysisWithContent = new Set(merged.filter((e) => e.contentMd).map((e) => e.id));

  // ── Content analysis (Chinese reading guide) ──────────────────────────────
  if (canAI) {
    let toAnalyse = [];

    if (ANALYZE_SLUG) {
      // Re-analyse a specific episode by slug
      const ep = merged.find((e) => e.slug === ANALYZE_SLUG || e.id === ANALYZE_SLUG);
      if (ep) toAnalyse = [ep];
      else console.warn(`[podcast-pipeline] ANALYZE_SLUG not found: ${ANALYZE_SLUG}`);
    } else if (ANALYZE_ALL) {
      // Back-fill all missing analyses (oldest first so the newest appear first once done)
      toAnalyse = merged.filter((e) => !e.contentMd).reverse();
    } else {
      // Normal run: analyse up to MAX_ANALYSES_PER_RUN newest episodes without analysis
      toAnalyse = merged
        .filter((e) => !e.contentMd)
        .slice(0, MAX_ANALYSES_PER_RUN);
    }

    if (toAnalyse.length > 0) {
      console.log(`\n[podcast-pipeline] Generating analyses for ${toAnalyse.length} episode(s)…`);
      for (const ep of toAnalyse) {
        try {
          const { contentMd, analyzedAt } = await generatePodcastAnalysis(ep);
          ep.contentMd  = contentMd;
          ep.analyzedAt = analyzedAt;
          console.log(`[podcast-pipeline] ✓ Analysis done: ${ep.titleEn}`);
          // Small pause between requests
          if (toAnalyse.indexOf(ep) < toAnalyse.length - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err) {
          console.warn(`[podcast-pipeline] Analysis failed for "${ep.titleEn}": ${err.message}`);
        }
      }
    }
  }

  // ── 卡片一句话说明（结论先行，守溯源铁律）──────────────────────────────
  // 新抓取的集补 tldrZh：Lex 用逐字稿解读，其余源用官方节目简介（不用推断式解读，避免外推）。
  if (canAI && fetched.length > 0) {
    const { generateReportTldr } = await import('./translate/report-tldr.js');
    for (const ep of fetched) {
      if (ep.tldrZh) continue;
      const lex = ep.source === 'Lex Fridman Podcast' && ep.contentMd && ep.contentMd.length > 300;
      const zh = ep.abstractZh || '', en = ep.abstractEn || '';
      const text = lex ? ep.contentMd : (en.length > zh.length ? en : zh);
      if (text.trim().length < 150) continue;
      try {
        const tldr = await generateReportTldr(ep.titleZh || ep.titleEn, text, { kind: '节目', label: lex ? '节目解读' : '节目简介', minLen: 150 });
        if (tldr) { ep.tldrZh = tldr; console.log(`[podcast-pipeline] TL;DR ✓ ${(ep.titleZh || ep.titleEn).slice(0, 24)}`); }
      } catch (e) { console.warn(`[podcast-pipeline] TL;DR 失败: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const hasChanges = fetched.length > 0
    || untranslatedExisting.length > 0
    || merged.some((e) => e.contentMd && !preAnalysisWithContent.has(e.id));

  if (!hasChanges && !ANALYZE_SLUG && !ANALYZE_ALL) {
    console.log('[podcast-pipeline] No changes. Done.');
    return;
  }

  writeFileSync(PODCASTS_PATH, JSON.stringify(merged, null, 2));
  console.log(`[podcast-pipeline] Wrote ${merged.length} episodes to data/podcasts.json`);
  console.log('=== Done ===');
}

run().catch((err) => { console.error(err); process.exit(1); });
