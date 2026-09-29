// Same-origin pageview orchestration. The database alone authenticates the
// handoff and decides tracked/direct; the browser never submits a channel.
import { readPageviewRequest } from './pageview-http.mjs';
import { preparePageviewPlan } from './pageview-plan.mjs';
import { signPageviewCall } from './pageview-assertion.mjs';

function answer(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  }});
}
const unavailable = () => answer(502, { ok: false, error: 'solicitud_no_valida' });

function expireOverflowFamily(response, plan, context) {
  if (plan.args.p_landing_id !== null || plan.args.p_cookie_scan_state !== 'overflow') return;
  const secure = context.cookiePrefix === '__Host-sp_attr_' ? '; Secure' : '';
  for (const slot of plan.familySlots) response.headers.append('Set-Cookie',
    `${context.cookiePrefix}${slot}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function project(outcome, plan, context) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)
    || typeof outcome.replayed !== 'boolean') return unavailable();
  const keys = Object.keys(outcome).sort().join(',');
  if (outcome.ok === true
    && ['landing_absorbed','pageview_tracked','pageview_direct'].includes(outcome.resultado)
    && keys === 'ok,replayed,resultado') {
    const response = answer(200, { ok: true });
    expireOverflowFamily(response, plan, context);
    return response;
  }
  if (outcome.ok === false && outcome.resultado === 'payload_invalid'
    && keys === 'ok,replayed,resultado') {
    return answer(400, { ok: false, error: 'solicitud_no_valida' });
  }
  if (outcome.ok === false && outcome.resultado === 'rate_limited'
    && keys === 'ok,replayed,resultado,retry_after'
    && Number.isSafeInteger(outcome.retry_after)
    && outcome.retry_after >= 1 && outcome.retry_after <= 120) {
    return answer(429, { ok: false, error: 'intenta_nuevamente' },
      { 'Retry-After': String(outcome.retry_after) });
  }
  return unavailable();
}

export async function handlePageview(request, context, nowMillis = () => Date.now()) {
  const read = await readPageviewRequest(request, context);
  if (!read.accepted) return read.response;
  if (typeof context?.getNormalizedEdgeIp !== 'function'
    || typeof context?.callPageview !== 'function' || !context?.assertion
    || typeof nowMillis !== 'function') return unavailable();
  let plan;
  try {
    plan = await preparePageviewPlan({ payload: read.payload,
      cookieHeader: request.headers.get('cookie'),
      normalizedEdgeIp: () => context.getNormalizedEdgeIp(request) }, context);
  } catch { return unavailable(); }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const signed = await signPageviewCall(plan, context.assertion, nowMillis());
      return project(await context.callPageview(signed), plan, context);
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
