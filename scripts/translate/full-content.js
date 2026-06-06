import Anthropic from '@anthropic-ai/sdk';
import { sleep } from '../utils/rate-limiter.js';
import { claudeCliClient, isCliMode } from './claude-cli.js';
import { deepseekClient, isDeepSeekMode } from './deepseek.js';

// Backend priority (same as translate/claude.js): DeepSeek > Claude CLI > Anthropic SDK.
const client = isDeepSeekMode()
  ? deepseekClient
  : isCliMode()
    ? claudeCliClient
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Translate a full article's Markdown content into Chinese
 * following the article-display-spec.md standard.
 *
 * Used for high-value sources (Anthropic, OpenAI, DeepMind blog posts).
 * NOT used for arXiv/HuggingFace papers (those only get title+abstract).
 */
export async function translateFullContent(article, sourceMarkdown) {
  const prompt = `你是专业的 AI 研究领域中英双语翻译专家。请将以下英文文章翻译成中文，严格遵循展示规范：

## 翻译规范

1. **章节标题双语展示**：每个 H2/H3 标题都要中英双语
   - 中文标题作为 H2: \`## 中文标题\`
   - 英文原标题作为 H3（紧跟 H2 之下）: \`### English Title\`

2. **术语处理**：
   - 产品/品牌名保留英文：Claude, Anthropic, GitHub, arXiv, HuggingFace
   - 首次出现的技术术语：中文（English）括注
   - 后续使用中文即可

3. **格式保留**：
   - 代码块原样保留（变量名、API 不翻译，注释可翻译）
   - 数学公式（LaTeX）不变
   - **图片行必须完整保留在原位置**（格式：!\[alt\](url)），只可翻译 alt 文字，URL 绝对不能修改
   - 链接路径不变
   - 列表层级、表格结构保持一致

4. **风格要求**：
   - 语气自然，避免直译
   - 英文长段可拆为 2-3 个中文段
   - 使用中文习惯的过渡词

5. **特殊标记**：
   - 译者注使用 blockquote：\`> 💡 **译者注**：...\`
   - 重要提示：\`> ⚠️ **注意**：...\`

## 文章元数据
- 原标题：${article.titleEn}
- 作者：${article.authors.join(', ')}
- 来源：${article.sourceUrl}

## 原文 Markdown

${sourceMarkdown}

## 输出要求

直接输出翻译后的 Markdown，不要包裹在代码块里，不要添加 frontmatter，不要添加任何解释文字。第一行应当是以 \`## \` 开头的中文章节标题。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6', // ignored by deepseekClient (uses deepseek-chat); only used by the Anthropic fallback
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  const translatedMd = response.content[0].text.trim();

  return {
    contentMd: translatedMd,
    translator: {
      // Reflect the ACTUAL backend — was hardcoded 'Claude Sonnet 4.6' even when
      // DeepSeek did the translation, so Anthropic/OpenAI blog 全文 mislabeled.
      model: isDeepSeekMode() ? 'DeepSeek' : isCliMode() ? 'Claude CLI' : 'Claude Sonnet 4.6',
      translatedAt: new Date().toISOString(),
    },
  };
}

export async function translateFullContentBatch(articles, fetchSourceContent) {
  const results = [];
  for (const article of articles) {
    try {
      console.log(`[full-translate] Translating: ${article.titleEn}`);
      const sourceMarkdown = await fetchSourceContent(article);
      if (!sourceMarkdown) {
        console.warn(`[full-translate] No source content for ${article.id}`);
        results.push(article);
        continue;
      }
      const translated = await translateFullContent(article, sourceMarkdown);
      results.push({ ...article, ...translated });
      await sleep(2000); // polite delay
    } catch (err) {
      console.warn(`[full-translate] Failed for ${article.id}: ${err.message}`);
      results.push(article);
    }
  }
  return results;
}
