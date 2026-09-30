import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {deriveHandoff} from '../../worker/qr/handoff.mjs';
import {encodePayloadEnvelope} from '../../worker/qr/payload-codec.mjs';
import {deriveContactNetworkHash,prepareContactPlan} from '../../worker/qr/contact-plan.mjs';

const rateKey=new Uint8Array(32).fill(17);
const payloadKey=new Uint8Array(32).fill(29);
const handoffKey=new Uint8Array(32).fill(41);
const context={environment:'qa',rateKey,payloadKey,cookiePrefix:'sp_attr_qa_'};
const payload=Object.freeze({version:1,request_id:'50000000-0000-4000-8000-000000000001',
  nombre:'Persona QA',email:'Persona@example.invalid',telefono:null,mensaje:'Consulta',
  propiedad_id:null,proyecto_slug:null,fuente:'home_form'});
const hex=b=>Buffer.from(b).toString('hex');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const lp=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b]);};

test('contact network pseudonym matches independent HMAC and retains no IP',async()=>{
  const got=await deriveContactNetworkHash({environment:'qa',normalizedEdgeIp:'203.0.113.7',rateKey});
  const expected=createHmac('sha256',rateKey).update(Buffer.concat([
    lp('qr-rate-v1'),lp('qa'),lp('network'),lp('203.0.113.7')])).digest('hex');
  assert.equal(hex(got),expected);
  await assert.rejects(deriveContactNetworkHash({environment:'qa',normalizedEdgeIp:'forwarded header',rateKey}));
});

test('closed contact plan contains normalized business fields, proofs and no attribution input',async()=>{
  const old=await deriveHandoff({environment:'qa',requestId:'00000000-0000-4000-8000-000000000001',
    kid:'handoff-test',keys:new Map([['handoff-test',handoffKey]])});
  const plan=await prepareContactPlan({payload,
    cookieHeader:`sp_attr_qa_${old.slot}=${old.value}`,normalizedEdgeIp:'203.0.113.7'},context);
  assert.equal(plan.rpc,'qr_contacto_registrar_interno_v1');
  assert.deepEqual(Object.keys(plan.args),[
    'p_ambiente','p_request_id','p_payload_hash','p_payload_key_id','p_nombre','p_email',
    'p_telefono','p_mensaje','p_propiedad_id','p_proyecto_slug','p_fuente','p_network_hash',
    'p_cookie_scan_state','p_cookie_family_count','p_cookie_family_bytes','p_cookie_candidates']);
  for(const forbidden of ['p_canal_ref','p_canal_via','p_campana_id','p_persona_id','p_origen','p_handoff'])
    assert.equal(Object.hasOwn(plan.args,forbidden),false);
  assert.deepEqual(plan.args.p_cookie_candidates,[{slot:old.slot,hash:old.handoffHash,kid:old.kid}]);
  assert.equal(JSON.stringify(plan).includes('203.0.113.7'),false);
  assert.equal(JSON.stringify(plan).includes(old.value),false);

  const fields=[['request_id','uuid',payload.request_id],['nombre','text',payload.nombre],
    ['email','text',payload.email],['telefono','text',null],['mensaje','text',payload.mensaje],
    ['propiedad_id','uuid',null],['proyecto_slug','text',null],['fuente','text','home_form'],
    ['version','int64',1n]];
  const expected=createHmac('sha256',payloadKey)
    .update(encodePayloadEnvelope('qa','contacto',fields)).digest('hex');
  assert.equal(hex(plan.args.p_payload_hash),expected);
});

test('overflow sends no partial candidates and plan input is closed',async()=>{
  const header=Array.from({length:33},(_,i)=>`sp_attr_qa_bad${i}=x`).join('; ');
  const plan=await prepareContactPlan({payload,cookieHeader:header,normalizedEdgeIp:'192.0.2.1'},context);
  assert.equal(plan.args.p_cookie_scan_state,'overflow');
  assert.equal(plan.args.p_cookie_family_count,33);
  assert.deepEqual(plan.args.p_cookie_candidates,[]);
  await assert.rejects(prepareContactPlan({payload:{...payload,canal_ref:'forged'},normalizedEdgeIp:'192.0.2.1'},context));
  await assert.rejects(prepareContactPlan({payload,normalizedEdgeIp:'192.0.2.1'},{...context,rateKey:new Uint8Array(31)}));
});
