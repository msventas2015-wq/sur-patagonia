#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SQL=resolve(ROOT,'worker/qr/sql');
const project='rsjwqmpseknvydistgfr';
const dsn=process.env.QR_QA_DATABASE_URL;
const kid=process.env.QR_QA_ASSERTION_KID;
const secret=process.env.QR_QA_ASSERTION_SECRET;
const psql=process.env.QR_PSQL||'/Applications/Postgres.app/Contents/Versions/latest/bin/psql';
if(!dsn||!kid||!secret) throw new Error('missing_QA_runtime_environment');
if(!/^[A-Za-z0-9_-]{1,32}$/.test(kid)||!/^[0-9a-f]{64}$/.test(secret)) throw new Error('invalid_assertion_secret');
if(!existsSync(psql)) throw new Error('psql_not_found');
const parsed=new URL(dsn);
for(const key of ['host','hostaddr','service']){
  if(parsed.searchParams.has(key)) throw new Error(`refusing_libpq_${key}_override`);
}
const allowedHosts=new Set([
  `db.${project}.supabase.co`,
  'aws-0-sa-east-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-east-2.pooler.supabase.com'
]);
if(!['postgres:','postgresql:'].includes(parsed.protocol)||!allowedHosts.has(parsed.hostname))
  throw new Error('refusing_non_QA_database_host');
if(parsed.hostname.includes('pooler')&&!decodeURIComponent(parsed.username).endsWith(`.${project}`))
  throw new Error('refusing_pooler_without_QA_project_user');
if(process.env.QR_QA_REAPPLY_APPROVED!=='YES') throw new Error('reapply_requires_explicit_approval_flag');

function runFile(file,vars={}){
  const args=['-X','-w',dsn,'-v','ON_ERROR_STOP=1'];
  for(const [key,value] of Object.entries(vars)) args.push('-v',`${key}=${value}`);
  args.push('-f',resolve(SQL,file));
  const result=spawnSync(psql,args,{cwd:SQL,stdio:'inherit',env:{...process.env,PGAPPNAME:'qr-blindaje-v19-qa'}});
  if(result.status!==0) throw new Error(`psql_failed:${file}:${result.status}`);
}
function runStdin(sql){
  // El SQL de inicialización incluye un secreto: no imprimir contexto SQL en errores.
  const result=spawnSync(psql,['-X','-w',dsn,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-v','SHOW_CONTEXT=never'],{
    input:sql,cwd:SQL,stdio:['pipe','inherit','inherit'],env:{...process.env,PGAPPNAME:'qr-blindaje-v19-qa-secret'}
  });
  if(result.status!==0) throw new Error(`psql_stdin_failed:${result.status}`);
}
const sqlLiteral=value=>`'${value.replaceAll("'","''")}'`;
runStdin(`do $qr_secret$ begin
  if exists(select 1 from vault.decrypted_secrets where name=${sqlLiteral(`qr_worker_assertion_v1/qa/${kid}`)}) then
    if not exists(select 1 from vault.decrypted_secrets where name=${sqlLiteral(`qr_worker_assertion_v1/qa/${kid}`)} and decrypted_secret=${sqlLiteral(secret)}) then
      raise exception 'QR_QA_ASSERTION_SECRET_CONFLICT';
    end if;
  else
    perform vault.create_secret(${sqlLiteral(secret)},${sqlLiteral(`qr_worker_assertion_v1/qa/${kid}`)},'Blindaje QR QA v1.9');
  end if;
end $qr_secret$;\n`);

const common=cycle=>({qr_project_ref:project,qr_environment:'qa',qr_cycle_id:cycle,
  qr_assertion_kid:kid});
const first=randomUUID();
let forwardCompleted=false;
try{
  runFile('package-forward.sql',common(first));
  forwardCompleted=true;
  runFile('package-qa-tests.sql',common(first));
  runFile('package-rollback.sql',{qr_cycle_id:first});
  forwardCompleted=false;
  const second=randomUUID();
  runFile('package-forward.sql',common(second));
  console.log(JSON.stringify({ok:true,environment:'qa',first_cycle:first,rollback:true,
    reapplied_cycle:second,production_touched:false}));
}catch(error){
  if(forwardCompleted){
    try{runFile('package-rollback.sql',{qr_cycle_id:first});}
    catch(rollbackError){console.error('ROLLBACK_FAILED',rollbackError.message);}
  }
  throw error;
}
