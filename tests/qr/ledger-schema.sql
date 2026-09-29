-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.visitas(id uuid PRIMARY KEY);
CREATE TABLE public.canales(id uuid PRIMARY KEY);
CREATE TABLE public.referencias(id uuid PRIMARY KEY);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY);
\ir ../../worker/qr/sql/ledger-schema.sql

DO $test$
DECLARE
  v_request uuid := '00000000-0000-4000-8000-000000000001';
  v_ingreso uuid := '00000000-0000-4000-8000-000000000002';
  v_visita uuid := '00000000-0000-4000-8000-000000000003';
  v_ref uuid := '00000000-0000-4000-8000-000000000004';
  v_canal uuid := '00000000-0000-4000-8000-000000000005';
  v_property uuid := '00000000-0000-4000-8000-000000000006';
  v_at timestamptz := '2026-09-20 12:00:00+00';
  v_payload bytea := decode(repeat('11',32),'hex');
  v_handoff bytea := decode(repeat('22',32),'hex');
BEGIN
  INSERT INTO public.visitas VALUES(v_visita);
  INSERT INTO public.canales VALUES(v_canal);
  INSERT INTO public.referencias VALUES(v_ref);
  INSERT INTO public.propiedades VALUES(v_property);
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_request,1,v_payload,'v1','tracked',200,
    '/propiedad.html?id='||v_property,v_ingreso,v_at);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,propiedad_id,
    landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
    handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(v_ingreso,1,v_request,v_visita,v_ref,v_canal,'qa-test','qr',
    '/propiedad.html?id='||v_property,'/propiedad.html?id='||v_property,'base',
    '/propiedad',v_property,'00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008',v_handoff,'test',
    v_at+interval '400 days',v_payload,'v1',v_at);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  IF (SELECT handoff_expira-created_at FROM private.qr_ingresos_v1 WHERE id=v_ingreso)
      IS DISTINCT FROM interval '400 days' THEN RAISE EXCEPTION 'fixed_handoff_failed'; END IF;
  IF has_table_privilege('anon','private.qr_ingresos_v1','SELECT')
    OR has_table_privilege('authenticated','private.qr_resoluciones_v1','INSERT')
    OR has_sequence_privilege('service_role','private.qr_event_seq_v1','USAGE') THEN
    RAISE EXCEPTION 'premature_privilege';
  END IF;

  BEGIN
    UPDATE private.qr_ingresos_v1 SET codigo='changed' WHERE id=v_ingreso;
    RAISE EXCEPTION 'update_guard_failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.qr_resoluciones_v1 WHERE request_id=v_request;
    RAISE EXCEPTION 'delete_guard_failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    -- Include the external campaign-control FK target so PostgreSQL reaches
    -- the ledger's own anti-TRUNCATE trigger rather than stopping at 0A000.
    TRUNCATE private.qr_campana_control_v1,
      private.qr_ingresos_v1, private.qr_resoluciones_v1;
    RAISE EXCEPTION 'truncate_guard_failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;

  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,created_at
  ) VALUES('00000000-0000-4000-8000-000000000009',2,decode(repeat('33',32),'hex'),
    'v1','unknown_or_inactive',404,v_at);

  BEGIN
    INSERT INTO private.qr_resoluciones_v1(
      request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
      destino_seguro,ingreso_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000010',3,decode(repeat('44',32),'hex'),
      'v1','tracked',200,'/','00000000-0000-4000-8000-000000000011',v_at);
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000012');
    INSERT INTO private.qr_ingresos_v1(
      id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
      destino_base,destino_efectivo,destino_fuente,pagina,landing_id,
      landing_pageview_request_id,handoff_hash,handoff_key_id,handoff_expira,
      payload_hash,payload_key_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000011',4,
      '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012',
      v_ref,v_canal,'qa-test','qr','/','/','base','/',
      '00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000014',
      decode(repeat('55',32),'hex'),'test',v_at+interval '400 days',
      decode(repeat('44',32),'hex'),'v1',v_at);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'cross_ledger_mismatch_not_rejected';
  EXCEPTION WHEN foreign_key_violation THEN
    SET CONSTRAINTS ALL DEFERRED;
  END;

  BEGIN
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000015');
    INSERT INTO private.qr_ingresos_v1(
      id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
      destino_base,destino_efectivo,destino_fuente,pagina,landing_id,
      landing_pageview_request_id,handoff_hash,handoff_key_id,handoff_expira,
      payload_hash,payload_key_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000016',5,
      '00000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000015',
      v_ref,v_canal,'qa-test','qr','/','/','base','/',
      '00000000-0000-4000-8000-000000000018','00000000-0000-4000-8000-000000000019',
      decode(repeat('66',32),'hex'),'test',v_at+interval '399 days',
      decode(repeat('77',32),'hex'),'v1',v_at);
    RAISE EXCEPTION 'handoff_duration_not_rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;

ROLLBACK;
\echo 'PASS local ledger schema fixture; not QA and no runtime writer installed'
