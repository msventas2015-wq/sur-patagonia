import {handleInit} from './qr/init.mjs';
import {handleConsume} from './qr/consume-handler.mjs';
import {handleContact} from './qr/contact-handler.mjs';
import {handlePageview} from './qr/pageview-handler.mjs';
import {createSupabaseTransport} from './qr/supabase-transport.mjs';

const HEX=/^[0-9a-f]{64}$/;
const QR_BOOTSTRAP_CSP="default-src 'none'; script-src 'self'; connect-src 'self' https://wajkfydxutptcvvfwrvq.supabase.co/rest/v1/rpc/qr_resolver_anon_v1; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function qrBootstrapHeaders(assetHeaders){const headers=new Headers(assetHeaders);headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Content-Security-Policy',QR_BOOTSTRAP_CSP);return headers;}
const bytes=value=>{if(typeof value!=='string'||!HEX.test(value))throw Error('invalid_key');return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));};
function keyring(raw,currentKid){const parsed=JSON.parse(raw);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||typeof currentKid!=='string'||!Object.hasOwn(parsed,currentKid))throw Error('invalid_keyring');return new Map(Object.entries(parsed).map(([kid,value])=>[/^[A-Za-z0-9_-]{1,32}$/.test(kid)?kid:(()=>{throw Error('invalid_kid')})(),bytes(value)]));}
function json(status){return new Response(JSON.stringify({ok:false,error:'solicitud_no_valida'}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'}});}
function contexts(request,env){
  const origin=new URL(env.PUBLIC_ORIGIN);if(origin.origin!==env.PUBLIC_ORIGIN)throw Error('invalid_origin');
  const environment=env.QR_ENVIRONMENT;if(!['qa','prod'].includes(environment))throw Error('invalid_environment');
  const databaseOrigin=new URL(env.SUPABASE_URL).origin;
  const expectedDatabaseOrigin=environment==='qa'
    ?'https://rsjwqmpseknvydistgfr.supabase.co'
    :'https://wajkfydxutptcvvfwrvq.supabase.co';
  if(databaseOrigin!==expectedDatabaseOrigin)throw Error('environment_database_mismatch');
  const initKeys=keyring(env.QR_INIT_KEYS,env.QR_INIT_CURRENT_KID);
  const handoffKeys=keyring(env.QR_HANDOFF_KEYS,env.QR_HANDOFF_CURRENT_KID);
  const assertionKeys=keyring(env.QR_ASSERTION_KEYS,env.QR_ASSERTION_CURRENT_KID);
  const transport=createSupabaseTransport({origin:databaseOrigin,serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY,fetchImpl:fetch,environment});
  const shared={environment,origin:origin.origin,host:origin.host,rateKey:bytes(env.QR_RATE_KEY),payloadKey:bytes(env.QR_PAYLOAD_KEY),cookiePrefix:environment==='prod'?'__Host-sp_attr_':'sp_attr_qa_',assertion:{currentKid:env.QR_ASSERTION_CURRENT_KID,keys:assertionKeys},getNormalizedEdgeIp:req=>{const ip=req.headers.get('CF-Connecting-IP');if(typeof ip!=='string'||!ip)return null;return ip;}};
  const init={environment,origin:origin.origin,host:origin.host,currentKid:env.QR_INIT_CURRENT_KID,keys:initKeys};
  return {init,consume:{...shared,init,handoffCurrentKid:env.QR_HANDOFF_CURRENT_KID,handoffKeys,callResolver:transport},contact:{...shared,callContact:transport},pageview:{...shared,callPageview:transport}};
}
async function api(request,ctx){const path=new URL(request.url).pathname;if(path==='/api/qr/init')return handleInit(request,ctx.init);if(path==='/api/qr/consume')return handleConsume(request,ctx.consume);if(path==='/api/contacto')return handleContact(request,ctx.contact);if(path==='/api/qr/pageview')return handlePageview(request,ctx.pageview);return json(404);}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/r/')){
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
    const bootstrap=await env.ASSETS.fetch(new Request(new URL('/qr-bootstrap',request.url),{method:'GET'}));
    if(!bootstrap.ok)return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
    const headers=qrBootstrapHeaders(bootstrap.headers);
    return request.method==='HEAD'
      ?new Response(null,{status:bootstrap.status,headers})
      :new Response(bootstrap.body,{status:bootstrap.status,headers});
  }
  if(path.startsWith('/api/')){try{return await api(request,contexts(request,env));}catch{return json(503);}}
  return env.ASSETS.fetch(request);
}};
