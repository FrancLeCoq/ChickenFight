const CACHE = 'chickenfight-v1.1.0';
// Core files change on every deploy → served network-first so updates show up.
const CORE = ['./', 'index.html', 'styles.css', 'js/app.js', 'manifest.webmanifest'];
// Static assets rarely change → cache-first for speed / offline.
const ASSETS = [
  'assets/francis-default.webp', 'assets/francis-happy.webp', 'assets/francis-sad.webp',
  'assets/valet.webp', 'assets/reine.webp', 'assets/roi.webp',
  'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', event =>
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([...CORE, ...ASSETS])).then(() => self.skipWaiting())
  )
);

self.addEventListener('activate', event =>
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCore = sameOrigin && (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(?:html|css|js|webmanifest)$/.test(url.pathname)
  );

  if (isCore) {
    // Network-first: always try the freshest HTML/CSS/JS, fall back to cache offline.
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('index.html')))
    );
    return;
  }

  // Cache-first for images / static assets.
  event.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});
