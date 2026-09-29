// Local QA harness only. Never deployed. Default mode is read-only fallback.
import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../worker/index.mjs';
import {qrFallbackConfig} from '../js/qr-public-config.mjs';

export const QA_ORIGIN='https://rsjwqmpseknvydistgfr.supabase.co';
const PROD_ORIGIN='https://wajkfydxutptcvvfwrvq.supabase.co';
const PROD_KEY='sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s';
const QA_KEY=qrFallbackConfig('127.0.0.1').anonKey;
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};
const HTML=new Set(['index.html','propiedades.html','propiedad.html','proyectos.html',
  'proyecto-mini.html','servicios.html','qr-bootstrap.html','404.html',
  'admin/login.html','admin/crm.html','admin/nuevo-canal.html']);

export function overlay(text,origin,name=''){
  // QA predates property internal codes. Only omit this display field in the
  // CRM response; source files, QR RPCs and the QA schema remain untouched.
  if(name==='admin/crm.html'){
    const select='propiedades(id, titulo, codigo_interno)';
    if(text.split(select).length-1!==2)throw Error('qa_crm_overlay_contract_changed');
    text=text.replaceAll(select,'propiedades(id, titulo)');
  }
  return text.replaceAll(PROD_ORIGIN,QA_ORIGIN).replaceAll(PROD_KEY,QA_KEY)
    .replaceAll('https://www.surpatagonian.com',origin)
    .replaceAll('https://surpatagonian.com',origin)
    .replaceAll('https://surpatagonia.com.ar',origin)
    // Remove tracker loaders/initializers, never application modules that only
    // call guarded analytics events. CSP independently blocks tracker traffic.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,tag=>
      /googletagmanager|google-analytics|connect\.facebook\.net|\bfbq\s*\(\s*['"]init['"]|\bgtag\s*\(\s*['"]config['"]/i.test(tag)?'':tag);
}
export function securityHeaders(bootstrap=false){
  const connect=bootstrap?`${QA_ORIGIN}/rest/v1/rpc/qr_resolver_anon_v1`:QA_ORIGIN;
  return {'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':bootstrap
      ?`default-src 'none'; script-src 'self'; connect-src 'self' ${connect}; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      :`default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com/leaflet@1.9.4/dist/leaflet.js; connect-src 'self' ${connect} https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com/leaflet@1.9.4/dist/leaflet.css; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' ${QA_ORIGIN} data: blob:; media-src 'self' ${QA_ORIGIN} blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`};
}
export function assetPath(path){
  if(/[\\%\0]/.test(path)||path.split('/').some(x=>x==='..'||x.startsWith('.'))) return null;
  if(path.startsWith('/r/')) return 'qr-bootstrap.html';
  let name=path==='/'?'index.html':path.slice(1);
  if(!extname(name))name+='.html';
  if(extname(name)==='.html')return HTML.has(name)?name:null;
  if(!TYPES[extname(name)]||! /^(js|css|assets|admin\/js|admin\/css)\//.test(name))return null;
  // Service workers and arbitrary local scripts never receive a route.
  if(/(?:^|\/)sw\.js$/.test(name))return null;
  return name;
}
export async function assetResponse(request,origin,{allowAdmin=false}={}){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/admin/')&&!allowAdmin)return new Response('Admin no habilitado en modo lectura',{status:403});
  const name=assetPath(path);
  if(!name)return new Response('Ruta no habilitada en QA',{status:404});
  try{
    const root=await realpath(ROOT), target=await realpath(resolve(ROOT,name));
    if(!target.startsWith(root+sep))return new Response('Forbidden',{status:403});
    let body=await readFile(target);
    if(['.html','.js','.mjs','.css'].includes(extname(name)))body=overlay(body.toString('utf8'),origin,name);
    return new Response(request.method==='HEAD'?null:body,{headers:{...securityHeaders(name==='qr-bootstrap.html'),'Content-Type':TYPES[extname(name)]}});
  }catch{return new Response('No disponible en QA',{status:404});}
}
export function qaFetch(originalFetch){
  return (url,options={})=>{
    const target=new URL(typeof url==='string'||url instanceof URL?url:url.url);
    if(target.origin!==QA_ORIGIN)throw Error('qa_outbound_origin_denied');
    return originalFetch(url,{...options,redirect:'error'});
  };
}
export function syntheticContact(payload,run){
  return /^[0-9a-f-]{36}$/.test(run||'')
    &&payload?.nombre===`QA-BLINDAJE-${run}`
    &&payload?.email===`qa-blindaje-${run}@example.invalid`
    &&typeof payload.mensaje==='string'&&payload.mensaje.startsWith(`QA-BLINDAJE-${run}`);
}
export async function startQaServer({port=8799,environment={}}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid_port');
  const origin=`http://127.0.0.1:${port}`;
  const writes=environment.QR_QA_HTTP_WRITES==='YES';
  const adminRead=environment.QR_QA_ADMIN_READONLY==='YES';
  if(writes&&adminRead)throw Error('qa_modes_exclusive');
  const required=['SUPABASE_SERVICE_ROLE_KEY','QR_INIT_KEYS','QR_INIT_CURRENT_KID',
    'QR_HANDOFF_KEYS','QR_HANDOFF_CURRENT_KID','QR_ASSERTION_KEYS','QR_ASSERTION_CURRENT_KID',
    'QR_RATE_KEY','QR_PAYLOAD_KEY'];
  if(writes&&required.some(key=>!environment[key]))throw Error('qa_runtime_credentials_missing');
  const codes=new Set((environment.QR_QA_ALLOWED_CODES||'').split(',').filter(Boolean));
  if(writes&&!codes.size)throw Error('qa_fixture_codes_missing');
  const run=environment.QR_QA_RUN_ID;
  if(writes&&!/^[0-9a-f-]{36}$/.test(run||''))throw Error('qa_run_id_missing');
  const env={...Object.fromEntries(required.map(key=>[key,environment[key]])),
    PUBLIC_ORIGIN:origin,QR_ENVIRONMENT:'qa',SUPABASE_URL:QA_ORIGIN,
    ASSETS:{fetch:req=>assetResponse(req,origin,{allowAdmin:writes})}};
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(421);res.end();return;}
      const url=new URL(req.url,origin);
      if(url.origin!==origin){res.writeHead(400);res.end();return;}
      if(adminRead){
        // Static CRM inspection only: no Worker, secrets, /r or local write API.
        const allowed=['/admin/login.html','/admin/crm.html','/admin/crm'];
        const asset=assetPath(url.pathname);
        if(!['GET','HEAD'].includes(req.method)||(!allowed.includes(url.pathname)&&
          !(asset&&/^(js|css|assets|admin\/js|admin\/css)\//.test(asset)))){
          res.writeHead(503,securityHeaders());res.end('QA: sólo lectura visual del CRM');return;
        }
        const response=await assetResponse(new Request(url,{method:req.method}),origin,{allowAdmin:true});
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(url.pathname==='/__qa/status'){
        res.writeHead(200,{'Content-Type':'application/json',...securityHeaders()});
        res.end(JSON.stringify({environment:'qa',mode:writes?'runtime':'fallback-only',run:writes?run:null,production:false}));return;
      }
      if(url.pathname.startsWith('/r/')&&writes&&!codes.has(url.pathname.slice(3).replace(/\/$/,''))){res.writeHead(403);res.end();return;}
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      if(url.pathname.startsWith('/api/')&&!writes){
        res.writeHead(503,{'Content-Type':'application/json',...securityHeaders()});res.end('{"ok":false,"error":"qa_runtime_disabled"}');return;
      }
      if(writes&&url.pathname==='/api/qr/init'){
        let value;try{value=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
        if(!codes.has(value.codigo)){res.writeHead(403);res.end();return;}
      }
      if(writes&&url.pathname==='/api/contacto'){
        let value;try{value=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
        if(!syntheticContact(value,run)){res.writeHead(403);res.end();return;}
      }
      const headers=new Headers(req.headers);
      // Only this loopback server supplies network identity, never the caller.
      headers.set('CF-Connecting-IP','127.0.0.1');
      const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}: {})});
      const response=await worker.fetch(request,env);
      if(url.pathname.startsWith('/api/')){
        let id=null;try{const value=JSON.parse(body);if(/^[0-9a-f-]{36}$/.test(value.request_id))id=value.request_id;}catch{}
        console.log(JSON.stringify({event:'QA_HTTP',run,time:new Date().toISOString(),method:req.method,path:url.pathname,status:response.status,request_id:id}));
      }
      const responseHeaders=Object.fromEntries(response.headers);
      if(response.headers.getSetCookie().length)responseHeaders['set-cookie']=response.headers.getSetCookie();
      res.writeHead(response.status,responseHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false,"error":"qa_request_failed"}');}
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  globalThis.fetch=qaFetch(globalThis.fetch);
  const port=Number(process.env.QR_QA_PORT||8799);
  const server=await startQaServer({port,environment:process.env});
  console.log(JSON.stringify({origin:`http://127.0.0.1:${port}`,environment:'qa',mode:process.env.QR_QA_ADMIN_READONLY==='YES'?'admin-readonly':process.env.QR_QA_HTTP_WRITES==='YES'?'runtime':'fallback-only'}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
