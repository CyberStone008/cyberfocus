#!/usr/bin/env node
/**
 * sentinel.js — 运行期「健康哨兵」v1（纯确定性脚本，零 AI 调用）
 *
 * 用法：
 *   node scripts/sentinel.js --trigger=piggyback   # 搭车体检（update-papers 每批跑完后）：C2/C3/C5/C6
 *   node scripts/sentinel.js --trigger=morning     # 独立晨检（等到北京 08:00 判定）：C1/C4
 *   node scripts/sentinel.js --trigger=weekly      # 周报（等到北京 21:00 发送，兼任哨兵心跳）
 *
 * 环境变量：
 *   BARK_KEY       缺失时静默跳过推送（打印"跳过推送"，绝不报错）
 *   GITHUB_TOKEN   C1 失败分诊查 Actions API 用（可选；公共仓库无 token 也能查，仅限流）
 *   SENTINEL_FORCE=1   跳过绝对时间闸与当日已判幂等（本地测试/手动补判用）
 *   SENTINEL_REPO      覆盖默认仓库 CyberStone008/cyberfocus（测试用）
 *
 * 七项检查：
 *   C1 晨批考勤(morning)   data/daily/{北京今日}.json 存在且 generatedAt ≤ 北京08:00；失败→即时+Actions API 分诊
 *   C2 源健康(piggyback)   state 自存 perSource lastSeenAt（首跑用 articles+podcasts 播种；不能只看
 *                          articles.json——3000 条滚动池会淘汰小源旧记录）。高频源 2 天→即时；
 *                          HR Google News 12 家 7 天→周报；其余(博客/播客/官网) 14 天→周报。
 *                          跳过 sources.json disabled；可被 sources.json healthDays 覆盖（见 AGENTS.md）。
 *   C3 官网防烂(piggyback) 消费 data/health/last-fetch.json：orgSites html 模式源解析数连续 2 批=0→即时
 *   C4 站点存活+新鲜(morning) reallylink.cn/reports/ 3 次重试；非 200→即时；200 时最新 3 条标题纯子串
 *                          匹配，全不命中→即时。GitHub Pages 只查 200。网络类(curl 退出码)两击确认，
 *                          HTTP 非 200(对端)与断言失败(逻辑)一击即报。
 *   C5 产出体检(piggyback) a) validate-data.js 退出码 b) 各板块昨日(完整日)新增 vs 前 7 天中位数骤降>70%
 *                          c) 最新策略快报【一句话叙事】解析为空 —— 任一→即时
 *   C6 tldr 覆盖率(piggyback) 近 24h"可抓 host"新闻 tldrZh 覆盖率 <50% → 仅记周报
 *   C7 Bark 受理统计       每次发送的最终 HTTP 码记 state；受理失败只入周报，绝不递归告警
 *
 * 告警治理：
 *   - level 一律 active（严禁 timeSensitive）、group=CyberFocus哨兵
 *   - 当日去重：alertState[checkId:target].lastAlertedDateBJ 同北京日期不重发
 *   - 恢复静默：翻转 status + 记 resolvedAt，不即时推送，只在周报披露
 *
 * 落盘（黑板，未来夜班 agent 的接口）：
 *   data/health/state.json            perSource/alertState/openIncidents/judged/各类 streak
 *   data/health/runs/{北京日期}.json   append {ranAt,trigger,checks,alertsSent}；超 30 天自动清理
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ROOT            = process.cwd();
const HEALTH_DIR      = resolve(ROOT, 'data/health');
const RUNS_DIR        = resolve(HEALTH_DIR, 'runs');
const STATE_PATH      = resolve(HEALTH_DIR, 'state.json');
const LAST_FETCH_PATH = resolve(HEALTH_DIR, 'last-fetch.json');
const ARTICLES_PATH   = resolve(ROOT, 'data/articles.json');
const PODCASTS_PATH   = resolve(ROOT, 'data/podcasts.json');
const SOURCES_PATH    = resolve(ROOT, 'data/sources.json');
const BRIEFS_DIR      = resolve(ROOT, 'data/strategy-briefs');

const REPO = process.env.SENTINEL_REPO || 'CyberStone008/cyberfocus';

// ── 北京时间纪律（UTC+8，无夏令时；先 +8h 偏移再取日期，严禁裸 toISOString().slice）──
const BJ_OFFSET_MS = 8 * 3600 * 1000;
function bjDateKey(t = Date.now()) { return new Date(t + BJ_OFFSET_MS).toISOString().slice(0, 10); }
function bjClock(t = Date.now())   { return new Date(t + BJ_OFFSET_MS).toISOString().slice(11, 16); }
/** 北京 dateKey 当天 hh:mm 对应的 UTC 毫秒 */
function bjTargetMs(dateKey, hh, mm = 0) {
  return Date.parse(`${dateKey}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`);
}
const nowIso = () => new Date().toISOString();
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 监控对象与阈值（内置默认；sources.json 可覆盖，见 buildMonitors）─────────────
const HIGH_FREQ_SOURCES = ['Google AI News', 'Hacker News', '雷锋网', '量子位', 'Reddit LocalLLaMA']; // 2 天→即时
const HR_GN_SOURCES = [  // HR 的 Google News 12 家，7 天→周报（与 pipeline.js HR_SOURCES 一致）
  'ManpowerGroup', 'Mercer', 'Korn Ferry', 'Randstad', 'Adecco Group', 'Recruit Holdings',
  '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
];
// 官方博客（articles.json 里的 source 名 + sources.json/disabled 用的配置名），14 天→周报
const BLOG_MONITORS = [
  { source: 'Anthropic Blog',  configIds: ['Anthropic Blog'] },
  { source: 'Claude Blog',     configIds: ['Claude Blog'] },
  { source: 'OpenAI Blog',     configIds: ['OpenAI Blog'] },
  { source: 'Google DeepMind', configIds: ['DeepMind Blog', 'Google DeepMind'] }, // 配置 id 与文章 source 不同名
];
const DEFAULT_DAYS = { high: 2, hrGoogleNews: 7, low: 14 };

// ── 通用 IO ──────────────────────────────────────────────────────────────────
function loadJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}
function loadState() {
  const s = loadJson(STATE_PATH, {});
  return {
    version: 1,
    judged: {},                // { morning: 'YYYY-MM-DD', weekly: 'YYYY-MM-DD' } 绝对时间闸幂等
    perSource: {},             // { key: { lastSeenAt } } —— C2 黑板（monotonic，永不回退）
    alertState: {},            // { 'C2:Reddit LocalLLaMA': { status, firstFailedAt, lastAlertedAt, lastAlertedDateBJ, resolvedAt, note } }
    openIncidents: [],         // 夜班 agent 接口：{ id, checkId, target, severity, firstSeenAt, lastSeenAt, evidence, status }
    dailyCounts: {},           // { 'YYYY-MM-DD': { aiNews, papers, hrOrgs, podcasts } } —— C5b
    orgSitesZeroStreak: {},    // { entryId: n } —— C3 连续 0 解析批次数
    lastFetchConsumedRanAt: null, // C3 幂等：同一批 fetch 统计只累计一次
    netFail: {},               // { 'C4:reallylink.cn': { streak, lastAt, lastError } } —— 网络类两击确认
    barkDeliveries: [],        // C7：[{ at, code, title }]
    ...s,
  };
}
function saveState(state) {
  state.updatedAt = nowIso();
  mkdirSync(HEALTH_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
function loadSourcesConfig() { return loadJson(SOURCES_PATH, {}); }

// ── Bark 推送（参考 update-papers.yml bark_push：失败兜底等价 `|| echo 000`，4 重试）──
async function barkPush(ctx, title, body) {
  const key = process.env.BARK_KEY;
  const text = body.length > 1800 ? `${body.slice(0, 1800)}…` : body;
  if (!key) {
    console.log(`[sentinel][bark] BARK_KEY 未设置，跳过推送：${title}`);
    recordBark(ctx.state, 'skipped', title);
    return 'skipped';
  }
  let code = '000';
  for (let i = 1; i <= 4; i++) {
    try {
      const { stdout } = await execFileAsync('curl', [
        '-s', '-o', '/dev/null', '-w', '%{http_code}',
        '--connect-timeout', '10', '--max-time', '25',
        '-X', 'POST', `https://api.day.app/${key}`,
        '--data-urlencode', `title=${title}`,
        '--data-urlencode', `body=${text}`,
        '--data-urlencode', 'group=CyberFocus哨兵',
        '--data-urlencode', 'level=active',          // 告警治理：全部 active，严禁 timeSensitive
      ]);
      code = stdout.trim() || '000';
    } catch { code = '000'; }   // curl 超时/网络错 → 等价 bash 的 `|| echo 000`，绝不中断
    console.log(`[sentinel][bark] 第 ${i} 次 HTTP=${code}（${title}）`);
    if (code === '200') break;
    if (i < 4) await sleep(5000);
  }
  recordBark(ctx.state, code, title);  // C7：受理统计；失败只入周报，绝不递归告警
  return code;
}
function recordBark(state, code, title) {
  state.barkDeliveries.push({ at: nowIso(), code, title: String(title).slice(0, 50) });
  if (state.barkDeliveries.length > 200) state.barkDeliveries = state.barkDeliveries.slice(-200);
}

// ── 告警治理核心：当日去重 / 恢复静默 / openIncidents 维护 ─────────────────────
function upsertIncident(state, checkId, r) {
  const open = state.openIncidents.find((i) => i.checkId === checkId && i.target === r.target && i.status === 'open');
  if (open) {
    open.lastSeenAt = nowIso();
    open.evidence = r.evidence ?? open.evidence;
    if (r.immediate) open.severity = 'critical';
    return;
  }
  state.openIncidents.push({
    id: `${checkId}-${String(r.target).replace(/[^\w一-鿿-]+/g, '_')}-${Date.now().toString(36)}`,
    checkId,
    target: r.target,
    severity: r.immediate ? 'critical' : 'warning',
    firstSeenAt: nowIso(),
    lastSeenAt: nowIso(),
    evidence: r.evidence ?? '',
    status: 'open',
  });
}
function resolveIncident(state, checkId, target) {
  for (const i of state.openIncidents) {
    if (i.checkId === checkId && i.target === target && i.status === 'open') {
      i.status = 'resolved';
      i.resolvedAt = nowIso();
    }
  }
}

/**
 * 统一处理一项检查的全部评估结果：失败→记账(+即时告警，当日去重)；通过→静默恢复。
 * results: [{ target, failed, immediate, detailLine, evidence }]
 * meta:    { title, advice }
 */
async function reconcileCheck(ctx, checkId, results, meta) {
  const today = bjDateKey();
  const toAlert = [];
  for (const r of results) {
    const key = `${checkId}:${r.target}`;
    let st = ctx.state.alertState[key];
    if (r.failed) {
      if (!st || st.status === 'ok') {
        st = { status: 'alerting', firstFailedAt: nowIso(), lastAlertedAt: null, lastAlertedDateBJ: null, resolvedAt: null };
        ctx.state.alertState[key] = st;
      }
      st.status = 'alerting';
      st.lastFailedAt = nowIso();
      st.note = r.detailLine;
      upsertIncident(ctx.state, checkId, r);
      if (r.immediate) {
        if (st.lastAlertedDateBJ === today) {
          console.log(`[sentinel][dedup] ${key} 当日(${today})已告警，跳过重发`);
        } else {
          toAlert.push({ r, st });
        }
      }
    } else if (st && st.status === 'alerting') {
      // 恢复：翻转 status + resolvedAt，不即时推送（周报披露）
      st.status = 'ok';
      st.resolvedAt = nowIso();
      resolveIncident(ctx.state, checkId, r.target);
      console.log(`[sentinel][recover] ${key} 已恢复（静默，周报披露）`);
    }
  }
  if (toAlert.length > 0) {
    const body = `${toAlert.map((x) => `· ${x.r.detailLine}`).join('\n')}\n${meta.advice}`;
    const code = await barkPush(ctx, meta.title, body);
    for (const x of toAlert) {
      x.st.lastAlertedAt = nowIso();
      x.st.lastAlertedDateBJ = today;
      ctx.alertsSent.push({ checkId, target: x.r.target, title: meta.title, httpCode: code });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// C1 晨批考勤（morning）
// ════════════════════════════════════════════════════════════════════════════
async function triageMorningFailure(today) {
  // 用 Actions API 分诊：无 schedule run=cron 丢批 / run failed=跑批失败 / 成功但无产出=逻辑问题
  const since = new Date(bjTargetMs(today, 0, 0)).toISOString();
  const until = new Date(bjTargetMs(today, 8, 0)).toISOString();
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/update-papers.yml/runs?created=${since}..${until}&per_page=50`;
  const args = ['-sS', '--max-time', '30', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28'];
  if (process.env.GITHUB_TOKEN) args.push('-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`);
  args.push(url);
  try {
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 16 * 1024 * 1024 });
    const runs = (JSON.parse(stdout).workflow_runs ?? []).filter((r) => r.event === 'schedule');
    if (runs.length === 0)  return 'cron 丢批（当日 08:00 前无 schedule 运行）→ 手动 workflow_dispatch 触发 update-papers 补跑';
    const failed = runs.filter((r) => r.conclusion === 'failure');
    if (failed.length > 0)  return `跑批失败（${failed.length} 个 schedule run failure）→ 查看 Actions 日志定位`;
    if (runs.some((r) => r.status !== 'completed')) return 'schedule run 仍在进行中（严重漂移/排队）→ 稍后复查';
    return '逻辑问题（schedule run 成功但当日快照缺失/迟到）→ 检查 pipeline 日报写盘/翻译后端';
  } catch (e) {
    return `Actions API 查询失败（${String(e.message).slice(0, 80)}），无法分诊`;
  }
}

async function runCheckC1(ctx) {
  const today = bjDateKey();
  const deadline  = bjTargetMs(today, 8, 0);   // 北京 08:00 就绪线
  const mainBatch = bjTargetMs(today, 4, 0);   // 北京 04:00 晨跑主批（漂移基准）
  const p = resolve(ROOT, 'data/daily', `${today}.json`);
  let failed = false, note = '', drift = null;

  if (!existsSync(p)) {
    failed = true; note = `data/daily/${today}.json 不存在`;
  } else {
    try {
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      const gen = Date.parse(doc.generatedAt ?? '');
      if (!Number.isFinite(gen)) {
        failed = true; note = `daily 快照 generatedAt 缺失/不可解析`;
      } else {
        drift = Math.round((gen - mainBatch) / 60000);
        if (gen > deadline) { failed = true; note = `generatedAt=${doc.generatedAt} 晚于北京 08:00（相对 04:00 主批漂移 ${drift} 分钟）`; }
        else note = `generatedAt=${doc.generatedAt}，相对 04:00 主批漂移 ${drift} 分钟`;
      }
    } catch (e) { failed = true; note = `daily 快照解析失败: ${e.message}`; }
  }
  if (failed) note += `；诊断：${await triageMorningFailure(today)}`;

  ctx.checks.push({ id: 'C1', status: failed ? 'fail' : 'ok', value: drift, threshold: '快照存在且 generatedAt ≤ 北京08:00', note });
  await reconcileCheck(ctx, 'C1', [{
    target: 'daily-snapshot', failed, immediate: true,
    detailLine: `晨批考勤失败：${note}`, evidence: note,
  }], { title: '🛰 哨兵：晨批考勤失败', advice: '建议：GitHub Actions 手动触发 update-papers（run_pipeline=true）补跑' });
}

// ════════════════════════════════════════════════════════════════════════════
// C2 源健康（piggyback；weekly 以 report-only 复评）
// ════════════════════════════════════════════════════════════════════════════
/** 文章/播客 → perSource 黑板（monotonic max；首跑即播种）。官网条目用 `${source}(官网)` 独立记账 */
function updatePerSource(state) {
  const seen = (key, t) => {
    if (!key || !t) return;
    const cur = state.perSource[key]?.lastSeenAt;
    if (!cur || t > cur) state.perSource[key] = { lastSeenAt: t };
  };
  for (const a of loadJson(ARTICLES_PATH, [])) {
    const t = a.fetchedAt || a.publishedAt;
    const isSite = typeof a.id === 'string' && a.id.startsWith('hrsite:');
    seen(isSite ? `${a.source}(官网)` : a.source, t);
  }
  for (const e of loadJson(PODCASTS_PATH, [])) {
    const t = [e.fetchedAt, e.analyzedAt, e.publishedAt].filter(Boolean).sort().pop();
    seen(e.source, t);
  }
}

/** 阈值覆盖：sources.json 顶层 healthDays:{源名:天数}，或 podcasts/orgSites 条目级 healthDays */
function buildMonitors(cfg) {
  const disabled = new Set(cfg.disabled ?? []);
  const topHd = cfg.healthDays && typeof cfg.healthDays === 'object' ? cfg.healthDays : {};
  const monitors = new Map();
  const push = (key, days, immediate, configIds, entry) => {
    if (configIds.some((n) => disabled.has(n))) return;  // 跳过 disabled 源
    let d = days;
    for (const n of [key, ...configIds]) if (Number.isFinite(topHd[n])) { d = topHd[n]; break; }
    if (entry && Number.isFinite(entry.healthDays)) d = entry.healthDays;
    if (!monitors.has(key)) monitors.set(key, { key, days: d, immediate });
  };
  for (const s of HIGH_FREQ_SOURCES) push(s, DEFAULT_DAYS.high, true, [s]);
  for (const s of HR_GN_SOURCES)     push(s, DEFAULT_DAYS.hrGoogleNews, false, [s]);
  for (const b of BLOG_MONITORS)     push(b.source, DEFAULT_DAYS.low, false, b.configIds);
  for (const p of cfg.podcasts ?? []) {
    if (p && p.source) push(p.source, DEFAULT_DAYS.low, false, [p.id, p.source].filter(Boolean), p);
  }
  for (const o of cfg.orgSites ?? []) {
    if (o && o.source && o.disabled !== true) push(`${o.source}(官网)`, DEFAULT_DAYS.low, false, [o.id, o.source].filter(Boolean), o);
  }
  return [...monitors.values()];
}

async function runCheckC2(ctx, { suppressImmediate = false } = {}) {
  updatePerSource(ctx.state);
  const monitors = buildMonitors(loadSourcesConfig());
  const results = monitors.map((m) => {
    const last = ctx.state.perSource[m.key]?.lastSeenAt ?? null;
    if (!last) {
      return {
        target: m.key, failed: true, immediate: m.immediate && !suppressImmediate,
        detailLine: `${m.key} 无任何观测记录（阈值 ${m.days} 天）`, evidence: 'lastSeenAt=null',
      };
    }
    const ageDays = (Date.now() - Date.parse(last)) / 86400000;
    const failed = ageDays > m.days;
    return {
      target: m.key, failed, immediate: m.immediate && !suppressImmediate,
      detailLine: `${m.key} 已静默 ${ageDays.toFixed(1)} 天（阈值 ${m.days} 天，最后收录 ${last.slice(0, 10)}）`,
      evidence: `lastSeenAt=${last} ageDays=${ageDays.toFixed(1)} threshold=${m.days}`,
    };
  });
  const fails = results.filter((r) => r.failed);
  ctx.checks.push({
    id: 'C2', status: fails.length ? 'fail' : 'ok',
    value: `${fails.length}/${results.length} 静默`,
    threshold: '高频2天/HR新闻7天/其余14天',
    note: fails.length ? fails.map((r) => r.detailLine).join('；') : `全部 ${results.length} 个源在阈值内`,
  });
  await reconcileCheck(ctx, 'C2', results, {
    title: '🛰 哨兵：高频源静默',
    advice: '建议：本地跑 node scripts/pipeline.js 复现，检查 fetcher 与上游接口是否变更',
  });
  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// C3 官网防烂（piggyback）—— 消费 pipeline 写的 data/health/last-fetch.json
// ════════════════════════════════════════════════════════════════════════════
async function runCheckC3(ctx) {
  const cfg = loadSourcesConfig();
  const disabled = new Set(cfg.disabled ?? []);
  const htmlEntries = (cfg.orgSites ?? []).filter(
    (o) => o && o.mode === 'html' && o.disabled !== true && !disabled.has(o.id) && !disabled.has(o.source)
  );
  const lf = loadJson(LAST_FETCH_PATH, null);
  if (!lf || !lf.orgSitesParse) {
    ctx.checks.push({ id: 'C3', status: 'skip', value: null, threshold: 'html 源连续 2 批解析 0', note: '无 last-fetch.json（pipeline 本批未产出 fetch 统计）' });
    return;
  }
  // 同一批统计只累计一次（本地复跑/重放不重复加 streak）
  if (ctx.state.lastFetchConsumedRanAt !== lf.ranAt) {
    for (const e of htmlEntries) {
      const n = lf.orgSitesParse[e.id];
      if (typeof n !== 'number') continue;          // 本批没跑该源（如单源模式）不计
      const cur = ctx.state.orgSitesZeroStreak[e.id] ?? 0;
      ctx.state.orgSitesZeroStreak[e.id] = n === 0 ? cur + 1 : 0;
    }
    ctx.state.lastFetchConsumedRanAt = lf.ranAt;
  } else {
    console.log('[sentinel][C3] 同一批 fetch 统计（ranAt 相同）已消费过，不重复累计');
  }
  const results = htmlEntries.map((e) => {
    const streak = ctx.state.orgSitesZeroStreak[e.id] ?? 0;
    return {
      target: e.id, failed: streak >= 2, immediate: true,
      detailLine: `${e.source}（${e.id}, html）连续 ${streak} 批解析 0 条——官网结构可能已改版`,
      evidence: `zeroStreak=${streak} lastFetchRanAt=${lf.ranAt}`,
    };
  });
  const fails = results.filter((r) => r.failed);
  ctx.checks.push({
    id: 'C3', status: fails.length ? 'fail' : 'ok',
    value: htmlEntries.map((e) => `${e.id}=${lf.orgSitesParse[e.id] ?? '-'}(streak ${ctx.state.orgSitesZeroStreak[e.id] ?? 0})`).join(' '),
    threshold: '连续 2 批解析 0',
    note: fails.length ? fails.map((r) => r.detailLine).join('；') : 'html 官网源解析正常',
  });
  await reconcileCheck(ctx, 'C3', results, {
    title: '🛰 哨兵：官网解析连续为 0',
    advice: '建议：本地跑 node scripts/fetch/hr-org-sites.js 核对该站列表页结构/选择器',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// C4 站点存活+新鲜（morning）
// ════════════════════════════════════════════════════════════════════════════
async function curlPage(url, withBody) {
  const bodyFile = withBody ? join(tmpdir(), `sentinel-${Date.now()}-${Math.random().toString(36).slice(2)}.html`) : '/dev/null';
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS', '-L', '-o', bodyFile, '-w', '%{http_code}',
      '--connect-timeout', '10', '--max-time', '60',
      '-H', 'User-Agent: Mozilla/5.0 (CyberFocus-Sentinel)',
      url,
    ], { maxBuffer: 4 * 1024 * 1024 });
    const code = stdout.trim();
    let body = '';
    if (withBody && code === '200') {
      try { body = readFileSync(bodyFile, 'utf8'); } catch { body = ''; }
    }
    if (withBody) { try { rmSync(bodyFile, { force: true }); } catch { /* ignore */ } }
    return code === '200' ? { kind: 'ok', code, body } : { kind: 'http', code };
  } catch (e) {
    if (withBody) { try { rmSync(bodyFile, { force: true }); } catch { /* ignore */ } }
    return { kind: 'net', code: '000', error: String(e.message).slice(0, 120) };
  }
}
/** 3 次重试（5/15/30s 退避） */
async function probe(url, withBody) {
  const waits = [5000, 15000, 30000];
  let last;
  for (let i = 0; i <= waits.length; i++) {
    last = await curlPage(url, withBody);
    if (last.kind === 'ok') return last;
    if (i < waits.length) {
      console.log(`[sentinel][C4] ${url} 第 ${i + 1} 次失败（${last.kind} ${last.code ?? ''}${last.error ?? ''}），${waits[i] / 1000}s 后重试`);
      await sleep(waits[i]);
    }
  }
  return last;
}
/** 页面里标题可能被 RSC JSON 转义（\uXXXX、\"）或 HTML 实体化——解码后做纯子串匹配（不要正则，标题含特殊字符） */
function normalizeBody(body) {
  return body
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch { return m; } })
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** 网络类失败两击确认：首败只记 state；下批仍败才升级为告警。HTTP 非 200/逻辑失败一击即报。 */
function classifyNetFail(ctx, key, res) {
  const nf = ctx.state.netFail[key] ?? { streak: 0 };
  nf.streak += 1;
  nf.lastAt = nowIso();
  nf.lastError = res.error ?? '';
  ctx.state.netFail[key] = nf;
  return nf.streak >= 2;
}

async function runCheckC4(ctx) {
  const results = [];
  const notes = [];

  // ① 主站 reallylink.cn/reports/ —— 存活 + 新鲜度
  const mainUrl = 'https://reallylink.cn/reports/';
  const res = await probe(mainUrl, true);
  if (res.kind === 'net') {
    const confirmed = classifyNetFail(ctx, 'C4:reallylink.cn', res);
    results.push({
      target: 'site:reallylink.cn', failed: true, immediate: confirmed,
      detailLine: `reallylink.cn 网络类失败（curl 退出码，${res.error}）${confirmed ? '——连续两批确认' : '——首败仅记账，下批仍败才告警'}`,
      evidence: `net error: ${res.error}, streak=${ctx.state.netFail['C4:reallylink.cn'].streak}`,
    });
    notes.push(`主站网络失败(streak ${ctx.state.netFail['C4:reallylink.cn'].streak})`);
    results.push({ target: 'fresh:reallylink.cn', failed: false, immediate: false, detailLine: '', evidence: '站点不可达，本批未评估新鲜度' });
  } else {
    delete ctx.state.netFail['C4:reallylink.cn'];
    if (res.kind === 'http') {
      results.push({
        target: 'site:reallylink.cn', failed: true, immediate: true,
        detailLine: `reallylink.cn/reports/ 返回 HTTP ${res.code}（对端异常，重试 3 次后仍非 200）`,
        evidence: `HTTP ${res.code}`,
      });
      notes.push(`主站 HTTP ${res.code}`);
      results.push({ target: 'fresh:reallylink.cn', failed: false, immediate: false, detailLine: '', evidence: '非 200，本批未评估新鲜度' });
    } else {
      results.push({ target: 'site:reallylink.cn', failed: false, immediate: false, detailLine: '', evidence: 'HTTP 200' });
      // 新鲜度：本地 articles.json 最新 3 条 research（/reports 板块口径）标题纯子串匹配
      const latest3 = loadJson(ARTICLES_PATH, [])
        .filter((a) => a.category === 'research')
        .sort((a, b) => String(b.fetchedAt || b.publishedAt).localeCompare(String(a.fetchedAt || a.publishedAt)))
        .slice(0, 3);
      const norm = normalizeBody(res.body);
      const hit = latest3.some((a) =>
        [a.titleZh, a.titleEn].filter(Boolean).some((t) => res.body.includes(t) || norm.includes(t))
      );
      const titles = latest3.map((a) => (a.titleZh || a.titleEn || '').slice(0, 30)).join(' / ');
      results.push({
        target: 'fresh:reallylink.cn', failed: !hit && latest3.length > 0, immediate: true, // 逻辑类一击即报
        detailLine: `reallylink.cn 新鲜度失败：最新 3 条标题全部未出现在页面（${titles}）——部署可能滞后/数据未上线`,
        evidence: `latest3=${titles} matched=${hit}`,
      });
      notes.push(hit ? '主站 200+新鲜' : `主站 200 但新鲜度未命中`);
    }
  }

  // ② GitHub Pages 只查 200
  const pagesUrl = 'https://cyberstone008.github.io/cyberfocus/';
  const res2 = await probe(pagesUrl, false);
  if (res2.kind === 'net') {
    const confirmed = classifyNetFail(ctx, 'C4:github-pages', res2);
    results.push({
      target: 'site:github-pages', failed: true, immediate: confirmed,
      detailLine: `GitHub Pages 网络类失败（${res2.error}）${confirmed ? '——连续两批确认' : '——首败仅记账'}`,
      evidence: `net error: ${res2.error}, streak=${ctx.state.netFail['C4:github-pages'].streak}`,
    });
    notes.push('Pages 网络失败');
  } else if (res2.kind === 'http') {
    delete ctx.state.netFail['C4:github-pages'];
    results.push({
      target: 'site:github-pages', failed: true, immediate: true,
      detailLine: `GitHub Pages 返回 HTTP ${res2.code}（重试 3 次后仍非 200）`, evidence: `HTTP ${res2.code}`,
    });
    notes.push(`Pages HTTP ${res2.code}`);
  } else {
    delete ctx.state.netFail['C4:github-pages'];
    results.push({ target: 'site:github-pages', failed: false, immediate: false, detailLine: '', evidence: 'HTTP 200' });
    notes.push('Pages 200');
  }

  const fails = results.filter((r) => r.failed);
  ctx.checks.push({
    id: 'C4', status: fails.length ? 'fail' : 'ok',
    value: notes.join('；'), threshold: '200 + 最新3条标题任一命中（网络类两击/逻辑类一击）',
    note: fails.length ? fails.map((r) => r.detailLine).join('；') : '主站与 Pages 均正常',
  });
  await reconcileCheck(ctx, 'C4', results, {
    title: '🛰 哨兵：站点存活/新鲜度异常',
    advice: '建议：先手开 reallylink.cn 确认；新鲜度失败查 Vercel 部署是否滞后，HTTP 异常查托管方状态页',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// C5 产出体检（piggyback）
// ════════════════════════════════════════════════════════════════════════════
const HR_SET = new Set(HR_GN_SOURCES);
function boardOf(a) {
  if ((typeof a.id === 'string' && a.id.startsWith('hrsite:')) || HR_SET.has(a.source)) return 'hrOrgs';
  if (a.category === 'social') return 'aiNews';
  return 'papers';
}
/** 近 8 个北京日的各板块新增计数（按 fetchedAt 归日；播客按 publishedAt） */
function computeDailyBoardCounts() {
  const days = {};
  const minKey = bjDateKey(Date.now() - 8 * 86400000);
  const bump = (d, b) => { (days[d] ??= { aiNews: 0, papers: 0, hrOrgs: 0, podcasts: 0 })[b]++; };
  for (const a of loadJson(ARTICLES_PATH, [])) {
    if (!a.fetchedAt) continue;
    const d = bjDateKey(Date.parse(a.fetchedAt));
    if (d >= minKey) bump(d, boardOf(a));
  }
  for (const e of loadJson(PODCASTS_PATH, [])) {
    const t = e.fetchedAt || e.publishedAt;
    if (!t) continue;
    const d = bjDateKey(Date.parse(t));
    if (d >= minKey) bump(d, 'podcasts');
  }
  return days;
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
// 复刻自 app/(app)/investing/page.tsx 的 extractNarrative()（JS 不能 import TS；两处改动需同步）
const NARRATIVE_RE = /##\s*【一句话叙事】\s*\n+\s*(?:>\s*)?([\s\S]+?)(?=\n\s*---|\n\s*##|$)/;
function extractNarrative(md) {
  const m = md.match(NARRATIVE_RE);
  if (!m) return '';
  return m[1].replace(/\n\s*>?\s*/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

async function runCheckC5(ctx) {
  const results = [];

  // a) validate-data.js 子进程退出码
  let aNote = '';
  let aFailed = false;
  try {
    await execFileAsync('node', [resolve(ROOT, 'scripts/validate-data.js')], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
    aNote = 'validate-data 退出码 0';
  } catch (e) {
    aFailed = true;
    const errLines = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.split('\n').filter((l) => l.includes('❌')).slice(0, 3).join(' / ');
    aNote = `validate-data 退出码 ${e.code ?? '?'}：${errLines || String(e.message).slice(0, 120)}`;
  }
  ctx.checks.push({ id: 'C5a', status: aFailed ? 'fail' : 'ok', value: aFailed ? 1 : 0, threshold: '退出码 0', note: aNote });
  results.push({ target: 'validate-data', failed: aFailed, immediate: true, detailLine: `产出体检：${aNote}`, evidence: aNote });

  // b) 各板块昨日(已完整结束的北京日)新增 vs 前 7 天中位数，骤降 >70% → 即时。
  //    判完整日而非"当日"——piggyback 在一天中多次运行，凌晨批次当日计数天然偏小会必然误报。
  const computed = computeDailyBoardCounts();
  for (const [d, c] of Object.entries(computed)) {
    const cur = ctx.state.dailyCounts[d] ?? {};
    ctx.state.dailyCounts[d] = Object.fromEntries(
      ['aiNews', 'papers', 'hrOrgs', 'podcasts'].map((b) => [b, Math.max(cur[b] ?? 0, c[b] ?? 0)])
    );
  }
  const yesterday = bjDateKey(Date.now() - 86400000);
  const bNotes = [];
  for (const board of ['aiNews', 'papers', 'hrOrgs', 'podcasts']) {
    const yCount = ctx.state.dailyCounts[yesterday]?.[board] ?? 0;
    const history = [];
    for (let i = 2; i <= 8; i++) {
      const d = bjDateKey(Date.now() - i * 86400000);
      if (ctx.state.dailyCounts[d]) history.push(ctx.state.dailyCounts[d][board] ?? 0);
    }
    if (history.length < 3) { bNotes.push(`${board}: 历史不足(${history.length}天)跳过`); continue; }
    const med = median(history);
    if (med < 5) { bNotes.push(`${board}: 中位数 ${med} 太小跳过`); continue; }   // 低基数板块不判，避免 1→0 噪声
    const failed = yCount < med * 0.3;
    bNotes.push(`${board}: 昨日 ${yCount} vs 中位 ${med}${failed ? ' ⚠️骤降' : ''}`);
    results.push({
      target: `board:${board}`, failed, immediate: true,
      detailLine: `板块 ${board} 昨日(${yesterday})新增 ${yCount} 条，仅为前 7 天中位数 ${med} 的 ${Math.round((yCount / med) * 100)}%（骤降>70%）`,
      evidence: `yesterday=${yCount} median7=${med}`,
    });
  }
  const bFails = results.filter((r) => r.target.startsWith('board:') && r.failed);
  ctx.checks.push({ id: 'C5b', status: bFails.length ? 'fail' : 'ok', value: bNotes.join('；'), threshold: '昨日 < 7天中位数×30%', note: bFails.length ? bFails.map((r) => r.detailLine).join('；') : '各板块产出量正常' });

  // c) 最新策略快报【一句话叙事】可解析
  let cFailed = false, cNote = '';
  try {
    const files = (existsSync(BRIEFS_DIR) ? readdirSync(BRIEFS_DIR) : []).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
    if (files.length === 0) {
      cNote = '无策略快报文件（跳过）';
    } else {
      const latest = files[files.length - 1];
      const narrative = extractNarrative(readFileSync(resolve(BRIEFS_DIR, latest), 'utf8'));
      cFailed = !narrative;
      cNote = cFailed
        ? `最新策略快报 ${latest} 解析不到【一句话叙事】——格式漂移会让 /investing 卡片空白`
        : `${latest} 叙事 OK（${narrative.slice(0, 40)}…）`;
    }
  } catch (e) { cFailed = true; cNote = `策略快报检查异常: ${e.message}`; }
  ctx.checks.push({ id: 'C5c', status: cFailed ? 'fail' : 'ok', value: null, threshold: '【一句话叙事】非空', note: cNote });
  results.push({ target: 'strategy-narrative', failed: cFailed, immediate: true, detailLine: `产出体检：${cNote}`, evidence: cNote });

  await reconcileCheck(ctx, 'C5', results, {
    title: '🛰 哨兵：产出体检异常',
    advice: '建议：validate-data 失败先本地复跑定位；板块骤降查对应 fetcher；叙事缺失查 strategy-brief.js 输出格式',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// C6 tldr 覆盖率（piggyback；仅记周报，不即时告警）
// ════════════════════════════════════════════════════════════════════════════
// 口径复刻自 scripts/backfill-news-tldr.js 的 SKIP_HOSTS/fetchable()（两处改动需同步）
const TLDR_SKIP_HOSTS = ['news.google.com', 'arxiv.org', 'huggingface.co', 'news.ycombinator.com'];
function tldrHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function tldrFetchable(a) {
  if (a.contentMd) return false;
  if (!a.sourceUrl || !/^https?:/.test(a.sourceUrl)) return false;
  const h = tldrHost(a.sourceUrl);
  return !TLDR_SKIP_HOSTS.some((s) => h === s || h.endsWith('.' + s));
}

async function runCheckC6(ctx) {
  const cut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const eligible = loadJson(ARTICLES_PATH, []).filter((a) => a.fetchedAt && a.fetchedAt >= cut && tldrFetchable(a));
  const withTldr = eligible.filter((a) => a.tldrZh);
  const cov = eligible.length ? withTldr.length / eligible.length : null;
  const enough = eligible.length >= 5;                 // 样本太小不判
  const failed = cov !== null && enough && cov < 0.5;
  const note = cov === null
    ? '近 24h 无可抓 host 新闻（跳过）'
    : `近 24h 可抓新闻 ${eligible.length} 条，tldr 覆盖 ${withTldr.length} 条（${Math.round(cov * 100)}%）${enough ? '' : '，样本<5 不判'}`;
  ctx.checks.push({ id: 'C6', status: failed ? 'fail' : 'ok', value: cov === null ? null : Math.round(cov * 100), threshold: '≥50%（仅记周报）', note });
  await reconcileCheck(ctx, 'C6', [{
    target: 'tldr-coverage', failed, immediate: false,   // 用户拍板：只入周报
    detailLine: `tldr 覆盖率 ${cov === null ? '-' : Math.round(cov * 100) + '%'} 低于 50%（${note}）`, evidence: note,
  }], { title: '🛰 哨兵：tldr 覆盖率低', advice: '' });
  return { cov, eligible: eligible.length, withTldr: withTldr.length };
}

// ════════════════════════════════════════════════════════════════════════════
// 周报（weekly）—— 兼任哨兵心跳
// ════════════════════════════════════════════════════════════════════════════
function loadRunsForLastDays(n) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    const d = bjDateKey(Date.now() - i * 86400000);
    const arr = loadJson(resolve(RUNS_DIR, `${d}.json`), []);
    if (Array.isArray(arr)) runs.push(...arr);
  }
  return runs;
}

async function runWeekly(ctx) {
  // 周报当场复评 C2/C6（report-only：C2 不触发即时推送，统一进周报）
  await runCheckC2(ctx, { suppressImmediate: true });
  const c6 = await runCheckC6(ctx);

  const weekRuns = loadRunsForLastDays(7);
  const today = bjDateKey();
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

  // ① 晨批考勤 7 天 + 漂移 min/max
  const morningC1 = weekRuns.filter((r) => r.trigger === 'morning').flatMap((r) => r.checks.filter((c) => c.id === 'C1'));
  const drifts = morningC1.map((c) => c.value).filter((v) => Number.isFinite(v));
  const okDays = morningC1.filter((c) => c.status === 'ok').length;
  const att = morningC1.length
    ? `${okDays}/${morningC1.length} 天通过${drifts.length ? `，漂移 ${Math.min(...drifts)}~${Math.max(...drifts)} 分钟` : ''}`
    : '本周无晨检记录（哨兵新上线？）';

  // ② 日内批次成功率（从 runs 统计 piggyback）
  const piggy = weekRuns.filter((r) => r.trigger === 'piggyback');
  const piggyOk = piggy.filter((r) => r.checks.every((c) => c.status !== 'fail' && c.status !== 'error')).length;
  const batch = piggy.length ? `${piggy.length} 批，全绿 ${piggyOk}（${Math.round((piggyOk / piggy.length) * 100)}%）` : '无记录';

  // ③ 源健康榜
  const c2States = Object.entries(ctx.state.alertState).filter(([k]) => k.startsWith('C2:'));
  const silent = c2States.filter(([, s]) => s.status === 'alerting');
  const newFail = silent.filter(([, s]) => s.firstFailedAt >= weekAgoIso);
  const recovered = c2States.filter(([, s]) => s.status === 'ok' && s.resolvedAt && s.resolvedAt >= weekAgoIso);
  const silentLine = silent.length
    ? silent.map(([k, s]) => `${k.slice(3)}（${(s.note ?? '').match(/静默 [\d.]+ 天/)?.[0] ?? '静默'}）`).join('、')
    : '无';

  // ④ 告警回顾
  const alerts = weekRuns.flatMap((r) => r.alertsSent ?? []);
  const byCheck = {};
  for (const a of alerts) byCheck[a.checkId] = (byCheck[a.checkId] ?? 0) + 1;
  const alertLine = alerts.length
    ? `${alerts.length} 次（${Object.entries(byCheck).map(([k, n]) => `${k}×${n}`).join('、')}）`
    : '0 次';

  // ⑤ Bark 受理失败计数（C7）
  const barkFails = ctx.state.barkDeliveries.filter((b) => b.at >= weekAgoIso && b.code !== '200' && b.code !== 'skipped');
  ctx.checks.push({ id: 'C7', status: barkFails.length ? 'fail' : 'ok', value: barkFails.length, threshold: '受理失败仅入周报', note: `近 7 天 Bark 受理失败 ${barkFails.length} 次` });

  const body = [
    `周期 ${bjDateKey(Date.now() - 6 * 86400000)} ~ ${today}`,
    `【晨批考勤】${att}`,
    `【日内批次】${batch}`,
    `【源健康】静默中 ${silent.length}：${silentLine}；本周新失效 ${newFail.length}；已恢复 ${recovered.length}${recovered.length ? `（${recovered.map(([k]) => k.slice(3)).join('、')}）` : ''}`,
    `【tldr 覆盖率】${c6.cov === null ? '近 24h 无样本' : `${Math.round(c6.cov * 100)}%（${c6.withTldr}/${c6.eligible}）`}`,
    `【告警回顾】本周即时告警 ${alertLine}`,
    `【Bark 受理】失败 ${barkFails.length} 次`,
    `—— 本周报即哨兵心跳：收到即哨兵存活。`,
  ].join('\n');

  const code = await barkPush(ctx, '📡 CyberFocus 哨兵周报', body);
  ctx.alertsSent.push({ checkId: 'WEEKLY', target: 'weekly-report', title: '📡 CyberFocus 哨兵周报', httpCode: code });
  ctx.checks.push({ id: 'WEEKLY', status: code === '200' || code === 'skipped' ? 'ok' : 'fail', value: null, threshold: null, note: `周报 Bark HTTP=${code}` });
  console.log(`\n[sentinel] 周报内容 ↓\n${body}\n`);
}

// ════════════════════════════════════════════════════════════════════════════
// 绝对时间闸 / 幂等 / 落盘 / 清理
// ════════════════════════════════════════════════════════════════════════════
async function waitUntilBeijing(hh) {
  if (process.env.SENTINEL_FORCE === '1') {
    console.log(`[sentinel] SENTINEL_FORCE=1，跳过绝对时间闸（目标北京 ${hh}:00）`);
    return;
  }
  const target = bjTargetMs(bjDateKey(), hh, 0);
  while (Date.now() < target) {
    const remain = target - Date.now();
    console.log(`[sentinel] 绝对时间闸：现在北京 ${bjClock()}，等待北京 ${String(hh).padStart(2, '0')}:00（剩 ${Math.ceil(remain / 60000)} 分钟）`);
    await sleep(Math.min(remain, 5 * 60 * 1000));
  }
  console.log(`[sentinel] 已到北京 ${String(hh).padStart(2, '0')}:00，开始判定`);
}
/** 双批兜底场景：等待期间另一批可能已判定并 push；判定前刷新检出，让 judgedDate 幂等跨 runner 生效 */
async function refreshFromOrigin() {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  try {
    await execFileAsync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: ROOT });
    console.log('[sentinel] 已 git pull 刷新（等待期间 main 可能被另一批推进）');
  } catch (e) {
    console.warn(`[sentinel] git pull 刷新失败（继续用当前检出）: ${String(e.message).slice(0, 120)}`);
  }
}

function appendRunRecord(ctx) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const p = resolve(RUNS_DIR, `${bjDateKey()}.json`);
  const arr = loadJson(p, []);
  arr.push({ ranAt: nowIso(), trigger: ctx.trigger, checks: ctx.checks, alertsSent: ctx.alertsSent });
  writeFileSync(p, JSON.stringify(arr, null, 2));
}
function cleanupRetention(state) {
  // runs/ 超 30 天清理
  const cutoff = bjDateKey(Date.now() - 30 * 86400000);
  try {
    for (const f of readdirSync(RUNS_DIR)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (m && m[1] < cutoff) { unlinkSync(resolve(RUNS_DIR, f)); console.log(`[sentinel] 清理过期 runs/${f}`); }
    }
  } catch { /* runs/ 不存在则忽略 */ }
  // dailyCounts 超 35 天清理；resolved 事故超 30 天清理
  for (const d of Object.keys(state.dailyCounts)) {
    if (d < bjDateKey(Date.now() - 35 * 86400000)) delete state.dailyCounts[d];
  }
  const incCut = new Date(Date.now() - 30 * 86400000).toISOString();
  state.openIncidents = state.openIncidents.filter((i) => i.status === 'open' || (i.resolvedAt ?? i.lastSeenAt) >= incCut);
}

// ════════════════════════════════════════════════════════════════════════════
// main
// ════════════════════════════════════════════════════════════════════════════
function parseTrigger() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^--trigger(?:=(.+))?$/);
    if (m) {
      const v = m[1] ?? args[i + 1];
      if (['piggyback', 'morning', 'weekly'].includes(v)) return v;
    }
  }
  console.error('用法: node scripts/sentinel.js --trigger=piggyback|morning|weekly');
  process.exit(2);
}

async function main() {
  const trigger = parseTrigger();
  console.log(`=== CyberFocus 健康哨兵 v1 ===`);
  console.log(`[sentinel] trigger=${trigger} 北京时间 ${bjDateKey()} ${bjClock()}`);
  mkdirSync(RUNS_DIR, { recursive: true });

  const ctx = { trigger, state: loadState(), checks: [], alertsSent: [] };

  if (trigger === 'morning' || trigger === 'weekly') {
    await waitUntilBeijing(trigger === 'morning' ? 8 : 21);
    await refreshFromOrigin();
    ctx.state = loadState();   // pull 后重读（另一批可能已判定）
    const today = bjDateKey();
    if (ctx.state.judged?.[trigger] === today && process.env.SENTINEL_FORCE !== '1') {
      console.log(`[sentinel] ${trigger} 当日(${today})已判定，幂等退出（双批兜底的第二批）`);
      return;
    }
  }

  const safe = async (name, fn) => {
    try { await fn(); }
    catch (e) {
      console.error(`[sentinel] ${name} 执行异常: ${e.message}`);
      ctx.checks.push({ id: name, status: 'error', value: null, threshold: null, note: String(e.message).slice(0, 200) });
    }
  };

  if (trigger === 'piggyback') {
    await safe('C2', () => runCheckC2(ctx));
    await safe('C3', () => runCheckC3(ctx));
    await safe('C5', () => runCheckC5(ctx));
    await safe('C6', () => runCheckC6(ctx));
  } else if (trigger === 'morning') {
    await safe('C1', () => runCheckC1(ctx));
    await safe('C4', () => runCheckC4(ctx));
    ctx.state.judged.morning = bjDateKey();
  } else if (trigger === 'weekly') {
    await safe('WEEKLY', () => runWeekly(ctx));
    ctx.state.judged.weekly = bjDateKey();
  }

  cleanupRetention(ctx.state);
  saveState(ctx.state);
  appendRunRecord(ctx);

  console.log('\n[sentinel] 检查结果汇总：');
  for (const c of ctx.checks) {
    const mark = { ok: '✅', fail: '❌', skip: '⏭️', error: '💥' }[c.status] ?? '·';
    console.log(`  ${mark} ${c.id} ${c.status}  ${c.value != null ? `value=${typeof c.value === 'string' ? c.value : JSON.stringify(c.value)}  ` : ''}${c.note ?? ''}`);
  }
  console.log(`[sentinel] 本次发送告警 ${ctx.alertsSent.length} 条${ctx.alertsSent.length ? '：' + ctx.alertsSent.map((a) => `${a.checkId}:${a.target}(HTTP=${a.httpCode})`).join('、') : ''}`);
  console.log('=== 哨兵运行完成 ===');
}

main().catch((err) => {
  console.error('[sentinel] Fatal:', err);
  process.exit(1);
});
