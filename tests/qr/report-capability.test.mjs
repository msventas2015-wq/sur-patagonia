import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {deriveReportCapability,reportFingerprint} from '../../worker/qr/report-capability.mjs';
const key=Uint8Array.from({length:32},(_,i)=>i);
const args={environment:'qa',campaignId:'00000000-0000-4000-8000-000000000002',requestId:'00000000-0000-4000-8000-000000000001',action:'emitir',kid:'original',keys:new Map([['original',key]])};
const lp=s=>{const b=Buffer.from(s);const size=Buffer.alloc(4);size.writeUInt32BE(b.length);return Buffer.concat([size,b]);};
const uuid=s=>Buffer.from(s.replaceAll('-',''),'hex');
test('capability matches independent binary HMAC and SHA over 32 decoded bytes',async()=>{
  const body=Buffer.concat([lp('qr-report-capability-v1'),lp('qa'),uuid(args.campaignId),uuid(args.requestId),lp('emitir')]);
  const expected=createHmac('sha256',key).update(body).digest();
  const result=await deriveReportCapability(args);
  assert.equal(result.token,expected.toString('base64url'));
  assert.equal(result.token.length,43);
  assert.deepEqual(Buffer.from(result.tokenHash),createHash('sha256').update(expected).digest());
  assert.notDeepEqual(Buffer.from(result.tokenHash),createHash('sha256').update(result.token).digest());
  const read=await reportFingerprint(result.token,{environment:'qa'});
  assert.equal(read.tokenSyntaxValid,true);assert.deepEqual(read.tokenFingerprint,result.tokenHash);
});
test('replay picks only original nominal key; missing key fails closed, never substitutes',async()=>{
  const original=await deriveReportCapability(args);
  const keys=new Map([...args.keys,...Array.from({length:80},(_,i)=>[`rotation${i}`,new Uint8Array(32).fill(i)])]);
  assert.deepEqual(await deriveReportCapability({...args,keys}),original);
  await assert.rejects(deriveReportCapability({...args,keys:new Map([['other',key]])}),/missing_capability_key/);
  for(const changed of [{environment:'other'},{action:'rotar'},{campaignId:args.requestId},{requestId:args.campaignId}]) {
    assert.notEqual((await deriveReportCapability({...args,...changed})).token,original.token);
  }
});
test('invalid syntaxes use domain-separated decoy with false flag, never hash base64 text as a credential',async()=>{
  const good=(await deriveReportCapability(args)).token;
  for(const token of ['',args.campaignId,good+'=',good+'.x','A'.repeat(42)+'B','é','x'.repeat(512)]) {
    const result=await reportFingerprint(token,{environment:'qa',rateKey:key});
    const decoy=createHmac('sha256',key).update(Buffer.concat([lp('qr-report-invalid-fingerprint-v1'),lp('qa'),lp(token)])).digest();
    assert.equal(result.tokenSyntaxValid,false);assert.deepEqual(Buffer.from(result.tokenFingerprint),decoy);
  }
  const a=await reportFingerprint('bad',{environment:'qa',rateKey:key});
  const b=await reportFingerprint('bad',{environment:'other',rateKey:key});
  assert.notDeepEqual(a.tokenFingerprint,b.tokenFingerprint);
});
test('closed context rejects revocation derivation, malformed IDs/keys/envelopes',async()=>{
  for(const changed of [{action:'revocar'},{action:'arbitrary'},{kid:'bad.key'},{requestId:'x'},{campaignId:'x'},{environment:''},{keys:new Map([['original',new Uint8Array(31)]])}]) {
    await assert.rejects(deriveReportCapability({...args,...changed}));
  }
  for(const token of [null,{},'x'.repeat(513),'é'.repeat(257),'\ud800']) await assert.rejects(reportFingerprint(token,{environment:'qa',rateKey:key}));
  await assert.rejects(reportFingerprint('invalid',{environment:'qa'}),/missing_capability_key/);
});
