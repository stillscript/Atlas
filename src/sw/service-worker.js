/*
 * Atlas service worker (template).
 *
 * vite-plugins/atlas-pwa.ts fills in the precache list, build id and version at build time and
 * writes the result to dist/sw.js. This file is plain JS on purpose: it is not bundled.
 *
 * Rules this worker follows:
 * - It only ever touches caches named "atlas-*". User data lives in IndexedDB and is never cached
 *   here, so replacing or clearing caches can't affect it.
 * - It never calls skipWaiting() on its own. The page decides when a new version takes over, so an
 *   update can never interrupt a workout in progress.
 * - Precache requests bypass the HTTP cache ({cache: 'reload'}) so a stale index.html from the CDN
 *   can't end up inside a new version's cache.
 */

const VERSION = '__ATLAS_VERSION__';
const BUILD_ID = '__ATLAS_BUILD_ID__';
const PRECACHE = self.__ATLAS_PRECACHE__;
const CACHE_PREFIX = 'atlas-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE.map((entry) => new Request(entry.url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION, buildId: BUILD_ID });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // App shell: every navigation gets this version's index.html (routes live in the hash).
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(INDEX_URL, { ignoreVary: true });
        if (cached) return cached;
        return fetch(request);
      })(),
    );
    return;
  }

  // Precached assets: cache first. Anything else (e.g. version.json): network, then cache.
  // ignoreVary matters: module scripts are requested with headers (e.g. Origin) that the precache
  // request didn't have, so a server's "Vary" header would otherwise turn every lookup into a miss
  // and silently send the app to the network, which breaks offline use.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (error) {
        const fallback = await caches.match(request, { ignoreVary: true });
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
