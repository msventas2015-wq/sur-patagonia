import test from 'node:test';
import assert from 'node:assert/strict';
import {parseContactPayload,contactContentMatrix} from '../../worker/qr/contact-payload.mjs';
const base={version:1,request_id:'00000000-0000-4000-8000-000000000001',nombre:'QA Test',email:'QA@example.invalid',telefono:null,mensaje:'Consulta de prueba',propiedad_id:null,proyecto_slug:null,fuente:'home_form'};
const raw=x=>new TextEncoder().encode(typeof x==='string'?x:JSON.stringify(x));
const parse=changes=>parseContactPayload(raw({...base,...changes}));
test('NFC/LF and whitespace normalization preserves email local part and returns no attribution fields',()=>{
  const p=parse({nombre:'  Jose\u0301\t  QA\n Test  ',mensaje:'  Texto\r\nsegunda\rlínea  ',email:' QA@EXAMPLE.INVALID ',telefono:' +５４ (٢٩٤) ۴۱۲-۳۴۵۶ '});
  assert.equal(p.nombre,'José QA Test');assert.equal(p.mensaje,'Texto\nsegunda\nlínea');
  assert.equal(p.email,'QA@example.invalid');assert.equal(p.telefono,'+542944123456');
  assert.equal(Object.isFrozen(p),true);assert.equal(Object.hasOwn(p,'canal_ref'),false);
  assert.deepEqual(parse({nombre:'José QA Test',mensaje:p.mensaje,email:p.email,telefono:p.telefono}),p);
});
test('one contact method is mandatory and optional omissions normalize to null',()=>{
  const {email,telefono,...without}=base;
  assert.equal(parseContactPayload(raw({...without,telefono:'1234567'})).email,null);
  assert.equal(parseContactPayload(raw({...without,email:'QA@example.invalid'})).telefono,null);
  for(const fields of [{email:null,telefono:null},{email:' ',telefono:''},{email:15},{telefono:1234567}]) assert.throws(()=>parse(fields));
});
test('text codepoint and byte boundaries are enforced after normalization',()=>{
  assert.equal(Array.from(parse({nombre:'😀'.repeat(120),mensaje:'😀'.repeat(2000)}).nombre).length,120);
  for(const fields of [{nombre:'a'.repeat(121)},{nombre:''},{mensaje:'a'.repeat(2001)},{mensaje:' '},{mensaje:'x\0y'},{nombre:'x\u0085y'},{mensaje:'\ud800'}]) assert.throws(()=>parse(fields));
});
test('email limits and closed phone shape reject coercion and unsupported syntax',()=>{
  for(const email of ['a@@b','@b','a@','a@b','a@.b','a@b.','a@b..c','a b@c.d','a@b c.d','a'.repeat(65)+'@b.c','a@'+'b'.repeat(253)]) assert.throws(()=>parse({email}));
  assert.equal(parse({email:'a@b.c'}).email,'a@b.c');
  assert.equal(parse({email:'A'.repeat(64)+'@'+'b'.repeat(187)+'.c'}).email.length,254);
  for(const telefono of ['123456','1'.repeat(16),'12+34567','++1234567','12.34567','abcdefg','²3456789']) assert.throws(()=>parse({telefono}));
  for(const telefono of ['१२३४५६७','১২৩৪৫৬৭','𝟏𝟐𝟑𝟒𝟓𝟔𝟕']) assert.equal(parse({telefono}).telefono,'1234567');
});
test('client cannot submit identity, channel, via, campaign, origin, timestamps or server hashes',()=>{
  for(const key of ['canal_ref','canal_via','campana_id','referencia_id','canal_id','destino','persona_id','origen','created_at','network_hash','payload_hash','handoff']) assert.throws(()=>parse({[key]:'forged'}));
  for(const fields of [{version:'1'},{request_id:'x'},{fuente:'other'},{propiedad_id:'x'},{proyecto_slug:'../admin'}]) assert.throws(()=>parse(fields));
  assert.throws(()=>parseContactPayload(raw(JSON.stringify(base).replace('"version":1','"version":1,"version":1'))));
  assert.throws(()=>parseContactPayload(raw(JSON.stringify(base).replace('"version":1','"version":1e0'))));
  assert.throws(()=>parseContactPayload(new Uint8Array(16385)));
});
test('all nine content-source combinations are classified after syntax, not silently dropped',()=>{
  const property='00000000-0000-4000-8000-000000000002';
  for(const fuente of ['home_form','home_chatbot','propiedades_form','proyectos_form','servicios_form','burbuja_global','propiedad_form','propiedad_whatsapp','proyecto_mini_form']) {
    for(const propiedad_id of [null,property]) for(const proyecto_slug of [null,'qa-fixture']) {
      const p=parse({fuente,propiedad_id,proyecto_slug});
      const expected=fuente.startsWith('propiedad_')?propiedad_id!==null&&proyecto_slug===null:fuente==='proyecto_mini_form'?propiedad_id===null&&proyecto_slug!==null:propiedad_id===null&&proyecto_slug===null;
      assert.equal(contactContentMatrix(p),expected,JSON.stringify({fuente,propiedad_id,proyecto_slug}));
      assert.equal(p.propiedad_id,propiedad_id);assert.equal(p.proyecto_slug,proyecto_slug);
    }
  }
});
