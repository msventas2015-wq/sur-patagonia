import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {preparePageviewPlan} from '../../worker/qr/pageview-plan.mjs';
import {pageviewArgumentsBytes,signPageviewCall} from '../../worker/qr/pageview-assertion.mjs';

const key=new Uint8Array(32).fill(61);
const context={currentKid:'assert-test',keys:new Map([['assert-test',key]])};
const payload={version:1,request_id:'50000000-0000-4000-8000-000000000001',
  landing_id:'50000000-0000-4000-8000-000000000003',path:'/',
  propiedad_id:null,proyecto_slug:null};
const plan=await preparePageviewPlan({payload,cookieHeader:null,
  normalizedEdgeIp:'203.0.113.7'},
  {environment:'qa',cookiePrefix:'sp_attr_qa_',rateKey:new Uint8Array(32).fill(17),
    payloadKey:new Uint8Array(32).fill(29)});
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const lp=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b]);};
const uuid=s=>Buffer.from(s.replaceAll('-',''),'hex');
const i64=n=>{const b=Buffer.alloc(8);b.writeBigInt64BE(BigInt(n));return b;};

test('pageview assertion matches independent signed argument envelope',async()=>{
  const nonce='50000000-0000-4000-8000-000000000004';
  const signed=await signPageviewCall(plan,context,1758460000000,nonce);
  assert.equal(signed.rpc,'qr_pageview_registrar_interno_v1');
  assert.deepEqual(Object.keys(signed.args).slice(-4),[
    'p_assertion_kid','p_assertion_ts','p_assertion_nonce','p_worker_assertion']);
  const expectedArgs=Buffer.concat([
    lp('qr-pageview-args-v1'),lp('qa'),uuid(payload.request_id),
    Buffer.from(plan.args.p_payload_hash),lp('v1'),Buffer.from([1]),
    uuid(payload.landing_id),lp('/'),Buffer.from([0]),Buffer.from([0]),
    Buffer.from(plan.args.p_network_hash),lp('skipped_landing'),
    i64(0),i64(0),u32(0),
  ]);
  assert.deepEqual(Buffer.from(pageviewArgumentsBytes(plan)),expectedArgs);
  const argHash=createHash('sha256').update(pageviewArgumentsBytes(plan)).digest();
  const independent=Buffer.concat([lp('qr-worker-assert-v1'),lp('qa'),
    lp('qr_pageview_registrar_interno_v1'),uuid(payload.request_id),lp('assert-test'),
    lp(signed.args.p_assertion_ts),uuid(nonce),argHash]);
  const expected=createHmac('sha256',key).update(independent).digest('hex');
  assert.equal(Buffer.from(signed.args.p_worker_assertion).toString('hex'),expected);
});

test('landing, content and cookie state cannot share an assertion',async()=>{
  const original=Buffer.from(pageviewArgumentsBytes(plan)).toString('hex');
  for(const mutation of [
    {p_path:'/proyectos'},{p_network_hash:new Uint8Array(32).fill(1)},
  ]) {
    const changed={...plan,args:{...plan.args,...mutation}};
    assert.notEqual(Buffer.from(pageviewArgumentsBytes(changed)).toString('hex'),original);
  }
  for(const mutation of [{p_landing_id:null},{p_cookie_scan_state:'within_limit'},
    {p_cookie_family_count:1}]) {
    assert.throws(()=>pageviewArgumentsBytes({...plan,args:{...plan.args,...mutation}}));
  }
  await assert.rejects(signPageviewCall(plan,{currentKid:'wrong',keys:context.keys}));
  assert.throws(()=>pageviewArgumentsBytes({...plan,args:{...plan.args,p_canal_ref:'forged'}}));
});
