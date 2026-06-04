/**
 * Market data fetcher — Yahoo Finance chart API (no API key, via proxy).
 *
 * Provides real-time-ish quotes for indices / sector ETFs / stocks / rates /
 * commodities, with daily and ~weekly % change. Used by the local strategy-brief
 * generator so it no longer depends on a Claude Code routine's WebSearch.
 */

const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/** Fetch one symbol's 1-month daily series; returns {price, dayPct, weekPct} or null.
 *  Retries on transient failures so a network blip doesn't blank a whole table. */
async function fetchOne(symbol, attempt = 0) {
  try {
    const url = `${YF}${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta) throw new Error('no meta');

    // Use the ACTUAL daily close series for day/week change — NOT meta.chartPreviousClose,
    // which is the close BEFORE the whole 1-month window (would yield a ~monthly % mislabeled
    // as daily). Bug fixed 2026-06: it produced absurd "SMH +25% in a day" type values.
    const closes = (res.indicators?.quote?.[0]?.close ?? []).filter((x) => x != null);
    if (closes.length < 2) return null;
    const last    = closes[closes.length - 1];                 // most recent completed daily close
    const prevDay = closes[closes.length - 2];                 // prior trading day
    const wkAgo   = closes.length >= 6 ? closes[closes.length - 6] : closes[0]; // ~5 trading days back

    // Day change = most recent two daily bars (last vs prevDay). This is robust whether
    // the market is open (last = today's partial bar) or closed (last = today's final close).
    // Do NOT mix in regularMarketPrice — it equals `last` when closed, yielding a false 0%.
    const price   = meta.regularMarketPrice ?? last;  // for display only
    const dayPct  = prevDay ? ((last - prevDay) / prevDay) * 100 : null;
    const weekPct = wkAgo   ? ((last - wkAgo)   / wkAgo)   * 100 : null;

    return {
      price: Number(price?.toFixed(2)),
      dayPct: dayPct == null ? null : Number(dayPct.toFixed(2)),
      weekPct: weekPct == null ? null : Number(weekPct.toFixed(2)),
    };
  } catch {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      return fetchOne(symbol, attempt + 1);
    }
    return null;
  }
}

/** Watchlist grouped by category. */
export const WATCHLIST = {
  indices: [
    { sym: '^GSPC', name: 'S&P 500' },
    { sym: '^IXIC', name: 'Nasdaq' },
    { sym: '^DJI',  name: 'Dow' },
    { sym: '^RUT',  name: 'Russell 2000' },
  ],
  rates_fx: [
    { sym: '^TNX', name: '10Y 美债收益率' },
    { sym: '^TYX', name: '30Y 美债收益率' },
    { sym: 'DX-Y.NYB', name: '美元指数 DXY' },
  ],
  commodities: [
    { sym: 'BZ=F', name: 'Brent 原油' },
    { sym: 'CL=F', name: 'WTI 原油' },
    { sym: 'GC=F', name: '黄金' },
  ],
  sectors: [
    { sym: 'XLK', name: '科技' },
    { sym: 'SMH', name: '半导体' },
    { sym: 'XLU', name: '公用事业/电力' },
    { sym: 'XLE', name: '能源' },
    { sym: 'XLF', name: '金融' },
    { sym: 'IGV', name: '软件/SaaS' },
  ],
  stocks: [
    { sym: 'NVDA', name: 'Nvidia' }, { sym: 'AMD', name: 'AMD' },
    { sym: 'AVGO', name: 'Broadcom' }, { sym: 'TSM', name: 'TSMC' },
    { sym: 'MSFT', name: 'Microsoft' }, { sym: 'GOOGL', name: 'Alphabet' },
    { sym: 'AMZN', name: 'Amazon' }, { sym: 'META', name: 'Meta' },
    { sym: 'VST', name: 'Vistra' }, { sym: 'CEG', name: 'Constellation' },
    { sym: 'CRM', name: 'Salesforce' }, { sym: 'XOM', name: 'Exxon' },
    { sym: 'CVX', name: 'Chevron' },
  ],
};

/**
 * Fetch the whole watchlist. Returns { indices:[{name,sym,price,dayPct,weekPct}], ... }.
 * Concurrency-limited to be gentle on Yahoo.
 */
export async function fetchMarketData() {
  const groups = Object.entries(WATCHLIST);
  const out = {};
  for (const [group, items] of groups) {
    const results = [];
    // batches of 6
    for (let i = 0; i < items.length; i += 6) {
      const batch = items.slice(i, i + 6);
      const data = await Promise.all(batch.map(async (it) => {
        const q = await fetchOne(it.sym);
        return q ? { ...it, ...q } : { ...it, price: null, dayPct: null, weekPct: null };
      }));
      results.push(...data);
    }
    out[group] = results;
  }
  return out;
}

/**
 * Fetch an arbitrary ticker list → [{sym,name,price,dayPct,weekPct}].
 * Used by the sector deep-dive for its rotating per-sector ticker set.
 */
export async function fetchQuotes(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 6) {
    const batch = items.slice(i, i + 6);
    const data = await Promise.all(batch.map(async (it) => {
      const q = await fetchOne(it.sym);
      return q ? { ...it, ...q } : { ...it, price: null, dayPct: null, weekPct: null };
    }));
    out.push(...data);
  }
  return out;
}

/** Format an arbitrary quote list into lines for the LLM prompt. */
export function formatQuotes(quotes) {
  const fmt = (x) => (x == null ? 'n/a' : (x > 0 ? '+' : '') + x);
  return quotes.map((it) => `${it.name}(${it.sym}): 价 ${it.price ?? 'n/a'}, 日 ${fmt(it.dayPct)}%, 周 ${fmt(it.weekPct)}%`).join('\n');
}

/** Format market data into a compact digest string for the LLM prompt. */
export function formatMarketDigest(data) {
  const fmt = (x) => (x == null ? 'n/a' : (x > 0 ? '+' : '') + x);
  const line = (it) => `${it.name}(${it.sym}): 价 ${it.price ?? 'n/a'}, 日 ${fmt(it.dayPct)}%, 周 ${fmt(it.weekPct)}%`;
  const sec = (title, arr) => `【${title}】\n` + arr.map((it) => '  ' + line(it)).join('\n');
  return [
    sec('指数', data.indices),
    sec('利率/汇率', data.rates_fx),
    sec('大宗商品', data.commodities),
    sec('板块 ETF', data.sectors),
    sec('重点个股', data.stocks),
  ].join('\n\n');
}
