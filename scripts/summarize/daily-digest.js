/**
 * Daily digest generator.
 * Takes an array of articles from one pipeline run and produces a structured
 * 3-section summary (aiNews / papers / hrOrgs) using claude-haiku.
 *
 * Returns:
 *   { aiNews: string[], papers: string[], hrOrgs: string[] }
 *
 * Each string is a single concise Chinese bullet (≤50 chars) summarising
 * the most important development from that section.  2-3 bullets per section.
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from '../translate/claude-cli.js';

const client = isCliMode()
  ? claudeCliClient
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : text.trim();
  return JSON.parse(raw);
}

/**
 * @param {import('../../app/types/article').Article[]} articles
 * @returns {Promise<{ aiNews: string[], papers: string[], hrOrgs: string[] }>}
 */
export async function generateDailyDigest(articles) {
  // ── Categorise ────────────────────────────────────────────────────────────
  const HR_SOURCES = new Set([
    'Korn Ferry', 'Mercer', 'ManpowerGroup', 'Randstad', 'Adecco Group',
    '科锐国际', 'FESCO', '中智咨询', '智联招聘', 'BOSS直聘', 'FESCO Adecco',
  ]);
  const PAPER_SOURCES = new Set(['arXiv cs.AI', 'arXiv cs.LG', 'HuggingFace Daily']);

  const hrOrgsRaw  = articles.filter((a) => HR_SOURCES.has(a.source) || a.tags?.includes('人服动态'));
  const papersRaw  = articles.filter((a) => PAPER_SOURCES.has(a.source));
  const aiNewsRaw  = articles.filter(
    (a) => !HR_SOURCES.has(a.source) && !PAPER_SOURCES.has(a.source),
  );

  // Cap each section to avoid an enormous prompt
  const aiNews = aiNewsRaw.slice(0, 20);
  const papers  = papersRaw.slice(0, 10);
  const hrOrgs  = hrOrgsRaw.slice(0, 10);

  if (aiNews.length + papers.length + hrOrgs.length === 0) {
    console.log('[daily-digest] No articles to summarise');
    return { aiNews: [], papers: [], hrOrgs: [] };
  }

  function fmt(list) {
    if (list.length === 0) return '（无）';
    return list
      .map((a) => `- ${a.titleZh ?? a.titleEn} [${a.source}]`)
      .join('\n');
  }

  const prompt = `你是一名 AI 领域资讯编辑。请根据今日抓取的文章列表，为每个板块选出最重要的 2-3 条，写成简洁的中文要点（每条不超过 50 字）。要点要包含核心信息：谁、做了什么、关键数据或意义。

【AI 动态】（产品发布、模型更新、公司动向、行业热点）
${fmt(aiNews)}

【论文速递】（学术论文、技术研究）
${fmt(papers)}

【人力资源动态】（劳动力市场、HR 机构报告）
${fmt(hrOrgs)}

返回 JSON，格式如下（每板块 2-3 条，无内容则返回空数组）：
{
  "aiNews": ["要点1", "要点2"],
  "papers": ["要点1"],
  "hrOrgs": ["要点1", "要点2"]
}

只返回 JSON，不要其他文字。`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = extractJson(response.content[0].text);
    console.log(
      `[daily-digest] Generated summary: ${result.aiNews?.length ?? 0} AI / ` +
      `${result.papers?.length ?? 0} papers / ${result.hrOrgs?.length ?? 0} HR`,
    );
    return {
      aiNews:  Array.isArray(result.aiNews)  ? result.aiNews  : [],
      papers:  Array.isArray(result.papers)  ? result.papers  : [],
      hrOrgs:  Array.isArray(result.hrOrgs)  ? result.hrOrgs  : [],
    };
  } catch (err) {
    console.warn('[daily-digest] Failed to generate summary:', err.message);
    return { aiNews: [], papers: [], hrOrgs: [] };
  }
}
