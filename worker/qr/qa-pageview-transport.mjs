// Closed QA-only transport for the pageview writer.
import { qaServiceHeaders } from './qa-api-key.mjs';
const QA_ORIGIN='https://rsjwqmpseknvydistgfr.supabase.co';
const RPC='qr_pageview_registrar_interno_v1';
const ARGS=['p_ambiente','p_request_id','p_payload_hash','p_payload_key_id',
  'p_landing_id','p_path','p_propiedad_id','p_proyecto_slug','p_network_hash',
  'p_cookie_scan_state','p_cookie_family_count','p_cookie_family_bytes',
  'p_cookie_candidates','p_assertion_kid','p_assertion_ts','p_assertion_nonce',
  'p_worker_assertion'];
const BYTEA=['p_payload_hash','p_network_hash','p_worker_assertion'];
function bytea(value) {
  if (!(value instanceof Uint8Array)||value.length!==32) throw Error('invalid_rpc_bytes');
  return `\\x${Array.from(value,b=>b.toString(16).padStart(2,'0')).join('')}`;
}
function closed(call) {
  if(!call||call.rpc!==RPC||!call.args
    ||Object.keys(call.args).sort().join(',')!==[...ARGS].sort().join(',')) {
    throw Error('invalid_rpc_call');
  }
  const args={...call.args};
  if(args.p_ambiente!=='qa'||!Array.isArray(args.p_cookie_candidates)) throw Error('invalid_rpc_call');
  for(const field of BYTEA) args[field]=bytea(args[field]);
  return args;
}
async function body(response) {
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')) throw Error('invalid_rpc_response');
  const text=await response.text();
  if(new TextEncoder().encode(text).length>4096) throw Error('rpc_response_too_large');
  return JSON.parse(text);
}
export function createQaPageviewTransport({origin,serviceRoleKey,fetchImpl}) {
  if(origin!==QA_ORIGIN||typeof fetchImpl!=='function') throw Error('invalid_qa_rpc_config');
  const credentials=qaServiceHeaders(serviceRoleKey);
  return async call=>{
    const args=closed(call); let response;
    try { response=await fetchImpl(`${QA_ORIGIN}/rest/v1/rpc/${RPC}`,{
      method:'POST',headers:{...credentials,'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},body:JSON.stringify(args)
    }); } catch { throw Error('rpc_transport_uncertain'); }
    const value=await body(response);
    if(!response.ok) {
      if(value?.code==='40001') {const e=Error('rpc_serialization_aborted');e.code='40001';e.transactionAborted=true;throw e;}
      if(value?.code==='P0001'&&value.message==='QR_IDEMPOTENCY_CONFLICT') {const e=Error('rpc_idempotency_conflict');e.code='QR_IDEMPOTENCY_CONFLICT';e.transactionAborted=true;throw e;}
      throw Error('rpc_rejected');
    }
    if(!value||typeof value!=='object'||Array.isArray(value)) throw Error('invalid_rpc_response');
    return value;
  };
}
