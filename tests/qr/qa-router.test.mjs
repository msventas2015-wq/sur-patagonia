import test from 'node:test';
import assert from 'node:assert/strict';
import { routeQaApi } from '../../worker/qr/qa-router.mjs';

const origin = 'http://localhost:8787';
const host = 'localhost:8787';
const init = {
  environment: 'qa', host, origin, currentKid: 'fixture',
  keys: new Map([['fixture', new Uint8Array(32).fill(7)]]),
};
function request(path, method = 'POST', body = '{}') {
  return new Request(origin + path, {
    method,
    headers: { host, origin, 'content-type': 'application/json' },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
  });
}

test('QA router dispatches only four exact paths and never handles /r/ as an API', async () => {
  for (const path of ['/r/fixture-qr', '/api/qr/init/extra', '/api/qr/pageview/extra', '/admin']) {
    const response = await routeQaApi(request(path), { init });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await routeQaApi(
    request('/api/qr/init', 'POST', JSON.stringify({ version: 1, codigo: 'fixture-qr', via: 'qr' })),
    { init },
  );
  assert.equal(response.status, 200);
  assert.match((await response.json()).init, /^v1\.fixture\./);
});

test('QA router does not run a production context and leaves method validation to endpoints', async () => {
  assert.equal((await routeQaApi(request('/api/qr/init'), {
    init: { ...init, environment: 'prod' },
  })).status, 503);
  const wrongMethod = await routeQaApi(request('/api/qr/init', 'GET'), { init });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.equal((await routeQaApi(request('/api/qr/consume'), {})).status, 503);
  assert.equal((await routeQaApi(request('/api/contacto'), {})).status, 503);
  assert.equal((await routeQaApi(request('/api/qr/pageview'), {})).status, 503);
});
