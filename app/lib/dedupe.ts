import { Article } from '../types/article';

/**
 * 新闻去重 V1（确定性、保守）：同一条新闻多家报道 → 只保留一条"代表"，
 * 并在代表上标注 dupCount / dupSources，供卡片显示「N 家媒体报道」。
 *
 * 判定"同一新闻"：在 ±4 天时间窗内，标题"强实体 + 相似度"达标即归为一簇。
 * 保守优先——宁可漏掉个别重复，也尽量不把"同一公司的不同新闻"错并。
 * 跨语言（英文标题 × 中文标题）靠共享英文品牌实体能抓一部分，彻底跨语言留待 v2。
 */

/**
 * 垃圾标题判定：标题为空 / 纯日期（Google News 偶尔混入 AlleyWatch 等站点的
 * "每日聚合页"，标题就是 "6/9/2026"）/ 纯数字符号。这种卡片没有信息量，直接过滤。
 */
export function isJunkTitle(titleEn?: string | null, titleZh?: string | null): boolean {
  const t = (titleZh || titleEn || '').trim();
  if (!t) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) return true;                     // 6/9/2026
  if (/^\d{4}年\d{1,2}月\d{1,2}日$/.test(t)) return true;                      // 2026年9月6日
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) return true;                         // 2026-09-06
  if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i.test(t)) return true;
  if (/^[\d\s\/.,:：\-—年月日]+$/.test(t)) return true;                        // 只剩数字/日期符号
  return false;
}

const STOP = new Set([
  'the','a','an','of','to','in','on','for','and','with','is','at','by','as','from','its','it',
  'new','ai','llm','say','says','how','why','what','will','can','使用','推出','发布','宣布',
  '人工智能','的','了','与','在','和','是','将','为','对','上','到','后','被','把','或','及',
]);

function tokenize(t: string): Set<string> {
  const s = (t || '').toLowerCase();
  const en = (s.match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
  const zh = (s.match(/[一-龥]/g) || []).join('');
  const zhBi: string[] = [];
  for (let i = 0; i < zh.length - 1; i++) {
    const bg = zh.slice(i, i + 2);
    if (!STOP.has(bg)) zhBi.push(bg);
  }
  return new Set([...en, ...zhBi]);
}

const KNOWN_ENT = /OpenAI|Anthropic|Claude|Gemini|DeepSeek|Nvidia|Meta|Google|Microsoft|SpaceX|Apple|Amazon|Tesla|Mistral|Grok|Llama|Qwen|字节|腾讯|阿里|蚂蚁|百度|华为|英伟达|微软|苹果|谷歌|特斯拉/gi;
function entities(t: string): Set<string> {
  const proper = (t.match(/[A-Z][a-zA-Z][a-zA-Z0-9.+-]{1,}/g) || []).map((x) => x.toLowerCase());
  const known = (t.match(KNOWN_ENT) || []).map((x) => x.toLowerCase());
  return new Set([...proper, ...known]);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function dayNum(iso?: string): number {
  const t = Date.parse(iso || '');
  return isNaN(t) ? 0 : Math.floor(t / 86_400_000);
}

/** 同一条 Google News 聚合里，真实媒体名常在摘要尾部："标题  CXOToday.com" */
function publisherLabel(a: Article): string {
  const abs = a.abstractEn || a.abstractZh || '';
  const m = abs.match(/\s{2,}([^\s][^\n]{1,40})$/);
  if (a.source === 'Google AI News' && m) return m[1].trim();
  return a.source;
}

/** 代表条优先级：有详细摘要 > 国内可直达 > 有解读 > 中文标题 > 标题更完整 */
function repScore(a: Article): number {
  let s = 0;
  if (a.tldrZh) s += 100;
  if (a.contentMd) s += 40;
  if (a.source !== 'Google AI News') s += 35;
  if (!/news\.google\.com/.test(a.sourceUrl || '')) s += 25;
  if (a.titleZh) s += 10;
  s += Math.min((a.titleZh || a.titleEn || '').length, 60) / 12;
  return s;
}

const WINDOW_DAYS = 4;
const SHARED_ENT_MIN = 2;
const SIM_WITH_ENT = 0.18;   // 共享≥2实体时的相似度门槛
const SIM_ALONE = 0.5;       // 纯相似度门槛（无实体支撑也判同）

/**
 * 输入：已排序的新闻 Article[]。输出：去重后的代表 Article[]（保持原顺序），
 * 代表条带 dupCount（簇内条数）与 dupSources（去重后的媒体名列表）。
 */
export function dedupeNews(articles: Article[]): Article[] {
  const n = articles.length;
  if (n < 2) return articles;

  const feats = articles.map((a) => ({
    tok: tokenize(a.titleZh || a.titleEn || ''),
    ent: entities(`${a.titleEn || ''} ${a.titleZh || ''}`),
    day: dayNum(a.publishedAt || a.fetchedAt),
  }));

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (x: number, y: number) => { parent[find(x)] = find(y); };

  // 按天分桶，只在 ±WINDOW_DAYS 内两两比较（避免 O(n²) 全比）
  const byDay = new Map<number, number[]>();
  feats.forEach((f, i) => { const arr = byDay.get(f.day); if (arr) arr.push(i); else byDay.set(f.day, [i]); });

  for (let i = 0; i < n; i++) {
    const di = feats[i].day;
    for (let d = di - WINDOW_DAYS; d <= di; d++) {
      const bucket = byDay.get(d);
      if (!bucket) continue;
      for (const j of bucket) {
        if (j === i) continue;
        if (d === di && j <= i) continue;          // 同一天只比 j>i，避免重复
        let shared = 0;
        for (const e of feats[i].ent) if (feats[j].ent.has(e)) shared++;
        const sim = jaccard(feats[i].tok, feats[j].tok);
        if ((shared >= SHARED_ENT_MIN && sim >= SIM_WITH_ENT) || sim >= SIM_ALONE) union(i, j);
      }
    }
  }

  // 收簇
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = clusters.get(r); if (arr) arr.push(i); else clusters.set(r, [i]);
  }

  // 每簇选代表 + 标注；非代表丢弃
  const repOf = new Map<number, { count: number; sources: string[] }>();
  for (const idxs of clusters.values()) {
    if (idxs.length === 1) continue;
    let best = idxs[0];
    for (const i of idxs) if (repScore(articles[i]) > repScore(articles[best])) best = i;
    const sources = Array.from(new Set(idxs.map((i) => publisherLabel(articles[i]))));
    repOf.set(best, { count: idxs.length, sources });
  }
  const dropped = new Set<number>();
  for (const idxs of clusters.values()) {
    if (idxs.length === 1) continue;
    let best = idxs[0];
    for (const i of idxs) if (repScore(articles[i]) > repScore(articles[best])) best = i;
    for (const i of idxs) if (i !== best) dropped.add(i);
  }

  // 保持原顺序输出代表
  const out: Article[] = [];
  for (let i = 0; i < n; i++) {
    if (dropped.has(i)) continue;
    const info = repOf.get(i);
    out.push(info ? { ...articles[i], dupCount: info.count, dupSources: info.sources } : articles[i]);
  }
  return out;
}
