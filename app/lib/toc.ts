import { TocEntry } from '../types/article';

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
