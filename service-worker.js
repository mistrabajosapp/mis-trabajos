const CACHE_VERSION = 'mis-trabajos-static-v2-gemini';
const APP_SHELL = [
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Las funciones serverless y sus respuestas nunca se guardan en caché.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Supabase y cualquier servicio externo siempre van directo a la red.
  if (url.origin !== self.location.origin || url.hostname.endsWith('.supabase.co')) return;

  // La navegación y el HTML priorizan siempre la versión publicada.
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then(response => response || Response.error()))
    );
    return;
  }

  // Los recursos estáticos locales usan caché con actualización en segundo plano.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
