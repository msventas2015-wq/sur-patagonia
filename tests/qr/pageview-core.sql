-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
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
CREATE TABLE private.qr_handoff_revocaciones_v1(
  request_id uuid PRIMARY KEY,handoff_hash bytea,resultado text NOT NULL
);
CREATE FUNCTION private.qr_runtime_contexto_consumir_v1(text,text,uuid)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $fn$ BEGIN
  IF current_setting('qr.test_context',true) IS DISTINCT FROM 'allow'
    OR $1<>'qa' OR $2<>'qr_pageview_registrar_interno_v1' OR $3 IS NULL THEN
    RAISE EXCEPTION 'QR_CONTEXT_REQUIRED';
  END IF;
END $fn$;
\ir ../../worker/qr/sql/pageview-core.sql

DO $test$
DECLARE
  v_ingress_request uuid:='10000000-0000-4000-8000-000000000001';
  v_ingress uuid:='10000000-0000-4000-8000-000000000002';
  v_ingress_visit uuid:='10000000-0000-4000-8000-000000000003';
  v_ref uuid:='10000000-0000-4000-8000-000000000004';
  v_channel uuid:='10000000-0000-4000-8000-000000000005';
  v_tracked_request uuid:='20000000-0000-4000-8000-000000000001';
  v_direct_request uuid:='20000000-0000-4000-8000-000000000002';
  v_invalid_request uuid:='20000000-0000-4000-8000-000000000003';
  v_at timestamptz:=clock_timestamp();
  v_payload bytea:=decode(repeat('11',32),'hex');
  v_handoff bytea:=decode(repeat('22',32),'hex');
  v_network bytea:=decode(repeat('33',32),'hex');
  v_candidate jsonb;
  v_result jsonb;
BEGIN
  INSERT INTO public.canales VALUES(v_channel);
  INSERT INTO public.referencias VALUES(v_ref);
  INSERT INTO public.visitas VALUES(v_ingress_visit,'/',NULL,NULL,NULL,v_at,'fixture-qr','qr');
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_ingress_request,1,v_payload,'v1','tracked',200,'/',v_ingress,v_at);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,
    landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
    handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(v_ingress,1,v_ingress_request,v_ingress_visit,v_ref,v_channel,
    'fixture-qr','qr','/','/','base','/',
    '10000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000007',v_handoff,'fixture',
    v_at+interval '400 days',v_payload,'v1',v_at);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  v_candidate:=jsonb_build_array(jsonb_build_object(
    'slot',replace(v_ingress_request::text,'-',''),
    'hash',encode(v_handoff,'hex'),'kid','fixture'));
  PERFORM set_config('qr.test_context','allow',true);

  v_result:=private.qr_pageview_navegacion_core_v1(
    'qa',v_tracked_request,v_payload,'v1','/',NULL,NULL,v_network,
    'within_limit',1,120,v_candidate);
  IF v_result->>'resultado'<>'pageview_tracked' OR v_result->>'replayed'<>'false'
    OR (SELECT count(*) FROM public.visitas WHERE canal_ref='fixture-qr'
      AND canal_via IS NULL)<>1 THEN
    RAISE EXCEPTION 'tracked_pageview_failed: %',v_result;
  END IF;
  v_result:=private.qr_pageview_navegacion_core_v1(
    'qa',v_tracked_request,v_payload,'v1','/',NULL,NULL,v_network,
    'within_limit',1,120,v_candidate);
  IF v_result->>'resultado'<>'pageview_tracked' OR v_result->>'replayed'<>'true'
    OR (SELECT count(*) FROM private.qr_navegaciones_v1
      WHERE request_id=v_tracked_request)<>1 THEN
    RAISE EXCEPTION 'pageview_replay_failed: %',v_result;
  END IF;

  v_result:=private.qr_pageview_navegacion_core_v1(
    'qa',v_direct_request,v_payload,'v1','/',NULL,NULL,decode(repeat('44',32),'hex'),
    'within_limit',0,0,'[]'::jsonb);
  IF v_result->>'resultado'<>'pageview_direct'
    OR (SELECT count(*) FROM public.visitas WHERE id=(SELECT visita_id
      FROM private.qr_navegaciones_v1 WHERE request_id=v_direct_request)
      AND canal_ref IS NULL AND canal_via IS NULL)<>1 THEN
    RAISE EXCEPTION 'direct_pageview_failed: %',v_result;
  END IF;

  v_result:=private.qr_pageview_navegacion_core_v1(
    'qa',v_invalid_request,v_payload,'v1','/admin',NULL,NULL,
    decode(repeat('55',32),'hex'),'within_limit',0,0,'[]'::jsonb);
  IF v_result->>'resultado'<>'payload_invalid'
    OR (SELECT visita_id FROM private.qr_navegaciones_v1
      WHERE request_id=v_invalid_request) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_pageview_failed: %',v_result;
  END IF;

  IF has_function_privilege('anon',
    'private.qr_pageview_navegacion_core_v1(text,uuid,bytea,text,text,uuid,text,bytea,text,integer,integer,jsonb)',
    'EXECUTE') OR has_function_privilege('service_role',
    'private.qr_pageview_navegacion_core_v1(text,uuid,bytea,text,text,uuid,text,bytea,text,integer,integer,jsonb)',
    'EXECUTE') THEN RAISE EXCEPTION 'pageview_core_grant'; END IF;
END
$test$;
ROLLBACK;
\echo PASS local pageview core tracked/direct/idempotent; not QA proof
