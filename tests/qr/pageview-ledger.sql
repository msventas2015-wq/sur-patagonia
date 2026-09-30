-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.visitas(
  id uuid PRIMARY KEY, canal_ref text NULL, canal_via text NULL
);
CREATE TABLE public.canales(id uuid PRIMARY KEY);
CREATE TABLE public.referencias(id uuid PRIMARY KEY);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY);
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/pageview-ledger.sql

DO $test$
DECLARE
  v_request uuid := '00000000-0000-4000-8000-000000000001';
  v_ingreso uuid := '00000000-0000-4000-8000-000000000002';
  v_visita uuid := '00000000-0000-4000-8000-000000000003';
  v_ref uuid := '00000000-0000-4000-8000-000000000004';
  v_canal uuid := '00000000-0000-4000-8000-000000000005';
  v_landing uuid := '00000000-0000-4000-8000-000000000006';
  v_pageview uuid := '00000000-0000-4000-8000-000000000007';
  v_at timestamptz := '2026-09-21 12:00:00+00';
  v_payload bytea := decode(repeat('11',32),'hex');
BEGIN
  INSERT INTO public.visitas VALUES(v_visita,'fixture-qr','qr');
  INSERT INTO public.canales VALUES(v_canal);
  INSERT INTO public.referencias VALUES(v_ref);
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_request,1,v_payload,'v1','tracked',200,'/',v_ingreso,v_at);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,
    landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
    handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(v_ingreso,1,v_request,v_visita,v_ref,v_canal,'fixture-qr','qr',
    '/','/','base','/',v_landing,v_pageview,decode(repeat('22',32),'hex'),
    'fixture',v_at+interval '400 days',v_payload,'v1',v_at);
  INSERT INTO private.qr_aterrizajes_v1(
    ingreso_id,landing_id,pageview_request_id,path,created_at
  ) VALUES(v_ingreso,v_landing,v_pageview,'/',v_at);
  INSERT INTO private.qr_navegaciones_v1(
    request_id,resultado,http_status,ingreso_id,payload_hash,payload_key_id,created_at
  ) VALUES(v_pageview,'landing_absorbed',200,v_ingreso,v_payload,'v1',v_at);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;

  IF (SELECT count(*) FROM public.visitas)<>1
    OR (SELECT count(*) FROM private.qr_aterrizajes_v1)<>1
    OR (SELECT count(*) FROM private.qr_navegaciones_v1)<>1 THEN
    RAISE EXCEPTION 'landing_count_mismatch';
  END IF;
  IF has_table_privilege('anon','private.qr_navegaciones_v1','SELECT')
    OR has_table_privilege('service_role','private.qr_aterrizajes_v1','INSERT') THEN
    RAISE EXCEPTION 'premature_pageview_grant';
  END IF;
  BEGIN
    UPDATE public.visitas SET canal_ref='changed' WHERE id=v_visita;
    RAISE EXCEPTION 'linked_visit_update_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LINKED_VISIT_IMMUTABLE' THEN RAISE; END IF;
  END;
  INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000012',
    'fixture-qr',NULL);
  INSERT INTO private.qr_navegaciones_v1(
    request_id,resultado,http_status,visita_id,ingreso_id,payload_hash,payload_key_id
  ) VALUES('00000000-0000-4000-8000-000000000013','pageview_tracked',200,
    '00000000-0000-4000-8000-000000000012',v_ingreso,v_payload,'v1');
  INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000014',
    NULL,NULL);
  INSERT INTO private.qr_navegaciones_v1(
    request_id,resultado,http_status,visita_id,payload_hash,payload_key_id
  ) VALUES('00000000-0000-4000-8000-000000000015','pageview_direct',200,
    '00000000-0000-4000-8000-000000000014',v_payload,'v1');
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000016',
      'fixture-qr','qr');
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,visita_id,ingreso_id,payload_hash,payload_key_id
    ) VALUES('00000000-0000-4000-8000-000000000017','pageview_tracked',200,
      '00000000-0000-4000-8000-000000000016',v_ingreso,v_payload,'v1');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'tracked_via_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_PAGEVIEW_VISIT_MISMATCH' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  -- The two content fields must match the immutable ingress, not merely the
  -- landing/request/path trio. NULL-bearing composite FKs cannot prove this.
  BEGIN
    INSERT INTO public.propiedades VALUES
      ('00000000-0000-4000-8000-000000000030'),
      ('00000000-0000-4000-8000-000000000031');
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000032',
      'fixture-qr','qr');
    INSERT INTO private.qr_resoluciones_v1(
      request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
      destino_seguro,ingreso_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000033',3,v_payload,'v1',
      'tracked',200,'/propiedad.html?id=00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000034',v_at);
    INSERT INTO private.qr_ingresos_v1(
      id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
      destino_base,destino_efectivo,destino_fuente,pagina,propiedad_id,
      landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
      handoff_expira,payload_hash,payload_key_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000034',3,
      '00000000-0000-4000-8000-000000000033',
      '00000000-0000-4000-8000-000000000032',v_ref,v_canal,
      'fixture-qr','qr',
      '/propiedad.html?id=00000000-0000-4000-8000-000000000030',
      '/propiedad.html?id=00000000-0000-4000-8000-000000000030',
      'base','/propiedad','00000000-0000-4000-8000-000000000030',
      '00000000-0000-4000-8000-000000000035',
      '00000000-0000-4000-8000-000000000036',
      decode(repeat('44',32),'hex'),'fixture',v_at+interval '400 days',
      v_payload,'v1',v_at);
    INSERT INTO private.qr_aterrizajes_v1(
      ingreso_id,landing_id,pageview_request_id,path,propiedad_id
    ) VALUES('00000000-0000-4000-8000-000000000034',
      '00000000-0000-4000-8000-000000000035',
      '00000000-0000-4000-8000-000000000036','/propiedad',
      '00000000-0000-4000-8000-000000000031');
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,ingreso_id,payload_hash,payload_key_id
    ) VALUES('00000000-0000-4000-8000-000000000036',
      'landing_absorbed',200,'00000000-0000-4000-8000-000000000034',
      v_payload,'v1');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'landing_wrong_property_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LANDING_CONTENT_MISMATCH' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  -- A browser must never turn Y's reserved landing UUID into a second visit.
  BEGIN
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000020',
      'fixture-qr','qr');
    INSERT INTO public.visitas VALUES('00000000-0000-4000-8000-000000000024',
      'fixture-qr',NULL);
    INSERT INTO private.qr_resoluciones_v1(
      request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
      destino_seguro,ingreso_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000021',2,v_payload,'v1',
      'tracked',200,'/','00000000-0000-4000-8000-000000000022',v_at);
    INSERT INTO private.qr_ingresos_v1(
      id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
      destino_base,destino_efectivo,destino_fuente,pagina,
      landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
      handoff_expira,payload_hash,payload_key_id,created_at
    ) VALUES('00000000-0000-4000-8000-000000000022',2,
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000020',v_ref,v_canal,
      'fixture-qr','qr','/','/','base','/',
      '00000000-0000-4000-8000-000000000023',
      '00000000-0000-4000-8000-000000000025',
      decode(repeat('33',32),'hex'),'fixture',v_at+interval '400 days',
      v_payload,'v1',v_at);
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,visita_id,ingreso_id,
      payload_hash,payload_key_id
    ) VALUES('00000000-0000-4000-8000-000000000025',
      'pageview_tracked',200,'00000000-0000-4000-8000-000000000024',
      '00000000-0000-4000-8000-000000000022',v_payload,'v1');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'landing_as_navigation_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LANDING_REQUEST_NOT_NAVIGATION' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    UPDATE private.qr_navegaciones_v1 SET resultado='pageview_direct'
    WHERE request_id=v_pageview;
    RAISE EXCEPTION 'navigation_update_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.qr_aterrizajes_v1 WHERE ingreso_id=v_ingreso;
    RAISE EXCEPTION 'landing_delete_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,ingreso_id,payload_hash,payload_key_id
    ) VALUES('00000000-0000-4000-8000-000000000008',
      'landing_absorbed',200,v_ingreso,v_payload,'v1');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'foreign_landing_ack_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LANDING_ACK_MISMATCH' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  BEGIN
    INSERT INTO private.qr_aterrizajes_v1(
      ingreso_id,landing_id,pageview_request_id,path
    ) VALUES('00000000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000011','/proyectos');
    RAISE EXCEPTION 'unknown_ingress_not_rejected';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$test$;

ROLLBACK;
\echo 'PASS local pageview ledger fixture; not QA and no runtime writer installed'
