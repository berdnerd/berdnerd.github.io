// Replacement for the service worker of the old /sydney-birds/ address.
// It removes itself and the old caches, then sends any open pages to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    for (const client of clients) client.navigate('/').catch(() => {});
  })());
});
