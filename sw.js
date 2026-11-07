const CACHE_NAME = 'wallet-cache-v9';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Install the app shell atomically; optional CDN outages must not block upgrades.
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(EXTERNAL_ASSETS.map((url) => cache.add(url)));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter(
          (cacheName) =>
            cacheName.startsWith('wallet-cache-') &&
            cacheName !== CACHE_NAME
        )
        .map((cacheName) => caches.delete(cacheName))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (
    request.method !== 'GET' ||
    new URL(request.url).protocol === 'chrome-extension:'
  ) {
    return;
  }

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';

  if (!isSameOrigin && !EXTERNAL_ASSETS.includes(request.url)) {
    return;
  }

  if (isSameOrigin || isNavigation) {
    // Network-first keeps HTML and app code fresh while retaining an offline fallback.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const freshRequest = new Request(request, { cache: 'no-cache' });
        const response = await fetch(freshRequest);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        if (isNavigation) {
          return (await cache.match('./index.html')) || Response.error();
        }
        return Response.error();
      }
    })());
    return;
  }

  // CDN libraries use network-first too, so online refreshes can update cached copies.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
