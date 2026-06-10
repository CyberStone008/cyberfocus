/**
 * scripts/fetch/hr-org-sites.js
 *
 * 人服机构「官网抓取」试点（方案 A）——直接抓机构官网的第一手发布，
 * 与 hr-orgs.js 的 Google News 第三方报道并存（官网双轨，详见 AGENTS.md）。
 *
 * 配置驱动：data/sources.json 的 "orgSites" 数组，每条
 *   { id, source, mode: 'rss'|'html', url, lang: 'en'|'zh', max(默认8), disabled? }
 * source 必须与 app/lib/sources-config.ts ORGS_SOURCES 的 id 完全一致，
 * 文章按 source 自动归入 orgs 板块。增删改官网源 = 改 JSON 不改代码。
 *
 * 网络请求一律走 curl（Node fetch 不读代理环境变量，且对部分官网 TLS 不稳）。
 * 任一源失败仅 warn，绝不拖垮 pipeline。
 *
 * 自测：node scripts/fetch/hr-org-sites.js  —— 打印各源抓到的条目，不写文件。
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);
const parser = new Parser({ timeout: 20000 });

const DEFAULT_MAX = 8;

/** Sleep for ms milliseconds */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 配置读取（参考 fetch/podcasts.js 的 loadFeeds 模式）─────────────────────

/**
 * 从 data/sources.json 读取启用的官网源。
 * - orgSites 缺失/为空 → 返回 []（试点功能，无内置兜底）
 * - 缺必备字段（id/source/mode/url）的条目安全跳过
 * - 支持全局 disabled 数组按条目 id 或 source 停用，以及条目自身 disabled: true
 */
export function loadOrgSites() {
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'data/sources.json'), 'utf8'));
  } catch (err) {
    console.warn(`[hr-org-sites] 读取 data/sources.json 失败: ${err.message}`);
    return [];
  }
  const list = Array.isArray(cfg.orgSites) ? cfg.orgSites : [];
  const disabled = new Set(cfg.disabled ?? []);
  return list
    .filter((e) => {
      if (!e || typeof e !== 'object') return false;
      if (!e.id || !e.source || !e.url || (e.mode !== 'rss' && e.mode !== 'html')) {
        console.warn(`[hr-org-sites] 配置缺字段，跳过: ${JSON.stringify(e)?.slice(0, 120)}`);
        return false;
      }
      return e.disabled !== true && !disabled.has(e.id) && !disabled.has(e.source);
    })
    .map((e) => ({ lang: 'en', max: DEFAULT_MAX, ...e }));
}

// ── curl 抓取（同 fetch/hr-orgs.js 的 curlFetch；Node fetch 禁用）───────────

async function curlFetch(url, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '-sS', '-L', '--compressed', '--max-time', '20',
        '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        '-H', 'Cache-Control: no-cache',
        '-w', '\n__HTTP_STATUS__:%{http_code}',
        url,
      ], { maxBuffer: 8 * 1024 * 1024 });

      const statusMatch = stdout.match(/\n__HTTP_STATUS__:(\d+)$/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;
      const body = stdout.replace(/\n__HTTP_STATUS__:\d+$/, '');

      if (status === 200) return body;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 2000 + Math.random() * 1000;
        console.warn(`[hr-org-sites] HTTP ${status}, retry ${attempt + 1}/${maxRetries} in ${Math.round(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }
      throw new Error(`HTTP ${status}`);
    } catch (err) {
      // 官网 TLS 偶发抖动（实测 SSL_ERROR_SYSCALL），重试通常即恢复
      if (attempt < maxRetries) {
        await sleep((attempt + 1) * 1500);
        continue;
      }
      throw err;
    }
  }
}

// ── 标题清洗 ─────────────────────────────────────────────────────────────────

/** 去掉 CDATA 残留（Recruit RSS 的 title/description 是双重转义的 CDATA）并压缩空白 */
function cleanText(raw) {
  return (raw ?? '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 去掉标题尾部的站名/栏目名后缀（如 "… | Newsroom | Recruit Holdings"） */
function stripSiteSuffix(title, sourceName) {
  let t = title;
  const generic = /^(newsroom|news|press( releases?)?|insights?|blog|home)$/i;
  for (;;) {
    const m = t.match(/^(.*\S)\s*[|｜]\s*([^|｜]+)$/);
    if (!m) break;
    const seg = m[2].trim();
    if (seg.toLowerCase() === sourceName.toLowerCase() || generic.test(seg)) {
      t = m[1].trim();
      continue;
    }
    break;
  }
  return t;
}

/** 垃圾标题：纯日期 / 纯数字符号 / 长度 < 8 字符 */
function isGarbageTitle(title) {
  const t = (title ?? '').trim();
  if (t.length < 8) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return true;
  if (/^[\d\s\/.,:：\-—年月日]+$/.test(t)) return true;
  return false;
}

/** 报告类标题识别 → docType: 'Report' */
const REPORT_TITLE_RE = /report|survey|index|barometer|outlook|报告|调研|白皮书/i;

// ── 日期解析（URL / 邻近 <time> / 邻近文本；解析不出则用抓取时刻）────────────

function toValidIso(y, m, d) {
  const yy = +y, mm = +m, dd = +d;
  if (yy < 2000 || yy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() > Date.now() + 2 * 86400_000) return null; // 未来日期视为无效
  return date.toISOString();
}

const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function dateFromText(text) {
  if (!text) return null;
  // 2026-06-04 / 2026/6/4 / 2026.06.04 / 2026年6月4日
  let m = text.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (m) return toValidIso(m[1], m[2], m[3]);
  // June 4, 2026 / Jun 4 2026
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})/i);
  if (m) return toValidIso(m[3], MONTH_NUM[m[1].toLowerCase().slice(0, 3)], m[2]);
  return null;
}

function dateFromUrl(pathname) {
  // /2026/06/04/ 或 /2026-06-04
  let m = pathname.match(/\/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[\/\-_.]|$)/);
  if (m) return toValidIso(m[1], m[2], m[3]);
  // /20260604_0002/（Recruit newsroom 风格的紧凑日期）
  m = pathname.match(/\/(20\d{2})(\d{2})(\d{2})(?:[\/\-_.]|$)/);
  if (m) return toValidIso(m[1], m[2], m[3]);
  return null;
}

/**
 * 在锚点的近邻 DOM（最多向上 3 层）找 <time datetime> 或日期文本。
 * 父容器文本超过 500 字符说明已越出单卡片范围，停止，避免偷到别的卡片的日期。
 */
function extractNearbyDate($, aEl) {
  let node = $(aEl);
  for (let depth = 0; depth < 3; depth++) {
    node = node.parent();
    if (!node.length) break;
    const dt = node.find('time[datetime]').first().attr('datetime');
    if (dt) {
      const fromAttr = dateFromText(dt);
      if (fromAttr) return fromAttr;
      const parsed = new Date(dt);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now() + 2 * 86400_000) {
        return parsed.toISOString();
      }
    }
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text.length > 500) break;
    const d = dateFromText(text);
    if (d) return d;
  }
  return null;
}

// ── HTML 列表页提取 ──────────────────────────────────────────────────────────

// 内容型路径：/insights/ /news/ /article 等栏目词，或路径中带年份
const CONTENT_PATH_RE = /\/(insights?|news(room)?|articles?|press|media|blog|reports?|research|publications?|notice|dongtai|zixun|xinwen)([\/\-.]|$)|\/20\d{2}([\/\-_]|\b)/i;
const ASSET_EXT_RE = /\.(jpg|jpeg|png|gif|svg|webp|css|js|json|ico|zip|rar|mp3|mp4|woff2?)$/i;

function sameSite(hostA, hostB) {
  const a = hostA.replace(/^www\./i, '').toLowerCase();
  const b = hostB.replace(/^www\./i, '').toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** html 模式：cheerio 提取 <a>，href 匹配内容型路径且锚文本 ≥12 字符 */
function extractHtmlItems(entry, html) {
  const $ = cheerio.load(html);
  const baseUrl = new URL(entry.url);
  const baseNorm = entry.url.replace(/\/+$/, '');
  const seenUrls = new Set();
  const items = [];

  $('a[href]').each((_, a) => {
    const rawHref = ($(a).attr('href') ?? '').trim();
    if (!rawHref || /^(javascript:|mailto:|tel:|#)/i.test(rawHref)) return;

    let abs;
    try { abs = new URL(rawHref, entry.url); } catch { return; }
    if (!/^https?:$/.test(abs.protocol)) return;
    abs.hash = '';
    const urlStr = abs.toString();

    if (urlStr.replace(/\/+$/, '') === baseNorm) return;        // 列表页自身
    if (!sameSite(abs.hostname, baseUrl.hostname)) return;       // 站外链接
    if (ASSET_EXT_RE.test(abs.pathname)) return;                 // 静态资源
    if (!CONTENT_PATH_RE.test(abs.pathname)) return;             // 非内容型路径

    const text = $(a).text().replace(/\s+/g, ' ').trim();
    if (text.length < 12 || isGarbageTitle(text)) return;       // 锚文本太短/垃圾
    if (seenUrls.has(urlStr)) return;                            // 去重
    seenUrls.add(urlStr);

    const publishedAt = dateFromUrl(abs.pathname) ?? extractNearbyDate($, a);
    items.push({ title: stripSiteSuffix(text, entry.source), url: urlStr, publishedAt, abstract: '' });
  });

  return items;
}

// ── RSS 提取 ─────────────────────────────────────────────────────────────────

async function extractRssItems(entry, xml) {
  const feed = await parser.parseString(xml);
  const items = [];
  const seenUrls = new Set();

  for (const item of feed.items ?? []) {
    const title = stripSiteSuffix(cleanText(item.title), entry.source);
    if (isGarbageTitle(title)) continue;

    const url = (item.link ?? '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const rawDate = item.isoDate || item.pubDate || null;
    let publishedAt = null;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    const abstract = cleanText(item.contentSnippet ?? item.content ?? '').slice(0, 500);
    items.push({ title, url, publishedAt, abstract });
  }

  return items;
}

// ── Article 组装 ─────────────────────────────────────────────────────────────

function toArticle(entry, { title, url, publishedAt, abstract }) {
  const now = new Date().toISOString();
  const hash = createHash('md5').update(url).digest('hex').slice(0, 12);
  const id = `hrsite:${entry.id}:${hash}`;
  const isZh = entry.lang === 'zh';
  return {
    id,
    slug: id.replace(/:/g, '-'),
    source:       entry.source,          // 与 ORGS_SOURCES id 一致 → 自动进 orgs 板块
    sourceUrl:    url,                   // 官网直链
    publishedAt:  publishedAt ?? now,    // 解析不出日期用抓取时刻（orgs 板块按 fetchedAt 分组，可接受）
    titleEn:      title,
    titleZh:      isZh ? title : null,   // en 交给 pipeline 现有翻译
    abstractEn:   isZh ? null : (abstract || ''),
    abstractZh:   isZh ? (abstract || '') : null,
    authors:      [entry.source],
    institution:  entry.source,
    docType:      REPORT_TITLE_RE.test(title) ? 'Report' : 'News',
    category:     'research',
    score:        0,
    commentCount: 0,
    tags:         ['官网发布'],
    fetchedAt:    now,
  };
}

// ── 主导出 ───────────────────────────────────────────────────────────────────

/**
 * 抓取所有启用的官网源。
 * @param {Set<string>} processedIds 已处理 ID 集合（与其它 fetcher 同约定）
 * @param {Set<string>} disabledIds  停用集合（按条目 id 或 source；pipeline 单源模式会传不同集合）
 */
export async function fetchHROrgSites(processedIds = new Set(), disabledIds = new Set()) {
  const entries = loadOrgSites();
  if (entries.length === 0) {
    console.log('[hr-org-sites] 无启用的官网源（data/sources.json 缺 orgSites 或全部停用）');
    return [];
  }

  const results = [];
  const seenIds = new Set();
  let index = 0;

  for (const entry of entries) {
    if (disabledIds.has(entry.id) || disabledIds.has(entry.source)) {
      console.log(`[hr-org-sites] ${entry.source}: skipped (disabled)`);
      continue;
    }

    if (index > 0) await sleep(800 + Math.random() * 700);
    index++;

    let candidates;
    try {
      const body = await curlFetch(entry.url);
      candidates = entry.mode === 'rss'
        ? await extractRssItems(entry, body)
        : extractHtmlItems(entry, body);
    } catch (err) {
      console.warn(`[hr-org-sites] ${entry.source} fetch failed: ${err.message}`);
      continue;
    }

    // 只看最新的前 max 条（与 podcasts.js 同口径），再按 processedIds 过滤增量
    let added = 0;
    for (const item of candidates.slice(0, entry.max)) {
      const article = toArticle(entry, item);
      if (seenIds.has(article.id)) continue;
      seenIds.add(article.id);
      if (processedIds && processedIds.has(article.id)) continue;
      results.push(article);
      added++;
    }
    console.log(`[hr-org-sites] ${entry.source}: ${added} new articles (${candidates.length} candidates)`);
  }

  console.log(`[hr-org-sites] Total: ${results.length} new articles`);
  return results;
}

// ── 直接运行自测：打印各源抓到的条目（标题+链接），不写文件 ──────────────────

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  (async () => {
    const articles = await fetchHROrgSites(new Set(), new Set());
    const bySource = new Map();
    for (const a of articles) {
      if (!bySource.has(a.source)) bySource.set(a.source, []);
      bySource.get(a.source).push(a);
    }
    for (const [source, list] of bySource) {
      console.log(`\n=== ${source} (${list.length}) ===`);
      for (const a of list) {
        console.log(`  [${a.docType}] ${a.titleEn}`);
        console.log(`      ${a.sourceUrl}  (publishedAt: ${a.publishedAt.slice(0, 10)})`);
      }
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
