// Loaded synchronously before any application code in the staging artifact.
(() => {
  'use strict';
  const config = __STAGING_CONFIG__;
  if (location.origin !== config.origin) {
    document.documentElement.innerHTML = '<p>Entorno de pruebas no válido.</p>';
    throw new Error('staging_host_mismatch');
  }
  const originalFetch = window.fetch.bind(window);
  function target(value) {
    return new URL(value instanceof Request ? value.url : value, location.href);
  }
  function allowedNetwork(url) {
    return url.origin === config.origin || url.origin === config.databaseOrigin ||
      ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',
       'https://unpkg.com', 'https://apis.datos.gob.ar', 'https://api.bcra.gob.ar'].includes(url.origin);
  }
  const sendsAuthEmail = url => url.origin === config.databaseOrigin &&
    /^\/auth\/v1\/(recover|otp|signup|resend)(\/|$)/.test(url.pathname);
  window.fetch = async (input, options) => {
    const url = target(input);
    if (!allowedNetwork(url) || sendsAuthEmail(url)) throw new Error('staging_outbound_blocked');
    // Until QA data and structure are reviewed, do not open the data plane.
    if (!config.dataReady && (url.origin === config.databaseOrigin || url.pathname.startsWith('/api/'))) {
      throw new Error('staging_data_not_ready');
    }
    return originalFetch(input, options);
  };
  const originalOpen = window.open.bind(window);
  const canNavigate = value => {
    if (!value) return true; // Blank window used for printing local PDFs.
    const url = target(value);
    return url.origin === config.origin || url.protocol === 'blob:';
  };
  window.open = (url, ...args) => {
    if (!canNavigate(url)) { alert('Salida externa deshabilitada en pruebas.'); return null; }
    return originalOpen(url, ...args);
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (anchor && !canNavigate(anchor.href)) {
      event.preventDefault(); event.stopImmediatePropagation();
      alert('Contacto externo deshabilitado en pruebas.');
    }
  }, true);
  document.addEventListener('submit', event => {
    if (!canNavigate(event.target.action)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const originalXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const parsed = target(url);
    if (!allowedNetwork(parsed) || sendsAuthEmail(parsed) || (!config.dataReady && (parsed.origin === config.databaseOrigin || parsed.pathname.startsWith('/api/')))) {
      throw new Error('staging_outbound_blocked');
    }
    return originalXHR.call(this, method, url, ...args);
  };
  const OriginalWebSocket = window.WebSocket;
  if (OriginalWebSocket) {
    window.WebSocket = class extends OriginalWebSocket {
      constructor(url, protocols) {
        const parsed = target(url);
        if (!config.dataReady || parsed.origin !== config.databaseOrigin.replace('https:', 'wss:')) {
          throw new Error('staging_outbound_blocked');
        }
        super(url, protocols);
      }
    };
  }
  navigator.sendBeacon = () => false;
  window.dataLayer = [];
  window.gtag = () => {};
  // Production service workers must never cache or intercept this environment.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister()));
    navigator.serviceWorker.register = async () => { throw new Error('staging_service_worker_disabled'); };
  }
  window.__SP_STAGING__ = Object.freeze(config);
  document.addEventListener('DOMContentLoaded', () => {
    document.title = '[PRUEBAS] ' + document.title;
    const badge = document.createElement('aside');
    badge.id = 'sp-staging-badge';
    badge.textContent = 'ENTORNO DE PRUEBAS · Mensajes externos deshabilitados';
    badge.setAttribute('aria-label', 'Identificación del entorno de pruebas');
    badge.style.cssText = 'position:fixed;bottom:.5rem;left:.5rem;z-index:2147483647;max-width:calc(100% - 1rem);padding:.5rem .75rem;border:1px solid currentColor;background:Canvas;color:CanvasText;font:12px system-ui;pointer-events:none';
    document.body.append(badge);
  }, {once:true});
})();
