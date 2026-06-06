/* CyberFocus service worker — conservative, freshness-first.
 *
 * Goals: make the PWA installable + work offline, WITHOUT serving stale content.
 *  - Navigations (HTML pages): network-first, fall back to cache/offline only when offline.
 *  - Hashed static assets (/_next/static, /icons): cache-first (immutable).
 *  - Everything else (APIs, cross-origin): passthrough, untouched.
 * Bump CACHE to invalidate old caches on the next activate.
 */
const CACHE = 'cyberfocus-v1';
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
