#!/usr/bin/env node
/**
 * build-push-digest.js — 生成每日推送的标题+正文（Bark 与 Web Push 共用，单一事实来源）。
 *
 * 内容形式（站主 2026-06-11 拍板）：头条带一句话主题简介 + 几条标题。
 *   · 标题 100% 有（titleZh/titleEn 兜底）；一句话简介 tldrZh 仅约 1/3 覆盖
 *     （Google News/HN 等按规则跳过正文抓取，无 tldr）→ 头条有 tldr 就放、没有就退回多放一条标题。
 *   · 高价值源（各实验室官博）优先排前。
 *
 * 输出协议（供 workflow 用 head -1 / tail -n +2 解析，与原 Bark 内联逻辑一致）：
 *   第 1 行 = 通知标题
 *   第 2 行起 = 通知正文（多行）
 * 读不到数据/无新内容时输出安全兜底，绝不抛错（推送步骤 continue-on-error）。
 *
 * 用法：node scripts/build-push-digest.js [windowHours]   （默认窗口 3.5 小时，匹配批次节奏）
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const HIGH_VALUE = new Set([
  'Anthropic Blog', 'Claude Blog', 'OpenAI Blog', 'DeepMind Blog', 'Google DeepMind', 'NVIDIA Blog',
]);

const LEAD_TITLE_MAX = 40;
const LEAD_TLDR_MAX = 72;
const TITLE_MAX = 32;
const MAX_LINES = 5; // 正文最多几条（头条算 1 条）

/** 纯函数：给定文章数组与当前时刻，产出 { n, title, body }。便于单测，无 IO。 */
export function buildDigest(articles, nowMs, windowHours = 3.5) {
  const cut = new Date(nowMs - windowHours * 3600 * 1000).toISOString();
  const fresh = (articles || []).filter((a) => a && a.fetchedAt && a.fetchedAt > cut);
  const n = fresh.length;
  if (n === 0) {
    return { n: 0, title: '📰 CyberFocus 已更新', body: '今日 AI 精华已就绪，点开看看' };
  }
  // 高价值源优先，其次按发布时间倒序
  fresh.sort((x, y) =>
    (HIGH_VALUE.has(x.source) ? 0 : 1) - (HIGH_VALUE.has(y.source) ? 0 : 1) ||
    String(y.publishedAt).localeCompare(String(x.publishedAt)));

  const titleOf = (a) => String(a.titleZh || a.titleEn || '').replace(/\s+/g, ' ').trim();
  const clip = (s, max) => (s.length > max ? s.slice(0, max) + '…' : s);

  const lead = fresh[0];
  const leadTitle = titleOf(lead);
  const leadTldr = lead.tldrZh && lead.tldrZh.trim().length > 10
    ? clip(lead.tldrZh.replace(/\s+/g, ' ').trim(), LEAD_TLDR_MAX)
    : null;

  const lines = [`📌 ${clip(leadTitle, LEAD_TITLE_MAX)}`];
  if (leadTldr) lines.push(leadTldr);

  // 头条占 1 行（无 tldr）或 2 行（有 tldr）；其余名额放标题
  const restSlots = MAX_LINES - (leadTldr ? 2 : 1);
  const rest = fresh.slice(1, 1 + restSlots);
  for (const a of rest) lines.push(`• ${clip(titleOf(a), TITLE_MAX)}`);

  const shown = 1 + rest.length;
  if (n > shown) lines.push(`…等共 ${n} 条，点开查看`);

  return { n, title: `📰 CyberFocus · 新增 ${n} 条`, body: lines.join('\n') };
}

function main() {
  const windowHours = Number(process.argv[2]) || 3.5;
  let articles = [];
  try {
    articles = JSON.parse(readFileSync(resolve(process.cwd(), 'data/articles.json'), 'utf8'));
  } catch {
    // 读不到就走兜底
  }
  const { title, body } = buildDigest(articles, Date.now(), windowHours);
  // 协议：第 1 行标题，其余正文
  process.stdout.write(title + '\n' + body + '\n');
}

// 仅在被直接执行时跑 main（被 import 做单测时不执行）
import { pathToFileURL } from 'url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
