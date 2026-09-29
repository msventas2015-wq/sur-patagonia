// Pageview-specific one-shot Worker assertion. The SQL wrapper must verify
// this exact binary recipe before opening its private transaction context.
import {concat,int64,lp,uint32,uuidBytes} from './codec.mjs';
import {assertionTimestamp} from './worker-assertion.mjs';

const ENDPOINT='qr_pageview_registrar_interno_v1';
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KID=/^[A-Za-z0-9_-]{1,32}$/;
const HEX64=/^[0-9a-f]{64}$/;
const ARGS=['p_ambiente','p_request_id','p_payload_hash','p_payload_key_id',
  'p_landing_id','p_path','p_propiedad_id','p_proyecto_slug','p_network_hash',
  'p_cookie_scan_state','p_cookie_family_count','p_cookie_family_bytes',
  'p_cookie_candidates'];

function bytes32(value) {
  if(!(value instanceof Uint8Array)||value.length!==32) throw Error('invalid_pageview_bytes');
  return value;
}
function nullableUuid(value) {
  if(value===null) return Uint8Array.of(0);
  if(typeof value!=='string'||!UUID.test(value)) throw Error('invalid_pageview_uuid');
  return concat(Uint8Array.of(1),uuidBytes(value));
}
function nullableText(value) {
  if(value===null) return Uint8Array.of(0);
  if(typeof value!=='string'||value!==value.normalize('NFC')) throw Error('invalid_pageview_text');
  return concat(Uint8Array.of(1),lp(value));
}
function candidateBytes(candidates) {
  if(!Array.isArray(candidates)||candidates.length>32) throw Error('invalid_pageview_candidates');
  return concat(uint32(candidates.length),...candidates.map(candidate=>{
    if(!candidate||Object.keys(candidate).sort().join(',')!=='hash,kid,slot'
      ||typeof candidate.slot!=='string'
      ||!/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(candidate.slot)
      ||!KID.test(candidate.kid)||!HEX64.test(candidate.hash)) {
      throw Error('invalid_pageview_candidate');
    }
    const s=candidate.slot;
    const id=`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
    return concat(uuidBytes(id),Uint8Array.from(candidate.hash.match(/../g),x=>parseInt(x,16)),
      lp(candidate.kid));
  }));
}
function args(plan) {
  if(!plan||plan.rpc!==ENDPOINT||!plan.args
    ||Object.keys(plan.args).sort().join(',')!==[...ARGS].sort().join(',')) throw Error('invalid_pageview_plan');
  const a=plan.args;
  if(typeof a.p_ambiente!=='string'||!/^[a-z0-9_-]{1,32}$/.test(a.p_ambiente)
    ||!UUID4.test(a.p_request_id)||a.p_payload_key_id!=='v1'
    ||(a.p_landing_id!==null&&!UUID4.test(a.p_landing_id))
    ||typeof a.p_path!=='string'
    ||(a.p_propiedad_id!==null&&!UUID.test(a.p_propiedad_id))
    ||(a.p_proyecto_slug!==null&&typeof a.p_proyecto_slug!=='string')
    ||!['skipped_landing','within_limit','overflow'].includes(a.p_cookie_scan_state)
    ||!Number.isSafeInteger(a.p_cookie_family_count)||a.p_cookie_family_count<0
    ||!Number.isSafeInteger(a.p_cookie_family_bytes)||a.p_cookie_family_bytes<0
    ||!Array.isArray(a.p_cookie_candidates)
    ||(a.p_landing_id!==null && (a.p_cookie_scan_state!=='skipped_landing'
      ||a.p_cookie_family_count!==0||a.p_cookie_family_bytes!==0
      ||a.p_cookie_candidates.length!==0))
    ||(a.p_landing_id===null && a.p_cookie_scan_state==='skipped_landing')
    ||(a.p_cookie_scan_state==='within_limit'
      &&(a.p_cookie_family_count>32||a.p_cookie_family_bytes>16384
        ||a.p_cookie_candidates.length>a.p_cookie_family_count))
    ||(a.p_cookie_scan_state==='overflow'
      &&(a.p_cookie_candidates.length!==0
        ||!(a.p_cookie_family_count>32||a.p_cookie_family_bytes>16384)))) {
    throw Error('invalid_pageview_plan');
  }
  return a;
}
export function pageviewArgumentsBytes(plan) {
  const a=args(plan);
  return concat(lp('qr-pageview-args-v1'),lp(a.p_ambiente),uuidBytes(a.p_request_id),
    bytes32(a.p_payload_hash),lp(a.p_payload_key_id),nullableUuid(a.p_landing_id),
    lp(a.p_path),nullableUuid(a.p_propiedad_id),nullableText(a.p_proyecto_slug),
    bytes32(a.p_network_hash),lp(a.p_cookie_scan_state),
    int64(BigInt(a.p_cookie_family_count)),int64(BigInt(a.p_cookie_family_bytes)),
    candidateBytes(a.p_cookie_candidates));
}
export async function signPageviewCall(plan,context,nowMillis=Date.now(),nonce=crypto.randomUUID()) {
  const a=args(plan);
  if(!context||!KID.test(context.currentKid)||!(context.keys instanceof Map)
    ||!UUID4.test(nonce)) throw Error('invalid_pageview_assertion_context');
  const keyBytes=bytes32(context.keys.get(context.currentKid));
  const timestamp=assertionTimestamp(nowMillis);
  const argumentsHash=new Uint8Array(await crypto.subtle.digest('SHA-256',pageviewArgumentsBytes(plan)));
  const message=concat(lp('qr-worker-assert-v1'),lp(a.p_ambiente),lp(ENDPOINT),
    uuidBytes(a.p_request_id),lp(context.currentKid),lp(timestamp),
    uuidBytes(nonce),argumentsHash);
  const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
  return {rpc:ENDPOINT,args:{...a,p_assertion_kid:context.currentKid,
    p_assertion_ts:timestamp,p_assertion_nonce:nonce,p_worker_assertion:signature}};
}
