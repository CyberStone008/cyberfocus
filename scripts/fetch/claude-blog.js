/**
 * scripts/fetch/claude-blog.js
 *
 * Fetches the Claude product blog (claude.com/blog/*) — distinct from the
 * Anthropic company news blog (anthropic.com/news/*, see anthropic.js).
 *
 * claude.com sitemap has NO <lastmod> and is alphabetical, so we can't use it
 * for recency. Instead:
 *   1. Scrape the /blog index page for the listed article slugs (~25).
 *   2. Fetch each candidate page, read JSON-LD "datePublished" ("Mon DD, YYYY")
 *      + "headline" + og:description.
 *   3. Keep only genuinely recent posts.
 *
 * Uses curl (claude.com is behind Cloudflare; Node fetch may be challenged).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { slugify } from '../utils/slug.js';
import { isRecentBJ, maxPerSource } from '../utils/date-filter.js';

const execFileAsync = promisify(execFile);
const INDEX_URL = 'https://claude.com/blog';
const MAX_NEW = maxPerSource();
const MAX_CANDIDATES = 25;
// Daily runs use 3 days; the one-time seed can widen via CLAUDE_BLOG_FRESH_DAYS.
const FRESH_DAYS = process.env.CLAUDE_BLOG_FRESH_DAYS ? parseInt(process.env.CLAUDE_BLOG_FRESH_DAYS, 10) : 3;

async function curlGet(url) {
  const { stdout } = await execFileAsync('curl', [
    '-sS', '-L', '--compressed', '--max-time', '20',
    '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    url,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

/** Extract ordered, unique /blog/<slug> from the index page (skip /blog/category). */
function parseIndexSlugs(html) {
  const slugs = [];
  const seen = new Set();
  const re = /\/blog\/([a-z0-9][a-z0-9-]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (slug === 'category' || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}

function jsonField(html, key) {
  const m = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
  return m ? m[1].trim() : null;
}

function metaContent(html, prop) {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
  return m ? m[1].trim() : null;
}

export async function fetchClaudeBlog(processedIds) {
  try {
    console.log('[claude-blog] Fetching blog index...');
    const indexHtml = await curlGet(INDEX_URL);
    const slugs = parseIndexSlugs(indexHtml).slice(0, MAX_CANDIDATES);
    console.log(`[claude-blog] ${slugs.length} candidate slugs from index`);

    const results = [];
    for (const slug of slugs) {
      if (results.length >= MAX_NEW) break;
      const canonicalId = `claude-blog:${slug}`;
      if (processedIds && processedIds.has(canonicalId)) continue;

      try {
        const html = await curlGet(`${INDEX_URL}/${slug}`);
        const datePublished = jsonField(html, 'datePublished'); // e.g. "Jun 03, 2026"
        const dateIso = datePublished ? new Date(datePublished).toISOString() : null;

        // Only genuinely recent posts
        if (!isRecentBJ(dateIso, FRESH_DAYS)) continue;

        const headline = jsonField(html, 'headline') || metaContent(html, 'og:title');
        const description = metaContent(html, 'og:description') || metaContent(html, 'description');
        if (!headline) continue;

        results.push({
          id: canonicalId,
          slug: slugify(`claude-blog-${slug}`),
          source: 'Claude Blog',
          sourceUrl: `${INDEX_URL}/${slug}`,
          publishedAt: dateIso ?? new Date().toISOString(),
          titleEn: headline.replace(/\s*[|\\]\s*(Claude|Anthropic).*$/, '').trim(),
          titleZh: null,
          abstractEn: (description || '').slice(0, 400),
          abstractZh: null,
          authors: ['Anthropic'],
          institution: 'Claude',
          docType: 'Blog',
          category: 'research',
        });
        console.log(`[claude-blog] Added: ${slug} (${datePublished})`);
      } catch (err) {
        console.warn(`[claude-blog] Failed ${slug}: ${err.message}`);
      }
    }

    console.log(`[claude-blog] ${results.length} new articles`);
    return results;
  } catch (err) {
    console.warn(`[claude-blog] Fetch failed: ${err.message}`);
    return [];
  }
}
