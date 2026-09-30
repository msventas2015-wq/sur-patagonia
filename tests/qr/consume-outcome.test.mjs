import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHandoff } from '../../worker/qr/handoff.mjs';
import { projectConsumeOutcome } from '../../worker/qr/consume-outcome.mjs';

const requestId = '00000000-0000-4000-8000-000000000123';
const key = new Uint8Array(32).fill(7);
const context = { cookiePrefix: 'sp_attr_qa_', handoffKeys: new Map([['old-kid', key]]) };
const landing = {
  landing_id: '00000000-0000-4000-8000-000000000124',
  pageview_request_id: '00000000-0000-4000-8000-000000000125',
  path: '/propiedad',
  propiedad_id: '11111111-1111-4111-8111-111111111111',
  proyecto_slug: null,
};

const makePlan = (hash, state = 'within_limit', observedCookieSlots = []) => ({
  rpc: 'qr_resolver_registrar_interno_v1',
  args: {
    p_ambiente: 'qa', p_request_id: requestId, p_cookie_scan_state: state,
    p_handoff_key_id: 'old-kid', p_handoff_hash: Uint8Array.from(hash.match(/../g), byte => Number.parseInt(byte, 16)),
  },
  observedCookieSlots,
});

async function tracked({ replayed = false, expires = 34561000, kid = 'old-kid', keys = context.handoffKeys } = {}) {
  const proof = await deriveHandoff({ environment: 'qa', requestId, kid, keys });
  return {
    outcome: {
      ok: true, tracked: true, replayed,
      destino: '/propiedad.html?id=11111111-1111-4111-8111-111111111111',
      resultado: 'tracked',
      handoff: { request_id: requestId, kid, hash: proof.handoffHash, expires_at: new Date(expires * 1000).toISOString() },
      clear_slots: [],
      landing,
    },
    proof,
  };
}

test('fresh tracked outcome exposes only public fields and sets the exact non-sliding cookie', async () => {
  const { outcome, proof } = await tracked();
  const response = await projectConsumeOutcome(outcome, makePlan(proof.handoffHash), context, 1000);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true, tracked: true,
    destino: '/propiedad.html?id=11111111-1111-4111-8111-111111111111',
    landing,
  });
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^sp_attr_qa_00000000000040008000000000000123=v1\.old-kid\.[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=34560000; Expires=/);
  assert.equal(cookie.includes('Secure'), false);
  assert.equal(JSON.stringify(outcome).includes('old-kid'), true);
  assert.equal(JSON.stringify(body).includes('old-kid'), false);
});

test('production cookie is __Host secure and replay reconstructs the original retired kid', async () => {
  const { outcome, proof } = await tracked({ replayed: true });
  const response = await projectConsumeOutcome(outcome, makePlan(proof.handoffHash), {
    ...context, cookiePrefix: '__Host-sp_attr_', handoffKeys: new Map([['old-kid', key], ['current-kid', new Uint8Array(32).fill(8)]]),
  }, 1000);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /^__Host-sp_attr_.*; HttpOnly; Secure; SameSite=Lax; Path=\//);
});

test('overflow, expiry or missing retired key never invents or renews a cookie', async () => {
  const { outcome, proof } = await tracked({ replayed: true });
  for (const [plan, candidateContext, now] of [
    [makePlan(proof.handoffHash, 'overflow'), context, 1000],
    [makePlan(proof.handoffHash), context, 34561000],
    [makePlan(proof.handoffHash), { ...context, handoffKeys: new Map() }, 1000],
  ]) {
    const response = await projectConsumeOutcome(outcome, plan, candidateContext, now);
    assert.equal(response.status, 200);
    assert.equal(response.headers.has('set-cookie'), false);
  }
});

test('created overflow expires observed family slots and emits only the new fixed handoff', async () => {
  const { outcome, proof } = await tracked({ replayed: false });
  const oldA = '00000000000040008000000000000456';
  const oldB = '00000000000040008000000000000789';
  const response = await projectConsumeOutcome(
    outcome,
    makePlan(proof.handoffHash, 'overflow', [oldA, oldB]),
    context,
    1000,
  );
  assert.equal(response.status, 200);
  const cookies = response.headers.get('set-cookie');
  assert.match(cookies, new RegExp(`sp_attr_qa_${oldA}=;`));
  assert.match(cookies, new RegExp(`sp_attr_qa_${oldB}=;`));
  assert.match(cookies, new RegExp(`sp_attr_qa_${requestId.replaceAll('-', '')}=v1\\.old-kid\\.`));
});

test('destination and landing must form one closed semantic pair', async () => {
  const { outcome, proof } = await tracked();
  for (const mutation of [
    { ...outcome, destino: 'https://evil.invalid/' },
    { ...outcome, destino: '/propiedad.html?id=22222222-2222-4222-8222-222222222222' },
    { ...outcome, landing: { ...landing, path: '/proyecto-mini' } },
    { ...outcome, landing: { ...landing, extra: true } },
  ]) assert.equal((await projectConsumeOutcome(mutation, makePlan(proof.handoffHash), context, 1000)).status, 502);
});

test('fresh proof mismatch fails closed; replay with valid historical proof succeeds', async () => {
  const { outcome } = await tracked();
  const wrong = makePlan('00'.repeat(32));
  assert.equal((await projectConsumeOutcome(outcome, wrong, context, 1000)).status, 502);
  assert.equal((await projectConsumeOutcome({ ...outcome, replayed: true }, wrong, context, 1000)).status, 200);
});

test('created clears validated older slots, while a replay is forbidden from clearing', async () => {
  const { outcome, proof } = await tracked();
  const oldSlot = '00000000000040008000000000000456';
  const response = await projectConsumeOutcome({ ...outcome, clear_slots: [oldSlot] }, makePlan(proof.handoffHash), context, 1000);
  const cookies = response.headers.get('set-cookie');
  assert.match(cookies, new RegExp(`sp_attr_qa_${oldSlot}=;`));
  assert.match(cookies, /Max-Age=0/);
  assert.match(cookies, new RegExp(`sp_attr_qa_${requestId.replaceAll('-', '')}=v1\\.old-kid\\.`));
  assert.equal((await projectConsumeOutcome({ ...outcome, replayed: true, clear_slots: [oldSlot] }, makePlan(proof.handoffHash), context, 1000)).status, 502);
});

test('negative outcomes are generic and never set cookies', async () => {
  const missing = { ok: false, tracked: false, replayed: false, resultado: 'unknown_or_inactive', http_status: 404 };
  const limited = { ok: false, tracked: false, replayed: true, resultado: 'rate_limited', http_status: 429, clear_slots: [], retry_after: 17 };
  const plan = makePlan('00'.repeat(32));
  const r404 = await projectConsumeOutcome(missing, plan, context, 1000);
  assert.equal(r404.status, 404); assert.deepEqual(await r404.json(), { ok: false, error: 'contenido_no_disponible' });
  const r429 = await projectConsumeOutcome(limited, plan, context, 1000);
  assert.equal(r429.status, 429); assert.deepEqual(await r429.clone().json(), { ok: false, error: 'intenta_nuevamente' });
  assert.equal(r429.headers.get('retry-after'), '17');
  assert.equal(r404.headers.has('set-cookie') || r429.headers.has('set-cookie'), false);
});

test('unknown, extra or contradictory database fields never become success', async () => {
  const { outcome, proof } = await tracked();
  for (const mutation of [
    { ...outcome, extra: true },
    { ...outcome, ok: false },
    { ok: false, tracked: false, replayed: false, resultado: 'mystery', http_status: 404 },
    null,
  ]) assert.equal((await projectConsumeOutcome(mutation, makePlan(proof.handoffHash), context, 1000)).status, 502);
});
