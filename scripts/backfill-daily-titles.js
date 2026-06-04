/**
 * Backfill titleZh/abstractZh in data/daily/*.json snapshots.
 * Daily files are snapshots taken at digest time; when articles were untranslated
 * then (智谱-down period), the snapshot kept English titles even after the main
 * articles.json was later backfilled. This:
 *   1. Copies translations from articles.json by id (free, reuses existing).
 *   2. Copies titleEn→titleZh for Chinese-source items already in Chinese.
 *   3. DeepSeek-translates whatever's still English (old items trimmed from main).
 *
 * Usage: USE only with DEEPSEEK_API_KEY (loaded from .env.local by run-daily / shell).
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { translateBatch } from './translate/claude.js';

const DAILY_DIR = resolve(process.cwd(), 'data/daily');
const ARTICLES  = resolve(process.cwd(), 'data/articles.json');

function isMostlyChinese(t) {
  if (!t) return false;
  return (t.match(/[一-鿿]/g) || []).length / t.length > 0.2;
}

async function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, 'utf8'));
  const byId = new Map(articles.map((a) => [a.id, a]));

  const files = readdirSync(DAILY_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  let copied = 0, chinese = 0, toTranslate = [];
  const fileMap = {}; // file -> parsed

  // Pass 1: copy from articles.json + Chinese-source copy
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(DAILY_DIR, f), 'utf8'));
    fileMap[f] = data;
    for (const a of data.articles || []) {
      if (a.titleZh) continue;
      const main = byId.get(a.id);
      if (main?.titleZh) { a.titleZh = main.titleZh; a.abstractZh = main.abstractZh ?? a.abstractZh ?? null; copied++; continue; }
      if (isMostlyChinese(a.titleEn)) { a.titleZh = a.titleEn; a.abstractZh = a.abstractZh || a.abstractEn || null; chinese++; continue; }
      toTranslate.push(a); // still English, not in main
    }
  }
  console.log(`复用主库: ${copied} | 中文源复制: ${chinese} | 待 DeepSeek 翻译: ${toTranslate.length}`);

  // Pass 2: DeepSeek-translate the stragglers (dedup by id)
  const uniq = [...new Map(toTranslate.map((a) => [a.id, a])).values()];
  if (uniq.length) {
    const translated = await translateBatch(uniq);
    const tmap = new Map(translated.map((t) => [t.id, t]));
    for (const f of files) {
      for (const a of fileMap[f].articles || []) {
        if (a.titleZh) continue;
        const t = tmap.get(a.id);
        if (t?.titleZh) { a.titleZh = t.titleZh; a.abstractZh = t.abstractZh ?? a.abstractZh ?? null; }
      }
    }
  }

  // Write back
  let stillMiss = 0;
  for (const f of files) {
    writeFileSync(join(DAILY_DIR, f), JSON.stringify(fileMap[f], null, 2));
    stillMiss += (fileMap[f].articles || []).filter((a) => !a.titleZh).length;
  }
  console.log(`完成。剩余未翻译: ${stillMiss}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
