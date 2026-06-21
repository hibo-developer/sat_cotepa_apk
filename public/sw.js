const CACHE_VERSION = 'v2';
const CACHE_NAME = `sat-app-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  new URL('./', self.location).toString(),
  new URL('./index.html', self.location).toString(),
  new URL('./manifest.webmanifest', self.location).toString(),
  new URL('./favicon.jpg', self.location).toString(),
];

function esActivoEstatico(url) {
  if (!url || url.origin !== self.location.origin) return false;
  if (url.pathname.endsWith('/app-config.js')) return false;
  if (url.pathname.includes('/assets/')) return true;
  return /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|json|webmanifest)$/i.test(url.pathname);
}

async function networkOnlyNoStore(request) {
  const noStoreRequest = new Request(request, { cache: 'no-store' });
  return fetch(noStoreRequest);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      PRECACHE_URLS.map(async (url) => {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response);
        }
      }),
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('sat-app-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/app-config.js')) {
    event.respondWith(networkOnlyNoStore(request));
    return;
  }

  if (request.mode === 'navigate') {
    const indexUrl = new URL('./index.html', self.location).toString();
    event.respondWith((async () => {
      try {
        return await networkFirst(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(indexUrl);
        if (cached) return cached;
        return Response.error();
      }
    })());
    return;
  }

  if (esActivoEstatico(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith((async () => {
    try {
      return await networkFirst(request);
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || Response.error();
    }
  })());
});
