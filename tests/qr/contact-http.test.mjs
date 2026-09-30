import test from 'node:test';
import assert from 'node:assert/strict';
import {readContactRequest} from '../../worker/qr/contact-http.mjs';

const context={origin:'https://qa.example.invalid',host:'qa.example.invalid'};
const payload={version:1,request_id:'00000000-0000-4000-8000-000000000001',nombre:'  QA   Test ',email:'QA@EXAMPLE.INVALID',mensaje:'Consulta sintética',propiedad_id:null,proyecto_slug:null,fuente:'home_form'};
function req({method='POST',path='/api/contacto',headers={},body=JSON.stringify(payload)}={}) {
  return new Request(context.origin+path,{method,headers:{host:context.host,origin:context.origin,'content-type':'application/json',...headers},...(method==='GET'||method==='HEAD'?{}:{body,duplex:'half'})});
}
async function rejected(request,status,ctx=context) {
  const result=await readContactRequest(request,ctx);
  assert.equal(result.accepted,false); assert.equal(result.response.status,status);
  assert.deepEqual(await result.response.json(),{ok:false,error:'solicitud_no_valida'});
  assert.equal(result.response.headers.get('cache-control'),'no-store');
  assert.equal(result.response.headers.get('set-cookie'),null);
  return result.response;
}

test('contact HTTP route/method precede host, content type and body parsing',async()=>{
  const wrong=req({method:'PUT',headers:{host:'wrong',origin:'wrong','content-type':'text/plain'},body:'not json'});
  assert.equal((await rejected(wrong,405)).headers.get('allow'),'POST');
  assert.equal(wrong.bodyUsed,false);
  await rejected(req({path:'/api/other'}),404);
  await rejected(req({method:'GET'}),405,null);
  await rejected(req(),503,{origin:'https://qa.example.invalid/path',host:context.host});
});

test('same origin/host and content type are enforced before reading body',async()=>{
  for(const headers of [{host:''},{origin:''},{host:'else.invalid'},{origin:'https://other.invalid'},{origin:context.origin+', '+context.origin}]) {
    const r=req({headers}); await rejected(r,400); assert.equal(r.bodyUsed,false);
  }
  await rejected(req({path:'/api/contacto?canal=forged'}),400);
  for(const type of ['text/plain','application/json; charset=iso-8859-1','application/json, text/plain']) await rejected(req({headers:{'content-type':type}}),415);
});

test('streamed size is checked independently from Content-Length',async()=>{
  await rejected(req({headers:{'content-length':'16385'}}),413);
  await rejected(req({headers:{'content-length':'-1'}}),400);
  let cancelled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;}});
  await rejected(req({headers:{'content-length':'1'},body}),413);
  assert.equal(cancelled,true);
  await rejected(req({body:new Uint8Array([0xc3,0x28])}),400);
});

test('hostile schema and duplicate keys never produce an accepted request',async()=>{
  for(const body of [JSON.stringify({...payload,canal_ref:'forged'}),JSON.stringify(payload).replace('"version":1','"version":1,"version":1'),'[]','null','\ufeff'+JSON.stringify(payload)]) await rejected(req({body}),400);
});

test('valid admission normalizes data but never claims commit or decides attribution',async()=>{
  const result=await readContactRequest(req({headers:{'content-type':'application/json; charset=utf-8'}}),context);
  assert.equal(result.accepted,true);
  assert.equal(result.payload.nombre,'QA Test'); assert.equal(result.payload.email,'QA@example.invalid');
  assert.equal(Object.hasOwn(result,'response'),false);
  assert.equal(Object.hasOwn(result.payload,'canal_ref'),false);
  assert.equal(result.payload.request_id,payload.request_id);
  const semantic=await readContactRequest(req({body:JSON.stringify({...payload,fuente:'propiedad_form'})}),context);
  assert.equal(semantic.accepted,true); // invalid content matrix is DB/ledger work, not syntax.
});
