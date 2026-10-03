import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../../scripts/staging/guard-default-deploy.mjs',import.meta.url));
test('default deployment rejects staging and detached CI branches before uploading production resources',()=>{
  for (const branch of ['codex/clon-staging','feature/test','HEAD']) {
    const result=spawnSync(process.execPath,[script],{env:{...process.env,WORKERS_CI_BRANCH:branch},encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/production deploy\/preview blocked/);
  }
  assert.equal(spawnSync(process.execPath,[script],{env:{...process.env,WORKERS_CI_BRANCH:'main'}}).status,0);
});
