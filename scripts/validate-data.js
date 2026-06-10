#!/usr/bin/env node
/**
 * validate-data.js — 数据与已知坑校验器（npm run verify / CI 的一环）。
 * 失败以非零码退出并列出问题；全部通过输出一行 ✅。
 *
 * 校验内容：
 *  A. 数据文件结构：articles/podcasts/sources 可解析、必备字段齐全
 *  B. 内容规则：无纯日期垃圾标题；无逐字稿播客解读须带来源声明
 *  C. 已知坑扫描（代码层）：UTC 日期 slice、播客硬编码 Lex 等历史事故的回归防线
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const errors = [];
const warns = [];
const root = process.cwd();

function load(p) {
  try { return JSON.parse(readFileSync(resolve(root, p), 'utf8')); }
  catch (e) { errors.push(`${p} 无法解析: ${e.message}`); return null; }
}

/* ── A. 数据结构 ── */
const articles = load('data/articles.json');
if (articles) {
  if (!Array.isArray(articles) || articles.length < 100) errors.push(`articles.json 异常：非数组或条数骤降(${articles?.length})`);
  const missing = articles.filter((a) => !a.id || !a.source || !(a.titleEn || a.titleZh) || !a.publishedAt);
  if (missing.length) errors.push(`articles.json 有 ${missing.length} 条缺必备字段(id/source/title/publishedAt)，如: ${missing[0]?.id ?? JSON.stringify(missing[0])?.slice(0, 80)}`);
  const ids = new Set(); let dup = 0;
  for (const a of articles) { if (ids.has(a.id)) dup++; ids.add(a.id); }
  if (dup) errors.push(`articles.json 有 ${dup} 个重复 id`);
}

const podcasts = load('data/podcasts.json');
if (podcasts) {
  if (!Array.isArray(podcasts)) errors.push('podcasts.json 非数组');
}

const sources = load('data/sources.json');
if (sources) {
  if (!Array.isArray(sources.podcasts) || sources.podcasts.length === 0) {
    warns.push('sources.json 缺 podcasts 配置（fetcher 将回退内置默认源）');
  } else {
    const bad = sources.podcasts.filter((p) => !p.id || !p.source || !p.feedUrl);
    if (bad.length) errors.push(`sources.json podcasts 有 ${bad.length} 条缺 id/source/feedUrl`);
  }
}

/* ── B. 内容规则 ── */
const dateOnly = (s) => {
  const t = (s || '').trim();
  return !!t && (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}年\d{1,2}月\d{1,2}日$/.test(t) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(t));
};
if (articles) {
  const junk = articles.filter((a) => dateOnly(a.titleEn) && (!a.titleZh || dateOnly(a.titleZh)));
  if (junk.length) errors.push(`articles.json 混入 ${junk.length} 条纯日期垃圾标题（抓取端过滤失效?），如: ${junk[0].id}`);
}
if (podcasts) {
  const NOTE = '本解读基于节目标题与官方简介';
  const bad = podcasts.filter((e) => e.contentMd && e.source !== 'Lex Fridman Podcast' && !e.contentMd.includes(NOTE));
  if (bad.length) warns.push(`podcasts.json 有 ${bad.length} 篇非 Lex 解读缺来源声明（若该集有逐字稿可忽略），如: ${bad[0].id}`);
}

/* ── C. 已知坑扫描（防回归） ── */
function scanDir(dir, exts, fn) {
  let files = [];
  try { files = readdirSync(resolve(root, dir), { recursive: true }); } catch { return; }
  for (const f of files) {
    const p = `${dir}/${f}`;
    if (!exts.some((e) => p.endsWith(e))) continue;
    let txt; try { txt = readFileSync(resolve(root, p), 'utf8'); } catch { continue; }
    fn(p, txt);
  }
}
// C1: UTC 日期坑——除 app/lib/date.ts(自带+8h)外，禁止对时间字符串 toISOString().slice(0,10) 式分组
scanDir('app', ['.ts', '.tsx'], (p, txt) => {
  if (p.endsWith('app/lib/date.ts')) return;
  if (/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(txt)) {
    errors.push(`${p}: 出现 toISOString().slice(0,10)（UTC 分组坑），请改用 lib/date 的 getDateKey`);
  }
});
// C2: 播客组件禁止硬编码 Lex（多源化事故）
scanDir('app', ['.tsx'], (p, txt) => {
  if (/['"`]Lex Fridman Podcast['"`]\s*[^:=]/.test(txt) && !/PODCAST_META|===|source\s*!==/.test(txt)) {
    warns.push(`${p}: 疑似硬编码 'Lex Fridman Podcast' 展示文案，确认是否应按 ep.source 动态`);
  }
});

/* ── D. 运行期哨兵健康数据轻校验（文件存在时才查；详见 AGENTS.md〈运行期哨兵〉） ── */
if (existsSync(resolve(root, 'data/health/state.json'))) {
  const hs = load('data/health/state.json');
  if (hs) {
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(hs.perSource))            errors.push('data/health/state.json: perSource 应为对象');
    if (!isObj(hs.alertState))           errors.push('data/health/state.json: alertState 应为对象');
    if (!Array.isArray(hs.openIncidents)) errors.push('data/health/state.json: openIncidents 应为数组');
    if (!isObj(hs.judged))               errors.push('data/health/state.json: judged 应为对象');
    const badInc = (hs.openIncidents ?? []).filter((i) => !i?.id || !i?.checkId || !i?.status);
    if (badInc.length) errors.push(`data/health/state.json: ${badInc.length} 条 openIncidents 缺 id/checkId/status`);
  }
}
if (existsSync(resolve(root, 'data/health/last-fetch.json'))) {
  const lf = load('data/health/last-fetch.json');
  if (lf) {
    if (typeof lf.ranAt !== 'string')                              errors.push('data/health/last-fetch.json: ranAt 应为字符串');
    if (lf.perSource === null || typeof lf.perSource !== 'object') errors.push('data/health/last-fetch.json: perSource 应为对象');
    if (lf.orgSitesParse === null || typeof lf.orgSitesParse !== 'object') errors.push('data/health/last-fetch.json: orgSitesParse 应为对象');
  }
}

/* ── 结果 ── */
for (const w of warns) console.log(`⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  console.error(`\n[validate-data] 失败：${errors.length} 个错误，${warns.length} 个警告`);
  process.exit(1);
}
console.log(`✅ validate-data 通过（articles ${articles?.length ?? '?'} 条 / podcasts ${podcasts?.length ?? '?'} 集 / 警告 ${warns.length}）`);
