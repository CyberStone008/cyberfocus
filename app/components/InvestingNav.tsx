'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './InvestingNav.module.css';

export type InvestingTab = 'briefs' | 'sectors';

interface Props {
  totalBriefs: number;
  totalSectors: number;
}

export function InvestingNav({ totalBriefs, totalSectors }: Props) {
  const pathname = usePathname();

  // Determine active tab from pathname
  // /investing               -> briefs
  // /investing/sectors       -> sectors
  const active: InvestingTab =
    pathname?.startsWith('/investing/sectors') ? 'sectors' : 'briefs';

  return (
    <>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <span className={styles.title}>📊 价值投资</span>
          <span className={styles.sub}>· 美股策略 · 行业趋势 · 宏观坐标</span>
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.totalCount}>
            策略 {totalBriefs} · 深度 {totalSectors}
          </span>
        </div>
      </div>

      {/* Sub-nav */}
      <div className={styles.subnav}>
        <Link
          href="/investing"
          className={`${styles.subnavBtn} ${active === 'briefs' ? styles.subnavActive : ''}`}
        >
          策略快报 <span className={styles.subnavCount}>{totalBriefs}</span>
        </Link>

        <Link
          href="/investing/sectors"
          className={`${styles.subnavBtn} ${active === 'sectors' ? styles.subnavActive : ''}`}
        >
          月度深度 <span className={styles.subnavCount}>{totalSectors}</span>
        </Link>

        <button className={styles.subnavBtn} disabled title="即将上线">
          行业周报 <span className={styles.comingSoon}>即将上线</span>
        </button>

        <button className={styles.subnavBtn} disabled title="即将上线">
          季度宏观 <span className={styles.comingSoon}>即将上线</span>
        </button>
      </div>
    </>
  );
}
