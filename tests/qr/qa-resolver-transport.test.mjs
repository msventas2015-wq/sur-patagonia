import test from 'node:test';
import assert from 'node:assert/strict';
import { createQaResolverTransport } from '../../worker/qr/qa-resolver-transport.mjs';
import { handleConsume } from '../../worker/qr/consume-handler.mjs';
import { issueClaim } from '../../worker/qr/init.mjs';

const key = 'eyJ' + 'A'.repeat(16) + '.eyJ' + 'B'.repeat(16) + '.' + 'C'.repeat(16);
const newSecret = 'sb_' + 'secret_' + 'A'.repeat(32);
const origin = 'https://rsjwqmpseknvydistgfr.supabase.co';
const args = {
  p_ambiente: 'qa', p_request_id: '00000000-0000-4000-8000-000000000001',
  p_payload_hash: new Uint8Array(32).fill(1), p_payload_key_id: 'v1',
  p_codigo: 'fixture-qr', p_codigo_hash: new Uint8Array(32).fill(2),
  p_via: 'qr', p_network_hash: new Uint8Array(32).fill(3),
  p_handoff_hash: new Uint8Array(32).fill(4), p_handoff_key_id: 'handoff',
  p_claim_expires_at: '2026-09-21T15:00:00.000Z',
  p_cookie_scan_state: 'within_limit', p_cookie_family_count: 0,
  p_cookie_family_bytes: 0, p_cookie_candidates: [],
  p_assertion_kid: 'assert', p_assertion_ts: '2026-09-21T14:59:00.000000Z',
  p_assertion_nonce: '00000000-0000-4000-8000-000000000002',
  p_worker_assertion: new Uint8Array(32).fill(5),
};
const call = { rpc: 'qr_resolver_registrar_interno_v1', args };
const response = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

test('closed QA transport maps exact bytea fields and never places secrets in body', async () => {
  let seen;
  const transport = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async (url, options) => { seen = { url, options }; return response(200, { ok: false, resultado: 'unknown_or_inactive' }); },
  });
  assert.equal((await transport(call)).resultado, 'unknown_or_inactive');
  assert.equal(seen.url, `${origin}/rest/v1/rpc/qr_resolver_registrar_interno_v1`);
  assert.equal(seen.options.headers.Authorization, `Bearer ${key}`);
  const sent = JSON.parse(seen.options.body);
  assert.equal(sent.p_payload_hash, `\\x${'01'.repeat(32)}`);
  assert.equal(sent.p_worker_assertion, `\\x${'05'.repeat(32)}`);
  assert.equal(sent.p_cookie_candidates.length, 0);
  assert.equal(seen.options.body.includes(key), false);
  assert.equal(args.p_payload_hash instanceof Uint8Array, true);
});

test('new Supabase secret never appears as a bearer token', async () => {
  let headers;
  const transport = createQaResolverTransport({ origin, serviceRoleKey: newSecret,
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return response(200, { ok: false, resultado: 'unknown_or_inactive' });
    },
  });
  await transport(call);
  assert.equal(headers.apikey, newSecret);
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
});

test('only an HTTP reply with server SQLSTATE 40001 proves abort', async () => {
  const aborted = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => response(500, { code: '40001' }),
  });
  await assert.rejects(aborted(call), error => error.code === '40001' && error.transactionAborted === true);
  const uncertain = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => { throw new Error('timeout'); },
  });
  await assert.rejects(uncertain(call), error => error.transactionAborted !== true);
  for (const code of ['QR_CLAIM_EXPIRED', 'QR_IDEMPOTENCY_CONFLICT']) {
    const rejected = createQaResolverTransport({ origin, serviceRoleKey: key,
      fetchImpl: async () => response(400, { code: 'P0001', message: code }),
    });
    await assert.rejects(rejected(call), error => error.code === code && error.transactionAborted === true);
  }
});

test('endpoint, environment, payload and response remain closed', async () => {
  assert.throws(() => createQaResolverTransport({ origin: 'https://other.supabase.co', serviceRoleKey: key, fetchImpl: fetch }));
  let calls = 0;
  const transport = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => { calls++; return response(200, { ok: true }); },
  });
  await assert.rejects(transport({ ...call, args: { ...args, p_canal_ref: 'forged' } }));
  await assert.rejects(transport({ ...call, args: { ...args, p_ambiente: 'production' } }));
  assert.equal(calls, 0);
  const html = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  });
  await assert.rejects(html(call));
});

test('full local init → admission → assertion → QA wire → committed outcome → cookie', async () => {
  const localOrigin = 'http://localhost:8787';
  const init = {
    environment: 'qa', host: 'localhost:8787', origin: localOrigin,
    currentKid: 'init', keys: new Map([['init', new Uint8Array(32).fill(11)]]),
  };
  const claim = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'qr' }, init, 1000);
  const transport = createQaResolverTransport({ origin, serviceRoleKey: key,
    fetchImpl: async (_url, options) => {
      const wire = JSON.parse(options.body);
      assert.match(wire.p_handoff_hash, /^\\x[0-9a-f]{64}$/);
      assert.match(wire.p_worker_assertion, /^\\x[0-9a-f]{64}$/);
      return response(200, {
        ok: true, tracked: true, replayed: false, resultado: 'tracked',
        destino: '/', clear_slots: [],
        handoff: {
          request_id: wire.p_request_id,
          kid: wire.p_handoff_key_id,
          hash: wire.p_handoff_hash.slice(2),
          expires_at: new Date((1000 + 400 * 86400) * 1000).toISOString(),
        },
        landing: {
          landing_id: '00000000-0000-4000-8000-000000000124',
          pageview_request_id: '00000000-0000-4000-8000-000000000125',
          path: '/', propiedad_id: null, proyecto_slug: null,
        },
      });
    },
  });
  const context = {
    init, rateKey: new Uint8Array(32).fill(12),
    payloadKey: new Uint8Array(32).fill(13),
    handoffCurrentKid: 'handoff',
    handoffKeys: new Map([['handoff', new Uint8Array(32).fill(14)]]),
    cookiePrefix: 'sp_attr_qa_',
    assertion: { currentKid: 'assert', keys: new Map([['assert', new Uint8Array(32).fill(15)]]) },
    getNormalizedEdgeIp: () => '192.0.2.10',
    callResolver: transport,
  };
  const request = new Request(`${localOrigin}/api/qr/consume`, {
    method: 'POST',
    headers: { host: init.host, origin: localOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, init: claim.init }),
  });
  const result = await handleConsume(request, context, () => 1_001_000);
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).destino, '/');
  assert.match(result.headers.get('set-cookie'), /Max-Age=34559999/);
});
