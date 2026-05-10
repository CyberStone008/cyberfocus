import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { redirect } from 'next/navigation';

const DAILY_DIR = resolve(process.cwd(), 'data/daily');

function availableDates(): string[] {
  if (!existsSync(DAILY_DIR)) return [];
  return readdirSync(DAILY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

export default function DailyIndexPage() {
  const dates = availableDates();
  // Redirect to the most recent available day
  if (dates.length > 0) {
    redirect(`/daily/${dates[0]}`);
  }
  return (
    <div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>
      暂无日报数据，等待 pipeline 首次运行后自动生成。
    </div>
  );
}
