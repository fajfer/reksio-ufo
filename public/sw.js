// Service worker: offline support + installability.
//
// - Game files (./game/...): cache-first, filled on demand and by the
//   "download the game" button (src/offline.ts, same "reksio-game" cache).
// - Navigations: network-first so a deploy is picked up; the last good
//   index.html is cached as the offline fallback.
// - Hashed build assets (./assets/...): cache-first.
//
// Cache names are shared with src/offline.ts — keep them in sync.
const SHELL_CACHE = 'reksio-shell-v1';
const GAME_CACHE = 'reksio-game';

const scope = new URL('./', self.location);
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, GAME_CACHE]);
      await Promise.all((await caches.keys()).filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

async function cachedFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/game/')) {
    event.respondWith(cachedFirst(GAME_CACHE, request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) await cache.put(indexUrl, res.clone());
          return res;
        } catch {
          const hit = await cache.match(indexUrl);
          if (hit) return hit;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cachedFirst(SHELL_CACHE, request));
  }
});
