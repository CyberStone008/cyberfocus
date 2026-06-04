#!/usr/bin/env node
/**
 * 美股行业周报 — 本地管道版（替代 Claude Code routine，由 launchd 驱动）
 *
 * 可靠性: launchd 准时 + 错过开机补跑, 不需开应用/批权限。
 * 数据: Yahoo 行情(周涨跌) + Google News + 读历史报告做 thesis 追踪 → DeepSeek。
 * 节奏: 每周六生成(自 gate); 也可 FORCE=1 / DATE=YYYY-MM-DD 手动。
 * 数据溯源铁律: 数字只来自行情, 事件/机构观点只来自抓取头条, 不编造。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { fetchMarketData, formatMarketDigest } from './fetch/market-data.js';
import { gatherNews, formatNewsDigest, collectSources, formatSourceList } from './lib/market-news.js';
import { deepseekClient, isDeepSeekMode } from './translate/deepseek.js';

const DIR = resolve(process.cwd(), 'data/weekly-reports');
const BRIEFS_DIR = resolve(process.cwd(), 'data/strategy-briefs');

function todayBJ() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
function dow(dateKey) { const [y, m, d] = dateKey.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

/** Most recent existing weekly date, or null */
function latestWeekly() {
  if (!existsSync(DIR)) return null;
  const f = readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort();
  return f.length ? f[f.length - 1].replace('.md', '') : null;
}

/** Pull the 一句话叙事 + a few section headers from recent briefs for thesis tracking. */
function recentBriefExcerpts(n = 4) {
  if (!existsSync(BRIEFS_DIR)) return '';
  const files = readdirSync(BRIEFS_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort().slice(-n);
  return files.map((f) => {
    const md = readFileSync(resolve(BRIEFS_DIR, f), 'utf8');
    // keep it compact: narrative + signal section
    const narr = (md.match(/##\s*【一句话叙事】[\s\S]{0,500}/) || [''])[0];
    const sig  = (md.match(/##\s*【一个值得展开的信号】[\s\S]{0,600}/) || [''])[0];
    return `=== 策略快报 ${f.replace('.md', '')} ===\n${narr}\n${sig}`;
  }).join('\n\n');
}

function buildPrompt(date, marketDigest, newsDigest, sourceList, briefExcerpts) {
  return `你是一位资深美股策略分析师，撰写 ${date}（周六）的《美股行业周报》。与每 2 天的"策略快报"错位互补——**周报核心是「thesis 追踪 / 问责闭环」**：回看下方"前期策略快报摘录"里的判断，本周被验证还是被打脸。

⚠️ 数据溯源铁律（最高优先级）：
1. 数字只能来自【实时行情数据】（含周涨跌），禁止编造。
2. 事件/机构观点只能来自【近期新闻头条】；没搜到某机构表态就绝不虚构。
3. thesis 追踪只能基于下方"前期策略快报摘录"里真实出现过的判断 + 本周真实行情/头条来核对。
4. 不编造精确点位；数据不足就如实说明并少写。

严格按结构输出（第一行就是 # 标题，不要代码块包裹）：

# 美股行业周报 · ${date}

## 【本周一句话】
> **[基于真实行情+头条，沉淀本周 1-2 个主线叙事]**

---

## 【七行业一周扫描】
| 行业 | 周涨跌 | 关键事件 | 一周定性 |
|---|---|---|---|
（用行情里的周涨跌实际数值；关键事件来自头条；覆盖 AI/算力、电力、半导体、云SaaS、能源、金融、防御）
表格后 200 字解读资金流向。

---

## 【📋 Thesis 追踪】（本栏目核心）
| 判断来源 | 原始判断 | 本周进展 | 裁定 |
|---|---|---|---|
（从"前期策略快报摘录"提取 4-6 条可验证判断，用本周真实行情/头条核对，裁定 ✅验证/❌打脸/⏳待观察）
表格后 300 字诚实复盘：哪些成立、哪些被证伪、教训。看错就承认。

---

## 【跨行业主题】
[200-300 字：横跨多行业的结构性信号，基于真实数据]

---

## 【下周关键日历】
| 日期 | 事件 | 关注度 | 看点 |
|---|---|---|---|
（只列头条中实际出现的财报/数据/Fed 事件）

---

**字数**：约 X 字

---

**Sources（数据来源）**：
- 行情：Yahoo Finance（实时抓取，截至 ${date}）
- 新闻头条（仅列正文实际引用的 [S#]）：

===== 前期策略快报摘录（thesis 追踪依据）=====
${briefExcerpts || '（无历史快报）'}

===== 实时行情数据（含周涨跌，唯一数字来源）=====
${marketDigest}

===== 近期新闻头条（唯一事件/观点来源）=====
${newsDigest}

===== 来源链接清单 =====
${sourceList}`;
}

async function main() {
  const force = process.env.FORCE === '1';
  const date = process.env.DATE || todayBJ();

  if (!force && !process.env.DATE) {
    // 仅周六生成；且本周尚未生成
    if (dow(date) !== 6) { console.log('[weekly-review] 非周六，跳过'); return; }
    const latest = latestWeekly();
    if (latest === date) { console.log('[weekly-review] 本周已生成，跳过'); return; }
  }

  const outPath = resolve(DIR, `${date}.md`);
  if (existsSync(outPath) && !force) { console.log(`[weekly-review] ${date}.md 已存在`); return; }

  if (!isDeepSeekMode()) { console.error('[weekly-review] 未设 DEEPSEEK_API_KEY'); process.exit(1); }

  await setupProxy();
  console.log('[weekly-review] 抓行情...');
  const marketDigest = formatMarketDigest(await fetchMarketData());
  console.log('[weekly-review] 抓新闻...');
  const news = await gatherNews({
    '美股一周': 'US stock market week review S&P 500 Nasdaq sectors',
    'AI/半导体': 'Nvidia AMD Broadcom TSMC AI chip stocks week',
    '电力/数据中心': 'AI data center power Vistra Constellation utilities',
    '云/SaaS': 'Microsoft Azure Salesforce cloud software AI',
    '能源': 'oil price OPEC Brent energy stocks',
    '金融/宏观': 'Federal Reserve rates jobs Treasury yield banks',
    '机构观点': 'Apollo Slok Goldman Sachs JPMorgan Morgan Stanley outlook',
    '下周日历': 'earnings economic calendar next week',
  });
  const newsDigest = formatNewsDigest(news);
  const sources = collectSources(news);
  if (sources.length < 3) { console.error(`[weekly-review] 新闻来源仅 ${sources.length} 条，数据不足，中止`); process.exit(3); }

  console.log('[weekly-review] DeepSeek 生成...');
  const resp = await deepseekClient.messages.create({
    messages: [{ role: 'user', content: buildPrompt(date, marketDigest, newsDigest, formatSourceList(sources), recentBriefExcerpts()) }],
    max_tokens: 8000, _timeoutMs: 180000,
  });
  let md = resp.content[0].text.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!md.startsWith('#')) { console.error('[weekly-review] 生成异常'); process.exit(2); }

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(outPath, md + '\n');
  console.log(`[weekly-review] ✓ 写入 ${date}.md (${md.length} 字)`);
}

main().catch((e) => { console.error('[weekly-review]', e.message); process.exit(1); });
