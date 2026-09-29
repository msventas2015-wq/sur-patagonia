-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA vault;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
-- Match Vault's distinct ciphertext and decrypted columns; a ciphertext reader must fail.
CREATE TABLE vault.decrypted_secrets(
  name text PRIMARY KEY,
  secret text NOT NULL DEFAULT 'opaque-ciphertext-fixture',
  decrypted_secret text NOT NULL
);
CREATE TABLE public.canales(id uuid PRIMARY KEY);
CREATE TABLE public.referencias(id uuid PRIMARY KEY);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY,activa boolean NOT NULL);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,estado text NOT NULL);
CREATE TABLE public.visitas(
  id uuid PRIMARY KEY,pagina text NOT NULL,propiedad_id uuid,referrer text,
  dispositivo text,created_at timestamptz NOT NULL,canal_ref text,canal_via text
);
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/rate-limit.sql
\ir ../../worker/qr/sql/pageview-ledger.sql
\ir ../../worker/qr/sql/pageview-classifier.sql
\ir ../../worker/qr/sql/pageview-assertion.sql
CREATE FUNCTION private.qr_resolver_registrar_core_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb
) RETURNS jsonb LANGUAGE sql VOLATILE AS $$ SELECT '{}'::jsonb $$;
\ir ../../worker/qr/sql/runtime-boundary.sql
CREATE TABLE private.qr_handoff_revocaciones_v1(
  request_id uuid PRIMARY KEY,handoff_hash bytea,resultado text NOT NULL
);
\ir ../../worker/qr/sql/pageview-ack-core.sql
\ir ../../worker/qr/sql/pageview-core.sql
\ir ../../worker/qr/sql/pageview-boundary.sql

INSERT INTO private.qr_runtime_gate_v1(ambiente,version,accepting,motivo)
VALUES('qa',1,true,'active');
INSERT INTO vault.decrypted_secrets(name,decrypted_secret)
VALUES('qr_worker_assertion_v1/qa/assert-v1',repeat('09',32));
SELECT set_config('request.method','POST',true);
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $test$
DECLARE
  v_request uuid:='50000000-0000-4000-8000-000000000001';
  v_nonce uuid:='50000000-0000-4000-8000-000000000002';
  v_payload bytea:=decode(repeat('11',32),'hex');
  v_network bytea:=decode(repeat('22',32),'hex');
  v_ts text:=to_char(clock_timestamp() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_args_hash bytea;
  v_assertion bytea;
  v_result jsonb;
BEGIN
  v_args_hash:=extensions.digest(private.qr_pageview_arguments_bytes_v1(
    'qa',v_request,v_payload,'v1',NULL,'/',NULL,NULL,v_network,
    'within_limit',0,0,'[]'::jsonb),'sha256');
  v_assertion:=extensions.hmac(
    private.qr_lp_text_v1('qr-worker-assert-v1')||
    private.qr_lp_text_v1('qa')||
    private.qr_lp_text_v1('qr_pageview_registrar_interno_v1')||
    uuid_send(v_request)||private.qr_lp_text_v1('assert-v1')||
    private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||v_args_hash,
    decode(repeat('09',32),'hex'),'sha256');
  v_result:=public.qr_pageview_registrar_interno_v1(
    'qa',v_request,v_payload,'v1',NULL,'/',NULL,NULL,v_network,
    'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion);
  IF v_result->>'resultado'<>'pageview_direct' OR v_result->>'replayed'<>'false'
    OR (SELECT count(*) FROM private.qr_worker_assertion_nonces_v1
      WHERE endpoint='qr_pageview_registrar_interno_v1' AND request_id=v_request)<>1
    OR (SELECT count(*) FROM public.visitas WHERE canal_ref IS NULL
      AND canal_via IS NULL)<>1 THEN
    RAISE EXCEPTION 'signed_pageview_boundary_failed: %',v_result;
  END IF;
  IF has_function_privilege('anon',
    'public.qr_pageview_registrar_interno_v1(text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)',
    'EXECUTE') OR NOT has_function_privilege('service_role',
    'public.qr_pageview_registrar_interno_v1(text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)',
    'EXECUTE') THEN RAISE EXCEPTION 'pageview_boundary_grant'; END IF;
END
$test$;
ROLLBACK;
\echo PASS local signed pageview boundary; not QA proof
