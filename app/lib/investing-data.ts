import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = process.cwd();
const DIRS = {
  briefs:  resolve(ROOT, 'data/strategy-briefs'),
  sectors: resolve(ROOT, 'data/sector-reports'),
  weekly:  resolve(ROOT, 'data/weekly-reports'),
  macro:   resolve(ROOT, 'data/macro-reports'),
};

function listMd(dir: string, re: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => re.test(f));
}

/** Counts for the nav (cheap — just file listing) */
export function getInvestingCounts() {
  return {
    totalBriefs:  listMd(DIRS.briefs,  /^\d{4}-\d{2}-\d{2}\.md$/).length,
    totalSectors: listMd(DIRS.sectors, /^\d{4}-\d{2}-.+\.md$/).length,
    totalWeekly:  listMd(DIRS.weekly,  /^\d{4}-\d{2}-\d{2}\.md$/).length,
    totalMacro:   listMd(DIRS.macro,   /^\d{4}-Q[1-4]\.md$/).length,
  };
}

function countWords(md: string): number {
  return md.replace(/\s+/g, '').length;
}

/** First blockquote line after the H1 — used as the card preview/summary.
 *  容错：LLM 偶尔不按模板输出 `>` 引用块，此时退而取 H1 后第一个正文段落。 */
function extractFocus(md: string): string {
  const m = md.match(/^>\s+\*?\*?(.+?)(?=\n\s*\n|\n>)/m);
  if (m) return m[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  // 兜底：跳过标题/分隔线/空行，取第一个普通段落
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('---') || t.startsWith('|') || t.startsWith('!')) continue;
    return t.replace(/^>\s*/, '').replace(/\*\*/g, '').slice(0, 160).trim();
  }
  return '';
}

function extractTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

/* ── Weekly reports ── */
export type WeeklyReport = {
  date: string;        // YYYY-MM-DD (Saturday) — also the URL id
  title: string;
  focus: string;
  wordCount: number;
  generatedAt: string;
};

export function loadWeeklyReports(): WeeklyReport[] {
  return listMd(DIRS.weekly, /^\d{4}-\d{2}-\d{2}\.md$/)
    .map((filename) => {
      const date = filename.replace('.md', '');
      const md = readFileSync(join(DIRS.weekly, filename), 'utf8');
      return {
        date,
        title: extractTitle(md, `美股行业周报 · ${date}`),
        focus: extractFocus(md),
        wordCount: countWords(md),
        generatedAt: statSync(join(DIRS.weekly, filename)).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Macro reports ── */
export type MacroReport = {
  id: string;          // YYYY-QN — also the URL id
  year: number;
  quarter: number;
  title: string;
  focus: string;
  wordCount: number;
  generatedAt: string;
};

export function loadMacroReports(): MacroReport[] {
  return listMd(DIRS.macro, /^\d{4}-Q[1-4]\.md$/)
    .map((filename) => {
      const id = filename.replace('.md', '');
      const m = id.match(/^(\d{4})-Q([1-4])$/)!;
      const md = readFileSync(join(DIRS.macro, filename), 'utf8');
      return {
        id,
        year: Number(m[1]),
        quarter: Number(m[2]),
        title: extractTitle(md, `美股季度宏观 · ${id}`),
        focus: extractFocus(md),
        wordCount: countWords(md),
        generatedAt: statSync(join(DIRS.macro, filename)).mtime.toISOString(),
      };
    })
    .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));
}
