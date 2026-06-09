/**
 * report-tldr.js
 *
 * 为「AI 精华报告」卡片生成一句话主题说明（tldrZh）。
 * 严守数据溯源铁律：只依据已翻译的真实全文 contentMd，禁止编造。
 * 用途：卡片那行描述常因抓到网站通用 meta 描述（"Anthropic 是一家…公司"）
 *       而无法说明本文主题；此处用真实正文生成一句精准概述。
 *
 *   import { generateReportTldr } from './translate/report-tldr.js';
 *   const tldr = await generateReportTldr(titleZh, contentMd);
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCliClient, isCliMode } from './claude-cli.js';
import { deepseekClient, isDeepSeekMode } from './deepseek.js';

// 后端优先级与全站一致：DeepSeek > Claude CLI > Anthropic SDK
const client = isDeepSeekMode()
  ? deepseekClient
  : isCliMode()
    ? claudeCliClient
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_INPUT_CHARS = 3500;   // 正文开头通常已含主旨；截取足够判断主题即可

/**
 * @param {string} title  报告标题（中文优先）
 * @param {string} contentMd  已翻译的全文 markdown
 * @returns {Promise<string|null>}  结论先行的主题说明（1-2句，约60-110字），失败返回 null
 */
export async function generateReportTldr(title, text, opts = {}) {
  const { kind = '报告', label = '报告正文', minLen = 200, detail = false } = opts;
  const body = (text ?? '').trim();
  if (body.length < minLen) return null;   // 素材太短，不强行概括

  // 去掉 markdown 噪音，取开头供模型判断主题
  const clean = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_INPUT_CHARS);

  const prompt = `你在为一个 AI 研究速览站点的${kind}卡片写${detail ? '「详细概况」——让读者不必点开原文就能掌握这条新闻的要点' : '「一句话主题说明」，读者扫一眼就能判断要不要点进去看详情'}。

## 数据来源约束（最重要）
- **只能依据下面给出的${label}**，严禁编造材料中没有的数字、结论、观点或事实。
- 材料信息不足时，宁可写得概括，也不要发挥。

## ${kind}
标题：${title}
${label}（节选）：
"""
${clean}
"""

## 要求
- **结论先行**：开头直接抛出最关键的结论 / 看点 / 主张（最重要的信息放最前）。
- ${detail
    ? '共 **3-5 句、约 150-240 个汉字**：先给结论，再补充关键事实（涉及的人物/机构、发生了什么、关键数据或背景、影响或意义），让读者读完就掌握全貌、不必点开原文。不要分点、不要换行。'
    : '可再补一句关键支撑（方法、范围或适用场景之一）；共 **1-2 句、约 60-100 个汉字**（最多 120）。不要分点、不要换行。'}
- ⚠️ **数字铁律**：只有当某个数字 / 百分比 / 倍数 / 型号**逐字出现在上面的材料里**，才可以写进来；任何无法在材料中确认的数字一律不要出现，改用定性表述（如"大幅提升""显著领先"）。**宁可不写数字，也绝不编造。**
- **不要**用"本文/这篇${kind}"开头，不要复述标题。
- 简体中文，专有名词（人名、品牌、技术术语）保留英文。
- 只输出这段话本身，不要引号、不要任何额外前缀。`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',   // DeepSeek 包装层会忽略此 model
      max_tokens: detail ? 520 : 320,
      _timeoutMs: 120_000,
      messages: [{ role: 'user', content: prompt }],
    });
    let out = (res.content?.[0]?.text ?? '').trim();
    // 合并多行为一段、清掉引号/前缀
    out = out.replace(/\s*\n+\s*/g, ' ')
             .replace(/^["“”'`]+|["“”'`]+$/g, '')
             .replace(/^(主题|说明|摘要|结论)[:：]\s*/, '')
             .trim();
    return out || null;
  } catch (err) {
    console.warn(`[report-tldr] 生成失败: ${err.message}`);
    return null;
  }
}
