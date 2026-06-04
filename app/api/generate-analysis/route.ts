export const dynamic = 'force-static'; // required for output:'export' static builds
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { deepseekChat } from '../../lib/deepseek-server';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');

/* ── Long-form generation via DeepSeek (replaces the old claude CLI spawn) ── */
async function runClaude(prompt: string, timeoutMs = 300_000): Promise<string> {
  const text = await deepseekChat(prompt, { maxTokens: 8000, timeoutMs });
  return text.trim();
}

/* ── Fetch full article content from source URL ── */
interface Section {
  heading: string;   // original heading text
  level: number;     // 1=h1, 2=h2, 3=h3
  body: string;      // full paragraph text for this section
}

interface FetchResult {
  sections: Section[];
  fullText: string;   // concatenated plain text of all sections
  hasFullContent: boolean;  // true = fetched real article body; false = JS-only/failed
}

async function fetchArticleContent(sourceUrl: string): Promise<FetchResult | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Remove scripts, styles, nav, footer to get content-only HTML
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');

    // Skip JS-only pages (no real content in static HTML)
    const bodyText = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (bodyText.length < 500) return null;

    const sections: Section[] = [];
    const SKIP_PATTERNS = /related|newsletter|subscribe|cookie|privacy|terms|sign up|share this|follow us/i;

    // Extract ordered sections: find each heading, then collect following paragraphs
    const tokenRe = /<(h[123])[^>]*>([\s\S]*?)<\/h[123]>|<p[^>]*>([\s\S]*?)<\/p>/gi;
    let current: Section | null = null;

    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(cleaned)) !== null) {
      if (match[1]) {
        const level = parseInt(match[1][1]);
        const heading = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!heading || heading.length < 3) continue;
        if (SKIP_PATTERNS.test(heading)) continue;
        if (current) sections.push(current);
        current = { heading, level, body: '' };
      } else if (match[3]) {
        const para = match[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (para.length < 20) continue;
        if (current) {
          // Accumulate full body — no artificial cap
          current.body += (current.body ? '\n\n' : '') + para;
        } else {
          // Paragraphs before first heading — create an intro section
          current = { heading: 'Introduction', level: 2, body: para };
        }
      }
    }
    if (current) sections.push(current);

    // Keep only h2/h3 sections with meaningful body text
    const meaningful = sections.filter(
      (s) => (s.level === 2 || s.level === 3) && s.body.length > 40
    );

    if (meaningful.length < 2) return null;

    const fullText = meaningful
      .map((s) => `### ${s.heading}\n\n${s.body}`)
      .join('\n\n---\n\n');

    // Consider it "full content" if we have substantial text (>1500 chars across sections)
    const totalChars = meaningful.reduce((sum, s) => sum + s.body.length, 0);
    const hasFullContent = totalChars > 1500;

    return { sections: meaningful, fullText, hasFullContent };
  } catch {
    return null;
  }
}

/* ── Build prompt ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrompt(article: any, fetchResult: FetchResult | null): string {
  const hasAbstract = (article.abstractEn ?? '').trim().length > 30;

  const metaBlock = `## 文章信息
- 标题：${article.titleEn}
- 来源：${article.source}
- 作者：${article.authors?.join(', ') ?? '未知'}
- 原文链接：${article.sourceUrl}
${hasAbstract ? `- 英文摘要：${article.abstractEn}` : ''}
${article.abstractZh ? `- 中文摘要（参考）：${article.abstractZh}` : ''}`;

  const formatRules = `## 格式规范

每个章节使用 H2（中文标题）+ H3（英文原标题）双语标题格式：

\`\`\`markdown
## 中文章节标题
### English Section Heading

正文内容……
\`\`\`

语言要求：
- 以原文第一人称/作者视角叙述（"我们发现……"、"本文提出……"）
- 中文自然流畅，保持原文语气，不要写成"该文指出……"的第三人称总结腔
- 首次出现的专业术语加括注：如"强化学习（Reinforcement Learning）"
- 数字、百分比、模型名称等与原文完全一致，不得篡改
- 按需使用 blockquote 补充背景：\`> 💡 **背景**：…\`

输出要求：
直接输出 Markdown 正文，第一行必须是 \`## \` 开头的中文章节标题，不要添加 frontmatter、代码块包裹或任何解释性前言。`;

  if (fetchResult && fetchResult.hasFullContent) {
    // Full article text available — faithful condensed translation (精译)
    return `你是 AI 研究领域的专业中文译者。以下是一篇英文文章的完整原文（按章节整理）。请对每个章节进行**精译**：忠实于原文结构和信息，用流畅的中文呈现，长度约为原文的 60-70%，保留所有关键数据、论点和示例，不添加也不删减核心内容。

${metaBlock}

## 原文内容

${fetchResult.fullText}

## 精译要求

- **严格按照原文章节顺序**，一节对应一节，不合并、不拆分、不新增章节
- 标题直接翻译自原文标题，贴近原意
- 正文精译原文：保留所有数据、论点、示例；可适度压缩铺垫性表述
- 原文语气是什么就用什么语气（介绍性→陈述，研究性→第一人称，评论性→观点直述）
- 数字与原文完全一致

${formatRules}`;
  }

  if (fetchResult && fetchResult.sections.length >= 2) {
    // Partial structure available — section headings with limited body text
    const structureBlock = fetchResult.sections
      .map((s) => `### ${s.heading}\n${s.body.slice(0, 500)}${s.body.length > 500 ? '…（内容截断）' : ''}`)
      .join('\n\n---\n\n');

    return `你是 AI 研究领域的专业中文译者。以下是一篇文章的章节结构，每节包含部分原文内容（可能不完整）。请基于已有内容对每个章节进行**精译**，忠实呈现已获取的信息，对截断部分可根据上下文合理补完，但不得捏造具体数据。

${metaBlock}

## 原文章节结构（部分内容）

${structureBlock}

## 精译要求

- 严格按照原文章节顺序，逐节精译
- 每节 150-250 字，充分利用已有原文内容
- 对于内容截断的章节，可根据标题和上下文合理延伸，但不捏造具体数字
- 语气忠实原文

${formatRules}`;
  }

  // Fallback: only metadata/abstract available — abstract-based 精译
  return `你是 AI 研究领域的专业中文译者。原文页面无法直接获取全文（可能需要 JavaScript 渲染或登录），以下仅有文章元数据和摘要。请基于摘要和标题，对文章进行**基于摘要的精译扩写**：忠实于摘要所传递的信息，推断文章最自然的叙述结构，不捏造摘要未提及的具体数据。

${metaBlock}

## 精译扩写要求

根据文章类型选择最自然的章节结构（不要套用固定模板）：
- 产品/功能发布：背景动机 → 核心能力介绍 → 使用场景 → 获取方式
- 研究论文：问题与动机 → 方法 → 实验结果 → 结论与影响
- 政策/安全报告：背景 → 核心主张 → 关键发现/措施 → 影响与展望
- 技术博客：背景 → 技术方案 → 实践效果 → 总结

要求：
- 至少 4 个章节，每节 150-250 字
- 信息严格基于摘要，不捏造未提及的数字或结论
- 语气符合原文类型

${formatRules}`;
}

/* ── POST /api/generate-analysis ── */
export async function POST(request: NextRequest) {
  // Admin-only: disabled on public (read-only) deployments.
  if (process.env.NEXT_PUBLIC_PUBLIC_MODE === '1') {
    return NextResponse.json({ error: 'Disabled on public deployment' }, { status: 403 });
  }
  let id: string;
  try {
    ({ id } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing article id' }, { status: 400 });
  }

  // Load articles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let articles: any[];
  try {
    articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));
  } catch {
    return NextResponse.json({ error: 'Cannot read articles.json' }, { status: 500 });
  }

  const article = articles.find((a: { id: string }) => a.id === id);
  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  // Already generated — return immediately
  if (article.contentMd) {
    return NextResponse.json({ success: true, slug: article.slug });
  }

  // Try to fetch full article content
  console.log(`[generate-analysis] Fetching content: ${article.sourceUrl}`);
  const fetchResult = await fetchArticleContent(article.sourceUrl);
  const totalChars = fetchResult?.sections.reduce((s, sec) => s + sec.body.length, 0) ?? 0;
  console.log(`[generate-analysis] Sections: ${fetchResult?.sections.length ?? 0}, chars: ${totalChars}, hasFullContent: ${fetchResult?.hasFullContent ?? false}`);

  // Determine mode label
  let modeLabel: string;
  if (fetchResult?.hasFullContent) {
    modeLabel = '> 📖 **精译自原文** · 已获取原文全文，按章节忠实精译\n\n';
  } else if (fetchResult && fetchResult.sections.length >= 2) {
    modeLabel = '> 📄 **精译自原文（部分内容）** · 已获取原文章节结构，基于可用内容精译\n\n';
  } else {
    modeLabel = '> 📝 **基于摘要精译** · 原文不可直接获取，基于摘要扩写\n\n';
  }

  // Generate via Claude CLI
  const prompt = buildPrompt(article, fetchResult);
  let contentMd: string;
  try {
    contentMd = await runClaude(prompt);
  } catch (err) {
    console.error('[generate-analysis] Claude error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // Prepend mode label
  contentMd = modeLabel + contentMd;

  // Write back to articles.json
  article.contentMd = contentMd;
  article.translator = {
    model: 'Claude Sonnet 4.6',
    translatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
  } catch {
    return NextResponse.json({ error: 'Failed to save articles.json' }, { status: 500 });
  }

  return NextResponse.json({ success: true, slug: article.slug, contentMd });
}
