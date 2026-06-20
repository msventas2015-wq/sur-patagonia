const CACHE_NAME = 'sur-patagonia-admin-v1';

const STATIC_ASSETS = [
  '/assets/admin-icon-192.png',
  '/assets/admin-icon-512.png',
  '/assets/admin-icon-maskable-512.png',
  '/assets/admin-icon-180.png',
  '/assets/logohorizontalnegro.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (req.headers.has('authorization')) return;
  if (!url.origin.includes('surpatagonia.com.ar') && url.origin !== self.location.origin) return;

  // HTML del admin → siempre red primero
  if (url.pathname.startsWith('/admin/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Recursos estáticos → cache first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return res;
    }))
  );
});
