import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {overlay,securityHeaders,assetPath,assetResponse,qaFetch,startQaServer,syntheticContact,QA_ORIGIN} from '../../scripts/serve-qr-qa.mjs';

test('QA overlay changes endpoints only in memory and removes tracking scripts',()=>{
  const source="const u='https://wajkfydxutptcvvfwrvq.supabase.co'; const p='https://surpatagonian.com';<script>gtag('config','G-test')</script><script src='/js/config.js'></script>";
  const result=overlay(source,'http://127.0.0.1:8799');
  assert.ok(result.includes(QA_ORIGIN));assert.ok(result.includes('http://127.0.0.1:8799'));
  assert.ok(!result.includes('gtag'));assert.ok(result.includes("src='/js/config.js'"));
  assert.ok(source.includes('wajkfydxutptcvvfwrvq'));
});
test('QA headers allow exact fallback RPC, never production or analytics',()=>{
  const csp=securityHeaders(true)['Content-Security-Policy'];
  assert.ok(csp.includes(`${QA_ORIGIN}/rest/v1/rpc/qr_resolver_anon_v1`));
  assert.ok(!/wajkfyd|google|facebook|unsafe-inline/.test(csp));
});
test('QA CRM overlay omits exactly two display fields, only on the CRM path',async()=>{
  const source=await readFile(new URL('../../admin/crm.html',import.meta.url),'utf8');
  const origin='http://127.0.0.1:8799';
  const select='propiedades(id, titulo, codigo_interno)';
  assert.equal(source.split(select).length-1,2);
  const baseline=overlay(source,origin);
  assert.equal(overlay(source,origin,'admin/crm.html'),baseline.replaceAll(select,'propiedades(id, titulo)'));
  for(const path of ['admin/nuevo-canal.html','js/config.js','propiedad.html','']){
    assert.equal(overlay(source,origin,path),baseline);
  }
  assert.throws(()=>overlay(source.replace(select,'changed'),origin,'admin/crm.html'),/qa_crm_overlay_contract_changed/);
  const response=await assetResponse(new Request(origin+'/admin/crm.html'),origin,{allowAdmin:true});
  assert.equal(response.status,200);
  assert.equal(await response.text(),overlay(source,origin,'admin/crm.html'));
  assert.equal(await readFile(new URL('../../admin/crm.html',import.meta.url),'utf8'),source);
});
test('QA overlay preserves the actual property application module byte-for-byte',async()=>{
  const source=await readFile(new URL('../../propiedad.html',import.meta.url),'utf8');
  const result=overlay(source,'http://127.0.0.1:8799');
  const modules=source.match(/<script type="module">[\s\S]*?<\/script>/g);
  const application=modules.find(script=>script.includes('await renderPremium(data)'));
  assert.ok(application.includes("gtag('event'"));
  assert.ok(result.includes(application));
  assert.ok(!result.includes('googletagmanager'));
  assert.ok(!result.includes('connect.facebook.net'));
  assert.ok(!result.includes("gtag('config'"));
  assert.ok(!result.includes("fbq('init'"));
});
test('QA app CSP permits existing Leaflet assets but no tracking endpoints',()=>{
  const csp=securityHeaders()['Content-Security-Policy'];
  assert.ok(csp.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'));
  assert.ok(csp.includes('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'));
  assert.ok(!/googletagmanager|google-analytics|facebook|wajkfyd/.test(csp));
});
test('QA assets deny credentials, SQL, traversal and out-of-scope panels',()=>{
  for(const path of ['/../.env','/%2e%2e/.env','/worker/index.mjs','/scripts/serve-qr-qa.mjs','/admin/usuarios.html','/admin/sw.js','/.git/config'])assert.equal(assetPath(path),null,path);
  assert.equal(assetPath('/r/qa-test'),'qr-bootstrap.html');
  assert.equal(assetPath('/admin/crm'),'admin/crm.html');
});
test('served config points to QA; bootstrap headers also point to QA',async()=>{
  const origin='http://127.0.0.1:8799';
  const config=await assetResponse(new Request(origin+'/js/config.js'),origin);
  const text=await config.text();assert.ok(text.includes(QA_ORIGIN));assert.ok(!text.includes('wajkfydxutptcvvfwrvq'));
  const bootstrap=await assetResponse(new Request(origin+'/r/qa-test'),origin);
  assert.equal(bootstrap.status,200);assert.ok(bootstrap.headers.get('content-security-policy').includes(QA_ORIGIN));
});
test('outbound fetch rejects every non-QA origin and redirects',async()=>{
  let called=0;const fetch=qaFetch(async(u,o)=>{called++;assert.equal(o.redirect,'error');return new Response('{}');});
  assert.throws(()=>fetch('https://wajkfydxutptcvvfwrvq.supabase.co'),/denied/);
  assert.throws(()=>fetch('https://surpatagonian.com'),/denied/);
  await fetch(QA_ORIGIN+'/rest/v1/');assert.equal(called,1);
});
test('write runtime cannot start without explicit credentials and fixtures',async()=>{
  await assert.rejects(startQaServer({environment:{QR_QA_HTTP_WRITES:'YES'}}),/credentials_missing/);
});
test('fallback-only refuses admin UI even with a pre-existing browser session',async()=>{
  const origin='http://127.0.0.1:8799';
  for(const path of ['/admin/login.html','/admin/crm','/admin/nuevo-canal.html']){
    const result=await assetResponse(new Request(origin+path),origin);
    assert.equal(result.status,403);
  }
});
test('runtime contacts must carry the exact synthetic run identity',()=>{
  const run='12345678-1234-4123-8123-123456789abc';
  const p={nombre:`QA-BLINDAJE-${run}`,email:`qa-blindaje-${run}@example.invalid`,mensaje:`QA-BLINDAJE-${run} consulta atribuida`};
  assert.equal(syntheticContact(p,run),true);
  assert.equal(syntheticContact({...p,email:'real@example.com'},run),false);
  assert.equal(syntheticContact(p,'otro'),false);
});
test('CRM inspection starts without secrets and never exposes Worker or editor',async()=>{
  await assert.rejects(startQaServer({environment:{QR_QA_HTTP_WRITES:'YES',QR_QA_ADMIN_READONLY:'YES'}}),/modes_exclusive/);
  const server=await startQaServer({port:18799,environment:{QR_QA_ADMIN_READONLY:'YES'}});
  try{
    for(const path of ['/admin/crm.html','/admin/crm','/admin/login.html','/js/config.js']){
      const r=await fetch('http://127.0.0.1:18799'+path);assert.equal(r.status,200,path);
      const body=await r.text();assert.ok(!body.includes('wajkfydxutptcvvfwrvq'));
      if(path.includes('/crm'))assert.ok(!body.includes('propiedades(id, titulo, codigo_interno)'));
    }
    for(const path of ['/api/qr/init','/api/contacto','/r/anything','/admin/nuevo-canal.html','/','/__qa/status']){
      assert.equal((await fetch('http://127.0.0.1:18799'+path)).status,503,path);
    }
    assert.equal((await fetch('http://127.0.0.1:18799/admin/crm.html',{method:'POST'})).status,503);
  }finally{await new Promise(done=>server.close(done));}
});
