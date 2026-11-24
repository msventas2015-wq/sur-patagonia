const CACHE_PREFIX = 'sur-patagonia-admin-';
const CACHE_NAME = CACHE_PREFIX + 'v11';

// Los módulos del creador pueden cambiar sin que cambie la URL de sus imports.
const MINIWEB_MODULES = new Set([
  '/js/brochure-proyecto.mjs',
  '/js/ficha-lote-recorrido.mjs',
  '/js/miniweb-360.mjs',
  '/js/miniweb-blocks.mjs',
  '/js/miniweb-design.mjs',
  '/js/miniweb-editor.mjs',
  '/js/miniweb-effects.mjs',
  '/js/miniweb-selector.mjs',
  '/js/miniweb.mjs',
  '/js/recorrido-constructor.mjs',
  '/js/recorrido-detalle-terreno.mjs',
  '/js/recorrido-escena.mjs',
  '/js/recorrido-medios.mjs',
  '/js/recorrido-paseo-editor.mjs',
  '/js/recorrido-paseo.mjs',
  '/js/recorrido-visor-medios.mjs',
  '/js/terrazas-comercial.mjs',
]);

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

  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (req.headers.has('authorization')) return;
  const isTransitionHost = url.hostname === 'surpatagonian.com' ||
    url.hostname === 'www.surpatagonian.com' ||
    url.hostname === 'surpatagonia.com.ar' ||
    url.hostname === 'www.surpatagonia.com.ar';
  if (!isTransitionHost && url.origin !== self.location.origin) return;

  // HTML del admin → siempre red primero
  if (url.pathname.startsWith('/admin/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // CSS → siempre red primero (evita servir estilos viejos tras deploy)
  if (url.pathname.startsWith('/css/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Revalidar incluso las URL con un sello de versión anterior. Conservar
  // la última respuesta válida para cuando el administrador esté sin conexión.
  if (url.origin === self.location.origin && MINIWEB_MODULES.has(url.pathname)) {
    event.respondWith(fetch(req, { cache: 'no-cache' }).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(req)) || Response.error()));
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
