// Closed QA-only transport for the consultation RPC. Never bundle this module
// into a public page: the credential is injected from the Worker secret store.
import { qaServiceHeaders } from './qa-api-key.mjs';
const QA_ORIGIN = 'https://rsjwqmpseknvydistgfr.supabase.co';
const RPC_NAME = 'qr_contacto_registrar_interno_v1';
const ARGS = [
  'p_ambiente','p_request_id','p_payload_hash','p_payload_key_id',
  'p_nombre','p_email','p_telefono','p_mensaje','p_propiedad_id',
  'p_proyecto_slug','p_fuente','p_network_hash','p_cookie_scan_state',
  'p_cookie_family_count','p_cookie_family_bytes','p_cookie_candidates',
  'p_assertion_kid','p_assertion_ts','p_assertion_nonce','p_worker_assertion',
];
function bytea(value) {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new Error('invalid_rpc_bytes');
  return `\\x${Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
function closedCall(call) {
  if (!call || call.rpc !== RPC_NAME || !call.args ||
    Object.keys(call.args).sort().join(',') !== [...ARGS].sort().join(',')) {
    throw new Error('invalid_rpc_call');
  }
  const args = { ...call.args };
  if (args.p_ambiente !== 'qa' || !Array.isArray(args.p_cookie_candidates)) {
    throw new Error('invalid_rpc_call');
  }
  for (const field of ['p_payload_hash','p_network_hash','p_worker_assertion']) {
    args[field] = bytea(args[field]);
  }
  return args;
}
async function jsonWithinLimit(response) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw new Error('invalid_rpc_response');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || BigInt(declared) > 4096n)) {
    throw new Error('rpc_response_too_large');
  }
  if (!response.body) throw new Error('empty_rpc_response');
  const reader = response.body.getReader();
  const parts = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('rpc_response_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createQaContactTransport({ origin, serviceRoleKey, fetchImpl }) {
  if (origin !== QA_ORIGIN || typeof fetchImpl !== 'function') {
    throw new Error('invalid_qa_rpc_config');
  }
  const credentialHeaders = qaServiceHeaders(serviceRoleKey);
  return async function callContact(call) {
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
    } catch { throw new Error('rpc_transport_uncertain'); }
    const body = await jsonWithinLimit(response);
    if (!response.ok) {
      if (body?.code === '40001') {
        const error = new Error('rpc_serialization_aborted');
        error.code = '40001'; error.transactionAborted = true;
        throw error;
      }
      if (body?.code === 'P0001' && body.message === 'QR_IDEMPOTENCY_CONFLICT') {
        const error = new Error('rpc_idempotency_conflict');
        error.code = 'QR_IDEMPOTENCY_CONFLICT'; error.transactionAborted = true;
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
