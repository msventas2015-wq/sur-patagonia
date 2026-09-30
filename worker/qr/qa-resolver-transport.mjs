// QA-only service-role transport for the single audited resolver RPC. This is
// not an HTTP route, a generic database client, or a production deployment.
// The service credential must be supplied by the Worker secret store.
import { qaServiceHeaders } from './qa-api-key.mjs';
const QA_ORIGIN = 'https://rsjwqmpseknvydistgfr.supabase.co';
const RPC_NAME = 'qr_resolver_registrar_interno_v1';
const BYTEA = [
  'p_payload_hash', 'p_codigo_hash', 'p_network_hash',
  'p_handoff_hash', 'p_worker_assertion',
];
const ARGUMENTS = [
  'p_ambiente', 'p_request_id', 'p_payload_hash', 'p_payload_key_id',
  'p_codigo', 'p_codigo_hash', 'p_via', 'p_network_hash',
  'p_handoff_hash', 'p_handoff_key_id', 'p_claim_expires_at',
  'p_cookie_scan_state', 'p_cookie_family_count', 'p_cookie_family_bytes',
  'p_cookie_candidates', 'p_assertion_kid', 'p_assertion_ts',
  'p_assertion_nonce', 'p_worker_assertion',
];

function bytea(value) {
  if (!(value instanceof Uint8Array) || value.length !== 32) {
    throw new Error('invalid_rpc_bytes');
  }
  return `\\x${Array.from(value, x => x.toString(16).padStart(2, '0')).join('')}`;
}

function closedCall(call) {
  if (!call || call.rpc !== RPC_NAME || !call.args
    || Object.keys(call.args).sort().join(',') !== [...ARGUMENTS].sort().join(',')) {
    throw new Error('invalid_rpc_call');
  }
  const args = { ...call.args };
  for (const field of BYTEA) args[field] = bytea(args[field]);
  if (args.p_ambiente !== 'qa' || !Array.isArray(args.p_cookie_candidates)) {
    throw new Error('invalid_rpc_call');
  }
  return args;
}

async function boundedJson(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('invalid_rpc_response');
  }
  const limit = 32768;
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || BigInt(length) > BigInt(limit))) {
    throw new Error('rpc_response_too_large');
  }
  if (!response.body) throw new Error('empty_rpc_response');
  const reader = response.body.getReader();
  let size = 0;
  const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('rpc_response_too_large');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { raw.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
}

export function createQaResolverTransport({ origin, serviceRoleKey, fetchImpl }) {
  if (origin !== QA_ORIGIN || typeof fetchImpl !== 'function') {
    throw new Error('invalid_qa_rpc_config');
  }
  const credentialHeaders = qaServiceHeaders(serviceRoleKey);
  return async function callResolver(call) {
    const args = closedCall(call);
    let response;
    try {
      response = await fetchImpl(`${QA_ORIGIN}/rest/v1/rpc/${RPC_NAME}`, {
        method: 'POST',
        headers: {
          ...credentialHeaders,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(args),
      });
    } catch {
      // A transport failure can occur after COMMIT. The browser may replay
      // the same sealed claim; this adapter must not infer rollback.
      throw new Error('rpc_transport_uncertain');
    }
    const body = await boundedJson(response);
    if (!response.ok) {
      if (body && body.code === '40001') {
        const error = new Error('rpc_serialization_aborted');
        error.code = '40001';
        error.transactionAborted = true;
        throw error;
      }
      if (body?.code === 'P0001'
        && ['QR_CLAIM_EXPIRED', 'QR_IDEMPOTENCY_CONFLICT'].includes(body.message)) {
        const error = new Error('rpc_closed_rejection');
        error.code = body.message;
        error.transactionAborted = true;
        throw error;
      }
      throw new Error('rpc_rejected');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid_rpc_response');
    }
    return body;
  };
}
