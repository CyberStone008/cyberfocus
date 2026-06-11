'use client';

// 源健康榜折叠交互 —— 本页唯一 client 组件。
// 只收 health.ts 构建时算死的纯字符串视图模型，自身不做任何时间/数据计算（hydration 纪律）。

import { useState } from 'react';
import styles from './page.module.css';
import type { LadderRowVM } from '../../lib/health';

const TONE_CLASS: Record<LadderRowVM['tone'], string> = {
  ok: styles.toneOk,
  warn: styles.toneWarn,
  over: styles.toneOver,
  muted: styles.toneMuted,
};
const DAYS_CLASS: Record<LadderRowVM['tone'], string> = {
  ok: styles.daysOk,
  warn: styles.daysWarn,
  over: styles.daysOver,
  muted: styles.daysMuted,
};

export function SourceLadder({ rows }: { rows: LadderRowVM[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.filter((r) => r.defaultVisible);
  const collapsible = rows.length > visible.length || expanded;

  return (
    <>
      {visible.map((r) => (
        <div key={r.key} className={`${styles.ladderRow} ${TONE_CLASS[r.tone]}`} title={r.title}>
          <span className={styles.rowDot} />
          <span className={styles.rowName}>
            <span className={styles.rowNameText}>{r.name}</span>
            {r.site && <span className={styles.rowTag}>官网</span>}
            {r.disabled && <span className={`${styles.rowTag} ${styles.rowTagMuted}`}>已停用</span>}
          </span>
          <span className={styles.bar}>
            <span className={styles.barFill} style={{ width: `${r.barPct}%` }} />
          </span>
          <span className={`${styles.rowDays} ${r.seenToday ? styles.daysOk : DAYS_CLASS[r.tone]}`}>
            {r.daysText}
          </span>
          <span className={styles.rowThreshold}>{r.thresholdText}</span>
        </div>
      ))}
      {collapsible && (
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起 ▴' : `展开全部 ${rows.length} 个源 ▾`}
        </button>
      )}
    </>
  );
}
