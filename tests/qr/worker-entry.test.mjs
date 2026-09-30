import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../../worker/index.mjs';

function env(){
  return {ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/qr-bootstrap.html')return new Response(null,{status:307,headers:{Location:'/qr-bootstrap'}});
    return new Response(`asset:${path}`,{status:200,headers:{'Content-Type':'text/html'}});
  }}};
}

test('worker serves the static QR bootstrap on /r without configured secrets and fails closed on APIs',async()=>{
  const asset=await worker.fetch(new Request('https://surpatagonian.com/index.html'),env());
  assert.equal(await asset.text(),'asset:/index.html');
  const qr=await worker.fetch(new Request('https://surpatagonian.com/r/abc-123?via=link'),env());
  assert.equal(qr.headers.get('Cache-Control'),'no-store');
  assert.equal(qr.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(qr.headers.get('X-Robots-Tag'),'noindex, nofollow');
  assert.match(qr.headers.get('Content-Security-Policy'),/qr_resolver_anon_v1/);
  assert.equal(await qr.text(),'asset:/qr-bootstrap');
  assert.equal(qr.headers.get('Location'),null);
  const head=await worker.fetch(new Request('https://surpatagonian.com/r/abc-123',{method:'HEAD'}),env());
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  assert.equal(head.headers.get('Cache-Control'),'no-store');
  const method=await worker.fetch(new Request('https://surpatagonian.com/r/abc-123',{method:'POST'}),env());
  assert.equal(method.status,405);
  const api=await worker.fetch(new Request('https://surpatagonian.com/api/qr/init',{method:'POST'}),env());
  assert.equal(api.status,503);
  assert.deepEqual(await api.json(),{ok:false,error:'solicitud_no_valida'});
});

test('worker fails closed if QR bootstrap asset is absent',async()=>{
  const missing={ASSETS:{fetch:async()=>new Response(null,{status:404})}};
  const response=await worker.fetch(new Request('https://surpatagonian.com/r/abc-123'),missing);
  assert.equal(response.status,503);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('worker refuses a QA/prod database mismatch before reading any secret',async()=>{
  const mismatched={...env(),PUBLIC_ORIGIN:'http://127.0.0.1:8787',QR_ENVIRONMENT:'qa',
    SUPABASE_URL:'https://wajkfydxutptcvvfwrvq.supabase.co'};
  const response=await worker.fetch(new Request('http://127.0.0.1:8787/api/qr/init',{method:'POST'}),mismatched);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,error:'solicitud_no_valida'});
});

test('static contract routes /r through the Worker, not an unsupported 200 rewrite',async()=>{
  const fs=await import('node:fs/promises');
  const [redirects,wrangler,assetsignore]=await Promise.all([
    fs.readFile(new URL('../../_redirects',import.meta.url),'utf8'),
    fs.readFile(new URL('../../wrangler.toml',import.meta.url),'utf8'),
    fs.readFile(new URL('../../.assetsignore',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(redirects,/^\/r\/\*\s+\/qr-bootstrap\.html\s+200$/m);
  assert.match(wrangler,/run_worker_first = \["\/r\/\*", "\/api\/qr\/\*", "\/api\/contacto"\]/);
  for(const internal of ['worker/','scripts/','tests/','wrangler.toml'])assert.ok(assetsignore.split('\n').includes(internal));
});

test('bootstrap headers use the exact production RPC and no inline execution',async()=>{
  const [headers,html]=await Promise.all([
    readFile(new URL('../../_headers',import.meta.url),'utf8'),
    readFile(new URL('../../qr-bootstrap.html',import.meta.url),'utf8')
  ]);
  const expected="default-src 'none'; script-src 'self'; connect-src 'self' https://wajkfydxutptcvvfwrvq.supabase.co/rest/v1/rpc/qr_resolver_anon_v1; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  assert.equal((headers.match(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length,2);
  assert.doesNotMatch(headers,/unsafe-inline|\*\.supabase\.co/);
  assert.match(html,/href="\/css\/qr-bootstrap\.css"/);
  assert.doesNotMatch(html,/<style\b|<script(?![^>]+\bsrc=)/i);
});
