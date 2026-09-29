import test from 'node:test';
import assert from 'node:assert/strict';
import { observedRoute,runBootstrap,STATE_KEY,LANDING_KEY } from '../../js/qr-bootstrap-core.mjs';
const landing={landing_id:'00000000-0000-4000-8000-000000000001',pageview_request_id:'00000000-0000-4000-8000-000000000002',path:'/',propiedad_id:null,proyecto_slug:null};
const tracked={ok:true,tracked:true,destino:'/',landing};
const pure={ok:true,tracked:false,destino:'/',landing:null};
const init={ok:true,init:'v1.test.aabb',expires_at:1120};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function harness(replies,state=null) {
  const calls=[],navigations=[],statuses=[],storage=new Map();
  const e={history:{state,replaceState(next){this.state=structuredClone(next);}},location:{href:'http://localhost:8787/r/test-qr',replace(x){navigations.push(x);}},storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},now:()=>1000000,setTimeout,clearTimeout,status:x=>statuses.push(x),config:{rpcUrl:'https://rsjwqmpseknvydistgfr.supabase.co/rest/v1/rpc/qr_resolver_anon_v1',anonKey:'test-public-key'},fetch:async(url,options)=>{calls.push({url,...options});const reply=replies.shift();if(reply instanceof Error)throw reply;if(typeof reply==='function')return reply();return reply;}};
  return {e,calls,navigations,statuses,storage};
}
test('canonical path and exact query, not a permissive query parser',()=>{
  assert.deepEqual(observedRoute('http://localhost/r/AbC/?via=link#ignored'),{codigo:'abc',via:'link',path:'/r/abc?via=link'});
  for(const code of ['ab','-ab','ab-','--','a'.repeat(80)]) assert.equal(observedRoute('http://localhost/r/'+code).codigo,code);
  for(const route of ['/r/abc?','/r/abc?via=qr','/r/abc?via=link&x=1','/r/abc?via=LINK','/r/a','/r/'+ 'a'.repeat(81),'/r/%61bc','/r/abc//','/r/abc/def']) assert.throws(()=>observedRoute('http://localhost'+route),route);
});
test('normal tracked flow writes complete landing once and preserves unrelated state',async()=>{
  const h=harness([response(init),response(tracked)],{other:'preserved'});
  const [a,b]=await Promise.all([runBootstrap(h.e),runBootstrap(h.e)]);
  assert.deepEqual(a,b);assert.equal(h.calls.length,2);assert.deepEqual(h.navigations,['/']);
  assert.deepEqual(JSON.parse(h.storage.get(LANDING_KEY)),landing);assert.equal(h.e.history.state.other,'preserved');
  assert.equal(h.e.history.state[STATE_KEY].owned_landing_id,landing.landing_id);
});
test('lost consume response retries identical claim, not init or new UUID',async()=>{
  const h=harness([response(init),new Error('lost'),response(tracked)]);
  await runBootstrap(h.e);assert.equal(h.calls.length,3);
  assert.equal(h.calls[1].body,h.calls[2].body);assert.equal(h.e.history.state[STATE_KEY].attempts,2);
});
test('two lost consume responses use pure fallback with omitted credentials',async()=>{
  const h=harness([response(init),new Error('lost'),new Error('lost'),response(pure)]);
  await runBootstrap(h.e);assert.equal(h.calls.length,4);assert.deepEqual(h.navigations,['/']);
  assert.equal(h.calls[3].credentials,'omit');assert.deepEqual(JSON.parse(h.calls[3].body),{p_codigo:'test-qr'});
  assert.equal(h.storage.has(LANDING_KEY),false);assert.equal(h.e.history.state[STATE_KEY].phase,'terminal');
});
test('reload of in-flight state spends only remaining consume attempt',async()=>{
  const h=harness([response(tracked)],{[STATE_KEY]:{version:1,path:'/r/test-qr',phase:'consuming',attempts:1,init:init.init,expires_at:init.expires_at}});
  await runBootstrap(h.e);assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/qr/consume');
});
test('expired, terminal and init-in-flight states never mint another claim',async()=>{
  for(const phase of ['terminal','init_enviado','consuming']){
    const h=harness([response(pure)],{[STATE_KEY]:{version:1,path:'/r/test-qr',phase,attempts:1,init:init.init,expires_at:999}});
    await runBootstrap(h.e);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/qr_resolver_anon_v1$/);
  }
});
test('hard errors including 429 do not bypass through fallback',async()=>{
  for(const status of [400,404,409,413,415,405,429]){
    const h=harness([response(init),response({},status)]);await runBootstrap(h.e);
    assert.equal(h.calls.length,2);assert.equal(h.navigations.length,0);
  }
});
test('failed history persistence forbids consume; failed landing storage does not lose tracked destination',async()=>{
  const badHistory=harness([response(pure)]);badHistory.e.history.replaceState=()=>{throw Error('blocked');};
  await runBootstrap(badHistory.e);assert.equal(badHistory.calls.length,1);assert.match(badHistory.calls[0].url,/qr_resolver_anon_v1$/);
  const badStorage=harness([response(init),response(tracked)]);badStorage.e.storage.setItem=()=>{throw Error('blocked');};
  await runBootstrap(badStorage.e);assert.equal(badStorage.calls.length,2);assert.deepEqual(badStorage.navigations,['/']);
});
test('fallback never clears landing owned by another opening',async()=>{
  const h=harness([new Error('init unavailable'),response(pure)]);h.storage.set(LANDING_KEY,JSON.stringify(landing));
  await runBootstrap(h.e);assert.deepEqual(JSON.parse(h.storage.get(LANDING_KEY)),landing);
});
test('server destination must match landing; no external or contaminated navigation',async()=>{
  for(const destino of ['https://evil.invalid/','//evil.invalid/','/propiedades?canal=x','/\\evil.invalid','/propiedades']){
    const h=harness([response(init),response({...tracked,destino}),response({...tracked,destino}),response({},404)]);
    await runBootstrap(h.e);assert.equal(h.navigations.length,0);
  }
});
function clock(h) {
  let sequence=0;
  const timers=new Map();
  h.e.setTimeout=fn=>{const id=++sequence;timers.set(id,fn);return id;};
  h.e.clearTimeout=id=>timers.delete(id);
  return {timers,expire(){assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('late committed response after two timeouts cannot replace the fallback destination or pending',async()=>{
  let first,second;
  const h=harness([response(init),()=>new Promise(r=>{first=r;}),()=>new Promise(r=>{second=r;}),response({...pure,destino:'/propiedades'})]);
  const c=clock(h);const running=runBootstrap(h.e);
  await flush();assert.equal(h.calls.length,2);c.expire();
  await flush();assert.equal(h.calls.length,3);c.expire();
  assert.deepEqual(await running,{status:'navigated',destino:'/propiedades'});
  first(response(tracked));second(response(tracked));await flush();
  assert.deepEqual(h.navigations,['/propiedades']);assert.equal(h.storage.has(LANDING_KEY),false);
  assert.equal(h.calls[1].body,h.calls[2].body);assert.equal(c.timers.size,0);
});
test('timeout includes response body, and an expired claim is not retried',async()=>{
  let lateBody;
  const h=harness([response(init),{status:200,headers:new Headers({'Content-Type':'application/json'}),json:()=>new Promise(r=>{lateBody=r;})},response(pure)]);
  const c=clock(h);const running=runBootstrap(h.e);await flush();
  h.e.now=()=>1121000;c.expire();await running;
  assert.equal(h.calls.length,3);assert.match(h.calls[2].url,/qr_resolver_anon_v1$/);
  lateBody(tracked);await flush();assert.deepEqual(h.navigations,['/']);assert.equal(h.storage.has(LANDING_KEY),false);
});
test('navigation failure after accepted tracked outcome never starts pure fallback',async()=>{
  const h=harness([response(init),response(tracked)]);
  h.e.location.replace=()=>{throw Error('navigation unavailable');};
  assert.deepEqual(await runBootstrap(h.e),{status:'navigation_failed',destino:'/'});
  assert.equal(h.calls.length,2);assert.deepEqual(h.statuses,['navigation_failed']);
  assert.deepEqual(JSON.parse(h.storage.get(LANDING_KEY)),landing);
});
test('reload preserves rejection and rate-limit notice, never bypasses to pure resolver',async()=>{
  for(const code of [400,404,405,409,413,415,401,403,429]) {
    const rejected=response({},code);rejected.headers.set('Retry-After','60');
    const first=harness([response(init),rejected]);await runBootstrap(first.e);
    const second=harness([],structuredClone(first.e.history.state));await runBootstrap(second.e);
    assert.equal(second.calls.length,0);assert.equal(second.navigations.length,0);
    assert.deepEqual(second.statuses,[code===429?'limited':'rejected']);
    if(code===429) assert.equal(second.e.history.state[STATE_KEY].retry_after_until,1060);
  }
});
test('technical HTML 404/405 permit degradation; functional JSON and auth/rate do not',async()=>{
  for(const code of [404,405]) {
    const unavailable=()=>new Response('<html>unavailable</html>',{status:code,headers:{'Content-Type':'text/html'}});
    const initDown=harness([unavailable(),response(pure)]);await runBootstrap(initDown.e);
    assert.equal(initDown.calls.length,2);assert.deepEqual(initDown.navigations,['/']);
    const consumeDown=harness([response(init),unavailable(),unavailable(),response(pure)]);await runBootstrap(consumeDown.e);
    assert.equal(consumeDown.calls.length,4);assert.equal(consumeDown.calls[1].body,consumeDown.calls[2].body);
    const functional=harness([response({},code)]);await runBootstrap(functional.e);
    assert.equal(functional.calls.length,1);assert.deepEqual(functional.statuses,['rejected']);
  }
  for(const code of [401,403,429]) {
    const h=harness([new Response('blocked',{status:code})]);await runBootstrap(h.e);
    assert.equal(h.calls.length,1);assert.equal(h.navigations.length,0);
  }
});
test('link declaration and address canonicalization preserve the opening state',async()=>{
  const h=harness([response(init),response(pure)]);h.e.location.href='http://localhost/r/TEST-QR/?via=link#discard';
  const urls=[];h.e.history.replaceState=function(next,title,path){this.state=structuredClone(next);urls.push(path);};
  await runBootstrap(h.e);
  assert.deepEqual(JSON.parse(h.calls[0].body),{version:1,codigo:'test-qr',via:'link'});
  assert.ok(urls.length>0);assert.ok(urls.every(url=>url==='/r/test-qr?via=link'));
});
test('init 5xx degrades, consume 5xx retries same claim, unlisted 4xx stays rejected',async()=>{
  const a=harness([response({},503),response(pure)]);await runBootstrap(a.e);assert.equal(a.calls.length,2);
  const b=harness([response(init),response({},500),response({},503),response(pure)]);await runBootstrap(b.e);
  assert.equal(b.calls.length,4);assert.equal(b.calls[1].body,b.calls[2].body);
  const c=harness([response(init),response({},402)]);await runBootstrap(c.e);
  assert.equal(c.calls.length,2);assert.deepEqual(c.statuses,['rejected']);
});
