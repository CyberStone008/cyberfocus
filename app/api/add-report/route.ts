export const dynamic = 'force-static'; // required for output:'export' static builds
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Article } from '../../types/article';
import { deepseekChat, hasDeepSeek } from '../../lib/deepseek-server';

/* ── Translate title + description via DeepSeek ── */
async function translateMeta(
  titleEn: string,
  abstractEn: string,
): Promise<{ titleZh: string | null; abstractZh: string | null }> {
  if (!hasDeepSeek()) return { titleZh: null, abstractZh: null };
  const prompt =
    `将以下英文标题和摘要翻译成简体中文，返回纯 JSON，格式：{"titleZh":"…","abstractZh":"…"}。` +
    `不要输出任何其他内容。\n` +
    `标题：${titleEn}\n` +
    `摘要：${abstractEn.slice(0, 400)}`;
  try {
    const text  = await deepseekChat(prompt, { maxTokens: 1000, timeoutMs: 60_000 });
    const clean = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      titleZh:    typeof parsed.titleZh    === 'string' ? parsed.titleZh    : null,
      abstractZh: typeof parsed.abstractZh === 'string' ? parsed.abstractZh : null,
    };
  } catch {
    return { titleZh: null, abstractZh: null };
  }
}

const ARTICLES_PATH = resolve(process.cwd(), 'data/articles.json');

/* ── Extract og/meta tags from raw HTML ── */
function extractMeta(html: string) {
  const og = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]?.trim() ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'))?.[1]?.trim() ??
    null;

  const metaName = (name: string) =>
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]?.trim() ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))?.[1]?.trim() ??
    null;

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;

  return {
    title:       og('title')    || titleTag,
    description: og('description') || metaName('description'),
    siteName:    og('site_name'),
  };
}

/* ── Infer source name from URL/siteName ── */
function inferSource(url: string, siteName: string | null): string {
  if (siteName) return siteName;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const MAP: Record<string, string> = {
      'anthropic.com':    'Anthropic Blog',
      'openai.com':       'OpenAI Blog',
      'deepmind.google':  'DeepMind',
      'deepmind.com':     'DeepMind',
      'arxiv.org':        'arXiv',
      'huggingface.co':   'HuggingFace',
      'mistral.ai':       'Mistral AI',
      'ai.meta.com':      'Meta AI',
      'llama.meta.com':   'Meta AI',
      'blog.google':      'Google',
      'research.google':  'Google Research',
      'ai.google':        'Google AI',
    };
    return MAP[host] ?? host;
  } catch {
    return '手动添加';
  }
}

/* ── Build a URL-friendly slug ── */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
}

/* ── POST /api/add-report ── */
export async function POST(request: NextRequest) {
  // Admin-only: disabled on public (read-only) deployments.
  if (process.env.NEXT_PUBLIC_PUBLIC_MODE === '1') {
    return NextResponse.json({ error: 'Disabled on public deployment' }, { status: 403 });
  }
  let url: string;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: '请输入有效的 http/https 链接' }, { status: 400 });
  }

  // Load existing articles
  let articles: Article[];
  try {
    articles = JSON.parse(readFileSync(ARTICLES_PATH, 'utf8'));
  } catch {
    return NextResponse.json({ error: 'Cannot read articles.json' }, { status: 500 });
  }

  // Return existing article if URL already present
  const existing = articles.find((a) => a.sourceUrl === url);
  if (existing) {
    return NextResponse.json({ success: true, article: existing, existed: true });
  }

  // Fetch the target page
  let title: string | null    = null;
  let description: string | null = null;
  let source = '手动添加';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const html = await res.text();
      const meta = extractMeta(html);
      title       = meta.title;
      description = meta.description;
      source      = inferSource(url, meta.siteName);
    }
  } catch {
    // fall through
  }

  if (!title) {
    return NextResponse.json(
      { error: '无法获取页面标题，可能是需要登录或页面由 JavaScript 动态渲染' },
      { status: 422 },
    );
  }

  // Translate title + description to Chinese
  const { titleZh, abstractZh } = await translateMeta(title, description ?? '');

  const now   = new Date();
  const ts    = now.getTime();
  const id    = `manual:${ts}`;
  const slug  = `manual-${ts}-${slugify(title)}`;

  const article: Article = {
    id,
    slug,
    source,
    sourceUrl:    url,
    publishedAt:  now.toISOString(),
    titleEn:      title,
    titleZh:      titleZh,
    abstractEn:   description ?? '',
    abstractZh:   abstractZh,
    authors:      [],
    docType:      'Blog',
    category:     'research',   // always surface in AI 报告速览
    addedManually: true,         // shown as a badge in the feed
  };

  articles.unshift(article);

  try {
    writeFileSync(ARTICLES_PATH, JSON.stringify(articles, null, 2));
  } catch {
    return NextResponse.json({ error: 'Failed to save articles.json' }, { status: 500 });
  }

  return NextResponse.json({ success: true, article });
}
