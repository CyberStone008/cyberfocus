'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(saved ?? preferred);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <button onClick={toggle} className={styles.toggle} aria-label="切换明暗模式" title="切换明暗模式">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
