'use client';

import { useState } from 'react';
import { shortId } from '../lib/shortid';
import styles from './ShareButton.module.css';

// Copies a clean, short shareable URL (origin + /a/<shortId>) for the article —
// no long slug, no giant URL-encoded TOC anchor hash. Falls back to a temp
// textarea + execCommand when the async clipboard API is unavailable.
export function ShareButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/a/${shortId(slug)}`;
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
      title="复制短链接，方便分享"
      aria-label="复制链接"
    >
      {copied ? '✓ 已复制' : '🔗 复制链接'}
    </button>
  );
}
