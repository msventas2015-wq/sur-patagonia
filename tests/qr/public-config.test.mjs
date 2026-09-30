import test from 'node:test';
import assert from 'node:assert/strict';
import {qrFallbackConfig} from '../../js/qr-public-config.mjs';

test('fallback configuration is environment-bound and unknown hosts fail closed',()=>{
  const prod=qrFallbackConfig('surpatagonian.com');
  assert.match(prod.rpcUrl,/wajkfydxutptcvvfwrvq/);
  assert.equal(qrFallbackConfig('www.surpatagonian.com').rpcUrl,prod.rpcUrl);
  const qa=qrFallbackConfig('127.0.0.1');
  assert.match(qa.rpcUrl,/rsjwqmpseknvydistgfr/);
  assert.notEqual(qa.rpcUrl,prod.rpcUrl);
  assert.deepEqual(qrFallbackConfig('preview.pages.dev'),{rpcUrl:'',anonKey:''});
});
