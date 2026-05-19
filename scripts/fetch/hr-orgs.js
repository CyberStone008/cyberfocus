/**
 * scripts/fetch/hr-orgs.js
 *
 * Fetch news AND research reports from HR service organizations.
 * Two query modes per org:
 *   1. NEWS  — general mentions, 7-day lookback
 *   2. REPORT — specifically targets published surveys/reports, 30-day lookback
 *
 * Uses Google News RSS via curl (Node.js TLS issues prevent direct fetch).
 */

import Parser from 'rss-parser';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isRecentBJ } from '../utils/date-filter.js';

const execFileAsync = promisify(execFile);
const parser = new Parser({ timeout: 14000 });

const NEWS_LOOKBACK_DAYS   = 7;   // news mentions
const REPORT_LOOKBACK_DAYS = 60;  // org-published reports (quarterly surveys look back further)
const MAX_PER_QUERY        = 5;   // max items to keep per query

/** Sleep for ms milliseconds */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch URL via curl (bypasses Node.js TLS issues with Google News).
 * Returns body string on success, throws on HTTP error or timeout.
 */
async function curlFetch(url, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '-sS', '-L', '--compressed', '--max-time', '15',
        '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        '-H', 'Cache-Control: no-cache',
        '-w', '\n__HTTP_STATUS__:%{http_code}',
        url,
      ], { maxBuffer: 4 * 1024 * 1024 });

      const statusMatch = stdout.match(/\n__HTTP_STATUS__:(\d+)$/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
      const body = stdout.replace(/\n__HTTP_STATUS__:\d+$/, '');

      if (status === 200) return body;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 2000 + Math.random() * 1000;
        console.warn(`[hr-orgs] HTTP ${status}, retry ${attempt + 1}/${maxRetries} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP ${status}`);
    } catch (err) {
      if (attempt < maxRetries && err.code !== 'HTTP_ERROR') {
        await sleep((attempt + 1) * 1500);
        continue;
      }
      throw err;
    }
  }
}

// ── Stable slug per org ──────────────────────────────────────────────────────
const ORG_SLUG = {
  'Korn Ferry':       'korn-ferry',
  'Mercer':           'mercer',
  'ManpowerGroup':    'manpower',
  'Randstad':         'randstad',
  'Adecco Group':     'adecco',
  'Recruit Holdings': 'recruit',
  '科锐国际':          'careerin',
  'FESCO':            'fesco',
  '中智咨询':          'ciic',
  '智联招聘':          'zhilian',
  'BOSS直聘':          'boss-zhipin',
  'FESCO Adecco':     'fesco-adecco',
};

// ── Per-org query configs ────────────────────────────────────────────────────
// Each entry has:
//   newsQuery   — general news, 7-day lookback
//   reportQuery — report/survey/research releases, 30-day lookback
//   hl/gl/ceid  — Google News locale
const ORG_CONFIGS = [
  // ── International ──────────────────────────────────────────────────────────
  {
    id: 'Korn Ferry',
    newsQuery:   '"Korn Ferry" (talent OR compensation OR workforce OR "executive search" OR "leadership development" OR "organizational") -"Korn Ferry Tour"',
    reportQuery: '"Korn Ferry" ("pay guide" OR "salary guide" OR "future of work" OR "talent trends" OR "workforce" OR "hiring outlook" OR "leadership insights") -"Korn Ferry Tour"',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },
  {
    id: 'Mercer',
    newsQuery:   '"Mercer" "human resources" OR "HR consulting" OR workforce OR talent OR compensation OR benefits',
    reportQuery: '"Mercer" survey OR "total remuneration" OR "global talent trends" OR "workforce monitor" OR "compensation report" OR "benefits survey"',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },
  {
    id: 'ManpowerGroup',
    newsQuery:   '"ManpowerGroup" employment OR talent OR workforce OR hiring',
    reportQuery: '"ManpowerGroup" "employment outlook survey" OR "talent shortage" OR "workforce trends" OR "hiring intentions" OR "labor market" 2026',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },
  {
    id: 'Randstad',
    newsQuery:   '"Randstad" talent OR employment OR workforce OR hiring OR "labor market"',
    reportQuery: '"Randstad" workmonitor OR "salary guide" OR "salary report" OR "employer brand" OR "talent trends" OR "workforce insights" 2026',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },
  {
    id: 'Adecco Group',
    newsQuery:   '"Adecco" workforce talent employment future',
    reportQuery: '"Adecco" report OR survey OR "future of work" OR research OR outlook 2026',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },
  {
    id: 'Recruit Holdings',
    newsQuery:   '"Recruit Holdings" OR "Indeed" OR "Glassdoor" HR OR talent OR workforce OR "job market" OR hiring',
    reportQuery: '"Recruit Holdings" report OR survey OR "HR Technology" OR "employment trends" OR "talent insights" OR "job market" 2026',
    hl: 'en-US', gl: 'US', ceid: 'US:en',
  },

  // ── Domestic ───────────────────────────────────────────────────────────────
  {
    id: '科锐国际',
    newsQuery:   '"科锐国际" 人才 招聘 薪酬 用工',
    reportQuery: '"科锐国际" 报告 OR 调研 OR 薪酬调查 OR 白皮书 OR 就业趋势',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
  {
    id: 'FESCO',
    newsQuery:   '"外企人力资源" OR "外企服务集团" 人才 用工',
    reportQuery: '"FESCO" OR "外企服务" 报告 OR 调研 OR 薪酬 OR 白皮书 OR 人力资源趋势',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
  {
    id: '中智咨询',
    newsQuery:   '"中智咨询" 人才 薪酬 用工 人力资源',
    reportQuery: '"中智咨询" 报告 OR 调研 OR 薪酬调查 OR 白皮书 OR 就业市场',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
  {
    id: '智联招聘',
    newsQuery:   '"智联招聘" 招聘 就业 薪酬 人才',
    reportQuery: '"智联招聘" 报告 OR 调研 OR 就业趋势 OR 薪酬报告 OR 人才流动 OR 白皮书',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
  {
    id: 'BOSS直聘',
    newsQuery:   '"BOSS直聘" 就业 人才 招聘 薪酬',
    reportQuery: '"BOSS直聘" 报告 OR 调研 OR "职业趋势" OR "就业数据" OR 白皮书 OR "薪酬报告"',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
  {
    id: 'FESCO Adecco',
    newsQuery:   '"外企德科" OR "FESCO Adecco" 人才 用工 人力资源',
    reportQuery: '"外企德科" OR "FESCO Adecco" 报告 OR 调研 OR 薪酬 OR 白皮书',
    hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildFeedUrl(query, hl, gl, ceid) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function urlToId(orgId, url) {
  const hash = createHash('md5').update(url).digest('hex').slice(0, 12);
  const slug = ORG_SLUG[orgId] ?? orgId.toLowerCase().replace(/\s+/g, '-');
  return `hrorg:${slug}:${hash}`;
}

/**
 * Returns true if the article is financial/stock/investor noise or sports, and should be SKIPPED entirely.
 * This is intentionally broad so irrelevant content from publicly-traded HR companies is excluded.
 */
function isNoise(title, abstract) {
  const text = (title + ' ' + abstract).toLowerCase();
  // Stock / investor news patterns
  if (/earnings call|earnings preview|earnings report|beats.*sales|beats.*expectations|misses.*expectations|profit exceeds|stock slowing|shares sold|acquires.*shares|shares of.*\$|dividend|ipo|institutional.*hold|% stake|stake in korn|stake in mercer|nyse:|nasdaq:|analyst.*question|analyst.*downgrad|analyst.*upgrad|price target|q[1-4] \d{4} earn|share buyback|share repurchase|authoriz.*buyback/.test(text)) return true;
  // Recruit Holdings stock/financial noise (TSE listed)
  if (/recruit holdings stock|tse:6098|jp3970300004|recruit.*valuation|recruit.*share price|recruit.*buyback/.test(text)) return true;
  // Sports / golf (Korn Ferry Tour)
  if (/korn ferry tour|pga tour|golf|birdie|par-\d|tees off|playoff/.test(text)) return true;
  // Named persons who share a company name (Mercer the baseball player, etc.)
  if (/mercer school of medicine|mercer university|mercer.*pharmacy|mercer.*medical school|billy mercer|amelia mercer/.test(text)) return true;
  return false;
}

/**
 * Detect if a title/snippet likely refers to a published HR/labour research report/survey.
 * Only called after isNoise() returns false.
 */
function isReportContent(title, abstract) {
  const text = (title + ' ' + abstract).toLowerCase();
  return /survey|outlook|白皮书|调研|研究报告|薪酬.*报告|就业.*报告|workmonitor|talent shortage|employment outlook|workforce report|talent trends|hiring intentions|labor market|人才.*报告|薪酬调查|雇主品牌|talent survey|compensation survey|pay guide|salary guide/.test(text);
}

// ── Title fingerprint (same logic as pipeline.js Google AI News dedup) ───────
// Takes first 9 meaningful words (lowercase ASCII-alnum + CJK), joins them.
// Same story syndicated to multiple outlets → same fingerprint → skip.
function titleFingerprint(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 9)
    .join(' ');
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function fetchHROrgNews(processedIds, disabledIds = new Set(), existingTitleFPs = new Set()) {
  const results = [];
  const seenIds  = new Set(); // dedup within this run by URL hash
  const seenFPs  = new Set([...existingTitleFPs]); // dedup by title fingerprint (cross-outlet)

  let queryIndex = 0;

  for (const org of ORG_CONFIGS) {
    if (disabledIds.has(org.id)) {
      console.log(`[hr-orgs] ${org.id}: skipped (disabled)`);
      continue;
    }

    // Run two queries per org: news (7d) and report-focused (30d)
    const queries = [
      { q: org.newsQuery,   lookback: NEWS_LOOKBACK_DAYS,   docType: 'News'   },
      { q: org.reportQuery, lookback: REPORT_LOOKBACK_DAYS, docType: 'Report' },
    ];

    let orgKept = 0;

    for (const { q, lookback, docType } of queries) {
      // Stagger requests to avoid Google rate-limiting
      if (queryIndex > 0) {
        await sleep(1500 + Math.random() * 1000);
      }
      queryIndex++;

      let feed;
      try {
        const xml = await curlFetch(buildFeedUrl(q, org.hl, org.gl, org.ceid));
        feed = await parser.parseString(xml);
      } catch (err) {
        console.warn(`[hr-orgs] ${org.id} (${docType}) fetch failed: ${err.message}`);
        continue;
      }

      let kept = 0;
      for (const item of feed.items ?? []) {
        if (kept >= MAX_PER_QUERY) break;

        const pubDate = item.isoDate || item.pubDate || null;
        if (!isRecentBJ(pubDate, lookback)) continue;

        const rawTitle = item.title?.trim() ?? '';
        if (!rawTitle) continue;

        const url = item.link ?? '';
        const id = urlToId(org.id, url || rawTitle);

        if (seenIds.has(id)) continue;
        seenIds.add(id);

        if (processedIds && processedIds.has(id)) continue;

        const abstract = item.contentSnippet?.trim() ?? item.content?.trim() ?? '';
        const sep = rawTitle.lastIndexOf(' - ');
        const titleEn   = sep > 0 ? rawTitle.slice(0, sep).trim() : rawTitle;
        const publisher = sep > 0 ? rawTitle.slice(sep + 3).trim() : org.id;

        // Skip financial/stock noise, sports, and unrelated persons
        if (isNoise(titleEn, abstract)) continue;

        // Skip near-duplicate titles (same story syndicated to multiple outlets)
        const fp = titleFingerprint(titleEn);
        if (seenFPs.has(fp)) continue;
        seenFPs.add(fp);

        // Detect report content to set correct docType
        const effectiveDocType = isReportContent(titleEn, abstract) ? 'Report' : docType;

        results.push({
          id,
          slug: id.replace(/:/g, '-'),
          source:       org.id,
          sourceUrl:    url,
          publishedAt:  pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          titleEn,
          titleZh:      null,
          abstractEn:   abstract.slice(0, 500),
          abstractZh:   null,
          authors:      [publisher],
          institution:  publisher,
          docType:      effectiveDocType,
          category:     'social',
          score:        0,
          commentCount: 0,
          tags:         effectiveDocType === 'Report' ? ['人服动态', '研究报告'] : ['人服动态'],
        });

        kept++;
        orgKept++;
      }
    }

    console.log(`[hr-orgs] ${org.id}: ${orgKept} new articles`);
  }

  console.log(`[hr-orgs] Total: ${results.length} new articles`);
  return results;
}
