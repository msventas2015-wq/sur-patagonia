// Starts the real Worker against QA only. Credentials stay in process memory.
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {startQaServer,qaFetch,QA_ORIGIN} from './serve-qr-qa.mjs';
import {qaServiceHeaders} from '../worker/qr/qa-api-key.mjs';

const project='rsjwqmpseknvydistgfr';
const kid='qa-v19-20260928';
const dsn=`postgresql://postgres.${project}@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require`;
const psql='/Applications/Postgres.app/Contents/Versions/latest/bin/psql';
function read(sql){
  const result=spawnSync(psql,['-X','-w',dsn,'-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=terse','-v','SHOW_CONTEXT=never'],{
    input:`BEGIN READ ONLY;\n${sql}\nROLLBACK;\n`,encoding:'utf8',
    env:{...process.env,PGCONNECT_TIMEOUT:'12',PGAPPNAME:'qr-qa-http-preflight'}});
  if(result.status!==0)throw Error('QA_DB_READ_FAILED: revisar contraseña o conexión; no se modificó la base');
  return result.stdout.trim();
}
try{
  if(!process.env.PGPASSWORD)throw Error('QA_DB_PASSWORD_MISSING');
  const service=process.env.QR_QA_SERVICE_ROLE_KEY?.trim();
  qaServiceHeaders(service);
  if(service.startsWith('eyJ')){
    const payload=JSON.parse(Buffer.from(service.split('.')[1],'base64url').toString());
    if(payload.ref!==project||payload.role!=='service_role')throw Error('QA_SERVICE_KEY_WRONG_PROJECT_OR_ROLE');
  }
  const assertion=read(`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='qr_worker_assertion_v1/qa/${kid}';`);
  if(!/^[0-9a-f]{64}$/.test(assertion))throw Error('QA_ASSERTION_MISSING_OR_DUPLICATED');
  const baseline=JSON.parse(read(`SELECT json_build_object(
    'gate_active',(SELECT count(*)=1 FROM private.qr_runtime_gate_v1 WHERE ambiente='qa' AND version=1 AND accepting AND motivo='active'),
    'visitas',(SELECT count(*) FROM public.visitas),
    'contactos',(SELECT count(*) FROM public.contactos),
    'personas',(SELECT count(*) FROM public.personas),
    'crm_eventos',(SELECT count(*) FROM public.crm_eventos),
    'mensajes',(SELECT count(*) FROM public.mensajes),
    'ingresos',(SELECT count(*) FROM private.qr_ingresos_v1),
    'referencias',(SELECT count(*) FROM public.referencias));`));
  if(baseline.gate_active!==true||baseline.referencias!==117)throw Error('QA_BASELINE_GATE_FAILED');
  delete process.env.PGPASSWORD;delete process.env.QR_QA_SERVICE_ROLE_KEY;
  globalThis.fetch=qaFetch(globalThis.fetch);
  // Authenticate only against QA, without a write and without printing the key.
  const check=await fetch(`${QA_ORIGIN}/rest/v1/visitas?select=id&limit=0`,{headers:qaServiceHeaders(service),signal:AbortSignal.timeout(12000)});
  if(!check.ok)throw Error(`QA_SERVICE_KEY_REJECTED_HTTP_${check.status}`);
  const hex=()=>randomBytes(32).toString('hex');
  const run=randomUUID();
  const environment={QR_QA_HTTP_WRITES:'YES',QR_QA_RUN_ID:run,
    QR_QA_ALLOWED_CODES:'cafeteria-la-ballena,escribania-el-calefate-02,agencia-mendoza',
    SUPABASE_SERVICE_ROLE_KEY:service,QR_ASSERTION_CURRENT_KID:kid,
    QR_ASSERTION_KEYS:JSON.stringify({[kid]:assertion}),
    QR_INIT_CURRENT_KID:'qa-http-v19',QR_INIT_KEYS:JSON.stringify({'qa-http-v19':hex()}),
    QR_HANDOFF_CURRENT_KID:'qa-http-v19',QR_HANDOFF_KEYS:JSON.stringify({'qa-http-v19':hex()}),
    QR_RATE_KEY:hex(),QR_PAYLOAD_KEY:hex()};
  const server=await startQaServer({environment});
  console.log(JSON.stringify({event:'QA_RUNTIME_READY',time:new Date().toISOString(),run,
    origin:'http://127.0.0.1:8799',environment:'qa',baseline,production:false}));
  console.log('QA listo. Dejá esta ventana abierta durante las pruebas. Ctrl+C detiene el servidor.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}catch(error){
  delete process.env.PGPASSWORD;delete process.env.QR_QA_SERVICE_ROLE_KEY;
  // Only fixed error strings/status codes; never print SQL, response bodies or credentials.
  const allowed=/^(QA_[A-Z_]+(?:_HTTP_\d+)?(?:: revisar contraseña o conexión; no se modificó la base)?|invalid_qa_service_key)$/;
  console.error(allowed.test(error.message)?error.message:'QA_RUNTIME_START_FAILED');
  process.exitCode=1;
}
