import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaPageviewTransport} from '../../worker/qr/qa-pageview-transport.mjs';
const origin='https://rsjwqmpseknvydistgfr.supabase.co';
const key = 'eyJ' + 'A'.repeat(16) + '.eyJ' + 'B'.repeat(16) + '.' + 'C'.repeat(16);
const args={p_ambiente:'qa',p_request_id:'00000000-0000-4000-8000-000000000001',
  p_payload_hash:new Uint8Array(32),p_payload_key_id:'v1',p_landing_id:null,p_path:'/',
  p_propiedad_id:null,p_proyecto_slug:null,p_network_hash:new Uint8Array(32),
  p_cookie_scan_state:'within_limit',p_cookie_family_count:0,p_cookie_family_bytes:0,
  p_cookie_candidates:[],p_assertion_kid:'assert',p_assertion_ts:'2026-09-21T15:00:00.000000Z',
  p_assertion_nonce:'00000000-0000-4000-8000-000000000002',p_worker_assertion:new Uint8Array(32)};
const call={rpc:'qr_pageview_registrar_interno_v1',args};
const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
test('QA pageview transport is closed and serializes only exact bytea fields',async()=>{
  let seen;const transport=createQaPageviewTransport({origin,serviceRoleKey:key,
    fetchImpl:async(url,options)=>{seen={url,options};return reply(200,{ok:true,resultado:'pageview_direct',replayed:false});}});
  assert.equal((await transport(call)).ok,true);
  assert.equal(seen.url,`${origin}/rest/v1/rpc/qr_pageview_registrar_interno_v1`);
  const body=JSON.parse(seen.options.body);assert.match(body.p_payload_hash,/^\\x[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(body,'p_canal_ref'),false);
  await assert.rejects(transport({...call,args:{...args,p_canal_ref:'forged'}}));
});
test('QA pageview transport exposes only proven abort/conflict classes',async()=>{
  const aborted=createQaPageviewTransport({origin,serviceRoleKey:key,
    fetchImpl:async()=>reply(500,{code:'40001'})});
  await assert.rejects(aborted(call),e=>e.code==='40001'&&e.transactionAborted);
  const conflict=createQaPageviewTransport({origin,serviceRoleKey:key,
    fetchImpl:async()=>reply(400,{code:'P0001',message:'QR_IDEMPOTENCY_CONFLICT'})});
  await assert.rejects(conflict(call),e=>e.code==='QR_IDEMPOTENCY_CONFLICT'&&e.transactionAborted);
});
