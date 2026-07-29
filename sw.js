const CACHE = 'chickenfight-v2.1.0';
// Core files change on every deploy → served network-first so updates show up.
const CORE = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/fighter-engine.js', 'js/command-system.js', 'js/mugen-loader.js', 'js/cns-interpreter.js', 'js/netcode.js', 'manifest.webmanifest'];
const CHARS = [
  'chars/francis/francis.def',
  'chars/francis/francis.sff',
  'chars/francis/francis.air',
  'chars/francis/francis.cmd',
  'chars/francis/francis.cns',
  'chars/valet/valet.def',
  'chars/valet/valet.sff',
  'chars/valet/valet.air',
  'chars/valet/valet.cmd',
  'chars/valet/valet.cns',
  'chars/reine/reine.def',
  'chars/reine/reine.sff',
  'chars/reine/reine.air',
  'chars/reine/reine.cmd',
  'chars/reine/reine.cns',
  'chars/roi/roi.def',
  'chars/roi/roi.sff',
  'chars/roi/roi.air',
  'chars/roi/roi.cmd',
  'chars/roi/roi.cns',
  'chars/kfm/kfm.def',
  'chars/kfm/kfm.sff',
  'chars/kfm/kfm.air',
  'chars/kfm/kfm.cmd',
  'chars/kfm/kfm.cns',
  'chars/kfm720/kfm720.def',
  'chars/kfm720/kfm720.sff',
  'chars/kfm720/kfm720.air',
  'chars/kfm720/kfm720.cmd',
  'chars/kfm720/kfm720.cns'
];
// Static assets rarely change → cache-first for speed / offline.
const ASSETS = [
  'assets/francis-default.webp', 'assets/francis-happy.webp', 'assets/francis-sad.webp',
  'assets/francis-body.webp', 'assets/francis-head.webp', 'assets/francis-tail.webp',
  'assets/valet.webp', 'assets/reine.webp', 'assets/roi.webp',
  'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', event =>
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([...CORE, ...ASSETS]).then(()=>caches.open(CACHE).then(c=>Promise.allSettled(CHARS.map(u=>c.add(u)))))).then(() => self.skipWaiting())
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
