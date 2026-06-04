#!/usr/bin/env node
/**
 * 美股行业深度 — 本地管道版（替代 Claude Code routine，由 launchd 驱动）
 *
 * 数据: Yahoo 行情(该行业 ticker 真实价格/涨跌) + Google News(行业+公司+机构)
 *       → DeepSeek 生成横纵分析报告。
 * 节奏: 每月 1 日按行业轮转(自 gate); FORCE=1 / SECTOR=ai-compute 手动。
 * 数据溯源铁律: 估值倍数等若头条/行情无, 标 n/a, 不编造。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { setupProxy } from './utils/proxy.js';
import { fetchQuotes, formatQuotes } from './fetch/market-data.js';
import { gatherNews, formatNewsDigest, collectSources, formatSourceList } from './lib/market-news.js';
import { deepseekClient, isDeepSeekMode } from './translate/deepseek.js';

const DIR = resolve(process.cwd(), 'data/sector-reports');

// 行业轮转表：月份(1-12) → {slug, 中文名, tickers, 新闻关键词}
const ROTATION = {
  5:  { slug: 'power-datacenter', name: '电力 / 数据中心',
        tickers: [['VST','Vistra'],['CEG','Constellation'],['NRG','NRG'],['NEE','NextEra'],['D','Dominion'],['TLN','Talen'],['OKLO','Oklo'],['SMR','NuScale'],['CCJ','Cameco'],['GEV','GE Vernova'],['EQIX','Equinix'],['DLR','Digital Realty']],
        q: 'AI data center power demand utilities nuclear Vistra Constellation' },
  6:  { slug: 'ai-compute', name: 'AI 算力 / GPU',
        tickers: [['NVDA','Nvidia'],['AMD','AMD'],['AVGO','Broadcom'],['TSM','TSMC'],['MRVL','Marvell'],['CRWV','CoreWeave'],['SMCI','Supermicro'],['DELL','Dell'],['ANET','Arista'],['MU','Micron']],
        q: 'AI compute GPU Nvidia AMD hyperscaler capex data center chips' },
  7:  { slug: 'semiconductors', name: '半导体',
        tickers: [['TSM','TSMC'],['ASML','ASML'],['NVDA','Nvidia'],['AMD','AMD'],['AVGO','Broadcom'],['MU','Micron'],['AMAT','Applied Materials'],['LRCX','Lam Research'],['KLAC','KLA'],['ARM','Arm'],['INTC','Intel'],['QCOM','Qualcomm']],
        q: 'semiconductor TSMC ASML chip equipment HBM foundry earnings' },
  8:  { slug: 'cloud-saas', name: '云 / SaaS',
        tickers: [['MSFT','Microsoft'],['GOOGL','Alphabet'],['AMZN','Amazon'],['CRM','Salesforce'],['NOW','ServiceNow'],['SNOW','Snowflake'],['ADBE','Adobe'],['ORCL','Oracle'],['DDOG','Datadog'],['CRWD','CrowdStrike']],
        q: 'cloud SaaS Microsoft Azure AWS Salesforce agentic AI software' },
  9:  { slug: 'energy', name: '能源 / 油气',
        tickers: [['XOM','Exxon'],['CVX','Chevron'],['COP','ConocoPhillips'],['OXY','Occidental'],['SLB','SLB'],['EOG','EOG'],['MPC','Marathon'],['PSX','Phillips66'],['WMB','Williams'],['KMI','Kinder Morgan']],
        q: 'oil price OPEC energy stocks Exxon Chevron Brent crude' },
  10: { slug: 'ai-applications', name: 'AI 应用层 / 软件',
        tickers: [['PLTR','Palantir'],['CRM','Salesforce'],['NOW','ServiceNow'],['MSFT','Microsoft'],['META','Meta'],['GOOGL','Alphabet'],['ADBE','Adobe'],['HUBS','HubSpot'],['APP','AppLovin'],['DUOL','Duolingo']],
        q: 'AI applications software agentic productivity Palantir consumer AI' },
  11: { slug: 'fintech-banks', name: '金融科技 / 银行',
        tickers: [['JPM','JPMorgan'],['BAC','BofA'],['GS','Goldman'],['MS','Morgan Stanley'],['V','Visa'],['MA','Mastercard'],['PYPL','PayPal'],['SQ','Block'],['COIN','Coinbase'],['SOFI','SoFi']],
        q: 'banks financials fintech rates net interest margin JPMorgan' },
  12: { slug: 'year-review', name: '年度综合',
        tickers: [['^GSPC','S&P 500'],['^IXIC','Nasdaq'],['NVDA','Nvidia'],['MSFT','Microsoft'],['XLK','科技'],['XLE','能源'],['XLF','金融'],['SMH','半导体']],
        q: 'US stock market year review 2026 sectors performance AI' },
};

function nowBJ() { return new Date(Date.now() + 8 * 3600 * 1000); }
function ymKey() { const d = nowBJ(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

function buildPrompt(ym, sector, quoteDigest, newsDigest, sourceList) {
  return `你是一位资深行业研究分析师，撰写 ${ym} 的《美股行业深度》——本月行业：${sector.name}。方法论：横纵分析法（纵向追行业演进识别周期位置，横向比同业）。

⚠️ 数据溯源铁律（最高优先级）：
1. **估值横截面表里的数字**：价格/日涨跌/周涨跌只能用下方【行业行情数据】的真实值；PE/EV-EBITDA/ROIC/毛利率等若头条里没有明确数据，**一律填 n/a，绝不估算编造**。
2. 公司动态/财报/机构观点只能来自【行业新闻头条】；没搜到就不写。
3. 历史演进（纵轴）可写公认事实，但具体数字仍需可溯源。
4. watch list、风险情景是你的分析判断（可以有），但支撑数据必须真实。

严格按结构输出（第一行就是 # 标题，不要代码块包裹）：

# 美股行业深度 · ${ym} · ${sector.name}

> **[本月深度焦点：一句话定调]**

---

## 【一、执行摘要】（600-800 字）
[周期阶段 + 3 个最重要事实 + 对价值投资者核心启示 + 3 个关键风险]

---

## 【二、纵向：行业演进与周期位置】（800-1000 字）
[行业从起点到当下的演进 + 当前处于复苏/扩张/成熟/转型哪个阶段，用真实数据论证]

---

## 【三、横向：竞争格局与估值横截面】（1000-1200 字）
| 公司 | 价格 | 日涨跌 | 周涨跌 | PE | EV/EBITDA | 简评 |
|---|---|---|---|---|---|---|
（价格/涨跌用下方行情真实值；PE/EV-EBITDA 头条有才填、否则 n/a）
表格后 600 字解读：谁是 quality compounder、谁贵谁便宜、市场共识偏差在哪。

---

## 【四、关键驱动与风险】（800 字）
[正向驱动 3-5 条 + 负向风险 3-5 条，每条有数据/头条支撑]

---

## 【五、机构观点对照】（400-500 字）
（只列头条中实际出现的机构表态；没有就写"本期未捕获明确机构表态"）

---

## 【六、价值投资者的 watch list】（600 字）
[quality compounder / 均值回归 / 特殊机会 三类，每只标的给逻辑+关键监测信号，不给买卖建议]

---

**字数**：约 X 字

---

**Sources（数据来源）**：
- 行情：Yahoo Finance（实时抓取）
- 新闻头条（仅列正文实际引用的 [S#]）：

===== 行业行情数据（${sector.name}，价格/涨跌真实值，唯一数字来源）=====
${quoteDigest}

===== 行业新闻头条（唯一事件/观点来源）=====
${newsDigest}

===== 来源链接清单 =====
${sourceList}`;
}

async function main() {
  const force = process.env.FORCE === '1';
  const d = nowBJ();
  const month = process.env.SECTOR_MONTH ? parseInt(process.env.SECTOR_MONTH, 10) : (d.getUTCMonth() + 1);
  const sector = ROTATION[month];
  if (!sector) { console.log('[sector-deep-dive] 无该月行业配置'); return; }

  if (!force && !process.env.SECTOR_MONTH) {
    if (d.getUTCDate() !== 1) { console.log('[sector-deep-dive] 非每月1日，跳过'); return; }
  }

  const ym = process.env.YM || ymKey();
  const outPath = resolve(DIR, `${ym}-${sector.slug}.md`);
  if (existsSync(outPath) && !force) { console.log(`[sector-deep-dive] ${ym}-${sector.slug}.md 已存在`); return; }

  if (!isDeepSeekMode()) { console.error('[sector-deep-dive] 未设 DEEPSEEK_API_KEY'); process.exit(1); }

  await setupProxy();
  console.log(`[sector-deep-dive] 行业: ${sector.name} | 抓行情...`);
  const quotes = await fetchQuotes(sector.tickers.map(([sym, name]) => ({ sym, name })));
  const quoteDigest = formatQuotes(quotes);

  console.log('[sector-deep-dive] 抓新闻...');
  const compNames = sector.tickers.slice(0, 6).map(([, n]) => n).join(' OR ');
  const news = await gatherNews({
    '行业宏观': sector.q,
    '公司动态': `${compNames} stock earnings news`,
    '估值分析': `${sector.name.split(' ')[0]} stocks valuation analyst rating price target`,
    '机构观点': `${sector.name.split(' ')[0]} sector Goldman Morgan Stanley JPMorgan outlook`,
    '政策催化': `${sector.q} regulation policy catalyst`,
  }, 6);
  const newsDigest = formatNewsDigest(news);
  const sources = collectSources(news);
  if (sources.length < 4) { console.error(`[sector-deep-dive] 新闻来源仅 ${sources.length} 条，数据不足，中止`); process.exit(3); }

  console.log('[sector-deep-dive] DeepSeek 生成...');
  const resp = await deepseekClient.messages.create({
    messages: [{ role: 'user', content: buildPrompt(ym, sector, quoteDigest, newsDigest, formatSourceList(sources)) }],
    max_tokens: 8000, _timeoutMs: 240000,
  });
  let md = resp.content[0].text.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!md.startsWith('#')) { console.error('[sector-deep-dive] 生成异常'); process.exit(2); }

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(outPath, md + '\n');
  console.log(`[sector-deep-dive] ✓ 写入 ${ym}-${sector.slug}.md (${md.length} 字)`);
}

main().catch((e) => { console.error('[sector-deep-dive]', e.message); process.exit(1); });
