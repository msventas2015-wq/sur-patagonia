import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContact } from '../../worker/qr/contact-handler.mjs';

const host = 'localhost:8787';
const origin = `http://${host}`;
const base = {
  host, origin, environment: 'qa',
  rateKey: new Uint8Array(32).fill(1), payloadKey: new Uint8Array(32).fill(2),
  cookiePrefix: 'sp_attr_qa_',
  assertion: { currentKid: 'assert', keys: new Map([['assert', new Uint8Array(32).fill(3)]]) },
  getNormalizedEdgeIp: () => '192.0.2.10',
};
const payload = {
  version: 1, request_id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Persona QA', email: 'persona@example.invalid', telefono: null,
  mensaje: 'Consulta controlada', propiedad_id: null, proyecto_slug: null,
  fuente: 'home_form',
};
function request(body = payload) {
  return new Request(`${origin}/api/contacto`, {
    method: 'POST',
    headers: { host, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('invalid request does not call commercial writer', async () => {
  let calls = 0;
  const response = await handleContact(request({ ...payload, canal_ref: 'forged' }), {
    ...base, callContact() { calls++; },
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test('committed contact projects only public success, no attribution or PII', async () => {
  let seen;
  const response = await handleContact(request(), {
    ...base, callContact(signed) {
      seen = signed;
      return { ok: true, resultado: 'contacto_creado', replayed: false };
    },
  }, () => 1000);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(seen.rpc, 'qr_contacto_registrar_interno_v1');
  assert.equal(seen.args.p_worker_assertion.length, 32);
  assert.equal(Object.hasOwn(seen.args, 'p_canal_ref'), false);
});

test('a proven SQL abort retries same contact UUID with a fresh nonce', async () => {
  const calls = [];
  const response = await handleContact(request(), {
    ...base, callContact(signed) {
      calls.push(signed);
      if (calls.length === 1) throw Object.assign(new Error('abort'), {
        code: '40001', transactionAborted: true,
      });
      return { ok: true, resultado: 'contacto_creado', replayed: false };
    },
  }, () => 1000);
  assert.equal(response.status, 201);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
  assert.notEqual(calls[0].args.p_assertion_nonce, calls[1].args.p_assertion_nonce);
});

test('unknown commit is never declared successful or automatically retried', async () => {
  let calls = 0;
  const response = await handleContact(request(), {
    ...base, callContact() { calls++; throw new Error('transport_timeout'); },
  });
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
});

test('server-confirmed contact UUID conflict is a generic 409 without a second write', async () => {
  let calls = 0;
  const response = await handleContact(request(), {
    ...base, callContact() {
      calls++;
      throw Object.assign(new Error('conflict'), {
        code: 'QR_IDEMPOTENCY_CONFLICT', transactionAborted: true,
      });
    },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { ok: false, error: 'solicitud_no_valida' });
  assert.equal(calls, 1);
});

test('only closed outcomes project success, generic 400 or bounded 429', async () => {
  for (const [outcome, status, body] of [
    [{ ok: false, resultado: 'payload_invalid', replayed: false }, 400, { ok: false, error: 'solicitud_no_valida' }],
    [{ ok: false, resultado: 'rate_limited', replayed: true, retry_after: 17 }, 429, { ok: false, error: 'intenta_nuevamente' }],
    [{ ok: true, resultado: 'contacto_creado', replayed: false, canal_ref: 'leak' }, 502, { ok: false, error: 'solicitud_no_valida' }],
    [{ ok: true, resultado: 'contacto_atribuido', replayed: false }, 502, { ok: false, error: 'solicitud_no_valida' }],
  ]) {
    const response = await handleContact(request(), { ...base, callContact: () => outcome });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '17');
  }
});

test('the full ten-minute contact bucket remains a 429, never an uncertain 502', async () => {
  for (const seconds of [121, 370, 589, 600]) {
    const response = await handleContact(request(), {
      ...base,
      callContact: () => ({
        ok: false, resultado: 'rate_limited', replayed: seconds === 370,
        retry_after: seconds,
      }),
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), String(seconds));
  }
  const outside = await handleContact(request(), {
    ...base,
    callContact: () => ({ ok: false, resultado: 'rate_limited', replayed: false, retry_after: 601 }),
  });
  assert.equal(outside.status, 502);
});
