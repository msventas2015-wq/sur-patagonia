import application from './index.mjs';
import {STAGING} from '../scripts/staging/config.mjs';

const deny = status => new Response('Entorno de pruebas cerrado.', {status, headers:{
  'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Content-Type':'text/plain; charset=utf-8', 'Referrer-Policy':'no-referrer'}});
let cachedKeys;
const decode = part => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0))));
const signatureBytes = part => Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));

export async function validateAccess(request, env, fetchImpl = fetch, onReject = () => {}) {
  // Diagnostics use fixed reason codes only; never log tokens, cookies or claims.
  const reject = reason => { onReject(reason); return false; };
  const issuer = env.STAGING_ACCESS_ISSUER;
  const audience = env.STAGING_ACCESS_AUD;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') || !audience) return reject('configuration');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return reject('token_missing_or_oversized');
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return reject('token_format');
    const header = decode(parts[0]), payload = decode(parts[1]);
    const now = Date.now()/1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return reject('algorithm');
    if (payload.iss !== issuer) return reject('issuer');
    if (!Array.isArray(payload.aud) || !payload.aud.includes(audience)) return reject('audience');
    if (typeof payload.exp !== 'number' || payload.exp <= now) return reject('expired');
    if (typeof payload.iat !== 'number' || payload.iat > now+60) return reject('issued_at');
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now+60)) return reject('not_before');
    if (!cachedKeys || cachedKeys.issuer !== issuer || cachedKeys.expires <= now) {
      const response = await fetchImpl(`${issuer}/cdn-cgi/access/certs`,{redirect:'error'});
      if (!response.ok) return reject('jwks_http');
      const result = await response.json();
      if (!Array.isArray(result.keys)) return reject('jwks_format');
      cachedKeys = {issuer, expires:now+300, keys:result.keys};
    }
    let key = cachedKeys.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!key) { cachedKeys = undefined; return reject('jwks_key_missing'); }
    const imported = await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, signatureBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid || reject('signature');
  } catch (error) {
    return reject(error?.name === 'InvalidCharacterError' ? 'base64_decode' :
      error?.name === 'NotSupportedError' ? 'crypto_unsupported' : 'verification_exception');
  }
}

export default {async fetch(request, env) {
  // Every asset passes here. The worker cannot expose the clone under an alias.
  const url = new URL(request.url);
  if (url.origin !== STAGING.origin || env.PUBLIC_ORIGIN !== STAGING.origin ||
      env.QR_ENVIRONMENT !== STAGING.environment || env.SUPABASE_URL !== STAGING.databaseOrigin) {
    console.warn('staging-access:environment'); return deny(503);
  }
  if (!await validateAccess(request,env,fetch,reason => console.warn(`staging-access:${reason}`))) return deny(403);
  if (url.pathname.startsWith('/__staging/contact-disabled')) return new Response('Mensajes externos deshabilitados en pruebas.', {headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  if (url.pathname.startsWith('/api/') && env.STAGING_DATA_READY !== 'yes') return deny(503);
  const response = await application.fetch(request, env);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','no-store'); headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  headers.set('Referrer-Policy','no-referrer');
  headers.set('Content-Security-Policy', url.pathname.startsWith('/r/') || url.pathname.startsWith('/qr-bootstrap')
    ? `default-src 'none'; script-src 'self'; connect-src 'self' ${STAGING.databaseOrigin}/rest/v1/rpc/qr_resolver_anon_v1; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    : `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; connect-src 'self' ${STAGING.databaseOrigin} wss://rsjwqmpseknvydistgfr.supabase.co https://cdn.jsdelivr.net https://apis.datos.gob.ar https://api.bcra.gob.ar; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: ${STAGING.databaseOrigin} https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com; media-src 'self' blob: ${STAGING.databaseOrigin}; frame-src 'self' blob:; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
