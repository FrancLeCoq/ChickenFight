const CACHE = 'chickenfight-v1.0.0';
const ASSETS = [
  './','index.html','styles.css','js/app.js','manifest.webmanifest',
  'assets/francis-default.webp','assets/francis-happy.webp','assets/francis-sad.webp',
  'assets/valet.webp','assets/reine.webp','assets/roi.webp',
  'assets/icon-192.png','assets/icon-512.png'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response;
  }).catch(()=>caches.match('index.html'))));
});
