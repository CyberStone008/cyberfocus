import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from './claude-cli.js';
import { fetchArticleWithImages } from './fetch-with-images.js';

const client = isCliMode()
  ? claudeCliClient
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Source priority for featured selection (higher = preferred)
const SOURCE_PRIORITY = {
  'Anthropic Blog': 5,
  'OpenAI Blog': 4,
  'HuggingFace Daily': 3,
  'arXiv cs.AI': 2,
};

/**
 * Pick up to `count` articles from newItems as today's featured.
 * Priority: source tier → newest by publishedAt.
 * Tries to diversify by source (no two picks from the same source unless unavoidable).
 */
export function pickFeatured(newItems, count = 3) {
  if (newItems.length === 0) return [];

  const sorted = [...newItems].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? 1;
    const pb = SOURCE_PRIORITY[b.source] ?? 1;
    if (pa !== pb) return pb - pa;
    return new Date(b.publishedAt) - new Date(a.publishedAt);
  });

  // First pass: pick best from each source to maximise diversity
  const usedSources = new Set();
  const picks = [];
  for (const item of sorted) {
    if (picks.length >= count) break;
    if (!usedSources.has(item.source)) {
      picks.push(item);
      usedSources.add(item.source);
    }
  }
  // Second pass: fill remaining slots if needed
  if (picks.length < count) {
    for (const item of sorted) {
      if (picks.length >= count) break;
      if (!picks.includes(item)) picks.push(item);
    }
  }

  return picks;
}

/**
 * Generate a full bilingual structured article in Markdown,
 * based on title + abstract (used when source HTML is inaccessible).
 *
 * The output follows article-display-spec.md:
 *   ## 中文标题
 *   ### English Title
 *   ...body sections...
 */
export async function generateFeaturedContent(article) {
  const hasAbstract = article.abstractEn && article.abstractEn.trim().length > 30;

  const prompt = `你是 AI 研究领域的资深中文科技撰稿人。请根据以下论文/博客文章的元数据，撰写一篇结构化的中文解读文章，用于展示给中文读者。

## 文章元数据
- 标题（英文）：${article.titleEn}
- 来源：${article.source}
- 作者：${article.authors.join(', ')}
- 原文链接：${article.sourceUrl}
- 类型：${article.docType ?? 'Blog'}
${hasAbstract ? `- 英文摘要：${article.abstractEn}` : ''}

## 输出规范

请生成一篇完整的 Markdown 解读文章，严格遵循以下格式：

1. **每个 H2 章节必须中英双语**：
   \`\`\`
   ## 中文章节标题
   ### English Section Title
   \`\`\`

2. **文章结构**（根据内容灵活调整，至少包含 4 个章节）：
   - 核心贡献 / Key Contributions
   - 研究背景 / Background
   - 技术方法 / Technical Approach（如有）
   - 主要发现 / Key Findings
   - 意义与影响 / Significance & Impact

3. **语言风格**：
   - 中文自然流畅，避免直译腔
   - 首次出现的专业术语：中文（English 括注）
   - 后续使用中文即可

4. **特殊元素**（按需使用）：
   - 重要提示：\`> ⚠️ **注意**：...\`
   - 补充说明：\`> 💡 **背景**：...\`

5. **内容要求**：
   - 每个章节 100-200 字
   - 信息准确，不要捏造未提及的具体数据
   - 如摘要信息不足，以公开已知的研究背景补充

## 输出要求
直接输出 Markdown 正文，第一行是 \`## \` 开头的中文章节标题，不要添加 frontmatter、代码块包裹或任何解释文字。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const contentMd = response.content[0].text.trim();

  return {
    contentMd,
    translator: {
      model: 'Claude Sonnet 4.6',
      translatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetch any article's source content as Markdown with images preserved.
 * Works for any URL; falls back to null on failure.
 *
 * Replaces the old Anthropic-only fetchAnthropicSourceMd.
 */
export async function fetchAnySourceMd(article) {
  try {
    return await fetchArticleWithImages(article.sourceUrl);
  } catch {
    return null;
  }
}

/** @deprecated Use fetchAnySourceMd instead */
export async function fetchAnthropicSourceMd(article) {
  return fetchAnySourceMd(article);
}
