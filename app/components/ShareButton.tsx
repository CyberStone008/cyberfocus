'use client';

import { useState } from 'react';
import { shortId } from '../lib/shortid';
import styles from './ShareButton.module.css';

// Copies a clean shareable URL. Two modes:
//   • articles  → pass `shortSlug` → copies the short /a/<id> link.
//   • other pages (podcast / investing) → pass nothing → copies the current page
//     URL WITHOUT the giant URL-encoded TOC anchor hash.
// Falls back to a temp textarea + execCommand when the async clipboard API is
// unavailable (e.g. older in-app WebViews).
export function ShareButton({ shortSlug }: { shortSlug?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = shortSlug
      ? `${window.location.origin}/a/${shortId(shortSlug)}`
      : `${window.location.origin}${window.location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className={styles.shareBtn}
      onClick={copy}
      title="复制链接，方便分享"
      aria-label="复制链接"
    >
      {copied ? '✓ 已复制' : '🔗 复制链接'}
    </button>
  );
}
