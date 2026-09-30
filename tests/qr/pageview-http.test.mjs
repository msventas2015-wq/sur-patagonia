import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageviewPayload, readPageviewRequest } from '../../worker/qr/pageview-http.mjs';

const origin = 'http://localhost:8787';
const context = { origin, host: 'localhost:8787' };
const id = '00000000-0000-4000-8000-000000000001';
const payload = {
  version: 1, request_id: id, landing_id: null,
  path: '/', propiedad_id: null, proyecto_slug: null,
};
const bytes = value => new TextEncoder().encode(value);
function request(body = payload, path = '/api/qr/pageview', headers = {}, method = 'POST') {
  return new Request(origin + path, {
    method,
    headers: { host: context.host, origin, 'content-type': 'application/json', ...headers },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }),
  });
}

test('pageview boundary accepts exact ACK and real-navigation shapes without assigning a channel', async () => {
  const cases = [
    payload,
    { ...payload, landing_id: id },
    { ...payload, path: '/servicios' },
    { ...payload, path: '/propiedad', propiedad_id: id },
    { ...payload, path: '/proyecto-mini', proyecto_slug: 'desarrollo-uno' },
  ];
  for (const value of cases) {
    const result = await readPageviewRequest(request(value), context);
    assert.equal(result.accepted, true);
    assert.deepEqual({ ...result.payload }, value);
    assert.equal(Object.hasOwn(result.payload, 'canal_ref'), false);
  }
});

test('pageview rejects syntax, forbidden identity, mismatched content and admin paths before writer', async () => {
  for (const value of [
    { ...payload, canal_ref: 'fabricado' },
    { ...payload, version: '1' },
    { ...payload, request_id: 'bad' },
    { ...payload, landing_id: 'bad' },
    { ...payload, path: '/admin/crm' },
    { ...payload, path: '/', propiedad_id: id },
    { ...payload, path: '/propiedad' },
    { ...payload, path: '/proyecto-mini', proyecto_slug: 'INVALID' },
  ]) assert.equal((await readPageviewRequest(request(value), context)).response.status, 400);
  assert.throws(() => parsePageviewPayload(bytes('{"version":1,"version":1}')));
});

test('pageview HTTP order and streamed limit are closed', async () => {
  assert.equal((await readPageviewRequest(request(payload, '/api/qr/pageview', {}, 'GET'), context)).response.status, 405);
  assert.equal((await readPageviewRequest(request(payload, '/api/qr/pageview', { origin: 'https://evil.invalid' }), context)).response.status, 400);
  assert.equal((await readPageviewRequest(request(payload, '/api/qr/pageview', { 'content-type': 'text/plain' }), context)).response.status, 415);
  assert.equal((await readPageviewRequest(request(payload, '/api/qr/pageview?x=1'), context)).response.status, 400);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(1024));
    controller.enqueue(new Uint8Array(1025));
    controller.close();
  } });
  const streamed = new Request(origin + '/api/qr/pageview', {
    method: 'POST', headers: { host: context.host, origin, 'content-type': 'application/json' },
    body: stream, duplex: 'half',
  });
  assert.equal((await readPageviewRequest(streamed, context)).response.status, 413);
});
