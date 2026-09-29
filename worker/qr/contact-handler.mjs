// Local consultation orchestration. The commercial writer is the sole source
// of attribution; browser cookies are untrusted candidates, never a channel.
import { readContactRequest } from './contact-http.mjs';
import { prepareContactPlan } from './contact-plan.mjs';
import { signContactCall } from './worker-assertion.mjs';

function answer(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extra,
    },
  });
}
const unavailable = () => answer(502, { ok: false, error: 'solicitud_no_valida' });
const invalid = () => answer(400, { ok: false, error: 'solicitud_no_valida' });

function project(outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)
    || Object.keys(outcome).sort().join(',') !== 'ok,replayed,resultado'
    && Object.keys(outcome).sort().join(',') !== 'ok,replayed,resultado,retry_after'
    || typeof outcome.replayed !== 'boolean') return unavailable();
  if (outcome.ok === true && outcome.resultado === 'contacto_creado'
    && !Object.hasOwn(outcome, 'retry_after')) return answer(201, { ok: true });
  if (outcome.ok === false && outcome.resultado === 'payload_invalid'
    && !Object.hasOwn(outcome, 'retry_after')) return invalid();
  if (outcome.ok === false && outcome.resultado === 'rate_limited'
    && Number.isSafeInteger(outcome.retry_after)
    && outcome.retry_after >= 1 && outcome.retry_after <= 600) {
    return answer(429, { ok: false, error: 'intenta_nuevamente' },
      { 'Retry-After': String(outcome.retry_after) });
  }
  return unavailable();
}

// Only a server-confirmed 40001 abort is safe to retry within this request.
// An uncertain transport timeout may follow a committed consultation; the
// browser's same-UUID replay, not a new UUID, resolves that uncertainty.
export async function handleContact(request, context, nowMillis = () => Date.now()) {
  const read = await readContactRequest(request, context);
  if (!read.accepted) return read.response;
  if (typeof context?.getNormalizedEdgeIp !== 'function'
    || typeof context?.callContact !== 'function' || !context?.assertion
    || typeof nowMillis !== 'function') return unavailable();

  let plan;
  try {
    plan = await prepareContactPlan({
      payload: read.payload,
      cookieHeader: request.headers.get('cookie'),
      normalizedEdgeIp: () => context.getNormalizedEdgeIp(request),
    }, context);
  } catch { return unavailable(); }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const signed = await signContactCall(plan, context.assertion, nowMillis());
      return project(await context.callContact(signed));
    } catch (error) {
      if (attempt === 0 && error?.code === '40001'
        && error?.transactionAborted === true) continue;
      if (error?.code === 'QR_IDEMPOTENCY_CONFLICT'
        && error?.transactionAborted === true) {
        return answer(409, { ok: false, error: 'solicitud_no_valida' });
      }
      return unavailable();
    }
  }
  return unavailable();
}
