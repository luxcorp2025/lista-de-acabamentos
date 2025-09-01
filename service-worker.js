/* LuxApp SW - portal build */
const SW_TAG = 'luxapp-portal-2025-08-31-04';
const APP_SHELL = [
  './',
  './index.html',
  './assets/app.js?v=2025-08-31-portal-04',
  './assets/img/luxcorp-logo.png',
  './assets/img/luxcorp-logo.jpg',
  './assets/icons/icon-16.png',
  './assets/icons/icon-32.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SW_TAG).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {/* ignora falhas de precache */})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SW_TAG).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(res => {
        const clone = res.clone();
        caches.open(SW_TAG).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => cached || Promise.reject('offline'));
      return cached || fetchPromise;
    })
  );
});
