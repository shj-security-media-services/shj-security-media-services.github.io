/* SPA80 service worker v1. Caches ONLY the static shell allowlist below.
   Never caches API calls (cross-origin POSTs to n8n are not intercepted), queries or navigations with a hash/query. */
const SHELL_VERSION = 'spa80-v1-f808b987d4d8c2f9';
const SCOPE_URL = new URL(self.registration.scope);
const CACHE_PREFIX = 'SPA80-Static:' + encodeURIComponent(SCOPE_URL.pathname) + ':';
const CACHE_NAME = CACHE_PREFIX + SHELL_VERSION;
const STATIC_FILES = Object.freeze([
  'index.html', 'styles.css', 'app.mjs', 'core.mjs', 'cache.mjs', 'shapes.mjs', 'config.mjs',
  'token.mjs', 'api-real.mjs', 'mock-api.mjs', 'search.mjs', 'icon.svg', 'manifest.webmanifest'
]);
const STATIC_URLS = STATIC_FILES.map(name => new URL(name, SCOPE_URL).href);
const ALLOWED = new Set(STATIC_URLS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existed = (await caches.keys()).includes(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(STATIC_URLS.map(url => new Request(url, {cache: 'reload', credentials: 'omit', redirect: 'error'})));
    } catch (error) {
      if (!existed) await caches.delete(CACHE_NAME);
      throw error;
    }
    // No skipWaiting: open tabs keep their coherent release until closed.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  const rootNavigation = url.href === SCOPE_URL.href && request.mode === 'navigate';
  if (url.origin !== SCOPE_URL.origin || url.search || (!ALLOWED.has(url.href) && !rootNavigation)) return;
  const cacheUrl = rootNavigation ? new URL('index.html', SCOPE_URL).href : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheUrl);
    return hit || fetch(request); // shell file missing from cache: plain network, nothing stored
  })());
});
