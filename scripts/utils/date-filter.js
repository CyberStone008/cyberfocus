/**
 * Today's date in Beijing time (UTC+8), as YYYY-MM-DD.
 */
export function todayBJ() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * True when an ISO date string (or Date) lands on today's Beijing date.
 * Returns false on null/invalid input.
 */
export function isTodayBJ(input) {
  if (!input) return false;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return false;
  const iso = new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return iso === todayBJ();
}

/**
 * Max items per source, configurable via env. Default 2.
 */
export function maxPerSource() {
  const n = Number(process.env.MAX_PER_SOURCE);
  return Number.isFinite(n) && n > 0 ? n : 2;
}
