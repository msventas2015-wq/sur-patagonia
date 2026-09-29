// Local request coordination only. The RPC must authenticate/validate the ACK.
import { LANDING_KEY } from './qr-bootstrap-core.mjs';
const intents = new WeakMap();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const closed = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
function validContext(c) {
  if (!closed(c, ['path', 'propiedad_id', 'proyecto_slug'])) return false;
  if (['/', '/propiedades', '/proyectos', '/servicios'].includes(c.path)) return c.propiedad_id === null && c.proyecto_slug === null;
  if (c.path === '/propiedad') return typeof c.propiedad_id === 'string' && uuid.test(c.propiedad_id) && c.proyecto_slug === null;
  if (c.path === '/proyecto-mini') return c.propiedad_id === null && typeof c.proyecto_slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(c.proyecto_slug);
  return false;
}
const sameContext = (a, b) => a.path === b.path && a.propiedad_id === b.propiedad_id && a.proyecto_slug === b.proyecto_slug;
function validLanding(l) {
  return closed(l, ['landing_id', 'pageview_request_id', 'path', 'propiedad_id', 'proyecto_slug'])
    && typeof l.landing_id === 'string' && uuid4.test(l.landing_id)
    && typeof l.pageview_request_id === 'string' && uuid4.test(l.pageview_request_id)
    && validContext({path:l.path, propiedad_id:l.propiedad_id, proyecto_slug:l.proyecto_slug});
}

// scope is the document object; all components in that document share one intent.
// Canonical context comes from the page adapter, never canal/ref/via parameters.
export function pageviewIntent(scope, context, storage, randomUUID = () => crypto.randomUUID()) {
  if (!scope || (typeof scope !== 'object' && typeof scope !== 'function') || !validContext(context)) throw new Error('invalid_pageview_context');
  const previous = intents.get(scope);
  if (previous) {
    if (!sameContext(previous.payload, context)) throw new Error('document_context_changed');
    return previous.payload;
  }
  let landing = null;
  try {
    const raw = storage.getItem(LANDING_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (validLanding(parsed) && sameContext(parsed, context)) landing = parsed;
      else storage.removeItem(LANDING_KEY);
    }
  } catch { /* blocked/corrupt storage means ordinary navigation, never QR entry */ }
  const requestId = landing ? landing.pageview_request_id : randomUUID();
  if (typeof requestId !== 'string' || !uuid4.test(requestId)) throw new Error('invalid_pageview_uuid');
  const payload = Object.freeze({version:1, request_id:requestId, landing_id:landing?.landing_id ?? null, ...context});
  intents.set(scope, {payload, storage});
  return payload;
}

// Call ONLY after the transport has verified a successful landing_absorbed result.
// Failure/timeout callers do not call this; reload retains the exact same ACK IDs.
export function releaseLandingAfterAck(scope) {
  const entry = intents.get(scope);
  if (!entry || entry.payload.landing_id === null) return false;
  try {
    const current = JSON.parse(entry.storage.getItem(LANDING_KEY));
    if (!validLanding(current) || current.landing_id !== entry.payload.landing_id
        || current.pageview_request_id !== entry.payload.request_id || !sameContext(current, entry.payload)) return false;
    entry.storage.removeItem(LANDING_KEY);
    return true;
  } catch { return false; }
}
