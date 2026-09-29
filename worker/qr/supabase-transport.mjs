import {qaServiceHeaders} from './qa-api-key.mjs';
const SPECS={
  qr_resolver_registrar_interno_v1:{bytes:['p_payload_hash','p_codigo_hash','p_network_hash','p_handoff_hash','p_worker_assertion']},
  qr_contacto_registrar_interno_v1:{bytes:['p_payload_hash','p_network_hash','p_worker_assertion']},
  qr_pageview_registrar_interno_v1:{bytes:['p_payload_hash','p_network_hash','p_worker_assertion']},
};
function bytea(value){if(!(value instanceof Uint8Array)||value.length!==32)throw Error('invalid_rpc_bytes');return `\\x${Array.from(value,b=>b.toString(16).padStart(2,'0')).join('')}`;}
async function read(response){if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw Error('invalid_rpc_response');const raw=await response.text();if(new TextEncoder().encode(raw).length>32768)throw Error('rpc_response_too_large');return JSON.parse(raw);}
export function createSupabaseTransport({origin,serviceRoleKey,fetchImpl,environment}){
  const parsed=new URL(origin);if(parsed.origin!==origin||parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co')||typeof fetchImpl!=='function'||!['qa','prod'].includes(environment))throw Error('invalid_rpc_config');
  const credentials=qaServiceHeaders(serviceRoleKey);
  return async call=>{
    const spec=SPECS[call?.rpc];if(!spec||!call.args||call.args.p_ambiente!==environment)throw Error('invalid_rpc_call');
    const args={...call.args};for(const field of spec.bytes)args[field]=bytea(args[field]);
    let response;try{response=await fetchImpl(`${origin}/rest/v1/rpc/${call.rpc}`,{method:'POST',headers:{...credentials,'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-store'},body:JSON.stringify(args)});}catch{throw Error('rpc_transport_uncertain');}
    const value=await read(response);if(!response.ok){if(value?.code==='40001'){const e=Error('rpc_serialization_aborted');e.code='40001';e.transactionAborted=true;throw e;}if(value?.code==='P0001'&&['QR_CLAIM_EXPIRED','QR_IDEMPOTENCY_CONFLICT'].includes(value.message)){const e=Error('rpc_closed_rejection');e.code=value.message;e.transactionAborted=true;throw e;}throw Error('rpc_rejected');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_rpc_response');return value;
  };
}
