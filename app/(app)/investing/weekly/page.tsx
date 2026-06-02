import { InvestingNav } from '../../../components/InvestingNav';
import { InvestingReportList, type ListItem } from '../../../components/InvestingReportList';
import { getInvestingCounts, loadWeeklyReports } from '../../../lib/investing-data';

function weekLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const today = new Date();
  const dt = new Date(y, m - 1, d);
  const diffDays = Math.floor((today.getTime() - dt.getTime()) / 86400000);
  if (diffDays < 7)  return `本周 · ${m}月${d}日`;
  if (diffDays < 14) return `上周 · ${m}月${d}日`;
  return `${m}月${d}日`;
}

export default function WeeklyPage() {
  const reports = loadWeeklyReports();
  const counts = getInvestingCounts();

  const items: ListItem[] = reports.map((r) => ({
    id: r.date,
    title: r.title,
    focus: r.focus,
    wordCount: r.wordCount,
    badge: '📰 行业周报',
    dateLabel: weekLabel(r.date),
    readMins: '10-12 分钟',
    tags: ['周复盘', 'Thesis 追踪', '七行业扫描'],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, flex: 1 }}>
      <InvestingNav {...counts} />
      <InvestingReportList
        items={items}
        hrefPrefix="/investing/weekly"
        empty={{
          icon: '📰',
          title: '首期行业周报生成中',
          sub: '每周六早 8:00 自动生成 —— 周复盘 + Thesis 追踪',
          hint: '定时任务 us-stock-weekly-review 每周六运行；核心是回看前期判断的兑现情况，建立问责闭环。',
        }}
        about={{
          title: '关于本栏目',
          lines: [
            '行业周报每周六早 8:00（北京时间）自动生成，与「策略快报」错位互补：快报答"刚发生什么"，周报答"这周意味着什么 + 我之前的判断对不对"。',
            '核心栏目是 Thesis 追踪：回看前期快报/深度里的判断，逐条核对本周兑现情况（✅验证 / ❌打脸 / ⏳待观察），建立问责闭环。',
            '另含七行业一周涨跌扫描、跨行业主题、下周关键日历。约 2500-3500 字。',
          ],
        }}
      />
    </div>
  );
}
