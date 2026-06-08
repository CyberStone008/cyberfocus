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
 * @returns {Promise<string|null>}  一句话主题说明（≤60字），失败返回 null
 */
export async function generateReportTldr(title, contentMd) {
  const body = (contentMd ?? '').trim();
  if (body.length < 200) return null;   // 内容太短，不强行概括

  // 去掉 markdown 噪音，取开头供模型判断主题
  const clean = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_INPUT_CHARS);

  const prompt = `你在为一个 AI 研究速览站点的报告卡片写「一句话主题说明」。读者扫一眼就能判断要不要点进去读全文。

## 数据来源约束（最重要）
- **只能依据下面给出的报告正文**，严禁编造正文中没有的数字、结论、机构观点或事实。
- 正文信息不足时，宁可写得概括，也不要发挥。

## 报告
标题：${title}
正文（节选）：
"""
${clean}
"""

## 要求
- 输出 **一句话**（不超过 60 个汉字），点明本报告"讲了什么 / 核心主题或结论"。
- 直接陈述主题，**不要**用"本文/这篇报告/本报告"开头，不要复述标题。
- 简体中文，专有名词（人名、品牌、技术术语）保留英文。
- 只输出这句话本身，不要引号、不要任何额外说明或标点前缀。`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',   // DeepSeek 包装层会忽略此 model
      max_tokens: 200,
      _timeoutMs: 120_000,
      messages: [{ role: 'user', content: prompt }],
    });
    let out = (res.content?.[0]?.text ?? '').trim();
    // 清掉可能的引号/前缀
    out = out.replace(/^["“”'`]+|["“”'`]+$/g, '').replace(/^(主题|说明|摘要)[:：]\s*/, '').trim();
    // 只取第一句，避免模型多写
    const firstLine = out.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
    return firstLine || null;
  } catch (err) {
    console.warn(`[report-tldr] 生成失败: ${err.message}`);
    return null;
  }
}
