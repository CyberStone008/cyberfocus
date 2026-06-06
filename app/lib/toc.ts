import { TocEntry } from '../types/article';

/** A heading is the "English subtitle" of a bilingual pair if it's mostly Latin. */
export function isMostlyLatin(s: string): boolean {
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const cjk = (s.match(/[一-鿿]/g) || []).length;
  return latin > 0 && latin >= cjk;
}

/**
 * Full-content translation emits bilingual section headings as two adjacent
 * headings (`## 中文` + `### English`, or `### 中文` + `### English`). That made
 * every section appear TWICE in the TOC, and identical pairs (year ranges like
 * "2021–2023", "20XX?") render as literal duplicates. This collapses each pair:
 *   - identical text  → keep one heading, drop the duplicate.
 *   - different text  → keep the Chinese heading; demote the English to a small
 *     italic sub-line (no longer a heading → out of the TOC, not duplicated).
 * Only merges when the 2nd heading is identical or mostly-Latin, so genuine
 * consecutive Chinese subheadings are left untouched.
 */
export function mergeBilingualHeadings(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) { inCode = !inCode; out.push(line); continue; }
    if (inCode) { out.push(line); continue; }

    const m = line.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (!m) { out.push(line); continue; }

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const nm = j < lines.length ? lines[j].match(/^(#{2,4})\s+(.+?)\s*$/) : null;

    out.push(line);
    if (nm && nm[1].length >= m[1].length) {
      const cur = m[2].replace(/\*\*/g, '').trim();
      const nxt = nm[2].replace(/\*\*/g, '').trim();
      if (cur === nxt) {
        i = j; // identical → drop the duplicate heading
      } else if (isMostlyLatin(nxt)) {
        out.push('');
        out.push(`*${nm[2].trim()}*`); // demote English subtitle to an italic line
        i = j;
      }
    }
  }
  return out.join('\n');
}

/**
 * Generate a URL-safe anchor slug matching rehype-slug's algorithm.
 * Kept simple: lowercase, replace whitespace/punctuation with hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s\u00a0]+/g, '-')
    .replace(/[^\p{L}\p{N}\-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract a TOC from markdown content.
 * Pairs H2 (Chinese title) with an immediately following H3 (English subtitle)
 * as described in the article display spec.
 */
export function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n');
  const entries: TocEntry[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const h2Match = line.match(/^## (.+)$/);
    const h3Match = line.match(/^### (.+)$/);

    if (h2Match) {
      const title = h2Match[1].trim();
      // Check if next non-empty line is an H3 (English subtitle pattern)
      let titleEn: string | undefined;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine === '') continue;
        const nextH3 = nextLine.match(/^### (.+)$/);
        if (nextH3) {
          titleEn = nextH3[1].trim();
        }
        break;
      }
      entries.push({
        level: 2,
        title,
        titleEn,
        anchor: slugify(title),
      });
    } else if (h3Match) {
      // Skip H3s that are English subtitles for H2 above
      const title = h3Match[1].trim();
      const prevEntry = entries[entries.length - 1];
      if (prevEntry?.level === 2 && prevEntry.titleEn === title) {
        continue;
      }
      entries.push({
        level: 3,
        title,
        anchor: slugify(title),
      });
    }
  }

  return entries;
}
