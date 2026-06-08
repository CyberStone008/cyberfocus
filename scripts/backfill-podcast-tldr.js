#!/usr/bin/env node
/**
 * backfill-podcast-tldr.js
 *
 * 给精选播客卡片生成「结论先行」一句话说明（tldrZh），守数据溯源铁律：
 *  - Lex（有逐字稿解读）→ 用其 contentMd（逐字稿支撑，可靠）
 *  - 其余源 → 用官方节目简介 abstractZh/En（真实创作者文案，不用推断式解读，避免外推）
 *
 *   node scripts/backfill-podcast-tldr.js
 *   MAX=5 / FORCE=1 同 report 版
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateReportTldr } from './translate/report-tldr.js';

const PATH  = resolve(process.cwd(), 'data/podcasts.json');
const MAX   = Number(process.env.MAX ?? '9999');
const FORCE = process.env.FORCE === '1';

const all = JSON.parse(readFileSync(PATH, 'utf8'));

function materialFor(ep) {
  const lexTranscript = ep.source === 'Lex Fridman Podcast' && ep.contentMd && ep.contentMd.length > 300;
  if (lexTranscript) return { text: ep.contentMd, label: '节目解读' };
  // 取更丰富的简介（No Priors 的英文简介远比中文长）
  const zh = ep.abstractZh || '', en = ep.abstractEn || '';
  return { text: en.length > zh.length ? en : zh, label: '节目简介' };
}

const targets = all.filter((ep) => {
  if (!FORCE && ep.tldrZh) return false;
  return materialFor(ep).text.trim().length >= 150;   // 素材太短(基本=标题)的跳过，退回显示原简介
});

console.log(`[backfill-podcast-tldr] 共 ${all.length} 集，可生成 ${targets.length} 集（本次上限 ${MAX}）`);

let done = 0;
for (const ep of targets) {
  if (done >= MAX) break;
  const title = ep.titleZh || ep.titleEn;
  const { text, label } = materialFor(ep);
  const tldr = await generateReportTldr(title, text, { kind: '节目', label, minLen: 150 });
  if (tldr) {
    ep.tldrZh = tldr;
    done++;
    console.log(`  ✓ [${ep.source}] ${String(title).slice(0, 24)} → ${tldr}`);
    writeFileSync(PATH, JSON.stringify(all, null, 2));
  } else {
    console.log(`  ✗ ${String(title).slice(0, 24)} → 跳过`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`[backfill-podcast-tldr] 完成，本次 ${done} 集，写入 ${PATH}`);
