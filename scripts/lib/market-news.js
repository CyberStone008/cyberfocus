/**
 * Shared market-news fetching for the local report generators
 * (strategy-brief, weekly-review, quarterly-macro, sector-deep-dive).
 *
 * Google News RSS via curl (same approach as hr-orgs.js). Returns structured
 * items with title/publisher/date/url so the LLM can cite real sources — and
 * so we enforce the "no fabrication, everything sourced" rule.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import Parser from 'rss-parser';

const execFileAsync = promisify(execFile);
const parser = new Parser({ timeout: 14000 });

/** Fetch one Google News RSS query → [{title, publisher, date, url}] */
export async function newsHeadlines(query, max = 6) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sS', '-L', '--compressed', '--max-time', '15',
      '-H', 'User-Agent: Mozilla/5.0', url,
    ], { maxBuffer: 4 * 1024 * 1024 });
    const feed = await parser.parseString(stdout);
    return (feed.items ?? []).slice(0, max).map((i) => {
      const raw = (i.title ?? '').trim();
      const sep = raw.lastIndexOf(' - ');
      return {
        title: sep > 0 ? raw.slice(0, sep).trim() : raw,
        publisher: sep > 0 ? raw.slice(sep + 3).trim() : '',
        date: (i.isoDate ?? '').slice(0, 10),
        url: i.link ?? '',
      };
    });
  } catch {
    return [];
  }
}

/** Run a {label: query} map → {label: items[]}, staggered to be gentle. */
export async function gatherNews(queries, perQuery = 6) {
  const out = {};
  for (const [label, q] of Object.entries(queries)) {
    out[label] = await newsHeadlines(q, perQuery);
    await new Promise((r) => setTimeout(r, 800));
  }
  return out;
}

/** Render {label: items[]} as a digest, with [label-#] tags the LLM can cite. */
export function formatNewsDigest(news) {
  return Object.entries(news)
    .map(([k, items]) => {
      const lines = items.length
        ? items.map((it, i) => `  [${k}-${i + 1}] ${it.title}${it.publisher ? ` —${it.publisher}` : ''}${it.date ? ` (${it.date})` : ''}`).join('\n')
        : '  (本期无相关头条)';
      return `【${k}】\n${lines}`;
    })
    .join('\n\n');
}

/** Deduped [{title, publisher, url}] for the Sources section. */
export function collectSources(news) {
  const seen = new Set();
  const out = [];
  for (const items of Object.values(news)) {
    for (const it of items) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push({ title: it.title, publisher: it.publisher, url: it.url });
      }
    }
  }
  return out;
}

export function formatSourceList(sources) {
  return sources.map((s, i) => `[S${i + 1}] ${s.title}${s.publisher ? ` —${s.publisher}` : ''} ${s.url}`).join('\n');
}
