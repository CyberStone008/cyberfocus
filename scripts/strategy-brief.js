#!/usr/bin/env node
/**
 * 美股策略快报 — 本地管道版（替代 Claude Code routine）
 *
 * 为什么存在：原 Claude Code 定时任务(routine)只在应用打开时才触发、过点不补跑、
 * 需手动批准工具权限——不可靠。本脚本改由 launchd(run-daily.sh)驱动：可靠、能补跑。
 *
 * 数据源（均免 key、走代理）：
 *   - 行情：Yahoo Finance chart API (scripts/fetch/market-data.js)
 *   - 新闻：Google News RSS via curl (与 hr-orgs.js 同款)
 *   - 生成：DeepSeek (与翻译/解读一致的后端)
 *
 * 节奏：每 2 天一篇 + 自动补跑（最近一篇 >= 2 天前则生成今天的）。
 *
 * 用法：
 *   USE: 由 run-daily.sh 调用（带 DEEPSEEK_API_KEY 环境）
 *   FORCE=1 node scripts/strategy-brief.js        # 强制生成今天
 *   DATE=2026-06-04 node scripts/strategy-brief.js # 指定日期
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import Parser from 'rss-parser';
import { setupProxy } from './utils/proxy.js';
import { fetchMarketData, formatMarketDigest } from './fetch/market-data.js';
import { deepseekClient, isDeepSeekMode } from './translate/deepseek.js';

const execFileAsync = promisify(execFile);
const parser = new Parser({ timeout: 14000 });
const BRIEFS_DIR = resolve(process.cwd(), 'data/strategy-briefs');
const CADENCE_DAYS = 2;

/** Beijing-time today (YYYY-MM-DD) */
function todayBJ() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Latest existing brief date, or null */
function latestBriefDate() {
  if (!existsSync(BRIEFS_DIR)) return null;
  const files = readdirSync(BRIEFS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace('.md', '') : null;
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

/** Fetch Google News RSS headlines for a query (via curl, proxy-independent) */
async function newsHeadlines(query, max = 6) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS', '-L', '--compressed', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0', url,
    ], { maxBuffer: 4 * 1024 * 1024 });
    const feed = await parser.parseString(stdout);
    return (feed.items ?? []).slice(0, max).map((i) => {
      const t = (i.title ?? '').replace(/ - [^-]+$/, '').trim();
      const d = (i.isoDate ?? '').slice(0, 10);
      return `- ${t}${d ? ` (${d})` : ''}`;
    });
  } catch {
    return [];
  }
}

async function gatherNews() {
  const queries = {
    '美股大盘': 'US stock market today S&P 500 Nasdaq',
    'AI/半导体': 'Nvidia AMD Broadcom TSMC AI chip earnings',
    '电力/数据中心': 'AI data center power Vistra Constellation utilities',
    '云/SaaS': 'Microsoft Azure Salesforce cloud software AI agent',
    '能源': 'oil price OPEC Brent crude energy stocks',
    '宏观/Fed': 'Federal Reserve interest rate inflation jobs Treasury yield',
    '机构观点': 'Apollo Slok Goldman Sachs JPMorgan market outlook',
    '财报日历': 'earnings this week stock market calendar',
  };
  const out = {};
  for (const [k, q] of Object.entries(queries)) {
    out[k] = await newsHeadlines(q);
    await new Promise((r) => setTimeout(r, 800)); // gentle stagger
  }
  return out;
}

function formatNewsDigest(news) {
  return Object.entries(news)
    .map(([k, items]) => `【${k}】\n${items.length ? items.join('\n') : '  (无)'}`)
    .join('\n\n');
}

function buildPrompt(date, marketDigest, newsDigest) {
  return `你是一位资深美股策略分析师，为一位中文价值投资者撰写《美股策略快报》。基于下面提供的【实时行情数据】和【近期新闻头条】，生成 ${date} 的策略快报。

要求：
- 重新组织成"机构 strategist 给客户的简报"风格，不要罗列原始数据，要有解读和判断
- 覆盖 5 个行业：🤖 AI/算力、⚡ 电力/数据中心、💾 半导体、☁️ 云/SaaS、🛢 能源
- 数据密度高：每段引用具体数字（来自下方行情）
- 有判断但不给买卖建议；保持怀疑独立的笔触
- 目标 2000-2600 字
- 如果【近期新闻头条】里明确显示核心公司（NVDA/MSFT/GOOGL/AMZN/META/AMD/TSM/ASML/AVGO/MU/ARM/CRWV/VST/CEG/CRM/XOM 等）刚发布财报，额外加一个「## 【🔥 财报特别版 · 公司】」章节深度分析；若无则跳过

严格按以下 Markdown 结构输出（第一行就是 # 标题，不要代码块包裹、不要 frontmatter）：

# 美股策略快报 · ${date}

## 【一句话叙事】
> **[加粗 2-3 句最核心叙事，要有"为什么这两天市场是这样"的解释力]**

---

## 【你的行业速报】
（5 个行业，每个 🤖/⚡/💾/☁️/🛢 emoji 开头加副标题，每段 150-200 字，含具体数据 + watch 信号）

---

[如有核心公司财报，在此插入 ## 【🔥 财报特别版 · XXX】 含数据卡表格 + 三个 takeaway + 给投资者启示]

---

## 【一个值得展开的信号】
> **[小标题]**
>
> [300-400 字 counter-consensus 深度分析，可引用 Howard Marks/Buffett/Damodaran]

---

## 【机构观点雷达】
（Apollo Slok / Goldman / Morgan Stanley / Howard Marks 等，每家 1-2 条要点，可基于新闻头条合理归纳）

---

## 【未来 48 小时看点】
| 时间 | 事件 | 关注度 | 关键看点 |
|---|---|---|---|
（4-5 行，基于财报日历/宏观新闻）

**关键技术位**：
- S&P 500 / 10Y / 30Y / VIX / 油价（用下方行情实际数值）

---

**字数**：约 X 字  |  **阅读时长**：N 分钟

---

**Sources（数据来源）**：
- 行情数据：Yahoo Finance（实时抓取）
- 新闻：Google News 聚合

===== 实时行情数据（截至 ${date}）=====
${marketDigest}

===== 近期新闻头条 =====
${newsDigest}`;
}

async function main() {
  const force = process.env.FORCE === '1';
  const date = process.env.DATE || todayBJ();

  // 节奏判断：每 2 天一篇 + 自动补跑
  if (!force && !process.env.DATE) {
    const latest = latestBriefDate();
    if (latest && daysBetween(latest, date) < CADENCE_DAYS) {
      console.log(`[strategy-brief] 最近一篇 ${latest} 距今 < ${CADENCE_DAYS} 天，跳过`);
      return;
    }
  }

  const outPath = resolve(BRIEFS_DIR, `${date}.md`);
  if (existsSync(outPath) && !force) {
    console.log(`[strategy-brief] ${date}.md 已存在，跳过`);
    return;
  }

  if (!isDeepSeekMode()) {
    console.error('[strategy-brief] 未设 DEEPSEEK_API_KEY，无法生成');
    process.exit(1);
  }

  await setupProxy();

  console.log('[strategy-brief] 抓取行情数据...');
  const market = await fetchMarketData();
  const marketDigest = formatMarketDigest(market);

  console.log('[strategy-brief] 抓取新闻头条...');
  const news = await gatherNews();
  const newsDigest = formatNewsDigest(news);

  console.log('[strategy-brief] DeepSeek 生成快报...');
  const resp = await deepseekClient.messages.create({
    messages: [{ role: 'user', content: buildPrompt(date, marketDigest, newsDigest) }],
    max_tokens: 8000,
    _timeoutMs: 180000,
  });
  let md = resp.content[0].text.trim();
  // strip accidental code fences
  md = md.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();

  if (!md.startsWith('#')) {
    console.error('[strategy-brief] 生成内容异常（非 Markdown），中止');
    process.exit(2);
  }

  if (!existsSync(BRIEFS_DIR)) mkdirSync(BRIEFS_DIR, { recursive: true });
  writeFileSync(outPath, md + '\n');
  console.log(`[strategy-brief] ✓ 写入 ${date}.md (${md.length} 字)`);
}

main().catch((e) => { console.error('[strategy-brief]', e.message); process.exit(1); });
