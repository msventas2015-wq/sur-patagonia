// Pure preparation for POST /api/qr/consume. This module opens the sealed
// claim and derives the proofs passed to the single transactional RPC. It
// performs no network request, database write, cookie mutation or redirect.
import { concat, lp } from './codec.mjs';
import { exactKeys, strictJson } from './strict-json.mjs';
import { openClaim } from './init.mjs';
import { deriveHandoff, scanFamily } from './handoff.mjs';
import { hashPayload } from './payload-codec.mjs';

const CODE = /^[a-z0-9-]{2,80}$/;
const NETWORK_IDENTITY = /^[0-9A-Fa-f:.]{2,64}$/;

function key32(value, error) {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new Error(error);
  return value.slice();
}

function hex32(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('invalid_handoff_hash');
  }
  return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
}

async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    key32(keyBytes, 'invalid_rate_key'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
}

export function parseConsumePayload(bytes) {
  const payload = strictJson(bytes, 511);
  exactKeys(payload, ['version', 'init']);
  if (payload.version !== 1 || typeof payload.init !== 'string' || payload.init.length === 0 || payload.init.length > 400) {
    throw new Error('invalid_consume_schema');
  }
  return { version: 1, init: payload.init };
}

// `normalizedEdgeIp` is an input from the trusted edge adapter. This module
// intentionally does not accept forwarding headers or invent IPv6
// canonicalization rules. The integration gate must prove that normalization.
export async function deriveRatePseudonyms({ environment, codigo, normalizedEdgeIp, rateKey }) {
  if (typeof environment !== 'string' || environment.length === 0 || environment.length > 32) throw new Error('invalid_environment');
  if (typeof codigo !== 'string' || !CODE.test(codigo)) throw new Error('invalid_code');
  if (typeof normalizedEdgeIp !== 'string' || !NETWORK_IDENTITY.test(normalizedEdgeIp)) throw new Error('invalid_network_identity');
  const prefix = concat(lp('qr-rate-v1'), lp(environment));
  const [networkHash, codigoHash] = await Promise.all([
    hmacSha256(rateKey, concat(prefix, lp('network'), lp(normalizedEdgeIp))),
    hmacSha256(rateKey, concat(prefix, lp('code'), lp(codigo))),
  ]);
  return { networkHash, codigoHash };
}

function consumeConfig(context) {
  if (!context || !context.init || typeof context.init.environment !== 'string') throw new Error('invalid_consume_config');
  if (!['sp_attr_qa_', '__Host-sp_attr_'].includes(context.cookiePrefix)) throw new Error('invalid_consume_config');
  if (typeof context.handoffCurrentKid !== 'string' || !(context.handoffKeys instanceof Map)) throw new Error('invalid_consume_config');
  key32(context.rateKey, 'invalid_consume_config');
  key32(context.payloadKey, 'invalid_consume_config');
}

// The returned structure is an internal plan, not a public response and not a
// second source of business truth. The future adapter must submit it once to
// qr_resolver_registrar_interno_v1 and use that RPC outcome as the sole
// authority for destination, landing, cookie cleanup and HTTP projection.
export async function prepareConsumePlan(
  { body, cookieHeader = null, normalizedEdgeIp },
  context,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  consumeConfig(context);
  const payload = parseConsumePayload(body);
  const opened = await openClaim(payload.init, context.init, nowSeconds);
  // The callback is deliberately delayed until after bytes/schema/claim have
  // passed. An invalid public request must not even enter edge identity work.
  const trustedNetworkIdentity = typeof normalizedEdgeIp === 'function'
    ? await normalizedEdgeIp()
    : normalizedEdgeIp;
  const [rate, handoff, cookies, payloadIdentity] = await Promise.all([
    deriveRatePseudonyms({
      environment: context.init.environment,
      codigo: opened.codigo,
      normalizedEdgeIp: trustedNetworkIdentity,
      rateKey: context.rateKey,
    }),
    deriveHandoff({
      environment: context.init.environment,
      requestId: opened.request_id,
      kid: context.handoffCurrentKid,
      keys: context.handoffKeys,
    }),
    scanFamily(cookieHeader, { prefix: context.cookiePrefix }),
    hashPayload({
      environment: context.init.environment,
      operation: 'resolver',
      fields: [
        ['request_id', 'uuid', opened.request_id],
        ['codigo', 'text', opened.codigo],
        ['via', 'text', opened.via],
        ['version', 'int64', 1n],
      ],
      key: context.payloadKey,
    }),
  ]);

  return {
    rpc: 'qr_resolver_registrar_interno_v1',
    args: {
      p_ambiente: context.init.environment,
      p_request_id: opened.request_id,
      p_payload_hash: payloadIdentity.payload_hash,
      p_payload_key_id: payloadIdentity.payload_key_id,
      p_codigo: opened.codigo,
      p_codigo_hash: rate.codigoHash,
      p_via: opened.via,
      p_network_hash: rate.networkHash,
      // SQL bytea and the assertion codec both require the raw 32 bytes;
      // candidate JSON hashes remain hex by their separate closed contract.
      p_handoff_hash: hex32(handoff.handoffHash),
      p_handoff_key_id: handoff.kid,
      p_claim_expires_at: new Date(opened.expires_at * 1000).toISOString(),
      p_cookie_scan_state: cookies.state,
      p_cookie_family_count: cookies.count,
      p_cookie_family_bytes: cookies.bytes,
      p_cookie_candidates: cookies.candidates.map(candidate => ({
        slot: candidate.requestId.replaceAll('-', ''),
        hash: candidate.handoffHash,
        kid: candidate.kid,
      })),
    },
    responseCookie: {
      prefix: context.cookiePrefix,
      slot: handoff.slot,
      kid: handoff.kid,
      value: handoff.value,
    },
    // Transport-only cleanup inventory. It is never sent to the database and
    // never participates in attribution. It only lets a created admission
    // recover a browser whose own cookie family overflowed.
    observedCookieSlots: cookies.familySlots,
  };
}
