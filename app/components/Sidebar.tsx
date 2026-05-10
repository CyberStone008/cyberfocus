'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';

const NAV = [
  {
    group: '今日动态',
    items: [
      { icon: '⚡', label: 'AI 精选热点', href: '/social',   disabled: false },
      { icon: '📋', label: 'AI 日报',      href: '/daily',    disabled: false },
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
    items: [
      { icon: '⚙️', label: '信源管理', href: '/sources', disabled: false },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const system = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    setTheme(saved ?? system);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <aside className={styles.sidebar}>
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
        {NAV.map((section) => (
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
  );
}
