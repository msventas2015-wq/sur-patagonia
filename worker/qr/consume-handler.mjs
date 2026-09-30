// Local orchestration only. The deployment adapter supplies the authenticated
// RPC transport and trusted edge identity; this file contains no credentials
// and must not be treated as a deployed route.
import { admitConsumeRequest } from './consume-http.mjs';
import { projectConsumeOutcome } from './consume-outcome.mjs';
import { signResolverCall } from './worker-assertion.mjs';

function rejected(status = 502) {
  return new Response(JSON.stringify({ ok: false, error: 'solicitud_no_valida' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
const unavailable = () => rejected();

// SQLSTATE 40001 proves the transaction was aborted; transport errors and
// timeouts do not. A new one-shot assertion is required for the second call.
function definitelyAborted(error) {
  return error?.code === '40001' && error?.transactionAborted === true;
}

export async function handleConsume(request, context, nowMillis = () => Date.now()) {
  if (typeof nowMillis !== 'function') return unavailable();
  let admitted;
  try {
    admitted = await admitConsumeRequest(
      request, context, Math.floor(nowMillis() / 1000),
    );
  } catch {
    return unavailable();
  }
  if (!admitted.ok) return admitted.response;
  if (typeof context?.callResolver !== 'function' || !context?.assertion) {
    return unavailable();
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const signed = await signResolverCall(
        admitted.plan, context.assertion, nowMillis(),
      );
      const outcome = await context.callResolver(signed);
      return projectConsumeOutcome(
        outcome, admitted.plan, context, Math.floor(nowMillis() / 1000),
      );
    } catch (error) {
      if (attempt === 0 && definitelyAborted(error)) continue;
      if (error?.transactionAborted === true && error.code === 'QR_CLAIM_EXPIRED') {
        return rejected(400);
      }
      if (error?.transactionAborted === true && error.code === 'QR_IDEMPOTENCY_CONFLICT') {
        return rejected(409);
      }
      return unavailable();
    }
  }
  return unavailable();
}
