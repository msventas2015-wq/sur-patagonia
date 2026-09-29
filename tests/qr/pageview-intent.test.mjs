import test from 'node:test';
import assert from 'node:assert/strict';
import {pageviewIntent, releaseLandingAfterAck} from '../../js/qr-pageview-intent.mjs';
import {LANDING_KEY} from '../../js/qr-bootstrap-core.mjs';
const id1='00000000-0000-4000-8000-000000000001';
const id2='00000000-0000-4000-8000-000000000002';
const id3='00000000-0000-4000-8000-000000000003';
const home={path:'/',propiedad_id:null,proyecto_slug:null};
const landing={landing_id:id1,pageview_request_id:id2,...home};
function store(value) {
  const map = new Map(value === undefined ? [] : [[LANDING_KEY,JSON.stringify(value)]]);
  return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
test('matching landing retains both server IDs until confirmed, including reload after lost ACK',()=>{
  const storage=store(landing), scope={};
  const first=pageviewIntent(scope,home,storage,()=>{throw Error('must not mint');});
  assert.equal(first.request_id,id2);assert.equal(first.landing_id,id1);
  assert.equal(pageviewIntent(scope,home,storage),first);
  assert.deepEqual(pageviewIntent({},home,storage),first);
  assert.equal(releaseLandingAfterAck(scope),true);
  assert.equal(storage.getItem(LANDING_KEY),null);
  assert.equal(pageviewIntent(scope,home,storage),first);
  const refreshed=pageviewIntent({},home,storage,()=>id3);
  assert.equal(refreshed.landing_id,null);assert.equal(refreshed.request_id,id3);
});
test('mismatched route or content abandons old pending without reusing its UUID',()=>{
  for(const context of [{...home,path:'/propiedades'},{path:'/propiedad',propiedad_id:id3,proyecto_slug:null},{path:'/proyecto-mini',propiedad_id:null,proyecto_slug:'proyecto-sintetico'}]) {
    const storage=store(landing);
    const payload=pageviewIntent({},context,storage,()=>id3);
    assert.equal(payload.landing_id,null);assert.equal(payload.request_id,id3);
    assert.equal(storage.getItem(LANDING_KEY),null);
  }
});
test('blocked storage degrades; duplicate components still have one navigation identity',()=>{
  const storage={getItem(){throw Error('blocked');}}, scope={};let minted=0;
  const first=pageviewIntent(scope,home,storage,()=>{minted++;return id3;});
  assert.equal(pageviewIntent(scope,home,storage),first);assert.equal(minted,1);
  assert.equal(first.landing_id,null);assert.equal(releaseLandingAfterAck(scope),false);
  assert.throws(()=>{first.request_id=id1;},TypeError);
});
test('late ACK never deletes a different opening or changed snapshot',()=>{
  for(const changed of [{...landing,landing_id:id3},{...landing,pageview_request_id:id3},{...landing,path:'/proyectos'}]) {
    const scope={},storage=store(landing);pageviewIntent(scope,home,storage);
    storage.setItem(LANDING_KEY,JSON.stringify(changed));
    assert.equal(releaseLandingAfterAck(scope),false);
    assert.deepEqual(JSON.parse(storage.getItem(LANDING_KEY)),changed);
  }
});
test('no administrative routes, identity fields, extra keys or invalid content combinations',()=>{
  for(const bad of [{...home,path:'/admin'},{...home,canal_ref:'fake'},{...home,propiedad_id:id1},{path:'/propiedad',propiedad_id:null,proyecto_slug:null},{path:'/proyecto-mini',propiedad_id:null,proyecto_slug:'../escape'}]) {
    assert.throws(()=>pageviewIntent({},bad,store()),/invalid_pageview_context/);
  }
  assert.throws(()=>pageviewIntent({},home,store(),()=> 'client-guessed'),/invalid_pageview_uuid/);
  const scope={};pageviewIntent(scope,home,store(),()=>id1);
  assert.throws(()=>pageviewIntent(scope,{...home,path:'/servicios'},store()),/document_context_changed/);
});
