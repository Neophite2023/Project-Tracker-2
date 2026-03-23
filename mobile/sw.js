const CACHE_NAME = 'tracker-v15';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './icon.svg',
  './icon.png',
  './../shared/store.js',
  './../shared/projects.js',
  './../shared/ui-helpers.js',
  './../shared/task-helpers.js'
];

const OPTIONAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Use addAll for core assets but wrap in try/catch to not fail if icon.png is missing yet
    for (const asset of CORE_ASSETS) {
      try {
        await cache.add(asset);
      } catch (err) {
        console.warn(`Failed to cache ${asset}:`, err);
      }
    }
    await Promise.allSettled(OPTIONAL_ASSETS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API calls
  if (url.pathname.includes('/api/')) return;

  // For navigation requests, always try index.html first if cached
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (err) {
        const cachedPage = await caches.match('./index.html');
        return cachedPage;
      }
    })());
    return;
  }

  // Cache first strategy for assets
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response && response.status === 200 && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      return new Response('Offline content not available', { status: 503 });
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME) {
          return caches.delete(cacheName);
        }
        return Promise.resolve();
      })
    );
    await self.clients.claim();
  })());
});
