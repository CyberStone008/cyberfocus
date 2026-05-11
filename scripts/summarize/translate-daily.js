/**
 * translate-daily.js
 *
 * Fills in missing titleZh / abstractZh for articles in a daily file.
 * Called at the end of the pipeline after translateBatch (which handles
 * new-item translation) to catch any residual nulls.
 *
 * Usage:
 *   node scripts/summarize/translate-daily.js data/daily/2026-05-10.json
 *   import { translateDailyFile } from './summarize/translate-daily.js';
 */

import { readFileSync, writeFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from '../translate/claude-cli.js';
import { sleep } from '../utils/rate-limiter.js';

const client = isCliMode()
  ? claudeCliClient
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BATCH   = 8;   // smaller batch = less JSON to parse
const DELAY   = 1200;

/** True if the string is already mostly Chinese */
function isChinese(str) {
  if (!str) return false;
  const cjk = (str.match(/[一-鿿]/g) || []).length;
  return cjk / str.length > 0.3;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : text.trim();
  return JSON.parse(raw);
}

async function translateBatchItems(items) {
  const prompt = `你是专业的中文编辑。将以下标题和摘要翻译成简体中文，保留专有名词（品牌、模型名称等）用英文。

输入列表：
${JSON.stringify(items, null, 2)}

返回等长 JSON 数组，每项包含 "index"、"titleZh"（中文标题）、"abstractZh"（中文摘要，无摘要则返回空字符串）。
只返回 JSON，不要其他文字。`;

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  return extractJson(res.content[0].text);
}

/**
 * Translate articles that are missing titleZh in the given daily doc.
 * Mutates and returns the articles array.
 */
export async function translateDailyArticles(articles) {
  // If titleEn is already Chinese, just copy it over
  for (const a of articles) {
    if (!a.titleZh && a.titleEn && isChinese(a.titleEn)) {
      a.titleZh = a.titleEn;
    }
  }

  const missing = articles
    .map((a, i) => ({ i, a }))
    .filter(({ a }) => !a.titleZh && a.titleEn);

  if (missing.length === 0) {
    console.log('[translate-daily] All articles already have titleZh');
    return articles;
  }

  console.log(`[translate-daily] Translating ${missing.length} articles missing titleZh…`);

  for (let offset = 0; offset < missing.length; offset += BATCH) {
    const chunk = missing.slice(offset, offset + BATCH);
    const items = chunk.map(({ i, a }) => ({
      index: i,
      title: a.titleEn,
      abstract: (a.abstractEn ?? '').slice(0, 300).replace(/"/g, "'"),
    }));

    try {
      const results = await translateBatchItems(items);
      for (const r of results) {
        const orig = articles[r.index];
        if (orig && r.titleZh) {
          orig.titleZh    = r.titleZh;
          orig.abstractZh = r.abstractZh || orig.abstractZh || null;
        }
      }
      const done = Math.min(offset + BATCH, missing.length);
      console.log(`[translate-daily] ${done}/${missing.length} translated`);
    } catch (err) {
      console.warn(`[translate-daily] Batch failed, retrying one-by-one…`);
      // Fall back to single-item translation for this chunk
      for (const { i, a } of chunk) {
        try {
          const cleanTitle = a.titleEn.replace(/[""'']/g, '"').replace(/[^\x20-\x7E一-鿿]/g, ' ');
          const single = [{ index: i, title: cleanTitle, abstract: (a.abstractEn ?? '').slice(0, 200).replace(/[""'']/g, '"') }];
          const [r] = await translateBatchItems(single);
          if (r?.titleZh) {
            articles[i].titleZh    = r.titleZh;
            articles[i].abstractZh = r.abstractZh || articles[i].abstractZh || null;
          }
          await sleep(400);
        } catch { /* skip individual failure */ }
      }
    }

    if (offset + BATCH < missing.length) await sleep(DELAY);
  }

  return articles;
}

/**
 * Translate a daily JSON file in-place.
 */
export async function translateDailyFile(filePath) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  const isArray = Array.isArray(raw);
  const articles = isArray ? raw : (raw.articles ?? []);

  await translateDailyArticles(articles);

  const out = isArray ? articles : { ...raw, articles };
  writeFileSync(filePath, JSON.stringify(out, null, 2));
  console.log(`[translate-daily] Written: ${filePath}`);
}

/* CLI usage */
if (process.argv[1].endsWith('translate-daily.js') && process.argv[2]) {
  translateDailyFile(process.argv[2]).catch((e) => {
    console.error(e); process.exit(1);
  });
}
