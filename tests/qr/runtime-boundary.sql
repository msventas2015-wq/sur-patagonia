-- Destructive only inside an empty, disposable local PostgreSQL database.
-- Never run against Supabase or any database containing user data.
\set ON_ERROR_STOP on
\ir resolver-register-concurrency-setup.sql

CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
CREATE SCHEMA vault;
-- Match Vault's distinct ciphertext and decrypted columns; a ciphertext reader must fail.
CREATE TABLE vault.decrypted_secrets(
  name text PRIMARY KEY,
  secret text NOT NULL DEFAULT 'opaque-ciphertext-fixture',
  decrypted_secret text NOT NULL
);
\ir ../../worker/qr/sql/runtime-boundary.sql

INSERT INTO private.qr_runtime_gate_v1(ambiente,version,accepting,motivo)
VALUES('qa',1,true,'active');
INSERT INTO vault.decrypted_secrets(name,decrypted_secret)
VALUES('qr_worker_assertion_v1/qa/assert-v1',repeat('09',32));

DO $vector$
DECLARE
  v_args bytea;
BEGIN
  -- Fixed vector generated independently by worker-assertion.test.mjs.
  v_args:=private.qr_resolver_arguments_bytes_v1(
    'qa','00112233-4455-4677-8899-aabbccddeeff',decode(repeat('01',32),'hex'),
    'v1','fixture-qr',decode(repeat('02',32),'hex'),'qr',
    decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),'handoff-current',
    '2026-09-21T03:00:00.000Z','within_limit',1,100,
    jsonb_build_array(jsonb_build_object(
      'slot','00000000000040008000000000000001',
      'hash',repeat('77',32),'kid','handoff-old'
    ))
  );
  IF encode(extensions.digest(v_args,'sha256'),'hex')<>
       '87273081cf7f9dc13ba3cf83d2161d52888e564ed57b399689e9eab15921cf3d' THEN
    RAISE EXCEPTION 'Node/SQL resolver argument codec diverged';
  END IF;
  IF encode(extensions.hmac(
      private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
      private.qr_lp_text_v1('qr_resolver_registrar_interno_v1')||
      uuid_send('00112233-4455-4677-8899-aabbccddeeff'::uuid)||
      private.qr_lp_text_v1('assert-v1')||
      private.qr_lp_text_v1('2026-09-21T14:13:20.123000Z')||
      uuid_send('11112233-4455-4677-8899-aabbccddeeff'::uuid)||
      extensions.digest(v_args,'sha256'),decode(repeat('09',32),'hex'),'sha256'
    ),'hex')<>'37c6498bdea9928d5442f94e27edd14f2ca8906d2f98186b08d885701611a713' THEN
    RAISE EXCEPTION 'Node/SQL Worker assertion codec diverged';
  END IF;
END
$vector$;

DO $test$
DECLARE
  v_request uuid:='00112233-4455-4677-8899-aabbccddeeff';
  v_nonce uuid:='11112233-4455-4677-8899-aabbccddeeff';
  v_ts text;
  v_claim_exp timestamptz:=clock_timestamp()+interval '1 hour';
  v_args bytea;
  v_hash bytea;
  v_message bytea;
  v_assertion bytea;
  v_result jsonb;
  v_before bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  PERFORM set_config('request.method','POST',false);
  v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  v_args:=private.qr_resolver_arguments_bytes_v1(
    'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
    decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
    decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
    'within_limit',0,0,'[]'::jsonb
  );
  v_hash:=extensions.digest(v_args,'sha256');
  v_message:=private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
    private.qr_lp_text_v1('qr_resolver_registrar_interno_v1')||uuid_send(v_request)||
    private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||v_hash;
  v_assertion:=extensions.hmac(v_message,decode(repeat('09',32),'hex'),'sha256');

  v_result:=public.qr_resolver_registrar_interno_v1(
    'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
    decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
    decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
    'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion
  );
  IF v_result->>'resultado'<>'tracked' OR v_result->>'replayed'<>'false' THEN
    RAISE EXCEPTION 'first signed call failed: %',v_result;
  END IF;
  IF (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1)<>1
    OR (SELECT count(*) FROM private.qr_runtime_contextos_v1)<>0
    OR (SELECT count(*) FROM private.qr_ingresos_v1)<>1
    OR (SELECT count(*) FROM private.qr_resoluciones_v1)<>1
    OR (SELECT count(*) FROM public.visitas)<>1 THEN
    RAISE EXCEPTION 'first call counts invalid';
  END IF;

  BEGIN
    PERFORM public.qr_resolver_registrar_interno_v1(
      'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
      decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
      decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
      'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion
    );
    RAISE EXCEPTION 'nonce replay accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QR_NOT_AUTHORIZED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1)<>1 THEN
    RAISE EXCEPTION 'nonce replay changed ledger';
  END IF;

  -- A transport retry uses a fresh assertion nonce but the same business UUID.
  v_nonce:='22223333-4455-4677-8899-aabbccddeeff';
  v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  v_message:=private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
    private.qr_lp_text_v1('qr_resolver_registrar_interno_v1')||uuid_send(v_request)||
    private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||v_hash;
  v_assertion:=extensions.hmac(v_message,decode(repeat('09',32),'hex'),'sha256');
  v_result:=public.qr_resolver_registrar_interno_v1(
    'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
    decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
    decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
    'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion
  );
  IF v_result->>'resultado'<>'tracked' OR v_result->>'replayed'<>'true'
    OR (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1)<>2
    OR (SELECT count(*) FROM private.qr_ingresos_v1)<>1
    OR (SELECT count(*) FROM public.visitas)<>1 THEN
    RAISE EXCEPTION 'fresh transport retry was not idempotent: %',v_result;
  END IF;

  -- Wrong role and method are indistinguishable and consume no nonce.
  v_before:=(SELECT count(*) FROM private.qr_worker_assertion_nonces_v1);
  PERFORM set_config('request.jwt.claim.role','anon',false);
  BEGIN
    PERFORM public.qr_resolver_registrar_interno_v1(
      'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
      decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
      decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
      'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,
      '33334444-4555-4677-8899-aabbccddeeff',decode(repeat('00',32),'hex')
    );
    RAISE EXCEPTION 'anon accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QR_NOT_AUTHORIZED' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  PERFORM set_config('request.method','GET',false);
  BEGIN
    PERFORM public.qr_resolver_registrar_interno_v1(
      'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
      decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
      decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
      'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,
      '44445555-4555-4677-8899-aabbccddeeff',decode(repeat('00',32),'hex')
    );
    RAISE EXCEPTION 'GET accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QR_NOT_AUTHORIZED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1)<>v_before THEN
    RAISE EXCEPTION 'unauthorized call consumed nonce';
  END IF;

  -- Closed gate wins before role/method/assertion and leaves every ledger unchanged.
  UPDATE private.qr_runtime_gate_v1
  SET accepting=false,motivo='qa_closing',changed_at=clock_timestamp()
  WHERE ambiente='qa' AND version=1;
  PERFORM set_config('request.jwt.claim.role','anon',false);
  BEGIN
    PERFORM public.qr_resolver_registrar_interno_v1(
      'qa',v_request,decode(repeat('01',32),'hex'),'v1','qa-concurrent',
      decode(repeat('02',32),'hex'),'qr',decode(repeat('03',32),'hex'),
      decode(repeat('04',32),'hex'),'handoff-current',v_claim_exp,
      'within_limit',0,0,'[]'::jsonb,'bad','bad',
      '55556666-4555-4677-8899-aabbccddeeff',decode(repeat('00',32),'hex')
    );
    RAISE EXCEPTION 'closed gate accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QR_RUNTIME_GATE_CLOSED' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1)<>v_before
    OR (SELECT count(*) FROM private.qr_ingresos_v1)<>1
    OR (SELECT count(*) FROM public.visitas)<>1 THEN
    RAISE EXCEPTION 'closed gate had effects';
  END IF;
END
$test$;

DO $direct_core$
DECLARE
  v_visitas bigint:=(SELECT count(*) FROM public.visitas);
  v_ingresos bigint:=(SELECT count(*) FROM private.qr_ingresos_v1);
  v_resoluciones bigint:=(SELECT count(*) FROM private.qr_resoluciones_v1);
BEGIN
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa','66667777-4455-4677-8899-aabbccddeeff',decode(repeat('21',32),'hex'),'v1',
      'qa-concurrent',decode(repeat('22',32),'hex'),'qr',decode(repeat('23',32),'hex'),
      decode(repeat('24',32),'hex'),'handoff-current',clock_timestamp()+interval '1 hour',
      'within_limit',0,0,'[]'::jsonb
    );
    RAISE EXCEPTION 'direct core bypass accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QR_CONTEXT_MISSING' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.visitas)<>v_visitas
    OR (SELECT count(*) FROM private.qr_ingresos_v1)<>v_ingresos
    OR (SELECT count(*) FROM private.qr_resoluciones_v1)<>v_resoluciones
    OR (SELECT count(*) FROM private.qr_runtime_contextos_v1)<>0 THEN
    RAISE EXCEPTION 'direct core bypass had effects';
  END IF;
END
$direct_core$;

DO $acl$
BEGIN
  IF has_function_privilege('anon',
      'public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR has_function_privilege('service_role',
      'private.qr_resolver_registrar_core_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'runtime ACL invalid';
  END IF;
END
$acl$;

SELECT 'runtime-boundary-pass' AS result;
