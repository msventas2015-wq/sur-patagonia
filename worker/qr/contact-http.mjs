import {concat} from './codec.mjs';
import {parseContactPayload} from './contact-payload.mjs';

const MAX_BODY = 16384;
class BodyLimit extends Error {}
function reject(status, extra={}) {
  return {accepted:false,response:new Response(JSON.stringify({ok:false,error:'solicitud_no_valida'}),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer',...extra}
  })};
}
function validContext(context) {
  if (!context || typeof context.host!=='string' || typeof context.origin!=='string') return false;
  try {
    const url = new URL(context.origin);
    return ['https:','http:'].includes(url.protocol) && url.origin===context.origin && url.host===context.host;
  } catch { return false; }
}
async function readBody(request) {
  const length=request.headers.get('content-length');
  if(length!==null && !/^\d+$/.test(length)) throw Error('invalid_length');
  if(length!==null && BigInt(length)>BigInt(MAX_BODY)) throw new BodyLimit();
  if(!request.body) return new Uint8Array();
  const reader=request.body.getReader();
  const pieces=[]; let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read(); if(done) break;
      if(!(value instanceof Uint8Array)) throw Error('invalid_body');
      size+=value.byteLength;
      if(size>MAX_BODY) { await reader.cancel(); throw new BodyLimit(); }
      pieces.push(value);
    }
  } finally { reader.releaseLock(); }
  return concat(...pieces);
}

// HTTP admission only: no DB, cookies, quota, hash, UUID allocation or success
// response. The adapter must call the secure core and await its committed result.
// No timeout here: transport/readiness supplies its request budget separately.
export async function readContactRequest(request, context) {
  const url=new URL(request.url);
  if(url.pathname!=='/api/contacto') return reject(404);
  if(request.method!=='POST') return reject(405,{Allow:'POST'});
  if(!validContext(context)) return reject(503);
  if(url.origin!==context.origin || url.search || request.headers.get('host')!==context.host || request.headers.get('origin')!==context.origin) return reject(400);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')) return reject(415);
  try {
    return {accepted:true,payload:parseContactPayload(await readBody(request))};
  } catch(error) { return reject(error instanceof BodyLimit ? 413 : 400); }
}
