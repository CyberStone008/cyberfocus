#!/usr/bin/env node
/**
 * One-off importer: Situational Awareness — The Decade Ahead
 * by Leopold Aschenbrenner (situational-awareness.ai)
 *
 * Usage:  USE_CLAUDE_CLI=true node scripts/import-sa.js
 */

import { readFileSync, writeFileSync, writeSync, openSync, closeSync } from 'fs';
import { resolve } from 'path';
import { execSync, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { setupProxy } from './utils/proxy.js';
import { runClaudeCli } from './translate/claude-cli.js';

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');
const SOURCE_NAME   = 'SITUATIONAL AWARENESS - The Decade Ahead';

const CHAPTERS = [
  { slug: 'sa-intro',    url: 'https://situational-awareness.ai/',                                       titleEn: 'Introduction — Situational Awareness: The Decade Ahead',         order: 0 },
  { slug: 'sa-ch1',      url: 'https://situational-awareness.ai/from-gpt-4-to-agi/',                     titleEn: 'I. From GPT-4 to AGI: Counting the OOMs',                          order: 1 },
  { slug: 'sa-ch2',      url: 'https://situational-awareness.ai/from-agi-to-superintelligence/',          titleEn: 'II. From AGI to Superintelligence: the Intelligence Explosion',    order: 2 },
  { slug: 'sa-ch3a',     url: 'https://situational-awareness.ai/racing-to-the-trillion-dollar-cluster/',  titleEn: 'IIIa. Racing to the Trillion-Dollar Cluster',                      order: 3 },
  { slug: 'sa-ch3b',     url: 'https://situational-awareness.ai/lock-down-the-labs/',                    titleEn: 'IIIb. Lock Down the Labs: Security Before It\'s Too Late',         order: 4 },
  { slug: 'sa-ch3c',     url: 'https://situational-awareness.ai/superalignment/',                        titleEn: 'IIIc. The Superintelligence Riddle',                               order: 5 },
  { slug: 'sa-ch4',      url: 'https://situational-awareness.ai/the-project/',                           titleEn: 'IV. The Project',                                                  order: 6 },
  { slug: 'sa-ch5',      url: 'https://situational-awareness.ai/the-free-world-must-prevail/',           titleEn: 'V. The Free World Must Prevail',                                   order: 7 },
  { slug: 'sa-epilogue', url: 'https://situational-awareness.ai/parting-thoughts/',                      titleEn: 'Epilogue — Parting Thoughts',                                      order: 8 },
];

function loadArticles() {
  try { return JSON.parse(readFileSync(ARTICLES_PATH, 'utf8')); } catch { return []; }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-reader/1.0)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Python extractor script — written once to a temp file
const PY_SCRIPT_PATH = resolve(tmpdir(), 'sa_extract.py');
writeFileSync(PY_SCRIPT_PATH, `
import sys, re, html as htmlmod

content = sys.stdin.read()

m = re.search(r'<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*)', content, re.DOTALL)
if not m:
    sys.exit(1)
content = m.group(1)

# Remove ez-toc plugin block
content = re.sub(r'<div[^>]*ez-toc[^>]*>.*?</nav>\\s*</div>\\s*</div>\\s*</div>', '', content, flags=re.DOTALL)

# Strip div wrappers but keep content
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

/** Use Python for robust HTML → Markdown-text extraction */
function extractContent(html) {
  const result = spawnSync('python3', [PY_SCRIPT_PATH], {
    input: html,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'python extraction failed');
  return result.stdout.trim();
}

function splitChunks(text, maxChars = 4000) {
  const paras = text.split('\n\n');
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur.length + p.length + 2 > maxChars && cur.length > 0) {
      chunks.push(cur.trim());
      cur = p + '\n\n';
    } else {
      cur += p + '\n\n';
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function translateChapter(text) {
  const chunks = splitChunks(text, 4000);
  console.log(`    ${chunks.length} chunk(s) to translate`);

  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`    chunk ${i + 1}/${chunks.length} (${chunk.length} chars)… `);

    const prompt = `你是一名专业的中文技术翻译。请将以下内容翻译为简体中文。

要求：
- 保留所有 Markdown 格式（# 标题、**加粗**、> 引用、- 列表等）
- 技术术语首次出现时在中文后注英文，如：通用人工智能（AGI）
- 人名保留英文，如 Leopold Aschenbrenner
- 机构名保留英文，如 OpenAI、Anthropic
- 翻译流畅自然，符合中文习惯
- 只输出翻译结果，不加任何解释

原文：

${chunk}`;

    const result = await runClaudeCli(prompt, { timeoutMs: 180_000 });
    parts.push(result.trim());
    console.log('✓');
  }
  return parts.join('\n\n');
}

async function run() {
  await setupProxy();

  const existing = loadArticles();
  // Remove all old SA entries (re-import everything cleanly)
  const withoutOldSA = existing.filter(a => a.source !== SOURCE_NAME);

  const newArticles = [];

  for (const chapter of CHAPTERS) {
    console.log(`\n[sa] ${chapter.titleEn}`);
    console.log(`     ${chapter.url}`);

    let html;
    try {
      html = await fetchPage(chapter.url);
    } catch (err) {
      console.warn(`  ✗ fetch: ${err.message}`);
      continue;
    }

    let rawText;
    try {
      rawText = extractContent(html);
    } catch (err) {
      console.warn(`  ✗ extract: ${err.message}`);
      continue;
    }
    console.log(`  → ${rawText.length} chars extracted`);

    if (rawText.length < 200) {
      console.warn(`  ✗ content too short`);
      continue;
    }

    let translatedMd;
    try {
      translatedMd = await translateChapter(rawText);
    } catch (err) {
      console.warn(`  ✗ translate: ${err.message}`);
      translatedMd = rawText;
    }

    const headingMatch = translatedMd.match(/^#{1,2}\s+(.+)/m);
    const firstPara    = translatedMd.split('\n\n').find(p => p.trim() && !p.trim().startsWith('#') && !p.trim().startsWith('>') && !p.trim().startsWith('-'));
    const titleZh      = headingMatch ? headingMatch[1].replace(/\*\*/g, '').trim() : chapter.titleEn;
    const abstractZh   = (firstPara || '').replace(/\*\*/g, '').slice(0, 200);

    newArticles.push({
      id:          `sa:${chapter.slug}`,
      slug:        chapter.slug,
      source:      SOURCE_NAME,
      sourceUrl:   chapter.url,
      publishedAt: '2024-06-01T00:00:00.000Z',
      titleEn:     chapter.titleEn,
      titleZh,
      abstractEn:  rawText.slice(0, 300).replace(/\n+/g, ' '),
      abstractZh,
      authors:     ['Leopold Aschenbrenner'],
      category:    'research',
      contentMd:   `> 📖 **精译自原文** · 已获取原文全文，按章节忠实精译\n\n${translatedMd}`,
      translator:  { model: 'claude-cli', translatedAt: new Date().toISOString() },
      seriesSlug:  'situational-awareness',
      seriesOrder: chapter.order,
    });

    console.log(`  ✓ "${titleZh}" (${translatedMd.length} chars)`);
  }

  if (newArticles.length === 0) {
    console.log('\n[sa] Nothing imported.');
    return;
  }

  const merged = [
    ...newArticles.sort((a, b) => a.seriesOrder - b.seriesOrder),
    ...withoutOldSA,
  ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  writeFileSync(ARTICLES_PATH, JSON.stringify(merged, null, 2));
  console.log(`\n[sa] ✓ Imported ${newArticles.length} chapters → data/articles.json`);
}

run().catch(err => { console.error('[sa] Fatal:', err); process.exit(1); });
