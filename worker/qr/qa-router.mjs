// Local QA composition, not a deployment entrypoint. It intentionally has no
// default/static-asset handler: unknown API routes cannot become QR requests.
import { handleInit } from './init.mjs';
import { handleConsume } from './consume-handler.mjs';
import { handleContact } from './contact-handler.mjs';
import { handlePageview } from './pageview-handler.mjs';

function error(status) {
  return new Response(JSON.stringify({ ok: false, error: 'solicitud_no_valida' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function routeQaApi(request, contexts, nowMillis = () => Date.now()) {
  let path;
  try { path = new URL(request.url).pathname; }
  catch { return error(400); }
  if (path === '/api/qr/init') {
    if (contexts?.init?.environment !== 'qa') return error(503);
    return handleInit(request, contexts.init);
  }
  if (path === '/api/qr/consume') {
    if (contexts?.consume?.init?.environment !== 'qa') return error(503);
    return handleConsume(request, contexts.consume, nowMillis);
  }
  if (path === '/api/contacto') {
    if (contexts?.contact?.environment !== 'qa') return error(503);
    return handleContact(request, contexts.contact, nowMillis);
  }
  if (path === '/api/qr/pageview') {
    if (contexts?.pageview?.environment !== 'qa') return error(503);
    return handlePageview(request, contexts.pageview, nowMillis);
  }
  return error(404);
}
