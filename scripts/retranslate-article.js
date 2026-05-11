#!/usr/bin/env node
/**
 * retranslate-article.js
 *
 * Re-fetch source HTML (with images) and re-translate a specific article
 * by slug. Writes the updated contentMd back to data/articles.json.
 *
 * Usage:
 *   USE_CLAUDE_CLI=true node scripts/retranslate-article.js <slug>
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/retranslate-article.js <slug>
 *
 * Example:
 *   USE_CLAUDE_CLI=true node scripts/retranslate-article.js ai-5-layer-cake-nvidia
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { fetchArticleWithImages } from './translate/fetch-with-images.js';
import { translateFullContent } from './translate/full-content.js';
import { generateFeaturedContent } from './translate/featured-content.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');

async function run() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/retranslate-article.js <slug>');
    process.exit(1);
  }

  await setupProxy();

  const articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));
  const idx = articles.findIndex((a) => a.slug === slug);
  if (idx === -1) {
    console.error(`Article not found: ${slug}`);
    process.exit(1);
  }

  const article = articles[idx];
  console.log(`Re-translating: ${article.titleEn}`);
  console.log(`Source URL: ${article.sourceUrl}`);

  // Fetch source with images
  console.log('\n[retranslate] Fetching source content with images...');
  const sourceMd = await fetchArticleWithImages(article.sourceUrl);

  let contentMd, translator;
  if (sourceMd) {
    console.log(`[retranslate] Got ${sourceMd.length} chars of source content`);
    // Show image count
    const imgCount = (sourceMd.match(/!\[/g) || []).length;
    console.log(`[retranslate] Images found: ${imgCount}`);
    ({ contentMd, translator } = await translateFullContent(article, sourceMd));
  } else {
    console.log('[retranslate] Source fetch failed — using abstract-based generation');
    ({ contentMd, translator } = await generateFeaturedContent(article));
  }

  articles[idx] = { ...article, contentMd, translator };
  writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));

  const newImgCount = (contentMd.match(/!\[/g) || []).length;
  console.log(`\n[retranslate] Done! contentMd: ${contentMd.length} chars, images in output: ${newImgCount}`);
  console.log(`[retranslate] Written to data/articles.json`);
}

run().catch((err) => { console.error(err); process.exit(1); });
