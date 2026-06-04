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

/** Fetch Google News RSS headlines for a query (via curl). Returns structured items. */
async function newsHeadlines(query, max = 6) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS', '-L', '--compressed', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0', url,
    ], { maxBuffer: 4 * 1024 * 1024 });
    const feed = await parser.parseString(stdout);
    return (feed.items ?? []).slice(0, max).map((i) => {
      const raw = (i.title ?? '').trim();
      const sep = raw.lastIndexOf(' - ');
      return {
        title: sep > 0 ? raw.slice(0, sep).trim() : raw,
        publisher: sep > 0 ? raw.slice(sep + 3).trim() : '',
        date: (i.isoDate ?? '').slice(0, 10),
        url: i.link ?? '',
      };
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
    .map(([k, items]) => {
      const lines = items.length
        ? items.map((it, i) => `  [${k}-${i + 1}] ${it.title}${it.publisher ? ` —${it.publisher}` : ''}${it.date ? ` (${it.date})` : ''}`).join('\n')
        : '  (本期无相关头条)';
      return `【${k}】\n${lines}`;
    })
    .join('\n\n');
}

/** Collect all fetched URLs (deduped) for the Sources section. */
function collectSources(news) {
  const seen = new Set();
  const out = [];
  for (const items of Object.values(news)) {
    for (const it of items) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push({ title: it.title, publisher: it.publisher, url: it.url });
      }
    }
  }
  return out;
}

function buildPrompt(date, marketDigest, newsDigest, sources) {
  const sourceList = sources.map((s, i) => `[S${i + 1}] ${s.title}${s.publisher ? ` —${s.publisher}` : ''} ${s.url}`).join('\n');
  return `你是一位资深美股策略分析师，为一位中文价值投资者撰写《美股策略快报》（${date}）。

⚠️ 最高优先级铁律——所有内容必须有数据来源依据，严禁自行发挥：
1. **数字只能来自下方【实时行情数据】**。禁止编造任何价格、涨跌幅、估值倍数。引用数字时必须与行情数据完全一致。
2. **事件/动态只能来自下方【近期新闻头条】**。禁止编造任何未在头条中出现的事件、财报结果、公司动作。
3. **机构观点只能来自【近期新闻头条】中实际出现的机构表态**。如果头条里没有某机构（如 Goldman/Morgan Stanley/Apollo）的明确表态，就绝对不要写它的观点——宁可整段省略，也不要虚构"某某机构指出…"。
4. **不要编造具体的支撑位/阻力位数字**。只陈述行情数据里的当前实际数值；前瞻性判断要用定性语言，不要给出未经依据的精确点位。
5. 引用大师观点（Howard Marks/Buffett 等）时，只能用其广为人知的"框架/方法论"做分析视角，不得虚构其"最近说了某句话/最新备忘录指出"。
6. 如果某个行业或板块下方数据不足，就**如实写"本期数据有限"并少写**，不要为了凑字数而编造。

宁可短、宁可少，也不要无依据的"看起来很专业"的内容。这份报告的价值在于真实可溯源，不在于辞藻。

写作要求：
- 机构 strategist 简报风格，对真实数据做解读判断，不给买卖建议
- 覆盖 5 行业：🤖 AI/算力、⚡ 电力/数据中心、💾 半导体、☁️ 云/SaaS、🛢 能源
- 目标 1600-2400 字（数据足才写满，数据不足就短）
- 仅当【近期新闻头条】明确显示核心公司（NVDA/MSFT/GOOGL/AMZN/META/AMD/TSM/AVGO/CRWV/VST/CEG/CRM/XOM 等）刚发财报时，才加「## 【🔥 财报特别版 · 公司】」；且其中数据只能来自头条，不得虚构财报具体数字

严格按以下结构输出（第一行就是 # 标题，不要代码块包裹）：

# 美股策略快报 · ${date}

## 【一句话叙事】
> **[2-3 句，基于真实行情+头条的核心叙事]**

---

## 【你的行业速报】
（5 行业，emoji+副标题，每段引用行情实际数字 + 相关头条事件 + watch 信号）

---

[仅当头条确有核心公司财报时插入财报特别版]

---

## 【一个值得展开的信号】
> **[小标题]**
>
> [基于上方真实数据的一个深度解读视角，可用大师框架分析，但不得虚构事实/引述]

---

## 【机构观点雷达】
（**只列下方头条中实际出现的机构表态**；每条须能对应到一条头条。若本期头条无机构表态，则写"本期未捕获明确机构表态"）

---

## 【未来 48 小时看点】
| 时间 | 事件 | 关注度 | 关键看点 |
|---|---|---|---|
（只列【财报日历】【宏观/Fed】头条中实际出现的事件；无则少列）

**关键市场数据**（直接取自行情，不要编点位）：
- S&P 500 / Nasdaq / 10Y / 30Y / 油价：用下方实际数值

---

**字数**：约 X 字

---

**Sources（数据来源）**：
- 行情：Yahoo Finance（实时抓取，截至 ${date}）
- 新闻头条（仅列实际引用的，用下方 [S#] 链接）：
（从下方来源清单里挑你正文实际用到的，列出 markdown 链接）

===== 实时行情数据（截至 ${date}，唯一允许的数字来源）=====
${marketDigest}

===== 近期新闻头条（唯一允许的事件/观点来源）=====
${newsDigest}

===== 来源链接清单（用于 Sources 章节）=====
${sourceList}`;
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
  const sources = collectSources(news);

  if (sources.length < 3) {
    console.error(`[strategy-brief] 仅抓到 ${sources.length} 条新闻来源，数据不足，中止生成（避免无依据发挥）`);
    process.exit(3);
  }

  console.log('[strategy-brief] DeepSeek 生成快报...');
  const resp = await deepseekClient.messages.create({
    messages: [{ role: 'user', content: buildPrompt(date, marketDigest, newsDigest, sources) }],
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
