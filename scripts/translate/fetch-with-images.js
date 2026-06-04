/**
 * fetch-with-images.js
 *
 * Fetches any article URL and converts the HTML body to a Markdown-like
 * string that PRESERVES image references as ![alt](src).
 *
 * The output is suitable for passing to Claude as "source markdown" so
 * that the translated article can include the original images.
 */

const FETCH_TIMEOUT_MS = 30_000;
const MAX_CONTENT_CHARS = 24_000; // ~6k tokens — enough for most blog posts

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Extract the real publish date (YYYY-MM-DD) from fetched article markdown/text.
 * Many sites (e.g. OpenAI) render a visible "Month DD, YYYY" near the top, while
 * their sitemap <lastmod> reflects last EDIT (not publish) — using lastmod makes
 * year-old re-touched articles look brand new. Returns null if no date found.
 */
export function extractPublishDate(text) {
  if (!text) return null;
  // Look only near the top (publish date is usually in the first ~600 chars)
  const head = text.slice(0, 600);
  const m = head.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})/i);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/**
 * Fetch an article page and return a semi-structured text that keeps
 * images as Markdown image syntax.
 *
 * Returns null if the page can't be fetched or has no useful content.
 */
export async function fetchArticleWithImages(url) {
  // Try Node fetch first; fall back to curl for JS-heavy sites
  let html = await fetchWithNodeFetch(url);
  if (!html || html.length < 1000) {
    html = await fetchWithCurl(url);
  }
  if (!html) return null;

  const md = htmlToMarkdownWithImages(html, url);
  if (!md || md.length < 200) return null;
  return md.slice(0, MAX_CONTENT_CHARS);
}

async function fetchWithNodeFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchWithCurl(url) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('curl', [
      '-s', '-L', '--max-time', '25',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml',
      url,
    ], { maxBuffer: 10 * 1024 * 1024 });
    return stdout || null;
  } catch {
    return null;
  }
}

/**
 * Convert article HTML to Markdown-like text, preserving:
 *  - Headings  → ## / ###
 *  - Images    → ![alt](absolute_url)
 *  - Figures   → ![caption](src)
 *  - Bold/em   → **text** / *text*
 *  - Paragraphs / line breaks
 */
function htmlToMarkdownWithImages(html, baseUrl) {
  // ── 1. Extract main content block ──────────────────────────────────────────
  const contentHtml = extractMainContent(html);
  if (!contentHtml) return null;

  // ── 2. Remove non-content islands ──────────────────────────────────────────
  let h = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // ── 3. Convert images BEFORE stripping tags ─────────────────────────────
  // <figure> with figcaption: use caption as alt
  h = h.replace(
    /<figure[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<figcaption[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/gi,
    (_, src, caption) => {
      const alt = stripTags(caption).trim();
      const abs = toAbsoluteUrl(src, baseUrl);
      return abs ? `\n\n![${alt}](${abs})\n\n` : '';
    }
  );

  // Remaining <img> tags (srcset → use src; data-src fallback)
  h = h.replace(/<img[^>]*>/gi, (tag) => {
    const src = extractAttr(tag, 'src') || extractAttr(tag, 'data-src') || extractAttr(tag, 'data-lazy-src');
    const alt = extractAttr(tag, 'alt') ?? '';
    if (!src) return '';
    // Skip tiny icons, tracking pixels, base64, SVG icons
    if (src.startsWith('data:')) return '';
    if (/\/(icon|logo|avatar|pixel|blank|spacer|tracking)/i.test(src)) return '';
    // Skip very small images indicated by width/height attrs
    const w = parseInt(extractAttr(tag, 'width') || '999', 10);
    const ht = parseInt(extractAttr(tag, 'height') || '999', 10);
    if (w < 100 || ht < 80) return '';
    const abs = toAbsoluteUrl(src, baseUrl);
    return abs ? `\n\n![${alt}](${abs})\n\n` : '';
  });

  // ── 4. Convert headings ─────────────────────────────────────────────────
  h = h.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n\n# ${stripTags(t).trim()}\n\n`);
  h = h.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${stripTags(t).trim()}\n\n`);
  h = h.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${stripTags(t).trim()}\n\n`);
  h = h.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_, t) => `\n\n#### ${stripTags(t).trim()}\n\n`);

  // ── 5. Convert inline formatting ────────────────────────────────────────
  h = h.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${stripTags(t)}**`);
  h = h.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, t) => `**${stripTags(t)}**`);
  h = h.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, t) => `*${stripTags(t)}*`);
  h = h.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_, t) => `*${stripTags(t)}*`);
  h = h.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${stripTags(t)}\``);

  // ── 6. Block elements → newlines ────────────────────────────────────────
  h = h.replace(/<p[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '\n\n');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');

  // ── 7. Strip remaining tags & decode entities ───────────────────────────
  h = h.replace(/<[^>]+>/g, '');
  h = decodeEntities(h);

  // ── 8. Normalise whitespace ──────────────────────────────────────────────
  h = h
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return h;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractMainContent(html) {
  // Try common content selectors in preference order
  const patterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class="[^"]*(?:entry-content|post-content|article-content|blog-content|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1].length > 500) return m[1];
  }
  // Last resort: everything inside <body>
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return body ? body[1] : html;
}

function extractAttr(tag, name) {
  // Handles both single and double quotes
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function toAbsoluteUrl(src, baseUrl) {
  try {
    if (src.startsWith('//')) return `https:${src}`;
    if (src.startsWith('http')) return src;
    const base = new URL(baseUrl);
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
