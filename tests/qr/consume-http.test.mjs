import test from 'node:test';
import assert from 'node:assert/strict';
import { issueClaim } from '../../worker/qr/init.mjs';
import { admitConsumeRequest } from '../../worker/qr/consume-http.mjs';

const initKey = new Uint8Array(32).fill(1);
const context = {
  init: {
    environment: 'qa',
    host: 'localhost:8787',
    origin: 'http://localhost:8787',
    currentKid: 'init',
    keys: new Map([['init', initKey]]),
  },
  rateKey: new Uint8Array(32).fill(2),
  payloadKey: new Uint8Array(32).fill(3),
  handoffCurrentKid: 'handoff',
  handoffKeys: new Map([['handoff', new Uint8Array(32).fill(4)]]),
  cookiePrefix: 'sp_attr_qa_',
  getNormalizedEdgeIp: () => '192.0.2.10',
};

const request = (body, headers = {}, method = 'POST', path = '/api/qr/consume') => new Request(context.init.origin + path, {
  method,
  headers: {
    host: context.init.host,
    origin: context.init.origin,
    'content-type': 'application/json',
    ...headers,
  },
  ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
});

async function body(now = 1000) {
  const claim = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'qr' }, context.init, now);
  return JSON.stringify({ version: 1, init: claim.init });
}

test('route and method are decided before configuration, origin or body', async () => {
  assert.equal((await admitConsumeRequest(request(null, {}, 'GET', '/other'), null)).response.status, 404);
  const wrongMethod = await admitConsumeRequest(request(null, { origin: 'https://evil.invalid' }, 'GET'), null);
  assert.equal(wrongMethod.response.status, 405);
  assert.equal(wrongMethod.response.headers.get('allow'), 'POST');
});

test('host/origin and content type fail before body and edge identity', async () => {
  let edgeReads = 0;
  const guarded = { ...context, getNormalizedEdgeIp() { edgeReads++; return '192.0.2.10'; } };
  const validBody = await body();
  assert.equal((await admitConsumeRequest(request(validBody, { origin: 'https://evil.invalid' }), guarded)).response.status, 400);
  assert.equal((await admitConsumeRequest(request(validBody, { host: 'evil.invalid' }), guarded)).response.status, 400);
  assert.equal((await admitConsumeRequest(request(validBody, { 'content-type': 'text/plain' }), guarded)).response.status, 415);
  assert.equal(edgeReads, 0);
});

test('declared and streamed 512-byte bodies are rejected before edge identity', async () => {
  let edgeReads = 0;
  const guarded = { ...context, getNormalizedEdgeIp() { edgeReads++; return '192.0.2.10'; } };
  assert.equal((await admitConsumeRequest(request('x', { 'content-length': '512' }), guarded)).response.status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(300)); controller.enqueue(new Uint8Array(212)); controller.close(); } });
  const streamed = new Request(context.init.origin + '/api/qr/consume', {
    method: 'POST',
    headers: { host: context.init.host, origin: context.init.origin, 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  });
  assert.equal((await admitConsumeRequest(streamed, guarded)).response.status, 413);
  assert.equal(edgeReads, 0);
});

test('invalid bytes/schema/claim fail before edge identity and never produce a plan', async () => {
  for (const raw of ['{}', '{"version":1,"init":"bad"}', '{"version":1,"init":"x","canal_ref":"attacker"}']) {
    let edgeReads = 0;
    const guarded = { ...context, getNormalizedEdgeIp() { edgeReads++; return '192.0.2.10'; } };
    const result = await admitConsumeRequest(request(raw), guarded, 1001);
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 400);
    assert.equal(edgeReads, 0);
  }
});

test('valid admission reads trusted edge identity once and ignores spoofing headers', async () => {
  let edgeReads = 0;
  const guarded = { ...context, getNormalizedEdgeIp() { edgeReads++; return '198.51.100.7'; } };
  const result = await admitConsumeRequest(request(await body(), {
    'cf-connecting-ip': '203.0.113.99',
    'x-forwarded-for': '203.0.113.98',
    'content-type': 'application/json ; charset = utf-8',
  }), guarded, 1001);
  assert.equal(result.ok, true);
  assert.equal(result.plan.rpc, 'qr_resolver_registrar_interno_v1');
  assert.equal(edgeReads, 1);
  assert.equal(JSON.stringify(result.plan).includes('203.0.113.'), false);
});

test('admission has privacy/cache headers but never projects a false success response', async () => {
  const invalid = await admitConsumeRequest(request('{}'), context, 1001);
  assert.equal(invalid.response.headers.get('cache-control'), 'no-store');
  assert.equal(invalid.response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(invalid.response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(await invalid.response.json(), { ok: false, error: 'solicitud_no_valida' });
  const accepted = await admitConsumeRequest(request(await body()), context, 1001);
  assert.equal(accepted.ok, true);
  assert.equal(Object.hasOwn(accepted, 'response'), false);
});
