import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { issueClaim } from '../../worker/qr/init.mjs';
import { deriveHandoff } from '../../worker/qr/handoff.mjs';
import { encodePayloadEnvelope } from '../../worker/qr/payload-codec.mjs';
import { deriveRatePseudonyms, parseConsumePayload, prepareConsumePlan } from '../../worker/qr/consume-plan.mjs';

const initKey = Uint8Array.from({ length: 32 }, (_, i) => i);
const handoffKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const rateKey = new Uint8Array(32).fill(17);
const payloadKey = new Uint8Array(32).fill(29);
const init = {
  environment: 'qa',
  host: 'localhost:8787',
  origin: 'http://localhost:8787',
  currentKid: 'init-test',
  keys: new Map([['init-test', initKey]]),
};
const context = {
  init,
  rateKey,
  payloadKey,
  handoffCurrentKid: 'handoff-test',
  handoffKeys: new Map([['handoff-test', handoffKey]]),
  cookiePrefix: 'sp_attr_qa_',
};
const bytes = value => new TextEncoder().encode(value);
const hex = value => Buffer.from(value).toString('hex');
const u32 = value => { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; };
const lp = value => { const b = Buffer.from(value, 'utf8'); return Buffer.concat([u32(b.length), b]); };

test('consume payload is exact, strict and strictly below 512 bytes', () => {
  assert.deepEqual(parseConsumePayload(bytes('{"version":1,"init":"claim"}')), { version: 1, init: 'claim' });
  for (const raw of [
    '{"version":1,"init":"a","extra":1}',
    '{"version":1,"init":"a","init":"b"}',
    '{"version":"1","init":"a"}',
    '{"version":1,"init":""}',
    '{"version":1,"init":"' + 'a'.repeat(401) + '"}',
    ' '.repeat(512),
  ]) assert.throws(() => parseConsumePayload(bytes(raw)), raw.slice(0, 50));
});

test('rate pseudonyms reproduce the independent LP/HMAC recipe and isolate domains', async () => {
  const result = await deriveRatePseudonyms({ environment: 'qa', codigo: 'fixture-qr', normalizedEdgeIp: '2001:db8::1', rateKey });
  const base = Buffer.concat([lp('qr-rate-v1'), lp('qa')]);
  const expectedNetwork = createHmac('sha256', rateKey).update(Buffer.concat([base, lp('network'), lp('2001:db8::1')])).digest('hex');
  const expectedCode = createHmac('sha256', rateKey).update(Buffer.concat([base, lp('code'), lp('fixture-qr')])).digest('hex');
  assert.equal(hex(result.networkHash), expectedNetwork);
  assert.equal(hex(result.codigoHash), expectedCode);
  assert.notEqual(hex(result.networkHash), hex(result.codigoHash));
  await assert.rejects(deriveRatePseudonyms({ environment: 'qa', codigo: 'fixture-qr', normalizedEdgeIp: 'spoofed header', rateKey }));
  await assert.rejects(deriveRatePseudonyms({ environment: 'qa', codigo: 'fixture-qr', normalizedEdgeIp: '127.0.0.1', rateKey: new Uint8Array(31) }));
});

test('one sealed claim produces one closed RPC plan without retaining the IP', async () => {
  const issued = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'link' }, init, 1000);
  const plan = await prepareConsumePlan({
    body: bytes(JSON.stringify({ version: 1, init: issued.init })),
    cookieHeader: 'foreign=x',
    normalizedEdgeIp: '203.0.113.9',
  }, context, 1001);

  assert.equal(plan.rpc, 'qr_resolver_registrar_interno_v1');
  assert.deepEqual(Object.keys(plan.args), [
    'p_ambiente', 'p_request_id', 'p_payload_hash', 'p_payload_key_id', 'p_codigo', 'p_codigo_hash',
    'p_via', 'p_network_hash', 'p_handoff_hash', 'p_handoff_key_id', 'p_claim_expires_at',
    'p_cookie_scan_state', 'p_cookie_family_count', 'p_cookie_family_bytes', 'p_cookie_candidates',
  ]);
  assert.equal(plan.args.p_ambiente, 'qa');
  assert.equal(plan.args.p_codigo, 'fixture-qr');
  assert.equal(plan.args.p_via, 'link');
  assert.equal(plan.args.p_claim_expires_at, '1970-01-01T00:18:40.000Z');
  assert.equal(plan.args.p_cookie_scan_state, 'within_limit');
  assert.equal(plan.args.p_cookie_family_count, 0);
  assert.equal(plan.args.p_handoff_hash instanceof Uint8Array, true);
  assert.equal(plan.args.p_handoff_hash.length, 32);
  assert.equal(plan.responseCookie.slot, plan.args.p_request_id.replaceAll('-', ''));
  assert.deepEqual(plan.observedCookieSlots, []);
  assert.equal(JSON.stringify(plan).includes('203.0.113.9'), false);
  assert.equal(JSON.stringify(plan).includes(issued.init), false);

  const expectedEnvelope = encodePayloadEnvelope('qa', 'resolver', [
    ['request_id', 'uuid', plan.args.p_request_id],
    ['codigo', 'text', 'fixture-qr'],
    ['via', 'text', 'link'],
    ['version', 'int64', 1n],
  ]);
  assert.equal(hex(plan.args.p_payload_hash), createHmac('sha256', payloadKey).update(expectedEnvelope).digest('hex'));
});

test('existing cookie candidates are transported as slot/hash/kid and never trusted locally', async () => {
  const old = await deriveHandoff({
    environment: 'qa',
    requestId: '00000000-0000-4000-8000-000000000001',
    kid: 'handoff-test',
    keys: context.handoffKeys,
  });
  const issued = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'qr' }, init, 1000);
  const plan = await prepareConsumePlan({
    body: bytes(JSON.stringify({ version: 1, init: issued.init })),
    cookieHeader: `sp_attr_qa_${old.slot}=${old.value}`,
    normalizedEdgeIp: '192.0.2.4',
  }, context, 1001);
  assert.deepEqual(plan.args.p_cookie_candidates, [{ slot: old.slot, hash: old.handoffHash, kid: old.kid }]);
  assert.deepEqual(plan.observedCookieSlots, [old.slot]);
  assert.equal(Object.hasOwn(plan.args.p_cookie_candidates[0], 'authenticated'), false);
});

test('overflow sends no partial candidate and expired or altered claim yields no plan', async () => {
  const issued = await issueClaim({ version: 1, codigo: 'fixture-qr', via: 'qr' }, init, 1000);
  const body = bytes(JSON.stringify({ version: 1, init: issued.init }));
  const overflowSlots = Array.from({ length: 33 }, (_, i) =>
    `00000000000040008000${i.toString(16).padStart(12, '0')}`);
  const header = overflowSlots.map(slot => `sp_attr_qa_${slot}=x`).join('; ');
  const plan = await prepareConsumePlan({ body, cookieHeader: header, normalizedEdgeIp: '192.0.2.4' }, context, 1001);
  assert.equal(plan.args.p_cookie_scan_state, 'overflow');
  assert.equal(plan.args.p_cookie_family_count, 33);
  assert.deepEqual(plan.args.p_cookie_candidates, []);
  assert.deepEqual(plan.observedCookieSlots, overflowSlots);
  await assert.rejects(prepareConsumePlan({ body, normalizedEdgeIp: '192.0.2.4' }, context, 1120));
  const altered = body.slice(); altered[altered.length - 3] ^= 1;
  await assert.rejects(prepareConsumePlan({ body: altered, normalizedEdgeIp: '192.0.2.4' }, context, 1001));
});
