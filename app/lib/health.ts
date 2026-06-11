// 健康仪表盘（/health）构建时数据装配 —— 纯 fs 静态读取，零运行时依赖。
//
// ⚠️ 阈值映射与 scripts/sentinel.js 的 buildMonitors/HIGH_FREQ_SOURCES/HR_GN_SOURCES 同步，
//    两处改动需同步（sentinel 是判定方，本文件只做只读展示）。
//
// 时间纪律：所有展示时刻一律「固定 +8h 数学」转北京时间（仿 app/lib/date.ts；CI 构建机是
// UTC，禁止 toLocaleString / 裸 toISOString().slice）。本模块只在 server/构建期执行，
// 输出**纯字符串/数字视图模型**——client 组件只收现成字符串，杜绝 hydration 漂移。
//
// 数据滞后是设计内行为：/health 渲染的是构建时快照（哨兵写 data/health/ 不触发 Pages 构建，
// 这是 AGENTS.md 红线），页面以「数据截至」行如实披露。

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = process.cwd();
const STATE_PATH = resolve(ROOT, 'data/health/state.json');
const RUNS_DIR = resolve(ROOT, 'data/health/runs');
const SOURCES_PATH = resolve(ROOT, 'data/sources.json');

// ── 北京时间（固定 +8h，无夏令时）────────────────────────────────────────────
const BJ_OFFSET_MS = 8 * 3600 * 1000;
function bjIso(ms: number): string {
  return new Date(ms + BJ_OFFSET_MS).toISOString();
}
function bjDateKey(ms: number): string {
  return bjIso(ms).slice(0, 10);
}
/** '2026-06-10 19:00' */
function bjDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = bjIso(t);
  return `${s.slice(0, 10)} ${s.slice(11, 16)}`;
}
/** '06-10 19:00' */
function bjShortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = bjIso(t);
  return `${s.slice(5, 10)} ${s.slice(11, 16)}`;
}

// ── 哨兵落盘数据形态（一切字段可能缺/空，处处走兜底）─────────────────────────
interface RunCheck { id: string; status: string; note?: string }
interface RunAlert { checkId: string; target?: string; title?: string }
interface RunRecord { ranAt?: string; trigger?: string; checks?: RunCheck[]; alertsSent?: RunAlert[] }
interface Incident {
  id?: string; checkId?: string; target?: string; severity?: string;
  firstSeenAt?: string; lastSeenAt?: string; evidence?: string; status?: string; resolvedAt?: string;
}
interface HealthState {
  perSource?: Record<string, { lastSeenAt?: string }>;
  openIncidents?: Incident[];
  dailyCounts?: Record<string, Record<string, number>>;
  updatedAt?: string;
}
interface SourceEntry { id?: string; source?: string; healthDays?: number; disabled?: boolean }
interface SourcesCfg {
  disabled?: string[];
  healthDays?: Record<string, number>;
  podcasts?: SourceEntry[];
  orgSites?: SourceEntry[];
}

function loadJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(readFileSync(p, 'utf8')) as T; } catch { return fallback; }
}
function loadRuns(): RunRecord[] {
  if (!existsSync(RUNS_DIR)) return [];
  const out: RunRecord[] = [];
  let files: string[] = [];
  try { files = readdirSync(RUNS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { /* ignore */ }
  for (const f of files) {
    const arr = loadJson<RunRecord[]>(join(RUNS_DIR, f), []);
    if (Array.isArray(arr)) out.push(...arr.filter((r) => r && typeof r === 'object'));
  }
  return out;
}

// ── 阈值映射（复刻 sentinel.js buildMonitors；改 sentinel 需同步改这里）────────
const HIGH_FREQ_SOURCES = ['Google AI News', 'Hacker News', '雷锋网', '量子位', 'Reddit LocalLLaMA']; // 2 天
const HR_GN_SOURCES = [ // HR 的 Google News 12 家，7 天（与 sentinel.js HR_GN_SOURCES 一致）
  'ManpowerGroup', 'Mercer', 'Korn Ferry', 'Randstad', 'Adecco Group', 'Recruit Holdings',
  '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
];
const BLOG_MONITORS = [
  { source: 'Anthropic Blog',  configIds: ['Anthropic Blog'] },
  { source: 'Claude Blog',     configIds: ['Claude Blog'] },
  { source: 'OpenAI Blog',     configIds: ['OpenAI Blog'] },
  { source: 'Google DeepMind', configIds: ['DeepMind Blog', 'Google DeepMind'] },
];
const DEFAULT_DAYS = { high: 2, hrGoogleNews: 7, low: 14 };

interface MonitorRow { key: string; days: number; disabled: boolean }

/** 与 sentinel buildMonitors 同序遍历，但 disabled 源不跳过而是标记（榜上照常排位、灰显） */
function buildLadderRows(cfg: SourcesCfg): MonitorRow[] {
  const disabledSet = new Set(cfg.disabled ?? []);
  const topHd = cfg.healthDays && typeof cfg.healthDays === 'object' ? cfg.healthDays : {};
  const rows = new Map<string, MonitorRow>();
  const matchedDisabled = new Set<string>();
  const push = (key: string, days: number, configIds: string[], entry?: SourceEntry) => {
    let d = days;
    for (const n of [key, ...configIds]) if (Number.isFinite(topHd[n])) { d = topHd[n]; break; }
    if (entry && Number.isFinite(entry.healthDays)) d = entry.healthDays as number;
    const isDisabled = configIds.some((n) => disabledSet.has(n)) || entry?.disabled === true;
    for (const n of configIds) if (disabledSet.has(n)) matchedDisabled.add(n);
    if (!rows.has(key)) rows.set(key, { key, days: d, disabled: isDisabled });
  };
  for (const s of HIGH_FREQ_SOURCES) push(s, DEFAULT_DAYS.high, [s]);
  for (const s of HR_GN_SOURCES)     push(s, DEFAULT_DAYS.hrGoogleNews, [s]);
  for (const b of BLOG_MONITORS)     push(b.source, DEFAULT_DAYS.low, b.configIds);
  for (const p of cfg.podcasts ?? []) {
    if (p && p.source) push(p.source, DEFAULT_DAYS.low, [p.id, p.source].filter(Boolean) as string[], p);
  }
  for (const o of cfg.orgSites ?? []) {
    if (o && o.source) push(`${o.source}(官网)`, DEFAULT_DAYS.low, [o.id, o.source].filter(Boolean) as string[], o);
  }
  // disabled 名单里不属于任何监控类别的源（如 36氪）按「其余 14 天」兜底补行
  for (const n of disabledSet) {
    if (!matchedDisabled.has(n) && !rows.has(n)) {
      push(n, DEFAULT_DAYS.low, [n]);
      const r = rows.get(n);
      if (r) r.disabled = true;
    }
  }
  return [...rows.values()];
}

// ── 视图模型 ──────────────────────────────────────────────────────────────────
export type ChipStatus = 'ok' | 'fail' | 'error' | 'pending';
export interface ChipVM { id: string; label: string; status: ChipStatus; title: string }
export interface SparkVM { points: string; lastX: number; lastY: number }
export interface OverviewVM {
  dotTone: 'green' | 'red' | 'orange' | 'gray';
  headline: string;
  subline: string | null;
  lastCheckText: string | null;   // '最近体检 06-10 08:01'
  chips: ChipVM[];
  spark: SparkVM | null;
}
export type LadderTone = 'ok' | 'warn' | 'over' | 'muted';
export interface LadderRowVM {
  key: string;
  name: string;          // 已剥离 (官网) 尾缀
  site: boolean;         // 官网 tag
  disabled: boolean;     // 已停用 tag
  tone: LadderTone;      // 点/条/文字着色
  seenToday: boolean;    // 「今天」绿色
  daysText: string;      // '今天' | '42 天' | '—'
  thresholdText: string; // '/14 天阈'
  barPct: number;        // 0..100
  defaultVisible: boolean;
  title: string;         // 行 title（≤480px 阈值信息并入此处）
}
export interface LadderVM { rows: LadderRowVM[]; headNote: string; totalCount: number }
export interface TrendBarVM { kind: 'value' | 'zero' | 'missing'; heightPx: number; isToday: boolean; title: string }
export interface TrendBoardVM { key: string; label: string; bars: TrendBarVM[] }
export interface TrendVM { boards: TrendBoardVM[]; rangeNote: string }
export interface EventVM { badge: string; title: string; timeText: string; ongoing: boolean }
export interface EventsVM { empty: boolean; items: EventVM[] }
export interface HealthVM {
  dataAsOf: string;
  overview: OverviewVM;
  ladder: LadderVM;
  trend: TrendVM;
  events: EventsVM;
}

// ── 卡1：七项体检聚合 ─────────────────────────────────────────────────────────
const CHIP_DEFS: { id: string; label: string }[] = [
  { id: 'C1', label: 'C1 晨批考勤' },
  { id: 'C2', label: 'C2 源健康' },
  { id: 'C3', label: 'C3 官网解析' },
  { id: 'C4', label: 'C4 站点存活' },
  { id: 'C5', label: 'C5 产出体检' },
  { id: 'C6', label: 'C6 摘要覆盖' },
  { id: 'C7', label: 'C7 推送受理' },
];
/** runs 里的 check id → 七项 chip：C5a/C5b/C5c（及 safe() 兜底的 C5）归并 C5；WEEKLY 过滤 */
function chipKeyOf(checkId: string): string | null {
  if (!checkId || checkId === 'WEEKLY') return null;
  if (checkId.startsWith('C5')) return 'C5';
  return CHIP_DEFS.some((c) => c.id === checkId) ? checkId : null;
}
const STATUS_RANK: Record<string, number> = { ok: 0, error: 1, fail: 2 };

function buildChips(runs: RunRecord[]): ChipVM[] {
  // 不同 trigger 跑不同子集（piggyback=C2/C3/C5/C6，morning=C1/C4，weekly=C2/C6/C7），
  // 必须扫全部 runs 对每项各取「最近一次判定」，不能只看最后一个 run。
  type Judged = { ranAt: string; status: ChipStatus; note: string };
  const latest: Record<string, Judged> = {};
  const latestSkip: Record<string, Judged> = {};
  for (const run of runs) {
    const ranAt = run.ranAt ?? '';
    // C5 一家三口（C5a/C5b/C5c）在同一 run 内取 worst（fail > error > ok）
    const perChip: Record<string, { rank: number; notes: string[] }> = {};
    for (const c of run.checks ?? []) {
      const chip = chipKeyOf(c.id);
      if (!chip) continue;
      if (c.status === 'skip') {
        const prev = latestSkip[chip];
        if (!prev || ranAt >= prev.ranAt) latestSkip[chip] = { ranAt, status: 'pending', note: c.note ?? '本批跳过' };
        continue;
      }
      const rank = STATUS_RANK[c.status];
      if (rank === undefined) continue;
      const agg = (perChip[chip] ??= { rank: 0, notes: [] });
      if (rank > agg.rank) agg.rank = rank;
      if (c.note) agg.notes.push(c.note);
    }
    for (const [chip, agg] of Object.entries(perChip)) {
      const prev = latest[chip];
      if (prev && ranAt < prev.ranAt) continue;
      const status: ChipStatus = agg.rank === 2 ? 'fail' : agg.rank === 1 ? 'error' : 'ok';
      latest[chip] = { ranAt, status, note: agg.notes.join('；') || '通过' };
    }
  }
  return CHIP_DEFS.map((def) => {
    const j = latest[def.id];
    if (j) {
      return { id: def.id, label: def.label, status: j.status, title: `${j.note} · 判定 ${bjShortTime(j.ranAt)}` };
    }
    const s = latestSkip[def.id];
    if (s) {
      return { id: def.id, label: def.label, status: 'pending' as ChipStatus, title: `${s.note} · ${bjShortTime(s.ranAt)}` };
    }
    return { id: def.id, label: def.label, status: 'pending' as ChipStatus, title: '该项尚未执行 · 待首次体检' };
  });
}

// ── 卡1：sparkline（14 天四板块合计；缺日跳过不补零）─────────────────────────
function buildSpark(dayKeys: string[], counts: Record<string, Record<string, number>>): SparkVM | null {
  const pts: { i: number; total: number }[] = [];
  for (let i = 0; i < dayKeys.length; i++) {
    const c = counts[dayKeys[i]];
    if (!c) continue; // 缺日跳过不补零
    pts.push({ i, total: (c.aiNews ?? 0) + (c.papers ?? 0) + (c.hrOrgs ?? 0) + (c.podcasts ?? 0) });
  }
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts.map((p) => p.total));
  const x = (i: number) => +(3 + (i / (dayKeys.length - 1)) * 134).toFixed(1);
  const y = (t: number) => +(33 - (t / max) * 30).toFixed(1);
  const points = pts.map((p) => `${x(p.i)},${y(p.total)}`).join(' ');
  const last = pts[pts.length - 1];
  return { points, lastX: x(last.i), lastY: y(last.total) };
}

// ── 主装配 ────────────────────────────────────────────────────────────────────
const BOARD_DEFS: { key: string; label: string }[] = [
  { key: 'aiNews',   label: 'AI 热点' },
  { key: 'papers',   label: '报告' },
  { key: 'hrOrgs',   label: '人服动态' },
  { key: 'podcasts', label: '播客' },
];

export function getHealthViewModel(): HealthVM {
  const now = Date.now(); // 构建时刻一次取定；页面是构建时快照，client 不再算时间
  const todayBJ = bjDateKey(now);
  const state = loadJson<HealthState>(STATE_PATH, {});
  const cfg = loadJson<SourcesCfg>(SOURCES_PATH, {});
  const runs = loadRuns();
  const perSource = state.perSource ?? {};
  const dailyCounts = state.dailyCounts ?? {};

  // ── 数据截至 ──
  const dataAsOf = `数据截至 ${state.updatedAt ? bjDateTime(state.updatedAt) : '—'}（北京时间）· 构建时快照`;

  // ── 卡1 总览 ──
  const chips = buildChips(runs);
  const lastRanAt = runs.map((r) => r.ranAt ?? '').filter(Boolean).sort().pop() ?? null;
  const dayKeys14: string[] = [];
  for (let i = 13; i >= 0; i--) dayKeys14.push(bjDateKey(now - i * 86400000));
  const spark = buildSpark(dayKeys14, dailyCounts);

  let overview: OverviewVM;
  if (runs.length === 0) {
    overview = {
      dotTone: 'gray',
      headline: '哨兵已上线 · 等待首次体检',
      subline: '首次体检完成后，这里将亮起七项检查状态',
      lastCheckText: null,
      chips, // 照常渲染，全灰待判
      spark,
    };
  } else {
    const failN = chips.filter((c) => c.status === 'fail').length;
    const errN = chips.filter((c) => c.status === 'error').length;
    const okN = chips.filter((c) => c.status === 'ok').length;
    overview = {
      dotTone: failN ? 'red' : errN ? 'orange' : 'green',
      headline: failN ? `${failN} 项异常` : errN ? `${errN} 项执行异常` : `系统正常 · ${okN}/7 项通过`,
      subline: !failN && !errN && okN < 7 ? '其余待判' : null,
      lastCheckText: lastRanAt ? `最近体检 ${bjShortTime(lastRanAt)}` : null,
      chips,
      spark,
    };
  }

  // ── 卡2 源健康榜 ──
  const monitorRows = buildLadderRows(cfg);
  type Mid = LadderRowVM & { ratio: number | null; ageDays: number | null };
  const mids: Mid[] = monitorRows.map((m) => {
    const lastSeen = perSource[m.key]?.lastSeenAt ?? null;
    const age = lastSeen && Number.isFinite(Date.parse(lastSeen)) ? (now - Date.parse(lastSeen)) / 86400000 : null;
    const seenToday = age !== null && lastSeen !== null && bjDateKey(Date.parse(lastSeen)) === todayBJ;
    const over = age !== null && age > m.days;
    const tone: LadderTone = m.disabled || age === null ? 'muted' : over ? 'over' : age >= m.days * 0.5 ? 'warn' : 'ok';
    const site = m.key.endsWith('(官网)');
    const name = site ? m.key.slice(0, -4) : m.key;
    const daysText = age === null ? '—' : seenToday ? '今天' : `${Math.floor(age)} 天`;
    const stateText = m.disabled ? '已停用' : age === null ? '待判（无观测记录）' : over ? '已超阈' : '阈值内';
    const title = `${name}${site ? '（官网）' : ''} · ${age === null ? '无观测记录' : `静默 ${Math.floor(age)} 天`} / 阈 ${m.days} 天 · ${stateText}${lastSeen ? ` · 最后收录 ${bjDateTime(lastSeen)}` : ''}`;
    return {
      key: m.key, name, site, disabled: m.disabled, tone, seenToday, daysText,
      thresholdText: `/${m.days} 天阈`,
      barPct: age === null ? 0 : Math.min(100, +((age / m.days) * 100).toFixed(1)),
      defaultVisible: false,
      title,
      ratio: age === null ? null : age / m.days,
      ageDays: age,
    };
  });
  // 排位：按 静默/阈值 比降序（最危险在前），待判沉底；同比按静默天数降序
  mids.sort((a, b) => {
    if (a.ratio === null && b.ratio === null) return 0;
    if (a.ratio === null) return 1;
    if (b.ratio === null) return -1;
    return b.ratio - a.ratio || (b.ageDays ?? 0) - (a.ageDays ?? 0);
  });
  // 默认显示：Top10 ∪ 全部超阈（启用源）
  mids.forEach((r, i) => { r.defaultVisible = i < 10 || (!r.disabled && r.tone === 'over'); });
  const overCount = mids.filter((r) => !r.disabled && r.tone === 'over').length; // 停用不计入超阈
  const disabledCount = mids.filter((r) => r.disabled).length;
  const ladder: LadderVM = {
    rows: mids.map(({ ratio: _r, ageDays: _a, ...vm }) => vm),
    headNote: `${overCount} 超阈 · 已停用 ${disabledCount} · 共 ${mids.length} 源`,
    totalCount: mids.length,
  };

  // ── 卡3 板块产出趋势（近 14 个北京日，含今天）──
  const boards: TrendBoardVM[] = BOARD_DEFS.map((b) => {
    const vals = dayKeys14.map((d) => (dailyCounts[d] ? (dailyCounts[d][b.key] ?? 0) : null));
    const max = Math.max(1, ...vals.map((v) => v ?? 0));
    const bars: TrendBarVM[] = vals.map((v, i) => {
      const label = dayKeys14[i].slice(5);
      const isToday = dayKeys14[i] === todayBJ;
      if (v === null) return { kind: 'missing', heightPx: 2, isToday, title: `${label} · 无数据` };
      if (v === 0)    return { kind: 'zero',    heightPx: 2, isToday, title: `${label} · 0 条` };
      return { kind: 'value', heightPx: Math.max(3, Math.round((v / max) * 48)), isToday, title: `${label} · ${v} 条` };
    });
    return { key: b.key, label: b.label, bars };
  });
  const trend: TrendVM = {
    boards,
    rangeNote: `${dayKeys14[0].slice(5)} – ${dayKeys14[13].slice(5)}（北京日）`,
  };

  // ── 卡4 告警事件流（openIncidents 置顶 + runs alertsSent 平铺，近 30 天/最多 20 条）──
  const cutoffIso = new Date(now - 30 * 86400000).toISOString();
  const openItems: EventVM[] = (state.openIncidents ?? [])
    .filter((i) => i && i.status === 'open')
    .sort((a, b) => String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')))
    .map((i) => ({
      badge: i.checkId ?? '—',
      title: [i.target, i.evidence].filter(Boolean).join(' · ') || '未知事件',
      timeText: bjShortTime(i.lastSeenAt ?? i.firstSeenAt ?? ''),
      ongoing: true,
    }));
  const alertItems: EventVM[] = runs
    .filter((r) => (r.ranAt ?? '') >= cutoffIso)
    .flatMap((r) => (r.alertsSent ?? []).map((a) => ({
      badge: a.checkId ?? '—',
      title: [a.title, a.target].filter(Boolean).join(' · ') || '未知告警',
      timeText: bjShortTime(r.ranAt ?? ''), // alertsSent 无自带时间戳，用所属 run 的 ranAt
      ranAt: r.ranAt ?? '',
      ongoing: false,
    })))
    .sort((a, b) => b.ranAt.localeCompare(a.ranAt))
    .map(({ ranAt: _t, ...vm }) => vm);
  const items = [...openItems, ...alertItems].slice(0, 20);
  const events: EventsVM = { empty: items.length === 0, items };

  return { dataAsOf, overview, ladder, trend, events };
}
