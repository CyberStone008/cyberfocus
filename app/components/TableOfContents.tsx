'use client';

import { useEffect, useState } from 'react';
import { TocEntry } from '../types/article';
import styles from './TableOfContents.module.css';

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    entries[0]?.anchor ?? null
  );

  useEffect(() => {
    if (entries.length === 0) return;

    const headings = entries
      .map((e) => document.getElementById(e.anchor))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    let raf = 0;

    const update = () => {
      const offset = window.innerHeight * 0.3;
      let active = headings[0].id;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= offset) {
          active = h.id;
        } else {
          break;
        }
      }
      setActiveAnchor(active);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <nav className={styles.toc} aria-label="目录">
      <h2 className={styles.tocTitle}>目录</h2>
      <ul className={styles.tocList}>
        {entries.map((entry, i) => {
          const isActive = entry.anchor === activeAnchor;
          return (
            <li key={`${entry.anchor}-${i}`}>
              <a
                href={`#${entry.anchor}`}
                className={[
                  styles.tocItem,
                  entry.level === 3 ? styles.tocItemSub : '',
                  isActive ? styles.tocItemActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.tocTitleZh}>{entry.title}</span>
                {entry.titleEn && <span className={styles.tocTitleEn}>{entry.titleEn}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
