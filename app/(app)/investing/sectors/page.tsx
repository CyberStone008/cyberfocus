import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { SectorReportList, type SectorReport } from '../../../components/SectorReportList';
import { InvestingNav } from '../../../components/InvestingNav';
import { getInvestingCounts } from '../../../lib/investing-data';

const SECTORS_DIR = resolve(process.cwd(), 'data/sector-reports');

const FILENAME_RE = /^(\d{4})-(\d{2})-(.+)\.md$/;

/** Extract title from the first H1 line of the markdown */
function extractTitle(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

/** Extract focus from the first blockquote after the H1 (the "本月深度焦点" line) */
function extractFocus(md: string): string {
  const m = md.match(/^>\s+\*?\*?(.+?)(?=\n\s*\n|\n>)/m);
  if (!m) return '';
  return m[1]
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(md: string): number {
  return md.replace(/\s+/g, '').length;
}

function loadSectorReports(): SectorReport[] {
  if (!existsSync(SECTORS_DIR)) return [];

  const files = readdirSync(SECTORS_DIR).filter((f) => FILENAME_RE.test(f));

  return files
    .map((filename) => {
      const m = filename.match(FILENAME_RE)!;
      const year  = Number(m[1]);
      const month = Number(m[2]);
      const slug  = m[3];
      const filePath = join(SECTORS_DIR, filename);
      const contentMd = readFileSync(filePath, 'utf8');
      const mtime = statSync(filePath).mtime.toISOString();

      return {
        id: `${m[1]}-${m[2]}-${slug}`,
        year,
        month,
        slug,
        title: extractTitle(contentMd, `${m[1]}年${m[2]}月 · ${slug}`),
        focus: extractFocus(contentMd),
        wordCount: countWords(contentMd),
        generatedAt: mtime,
      };
    })
    .sort((a, b) => {
      // Sort by year-month descending, then by slug
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return a.slug.localeCompare(b.slug);
    });
}

export default function SectorsPage() {
  const reports = loadSectorReports();
  const counts = getInvestingCounts();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, flex: 1 }}>
      <InvestingNav {...counts} />
      <SectorReportList reports={reports} />
    </div>
  );
}
