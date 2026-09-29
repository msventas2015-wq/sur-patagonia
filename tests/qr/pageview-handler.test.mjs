import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePageview} from '../../worker/qr/pageview-handler.mjs';

const origin='http://localhost:8787',host='localhost:8787';
const id='00000000-0000-4000-8000-000000000001';
const payload={version:1,request_id:id,landing_id:null,path:'/',propiedad_id:null,proyecto_slug:null};
const context={origin,host,environment:'qa',cookiePrefix:'sp_attr_qa_',
  rateKey:new Uint8Array(32).fill(1),payloadKey:new Uint8Array(32).fill(2),
  assertion:{currentKid:'assert',keys:new Map([['assert',new Uint8Array(32).fill(3)]])},
  getNormalizedEdgeIp:()=> '192.0.2.10'};
const request=(body=payload,cookie=null)=>new Request(`${origin}/api/qr/pageview`,{
  method:'POST',headers:{host,origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});

test('committed pageview projects only public success and never attribution',async()=>{
  let signed;
  const response=await handlePageview(request(),{...context,callPageview:async call=>{
    signed=call;return {ok:true,resultado:'pageview_direct',replayed:false};
  }},()=>1000);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(signed.rpc,'qr_pageview_registrar_interno_v1');
  for(const field of ['p_canal_ref','p_canal_via','p_campana_id'])
    assert.equal(Object.hasOwn(signed.args,field),false);
});

test('landing ACK and closed failures retain their exact public classes',async()=>{
  const ack={...payload,landing_id:'00000000-0000-4000-8000-000000000002'};
  assert.equal((await handlePageview(request(ack),{...context,
    callPageview:async()=>({ok:true,resultado:'landing_absorbed',replayed:false})})).status,200);
  const limited=await handlePageview(request(),{...context,
    callPageview:async()=>({ok:false,resultado:'rate_limited',retry_after:17,replayed:false})});
  assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'17');
  assert.equal((await handlePageview(request(),{...context,
    callPageview:async()=>({ok:false,resultado:'payload_invalid',replayed:false})})).status,400);
});

test('only proven serialization abort retries and unknown transport stays unavailable',async()=>{
  let calls=0;
  const recovered=await handlePageview(request(),{...context,callPageview:async()=>{
    calls++;if(calls===1){const e=Error('abort');e.code='40001';e.transactionAborted=true;throw e;}
    return {ok:true,resultado:'pageview_direct',replayed:false};
  }});
  assert.equal(recovered.status,200);assert.equal(calls,2);
  assert.equal((await handlePageview(request(),{...context,
    callPageview:async()=>{throw Error('lost');}})).status,502);
});
