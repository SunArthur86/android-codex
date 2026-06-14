/**
 * Codex Mobile — Service Worker
 * Enables offline PWA functionality on Android
 * Cache-first strategy for static assets, network-first for API
 */

const CACHE_VERSION = 'codex-mob-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/mobile.css',
  './js/app.js',
  './js/agent/loop.js',
  './js/api/glm.js',
  './js/files/file-manager.js',
  './js/terminal/mobile-term.js',
  './js/editor/code-viewer.js',
  './js/analysis/reverse.js',
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strategy based on request type ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin (API calls, CDN fonts)
  if (url.origin !== self.location.origin) return;

  // Skip API calls (GLM endpoint)
  if (url.pathname.includes('/api/')) return;

  // Cache-first for static assets
  if (STATIC_ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/')))) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Message: handle skipWaiting from page ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
