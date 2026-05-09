#!/usr/bin/env node
/**
 * One-off script: fetch Anthropic Blog + OpenAI Blog for the last 7 days,
 * translate, and merge into articles.json.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/fetch-reports.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { translateBatch } from './translate/claude.js';
import { loadProcessed, saveProcessed } from './utils/dedup.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const DAYS_BACK = 7;
const MAX_PER = 20;

function loadArticles() {
  try { return JSON.parse(readFileSync(ARTICLES_PATH, 'utf8')); } catch { return []; }
}

/* ── Inline Anthropic fetcher (7-day window) ── */
async function fetchAnthropicWeek(processedIds) {
  const { RateLimiter } = await import('./utils/rate-limiter.js');
  const limiter = new RateLimiter(0.5);

  function extractMeta(html, property) {
    const m =
      html.match(new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${property}["']`, 'i'));
    return m ? m[1].trim() : null;
  }

  function extractDate(html) {
    const t = html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
    if (t) return t[1];
    const j = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (j) return j[1];
    return extractMeta(html, 'article:published_time');
  }

  const sitemapRes = await fetch('https://www.anthropic.com/sitemap.xml', {
    headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
  });
  const xml = await sitemapRes.text();
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u.includes('/news/') && !u.endsWith('/news/')) urls.push(u);
  }
  console.log(`[anthropic-week] ${urls.length} news URLs in sitemap`);

  const results = [];
  const cutoff = Date.now() - DAYS_BACK * 86400 * 1000;

  for (const url of urls) {
    if (results.length >= MAX_PER) break;
    const slug = url.replace(/\/$/, '').split('/').pop();
    const id = `anthropic:${slug}`;
    if (processedIds.has(id)) continue;

    try {
      await limiter.wait();
      const res = await fetch(url, { headers: { 'User-Agent': 'ai-research-aggregator/1.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
      const desc  = extractMeta(html, 'og:description') || extractMeta(html, 'description');
      const dateStr = extractDate(html);
      if (!title) continue;
      const d = new Date(dateStr);
      if (!dateStr || isNaN(d.getTime()) || d.getTime() < cutoff) continue;

      results.push({
        id, slug, source: 'Anthropic Blog', sourceUrl: url,
        publishedAt: d.toISOString(),
        titleEn: title.replace(/ [\\|] Anthropic$/, '').trim(),
        titleZh: null,
        abstractEn: (desc || '').slice(0, 400), abstractZh: null,
        authors: ['Anthropic'], institution: 'Anthropic', docType: 'Blog',
        category: 'research',
      });
      console.log(`[anthropic-week] + ${slug}`);
    } catch (e) {
      console.warn(`[anthropic-week] skip ${url}: ${e.message}`);
    }
  }
  console.log(`[anthropic-week] ${results.length} new articles`);
  return results;
}

/* ── Inline OpenAI fetcher (7-day window) ── */
async function fetchOpenAIWeek(processedIds) {
  const { RateLimiter } = await import('./utils/rate-limiter.js');
  const limiter = new RateLimiter(0.5);

  const ABBREVS = new Set(['gpt','ai','ml','llm','rlhf','rl','api','gpu','tpu','swe','qa','nlp','cv','agi','cot','rag']);
  function slugToTitle(slug) {
    return slug.split('-').map(w => ABBREVS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(' ');
  }

  function extractMeta(html, property) {
    const m =
      html.match(new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${property}["']`, 'i'));
    return m ? m[1].trim() : null;
  }

  const res = await fetch('https://openai.com/sitemap.xml/research/', {
    headers: { 'User-Agent': 'ai-research-aggregator/1.0' },
  });
  if (!res.ok) { console.warn(`[openai-week] sitemap ${res.status}`); return []; }

  const xml = await res.text();
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  const cutoff = Date.now() - DAYS_BACK * 86400 * 1000;

  const entries = blocks.map(b => {
    const loc = (b.match(/<loc>([^<]+)<\/loc>/) || [])[1]?.trim();
    const lm  = (b.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1]?.trim();
    return { loc, lastmod: lm };
  }).filter(e => e.loc && /openai\.com\/index\/[a-z0-9-]+\/?$/.test(e.loc));

  entries.sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));
  console.log(`[openai-week] ${entries.length} research articles in sitemap`);

  const results = [];
  for (const { loc, lastmod } of entries) {
    if (results.length >= MAX_PER) break;
    const d = new Date(lastmod);
    if (!lastmod || isNaN(d.getTime()) || d.getTime() < cutoff) continue;
    const urlSlug = loc.replace(/\/$/, '').split('/').pop();
    const id = `openai:${urlSlug}`;
    if (processedIds.has(id)) continue;

    let titleEn = slugToTitle(urlSlug);
    let abstractEn = '';
    try {
      await limiter.wait();
      const pageRes = await fetch(loc, { headers: { 'User-Agent': 'ai-research-aggregator/1.0' } });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
        const ogDesc  = extractMeta(html, 'og:description') || extractMeta(html, 'description');
        if (ogTitle) titleEn = ogTitle.replace(/\s*[|–-]\s*OpenAI\s*$/, '').trim();
        if (ogDesc)  abstractEn = ogDesc.slice(0, 500);
      }
    } catch (e) {
      console.warn(`[openai-week] skip meta ${urlSlug}: ${e.message}`);
    }

    results.push({
      id, slug: urlSlug, source: 'OpenAI Blog', sourceUrl: loc,
      publishedAt: d.toISOString(),
      titleEn, titleZh: null, abstractEn, abstractZh: null,
      authors: ['OpenAI'], institution: 'OpenAI', docType: 'Blog',
      category: 'research',
    });
    console.log(`[openai-week] + ${urlSlug}`);
  }
  console.log(`[openai-week] ${results.length} new articles`);
  return results;
}

/* ── Main ── */
async function run() {
  console.log(`=== fetch-reports: Anthropic + OpenAI (last ${DAYS_BACK} days) ===`);
  await setupProxy();

  if (!process.env.ANTHROPIC_API_KEY && process.env.USE_CLAUDE_CLI !== 'true') {
    console.error('ERROR: set ANTHROPIC_API_KEY or USE_CLAUDE_CLI=true');
    process.exit(1);
  }

  const processed = loadProcessed();
  console.log(`[pipeline] ${processed.size} already-processed IDs loaded`);

  const [anthropicItems, openaiItems] = await Promise.all([
    fetchAnthropicWeek(processed),
    fetchOpenAIWeek(processed),
  ]);

  const newItems = [...anthropicItems, ...openaiItems];
  console.log(`\nTotal new items: ${newItems.length}`);
  if (newItems.length === 0) { console.log('Nothing to do.'); return; }

  console.log('\nTranslating...');
  const translated = await translateBatch(newItems);
  console.log(`Translated: ${translated.filter(a => a.titleZh).length}/${translated.length}`);

  const existing = loadArticles();
  const existingIds = new Set(existing.map(a => a.id));
  const merged = [
    ...translated,
    ...existing.filter(a => existingIds.has(a.id) && !translated.find(t => t.id === a.id)),
  ].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  writeFileSync(ARTICLES_PATH, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${merged.length} articles to data/articles.json`);

  translated.forEach(a => processed.add(a.id));
  saveProcessed(processed);
  console.log('Updated processed-ids.json');
  console.log('=== Done ===');
}

run().catch(e => { console.error(e); process.exit(1); });
