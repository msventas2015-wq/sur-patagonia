import { concat, lp, int64, uuidBytes, uuidText, base64url, unbase64url, Reader } from './codec.mjs';
import { strictJson, exactKeys } from './strict-json.mjs';

const KID = /^[A-Za-z0-9_-]{1,32}$/;
// Existing public readers allowed 2–80 including edge hyphens. Resolution does
// not silently narrow historical codes to the stricter rules for NEW E2 codes.
const CODE = /^[a-z0-9-]{2,80}$/;
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TTL = 120;
const aad = (kid, context) => concat(lp('qr-init-v1'), lp('1'), lp(kid), lp(context.environment), lp(context.host));
function settings(context) {
  if (!context || typeof context.environment !== 'string' || !context.environment || typeof context.host !== 'string' || !context.host || !KID.test(context.currentKid)) throw new Error('invalid_config');
  const url = new URL(context.origin);
  if (url.origin !== context.origin || url.host !== context.host || !['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_config');
  if (!(context.keys instanceof Map)) throw new Error('invalid_config');
}
async function key(context, kid, usage) {
  if (!KID.test(kid)) throw new Error('invalid_key');
  const raw = context.keys.get(kid);
  if (!(raw instanceof Uint8Array) || raw.length !== 32) throw new Error('missing_key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}
function payloadCheck(payload) {
  exactKeys(payload, ['version','codigo','via']);
  if (payload.version !== 1 || typeof payload.codigo !== 'string' || !CODE.test(payload.codigo) || !['qr','link'].includes(payload.via)) throw new Error('invalid_schema');
}
export async function issueClaim(payload, context, nowSeconds = Math.floor(Date.now() / 1000)) {
  settings(context); payloadCheck(payload);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0 || !Number.isSafeInteger(nowSeconds + TTL)) throw new Error('invalid_time');
  const id = crypto.randomUUID(); const expires = nowSeconds + TTL;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = concat(lp(payload.codigo), lp(payload.via), uuidBytes(id), int64(BigInt(expires)));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(context.currentKid, context),tagLength:128}, await key(context, context.currentKid, 'encrypt'), body));
  return {ok:true,init:`v1.${context.currentKid}.${base64url(concat(iv, encrypted))}`,expires_at:expires};
}
export async function openClaim(claim, context, nowSeconds = Math.floor(Date.now() / 1000)) {
  settings(context);
  if (typeof claim !== 'string' || claim.length > 400 || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new Error('invalid_claim');
  const parts = claim.split('.'); if (parts.length !== 3 || parts[0] !== 'v1' || !KID.test(parts[1])) throw new Error('invalid_claim');
  const sealed = unbase64url(parts[2], 360); if (sealed.length < 28) throw new Error('invalid_claim');
  const raw = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:sealed.slice(0,12),additionalData:aad(parts[1], context),tagLength:128}, await key(context, parts[1], 'decrypt'), sealed.slice(12)));
  const reader = new Reader(raw); const codigo = reader.text(80); const via = reader.text(4);
  const request_id = uuidText(reader.take(16)); const expires = reader.signed64(); reader.end();
  payloadCheck({version:1,codigo,via});
  if (!UUID4.test(request_id) || expires <= BigInt(nowSeconds) || expires > BigInt(nowSeconds) + 120n) throw new Error('invalid_claim');
  return {codigo,via,request_id,expires_at:Number(expires)};
}
function response(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',...extra}});
}
const error = (status, headers) => response(status, {ok:false,error:'solicitud_no_valida'}, headers);
async function boundedBody(request, maximum) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maximum))) throw new RangeError('body_limit');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(); const pieces = []; let total = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new RangeError('body_limit'); }
      pieces.push(value);
    }
  } finally { reader.releaseLock(); }
  return concat(...pieces);
}

// Local module only; wiring/deployment are separate and not implied by unit tests.
export async function handleInit(request, context) {
  if (new URL(request.url).pathname !== '/api/qr/init') return error(404);
  if (request.method !== 'POST') return error(405, {Allow:'POST'});
  try { settings(context); } catch { return error(503); }
  if (request.headers.get('host') !== context.host || request.headers.get('origin') !== context.origin || new URL(request.url).origin !== context.origin || new URL(request.url).search) return error(400);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return error(415);
  let payload;
  try { payload = strictJson(await boundedBody(request, 512), 512); payloadCheck(payload); }
  catch (e) { return error(e instanceof RangeError ? 413 : 400); }
  try { return response(200, await issueClaim(payload, context)); }
  catch { return error(503); }
}
