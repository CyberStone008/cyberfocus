/**
 * podcast-analysis.js
 *
 * Fetches a Lex Fridman episode transcript and asks Claude to produce
 * a structured Chinese reading guide (解读) stored as contentMd.
 *
 * Usage:
 *   import { generatePodcastAnalysis } from './translate/podcast-analysis.js';
 *   const { contentMd } = await generatePodcastAnalysis(episode);
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from './claude-cli.js';
import { deepseekClient, isDeepSeekMode } from './deepseek.js';

// Backend priority (same as translate/claude.js): DeepSeek > Claude CLI > Anthropic SDK.
const client = isDeepSeekMode()
  ? deepseekClient
  : isCliMode()
    ? claudeCliClient
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Max chars of transcript to send to Claude (~25k chars ≈ 6k tokens — keeps CLI calls fast)
const MAX_TRANSCRIPT_CHARS = 25_000;

/** Extract the transcript URL from the episode abstractEn field */
export function extractTranscriptUrl(episode) {
  if (!episode.abstractEn) return null;
  const m = episode.abstractEn.match(/Transcript:\s*(https?:\/\/lexfridman\.com\/\S+)/i);
  return m ? m[1].split(' ')[0].replace(/[.,)]+$/, '') : null;
}

/** Fetch + extract plain text from a Lex Fridman transcript page */
export async function fetchTranscriptText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract main content between common content wrappers
    // Try to get the entry-content / article / main body
    const contentMatch =
      html.match(/<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    const rawHtml = contentMatch ? contentMatch[1] : html;

    // Strip scripts, styles, nav elements
    const stripped = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '');

    // Strip HTML tags, decode entities
    const text = stripped
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Use Claude to generate a structured Chinese analysis from the transcript */
export async function generatePodcastAnalysis(episode) {
  const transcriptUrl = extractTranscriptUrl(episode);

  let transcriptText = '';
  if (transcriptUrl) {
    try {
      console.log(`[podcast-analysis] Fetching transcript: ${transcriptUrl}`);
      const raw = await fetchTranscriptText(transcriptUrl);
      transcriptText = raw.slice(0, MAX_TRANSCRIPT_CHARS);
      console.log(`[podcast-analysis] Transcript: ${transcriptText.length} chars`);
    } catch (err) {
      console.warn(`[podcast-analysis] Transcript fetch failed: ${err.message}`);
    }
  }

  const hasTranscript = transcriptText.length > 500;
  // 中英文源通吃：优先中文标题/简介（中文源），否则英文（Lex 等）。
  const title = episode.titleZh || episode.titleEn || '';
  const intro = (episode.abstractZh || episode.abstractEn || '').slice(0, 800);
  const guestNames = extractGuests(episode.titleEn || '');
  const episodeNum = (String(episode.titleEn || '').match(/^#(\d+)/) || [])[1] ?? '';

  // 数据溯源铁律：有逐字稿 → 依文稿深读；无逐字稿 → 只能基于标题+简介克制概述，严禁编造。
  const transcriptSection = hasTranscript
    ? `\n\n## 对话文稿（节选）\n${transcriptText}`
    : '';

  const grounding = hasTranscript
    ? `本集提供了对话文稿节选，请严格依据文稿内容分析，不要编造文稿里没有的内容。`
    : `⚠️ 本集没有逐字稿，你掌握的真实信息只有上方的「标题」和「节目简介」两项。必须严守数据溯源铁律：
- 只能基于标题与简介中明确出现的主题做合理概述；
- **严禁编造**嘉宾的具体引语、数字、估值、市值、生平经历、未在简介中出现的事件或观点；
- 对标题列出的话题，可解释"这类话题通常关注什么、为何重要"，但要让读者看得出这是基于公开主题的合理展开，而非转述原话；
- 简介信息不足时，宁可写得概括、克制、留白，也绝不为了丰富而虚构细节。`;

  const formatRich = `## 本集概述

[2-3 段，介绍嘉宾背景、本集主题、为什么值得关注。]

## 主要话题

[根据文稿划分出 4-7 个主要话题，每个用三级标题 ### 1. [话题]，下接 2-4 段详述核心观点与重要细节。]

## 金句与核心观点

[bullet list 列出 4-6 条最值得记住的观点或金句，用中文复述。]

## 适合谁听

[1-2 段，说明最适合哪类听众、最值得深入的部分。]`;

  const formatLite = `## 本集概述

[2-3 段，基于标题与简介，概述本集主题、嘉宾（仅简介/标题已给出的身份）、为何值得关注。不要编造细节。]

## 本集可能涵盖的话题

[把标题/简介中点到的话题逐条展开（### 1. [话题] 形式），每条 1-2 段，解释"这一主题通常关注什么、为何重要"。明确是基于公开主题的合理展开，不要伪造嘉宾原话或具体数字。]

## 适合谁听

[1-2 段，说明最适合哪类听众。]`;

  const prompt = `你是一位专业的播客内容分析师，擅长将长播客提炼为结构清晰的中文解读。

## 任务
为以下《${episode.source}》播客单集生成中文解读，帮助中文读者快速判断是否值得收听原版。

## 数据来源约束（最重要，优先级高于"内容要丰富"）
${grounding}

## 单集信息
${episodeNum ? `- 编号：#${episodeNum}\n` : ''}- 标题：${title}
- 嘉宾：${guestNames || '（见标题）'}
- 时长：${episode.duration ?? '未知'}
- 发布日期：${episode.publishedAt?.slice(0, 10) ?? ''}
- 节目简介：${intro || '（无简介）'}
${transcriptSection}

## 输出格式要求
请输出一篇 Markdown 文章，严格遵守以下结构：

\`\`\`
${hasTranscript ? formatRich : formatLite}
\`\`\`

重要说明：
- 全部使用简体中文，专有名词（人名、品牌、技术术语）保留英文
- 不要在文章开头重复标题
- 再次强调：${hasTranscript ? '依据文稿，不要外推编造' : '只就标题与简介合理展开，绝不编造具体引语、数字与生平'}`;

  console.log(`[podcast-analysis] Generating analysis for: ${episode.titleEn}`);

  const res = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 6000,
    _timeoutMs: 480_000,   // 8 min — podcast analysis can be slow with transcript
    messages: [{ role: 'user', content: prompt }],
  });

  let contentMd = res.content[0].text.trim();
  // 无逐字稿时附上来源声明，让读者明确这是基于标题+简介的整理，而非转述全集。
  if (!hasTranscript) {
    contentMd += `\n\n---\n\n> ℹ️ 本解读基于节目标题与官方简介由 AI 整理，未获取完整文稿；具体观点、数据与引语请以[原节目](${episode.sourceUrl || ''})为准。`;
  }
  return { contentMd, analyzedAt: new Date().toISOString() };
}

/** Extract guest name(s) from episode title like "#496 – FFmpeg: ..." or "#494 – Jensen Huang: ..." */
function extractGuests(titleEn) {
  if (!titleEn) return '';
  // Pattern: "#NNN – Guest Name: Topic"
  const m = titleEn.match(/^#\d+\s+[–-]\s+([^:]+):/);
  if (m) return m[1].trim();
  // Pattern: "#NNN – Topic" (no colon = topic-only title)
  const m2 = titleEn.match(/^#\d+\s+[–-]\s+(.+)/);
  return m2 ? m2[1].trim() : '';
}
