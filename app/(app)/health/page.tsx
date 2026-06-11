// 健康仪表盘 /health —— 公开只读监控页（server component，构建时静态读取 data/health/）。
// 数据滞后是设计内行为：哨兵写 data/health/ 不触发 Pages 构建（AGENTS.md 红线），
// 页面顶部「数据截至」行如实披露快照时刻。零图表库，sparkline/条形全部手写。

import styles from './page.module.css';
import { getHealthViewModel, type ChipStatus } from '../../lib/health';
import { SourceLadder } from './SourceLadder';

export const metadata = { title: '健康仪表盘 | CyberFocus' };

const DOT_CLASS: Record<string, string> = {
  green: styles.dotGreen,
  red: styles.dotRed,
  orange: styles.dotOrange,
  gray: styles.dotGray,
};
const CHIP_CLASS: Record<ChipStatus, string> = {
  ok: styles.chipOk,
  fail: styles.chipFail,
  error: styles.chipError,
  pending: styles.chipPending,
};

export default function HealthPage() {
  const vm = getHealthViewModel();
  const { overview, ladder, trend, events } = vm;

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <span className={styles.topbarTitle}>健康仪表盘</span>
        <span className={styles.topbarSub}>运行期哨兵 · 七项体检</span>
      </div>

      <div className={styles.feed}>
        <div className={styles.asOf}>{vm.dataAsOf}</div>

        {/* ── 卡1 总览状态灯 ── */}
        <section className={`${styles.card} ${styles.overviewCard}`}>
          <div className={styles.overviewHead}>
            <span className={`${styles.statusDot} ${DOT_CLASS[overview.dotTone]}`} />
            <span className={styles.headline}>{overview.headline}</span>
            {(overview.lastCheckText || overview.spark) && (
              <span className={styles.overviewRight}>
                {overview.lastCheckText && (
                  <span className={styles.lastCheck}>{overview.lastCheckText}</span>
                )}
                {overview.spark && (
                  <svg
                    className={styles.spark}
                    viewBox="0 0 140 36"
                    width={140}
                    height={36}
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <polyline
                      points={overview.spark.points}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.5}
                    />
                    <circle cx={overview.spark.lastX} cy={overview.spark.lastY} r={2} fill="var(--accent)" />
                  </svg>
                )}
              </span>
            )}
          </div>
          {overview.subline && <div className={styles.subline}>{overview.subline}</div>}
          <div className={styles.chips}>
            {overview.chips.map((c) => (
              <span key={c.id} className={`${styles.chip} ${CHIP_CLASS[c.status]}`} title={c.title}>
                <span className={styles.chipDot} />
                {c.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── 卡2 源健康榜 ── */}
        <section className={`${styles.card} ${styles.ladderCard}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>源健康榜</span>
            <span className={styles.cardHeadNote}>{ladder.headNote}</span>
          </div>
          <SourceLadder rows={ladder.rows} />
        </section>

        {/* ── 卡3 板块产出趋势 ── */}
        <section className={`${styles.card} ${styles.trendCard}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>近 14 天产出</span>
            <span className={styles.cardHeadNote} style={{ fontSize: 11 }}>今日为进行中数据</span>
          </div>
          <div className={styles.trendGrid}>
            {trend.boards.map((b) => (
              <div key={b.key}>
                <div className={styles.boardName}>{b.label}</div>
                <div className={styles.barsRow}>
                  {b.bars.map((bar, i) => (
                    <span
                      key={i}
                      className={[
                        styles.tbar,
                        bar.kind === 'zero' ? styles.tbarZero : '',
                        bar.kind === 'missing' ? styles.tbarMissing : '',
                        bar.isToday && bar.kind === 'value' ? styles.tbarToday : '',
                      ].filter(Boolean).join(' ')}
                      style={{ height: bar.heightPx }}
                      title={bar.title}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.rangeNote}>{trend.rangeNote}</div>
        </section>

        {/* ── 卡4 告警事件流 ── */}
        <section className={`${styles.card} ${styles.eventsCard}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>告警事件流</span>
            <span className={styles.cardHeadNote}>近 30 天</span>
          </div>
          {events.empty ? (
            <div className={styles.emptyWrap}>
              <span className={styles.emptyIcon}>✓</span>
              <span className={styles.emptyTitle}>0 起事件 · 哨兵值守中</span>
              <span className={styles.emptySub}>自上线以来未触发任何告警</span>
            </div>
          ) : (
            events.items.map((e, i) => (
              <div key={i} className={styles.eventRow}>
                <span className={styles.eventBadge}>{e.badge}</span>
                {e.ongoing && <span className={styles.ongoingTag}>进行中</span>}
                <span className={styles.eventTitle} title={e.title}>{e.title}</span>
                <span className={styles.eventTime}>{e.timeText}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
