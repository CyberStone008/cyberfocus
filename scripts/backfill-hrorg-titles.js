/**
 * Backfill titleZh / abstractZh for HR org articles that are missing them.
 * - Articles with Chinese source (科锐国际, 智联招聘, etc.): titleEn is already Chinese → copy to titleZh
 * - Articles with English titles: translate via Claude
 *
 * Usage:
 *   USE_CLAUDE_CLI=true node scripts/backfill-hrorg-titles.js
 *   node scripts/backfill-hrorg-titles.js   # (requires ANTHROPIC_API_KEY)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { translateBatch } from './translate/claude.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');

const CHINESE_SOURCES = new Set(['科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco']);

const HR_SOURCES = new Set([
  'ManpowerGroup', 'Mercer', 'Korn Ferry', 'Randstad', 'Adecco Group',
  '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
]);

/** Returns true if text is predominantly Chinese */
function isChinese(text) {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  return chineseChars / text.length > 0.2;
}

async function main() {
  let articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));

  const hrOrgs = articles.filter((a) => HR_SOURCES.has(a.source) && !a.titleZh);
  console.log(`Found ${hrOrgs.length} HR org articles missing titleZh`);

  if (hrOrgs.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Split: Chinese-source articles vs English
  const chineseArticles = hrOrgs.filter(
    (a) => CHINESE_SOURCES.has(a.source) || isChinese(a.titleEn || ''),
  );
  const englishArticles = hrOrgs.filter(
    (a) => !CHINESE_SOURCES.has(a.source) && !isChinese(a.titleEn || ''),
  );

  console.log(`  Chinese-source (copy): ${chineseArticles.length}`);
  console.log(`  English (translate):   ${englishArticles.length}`);

  // --- 1. Chinese articles: titleEn is already Chinese → copy ---
  for (const a of chineseArticles) {
    const idx = articles.findIndex((x) => x.id === a.id);
    if (idx === -1) continue;
    articles[idx] = {
      ...articles[idx],
      titleZh:    articles[idx].titleEn,
      abstractZh: articles[idx].abstractEn || null,
    };
    console.log(`[copy]    ${a.id}: ${a.titleEn?.slice(0, 50)}`);
  }

  // --- 2. English articles: translate via Claude ---
  if (englishArticles.length > 0) {
    console.log('\nTranslating English articles...');
    const translated = await translateBatch(englishArticles);
    for (const t of translated) {
      const idx = articles.findIndex((x) => x.id === t.id);
      if (idx === -1) continue;
      articles[idx] = {
        ...articles[idx],
        titleZh:    t.titleZh,
        abstractZh: t.abstractZh,
      };
      console.log(`[translate] ${t.id}: ${t.titleZh?.slice(0, 50) ?? '(failed)'}`);
    }
  }

  writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
  console.log('\nDone. articles.json updated.');
}

main().catch((err) => { console.error(err); process.exit(1); });
