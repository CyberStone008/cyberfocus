'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { IS_PUBLIC } from '../lib/public-mode';

const NAV: {
  group: string;
  adminOnly?: boolean;
  items: { icon: string; label: string; href: string; disabled: boolean }[];
}[] = [
  {
    group: '今日动态',
    items: [
      { icon: '⚡', label: 'AI 精选热点', href: '/social',   disabled: false },
      { icon: '📋', label: 'AI 日报',      href: '/daily',    disabled: false },
      { icon: '🎙️', label: '顶级播客',     href: '/podcast',  disabled: false },
    ],
  },
  {
    group: '研究速览',
    items: [
      { icon: '📡', label: 'AI 报告速览',  href: '/reports', disabled: false },
    ],
  },
  {
    group: '人服动态',
    items: [
      { icon: '🏛', label: '人服机构动态', href: '/orgs',    disabled: false },
    ],
  },
  {
    group: '投资研究',
    items: [
      { icon: '📈', label: '价值投资', href: '/investing', disabled: false },
    ],
  },
  {
    group: '管理',
    adminOnly: true,
    items: [
      { icon: '⚙️', label: '信源管理', href: '/sources', disabled: false },
    ],
  },
];

// In public (read-only) builds, drop admin-only sections from the nav.
const VISIBLE_NAV = IS_PUBLIC ? NAV.filter((s) => !s.adminOnly) : NAV;

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [open, setOpen] = useState(false); // mobile drawer

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const system = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    setTheme(saved ?? system);
  }, []);

  // Auto-close the mobile drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <>
      {/* Mobile hamburger (only visible ≤768px via CSS) */}
      <button
        className={styles.hamburger}
        aria-label="菜单"
        onClick={() => setOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>

      {/* Mobile overlay backdrop */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <Link href="/" className={styles.header}>
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} />
          {theme === 'dark' ? 'Live Feed // Core-AI' : 'Live · Core-AI'}
        </div>
        <div className={styles.logo}>
          Cyber<span className={styles.logoCyan}>Focus</span>
        </div>
      </Link>

      <nav className={styles.nav}>
        <Link
          href="/search"
          className={`${styles.navItem}${pathname.startsWith('/search') ? ' ' + styles.active : ''}`}
          style={{ marginBottom: 10 }}
        >
          <span className={styles.navIcon}>🔎</span>
          搜索
        </Link>
        {VISIBLE_NAV.map((section) => (
          <div key={section.group} className={styles.navSection}>
            <div className={styles.navSectionLabel}>{section.group}</div>
            {section.items.map((item) => {
              const isActive = !item.disabled && pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`${styles.navItem}${isActive ? ' ' + styles.active : ''}`}
                  aria-disabled={item.disabled}
                  tabIndex={item.disabled ? -1 : 0}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <button className={styles.themeBtn} onClick={toggleTheme}>
          <span className={styles.navIcon}>{theme === 'light' ? '◑' : '○'}</span>
          {theme === 'light' ? '切换深色' : '切换浅色'}
        </button>
      </div>
    </aside>
    </>
  );
}
