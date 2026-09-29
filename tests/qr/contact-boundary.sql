-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA vault;
DO $roles$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $roles$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
-- Match Vault's distinct ciphertext and decrypted columns; a ciphertext reader must fail.
CREATE TABLE vault.decrypted_secrets(
  name text PRIMARY KEY,
  secret text NOT NULL DEFAULT 'opaque-ciphertext-fixture',
  decrypted_secret text NOT NULL
);

CREATE TABLE public.canales(id uuid PRIMARY KEY,activo boolean NOT NULL);
CREATE TABLE public.referencias(id uuid PRIMARY KEY,canal_id uuid NOT NULL REFERENCES public.canales,
  codigo text UNIQUE NOT NULL,activo boolean NOT NULL);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY,activa boolean NOT NULL);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,estado text NOT NULL);
CREATE TABLE public.visitas(id uuid PRIMARY KEY);
CREATE TABLE public.personas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),estado_persona text,nombre text,email_norm text,
  celular_norm text,fijo_norm text,primera_fecha timestamptz,primer_canal_ref text,
  vence_atribucion_at timestamptz,retencion_hasta timestamptz,
  created_at timestamptz DEFAULT clock_timestamp()
);
CREATE TABLE public.contactos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text NOT NULL,email text NOT NULL,
  telefono text,mensaje text,propiedad_id uuid REFERENCES public.propiedades,proyecto_slug text,
  canal_ref text,canal_via text,origen text NOT NULL DEFAULT 'web',persona_id uuid REFERENCES public.personas,
  estado text DEFAULT 'nueva',fecha timestamptz DEFAULT clock_timestamp(),created_at timestamptz DEFAULT clock_timestamp()
);
CREATE FUNCTION public.normalizar_email(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT nullif(lower(btrim(p)),'') $$;
CREATE FUNCTION public.normalizar_telefono_ar(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT nullif(regexp_replace(coalesce(p,''),'[^0-9+]','','g'),'') $$;
CREATE FUNCTION public.fixture_contact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.fecha:=clock_timestamp();new.created_at:=new.fecha;RETURN new;END $$;
CREATE TRIGGER aa_contact_guard BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.fixture_contact_guard();
CREATE FUNCTION public.validar_canal_ref() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN new; END $$;
CREATE TRIGGER contactos_validar_canal BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.validar_canal_ref();
CREATE FUNCTION public.contactos_resolver_persona() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN new; END $$;
CREATE TRIGGER zz_contactos_resolver_persona BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.contactos_resolver_persona();

\ir ../../worker/qr/sql/ledger-schema.sql
CREATE FUNCTION private.qr_resolver_registrar_core_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb
) RETURNS jsonb LANGUAGE sql VOLATILE AS $$ SELECT '{}'::jsonb $$;
\ir ../../worker/qr/sql/runtime-boundary.sql
\ir ../../worker/qr/sql/rate-limit.sql
\ir ../../worker/qr/sql/contact-core.sql
\ir ../../worker/qr/sql/contact-boundary.sql

INSERT INTO private.qr_runtime_gate_v1(ambiente,version,accepting,motivo)
VALUES('qa',1,true,'active');
INSERT INTO vault.decrypted_secrets(name,decrypted_secret)
VALUES('qr_worker_assertion_v1/qa/assert-v1',repeat('09',32));

DO $vector$
DECLARE v_args bytea;
BEGIN
  v_args:=private.qr_contacto_arguments_bytes_v1(
    'qa','00112233-4455-4677-8899-aabbccddeeff',decode(repeat('05',32),'hex'),'v1',
    'Persona QA','Persona@example.invalid',NULL,'Consulta',NULL,NULL,'home_form',
    decode(repeat('06',32),'hex'),'within_limit',1,100,
    jsonb_build_array(jsonb_build_object(
      'slot','00000000000040008000000000000001','hash',repeat('77',32),'kid','handoff-old'
    ))
  );
  IF encode(extensions.digest(v_args,'sha256'),'hex')<>
    '2e430ad59eb2a9c97ed7be7473bcd30c337d485e3d69cdf8fa2a1dc25d132f46' THEN
    RAISE EXCEPTION 'Node/SQL contact argument codec diverged';
  END IF;
  IF encode(extensions.hmac(
      private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
      private.qr_lp_text_v1('qr_contacto_registrar_interno_v1')||
      uuid_send('00112233-4455-4677-8899-aabbccddeeff'::uuid)||
      private.qr_lp_text_v1('assert-v1')||
      private.qr_lp_text_v1('2026-09-21T14:13:20.123000Z')||
      uuid_send('11112233-4455-4677-8899-aabbccddeeff'::uuid)||
      extensions.digest(v_args,'sha256'),decode(repeat('09',32),'hex'),'sha256'
    ),'hex')<>'fd1e5adf8f8a1ac5229c96eebebefb8edc07e81d600893f657e06b8f7b6dce99' THEN
    RAISE EXCEPTION 'Node/SQL contact assertion codec diverged';
  END IF;
END
$vector$;

DO $direct_and_replay$
DECLARE
  v_request uuid:='51000000-0000-4000-8000-000000000001';
  v_nonce uuid:='51000000-0000-4000-8000-000000000002';
  v_network bytea:=decode(repeat('61',32),'hex');
  v_ts text;
  v_args bytea; v_hash bytea; v_assertion bytea; v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  PERFORM set_config('request.method','POST',false);
  v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  v_args:=private.qr_contacto_arguments_bytes_v1(
    'qa',v_request,decode(repeat('51',32),'hex'),'v1','Persona QA',
    'persona@example.invalid',NULL,'Consulta',NULL,NULL,'home_form',v_network,
    'within_limit',0,0,'[]'::jsonb
  );
  v_hash:=extensions.digest(v_args,'sha256');
  v_assertion:=extensions.hmac(
    private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
    private.qr_lp_text_v1('qr_contacto_registrar_interno_v1')||uuid_send(v_request)||
    private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||v_hash,
    decode(repeat('09',32),'hex'),'sha256'
  );
  v_result:=public.qr_contacto_registrar_interno_v1(
    'qa',v_request,decode(repeat('51',32),'hex'),'v1','Persona QA',
    'persona@example.invalid',NULL,'Consulta',NULL,NULL,'home_form',v_network,
    'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion
  );
  IF v_result->>'resultado'<>'contacto_creado'
    OR v_result ? 'contacto_id'
    OR (SELECT count(*) FROM public.contactos)<>1 THEN
    RAISE EXCEPTION 'contact wrapper first call failed:%',v_result;
  END IF;

  -- Fresh transport nonce, same business request: replay without another row.
  v_nonce:='51000000-0000-4000-8000-000000000003';
  v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  v_assertion:=extensions.hmac(
    private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
    private.qr_lp_text_v1('qr_contacto_registrar_interno_v1')||uuid_send(v_request)||
    private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||v_hash,
    decode(repeat('09',32),'hex'),'sha256'
  );
  v_result:=public.qr_contacto_registrar_interno_v1(
    'qa',v_request,decode(repeat('51',32),'hex'),'v1','Persona QA',
    'persona@example.invalid',NULL,'Consulta',NULL,NULL,'home_form',v_network,
    'within_limit',0,0,'[]'::jsonb,'assert-v1',v_ts,v_nonce,v_assertion
  );
  IF v_result->>'resultado'<>'contacto_creado' OR v_result->>'replayed'<>'true'
    OR (SELECT count(*) FROM public.contactos)<>1 THEN
    RAISE EXCEPTION 'contact replay failed:%',v_result;
  END IF;
END
$direct_and_replay$;

DO $network_rate$
DECLARE
  v_i integer; v_request uuid; v_nonce uuid; v_ts text;
  v_payload bytea; v_args bytea; v_assertion bytea; v_result jsonb;
  v_network bytea:=decode(repeat('62',32),'hex');
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  PERFORM set_config('request.method','POST',false);
  FOR v_i IN 1..6 LOOP
    v_request:=gen_random_uuid(); v_nonce:=gen_random_uuid();
    v_payload:=extensions.digest(convert_to('network-'||v_i,'UTF8'),'sha256');
    v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
    v_args:=private.qr_contacto_arguments_bytes_v1(
      'qa',v_request,v_payload,'v1','Rate QA','rate'||v_i||'@example.invalid',
      NULL,'Consulta',NULL,NULL,'home_form',v_network,'within_limit',0,0,'[]'::jsonb
    );
    v_assertion:=extensions.hmac(
      private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
      private.qr_lp_text_v1('qr_contacto_registrar_interno_v1')||uuid_send(v_request)||
      private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||
      extensions.digest(v_args,'sha256'),decode(repeat('09',32),'hex'),'sha256'
    );
    v_result:=public.qr_contacto_registrar_interno_v1(
      'qa',v_request,v_payload,'v1','Rate QA','rate'||v_i||'@example.invalid',
      NULL,'Consulta',NULL,NULL,'home_form',v_network,'within_limit',0,0,'[]'::jsonb,
      'assert-v1',v_ts,v_nonce,v_assertion
    );
    IF (v_i<=5 AND v_result->>'resultado'<>'contacto_creado')
      OR (v_i=6 AND (v_result->>'resultado'<>'rate_limited'
        OR coalesce((v_result->>'retry_after')::integer,0)<1)) THEN
      RAISE EXCEPTION 'network rate edge failed at %:%',v_i,v_result;
    END IF;
  END LOOP;
END
$network_rate$;

DO $handoff_rate$
DECLARE
  v_channel uuid:='52000000-0000-4000-8000-000000000001';
  v_ref uuid:='52000000-0000-4000-8000-000000000002';
  v_visit uuid:='52000000-0000-4000-8000-000000000003';
  v_ingress_request uuid:='52000000-0000-4000-8000-000000000004';
  v_ingress uuid:='52000000-0000-4000-8000-000000000005';
  v_i integer; v_request uuid; v_nonce uuid; v_ts text;
  v_payload bytea; v_args bytea; v_assertion bytea; v_result jsonb;
  v_network bytea; v_candidate jsonb;
  v_now timestamptz:=clock_timestamp();
BEGIN
  INSERT INTO public.canales VALUES(v_channel,true);
  INSERT INTO public.referencias VALUES(v_ref,v_channel,'qa-handoff-rate',true);
  INSERT INTO public.visitas VALUES(v_visit);
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_ingress_request,1,decode(repeat('71',32),'hex'),'v1','tracked',200,
    '/',v_ingress,clock_timestamp());
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,landing_id,
    landing_pageview_request_id,handoff_hash,handoff_key_id,handoff_expira,
    payload_hash,payload_key_id,created_at
  ) VALUES(v_ingress,1,v_ingress_request,v_visit,v_ref,v_channel,
    'qa-handoff-rate','qr','/','/','base','/',
    '52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000007',
    decode(repeat('72',32),'hex'),'handoff-test',v_now+interval '400 days',
    decode(repeat('71',32),'hex'),'v1',v_now);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  v_candidate:=jsonb_build_array(jsonb_build_object(
    'slot',replace(v_ingress_request::text,'-',''),'hash',repeat('72',32),'kid','handoff-test'));
  PERFORM set_config('request.jwt.claim.role','service_role',false);
  PERFORM set_config('request.method','POST',false);
  FOR v_i IN 1..4 LOOP
    v_request:=gen_random_uuid(); v_nonce:=gen_random_uuid();
    v_payload:=extensions.digest(convert_to('handoff-'||v_i,'UTF8'),'sha256');
    v_network:=extensions.digest(convert_to('handoff-network-'||v_i,'UTF8'),'sha256');
    v_ts:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
    v_args:=private.qr_contacto_arguments_bytes_v1(
      'qa',v_request,v_payload,'v1','Handoff QA','handoff'||v_i||'@example.invalid',
      NULL,'Consulta',NULL,NULL,'home_form',v_network,'within_limit',1,100,v_candidate
    );
    v_assertion:=extensions.hmac(
      private.qr_lp_text_v1('qr-worker-assert-v1')||private.qr_lp_text_v1('qa')||
      private.qr_lp_text_v1('qr_contacto_registrar_interno_v1')||uuid_send(v_request)||
      private.qr_lp_text_v1('assert-v1')||private.qr_lp_text_v1(v_ts)||uuid_send(v_nonce)||
      extensions.digest(v_args,'sha256'),decode(repeat('09',32),'hex'),'sha256'
    );
    v_result:=public.qr_contacto_registrar_interno_v1(
      'qa',v_request,v_payload,'v1','Handoff QA','handoff'||v_i||'@example.invalid',
      NULL,'Consulta',NULL,NULL,'home_form',v_network,'within_limit',1,100,v_candidate,
      'assert-v1',v_ts,v_nonce,v_assertion
    );
    IF (v_i<=3 AND v_result->>'resultado'<>'contacto_creado')
      OR (v_i=4 AND v_result->>'resultado'<>'rate_limited') THEN
      RAISE EXCEPTION 'handoff rate edge failed at %:%',v_i,v_result;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM private.qr_contactos_v1 WHERE ingreso_id=v_ingress)<>3 THEN
    RAISE EXCEPTION 'handoff rate created wrong attributed count';
  END IF;
END
$handoff_rate$;

DO $acl$
BEGIN
  IF has_function_privilege('anon',
      'public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)',
      'EXECUTE')
    OR has_function_privilege('service_role',
      'private.qr_consulta_core_v1(text,text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'contact runtime ACL invalid';
  END IF;
END
$acl$;

ROLLBACK;
\echo 'contact-boundary-pass'
