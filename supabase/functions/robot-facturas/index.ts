// ALQ F0 · robot-facturas deshabilitado de forma fail-closed.
// Este stub no importa librerías, no lee secretos, no inicia egreso de red y no toca Gmail,
// Storage, Postgres ni service_role. Reemplaza a v6; nunca restaurar v6.

const BODY = JSON.stringify({
  ok: false,
  code: 'ALQ_F0_ROBOT_DESHABILITADO',
  build: 'alq-f0-robot-facturas-disabled-v1'
});

const HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'pragma': 'no-cache',
  'x-content-type-options': 'nosniff'
});

Deno.serve((_request) =>
  new Response(BODY, { status: 410, headers: HEADERS })
);
