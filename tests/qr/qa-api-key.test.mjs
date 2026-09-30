import test from 'node:test';
import assert from 'node:assert/strict';
import { qaServiceHeaders } from '../../worker/qr/qa-api-key.mjs';

// Public, syntactically shaped fixtures; no real key is stored in tests.
const secret = 'sb_' + 'secret_' + 'A'.repeat(32);
const legacy = 'eyJ' + 'A'.repeat(16) + '.eyJ' + 'B'.repeat(16) + '.' + 'C'.repeat(16);

test('new QA secret is apikey-only, legacy JWT uses both headers', () => {
  assert.deepEqual(qaServiceHeaders(secret), { apikey: secret });
  assert.deepEqual(qaServiceHeaders(legacy), {
    apikey: legacy, Authorization: `Bearer ${legacy}`,
  });
});

test('publishable, arbitrary, malformed and absent values never become service credentials', () => {
  for (const key of [
    null, '', 'random-long-string-that-is-not-a-key',
    'sb_publishable_ABCDEFGHIJKLMNOPQRSTUV_abcdefgh',
    'sb_' + 'secret_' + 'short', 'eyJ.one.two',
  ]) assert.throws(() => qaServiceHeaders(key));
});
