import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 10000 });
const MAX_NEW = Math.max(maxPerSource(), 5);

const FEEDS = [
  {
    sourceId: '量子位',
    url: 'https://www.qbitai.com/feed',
    fallbackUrl: null,
  },
  {
    sourceId: '雷锋网',
    url: 'https://www.leiphone.com/feed',
    fallbackUrl: null,
  },
];

// Keyword filter — only keep articles mentioning AI topics
const AI_KEYWORDS = [
  'AI', '人工智能', '大模型', 'LLM', '语言模型',
  'ChatGPT', 'Claude', 'GPT', 'Gemini', 'Grok', 'Llama', 'Mistral', 'DeepSeek',
  '机器学习', '深度学习', '神经网络', 'Transformer',
  '自然语言', 'NLP', '生成式', 'AIGC', '多模态',
  '强化学习', '智能体', 'Agent', '具身智能',
  'OpenAI', 'Anthropic', 'DeepMind', '智谱', '百川', '阶跃', '月之暗面', '零一万物',
];
const AI_RE = new RegExp(AI_KEYWORDS.join('|'), 'i');

function isAIRelated(title, abstract) {
  return AI_RE.test(title) || AI_RE.test(abstract ?? '');
}

async function fetchFeed(feed, processedIds) {
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch {
    if (!feed.fallbackUrl) return [];
    try {
      parsed = await parser.parseURL(feed.fallbackUrl);
    } catch (err) {
      throw new Error(`both URLs failed: ${err.message}`);
    }
  }

  const results = [];
  for (const item of parsed.items ?? []) {
    if (results.length >= MAX_NEW) break;

    const pubDate = item.isoDate || item.pubDate || null;
    if (!isRecentBJ(pubDate, 3)) continue;

    const titleEn = item.title?.trim() ?? '';
    if (!titleEn) continue;

    const abstract = item.contentSnippet || item.content || '';

    // Skip non-AI content
    if (!isAIRelated(titleEn, abstract)) continue;

    const canonicalId = `${feed.sourceId}:${slugify(item.link || titleEn)}`;
    if (processedIds && processedIds.has(canonicalId)) continue;

    results.push({
      id: canonicalId,
      slug: slugify(`${feed.sourceId}-${titleEn}`),
      source: feed.sourceId,
      sourceUrl: item.link || '',
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      titleEn,      // will be treated as Chinese title for translation step
      titleZh: null,
      abstractEn: abstract.slice(0, 400),
      abstractZh: null,
      authors: [feed.sourceId],
      institution: feed.sourceId,
      docType: 'Blog',
      category: 'social',
      score: 0,
      commentCount: 0,
      tags: [],
    });
  }
  return results;
}

export async function fetchChineseBlogs(processedIds, disabledIds = new Set()) {
  const all = [];
  const activeFeeds = FEEDS.filter((f) => !disabledIds.has(f.sourceId));
  for (const feed of activeFeeds) {
    try {
      console.log(`[chinese-blogs] Fetching ${feed.sourceId}...`);
      const items = await fetchFeed(feed, processedIds);
      console.log(`[chinese-blogs] ${feed.sourceId}: ${items.length} new articles`);
      all.push(...items);
    } catch (err) {
      console.warn(`[chinese-blogs] ${feed.sourceId} failed: ${err.message}`);
    }
  }
  return all;
}
