import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {contactArgumentsBytes,contactArgumentsHash,resolverArgumentsBytes,
  resolverArgumentsHash,signContactCall,signResolverCall} from '../../worker/qr/worker-assertion.mjs';

const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const i64 = n => { const b=Buffer.alloc(8); b.writeBigInt64BE(n); return b; };
const lp = s => { const b=Buffer.from(s,'utf8'); return Buffer.concat([u32(b.length),b]); };
const uuid = s => Buffer.from(s.replaceAll('-',''),'hex');
const requestId = '00112233-4455-4677-8899-aabbccddeeff';
const nonce = '11112233-4455-4677-8899-aabbccddeeff';
const assertionKey = new Uint8Array(32).fill(9);
const candidate = { slot:'00000000000040008000000000000001', hash:'77'.repeat(32), kid:'handoff-old' };
const plan = {
  rpc:'qr_resolver_registrar_interno_v1',
  args:{
    p_ambiente:'qa',p_request_id:requestId,p_payload_hash:new Uint8Array(32).fill(1),p_payload_key_id:'v1',
    p_codigo:'fixture-qr',p_codigo_hash:new Uint8Array(32).fill(2),p_via:'qr',p_network_hash:new Uint8Array(32).fill(3),
    p_handoff_hash:new Uint8Array(32).fill(4),p_handoff_key_id:'handoff-current',p_claim_expires_at:'2026-09-21T03:00:00.000Z',
    p_cookie_scan_state:'within_limit',p_cookie_family_count:1,p_cookie_family_bytes:100,p_cookie_candidates:[candidate],
  },
};
const contactPlan={rpc:'qr_contacto_registrar_interno_v1',args:{
  p_ambiente:'qa',p_request_id:requestId,p_payload_hash:new Uint8Array(32).fill(5),p_payload_key_id:'v1',
  p_nombre:'Persona QA',p_email:'Persona@example.invalid',p_telefono:null,p_mensaje:'Consulta',
  p_propiedad_id:null,p_proyecto_slug:null,p_fuente:'home_form',p_network_hash:new Uint8Array(32).fill(6),
  p_cookie_scan_state:'within_limit',p_cookie_family_count:1,p_cookie_family_bytes:100,
  p_cookie_candidates:[candidate],
}};

test('resolver arguments reproduce an independent closed binary recipe', async () => {
  const c = Buffer.concat([u32(1),uuid('00000000-0000-4000-8000-000000000001'),Buffer.from(candidate.hash,'hex'),lp(candidate.kid)]);
  const expected = Buffer.concat([
    lp('qr-resolver-args-v1'),lp('qa'),uuid(requestId),Buffer.alloc(32,1),lp('v1'),lp('fixture-qr'),Buffer.alloc(32,2),
    lp('qr'),Buffer.alloc(32,3),Buffer.alloc(32,4),lp('handoff-current'),i64(BigInt(Date.parse(plan.args.p_claim_expires_at))*1000n),
    lp('within_limit'),i64(1n),i64(100n),c,
  ]);
  assert.equal(Buffer.from(resolverArgumentsBytes(plan)).toString('hex'),expected.toString('hex'));
  assert.equal(Buffer.from(await resolverArgumentsHash(plan)).toString('hex'),createHash('sha256').update(expected).digest('hex'));
});

test('one-shot assertion covers endpoint, request, key id, timestamp, nonce and arguments hash', async () => {
  const signed = await signResolverCall(plan,{currentKid:'assert-v1',keys:new Map([['assert-v1',assertionKey]])},1_790_000_000_123,nonce);
  const timestamp='2026-09-21T14:13:20.123000Z';
  assert.equal(signed.args.p_assertion_ts,timestamp);
  const argsHash=createHash('sha256').update(Buffer.from(resolverArgumentsBytes(plan))).digest();
  const message=Buffer.concat([lp('qr-worker-assert-v1'),lp('qa'),lp(plan.rpc),uuid(requestId),lp('assert-v1'),lp(timestamp),uuid(nonce),argsHash]);
  assert.equal(Buffer.from(signed.args.p_worker_assertion).toString('hex'),createHmac('sha256',assertionKey).update(message).digest('hex'));
  assert.equal(Object.hasOwn(plan.args,'p_worker_assertion'),false);
});

test('any business mutation or missing nominal key fails or changes the assertion', async () => {
  const context={currentKid:'assert-v1',keys:new Map([['assert-v1',assertionKey]])};
  const original=await signResolverCall(plan,context,1_790_000_000_123,nonce);
  const changed={...plan,args:{...plan.args,p_cookie_family_bytes:101}};
  const altered=await signResolverCall(changed,context,1_790_000_000_123,nonce);
  assert.notEqual(Buffer.from(original.args.p_worker_assertion).toString('hex'),Buffer.from(altered.args.p_worker_assertion).toString('hex'));
  await assert.rejects(signResolverCall(plan,{currentKid:'missing',keys:new Map()},1_790_000_000_123,nonce));
  await assert.rejects(signResolverCall(plan,context,1_790_000_000_123,'not-a-uuid'));
});

test('contact arguments and assertion use the same closed independent recipe',async()=>{
  const c=Buffer.concat([u32(1),uuid('00000000-0000-4000-8000-000000000001'),
    Buffer.from(candidate.hash,'hex'),lp(candidate.kid)]);
  const expected=Buffer.concat([
    lp('qr-contact-args-v1'),lp('qa'),uuid(requestId),Buffer.alloc(32,5),lp('v1'),
    lp('Persona QA'),Buffer.concat([Buffer.from([1]),lp('Persona@example.invalid')]),
    Buffer.from([0]),lp('Consulta'),Buffer.from([0]),Buffer.from([0]),lp('home_form'),
    Buffer.alloc(32,6),lp('within_limit'),i64(1n),i64(100n),c,
  ]);
  assert.equal(Buffer.from(contactArgumentsBytes(contactPlan)).toString('hex'),expected.toString('hex'));
  assert.equal(Buffer.from(await contactArgumentsHash(contactPlan)).toString('hex'),
    createHash('sha256').update(expected).digest('hex'));
  const signed=await signContactCall(contactPlan,
    {currentKid:'assert-v1',keys:new Map([['assert-v1',assertionKey]])},
    1_790_000_000_123,nonce);
  const timestamp='2026-09-21T14:13:20.123000Z';
  const argsHash=createHash('sha256').update(expected).digest();
  const message=Buffer.concat([lp('qr-worker-assert-v1'),lp('qa'),
    lp(contactPlan.rpc),uuid(requestId),lp('assert-v1'),lp(timestamp),uuid(nonce),argsHash]);
  assert.equal(Buffer.from(signed.args.p_worker_assertion).toString('hex'),
    createHmac('sha256',assertionKey).update(message).digest('hex'));
  assert.equal(Object.hasOwn(signed.args,'p_contacto_id'),false);
});
