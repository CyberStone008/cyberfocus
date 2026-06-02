import Anthropic from '@anthropic-ai/sdk';
import { sleep } from '../utils/rate-limiter.js';
import { claudeCliClient, isCliMode } from './claude-cli.js';
import { deepseekClient, isDeepSeekMode } from './deepseek.js';

// Backend priority: DeepSeek (if DEEPSEEK_API_KEY) > Claude CLI (if USE_CLAUDE_CLI) > Anthropic SDK
const client = isDeepSeekMode()
  ? deepseekClient
  : isCliMode()
    ? claudeCliClient
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model list to try, by backend. DeepSeek ignores the model arg internally but
// we still want a single-model retry loop (no point falling back to a claude model).
const TRANSLATE_MODELS = isDeepSeekMode()
  ? ['deepseek-chat']
  : ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1200;

function extractJson(text) {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: extract individual JSON objects that are well-formed
    // (handles cases where one item has unescaped chars breaking the full array)
    const objects = [];
    // Match outermost {...} blocks that contain an "index" key
    const objRe = /\{\s*"index"\s*:\s*\d+[\s\S]*?\}/g;
    let m;
    while ((m = objRe.exec(raw)) !== null) {
      try { objects.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
    }
    if (objects.length > 0) return objects;
    throw new SyntaxError(`JSON parse failed: ${raw.slice(0, 120)}`);
  }
}

async function translateWithClaude(articles, model = 'claude-haiku-4-5-20251001') {
  const items = articles.map((a, i) => ({
    index: i,
    title: a.titleEn,
    // Replace double quotes with single quotes to prevent the model from
    // outputting unescaped " in JSON values (which breaks JSON parsing)
    abstract: (a.abstractEn || '').slice(0, 350).replace(/"/g, "'"),
  }));

  const prompt = `你是一名专业的 AI 研究领域中英双语翻译专家。

请将以下 AI 研究论文的标题和摘要从英文翻译成简体中文。要求：
- 标题翻译要简洁准确，保留专业术语
- 摘要翻译要自然流畅，保持技术准确性
- 专有名词（如模型名称、数据集名称）保留英文
- 翻译结果中不要包含双引号，用单引号或书名号替代

输入论文列表：
${JSON.stringify(items, null, 2)}

请返回一个 JSON 数组，长度与输入相同，每个元素包含：
- "index": 对应输入的 index
- "titleZh": 中文标题
- "abstractZh": 中文摘要

只返回 JSON 数组，不要有其他文字。`;

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = extractJson(response.content[0].text);
  return articles.map((article, i) => {
    const t = parsed.find((p) => p.index === i) || parsed[i];
    return {
      ...article,
      titleZh: t?.titleZh || null,
      abstractZh: t?.abstractZh || null,
    };
  });
}

async function translateWithRetry(articles) {
  // Try each backend model in order (DeepSeek: single model; Anthropic: haiku→sonnet)
  for (const model of TRANSLATE_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await translateWithClaude(articles, model);
      } catch (err) {
        if (err.status === 429) {
          const waitMs = Math.pow(2, attempt) * 2000;
          console.warn(`[translate] Rate limited (attempt ${attempt + 1}). Waiting ${waitMs}ms...`);
          await sleep(waitMs);
        } else if (err instanceof SyntaxError || (err.message && err.message.includes('JSON'))) {
          console.warn(`[translate] JSON parse error with ${model}, retrying... Error: ${err.message}`);
          await sleep(1000);
        } else {
          console.warn(`[translate] Error with ${model}: ${err.message}`);
          break; // Try next model
        }
      }
    }
  }

  // Final fallback: return untranslated
  console.warn('[translate] All translation attempts failed. Returning untranslated articles.');
  return articles.map((a) => ({ ...a, titleZh: null, abstractZh: null }));
}

export async function translateBatch(articles) {
  const results = [];
  const total = articles.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    console.log(`[translate] Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (${batch.length} items)...`);

    let translated = await translateWithRetry(batch);

    // Self-heal content poisoning: if a single item's abstract contains markdown
    // / code blocks, it can break JSON parsing for the WHOLE batch (all items
    // return null). Retry any still-untranslated items ONE BY ONE, and if an
    // item still fails, retry it with its abstract stripped (title-only).
    const stillNull = translated.filter((t) => !t.titleZh);
    if (stillNull.length > 0 && batch.length > 1) {
      console.log(`[translate]   ${stillNull.length} item(s) failed in batch — retrying individually`);
      const byId = new Map(translated.map((t) => [t.id, t]));
      for (const item of stillNull) {
        let one = await translateWithRetry([item]);
        if (!one[0].titleZh) one = await translateWithRetry([{ ...item, abstractEn: '' }]);
        if (one[0].titleZh) byId.set(item.id, { ...item, titleZh: one[0].titleZh, abstractZh: one[0].abstractZh ?? null });
      }
      translated = batch.map((b) => byId.get(b.id));
    }

    results.push(...translated);

    if (i + BATCH_SIZE < total) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
