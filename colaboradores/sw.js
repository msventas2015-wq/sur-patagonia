const CACHE_NAME = 'sur-patagonia-aliados-v8';
const CACHE_PREFIX = 'sur-patagonia-aliados-';

const STATIC_ASSETS = [
  '/assets/app-icon-192.png',
  '/assets/app-icon-512.png',
  '/assets/app-icon-maskable-512.png',
  '/assets/app-icon-180.png',
  '/assets/logohorizontalnegro.png',
  '/assets/ChatGPT Image 19 jun 2026, 23_34_52.png',
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
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Dejar pasar todo lo que no sea GET
  if (req.method !== 'GET') return;

  // Dejar pasar Supabase (auth, DB, realtime, storage)
  if (url.hostname.includes('supabase.co')) return;

  // Dejar pasar requests con Authorization
  if (req.headers.has('authorization')) return;

  // Dejar pasar CDNs externos (Chart.js, Leaflet, Google Fonts, etc.)
  const isTransitionHost = url.hostname === 'surpatagonian.com' ||
    url.hostname === 'www.surpatagonian.com' ||
    url.hostname === 'surpatagonia.com.ar' ||
    url.hostname === 'www.surpatagonia.com.ar';
  if (!isTransitionHost && url.origin !== self.location.origin) return;

  // HTML interno de colaboradores → siempre red primero
  const isInternalHtml =
    req.mode === 'navigate' ||
    (
      url.pathname.startsWith('/colaboradores/') &&
      (
        url.pathname.endsWith('.html') ||
        url.pathname === '/colaboradores/'
      )
    );

  if (isInternalHtml) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Recursos estáticos propios → cache first
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
