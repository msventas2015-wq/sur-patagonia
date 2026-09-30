// Closed projection of the committed resolver outcome. Database-private
// handoff evidence is used only to reconstruct the original cookie; it is
// never returned to the browser.
import { deriveHandoff } from './handoff.mjs';

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KID = /^[A-Za-z0-9_-]{1,32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SLOT = /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_outcome');
  const found = Object.keys(value);
  if (found.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('invalid_outcome');
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
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

function validatedSlots(value) {
  if (!Array.isArray(value) || value.some(slot => typeof slot !== 'string' || !SLOT.test(slot))
    || new Set(value).size !== value.length) throw new Error('invalid_clear_slots');
  return value;
}

function appendExpired(response, slots, context) {
  const secure = context.cookiePrefix === '__Host-sp_attr_' ? '; Secure' : '';
  for (const slot of slots) {
    response.headers.append('Set-Cookie', `${context.cookiePrefix}${slot}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }
}

const generic = status => json(status, {
  ok: false,
  error: status === 404 ? 'contenido_no_disponible' : 'solicitud_no_valida',
});

function safeLanding(destino, landing) {
  exactKeys(landing, ['landing_id', 'pageview_request_id', 'path', 'propiedad_id', 'proyecto_slug']);
  if (!UUID4.test(landing.landing_id) || !UUID4.test(landing.pageview_request_id)) throw new Error('invalid_landing');

  const property = /^\/propiedad\.html\?id=([0-9a-f-]{36})$/.exec(destino);
  if (property) {
    if (!UUID4.test(property[1]) || landing.path !== '/propiedad' || landing.propiedad_id !== property[1]
      || landing.proyecto_slug !== null) throw new Error('invalid_landing');
    return landing;
  }

  if (['/', '/propiedades', '/proyectos', '/servicios'].includes(destino)) {
    if (landing.path !== destino || landing.propiedad_id !== null
      || landing.proyecto_slug !== null) throw new Error('invalid_landing');
    return landing;
  }

  const project = /^\/proyecto-mini\?slug=([a-z0-9][a-z0-9-]*)$/.exec(destino)
    || /^\/([a-z0-9][a-z0-9-]*)$/.exec(destino);
  if (project) {
    if (!SLUG.test(project[1]) || landing.path !== '/proyecto-mini' || landing.propiedad_id !== null
      || landing.proyecto_slug !== project[1]) throw new Error('invalid_landing');
    return landing;
  }

  throw new Error('invalid_landing');
}

function outcomeConfig(plan, context) {
  if (!plan || plan.rpc !== 'qr_resolver_registrar_interno_v1' || !plan.args
    || !UUID4.test(plan.args.p_request_id) || typeof plan.args.p_ambiente !== 'string'
    || !(plan.args.p_handoff_hash instanceof Uint8Array)
    || plan.args.p_handoff_hash.length !== 32
    || !['within_limit', 'overflow'].includes(plan.args.p_cookie_scan_state)
    || !Array.isArray(plan.observedCookieSlots)) {
    throw new Error('invalid_plan');
  }
  validatedSlots(plan.observedCookieSlots);
  if (!context || !(context.handoffKeys instanceof Map)
    || !['sp_attr_qa_', '__Host-sp_attr_'].includes(context.cookiePrefix)) throw new Error('invalid_config');
}

async function originalCookie(outcome, plan, context, nowSeconds) {
  exactKeys(outcome.handoff, ['request_id', 'kid', 'hash', 'expires_at']);
  const handoff = outcome.handoff;
  if (handoff.request_id !== plan.args.p_request_id || !UUID4.test(handoff.request_id)
    || !KID.test(handoff.kid) || !HEX64.test(handoff.hash) || typeof handoff.expires_at !== 'string') {
    throw new Error('invalid_handoff');
  }
  const expiresMillis = Date.parse(handoff.expires_at);
  if (!Number.isFinite(expiresMillis)) throw new Error('invalid_handoff');
  const expiresSeconds = Math.floor(expiresMillis / 1000);
  if (expiresSeconds <= nowSeconds
    || (plan.args.p_cookie_scan_state === 'overflow' && outcome.replayed === true)) return null;

  let derived;
  try {
    derived = await deriveHandoff({
      environment: plan.args.p_ambiente,
      requestId: handoff.request_id,
      kid: handoff.kid,
      keys: context.handoffKeys,
    });
  } catch {
    // A retired key may make cookie recovery impossible. Never substitute the
    // current key or slide the expiry; the committed commercial entry remains.
    return null;
  }
  if (derived.handoffHash !== handoff.hash) throw new Error('handoff_mismatch');
  if (outcome.replayed === false && (
    handoff.kid !== plan.args.p_handoff_key_id
    || handoff.hash !== Array.from(plan.args.p_handoff_hash, byte => byte.toString(16).padStart(2, '0')).join('')
  )) throw new Error('fresh_handoff_mismatch');

  const secure = context.cookiePrefix === '__Host-sp_attr_' ? '; Secure' : '';
  return `${context.cookiePrefix}${derived.slot}=${derived.value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${expiresSeconds - nowSeconds}; Expires=${new Date(expiresSeconds * 1000).toUTCString()}`;
}

export async function projectConsumeOutcome(outcome, plan, context, nowSeconds = Math.floor(Date.now() / 1000)) {
  try {
    outcomeConfig(plan, context);
    if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error('invalid_time');
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) throw new Error('invalid_outcome');

    if (outcome.resultado === 'tracked') {
      exactKeys(outcome, ['ok', 'tracked', 'replayed', 'destino', 'resultado', 'handoff', 'clear_slots', 'landing']);
      if (outcome.ok !== true || outcome.tracked !== true || typeof outcome.replayed !== 'boolean'
        || typeof outcome.destino !== 'string') throw new Error('invalid_outcome');
      const landing = safeLanding(outcome.destino, outcome.landing);
      const databaseClearSlots = validatedSlots(outcome.clear_slots);
      if (outcome.replayed && databaseClearSlots.length !== 0) throw new Error('replay_cannot_clear');
      if (plan.args.p_cookie_scan_state === 'overflow' && databaseClearSlots.length !== 0) {
        throw new Error('overflow_database_clear_forbidden');
      }
      const clearSlots = plan.args.p_cookie_scan_state === 'overflow' && !outcome.replayed
        ? validatedSlots(plan.observedCookieSlots)
        : databaseClearSlots;
      const cookie = await originalCookie(outcome, plan, context, nowSeconds);
      const response = json(200, { ok: true, tracked: true, destino: outcome.destino, landing });
      appendExpired(response, clearSlots, context);
      if (cookie) response.headers.append('Set-Cookie', cookie);
      return response;
    }

    if (outcome.resultado === 'rate_limited') {
      exactKeys(outcome, ['ok', 'tracked', 'replayed', 'resultado', 'http_status', 'clear_slots', 'retry_after']);
      if (outcome.ok !== false || outcome.tracked !== false || typeof outcome.replayed !== 'boolean'
        || outcome.http_status !== 429 || !Number.isSafeInteger(outcome.retry_after)
        || outcome.retry_after < 1 || outcome.retry_after > 120) throw new Error('invalid_outcome');
      const clearSlots = validatedSlots(outcome.clear_slots);
      if (plan.args.p_cookie_scan_state === 'overflow' && clearSlots.length !== 0) throw new Error('overflow_cannot_clear');
      const response = json(429, { ok: false, error: 'intenta_nuevamente' }, { 'Retry-After': String(outcome.retry_after) });
      appendExpired(response, clearSlots, context);
      return response;
    }

    exactKeys(outcome, ['ok', 'tracked', 'replayed', 'resultado', 'http_status']);
    if (outcome.ok !== false || outcome.tracked !== false || typeof outcome.replayed !== 'boolean'
      || !['unknown_or_inactive', 'channel_inactive', 'base_destination_invalid'].includes(outcome.resultado)
      || outcome.http_status !== 404) throw new Error('invalid_outcome');
    return generic(404);
  } catch {
    // A malformed or contradictory database outcome is infrastructure failure,
    // never a public tracked success and never a reason to invent a redirect.
    return generic(502);
  }
}
