// HTTP admission boundary for consume. Success returns an internal plan; it
// does NOT project a public success until the transactional RPC has committed.
import { concat } from './codec.mjs';
import { prepareConsumePlan } from './consume-plan.mjs';

function response(status, extra = {}) {
  return new Response(JSON.stringify({ ok: false, error: 'solicitud_no_valida' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}

async function boundedBody(request, maximum) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maximum))) throw new RangeError('body_limit');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const pieces = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new RangeError('body_limit');
      }
      pieces.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return concat(...pieces);
}

function contentTypeAccepted(value) {
  return /^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*utf-8)?[ \t]*$/i.test(value ?? '');
}

function boundaryConfig(context) {
  if (!context?.init || typeof context.init.host !== 'string' || typeof context.init.origin !== 'string') throw new Error('invalid_config');
  if (typeof context.getNormalizedEdgeIp !== 'function') throw new Error('invalid_config');
}

export async function admitConsumeRequest(request, context, nowSeconds = Math.floor(Date.now() / 1000)) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/qr/consume') return { ok: false, response: response(404) };
  if (request.method !== 'POST') return { ok: false, response: response(405, { Allow: 'POST' }) };
  try { boundaryConfig(context); } catch { return { ok: false, response: response(503) }; }
  if (
    request.headers.get('host') !== context.init.host
    || request.headers.get('origin') !== context.init.origin
    || url.origin !== context.init.origin
    || url.search
  ) return { ok: false, response: response(400) };
  if (!contentTypeAccepted(request.headers.get('content-type'))) return { ok: false, response: response(415) };

  let body;
  try { body = await boundedBody(request, 511); }
  catch (error) { return { ok: false, response: response(error instanceof RangeError ? 413 : 400) }; }

  try {
    const plan = await prepareConsumePlan({
      body,
      cookieHeader: request.headers.get('cookie'),
      // Do not read CF-Connecting-IP/X-Forwarded-For here. Only the deployed
      // adapter may translate the provider-authenticated edge field.
      normalizedEdgeIp: () => context.getNormalizedEdgeIp(request),
    }, context, nowSeconds);
    return { ok: true, plan };
  } catch {
    return { ok: false, response: response(400) };
  }
}
