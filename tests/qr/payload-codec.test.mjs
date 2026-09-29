import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {encodePayloadField, encodePayloadEnvelope, hashPayload} from '../../worker/qr/payload-codec.mjs';
import {parseContactPayload} from '../../worker/qr/contact-payload.mjs';

const id = '00112233-4455-4677-8899-aabbccddeeff';
const key = Uint8Array.from({length:32}, (_,i) => i);
const hex = b => Buffer.from(b).toString('hex');
// Independent Buffer-based reference, never imports the runtime codec.
const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const lp = s => { const b=Buffer.from(s,'utf8'); return Buffer.concat([u32(b.length),b]); };
const i64 = n => { const b=Buffer.alloc(8); b.writeBigInt64BE(n); return b; };
const uuid = s => Buffer.from(s.replaceAll('-',''),'hex');
const field = (name,type,value) => Buffer.concat([lp(name),Buffer.from([1]),lp(type),value]);

test('every present type and null reproduce the independent binary recipe', () => {
  const vectors=[
    ['text','á😀',lp('á😀')], ['uuid',id,uuid(id)],
    ['int64',-(1n<<63n),i64(-(1n<<63n))], ['ts_us',(1n<<63n)-1n,i64((1n<<63n)-1n)],
    ['bytes',Uint8Array.of(0,255),Buffer.from([0,0,0,2,0,255])],
    ['bool',true,Buffer.from([1])], ['bool',false,Buffer.from([0])],
    ['uuid[]',[id,id],Buffer.concat([u32(2),uuid(id),uuid(id)])]
  ];
  for(const [type,value,bytes] of vectors) assert.equal(hex(encodePayloadField('campo',type,value)),hex(field('campo',type,bytes)));
  for(const type of ['text','uuid','int64','ts_us','bytes','bool','uuid[]'])
    assert.equal(hex(encodePayloadField('campo',type,null)),hex(Buffer.concat([lp('campo'),Buffer.from([0])])));
});

test('envelope and HMAC include domain, environment once, operation and ordered named fields', async () => {
  const fields=[['request_id','uuid',id],['nombre','text','María'],['email','text',null],['version','int64',1n]];
  const expected=Buffer.concat([lp('qr-payload-v1'),lp('qa'),lp('contacto'),field('request_id','uuid',uuid(id)),field('nombre','text',lp('María')),lp('email'),Buffer.from([0]),field('version','int64',i64(1n))]);
  assert.equal(hex(encodePayloadEnvelope('qa','contacto',fields)),hex(expected));
  const got=await hashPayload({environment:'qa',operation:'contacto',fields,key});
  assert.equal(got.payload_key_id,'v1');
  assert.equal(hex(got.payload_hash),createHmac('sha256',key).update(expected).digest('hex'));
});

test('null, empty, types, names, boundaries, order, operation and environment cannot alias', async () => {
  const bodies=[
    [['x','text',null]], [['x','text','']], [['x','bytes',new Uint8Array()]],
    [['y','text','']], [['x','text','ab'],['y','text','c']], [['x','text','a'],['y','text','bc']],
    [['y','text','c'],['x','text','ab']], [['x','int64',0n]], [['x','ts_us',0n]], [['x','bool',false]],
    [['x','uuid[]',[]]]
  ].map(fields=>hex(encodePayloadEnvelope('qa','contacto',fields)));
  assert.equal(new Set(bodies).size,bodies.length);
  const fields=[['version','int64',1n]];
  const hashes=await Promise.all([['qa','contacto'],['prod','contacto'],['qa','pageview']].map(async([environment,operation])=>hex((await hashPayload({environment,operation,fields,key})).payload_hash)));
  assert.equal(new Set(hashes).size,3);
});

test('rejects implicit coercion, unsafe integer representation, missing fields and non-NFC', async () => {
  for(const [type,value] of [['text','e\u0301'],['text','\ud800'],['int64',1],['int64',1n<<63n],['ts_us',-(1n<<63n)-1n],['bool',1],['bytes',[1]],['uuid',id.toUpperCase()],['uuid[]',[id,null]],['text',undefined],['other',null]])
    assert.throws(()=>encodePayloadField('x',type,value));
  assert.throws(()=>encodePayloadEnvelope('qa','contacto',[['x','text','a'],['x','text','b']]));
  assert.throws(()=>encodePayloadEnvelope('qa','contacto',[['x','text']]));
  await assert.rejects(hashPayload({environment:'qa',operation:'contacto',fields:[],key:new Uint8Array(31)}));
});

test('contact normalization removes transport formatting without erasing semantic changes', async () => {
  const p={version:1,request_id:id,nombre:'  Mari\u0301a  López ',email:'Persona@EJEMPLO.COM',telefono:null,mensaje:' Hola\r\nmundo ',propiedad_id:null,proyecto_slug:null,fuente:'home_form'};
  const normalized=parseContactPayload(Buffer.from(JSON.stringify(p)));
  const reordered=parseContactPayload(Buffer.from(JSON.stringify(Object.fromEntries(Object.entries({...p,nombre:'María López',email:'Persona@ejemplo.com',mensaje:'Hola\nmundo'}).reverse()),null,2)));
  // Test schema is explicit and closed; production endpoint will own its schema.
  const fields = value => [['request_id','uuid',value.request_id],...['nombre','email','telefono','mensaje','propiedad_id','proyecto_slug','fuente'].map(n=>[n,n==='propiedad_id'?'uuid':'text',value[n]]),['version','int64',BigInt(value.version)]];
  const digest = async value => hex((await hashPayload({environment:'qa',operation:'contacto',fields:fields(value),key})).payload_hash);
  assert.equal(await digest(normalized),await digest(reordered));
  assert.notEqual(await digest(normalized),await digest({...normalized,mensaje:'Otro mensaje'}));
});
