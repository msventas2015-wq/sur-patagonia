import test from 'node:test';
import assert from 'node:assert/strict';
import { createQaContactTransport } from '../../worker/qr/qa-contact-transport.mjs';
import { handleContact } from '../../worker/qr/contact-handler.mjs';

const origin = 'https://rsjwqmpseknvydistgfr.supabase.co';
const key = 'eyJ' + 'A'.repeat(16) + '.eyJ' + 'B'.repeat(16) + '.' + 'C'.repeat(16);
const newSecret = 'sb_' + 'secret_' + 'A'.repeat(32);
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const payload = {
  version: 1, request_id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Persona QA', email: 'persona@example.invalid', telefono: null,
  mensaje: 'Consulta controlada', propiedad_id: null,
  proyecto_slug: null, fuente: 'home_form',
};

test('full local consultation path crosses exact QA RPC bytes without public attribution', async () => {
  let seen;
  const transport = createQaContactTransport({ origin, serviceRoleKey: key,
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return reply(200, { ok: true, resultado: 'contacto_creado', replayed: false });
    },
  });
  const localOrigin = 'http://localhost:8787';
  const request = new Request(`${localOrigin}/api/contacto`, {
    method: 'POST',
    headers: { host: 'localhost:8787', origin: localOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const response = await handleContact(request, {
    host: 'localhost:8787', origin: localOrigin, environment: 'qa',
    rateKey: new Uint8Array(32).fill(1), payloadKey: new Uint8Array(32).fill(2),
    cookiePrefix: 'sp_attr_qa_',
    assertion: { currentKid: 'assert', keys: new Map([['assert', new Uint8Array(32).fill(3)]]) },
    getNormalizedEdgeIp: () => '192.0.2.10', callContact: transport,
  }, () => 1_000);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(seen.url, `${origin}/rest/v1/rpc/qr_contacto_registrar_interno_v1`);
  const wire = JSON.parse(seen.options.body);
  assert.match(wire.p_payload_hash, /^\\x[0-9a-f]{64}$/);
  assert.match(wire.p_network_hash, /^\\x[0-9a-f]{64}$/);
  assert.match(wire.p_worker_assertion, /^\\x[0-9a-f]{64}$/);
  assert.equal(wire.p_email, payload.email);
  assert.equal(Object.hasOwn(wire, 'p_canal_ref'), false);
  assert.equal(seen.options.body.includes(key), false);
});

test('new Supabase secret uses only apikey on contact transport', async () => {
  let headers;
  const transport = createQaContactTransport({ origin, serviceRoleKey: newSecret,
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return reply(200, { ok: true, resultado: 'contacto_creado', replayed: false });
    },
  });
  const result = await transport({
    rpc: 'qr_contacto_registrar_interno_v1',
    args: {
      p_ambiente: 'qa', p_request_id: payload.request_id,
      p_payload_hash: new Uint8Array(32), p_payload_key_id: 'v1',
      p_nombre: payload.nombre, p_email: payload.email, p_telefono: null,
      p_mensaje: payload.mensaje, p_propiedad_id: null, p_proyecto_slug: null,
      p_fuente: payload.fuente, p_network_hash: new Uint8Array(32),
      p_cookie_scan_state: 'within_limit', p_cookie_family_count: 0,
      p_cookie_family_bytes: 0, p_cookie_candidates: [],
      p_assertion_kid: 'assert', p_assertion_ts: '2026-09-21T15:00:00.000000Z',
      p_assertion_nonce: payload.request_id, p_worker_assertion: new Uint8Array(32),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(headers.apikey, newSecret);
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
});

test('server-confirmed conflict is 409; uncertain transport is never declared committed', async () => {
  const args = {
    p_ambiente: 'qa', p_request_id: payload.request_id,
    p_payload_hash: new Uint8Array(32), p_payload_key_id: 'v1',
    p_nombre: payload.nombre, p_email: payload.email, p_telefono: null,
    p_mensaje: payload.mensaje, p_propiedad_id: null, p_proyecto_slug: null,
    p_fuente: payload.fuente, p_network_hash: new Uint8Array(32),
    p_cookie_scan_state: 'within_limit', p_cookie_family_count: 0,
    p_cookie_family_bytes: 0, p_cookie_candidates: [],
    p_assertion_kid: 'assert', p_assertion_ts: '2026-09-21T15:00:00.000000Z',
    p_assertion_nonce: payload.request_id, p_worker_assertion: new Uint8Array(32),
  };
  const call = { rpc: 'qr_contacto_registrar_interno_v1', args };
  const conflict = createQaContactTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => reply(400, { code: 'P0001', message: 'QR_IDEMPOTENCY_CONFLICT' }),
  });
  await assert.rejects(conflict(call), error => error.code === 'QR_IDEMPOTENCY_CONFLICT' && error.transactionAborted);
  const uncertain = createQaContactTransport({ origin, serviceRoleKey: key,
    fetchImpl: async () => { throw new Error('lost_response'); },
  });
  await assert.rejects(uncertain(call), error => !error.transactionAborted);
});
