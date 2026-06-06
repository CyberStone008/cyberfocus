'use client';

import { useEffect } from 'react';

// Registers the service worker (public/sw.js) so the site is installable as a PWA
// and works offline. Silent no-op if the browser lacks support or registration fails.
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);
  return null;
}
