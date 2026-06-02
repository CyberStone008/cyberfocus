import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { StrategyBriefFeed, type Brief } from '../../components/StrategyBriefFeed';
import { InvestingNav } from '../../components/InvestingNav';
import { getInvestingCounts } from '../../lib/investing-data';

const BRIEFS_DIR  = resolve(process.cwd(), 'data/strategy-briefs');

/** Parse the 一句话叙事 narrative line from a brief's markdown */
function extractNarrative(md: string): string {
  const m = md.match(/##\s*【一句话叙事】\s*\n+\s*>\s*([\s\S]+?)(?=\n\s*\n---|\n\s*##)/);
  if (!m) return '';
  return m[1]
    .replace(/\n>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(md: string): number {
  return md.replace(/\s+/g, '').length;
}

function loadBriefs(): Brief[] {
  if (!existsSync(BRIEFS_DIR)) return [];
  const files = readdirSync(BRIEFS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  return files
    .map((filename) => {
      const date = filename.replace('.md', '');
      const filePath = join(BRIEFS_DIR, filename);
      const contentMd = readFileSync(filePath, 'utf8');
      const mtime = statSync(filePath).mtime.toISOString();
      return {
        date,
        narrative: extractNarrative(contentMd),
        wordCount: countWords(contentMd),
        generatedAt: mtime,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default function InvestingPage() {
  const briefs = loadBriefs();
  const counts = getInvestingCounts();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, flex: 1 }}>
      <InvestingNav {...counts} />
      <StrategyBriefFeed briefs={briefs} />
    </div>
  );
}
