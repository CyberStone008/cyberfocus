'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './InvestingNav.module.css';

interface Props {
  totalBriefs: number;
  totalSectors: number;
  totalWeekly: number;
  totalMacro: number;
}

export function InvestingNav({ totalBriefs, totalSectors, totalWeekly, totalMacro }: Props) {
  const pathname = usePathname() ?? '';

  const active =
    pathname.startsWith('/investing/sectors') ? 'sectors' :
    pathname.startsWith('/investing/weekly')  ? 'weekly'  :
    pathname.startsWith('/investing/macro')   ? 'macro'   :
    'briefs';

  const tabs: { id: string; label: string; href: string; count: number }[] = [
    { id: 'briefs',  label: '策略快报', href: '/investing',         count: totalBriefs  },
    { id: 'weekly',  label: '行业周报', href: '/investing/weekly',  count: totalWeekly  },
    { id: 'sectors', label: '月度深度', href: '/investing/sectors', count: totalSectors },
    { id: 'macro',   label: '季度宏观', href: '/investing/macro',   count: totalMacro   },
  ];

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
            快报 {totalBriefs} · 周报 {totalWeekly} · 深度 {totalSectors} · 宏观 {totalMacro}
          </span>
        </div>
      </div>

      {/* Sub-nav */}
      <div className={styles.subnav}>
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={`${styles.subnavBtn} ${active === t.id ? styles.subnavActive : ''}`}
          >
            {t.label} <span className={styles.subnavCount}>{t.count}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
