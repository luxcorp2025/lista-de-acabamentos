/* Luxcorp • Lista de Acabamentos — Service Worker (robusto p/ GitHub Pages)
 * Rotas:
 *  - HTML (navigate): network-first + fallback index
 *  - Estáticos (js/css/img/manifest/icons): cache-first
 *  - Outros: stale-while-revalidate
 * Troque VERSION a cada release.
 */
const VERSION = 'v2025-08-26-04';
const CACHE_NAME = `lux-acab-${VERSION}`;

// Base do SW (funciona em /usuario/repo/)
const BASE = self.location.href.replace(/service-worker\.js(\?.*)?$/i, '');

// Precache enxuto (sem app.js com query pra evitar erro)
const PRECACHE_URLS = [
  'index.html',
  'manifest.webmanifest',
  'assets/img/luxcorp-logo.png',
  'assets/img/luxcorp-logo.jpg',
  'assets/icons/icon-16.png',
  'assets/icons/icon-32.png',
].map(p => new URL(p, BASE).toString());

// ---------- Helpers ----------
function isSameOrigin(urlStr) {
  try { return new URL(urlStr).origin === self.location.origin; } catch { return false; }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req, { ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const idx = await cache.match(new URL('index.html', BASE).toString());
      if (idx) return idx;
    }
    // último recurso: tenta rede (pode falhar off-line)
    return fetch(req).catch(() => new Response('Offline', { status: 503 }));
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: false });
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return cached || fetchPromise || fetch(req);
}

// ---------- Install / Activate ----------
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // se algum asset falhar, segue a vida
  );
});

self.addEventListener('activate', evt => {
  evt.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('lux-acab-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ---------- Fetch routing ----------
self.addEventListener('fetch', evt => {
  const req = evt.request;
  if (req.method !== 'GET' || !isSameOrigin(req.url)) return;

  const url = new URL(req.url);
  const dest = req.destination;           // 'document' | 'script' | 'style' | 'image' | ...
  const accept = req.headers.get('accept') || '';

  // HTML / navegação → network-first
  if (req.mode === 'navigate' || dest === 'document' || accept.includes('text/html')) {
    evt.respondWith(networkFirst(req));
    return;
  }

  // Estáticos → cache-first
  if (
    dest === 'script' || dest === 'style' || dest === 'image' ||
    /\.(?:js|css|png|jpe?g|svg|webp|ico|gif|json|webmanifest)$/.test(url.pathname)
  ) {
    evt.respondWith(cacheFirst(req));
    return;
  }

  // Restante → S-W-R
  evt.respondWith(staleWhileRevalidate(req));
});

// Opcional: permitir atualizar imediatamente via postMessage
self.addEventListener('message', evt => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
});
