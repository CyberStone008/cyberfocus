/**
 * Claude CLI adapter — calls the locally-installed `claude` binary
 * in non-interactive mode instead of the Anthropic SDK.
 *
 * Useful for local runs where you don't want to export ANTHROPIC_API_KEY
 * (uses your Claude Code subscription auth).
 *
 * Enable with env: USE_CLAUDE_CLI=true
 */
import { spawn } from 'child_process';

const CLI_BIN = process.env.CLAUDE_CLI_BIN || 'claude';
const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Run `claude -p <prompt> --output-format json` and return the `result` text.
 */
export function runClaudeCli(prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    // Spawn with nested-session guards removed so the child doesn't refuse to start.
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn(
      CLI_BIN,
      ['-p', prompt, '--output-format', 'json'],
      { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const payload = JSON.parse(stdout);
        if (payload.is_error) {
          const msg = payload.result ?? 'unknown';
          const err = new Error(`claude CLI reported error: ${msg}`);
          err.isPolicyRefusal = /usage policy/i.test(msg);
          return reject(err);
        }
        if (typeof payload.result !== 'string') {
          return reject(new Error('claude CLI: missing result field'));
        }
        resolve(payload.result);
      } catch (_) {
        if (code !== 0) {
          return reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 500)}`));
        }
        reject(new Error(`claude CLI: failed to parse JSON output`));
      }
    });
  });
}

/**
 * SDK-compatible shim so the rest of the code can call it like:
 *   client.messages.create({ messages: [{ role: 'user', content: prompt }], ... })
 * Only the `content[0].text` shape is emulated.
 */
export const claudeCliClient = {
  messages: {
    async create({ messages, _timeoutMs }) {
      const prompt = messages.map((m) => m.content).join('\n\n');
      const text = await runClaudeCli(prompt, { timeoutMs: _timeoutMs ?? DEFAULT_TIMEOUT_MS });
      return { content: [{ type: 'text', text }] };
    },
  },
};

export function isCliMode() {
  return process.env.USE_CLAUDE_CLI === 'true';
}
