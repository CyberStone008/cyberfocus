import { describe, it, expect } from 'vitest';
import { isJunkTitle, dedupeNews } from './dedupe';
import type { Article } from '../types/article';

// 构造最小 Article（只填 dedupe 关心的字段，其余给安全默认）。
function mk(p: Partial<Article>): Article {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    slug: p.slug ?? 's',
    source: p.source ?? 'Google AI News',
    sourceUrl: p.sourceUrl ?? '',
    publishedAt: p.publishedAt ?? '2026-06-09T00:00:00Z',
    titleEn: p.titleEn ?? '',
    titleZh: p.titleZh ?? null,
    abstractEn: p.abstractEn ?? '',
    abstractZh: p.abstractZh ?? null,
    authors: p.authors ?? [],
    ...p,
  } as Article;
}

describe('isJunkTitle — 纯日期/空标题过滤（Google News 混入的"每日聚合页"）', () => {
  it('纯日期 "6/9/2026" 判为垃圾', () => {
    expect(isJunkTitle('6/9/2026')).toBe(true);
  });
  it('其它纯日期格式同样判垃圾', () => {
    expect(isJunkTitle(undefined, '2026年9月6日')).toBe(true);
    expect(isJunkTitle('2026-09-06')).toBe(true);
    expect(isJunkTitle('September 6, 2026')).toBe(true);
  });
  it('空标题判垃圾', () => {
    expect(isJunkTitle('', '')).toBe(true);
    expect(isJunkTitle(null, null)).toBe(true);
  });
  it('正常标题不判垃圾', () => {
    expect(isJunkTitle('OpenAI releases GPT-6')).toBe(false);
    expect(isJunkTitle(undefined, 'OpenAI 发布新模型')).toBe(false);
  });
});

describe('dedupeNews — 同一新闻并簇（保守阈值）', () => {
  it('同实体高相似的两条 → 并为一簇，代表带 dupCount>=2', () => {
    const arts = [
      mk({ id: 'a', titleEn: 'OpenAI and Anthropic Announce New Safety Framework for Frontier Models' }),
      mk({ id: 'b', titleEn: 'OpenAI, Anthropic Unveil Joint Safety Framework for Frontier AI Models' }),
    ];
    const out = dedupeNews(arts);
    expect(out.length).toBe(1); // 两条并成一条代表
    expect(out[0].dupCount).toBeGreaterThanOrEqual(2);
  });

  it('同一公司的两条不同新闻 → 不并（守保守阈值，宁漏勿误并）', () => {
    const arts = [
      mk({ id: 'a', titleEn: 'OpenAI Releases GPT-6 With Improved Reasoning Capabilities' }),
      mk({ id: 'b', titleEn: 'OpenAI Hires Former Apple Designer To Lead Hardware Effort' }),
    ];
    const out = dedupeNews(arts);
    expect(out.length).toBe(2); // 不并簇
    expect(out.every((a) => a.dupCount === undefined)).toBe(true);
  });

  it('超出 ±4 天时间窗的同题材不并（时间窗约束）', () => {
    const arts = [
      mk({ id: 'a', publishedAt: '2026-06-01T00:00:00Z', titleEn: 'OpenAI and Anthropic Announce New Safety Framework for Frontier Models' }),
      mk({ id: 'b', publishedAt: '2026-06-09T00:00:00Z', titleEn: 'OpenAI, Anthropic Unveil Joint Safety Framework for Frontier AI Models' }),
    ];
    const out = dedupeNews(arts);
    expect(out.length).toBe(2); // 相隔 8 天 > 窗口，不并
  });
});

describe('dedupeNews — 代表条优先级', () => {
  it('有 tldrZh 的条目优先当代表（repScore +100 压倒一切）', () => {
    const arts = [
      mk({ id: 'plain', titleEn: 'OpenAI and Anthropic Announce New Safety Framework for Frontier Models' }),
      mk({ id: 'rich', titleEn: 'OpenAI, Anthropic Unveil Joint Safety Framework for Frontier AI Models', tldrZh: '两家公司联合发布前沿模型安全框架' }),
    ];
    const out = dedupeNews(arts);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('rich'); // 带 tldrZh 的当代表
    expect(out[0].dupCount).toBe(2);
  });

  it('国内可直达(非 Google News)优先于 Google News 代表', () => {
    const arts = [
      mk({ id: 'google', source: 'Google AI News', sourceUrl: 'https://news.google.com/abc', titleEn: 'OpenAI and Anthropic Announce New Safety Framework for Frontier Models' }),
      mk({ id: 'direct', source: '量子位', sourceUrl: 'https://www.qbitai.com/x', titleEn: 'OpenAI, Anthropic Unveil Joint Safety Framework for Frontier AI Models' }),
    ];
    const out = dedupeNews(arts);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('direct'); // 非 Google 源当代表
  });
});
