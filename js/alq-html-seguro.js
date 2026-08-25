(function instalarAlqSeguridad(global) {
  'use strict';

  const ENTIDADES_HTML = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  });

  function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ENTIDADES_HTML[caracter]);
  }

  function esUuid(valor) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(valor ?? ''));
  }

  Object.defineProperty(global, 'AlqSeguridad', {
    value: Object.freeze({ escaparHtml, esUuid }),
    enumerable: false,
    configurable: false,
    writable: false
  });
})(typeof window === 'undefined' ? globalThis : window);
