'use client';

import { useEffect, useRef, useState } from 'react';
import { TocEntry } from '../types/article';
import styles from './TableOfContents.module.css';

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [activeAnchor, setActiveAnchor] = useState<string | null>(
    entries[0]?.anchor ?? null
  );
  // Track which headings are "above the fold" — the last one in that set is active
  const visibleSet = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (entries.length === 0) return;

    const headings = entries
      .map((e) => document.getElementById(e.anchor))
      .filter((el): el is HTMLElement => el !== null);

    if (headings.length === 0) return;

    // Use IntersectionObserver — works regardless of which ancestor scrolls
    const observer = new IntersectionObserver(
      (ioEntries) => {
        for (const e of ioEntries) {
          if (e.isIntersecting) {
            visibleSet.current.add(e.target.id);
          } else {
            visibleSet.current.delete(e.target.id);
          }
        }
        // Active = last heading whose top has passed the upper 25% of viewport
        // = last heading NOT currently visible (already scrolled past) OR first visible one
        let active = headings[0].id;
        for (const h of headings) {
          const rect = h.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.25) {
            active = h.id;
          }
        }
        setActiveAnchor(active);
      },
      {
        // Fire when heading crosses the top 25% of the viewport
        rootMargin: '0px 0px -75% 0px',
        threshold: 0,
      },
    );

    // Also listen to scroll on the nearest scrollable ancestor (not just window)
    // to keep the highlight in sync while scrolling fast
    const scrollParent = (() => {
      let el: HTMLElement | null = headings[0].parentElement;
      while (el) {
        const { overflowY } = getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
        el = el.parentElement;
      }
      return window as unknown as HTMLElement;
    })();

    const onScroll = () => {
      let active = headings[0].id;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= window.innerHeight * 0.25) {
          active = h.id;
        }
      }
      setActiveAnchor(active);
    };

    headings.forEach((h) => observer.observe(h));
    scrollParent.addEventListener('scroll', onScroll, { passive: true });

    // Initial sync
    onScroll();

    return () => {
      observer.disconnect();
      scrollParent.removeEventListener('scroll', onScroll);
    };
  }, [entries]);

  // Keep the active TOC item visible — but ONLY within the TOC's own scroll
  // container (the desktop sticky sidebar). `el.scrollIntoView()` scrolls every
  // scrollable ancestor, including the page/window. On mobile the TOC is inline
  // in the article flow with no private scroll container, so scrollIntoView
  // would scroll the whole document and fight the user's finger — the page
  // jumps back and forth ("来回跳"). So we manually nudge only the TOC's own
  // overflow container, and bail entirely when there isn't one (mobile).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!activeAnchor || !navRef.current) return;
    const el = navRef.current.querySelector(`[data-anchor="${activeAnchor}"]`) as HTMLElement | null;
    if (!el) return;

    // Find the TOC's nearest private scroll container.
    let box: HTMLElement | null = el.parentElement;
    while (box) {
      const { overflowY } = getComputedStyle(box);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      box = box.parentElement;
    }
    if (!box) return; // inline TOC (mobile) → never scroll the page

    // Reveal `el` inside `box` by adjusting only the container's own scrollTop.
    const cRect = box.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top < cRect.top) {
      box.scrollTop += eRect.top - cRect.top - 8;
    } else if (eRect.bottom > cRect.bottom) {
      box.scrollTop += eRect.bottom - cRect.bottom + 8;
    }
  }, [activeAnchor]);

  if (entries.length === 0) return null;

  return (
    <nav className={styles.toc} aria-label="目录" ref={navRef}>
      <h2 className={styles.tocTitle}>目录</h2>
      <ul className={styles.tocList}>
        {entries.map((entry, i) => {
          const isActive = entry.anchor === activeAnchor;
          return (
            <li key={`${entry.anchor}-${i}`}>
              <a
                href={`#${entry.anchor}`}
                data-anchor={entry.anchor}
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
