// service-worker.js
const VERSION = 'v1.0.0'; // mantenha; quando publicar mudanças, incremente (v1.0.1, v1.0.2, ...)
const CACHE_NAME = `luxcorp-acab-${VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './assets/app.js',
  './assets/img/luxcorp-logo.png',
  './assets/img/luxcorp-logo.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-180.png'
];

// Instalação: pré-cache do app shell + ativa imediatamente
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting(); // << ativa a nova versão sem esperar
});

// Ativação: limpa caches antigos + assume abas existentes
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim(); // << controla as páginas abertas
});

// Fetch: HTML = network-first; demais = cache-first
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Páginas HTML: tentar rede primeiro (pra pegar atualizações), com fallback ao cache
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Outros assets (JS, imagens, ícones): cache-first com atualização em segundo plano
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        return res;
      })
    )
  );
});
