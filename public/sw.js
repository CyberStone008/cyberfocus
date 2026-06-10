/* CyberFocus service worker — conservative, freshness-first.
 *
 * Goals: make the PWA installable + work offline, WITHOUT serving stale content.
 *  - Navigations (HTML pages): network-first, fall back to cache/offline only when offline.
 *  - Hashed static assets (/_next/static, /icons): cache-first (immutable).
 *  - Everything else (APIs, cross-origin): passthrough, untouched.
 * Bump CACHE to invalidate old caches on the next activate.
 */
const CACHE = 'cyberfocus-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // Immutable hashed assets → cache-first.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
      ),
    );
    return;
  }

  // Page navigations → network-first (keeps content fresh), cache/offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
  }
});

/* ── Web Push (iOS PWA / Android / Desktop) ───────────────────────────────
 * 收到推送 → 弹通知；点击 → 聚焦已开窗口或打开目标页。
 * payload(JSON): { title, body, url, tag } */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'CyberFocus';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'cyberfocus',
    data: { url: data.url || '/reports' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/reports';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) { try { c.navigate(target); } catch { /* noop */ } return c.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
