/**
 * Server-side DeepSeek chat helper for Next.js API routes (add-report,
 * generate-analysis). DeepSeek is the standing backend for ALL translation /
 * generation — these admin routes previously spawned the `claude` CLI (智谱),
 * now unified onto DeepSeek.
 *
 * Reads DEEPSEEK_API_KEY from env (.env.local is auto-loaded by Next dev).
 */

const BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function hasDeepSeek(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

/** Single-prompt DeepSeek completion. Returns the assistant text, or throws. */
export async function deepseekChat(
  prompt: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens ?? 4000,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}
