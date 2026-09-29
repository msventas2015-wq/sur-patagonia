import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {deriveHandoff} from '../../worker/qr/handoff.mjs';
import {encodePayloadEnvelope} from '../../worker/qr/payload-codec.mjs';
import {preparePageviewPlan} from '../../worker/qr/pageview-plan.mjs';

const rateKey=new Uint8Array(32).fill(17);
const payloadKey=new Uint8Array(32).fill(29);
const context={environment:'qa',rateKey,payloadKey,cookiePrefix:'sp_attr_qa_'};
const payload={version:1,request_id:'50000000-0000-4000-8000-000000000001',
  landing_id:null,path:'/propiedad',propiedad_id:'50000000-0000-4000-8000-000000000002',
  proyecto_slug:null};

test('real pageview plan passes candidates, not claimed channel, with canonical payload hash',async()=>{
  const handoff=await deriveHandoff({environment:'qa',
    requestId:'00000000-0000-4000-8000-000000000001',kid:'test',
    keys:new Map([['test',new Uint8Array(32).fill(41)]])});
  const plan=await preparePageviewPlan({payload,
    cookieHeader:`sp_attr_qa_${handoff.slot}=${handoff.value}`,
    normalizedEdgeIp:'203.0.113.7'},context);
  assert.equal(plan.rpc,'qr_pageview_registrar_interno_v1');
  assert.deepEqual(plan.args.p_cookie_candidates,[{
    slot:handoff.slot,hash:handoff.handoffHash,kid:'test'}]);
  assert.equal(plan.args.p_cookie_scan_state,'within_limit');
  for(const forbidden of ['p_canal_ref','p_canal_via','p_campana_id','p_ingreso_id'])
    assert.equal(Object.hasOwn(plan.args,forbidden),false);
  assert.equal(JSON.stringify(plan).includes('203.0.113.7'),false);
  assert.equal(JSON.stringify(plan).includes(handoff.value),false);
  const expected=createHmac('sha256',payloadKey).update(encodePayloadEnvelope('qa','pageview',[
    ['request_id','uuid',payload.request_id],['landing_id','uuid',null],
    ['path','text','/propiedad'],['propiedad_id','uuid',payload.propiedad_id],
    ['proyecto_slug','text',null],['version','int64',1n]])).digest('hex');
  assert.equal(Buffer.from(plan.args.p_payload_hash).toString('hex'),expected);
});

test('landing ACK skips the raw cookie family, even when malformed or overflowing',async()=>{
  const ack={...payload,landing_id:'50000000-0000-4000-8000-000000000003'};
  const plan=await preparePageviewPlan({payload:ack,cookieHeader:42,
    normalizedEdgeIp:'203.0.113.7'},context);
  assert.equal(plan.args.p_cookie_scan_state,'skipped_landing');
  assert.equal(plan.args.p_cookie_family_count,0);
  assert.equal(plan.args.p_cookie_family_bytes,0);
  assert.deepEqual(plan.args.p_cookie_candidates,[]);
  assert.deepEqual(plan.familySlots,[]);
});

test('overflow never sends a partial candidate list and closed schema rejects extra attribution',async()=>{
  const header=Array.from({length:33},(_,i)=>`sp_attr_qa_bad${i}=x`).join('; ');
  const plan=await preparePageviewPlan({payload,cookieHeader:header,
    normalizedEdgeIp:'203.0.113.7'},context);
  assert.equal(plan.args.p_cookie_scan_state,'overflow');
  assert.equal(plan.args.p_cookie_family_count,33);
  assert.deepEqual(plan.args.p_cookie_candidates,[]);
  await assert.rejects(preparePageviewPlan({payload:{...payload,canal_ref:'forged'},
    normalizedEdgeIp:'203.0.113.7'},context));
  await assert.rejects(preparePageviewPlan({payload:{...payload,landing_id:null,
    propiedad_id:null},normalizedEdgeIp:'203.0.113.7'},context));
});
