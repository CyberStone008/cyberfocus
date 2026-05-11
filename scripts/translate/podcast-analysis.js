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

const client = isCliMode()
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
  const guestNames = extractGuests(episode.titleEn);
  const episodeNum = (episode.titleEn.match(/^#(\d+)/) || [])[1] ?? '';

  const transcriptSection = hasTranscript
    ? `\n\n## 对话文稿（节选）\n${transcriptText}`
    : `\n\n（文稿暂不可用，请根据标题和简介进行分析）`;

  const prompt = `你是一位专业的播客内容分析师，擅长将英文长播客提炼为结构清晰的中文解读。

## 任务
为以下 Lex Fridman 播客单集生成一篇完整的中文解读文章，帮助中文读者快速了解本集的核心内容，判断是否值得收听原版。

## 单集信息
- 编号：#${episodeNum}
- 标题：${episode.titleEn}
- 嘉宾：${guestNames || '（见标题）'}
- 时长：${episode.duration ?? '未知'}
- 发布日期：${episode.publishedAt?.slice(0, 10) ?? ''}
- 英文简介：${(episode.abstractEn ?? '').slice(0, 500)}
${transcriptSection}

## 输出格式要求

请输出一篇 Markdown 文章，严格遵守以下结构：

\`\`\`
## 本集概述

[2-3 段，介绍嘉宾背景、本集主题、为什么值得关注。全部中文。]

## 主要话题

[根据对话内容，划分出 4-7 个主要话题。每个话题用三级标题，格式如下：]

### 1. [话题中文标题]

[2-4 段详细介绍该话题的主要内容、核心观点、重要细节。]

### 2. [话题中文标题]

...

## 金句与核心观点

[用 bullet list 列出 4-6 条最值得记住的观点或金句，用中文复述。]

## 适合谁听

[1-2 段，说明这集最适合哪类读者/听众，以及最值得深入了解的部分。]
\`\`\`

重要说明：
- 全部使用简体中文，专有名词（人名、品牌、技术术语）保留英文
- 话题划分要有逻辑，体现对话的实际流程
- 深度挖掘内容，不要泛泛而谈
- 如果文稿中有具体数据、故事、例子，请引用
- 不要在文章开头重复标题`;

  console.log(`[podcast-analysis] Generating analysis for: ${episode.titleEn}`);

  const res = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 6000,
    _timeoutMs: 480_000,   // 8 min — podcast analysis can be slow with transcript
    messages: [{ role: 'user', content: prompt }],
  });

  const contentMd = res.content[0].text.trim();
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
