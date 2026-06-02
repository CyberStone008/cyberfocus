/**
 * DeepSeek translation backend (OpenAI-compatible API).
 *
 * Exposes a `deepseekClient` with the same shape as the Anthropic SDK client
 * (`messages.create({ messages, max_tokens }) -> { content: [{ type, text }] }`)
 * so translate/claude.js can use it as a drop-in.
 *
 * Activated when DEEPSEEK_API_KEY is set. DeepSeek's endpoint (api.deepseek.com)
 * is a domestic (China) endpoint — it must NOT go through the overseas xray
 * proxy that setupProxy() installs globally, so we attach a fresh direct
 * undici Agent dispatcher to bypass the global ProxyAgent.
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL    = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT_MS        = 120_000;

export function isDeepSeekMode() {
  return !!DEEPSEEK_API_KEY;
}

// Lazily-built direct dispatcher so DeepSeek (domestic) bypasses the global proxy.
let _directDispatcher = null;
async function getDirectDispatcher() {
  if (_directDispatcher !== null) return _directDispatcher;
  try {
    const { Agent } = await import('undici');
    _directDispatcher = new Agent();
  } catch {
    _directDispatcher = undefined; // undici not available — fall back to default fetch
  }
  return _directDispatcher;
}

export const deepseekClient = {
  messages: {
    // `model` arg is ignored (always uses DEEPSEEK_MODEL); kept for interface parity.
    async create({ messages, max_tokens = 4000, _timeoutMs }) {
      const dispatcher = await getDirectDispatcher();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), _timeoutMs ?? TIMEOUT_MS);

      try {
        const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages,            // [{ role: 'user', content: '...' }]
            max_tokens,
            temperature: 0,      // deterministic for translation
            stream: false,
          }),
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const err = new Error(`DeepSeek API ${res.status}: ${body.slice(0, 200)}`);
          err.status = res.status;
          throw err;
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        // Mirror the Anthropic SDK response shape consumed by claude.js
        return { content: [{ type: 'text', text }] };
      } finally {
        clearTimeout(timer);
      }
    },
  },
};
