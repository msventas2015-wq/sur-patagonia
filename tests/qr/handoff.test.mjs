import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {deriveHandoff,scanFamily} from '../../worker/qr/handoff.mjs';
const key=Uint8Array.from({length:32},(_,i)=>i);
const requestId='00000000-0000-4000-8000-000000000001';
const context={environment:'qa',requestId,kid:'original',keys:new Map([['original',key]])};
const prefix='sp_attr_qa_';
const pair=h=>`${prefix}${h.slot}=${h.value}`;
test('handoff matches independent binary HMAC and hashes raw 32 bytes, not cookie text',async()=>{
  const h=await deriveHandoff(context);
  const field=s=>{const b=Buffer.from(s);const n=Buffer.alloc(4);n.writeUInt32BE(b.length);return Buffer.concat([n,b]);};
  const body=Buffer.concat([field('qr-handoff-v1'),field('qa'),Buffer.from(requestId.replaceAll('-',''),'hex')]);
  const token=createHmac('sha256',key).update(body).digest();
  assert.equal(h.value,`v1.original.${token.toString('base64url')}`);
  assert.equal(h.handoffHash,createHash('sha256').update(token).digest('hex'));
  assert.notEqual(h.handoffHash,createHash('sha256').update(h.value).digest('hex'));
  const parsed=await scanFamily(pair(h),{prefix});
  assert.deepEqual(parsed.candidates,[{requestId,kid:h.kid,handoffHash:h.handoffHash}]);
  assert.deepEqual(parsed.familySlots,[h.slot]);
  assert.equal(parsed.bytes,Buffer.byteLength(pair(h)));
});
test('replay retains original nominal key and fails rather than substitute missing key',async()=>{
  const h=await deriveHandoff(context);
  assert.deepEqual(await deriveHandoff({...context,keys:new Map([...context.keys,['new',new Uint8Array(32)]])}),h);
  await assert.rejects(deriveHandoff({...context,keys:new Map([['new',key]])}),/missing_handoff_key/);
  assert.notEqual((await deriveHandoff({...context,environment:'different'})).value,h.value);
});
test('duplicates invalidate entire slot even if identical; foreign family excluded',async()=>{
  const a=await deriveHandoff(context),b=await deriveHandoff({...context,requestId:'00000000-0000-4000-8000-000000000002'});
  for(const duplicate of [pair(a),`${prefix}${a.slot}=bad`,`${prefix}${a.slot}`]) {
    const parsed=await scanFamily(`${pair(a)}; ${duplicate}; ${pair(b)}; __Host-sp_attr_ignored=x; other=y`,{prefix});
    assert.equal(parsed.count,3);assert.deepEqual(parsed.candidates.map(x=>x.requestId),['00000000-0000-4000-8000-000000000002']);
  }
});
test('32/33 segments and 16384/16385 bytes obey closed overflow with no partial candidates',async()=>{
  const h=await deriveHandoff(context);
  const segments=[pair(h),...Array.from({length:31},(_,i)=>`${prefix}bad${i}`)];
  assert.equal((await scanFamily(segments.join('; '),{prefix})).candidates.length,1);
  const overflow=await scanFamily([...segments,`${prefix}extra`].join('; '),{prefix});
  assert.equal(overflow.state,'overflow');assert.equal(overflow.count,33);assert.deepEqual(overflow.candidates,[]);
  assert.deepEqual(overflow.familySlots,[h.slot]);
  for(const length of [16384,16385]) {
    const value=prefix+'x'.repeat(length-prefix.length);
    const parsed=await scanFamily(value,{prefix});assert.equal(parsed.bytes,length);
    assert.equal(parsed.state,length===16384?'within_limit':'overflow');
  }
});
test('byte measurement trims ASCII SP/HTAB only and counts malformed segments',async()=>{
  const s=`${prefix}bad=é`;
  const parsed=await scanFamily(` \t${s}\t ;\t${prefix}missing\t;\u00a0${prefix}foreign=x`,{prefix});
  assert.equal(parsed.count,2);assert.equal(parsed.bytes,Buffer.byteLength(s)+2+Buffer.byteLength(prefix+'missing'));
  assert.deepEqual(parsed.candidates,[]);
});
test('noncanonical token encodings and malformed slot/version/kid never become candidates',async()=>{
  const h=await deriveHandoff(context);
  for(const value of [h.value+'=',h.value+'.x',h.value.replace('v1.','v2.'),h.value.replace('.original.','..'),h.value.slice(0,-1)]) {
    assert.deepEqual((await scanFamily(`${prefix}${h.slot}=${value}`,{prefix})).candidates,[]);
  }
  assert.deepEqual((await scanFamily(`${prefix}${h.slot.toUpperCase()}X=${h.value}`,{prefix})).candidates,[]);
});
test('landing ACK does not inspect even a hostile header; no token validation is implied',async()=>{
  assert.deepEqual(await scanFamily({toString(){throw Error('must not read');}},{prefix,landingAck:true}),{state:'skipped_landing',count:0,bytes:0,candidates:[],familySlots:[]});
  await assert.rejects(scanFamily('',{prefix:'user-controlled'}));
  await assert.rejects(scanFamily(undefined,{prefix}),/invalid_cookie_header/);
});
test('normative UTF-8 measurement of Headers ByteString is explicitly not wire length',async()=>{
  const wire=Buffer.from(`${prefix}bad=é`,'utf8');
  const header=new Headers({cookie:wire.toString('latin1')}).get('cookie');
  assert.equal(header.length,wire.length);
  const measured=await scanFamily(header,{prefix});
  assert.equal(measured.bytes,Buffer.byteLength(header,'utf8'));
  assert.equal(measured.bytes,wire.length+2);
  assert.deepEqual(measured.candidates,[]);
});
