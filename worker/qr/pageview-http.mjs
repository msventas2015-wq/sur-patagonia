// Admission boundary only. No database call or public success is possible here.
import { concat } from './codec.mjs';
import { strictJson, exactKeys } from './strict-json.mjs';

const MAX_BODY = 2048;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const GENERAL = new Set(['/', '/propiedades', '/proyectos', '/servicios']);
class BodyLimit extends Error {}

function reject(status, extra = {}) {
  return { accepted: false, response: new Response(JSON.stringify({ ok: false, error: 'solicitud_no_valida' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  }) };
}

async function bodyWithinLimit(request) {
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new Error('invalid_length');
  if (length !== null && BigInt(length) > BigInt(MAX_BODY)) throw new BodyLimit();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('invalid_body');
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new BodyLimit(); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return concat(...parts);
}

export function parsePageviewPayload(bytes) {
  const payload = strictJson(bytes, MAX_BODY);
  exactKeys(payload, [
    'version', 'request_id', 'landing_id', 'path', 'propiedad_id', 'proyecto_slug',
  ]);
  if (payload.version !== 1 || !UUID4.test(payload.request_id)
    || (payload.landing_id !== null && !UUID4.test(payload.landing_id))) {
    throw new Error('invalid_pageview_schema');
  }
  if (GENERAL.has(payload.path)) {
    if (payload.propiedad_id !== null || payload.proyecto_slug !== null) {
      throw new Error('invalid_pageview_content');
    }
  } else if (payload.path === '/propiedad') {
    if (!UUID.test(payload.propiedad_id) || payload.proyecto_slug !== null) {
      throw new Error('invalid_pageview_content');
    }
  } else if (payload.path === '/proyecto-mini') {
    if (payload.propiedad_id !== null || typeof payload.proyecto_slug !== 'string'
      || !SLUG.test(payload.proyecto_slug) || payload.proyecto_slug.length > 120) {
      throw new Error('invalid_pageview_content');
    }
  } else throw new Error('invalid_pageview_path');
  return payload;
}

export async function readPageviewRequest(request, context) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/qr/pageview') return reject(404);
  if (request.method !== 'POST') return reject(405, { Allow: 'POST' });
  let configured;
  try { configured = new URL(context?.origin); } catch { return reject(503); }
  if (typeof context?.host !== 'string'
    || configured.origin !== context.origin || configured.host !== context.host) return reject(503);
  if (url.origin !== context.origin || url.search
    || request.headers.get('host') !== context.host
    || request.headers.get('origin') !== context.origin) return reject(400);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    request.headers.get('content-type') ?? '')) return reject(415);
  try { return { accepted: true, payload: parsePageviewPayload(await bodyWithinLimit(request)) }; }
  catch (error) { return reject(error instanceof BodyLimit ? 413 : 400); }
}
