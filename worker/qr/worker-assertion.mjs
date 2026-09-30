// Server-to-database one-shot assertion for the resolver writer. This module
// never accepts browser fields and never exposes the assertion key.
import { concat, int64, lp, uint32, uuidBytes } from './codec.mjs';

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KID = /^[A-Za-z0-9_-]{1,32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const RESOLVER_ENDPOINT = 'qr_resolver_registrar_interno_v1';
const CONTACT_ENDPOINT = 'qr_contacto_registrar_interno_v1';

const fromHex = value => {
  if (typeof value !== 'string' || !HEX64.test(value)) throw new Error('invalid_hex32');
  return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
};

const bytes32 = (value, error = 'invalid_bytes32') => {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new Error(error);
  return value;
};

const micros = value => {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error('invalid_timestamp');
  return BigInt(millis) * 1000n;
};

function candidateBytes(candidates) {
  if (!Array.isArray(candidates)) throw new Error('invalid_candidates');
  return concat(uint32(candidates.length), ...candidates.map(candidate => {
    if (!candidate || Object.keys(candidate).sort().join(',') !== 'hash,kid,slot'
      || typeof candidate.slot !== 'string' || !/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(candidate.slot)
      || !KID.test(candidate.kid)) throw new Error('invalid_candidate');
    const requestId = `${candidate.slot.slice(0,8)}-${candidate.slot.slice(8,12)}-${candidate.slot.slice(12,16)}-${candidate.slot.slice(16,20)}-${candidate.slot.slice(20)}`;
    return concat(uuidBytes(requestId), fromHex(candidate.hash), lp(candidate.kid));
  }));
}

function resolverArgs(plan) {
  if (!plan || plan.rpc !== RESOLVER_ENDPOINT || !plan.args) throw new Error('invalid_plan');
  const a = plan.args;
  if (typeof a.p_ambiente !== 'string' || !a.p_ambiente || !UUID4.test(a.p_request_id)
    || typeof a.p_codigo !== 'string' || typeof a.p_via !== 'string'
    || typeof a.p_payload_key_id !== 'string' || typeof a.p_handoff_key_id !== 'string'
    || typeof a.p_cookie_scan_state !== 'string'
    || !Number.isSafeInteger(a.p_cookie_family_count) || !Number.isSafeInteger(a.p_cookie_family_bytes)) {
    throw new Error('invalid_plan');
  }
  return a;
}

const nullableText=value=>value===null
  ? new Uint8Array([0])
  : concat(new Uint8Array([1]),lp(value));
const nullableUuid=value=>value===null
  ? new Uint8Array([0])
  : concat(new Uint8Array([1]),uuidBytes(value));

function contactArgs(plan) {
  if(!plan||plan.rpc!==CONTACT_ENDPOINT||!plan.args) throw new Error('invalid_plan');
  const a=plan.args;
  if(typeof a.p_ambiente!=='string'||!a.p_ambiente||!UUID4.test(a.p_request_id)
    ||typeof a.p_payload_key_id!=='string'||typeof a.p_nombre!=='string'
    ||(a.p_email!==null&&typeof a.p_email!=='string')
    ||(a.p_telefono!==null&&typeof a.p_telefono!=='string')
    ||typeof a.p_mensaje!=='string'
    ||(a.p_propiedad_id!==null&&!UUID.test(a.p_propiedad_id))
    ||(a.p_proyecto_slug!==null&&typeof a.p_proyecto_slug!=='string')
    ||typeof a.p_fuente!=='string'||typeof a.p_cookie_scan_state!=='string'
    ||!Number.isSafeInteger(a.p_cookie_family_count)
    ||!Number.isSafeInteger(a.p_cookie_family_bytes)) throw new Error('invalid_plan');
  return a;
}

export function resolverArgumentsBytes(plan) {
  const a = resolverArgs(plan);
  return concat(
    lp('qr-resolver-args-v1'), lp(a.p_ambiente), uuidBytes(a.p_request_id),
    bytes32(a.p_payload_hash), lp(a.p_payload_key_id), lp(a.p_codigo), bytes32(a.p_codigo_hash),
    lp(a.p_via), bytes32(a.p_network_hash), bytes32(a.p_handoff_hash), lp(a.p_handoff_key_id),
    int64(micros(a.p_claim_expires_at)), lp(a.p_cookie_scan_state),
    int64(BigInt(a.p_cookie_family_count)), int64(BigInt(a.p_cookie_family_bytes)),
    candidateBytes(a.p_cookie_candidates),
  );
}

export async function resolverArgumentsHash(plan) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', resolverArgumentsBytes(plan)));
}

export function contactArgumentsBytes(plan) {
  const a=contactArgs(plan);
  return concat(
    lp('qr-contact-args-v1'),lp(a.p_ambiente),uuidBytes(a.p_request_id),
    bytes32(a.p_payload_hash),lp(a.p_payload_key_id),lp(a.p_nombre),
    nullableText(a.p_email),nullableText(a.p_telefono),lp(a.p_mensaje),
    nullableUuid(a.p_propiedad_id),nullableText(a.p_proyecto_slug),lp(a.p_fuente),
    bytes32(a.p_network_hash),lp(a.p_cookie_scan_state),
    int64(BigInt(a.p_cookie_family_count)),int64(BigInt(a.p_cookie_family_bytes)),
    candidateBytes(a.p_cookie_candidates),
  );
}

export async function contactArgumentsHash(plan) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256',contactArgumentsBytes(plan)));
}

export function assertionTimestamp(nowMillis) {
  if (!Number.isSafeInteger(nowMillis) || nowMillis < 0) throw new Error('invalid_time');
  return new Date(nowMillis).toISOString().replace(/(\.\d{3})Z$/, '$1000Z');
}

export async function signResolverCall(plan, context, nowMillis = Date.now(), nonce = crypto.randomUUID()) {
  const a = resolverArgs(plan);
  if (!context || !KID.test(context.currentKid) || !(context.keys instanceof Map) || !UUID4.test(nonce)) {
    throw new Error('invalid_assertion_context');
  }
  const rawKey = context.keys.get(context.currentKid);
  bytes32(rawKey, 'missing_assertion_key');
  const timestamp = assertionTimestamp(nowMillis);
  const argumentsHash = await resolverArgumentsHash(plan);
  const message = concat(
    lp('qr-worker-assert-v1'), lp(a.p_ambiente), lp(RESOLVER_ENDPOINT), uuidBytes(a.p_request_id),
    lp(context.currentKid), lp(timestamp), uuidBytes(nonce), argumentsHash,
  );
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assertion = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  return {
    rpc: plan.rpc,
    args: {
      ...a,
      p_assertion_kid: context.currentKid,
      p_assertion_ts: timestamp,
      p_assertion_nonce: nonce,
      p_worker_assertion: assertion,
    },
  };
}

export async function signContactCall(plan,context,nowMillis=Date.now(),nonce=crypto.randomUUID()) {
  const a=contactArgs(plan);
  if(!context||!KID.test(context.currentKid)||!(context.keys instanceof Map)||!UUID4.test(nonce)) {
    throw new Error('invalid_assertion_context');
  }
  const rawKey=context.keys.get(context.currentKid);
  bytes32(rawKey,'missing_assertion_key');
  const timestamp=assertionTimestamp(nowMillis);
  const argumentsHash=await contactArgumentsHash(plan);
  const message=concat(
    lp('qr-worker-assert-v1'),lp(a.p_ambiente),lp(CONTACT_ENDPOINT),uuidBytes(a.p_request_id),
    lp(context.currentKid),lp(timestamp),uuidBytes(nonce),argumentsHash,
  );
  const key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const assertion=new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
  return {rpc:plan.rpc,args:{...a,p_assertion_kid:context.currentKid,
    p_assertion_ts:timestamp,p_assertion_nonce:nonce,p_worker_assertion:assertion}};
}
