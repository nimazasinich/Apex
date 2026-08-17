/**
 * APEX service worker.
 * App-shell/static-asset cache only. API and non-GET requests always bypass it.
 * A waiting worker activates only after an explicit user-approved message.
 */

const APP_VERSION = '1.0.68';
const BUILD_HASH = 'source';
const CACHE_NAME = `apex-shell-v${APP_VERSION}-${BUILD_HASH}`;
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/pwa-192.png', '/pwa-512.png'];
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'APEX_ACTIVATE_UPDATE') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name.startsWith('apex-shell-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || Response.error()),
    );
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    const refresh = fetch(request).then(async (response) => {
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });
    event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.match(request).then((cached) => cached || refresh));
  }
});
