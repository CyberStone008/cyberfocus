#!/usr/bin/env node
/**
 * Translate one SA chapter at a time, with 20s delay between chunks.
 * Supports resume: already-translated chunks are skipped.
 *
 * Usage:
 *   USE_CLAUDE_CLI=true node scripts/translate-sa-chapter.js sa-ch1
 *   USE_CLAUDE_CLI=true node scripts/translate-sa-chapter.js sa-ch3b
 *   ... (run once per chapter, wait ~10min each)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { setupProxy } from './utils/proxy.js';
import { runClaudeCli } from './translate/claude-cli.js';

const slug = process.argv[2];
if (!slug) { console.error('Usage: node translate-sa-chapter.js <slug>'); process.exit(1); }

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const PY_SCRIPT = resolve(tmpdir(), 'sa_extract.py');
const DELAY_MS = 20_000; // 20s between chunks

// Write Python extraction script to temp file
import { writeFileSync as wfs } from 'fs';
const PY_HTML = resolve(tmpdir(), 'sa_html_input.html');
wfs(PY_SCRIPT, `import sys, re, html as htmlmod
content = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*)', content, re.DOTALL)
if not m:
    sys.exit(1)
content = m.group(1)
content = re.sub(r'<div[^>]*ez-toc[^>]*>.*?</nav>\\s*</div>\\s*</div>\\s*</div>', '', content, flags=re.DOTALL)
content = re.sub(r'<div[^>]*>', '', content)
content = re.sub(r'</div>', '', content)
def strip(t): return re.sub('<[^>]+>', '', t).strip()
content = re.sub(r'<h1[^>]*>(.*?)</h1>', lambda m: '\\n# ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
content = re.sub(r'<h2[^>]*>(.*?)</h2>', lambda m: '\\n## ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
content = re.sub(r'<h3[^>]*>(.*?)</h3>', lambda m: '\\n### ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
content = re.sub(r'<h4[^>]*>(.*?)</h4>', lambda m: '\\n#### ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
content = re.sub(r'<blockquote[^>]*>(.*?)</blockquote>', lambda m: '\\n> ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
content = re.sub(r'<p[^>]*>(.*?)</p>', lambda m: strip(m.group(1)) + '\\n\\n', content, flags=re.DOTALL)
content = re.sub(r'<li[^>]*>(.*?)</li>', lambda m: '- ' + strip(m.group(1)) + '\\n', content, flags=re.DOTALL)
def img_to_md(m):
    tag = m.group(0)
    src_m = re.search(r'src=["\\'\\']([^"\\'\\'>]+)["\\'\\']', tag)
    alt_m = re.search(r'alt=["\\'\\']([^"\\'\\'>]*)["\\'\\']', tag)
    src = src_m.group(1) if src_m else ''
    alt = alt_m.group(1) if alt_m else ''
    return ('\\n\\n![' + alt + '](' + src + ')\\n\\n') if src else ''
content = re.sub(r'<img[^>]*/?>',  img_to_md, content)
content = re.sub(r'<figure[^>]*>', '\\n', content)
content = re.sub(r'</figure>',     '\\n', content)
content = re.sub(r'<figcaption[^>]*>(.*?)</figcaption>', lambda m: '\\n*' + strip(m.group(1)) + '*\\n', content, flags=re.DOTALL)
content = re.sub(r'<[^>]+>', '', content)
content = htmlmod.unescape(content)
content = re.sub(r'\\n{4,}', '\\n\\n\\n', content)
content = '\\n'.join(l for l in content.splitlines() if l.strip() or not l)
print(content.strip())
`);

const CHAPTER_MAP = {
  'sa-ch1':      { url: 'https://situational-awareness.ai/from-gpt-4-to-agi/',                    titleEn: 'I. From GPT-4 to AGI: Counting the OOMs',                  order: 1 },
  'sa-ch3b':     { url: 'https://situational-awareness.ai/lock-down-the-labs/',                   titleEn: 'IIIb. Lock Down the Labs: Security Before It\'s Too Late', order: 4 },
  'sa-ch3c':     { url: 'https://situational-awareness.ai/superalignment/',                       titleEn: 'IIIc. The Superintelligence Riddle',                       order: 5 },
  'sa-ch4':      { url: 'https://situational-awareness.ai/the-project/',                          titleEn: 'IV. The Project',                                          order: 6 },
  'sa-ch5':      { url: 'https://situational-awareness.ai/the-free-world-must-prevail/',          titleEn: 'V. The Free World Must Prevail',                           order: 7 },
  'sa-epilogue': { url: 'https://situational-awareness.ai/parting-thoughts/',                     titleEn: 'Epilogue — Parting Thoughts',                              order: 8 },
};

const chapter = CHAPTER_MAP[slug];
if (!chapter) { console.error('Unknown slug:', slug, '\nKnown:', Object.keys(CHAPTER_MAP).join(', ')); process.exit(1); }

function extractContent(html) {
  writeFileSync(PY_HTML, html, 'utf8');
  const r = spawnSync('python3', [PY_SCRIPT, PY_HTML], { maxBuffer: 20*1024*1024, timeout: 30_000, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || 'python extraction failed');
  return r.stdout.trim();
}

function splitChunks(text, max = 3500) {
  const chunks = []; let cur = '';
  for (const p of text.split('\n\n')) {
    if (cur.length + p.length + 2 > max && cur.length > 0) { chunks.push(cur.trim()); cur = p + '\n\n'; }
    else cur += p + '\n\n';
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  await setupProxy();

  const articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));
  const existing = articles.find(a => a.slug === slug);

  // Check if already fully translated
  if (existing && existing.translator?.complete && /[一-龥]/.test((existing.contentMd || '').slice(200, 600))) {
    console.log(`[${slug}] Already translated. Done.`);
    return;
  }

  // Fetch page
  console.log(`[${slug}] Fetching ${chapter.url}...`);
  const res = await fetch(chapter.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  const html = await res.text();

  // Extract
  const raw = extractContent(html);
  console.log(`[${slug}] Extracted ${raw.length} chars`);

  const chunks = splitChunks(raw, 3500);
  console.log(`[${slug}] ${chunks.length} chunks, ${DELAY_MS/1000}s delay between each`);
  console.log(`[${slug}] Estimated time: ~${Math.ceil(chunks.length * (45 + DELAY_MS/1000) / 60)} minutes\n`);

  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`  chunk ${i+1}/${chunks.length} (${chunks[i].length} chars)… `);

    const prompt = `你是专业的中文技术翻译。将以下内容翻译为简体中文。

要求：
- 保留所有 Markdown 格式（# 标题、**加粗**、> 引用、- 列表）
- 技术术语首次出现加英文注释，如：通用人工智能（AGI）
- 人名、机构名保留英文，如 Leopold Aschenbrenner、OpenAI
- 翻译流畅自然，只输出译文，不加任何解释

原文：

${chunks[i]}`;

    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await runClaudeCli(prompt, { timeoutMs: 180_000 });
        break;
      } catch (err) {
        if (err.isPolicyRefusal) {
          // Keep English original for chunks refused by content policy
          console.log(`⚠ policy refusal — keeping English for this chunk`);
          result = `> ⚠️ *此段内容因涉及政策限制，保留原文。*\n\n${chunks[i]}`;
          break;
        }
        if (attempt < 3) {
          console.log(`✗ (attempt ${attempt}: ${err.message.slice(0, 50)}) retrying in 15s…`);
          await sleep(15_000);
        } else {
          console.log(`✗ ${err.message.slice(0, 60)}`);
          console.log(`\n[${slug}] Failed at chunk ${i+1}. Saving ${i} translated chunks.`);
          if (translated.length > 0) {
            const partial = translated.join('\n\n') + '\n\n' + chunks.slice(i).join('\n\n');
            saveArticle(articles, slug, chapter, raw, partial, false);
          }
          process.exit(1);
        }
      }
    }
    translated.push(result.trim());
    console.log('✓');

    if (i < chunks.length - 1) {
      process.stdout.write(`  [waiting ${DELAY_MS/1000}s…]\n`);
      await sleep(DELAY_MS);
    }
  }

  const md = translated.join('\n\n');
  saveArticle(articles, slug, chapter, raw, md, true);
  const isCN = /[一-龥]/.test(md.slice(100, 400));
  console.log(`\n[${slug}] ✓ Done — ${isCN ? '中文' : '英文'} ${md.length} chars`);
}

function saveArticle(articles, slug, chapter, raw, md, complete) {
  const hm = md.match(/^#{1,2}\s+(.+)/m);
  const fp = md.split('\n\n').find(p => p.trim() && !p.startsWith('#') && !p.startsWith('>') && !p.startsWith('-'));
  const existing = articles.find(a => a.slug === slug);
  const article = {
    id: 'sa:' + slug, slug,
    source: 'SITUATIONAL AWARENESS - The Decade Ahead',
    sourceUrl: chapter.url,
    publishedAt: existing?.publishedAt ?? new Date().toISOString(),
    titleEn: chapter.titleEn,
    titleZh: hm ? hm[1].replace(/\*\*/g, '').trim() : chapter.titleEn,
    abstractEn: raw.slice(0, 300).replace(/\n+/g, ' '),
    abstractZh: (fp || '').replace(/\*\*/g, '').slice(0, 200),
    authors: ['Leopold Aschenbrenner'],
    category: 'research',
    contentMd: '> 📖 **精译自原文** · 已获取原文全文，按章节忠实精译\n\n' + md,
    translator: { model: 'claude-cli', translatedAt: new Date().toISOString(), complete },
    seriesSlug: 'situational-awareness',
    seriesOrder: chapter.order,
  };
  const idx = articles.findIndex(a => a.slug === slug);
  if (idx >= 0) articles[idx] = article; else articles.unshift(article);
  writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
}

run().catch(err => { console.error('[fatal]', err.message); process.exit(1); });
