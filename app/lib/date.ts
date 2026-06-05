// Feed date grouping — always in Beijing time (UTC+8, China has no DST).
//
// publishedAt is stored as UTC (`...Z`). Slicing the raw ISO string (the old
// `iso.slice(0,10)`) yields the UTC date, which buckets evening-US posts into
// the wrong day for a China audience: e.g. 2026-06-04T20:30Z is actually
// 2026-06-05 04:30 Beijing and should land under "今天" 6/5, not "昨天" 6/4.
// A fixed +8h offset is deterministic across the Vercel build server (UTC) and
// the browser, so build-time and client-time keys always agree.
const BJ_OFFSET_MS = 8 * 3600 * 1000;

/** YYYY-MM-DD of the given instant, in Beijing time. */
export function getDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + BJ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date key (Beijing). */
export function todayKey(): string {
  return getDateKey(new Date().toISOString());
}

/** Yesterday's date key (Beijing). */
export function yesterdayKey(): string {
  return getDateKey(new Date(Date.now() - 86400000).toISOString());
}

/** Whole-day difference (Beijing) between today and the given date key. */
export function daysAgoFromKey(dateKey: string): number {
  const a = new Date(`${todayKey()}T00:00:00Z`).getTime();
  const b = new Date(`${dateKey}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86400000);
}
