// Crypto only. Does not authorize a report or decide token liveness: the RPC must.
import {concat,lp,uuidBytes,base64url,unbase64url,utf8} from './codec.mjs';
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KID=/^[A-Za-z0-9_-]{1,32}$/;
function environment(value) {
  if(typeof value!=='string'||!value) throw Error('invalid_environment');
  return lp(value);
}
async function sign(rawKey,body) {
  if(!(rawKey instanceof Uint8Array)||rawKey.length!==32) throw Error('missing_capability_key');
  const key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,body));
}
async function sha(bytes) {return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));}
export async function deriveReportCapability({environment:env,campaignId,requestId,action,kid,keys}) {
  if(!UUID4.test(requestId)||!KID.test(kid)||!['emitir','rotar'].includes(action)) throw Error('invalid_capability_context');
  // UUID_BYTES validates the canonical campaign identifier; it need not be v4.
  const body=concat(lp('qr-report-capability-v1'),environment(env),uuidBytes(campaignId),uuidBytes(requestId),lp(action));
  const token=await sign(keys?.get(kid),body);
  return {kid,token:base64url(token),tokenHash:await sha(token)};
}
export async function reportFingerprint(token,{environment:env,rateKey}={}) {
  // Caller has enforced the endpoint's 512-byte envelope. Keep this helper bounded
  // as well; malformed non-string/oversized input is pre-ledger, not a lookup.
  if(typeof token!=='string'||utf8(token).length>512) throw Error('invalid_token_envelope');
  const envBytes=environment(env);
  if(/^[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      const raw=unbase64url(token,43);
      if(raw.length===32) return {tokenSyntaxValid:true,tokenFingerprint:await sha(raw)};
    } catch { /* Noncanonical pad bits follow the same decoy path as bad syntax. */ }
  }
  return {
    tokenSyntaxValid:false,
    tokenFingerprint:await sign(rateKey,concat(lp('qr-report-invalid-fingerprint-v1'),envBytes,lp(token)))
  };
}
