import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STAGING, PRODUCTION} from '../../scripts/staging/config.mjs';
import {publicAsset, transform} from '../../scripts/staging/build.mjs';
import staging, {validateAccess} from '../../worker/staging.mjs';
import vm from 'node:vm';

const issuer = 'https://sp-staging-test.cloudflareaccess.com';
const aud = 'test-audience';
const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk = {...await crypto.subtle.exportKey('jwk',keys.publicKey), kid:'test-key'};
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function request(overrides = {}, path = '/') {
  const header = base64({alg:'RS256',kid:jwk.kid});
  const payload = base64({iss:issuer,aud:[aud],iat:Date.now()/1000-5,exp:Date.now()/1000+300,...overrides});
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(`${header}.${payload}`));
  return new Request(STAGING.origin+path,{headers:{'Cf-Access-Jwt-Assertion':`${header}.${payload}.${Buffer.from(signature).toString('base64url')}`}});
}
const env = () => ({PUBLIC_ORIGIN:STAGING.origin,SUPABASE_URL:STAGING.databaseOrigin,
  QR_ENVIRONMENT:'qa',STAGING_ACCESS_ISSUER:issuer,STAGING_ACCESS_AUD:aud,
  ASSETS:{fetch:async()=>new Response('<html>test asset</html>',{headers:{'Content-Type':'text/html'}})}});
const certs = async () => new Response(JSON.stringify({keys:[jwk]}));

test('Access checks signature, issuer, audience and expiry; a header alone cannot unlock staging',async()=>{
  assert.equal(await validateAccess(await request(),env(),certs),true);
  for (const override of [{aud:['other']},{iss:'https://other.cloudflareaccess.com'},
    {exp:Date.now()/1000-1},{iat:Date.now()/1000+120},{nbf:Date.now()/1000+120}]) {
    assert.equal(await validateAccess(await request(override),env(),certs),false);
  }
  const forged=await request();forged.headers.set('Cf-Access-Jwt-Assertion',forged.headers.get('Cf-Access-Jwt-Assertion').slice(0,-15)+'AAAAAAAAAAAAAAA');
  assert.equal(await validateAccess(forged,env(),certs),false);
  assert.equal(await validateAccess(new Request(STAGING.origin),env(),certs),false);
  assert.equal(await validateAccess(await request(),{...env(),STAGING_ACCESS_AUD:''},certs),false);
});

test('staging rejects production, aliases and a wrong project before serving assets',async()=>{
  for (const origin of ['https://surpatagonian.com','https://sur-patagonia-staging.example.workers.dev']) {
    assert.equal((await staging.fetch(new Request(origin),env())).status,503);
  }
  assert.equal((await staging.fetch(new Request(STAGING.origin),{...env(),SUPABASE_URL:`https://${PRODUCTION.projectRef}.supabase.co`})).status,503);
  assert.equal((await staging.fetch(new Request(STAGING.origin),{...env(),QR_ENVIRONMENT:'prod'})).status,503);
  assert.equal((await staging.fetch(new Request(STAGING.origin),env())).status,403);
});

test('all assets are private, no-store and noindex; QR CSP points only to QA',async()=>{
  await validateAccess(await request(),env(),certs);
  const home=await staging.fetch(await request(),env());
  assert.equal(home.status,200); assert.match(home.headers.get('X-Robots-Tag'),/noindex/);
  assert.equal(home.headers.get('Cache-Control'),'no-store');
  assert.ok(!home.headers.get('Content-Security-Policy').includes(PRODUCTION.projectRef));
  const qr=await staging.fetch(await request({},'/r/staging-code'),env());
  assert.equal(qr.status,200); assert.ok(qr.headers.get('Content-Security-Policy').includes(STAGING.projectRef));
  assert.ok(!qr.headers.get('Content-Security-Policy').includes(PRODUCTION.projectRef));
  assert.equal((await staging.fetch(await request({},'/api/qr/init'),env())).status,503);
});

test('build copies normal Alquileres and public assets, excluding SQL, tools and divergent QA duplicates',()=>{
  for (const path of ['admin/alquileres-admin.html','portal/index.html','assets/a.webp','js/config.js']) assert.equal(publicAsset(path),true,path);
  for (const path of ['admin/alquileres-admin-qa.html','supabase/functions/admin-crear-usuario/index.ts',
    'worker/index.mjs','scripts/install-qr-prod.command','wrangler.toml','docs/audit.json','.env']) assert.equal(publicAsset(path),false,path);
});

test('build rewrites identities, canonical test QR and contact exits and strips analytics',()=>{
  const source=`<html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script></head>
    <script>const base='https://surpatagonian.com';const db='https://${PRODUCTION.projectRef}.supabase.co';const k='PUBLIC-PROD';
    const qr='https://surpatagonia.com.ar/r/test';window.location.href='mailto:person@example.com';</script></html>`;
  const result=transform(source,'index.html',['PUBLIC-PROD'],'PUBLIC-QA');
  assert.ok(!result.includes(PRODUCTION.projectRef));assert.ok(!result.includes('PUBLIC-PROD'));
  assert.ok(!result.includes('googletagmanager'));assert.ok(!result.includes('mailto:'));
  assert.ok(result.includes(`${STAGING.origin}/r/test`));assert.match(result,/staging-safety\.js/);
});

test('browser guard blocks production and external messaging even when QA is enabled',async()=>{
  const source=await readFile(new URL('../../scripts/staging/browser-safety.js',import.meta.url),'utf8');
  let calls=0; const listeners={};
  const window={fetch:async()=>{calls++;return 'ok'},open:()=>true,WebSocket:class{}};
  const context={window,location:{origin:STAGING.origin,href:STAGING.origin+'/'},Request,URL,
    XMLHttpRequest:class {open(){}},navigator:{sendBeacon:()=>true},
    document:{documentElement:{},addEventListener:(name,fn)=>listeners[name]=fn},alert:()=>{}};
  vm.runInNewContext(source.replace('__STAGING_CONFIG__',JSON.stringify({...STAGING,dataReady:true})),context);
  await assert.rejects(window.fetch(`https://${PRODUCTION.projectRef}.supabase.co/rest/v1/contactos`),/staging_outbound_blocked/);
  await assert.rejects(window.fetch('https://api.telegram.org/bot/test'),/staging_outbound_blocked/);
  await assert.rejects(window.fetch('https://www.google-analytics.com/collect'),/staging_outbound_blocked/);
  await assert.rejects(window.fetch(STAGING.databaseOrigin+'/auth/v1/recover',{method:'POST'}),/staging_outbound_blocked/);
  assert.equal(await window.fetch(STAGING.databaseOrigin+'/rest/v1/propiedades'),'ok');
  assert.equal(calls,1);assert.equal(window.open('https://wa.me/test'),null);
  assert.throws(()=>new window.WebSocket(`wss://${PRODUCTION.projectRef}.supabase.co/realtime/v1`),/staging_outbound_blocked/);
  assert.ok(new window.WebSocket(STAGING.databaseOrigin.replace('https:','wss:')+'/realtime/v1'));
  assert.equal(context.navigator.sendBeacon('https://example.com','test'),false);
  let prevented=false;listeners.click({target:{closest:()=>({href:'mailto:person@example.com'})},preventDefault:()=>prevented=true,stopImmediatePropagation:()=>{}});
  assert.equal(prevented,true);
});
