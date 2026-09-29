import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rateBucket } from '../../worker/qr/rate-buckets.mjs';

const network = new Uint8Array(32).fill(0x11);
const code = new Uint8Array(32).fill(0x22);
const independent = (label, ...parts) => createHash('sha256')
  .update(Buffer.from(label, 'utf8')).update(Buffer.from([0]))
  .update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest();

test('all nine closed scopes preserve their exact limits and binary recipe', async () => {
  const specs = [
    ['resolver_network', null, [network], 120, 60],
    ['resolver_code', null, [code], 1000, 60],
    ['resolver_network_code', 'qr-rate-v1/resolver/network-code', [network, code], 20, 60],
    ['pageview_network', null, [network], 180, 60],
    ['contacto_network', null, [network], 5, 600],
    ['contacto_handoff', 'qr-rate-v1/contact/handoff', [code], 3, 600],
    ['report_network', null, [network], 120, 60],
    ['report_network_token', 'qr-rate-v1/report/network-token', [network, code], 30, 60],
    ['report_token', 'qr-rate-v1/report/token', [code], 600, 60],
  ];
  for (const [scope, label, args, limit, windowSeconds] of specs) {
    const result = await rateBucket(scope, ...args);
    assert.equal(result.scope, scope);
    assert.equal(result.limit, limit);
    assert.equal(result.windowSeconds, windowSeconds);
    assert.deepEqual(Buffer.from(result.identity), label ? independent(label, ...args) : Buffer.from(args[0]));
  }
});

test('unknown scopes, prototype names, bad arity and non-32-byte inputs fail closed', async () => {
  for (const scope of ['__proto__', 'constructor', 'toString', '', 'resolver', null, 1]) {
    await assert.rejects(rateBucket(scope, network), /invalid_rate_scope/);
  }
  for (const args of [[], [network, code], [null], ['11'.repeat(32)], [new Uint8Array(31)], [new Uint8Array(33)], [new ArrayBuffer(32)]]) {
    await assert.rejects(rateBucket('resolver_network', ...args), /invalid_rate_hashes/);
  }
  await assert.rejects(rateBucket('resolver_network_code', network), /invalid_rate_hashes/);
});

test('scope and ordered inputs cannot alias; direct identities are independent copies', async () => {
  const a = await rateBucket('resolver_network_code', network, code);
  const b = await rateBucket('resolver_network_code', code, network);
  const c = await rateBucket('report_network_token', network, code);
  assert.notDeepEqual(a.identity, b.identity);
  assert.notDeepEqual(a.identity, c.identity);
  const input = network.slice();
  const pending = rateBucket('resolver_network', input);
  input.fill(0);
  const copied = await pending;
  assert.deepEqual(copied.identity, network);
  copied.identity.fill(0);
  assert.deepEqual((await rateBucket('resolver_network', network)).identity, network);
});
