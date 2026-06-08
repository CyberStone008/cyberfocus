#!/usr/bin/env node
/**
 * backfill-report-tldr.js
 *
 * 给已有全文(contentMd)但缺 tldrZh 的报告，回填一句话主题说明。
 * 守溯源铁律（见 translate/report-tldr.js）。
 *
 *   node scripts/backfill-report-tldr.js              # 回填全部缺失
 *   MAX=10 node scripts/backfill-report-tldr.js       # 本次最多回填 10 篇
 *   FORCE=1 node scripts/backfill-report-tldr.js      # 连已有 tldrZh 的也重做
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateReportTldr } from './translate/report-tldr.js';

const PATH  = resolve(process.cwd(), 'data/articles.json');
const MAX   = Number(process.env.MAX ?? '9999');
const FORCE = process.env.FORCE === '1';

const all = JSON.parse(readFileSync(PATH, 'utf8'));
const targets = all.filter((a) => a.contentMd && a.contentMd.length > 200 && (FORCE || !a.tldrZh));

console.log(`[backfill-tldr] 共有全文报告 ${all.filter((a) => a.contentMd).length} 篇，待回填 ${targets.length} 篇（本次上限 ${MAX}）`);

let done = 0;
for (const a of targets) {
  if (done >= MAX) break;
  const title = a.titleZh || a.titleEn;
  const tldr = await generateReportTldr(title, a.contentMd);
  if (tldr) {
    a.tldrZh = tldr;
    done++;
    console.log(`  ✓ ${title.slice(0, 30)} → ${tldr}`);
    // 每篇都落盘，避免中途中断丢进度
    writeFileSync(PATH, JSON.stringify(all, null, 2));
  } else {
    console.log(`  ✗ ${title.slice(0, 30)} → 跳过（生成失败/内容过短）`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`[backfill-tldr] 完成，本次回填 ${done} 篇，已写入 ${PATH}`);
