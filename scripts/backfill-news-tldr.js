#!/usr/bin/env node
/**
 * backfill-news-tldr.js
 *
 * 为「AI 热点精选 / 人服机构动态」里的新闻卡片补结论先行说明（tldrZh）：
 * 抓原文网页正文 → 基于真实正文生成（守溯源铁律）。抓不到正文的（Google News
 * 跳转链接 / 付费墙 / 反爬）一律跳过，卡片退回只显示标题，绝不硬编。
 *
 *   node scripts/backfill-news-tldr.js            # 默认处理最近 MAX 条
 *   MAX=200 node scripts/backfill-news-tldr.js
 *   FORCE=1 ...                                    # 连已有 tldrZh 的也重做
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fetchAnySourceMd } from './translate/featured-content.js';
import { generateReportTldr } from './translate/report-tldr.js';

const PATH  = resolve(process.cwd(), 'data/articles.json');
const MAX   = Number(process.env.MAX ?? '80');
const FORCE = process.env.FORCE === '1';

// 这些 host 抓不到正文（跳转页/无文章页），直接跳过省时间
const SKIP_HOSTS = ['news.google.com', 'arxiv.org', 'huggingface.co', 'news.ycombinator.com'];

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function fetchable(a) {
  if (a.contentMd) return false;             // 有全文的走 report-tldr 路径
  if (!a.sourceUrl || !/^https?:/.test(a.sourceUrl)) return false;
  const h = host(a.sourceUrl);
  return !SKIP_HOSTS.some((s) => h === s || h.endsWith('.' + s));
}

const all = JSON.parse(readFileSync(PATH, 'utf8'));
const targets = all
  .filter((a) => (FORCE || !a.tldrZh) && fetchable(a))
  .sort((a, b) => String(b.fetchedAt || b.publishedAt).localeCompare(String(a.fetchedAt || a.publishedAt)));

console.log(`[news-tldr] 可尝试 ${targets.length} 条，本次上限 ${MAX}`);

let attempted = 0, ok = 0, noBody = 0;
for (const a of targets) {
  if (attempted >= MAX) break;
  attempted++;
  let md = null;
  try { md = await fetchAnySourceMd(a); } catch { /* 抓取失败 */ }
  if (!md || md.length < 500) { noBody++; continue; }   // 没抓到正文 → 跳过(退回标题)
  const tldr = await generateReportTldr(a.titleZh || a.titleEn, md, { kind: '报道', label: '原文正文', minLen: 200, detail: true });
  if (tldr) {
    a.tldrZh = tldr;
    ok++;
    console.log(`  ✓ [${a.source}] ${tldr.slice(0, 60)}…`);
    writeFileSync(PATH, JSON.stringify(all, null, 2));
  } else { noBody++; }
  await new Promise((r) => setTimeout(r, 600));
}
console.log(`[news-tldr] 完成：尝试 ${attempted}，成功 ${ok}，未抓到正文/跳过 ${noBody}（成功率 ${attempted ? Math.round(ok / attempted * 100) : 0}%）`);
