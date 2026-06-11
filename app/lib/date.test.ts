import { describe, it, expect } from 'vitest';
import { getDateKey, todayKey, yesterdayKey, daysAgoFromKey } from './date';

// 这些断言锁死「日期分组必须按北京时间(UTC+8)」事故的根因：
// 原本各 feed 用 iso.slice(0,10) 截 UTC 日期，导致美国晚间发布(...Z)被错分到前一天，
// 早上看「今天」几乎空（曾只剩 3 条，实应 32 条）。详见 AGENTS.md〈日期分组必须按北京时间〉。
describe('getDateKey — 北京时间(UTC+8)分桶', () => {
  it('美国晚间 20:30Z 已跨日到北京次日 → 必须归次日，不是 UTC 当天（"今天只 3 条"事故根因）', () => {
    // 2026-06-04T20:30Z = 北京 2026-06-05 04:30，应落「今天」6/5，而非「昨天」6/4
    expect(getDateKey('2026-06-04T20:30:00Z')).toBe('2026-06-05');
    expect(getDateKey('2026-06-04T20:30:00Z')).not.toBe('2026-06-04');
  });

  it('UTC 当日白天的时刻仍是同一北京日（不跨日）', () => {
    // 2026-06-04T10:00Z = 北京 2026-06-04 18:00，仍是 6/4
    expect(getDateKey('2026-06-04T10:00:00Z')).toBe('2026-06-04');
  });

  it('北京日界点：UTC 16:00 正是北京次日 00:00 的边界', () => {
    // 15:59:59Z → 北京 23:59:59 当日；16:00:00Z → 北京次日 00:00:00
    expect(getDateKey('2026-06-04T15:59:59Z')).toBe('2026-06-04');
    expect(getDateKey('2026-06-04T16:00:00Z')).toBe('2026-06-05');
  });

  it('跨月边界：6/30 23:00Z(北京 7/1 07:00) 归到 7 月', () => {
    expect(getDateKey('2026-06-30T23:00:00Z')).toBe('2026-07-01');
  });
});

describe('todayKey / yesterdayKey', () => {
  it('yesterdayKey 恰好是 todayKey 的前一天（whole-day 差为 1）', () => {
    expect(daysAgoFromKey(yesterdayKey())).toBe(1);
    expect(daysAgoFromKey(todayKey())).toBe(0);
  });

  it('todayKey 形如 YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysAgoFromKey — 整日差', () => {
  // 从「北京今天的正午 UTC 锚点」(todayKey()T12:00:00Z，=北京 20:00 当日)按整日步进，
  // 再 getDateKey 回算 N 天前/后的日期键。锚到北京 todayKey 而非 UTC 当日，避免 UTC 16:00 后
  // 跨日导致的 off-by-one；且全程走 getDateKey，不裸截 UTC 日期串（validate-data 会扫那个坑）。
  const keyDaysFromNow = (n: number) =>
    getDateKey(new Date(new Date(`${todayKey()}T12:00:00Z`).getTime() + n * 86400000).toISOString());

  it('给定历史日期键返回正确的整数天数差', () => {
    expect(daysAgoFromKey(keyDaysFromNow(-7))).toBe(7);
    expect(daysAgoFromKey(keyDaysFromNow(-1))).toBe(1);
  });

  it('未来日期键返回负数', () => {
    expect(daysAgoFromKey(keyDaysFromNow(1))).toBe(-1);
  });
});
