// Replacement for the service worker of the old /sydney-birds/ address.
// It removes itself, then sends any open pages to the new address. It leaves caches alone:
// they are shared across the whole site, and the root app's own worker tidies them.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    for (const client of clients) client.navigate('/').catch(() => {});
  })());
});
