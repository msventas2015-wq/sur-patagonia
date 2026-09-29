-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.visitas(id uuid PRIMARY KEY,canal_ref text,canal_via text);
CREATE TABLE public.canales(id uuid PRIMARY KEY);
CREATE TABLE public.referencias(id uuid PRIMARY KEY);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY);
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/pageview-ledger.sql
-- The real runtime boundary has a signed, one-shot context. This stub exists
-- only in the rollback-only local fixture to prove that the core invokes it.
CREATE FUNCTION private.qr_runtime_contexto_consumir_v1(text,text,uuid)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $fn$
BEGIN
  IF current_setting('qr.test_context',true) IS DISTINCT FROM 'allow'
    OR $1<>'qa' OR $2<>'qr_pageview_registrar_interno_v1' OR $3 IS NULL THEN
    RAISE EXCEPTION 'QR_CONTEXT_REQUIRED';
  END IF;
END
$fn$;
\ir ../../worker/qr/sql/pageview-ack-core.sql

DO $test$
DECLARE
  v_request uuid:='00000000-0000-4000-8000-000000000001';
  v_ingreso uuid:='00000000-0000-4000-8000-000000000002';
  v_visita uuid:='00000000-0000-4000-8000-000000000003';
  v_ref uuid:='00000000-0000-4000-8000-000000000004';
  v_canal uuid:='00000000-0000-4000-8000-000000000005';
  v_landing uuid:='00000000-0000-4000-8000-000000000006';
  v_pageview uuid:='00000000-0000-4000-8000-000000000007';
  v_at timestamptz:='2026-09-21 12:00:00+00';
  v_hash bytea:=decode(repeat('11',32),'hex');
  v_result jsonb;
BEGIN
  INSERT INTO public.visitas VALUES(v_visita,'fixture-qr','qr');
  INSERT INTO public.canales VALUES(v_canal);
  INSERT INTO public.referencias VALUES(v_ref);
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_request,1,v_hash,'v1','tracked',200,'/',v_ingreso,v_at);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,
    landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
    handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(v_ingreso,1,v_request,v_visita,v_ref,v_canal,'fixture-qr','qr',
    '/','/','base','/',v_landing,v_pageview,decode(repeat('22',32),'hex'),
    'fixture',v_at+interval '400 days',v_hash,'v1',v_at);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  BEGIN
    PERFORM private.qr_pageview_ack_core_v1(
      'qa',v_pageview,v_hash,'v1',v_landing,'/',NULL,NULL);
    RAISE EXCEPTION 'missing_context_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_CONTEXT_REQUIRED' THEN RAISE; END IF;
  END;
  PERFORM set_config('qr.test_context','allow',true);
  v_result:=private.qr_pageview_ack_core_v1(
    'qa',v_pageview,v_hash,'v1',v_landing,'/',NULL,NULL);
  IF v_result->>'resultado'<>'landing_absorbed'
    OR v_result->>'replayed'<>'false' THEN RAISE EXCEPTION 'valid_ack_failed'; END IF;
  v_result:=private.qr_pageview_ack_core_v1(
    'qa',v_pageview,v_hash,'v1',v_landing,'/',NULL,NULL);
  IF v_result->>'resultado'<>'landing_absorbed'
    OR v_result->>'replayed'<>'true' THEN RAISE EXCEPTION 'ack_replay_failed'; END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT count(*) FROM public.visitas)<>1
    OR (SELECT count(*) FROM private.qr_aterrizajes_v1)<>1
    OR (SELECT count(*) FROM private.qr_navegaciones_v1)<>1 THEN
    RAISE EXCEPTION 'ack_created_extra_visit_or_row';
  END IF;

  v_result:=private.qr_pageview_ack_core_v1(
    'qa','00000000-0000-4000-8000-000000000008',v_hash,'v1',
    v_landing,'/proyectos',NULL,NULL);
  IF v_result->>'resultado'<>'payload_invalid' THEN
    RAISE EXCEPTION 'foreign_ack_not_rejected';
  END IF;
  v_result:=private.qr_pageview_ack_core_v1(
    'qa','00000000-0000-4000-8000-000000000008',v_hash,'v1',
    v_landing,'/proyectos',NULL,NULL);
  IF v_result->>'resultado'<>'payload_invalid'
    OR v_result->>'replayed'<>'true' THEN RAISE EXCEPTION 'invalid_ack_replay_failed'; END IF;
  BEGIN
    PERFORM private.qr_pageview_ack_core_v1(
      'qa',v_pageview,decode(repeat('33',32),'hex'),'v1',v_landing,'/',NULL,NULL);
    RAISE EXCEPTION 'mutated_payload_replay_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM public.visitas)<>1
    OR (SELECT count(*) FROM private.qr_aterrizajes_v1)<>1
    OR (SELECT count(*) FROM private.qr_navegaciones_v1)<>2 THEN
    RAISE EXCEPTION 'invalid_ack_created_business_effect';
  END IF;
END
$test$;
ROLLBACK;
\echo 'PASS local pageview ACK core fixture; not QA and no runtime wrapper installed'
