/*
 * HarvestSlot service worker.
 * - Never caches API responses (/api/*): live data is only ever shown fresh from the server.
 * - Caches the app's static assets so the installed app opens on a weak connection.
 * - Navigations are network-first; if offline, the cached page or the offline page is shown.
 * Offline harvest drafts live in IndexedDB (see src/lib/drafts.ts), not in this cache.
 */
const VERSION = 'hs-brand-v2';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/brand/harvestslot-mark.png',
  '/favicon.ico?v=hs-brand-2',
  '/apple-touch-icon.png?v=hs-brand-2',
  '/icons/icon-16.png?v=hs-brand-2',
  '/icons/icon-32.png?v=hs-brand-2',
  '/icons/icon-192.png?v=hs-brand-2',
  '/icons/icon-512.png?v=hs-brand-2',
  '/icons/maskable-512.png?v=hs-brand-2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always network, never cached

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/apple-touch-icon.png'
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep only the farmer's form shell pages for offline use; pages carry no API data.
          if (
            res.ok &&
            (url.pathname === '/farmer/harvests/new' ||
              url.pathname === '/farmer/harvests' ||
              url.pathname === '/app')
          ) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match('/offline'))),
    );
  }
});

self.addEventListener('message', (event) => {
  // Sign-out clears cached pages so the next person on a shared phone starts clean.
  if (event.data === 'clear-pages') event.waitUntil(caches.delete(PAGE_CACHE));
});
