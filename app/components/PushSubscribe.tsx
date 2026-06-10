'use client';

import { useEffect, useState } from 'react';
import { VAPID_PUBLIC_KEY } from '../lib/push-config';

/** VAPID 公钥(base64url) → Uint8Array，供 pushManager.subscribe 使用 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = 'hidden' | 'need-install' | 'idle' | 'working' | 'on' | 'denied' | 'error';

export function PushSubscribe() {
  const [state, setState] = useState<State>('hidden');

  useEffect(() => {
    (async () => {
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) { setState('hidden'); return; }
      // iOS 仅在「已添加到主屏幕」(standalone) 时支持 Web Push
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isIOS && !standalone) { setState('need-install'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'on' : 'idle');
      } catch { setState('idle'); }
    })();
  }, []);

  async function enable() {
    setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'idle'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState('on');
    } catch {
      setState('error');
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('idle');
    } catch { setState('idle'); }
  }

  if (state === 'hidden') return null;

  const base: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
    border: '1px solid var(--border)', cursor: 'pointer', lineHeight: 1.4,
    background: 'transparent', color: 'var(--text-secondary)', textAlign: 'center',
  };
  const accent: React.CSSProperties = {
    ...base, color: '#fff', border: 'none',
    background: 'linear-gradient(135deg,#3b9bff,#1566b8)',
  };

  if (state === 'need-install') {
    return (
      <div style={{ ...base, cursor: 'default', flexDirection: 'column', gap: 2, fontWeight: 500, fontSize: 11.5 }}>
        <span>📲 想收每日推送？</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>先点 分享 → 添加到主屏幕</span>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div style={{ ...base, cursor: 'default', fontWeight: 500, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        🔕 通知已被拒绝，请到系统设置允许
      </div>
    );
  }
  if (state === 'on') {
    return (
      <button style={base} onClick={disable} aria-label="关闭推送">
        🔔 推送已开启 · 点此关闭
      </button>
    );
  }
  return (
    <button
      style={accent}
      onClick={enable}
      disabled={state === 'working'}
      aria-label="开启每日推送"
    >
      {state === 'working' ? '处理中…' : state === 'error' ? '⚠️ 开启失败，点击重试' : '🔔 开启每日推送'}
    </button>
  );
}
