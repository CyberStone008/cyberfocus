#!/usr/bin/env node
// Smoke guard against the "Not logged in" class of bug.
//
// Every script that builds its own LLM client and calls messages.create MUST
// select DeepSeek first (isDeepSeekMode() ? deepseekClient : ...). We shipped
// daily-digest.js and translate-daily.js without that branch, so under
// run-daily.sh's USE_CLAUDE_CLI=1 they routed to the unauthenticated claude CLI
// and failed silently every run. This check fails CI/local if any such call
// site regresses. Run: `npm run check:backends`.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = 'scripts';
// claude-cli.js IS the claude CLI client implementation — it legitimately has
// no DeepSeek branch. Everything else that constructs a client must.
const ALLOW = new Set(['scripts/translate/claude-cli.js']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  if (ALLOW.has(file)) continue;
  const src = readFileSync(file, 'utf8');
  const buildsClient = /\bconst\s+client\s*=/.test(src) && /\.messages\.create\b/.test(src);
  if (buildsClient && !/isDeepSeekMode/.test(src)) offenders.push(file);
}

if (offenders.length) {
  console.error('✗ 后端体检失败：以下脚本自建 LLM client 调 messages.create 但缺少 DeepSeek 分支：');
  for (const f of offenders) console.error('   - ' + f + '   （应改为 isDeepSeekMode() ? deepseekClient : ...）');
  console.error('\n参见 daily-digest.js / translate-daily.js 的写法。');
  process.exit(1);
}
console.log('✓ 后端体检通过：所有自建 LLM client 均已 DeepSeek 优先。');
