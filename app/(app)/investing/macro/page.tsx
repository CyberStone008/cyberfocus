import { InvestingNav } from '../../../components/InvestingNav';
import { InvestingReportList, type ListItem } from '../../../components/InvestingReportList';
import { getInvestingCounts, loadMacroReports } from '../../../lib/investing-data';

export default function MacroPage() {
  const reports = loadMacroReports();
  const counts = getInvestingCounts();

  const items: ListItem[] = reports.map((r) => ({
    id: r.id,
    title: r.title,
    focus: r.focus,
    wordCount: r.wordCount,
    badge: '🌐 季度宏观',
    dateLabel: `${r.year} Q${r.quarter}`,
    readMins: '20-25 分钟',
    tags: ['regime 判定', '宏观五要素', '行业轮动时钟', '资产配置'],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minHeight: 0, flex: 1 }}>
      <InvestingNav {...counts} />
      <InvestingReportList
        items={items}
        hrefPrefix="/investing/macro"
        empty={{
          icon: '🌐',
          title: '首期季度宏观生成中',
          sub: '每季度首月 1 日早 9:00 自动生成 —— 自上而下的周期坐标',
          hint: '定时任务 us-stock-quarterly-macro 在 1/4/7/10 月 1 日运行；这是板块里唯一自上而下的栏目，为其他自下而上栏目提供周期背景。',
        }}
        about={{
          title: '关于本栏目',
          lines: [
            '季度宏观每季度首月 1 日早 9:00（北京时间）自动生成，是「价值投资」板块唯一自上而下的栏目——其他三个都是自下而上看行业，本报告提供它们运行的"大背景 / 周期坐标"。',
            '内容：当前 regime 判定（美林时钟/信用周期/流动性）→ 宏观五要素（Fed/通胀/利率/美元/信用利差）→ 行业轮动时钟 → 大类资产配置含义 → 三大风险情景 + 概率 → 大师周期视角。',
            '约 4000-6000 字，读完对"现在该进攻还是防守"有清晰的框架性答案。',
          ],
        }}
      />
    </div>
  );
}
