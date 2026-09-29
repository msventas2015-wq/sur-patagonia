import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { lp, uint32, int64, uuidBytes, unbase64url, base64url } from '../../worker/qr/codec.mjs';
import { strictJson } from '../../worker/qr/strict-json.mjs';
import { issueClaim, openClaim, handleInit } from '../../worker/qr/init.mjs';

// Public deterministic TEST key, never a runtime credential.
const testKey = Uint8Array.from({length:32}, (_,i) => i);
const context = {environment:'qa',host:'localhost:8787',origin:'http://localhost:8787',currentKid:'test',keys:new Map([['test',testKey]])};
const payload = {version:1,codigo:'fixture-qr',via:'qr'};
const bytes = text => new TextEncoder().encode(text);
const request = (body, headers={}, method='POST') => new Request(context.origin+'/api/qr/init', {method,headers:{host:context.host,origin:context.origin,'content-type':'application/json',...headers},...(['GET','HEAD'].includes(method)?{}:{body})});

test('binary codec has fixed lengths, byte order and strict bounds', () => {
  assert.equal(Buffer.from(lp('ñ')).toString('hex'),'00000002c3b1');
  assert.equal(Buffer.from(uint32(0xffffffff)).toString('hex'),'ffffffff');
  assert.equal(Buffer.from(int64(-1n)).toString('hex'),'ffffffffffffffff');
  assert.equal(uuidBytes('00112233-4455-6677-8899-aabbccddeeff').length,16);
  for (const n of [-1, -0, 0x100000000, 1.5, NaN]) assert.throws(()=>uint32(n));
  assert.throws(()=>int64(1)); assert.throws(()=>int64(1n<<63n));
  assert.throws(()=>lp('\ud800')); assert.throws(()=>unbase64url('AA=='));
  assert.throws(()=>unbase64url('AB')); // nonzero unused bits
});
test('strict JSON rejects hostile original bytes, not just parsed objects', () => {
  for (const raw of ['{"version":1,"version":1}','{"a":1,"\\u0061":2}','{"a":{"x":1,"x":2}}','{"a":-0}','{"a":1e0}','{"a":1.0}','{"a":01}','{"a":9007199254740992}','{"a":"\\ud800"}','{"a":"\\q"}','{"a":1,}','[]','null','\ufeff{}','{}x']) assert.throws(()=>strictJson(bytes(raw),512),raw);
  assert.throws(()=>strictJson(Uint8Array.of(123,34,120,34,58,34,255,34,125),512));
  assert.equal(strictJson(bytes('{"emoji":"🌄","empty":null}'),512).emoji,'🌄');
  assert.equal(Object.getPrototypeOf(strictJson(bytes('{"__proto__":{}}'),512)),null);
});
test('claim round trip and independent Node/OpenSSL decoding', async () => {
  const result = await issueClaim(payload,context,1000);
  const opened = await openClaim(result.init,context,1001);
  assert.equal(opened.codigo,payload.codigo); assert.equal(opened.via,'qr'); assert.equal(opened.expires_at,1120);
  assert.match(opened.request_id,/^[a-f0-9-]{14}4/);
  const sealed = Buffer.from(result.init.split('.')[2],'base64url');
  const independentLP = s => { const b=Buffer.from(s); const len=Buffer.alloc(4);len.writeUInt32BE(b.length);return Buffer.concat([len,b]); };
  const decipher = createDecipheriv('aes-256-gcm',testKey,sealed.subarray(0,12));
  decipher.setAAD(Buffer.concat(['qr-init-v1','1','test','qa','localhost:8787'].map(independentLP)));
  decipher.setAuthTag(sealed.subarray(-16));
  const plain=Buffer.concat([decipher.update(sealed.subarray(12,-16)),decipher.final()]);
  const expires=Buffer.alloc(8);expires.writeBigInt64BE(1120n);
  assert.deepEqual(plain,Buffer.concat([independentLP('fixture-qr'),independentLP('qr'),Buffer.from(opened.request_id.replaceAll('-',''),'hex'),expires]));
  assert.equal(result.init.includes('fixture-qr'),false);
});
test('tampering, wrong host/environment, padding and exact expiry fail', async () => {
  const {init}=await issueClaim(payload,context,1000);
  await assert.rejects(openClaim(init,context,1120));
  await assert.rejects(openClaim(init,context,999));
  await assert.rejects(openClaim(init,{...context,environment:'other'},1001));
  await assert.rejects(openClaim(init,{...context,host:'localhost:8788',origin:'http://localhost:8788'},1001));
  await assert.rejects(openClaim(init+'=',context,1001));
  for(const offset of [0,12,-1]) {
    const sealed=unbase64url(init.split('.')[2]);const position=offset<0?sealed.length+offset:offset;sealed[position]^=1;
    await assert.rejects(openClaim('v1.test.'+base64url(sealed),context,1001));
  }
});
test('rotation accepts original key by kid, never guesses another key', async () => {
  const old=await issueClaim(payload,context,1000);
  const rotated={...context,currentKid:'new',keys:new Map([...context.keys,['new',new Uint8Array(32).fill(42)]])};
  assert.equal((await openClaim(old.init,rotated,1001)).codigo,'fixture-qr');
  await assert.rejects(openClaim(old.init,{...rotated,keys:new Map([['new',testKey]])},1001));
  const fresh=await issueClaim(payload,rotated,1001); assert.match(fresh.init,/^v1\.new\./);
});
test('HTTP order, schema, size and privacy headers', async () => {
  assert.equal((await handleInit(request(null,{origin:'https://evil.invalid'},'GET'),context)).status,405);
  assert.equal((await handleInit(request('{}',{origin:'https://evil.invalid','content-type':'text/plain'}),context)).status,400);
  assert.equal((await handleInit(request('{}',{'content-type':'text/plain'}),context)).status,415);
  assert.equal((await handleInit(request(' '.repeat(513)),context)).status,413);
  for (const p of [{...payload,version:'1'},{...payload,via:'QR'},{...payload,codigo:'UPPER'},{...payload,request_id:crypto.randomUUID()}]) assert.equal((await handleInit(request(JSON.stringify(p)),context)).status,400);
  const result=await handleInit(request(JSON.stringify(payload)),context);
  assert.equal(result.status,200); assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.headers.get('referrer-policy'),'no-referrer'); assert.equal(result.headers.get('set-cookie'),null);
  assert.deepEqual(Object.keys(await result.json()).sort(),['expires_at','init','ok']);
});
test('separate init requests mint distinct server identities; same claim keeps one', async () => {
  const a=await issueClaim(payload,context,1000),b=await issueClaim(payload,context,1000);
  assert.notEqual((await openClaim(a.init,context,1001)).request_id,(await openClaim(b.init,context,1001)).request_id);
  assert.deepEqual(await openClaim(a.init,context,1001),await openClaim(a.init,context,1002));
});
test('historical public code grammar is preserved without weakening new-code E2 writers',async()=>{
  for(const codigo of ['ab','-ab','ab-','--','a'.repeat(80)]) {
    const claim=await issueClaim({...payload,codigo},context,1000);
    assert.equal((await openClaim(claim.init,context,1001)).codigo,codigo);
  }
  for(const codigo of ['a','a'.repeat(81),'ab/c','ab?','AB','%61b']) await assert.rejects(issueClaim({...payload,codigo},context,1000));
});
test('host/query/charset and actual streaming size are checked before issuing claim',async()=>{
  const body=JSON.stringify(payload);
  assert.equal((await handleInit(request(body,{host:'different.invalid'}),context)).status,400);
  const noHost=request(body);noHost.headers.delete('host');assert.equal((await handleInit(noHost,context)).status,400);
  const withQuery=new Request(context.origin+'/api/qr/init?x=1',request(body));
  assert.equal((await handleInit(withQuery,context)).status,400);
  assert.equal((await handleInit(request(body,{'content-type':'application/json; charset=iso-8859-1'}),context)).status,415);
  assert.equal((await handleInit(request(body,{'content-type':'application/json; charset=utf-8'}),context)).status,200);
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(300).fill(32));c.enqueue(new Uint8Array(213).fill(32));c.close();}});
  const streaming=new Request(context.origin+'/api/qr/init',{method:'POST',headers:{host:context.host,origin:context.origin,'content-type':'application/json'},body:stream,duplex:'half'});
  assert.equal(streaming.headers.get('content-length'),null);
  assert.equal((await handleInit(streaming,context)).status,413);
});
test('fixed independent OpenSSL AES-GCM vector decodes exact fields',async()=>{
  // key 00..1f, IV 000102030405060708090a0b; generated outside issueClaim.
  const fixture='v1.test.AAECAwQFBgcICQoLRwLWEaOMum_4M_KmwJt4bYPU9kbwan1PfDKj8pXwqgnNzUADr8ESmHSke417YaN3TMrxP-ccAX1Sp3XB';
  assert.deepEqual(await openClaim(fixture,context,1000),{codigo:'fixture-qr',via:'qr',request_id:'00112233-4455-4677-8899-aabbccddeeff',expires_at:1120});
});
