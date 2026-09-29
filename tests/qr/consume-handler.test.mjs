import test from 'node:test';
import assert from 'node:assert/strict';
import { issueClaim } from '../../worker/qr/init.mjs';
import { handleConsume } from '../../worker/qr/consume-handler.mjs';

const nowSeconds = 1000;
const nowMillis = () => (nowSeconds + 1) * 1000;
const initKey = new Uint8Array(32).fill(1);
const host = 'localhost:8787';
const origin = `http://${host}`;
const base = {
  init: { environment: 'qa', host, origin, currentKid: 'init', keys: new Map([['init', initKey]]) },
  rateKey: new Uint8Array(32).fill(2),
  payloadKey: new Uint8Array(32).fill(3),
  handoffCurrentKid: 'handoff',
  handoffKeys: new Map([['handoff', new Uint8Array(32).fill(4)]]),
  cookiePrefix: 'sp_attr_qa_',
  assertion: { currentKid: 'assert', keys: new Map([['assert', new Uint8Array(32).fill(5)]]) },
  getNormalizedEdgeIp: () => '192.0.2.10',
};

async function validRequest() {
  const claim = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'qr' }, base.init, nowSeconds);
  return new Request(`${origin}/api/qr/consume`, {
    method: 'POST',
    headers: { host, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, init: claim.init }),
  });
}

function tracked(signed) {
  const a = signed.args;
  return {
    ok: true, tracked: true, replayed: false, resultado: 'tracked',
    destino: '/', clear_slots: [],
    handoff: {
      request_id: a.p_request_id,
      kid: a.p_handoff_key_id,
      hash: Buffer.from(a.p_handoff_hash).toString('hex'),
      expires_at: new Date((nowSeconds + 400 * 86400) * 1000).toISOString(),
    },
    landing: {
      landing_id: '00000000-0000-4000-8000-000000000124',
      pageview_request_id: '00000000-0000-4000-8000-000000000125',
      path: '/', propiedad_id: null, proyecto_slug: null,
    },
  };
}

test('invalid admission never signs or calls the commercial writer', async () => {
  let calls = 0;
  const request = new Request(`${origin}/api/qr/consume`, {
    method: 'POST',
    headers: { host, origin, 'content-type': 'application/json' },
    body: '{}',
  });
  const response = await handleConsume(request, { ...base, callResolver() { calls++; } }, nowMillis);
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('committed result alone projects a tracked navigation and fixed handoff', async () => {
  const calls = [];
  const response = await handleConsume(await validRequest(), {
    ...base,
    callResolver(signed) { calls.push(signed); return tracked(signed); },
  }, nowMillis);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rpc, 'qr_resolver_registrar_interno_v1');
  assert.equal(calls[0].args.p_worker_assertion.length, 32);
  assert.deepEqual(await response.json(), {
    ok: true, tracked: true, destino: '/', landing: tracked(calls[0]).landing,
  });
  assert.match(response.headers.get('set-cookie'), /Max-Age=34559999/);
});

test('definite 40001 abort retries once with the same request and a fresh assertion', async () => {
  const calls = [];
  const response = await handleConsume(await validRequest(), {
    ...base,
    callResolver(signed) {
      calls.push(signed);
      if (calls.length === 1) throw Object.assign(new Error('serialization_failure'), {
        code: '40001', transactionAborted: true,
      });
      return tracked(signed);
    },
  }, nowMillis);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
  assert.deepEqual(calls[0].args.p_payload_hash, calls[1].args.p_payload_hash);
  assert.notEqual(calls[0].args.p_assertion_nonce, calls[1].args.p_assertion_nonce);
});

test('uncertain transport error is not replayed as an automatic database retry', async () => {
  let calls = 0;
  const response = await handleConsume(await validRequest(), {
    ...base,
    callResolver() { calls++; throw new Error('timeout_after_unknown_commit'); },
  }, nowMillis);
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
  assert.equal(response.headers.has('set-cookie'), false);
});

test('unproved serialization label and contradictory committed result fail closed', async () => {
  for (const callResolver of [
    () => { throw Object.assign(new Error('maybe'), { code: '40001' }); },
    signed => ({ ...tracked(signed), destino: 'https://outside.invalid/' }),
  ]) {
    let calls = 0;
    const response = await handleConsume(await validRequest(), {
      ...base, callResolver(signed) { calls++; return callResolver(signed); },
    }, nowMillis);
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
    assert.equal(response.headers.has('set-cookie'), false);
  }
});

test('database-confirmed expiry and UUID conflict map to closed 400 and 409', async () => {
  for (const [code, status] of [
    ['QR_CLAIM_EXPIRED', 400], ['QR_IDEMPOTENCY_CONFLICT', 409],
  ]) {
    const response = await handleConsume(await validRequest(), {
      ...base,
      callResolver() { throw Object.assign(new Error('closed'), { code, transactionAborted: true }); },
    }, nowMillis);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error: 'solicitud_no_valida' });
  }
});
