'use client';

import { useEffect } from 'react';

// Client-side redirect used by the short-link route (/a/<id>).
// Static export can't do server redirects, so we bounce on mount and
// also render a manual link as a no-JS / slow-network fallback.
export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <p style={{ marginBottom: '1rem' }}>正在跳转到文章…</p>
      <a href={to} style={{ color: 'var(--accent)' }}>
        如果没有自动跳转，点此进入 →
      </a>
    </div>
  );
}
