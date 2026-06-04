#!/usr/bin/env node
/**
 * 美股季度宏观 — 本地管道版（替代 Claude Code routine，由 launchd 驱动）
 *
 * 数据: Yahoo(利率/指数/美元/油价/黄金) + Google News(Fed/CPI/就业/GDP) → DeepSeek。
 * 节奏: 每季度首月(1/4/7/10)1 日生成(自 gate); FORCE=1 / QUARTER=2026-Q3 手动。
 * 数据溯源铁律: 数字只来自行情/头条, 机构观点只来自抓取头条, 不编造。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { fetchMarketData, formatMarketDigest } from './fetch/market-data.js';
import { gatherNews, formatNewsDigest, collectSources, formatSourceList } from './lib/market-news.js';
import { deepseekClient, isDeepSeekMode } from './translate/deepseek.js';

const DIR = resolve(process.cwd(), 'data/macro-reports');

function nowBJ() { return new Date(Date.now() + 8 * 3600 * 1000); }
function currentQuarter() {
  const d = nowBJ();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function buildPrompt(quarter, marketDigest, newsDigest, sourceList) {
  return `你是一位资深宏观策略师，撰写 ${quarter} 的《美股季度宏观》。这是"价值投资"板块唯一自上而下的栏目，为其他自下而上栏目提供周期坐标。

⚠️ 数据溯源铁律（最高优先级）：
1. 所有数字（利率/CPI/GDP/失业率等）只能来自【实时行情数据】或【近期新闻头条】，禁止编造或用记忆里的旧数据。
2. 机构观点（Goldman/Morgan Stanley/Apollo/JPM/Fed 官员）只能来自头条中实际出现的表态；没搜到就绝不虚构。
3. regime 判定、风险情景概率是你的分析判断（可以有），但支撑数据必须真实可溯源。
4. 数据不足就如实说明并少写。

严格按结构输出（第一行就是 # 标题，不要代码块包裹）：

# 美股季度宏观 · ${quarter}

## 【本季定调】
> **[一句话判定当前 regime + 最重要宏观判断，基于真实数据]**

---

## 【一、当前 regime 判定】（600-800 字）
[用美林时钟(增长×通胀)+信用周期+流动性定位周期位置。增长/通胀数据来自头条，利率来自行情。给明确判断。]

---

## 【二、宏观五要素】（800-1000 字）
分别写：Fed路径 / 通胀 / 利率与曲线(用行情 10Y/30Y 实际值) / 美元(用行情 DXY) / 信用利差。每个给"当前读数+方向+对股市含义"。数字必须可溯源。

---

## 【三、行业轮动时钟】（600-800 字）
| 行业 | 配置建议 | 逻辑 | 关键风险 |
|---|---|---|---|
（AI算力/电力/半导体/云SaaS/能源/金融/防御，基于 regime 推导）
表格后 300 字：当前 regime 下资金该从哪流向哪。

---

## 【四、大类资产配置含义】（400-500 字）
股/债/商品/现金/黄金 相对吸引力 + 逻辑，不给具体仓位。

---

## 【五、本季三大风险情景】
| 情景 | 概率 | 触发条件 | 对组合冲击 | 对冲思路 |
|---|---|---|---|---|
（3 个情景，每个 100-150 字展开）

---

## 【六、本季需跟踪的关键变量】
[4-5 个会决定 regime 是否切换的数据/事件，来自头条]

---

**字数**：约 X 字

---

**Sources（数据来源）**：
- 行情：Yahoo Finance（实时抓取）
- 新闻头条（仅列正文实际引用的 [S#]）：

===== 实时行情数据（利率/指数/美元/油价，唯一数字来源之一）=====
${marketDigest}

===== 近期宏观新闻头条（Fed/CPI/就业/GDP，唯一事件/观点来源）=====
${newsDigest}

===== 来源链接清单 =====
${sourceList}`;
}

async function main() {
  const force = process.env.FORCE === '1';
  const quarter = process.env.QUARTER || currentQuarter();

  if (!force && !process.env.QUARTER) {
    const d = nowBJ();
    const isQuarterStart = [0, 3, 6, 9].includes(d.getUTCMonth()) && d.getUTCDate() === 1;
    if (!isQuarterStart) { console.log('[quarterly-macro] 非季度首日，跳过'); return; }
  }

  const outPath = resolve(DIR, `${quarter}.md`);
  if (existsSync(outPath) && !force) { console.log(`[quarterly-macro] ${quarter}.md 已存在`); return; }

  if (!isDeepSeekMode()) { console.error('[quarterly-macro] 未设 DEEPSEEK_API_KEY'); process.exit(1); }

  await setupProxy();
  console.log('[quarterly-macro] 抓行情...');
  const marketDigest = formatMarketDigest(await fetchMarketData());
  console.log('[quarterly-macro] 抓宏观新闻...');
  const news = await gatherNews({
    'Fed/利率': 'Federal Reserve interest rate FOMC dot plot rate cut',
    '通胀': 'US inflation CPI PCE core',
    '增长/就业': 'US GDP growth jobs unemployment ISM PMI recession',
    '收益率曲线': 'Treasury yield curve 10 year 30 year steepening',
    '美元/信用': 'US dollar DXY credit spreads high yield',
    '机构宏观': 'Goldman Sachs JPMorgan Apollo Slok Morgan Stanley macro outlook',
    '轮动配置': 'sector rotation asset allocation stocks bonds',
  }, 6);
  const newsDigest = formatNewsDigest(news);
  const sources = collectSources(news);
  if (sources.length < 4) { console.error(`[quarterly-macro] 新闻来源仅 ${sources.length} 条，数据不足，中止`); process.exit(3); }

  console.log('[quarterly-macro] DeepSeek 生成...');
  const resp = await deepseekClient.messages.create({
    messages: [{ role: 'user', content: buildPrompt(quarter, marketDigest, newsDigest, formatSourceList(sources)) }],
    max_tokens: 8000, _timeoutMs: 180000,
  });
  let md = resp.content[0].text.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!md.startsWith('#')) { console.error('[quarterly-macro] 生成异常'); process.exit(2); }

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(outPath, md + '\n');
  console.log(`[quarterly-macro] ✓ 写入 ${quarter}.md (${md.length} 字)`);
}

main().catch((e) => { console.error('[quarterly-macro]', e.message); process.exit(1); });
