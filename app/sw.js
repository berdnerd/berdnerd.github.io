// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'v7';
const SHELL_CACHE = `sydney-birds-shell-${VERSION}`;
const MEDIA_CACHE = 'sydney-birds-media';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'data/birds.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'feathers.svg', 'fonts/fredoka.woff2', 'fonts/nunito.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('sydney-birds-shell-') && k !== SHELL_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/media/')) {
    event.respondWith(mediaResponse(event.request, url));
    return;
  }

  // App files: try the network so updates arrive, fall back to the saved copy offline.
  // 'no-cache' makes the browser check with the server instead of reusing its own
  // short-term copy (GitHub Pages lets browsers keep files for 10 minutes unchecked).
  event.respondWith(
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then(hit => hit || caches.match('index.html'))));
});

// Photos and calls never change: serve from cache, saving each one the first time it is used.
async function mediaResponse(request, url) {
  const cache = await caches.open(MEDIA_CACHE);
  const key = url.pathname;
  let full = await cache.match(key);
  if (!full) {
    // Fetch the whole file (not just the requested range) so it can be cached.
    const res = await fetch(key);
    if (!res.ok) return res;
    await cache.put(key, res.clone());
    full = res;
  }
  const range = request.headers.get('range');
  if (!range) return full;

  // Safari asks for audio in byte ranges and won't play it without a 206 reply.
  const blob = await full.blob();
  const [, startText, endText] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = Number(startText || 0);
  const end = endText ? Math.min(Number(endText), blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
