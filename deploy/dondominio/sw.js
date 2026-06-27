self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})));

    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', () => {
  // Dondominio: sin cache offline para evitar que una politica global
  // de max-age del hosting deje obsoleto el service worker publicado.
});