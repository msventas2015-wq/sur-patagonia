import {concat,lp,uuidBytes,base64url,unbase64url,utf8} from './codec.mjs';
const KID=/^[A-Za-z0-9_-]{1,32}$/;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLOT=/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/;
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
export async function deriveHandoff({environment,requestId,kid,keys}) {
  if(typeof environment!=='string'||!environment||!UUID4.test(requestId)||!KID.test(kid)) throw Error('invalid_handoff_context');
  const rawKey=keys?.get(kid);
  if(!(rawKey instanceof Uint8Array)||rawKey.length!==32) throw Error('missing_handoff_key');
  const key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const token=new Uint8Array(await crypto.subtle.sign('HMAC',key,concat(lp('qr-handoff-v1'),lp(environment),uuidBytes(requestId))));
  return {slot:requestId.replaceAll('-',''),kid,value:`v1.${kid}.${base64url(token)}`,handoffHash:await hash(token)};
}
// Parsing yields candidates, NEVER authentication or attribution. DB must match
// slot UUID + key id + raw-token hash together and decide by ledger business time.
export async function scanFamily(cookieHeader,{prefix,landingAck=false}={}) {
  if(!['sp_attr_qa_','__Host-sp_attr_'].includes(prefix)||typeof landingAck!=='boolean') throw Error('invalid_cookie_context');
  const empty={state:landingAck?'skipped_landing':'within_limit',count:0,bytes:0,candidates:[],familySlots:[]};
  if(landingAck) return empty; // Must not even access the raw header on ACK.
  if(cookieHeader===null) return empty;
  if(typeof cookieHeader!=='string') throw Error('invalid_cookie_header');
  const byName=new Map();let count=0,bytes=0;
  for(const raw of cookieHeader.split(';')) {
    const segment=raw.replace(/^[ \t]+|[ \t]+$/g,'');
    const equal=segment.indexOf('=');
    const name=equal===-1?segment:segment.slice(0,equal);
    if(!name.startsWith(prefix)) continue;
    bytes+=utf8(segment).length+(count?2:0);count++;
    const previous=byName.get(name);
    if(previous) {previous.duplicate=true;continue;}
    byName.set(name,{duplicate:false,value:equal===-1?null:segment.slice(equal+1)});
  }
  const familySlots=[...byName.keys()]
    .map(name=>name.slice(prefix.length))
    .filter(slot=>SLOT.test(slot))
    .sort();
  if(count>32||bytes>16384) return {state:'overflow',count,bytes,candidates:[],familySlots};
  const candidates=[];
  for(const [name,entry] of byName) {
    const slot=name.slice(prefix.length);
    if(entry.duplicate||!SLOT.test(slot)||entry.value===null) continue;
    const match=/^v1\.([A-Za-z0-9_-]{1,32})\.([A-Za-z0-9_-]{43})$/.exec(entry.value);
    if(!match) continue;
    let token;try {token=unbase64url(match[2],43);} catch {continue;}
    if(token.length!==32) continue;
    const requestId=`${slot.slice(0,8)}-${slot.slice(8,12)}-${slot.slice(12,16)}-${slot.slice(16,20)}-${slot.slice(20)}`;
    candidates.push({requestId,kid:match[1],handoffHash:await hash(token)});
  }
  // Canonical transport order is not attribution priority.
  candidates.sort((a,b)=>a.requestId<b.requestId?-1:a.requestId>b.requestId?1:0);
  return {state:'within_limit',count,bytes,candidates,familySlots};
}
