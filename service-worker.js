/* service-worker.js */
const VERSION = '2025-09-01-02';
const CACHE = `lux-v-${VERSION}`;

// Escopo/base do SW (funciona em GitHub Pages com subpasta)
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URLS = [
  new URL('index.html', SCOPE_URL).toString(),
  SCOPE_URL.toString(), // raiz do escopo (serve index.html)
];

// Nunca cachear estes (sempre rede)
const NEVER_CACHE = [
  /service-worker(\.[^\/]+)?\.js(\?.*)?$/i,
  /assets\/app\.js(\?.*)?$/i,
];

// Pré-cache básico (opcional)
const PRECACHE_URLS = [
  // relativos ao escopo do SW
  'index.html',
  './',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k.startsWith('lux-v-') && k !== CACHE) ? caches.delete(k) : null)
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // não cachear app.js e o próprio SW
  if (NEVER_CACHE.some((rx) => rx.test(url.pathname))) {
    event.respondWith(fetch(req));
    return;
  }

  // Navegações → network-first com fallback pro index do escopo
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(async () => {
        const cache = await caches.open(CACHE);
        // tenta as URLs conhecidas do index (escopo + index.html)
        for (const u of INDEX_URLS) {
          const hit = await cache.match(u);
          if (hit) return hit;
        }
        // tenta variações comuns
        return (await cache.match('index.html'))
            || (await cache.match('/index.html'))
            || Response.error();
      })
    );
    return;
  }

  // Demais GETs → network-first, com fallback para cache
  if (req.method === 'GET') {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp && resp.ok && resp.type !== 'opaque') {
          const cache = await caches.open(CACHE);
          cache.put(req, resp.clone());
        }
        return resp;
      } catch {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        return Response.error();
      }
    })());
  }
});
