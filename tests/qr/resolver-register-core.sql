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
CREATE TYPE public.tipo_canal AS ENUM ('punto_venta','inmobiliaria','particular');
CREATE TABLE public.canales(id uuid PRIMARY KEY,tipo public.tipo_canal,activo boolean,destino text);
CREATE TABLE public.referencias(id uuid PRIMARY KEY,canal_id uuid,codigo text UNIQUE,activo boolean,destino text);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY,activa boolean,slug text);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY,estado text,slug text UNIQUE);
CREATE TABLE public.campanas(id uuid PRIMARY KEY,url_destino text,activa boolean,fecha_inicio timestamptz,fecha_fin timestamptz);
CREATE TABLE public.campanas_canales(campana_id uuid,canal_id uuid,PRIMARY KEY(campana_id,canal_id));
CREATE TABLE public.visitas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pagina text NOT NULL,
  propiedad_id uuid NULL, referrer text NULL, dispositivo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), canal_ref text NULL, canal_via text NULL
);
CREATE FUNCTION public.es_canal_pasivo(public.tipo_canal) RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$SELECT $1 NOT IN ('inmobiliaria','particular')$$;
CREATE FUNCTION private.e2_clasificar_destino_v6(text,boolean)
RETURNS TABLE(contenido_tipo text,propiedad_id uuid,proyecto_id uuid,slug text)
LANGUAGE plpgsql AS $$ DECLARE p public.propiedades%ROWTYPE; BEGIN
 IF $1 IN ('/','/propiedades','/proyectos') THEN
   RETURN QUERY SELECT 'general',NULL::uuid,NULL::uuid,NULL::text; RETURN;
 END IF;
 IF $1 ~ '^/propiedad\.html\?id=[0-9a-f-]{36}$' THEN
   SELECT * INTO p FROM public.propiedades WHERE id=split_part($1,'=',2)::uuid;
   IF NOT FOUND OR ($2 AND p.activa IS DISTINCT FROM true) THEN RAISE EXCEPTION 'E2_DESTINO_PROPIEDAD_INACTIVA'; END IF;
   RETURN QUERY SELECT 'propiedad',p.id,NULL::uuid,p.slug; RETURN;
 END IF;
 RAISE EXCEPTION 'E2_DESTINO_FORMA_NO_PERMITIDA';
END $$;
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/rate-limit.sql
\ir ../../worker/qr/sql/resolver-concurrency.sql
\ir ../../worker/qr/sql/resolver-read.sql
\ir ../../worker/qr/sql/resolver-register-core.sql

-- Unit-core fixture only: the runtime boundary has its own integration test
-- and owns the real one-shot context. This stub keeps this file focused on
-- core business semantics.
CREATE FUNCTION private.qr_runtime_contexto_consumir_v1(text,text,uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;

INSERT INTO public.canales VALUES ('00000000-0000-4000-8000-000000000001','punto_venta',true,'/');
INSERT INTO public.referencias VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','qa-test',true,'/');

DO $$
DECLARE
  r1 jsonb; r2 jsonb; v_request uuid:='10000000-0000-4000-8000-000000000001';
  v_payload bytea:=decode(repeat('11',32),'hex');
  v_code bytea:=decode(repeat('22',32),'hex');
  v_network bytea:=decode(repeat('33',32),'hex');
  v_handoff bytea:=decode(repeat('44',32),'hex');
BEGIN
  r1:=private.qr_resolver_registrar_core_v1(
    'qa',v_request,v_payload,'v1','qa-test',v_code,'qr',v_network,v_handoff,'k1',
    clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
  );
  IF r1->>'tracked'<>'true' OR r1->>'replayed'<>'false' OR r1->>'destino'<>'/'
    OR r1#>>'{handoff,request_id}' IS DISTINCT FROM v_request::text
    OR r1#>>'{handoff,kid}' IS DISTINCT FROM 'k1'
    OR r1#>>'{handoff,hash}' IS DISTINCT FROM repeat('44',32)
    OR (r1#>>'{handoff,expires_at}')::timestamptz IS DISTINCT FROM
       (SELECT created_at+interval '400 days' FROM private.qr_ingresos_v1 WHERE request_id=v_request)
    OR r1->'clear_slots' IS DISTINCT FROM '[]'::jsonb
    OR r1#>>'{landing,path}'<>'/' OR r1#>>'{landing,landing_id}' IS NULL THEN
    RAISE EXCEPTION 'tracked_projection_failed: %',r1;
  END IF;
  r2:=private.qr_resolver_registrar_core_v1(
    'qa',v_request,v_payload,'v1','qa-test',v_code,'qr',v_network,v_handoff,'k1',
    clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
  );
  IF r2->>'replayed'<>'true' OR r2->'handoff' IS DISTINCT FROM r1->'handoff'
    OR r2->'landing' IS DISTINCT FROM r1->'landing' THEN
    RAISE EXCEPTION 'replay_failed: % / %',r1,r2;
  END IF;
  IF (SELECT count(*) FROM public.visitas)<>1
    OR (SELECT count(*) FROM private.qr_ingresos_v1)<>1
    OR (SELECT count(*) FROM private.qr_resoluciones_v1)<>1
    OR (SELECT count(*) FROM private.qr_rate_buckets_v1)<>3 THEN
    RAISE EXCEPTION 'replay_side_effect_failed';
  END IF;
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa',v_request,decode(repeat('55',32),'hex'),'v1','qa-test',v_code,'qr',v_network,
      v_handoff,'k1',clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
    );
    RAISE EXCEPTION 'payload_conflict_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE
  r jsonb;
  c jsonb:='[{"slot":"10000000000040008000000000000001","hash":"4444444444444444444444444444444444444444444444444444444444444444","kid":"k1"}]'::jsonb;
BEGIN
  r:=private.qr_resolver_registrar_core_v1(
    'qa','10000000-0000-4000-8000-000000000003',decode(repeat('a1',32),'hex'),'v1',
    'qa-test',decode(repeat('a2',32),'hex'),'qr',decode(repeat('a3',32),'hex'),
    decode(repeat('a4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
    'within_limit',1,100,c
  );
  IF r->'clear_slots' IS DISTINCT FROM '[]'::jsonb
    OR r->>'replayed'<>'false' THEN RAISE EXCEPTION 'created_clear_failed: %',r; END IF;
  r:=private.qr_resolver_registrar_core_v1(
    'qa','10000000-0000-4000-8000-000000000003',decode(repeat('a1',32),'hex'),'v1',
    'qa-test',decode(repeat('a2',32),'hex'),'qr',decode(repeat('a3',32),'hex'),
    decode(repeat('a4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
    'within_limit',1,100,c
  );
  IF r->'clear_slots' IS DISTINCT FROM '[]'::jsonb OR r->>'replayed'<>'true' THEN
    RAISE EXCEPTION 'replay_clear_failed: %',r;
  END IF;
END $$;

DO $$
DECLARE
  i integer;
  r jsonb;
  v_request uuid;
  v_candidates jsonb:='[]'::jsonb;
  v_hash bytea;
BEGIN
  FOR i IN 1..8 LOOP
    v_request:=('60000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    v_hash:=extensions.digest(convert_to('keep-handoff-'||i,'UTF8'),'sha256');
    r:=private.qr_resolver_registrar_core_v1(
      'qa',v_request,extensions.digest(convert_to('keep-payload-'||i,'UTF8'),'sha256'),'v1',
      'qa-test',decode(repeat('d2',32),'hex'),'qr',
      extensions.digest(convert_to('keep-network-'||i,'UTF8'),'sha256'),
      v_hash,'k1',clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
    );
    v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object(
      'slot',replace(v_request::text,'-',''),'hash',encode(v_hash,'hex'),'kid','k1'
    ));
  END LOOP;
  r:=private.qr_resolver_registrar_core_v1(
    'qa','60000000-0000-4000-8000-000000000009',decode(repeat('d1',32),'hex'),'v1',
    'qa-test',decode(repeat('d2',32),'hex'),'qr',decode(repeat('d3',32),'hex'),
    decode(repeat('d4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
    'within_limit',8,800,v_candidates
  );
  IF r->'clear_slots' IS DISTINCT FROM
      '["60000000000040008000000000000001"]'::jsonb THEN
    RAISE EXCEPTION 'keep_eight_failed: %',r;
  END IF;
END $$;

DO $$
DECLARE
  r jsonb;
  v_request uuid:='10000000-0000-4000-8000-000000000002';
  v_before bigint:=(SELECT count(*) FROM public.visitas);
BEGIN
  r:=private.qr_resolver_registrar_core_v1(
    'qa',v_request,decode(repeat('61',32),'hex'),'v1','unknown',decode(repeat('62',32),'hex'),
    'link',decode(repeat('63',32),'hex'),decode(repeat('64',32),'hex'),'k1',
    clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
  );
  IF r->>'resultado'<>'unknown_or_inactive' OR r->>'http_status'<>'404'
    OR (SELECT count(*) FROM public.visitas)<>v_before THEN RAISE EXCEPTION 'negative_failed: %',r; END IF;
END $$;

DO $$
DECLARE i integer; r jsonb; v_request uuid; BEGIN
  FOR i IN 1..21 LOOP
    v_request:=('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    r:=private.qr_resolver_registrar_core_v1(
      'qa',v_request,extensions.digest(convert_to('payload-'||i,'UTF8'),'sha256'),'v1','qa-test',
      decode(repeat('72',32),'hex'),'qr',decode(repeat('73',32),'hex'),
      extensions.digest(convert_to('handoff-'||i,'UTF8'),'sha256'),'k1',
      clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
    );
  END LOOP;
  IF r->>'resultado'<>'rate_limited' OR r->>'http_status'<>'429'
    OR (SELECT count(*) FROM private.qr_resoluciones_v1 WHERE resultado='rate_limited')<>1 THEN
    RAISE EXCEPTION 'rate_limit_failed: %',r;
  END IF;
  r:=private.qr_resolver_registrar_core_v1(
    'qa',v_request,extensions.digest(convert_to('payload-21','UTF8'),'sha256'),'v1','qa-test',
    decode(repeat('72',32),'hex'),'qr',decode(repeat('73',32),'hex'),
    extensions.digest(convert_to('handoff-21','UTF8'),'sha256'),'k1',
    clock_timestamp()+interval '2 minutes','within_limit',1,100,
    '[{"slot":"10000000000040008000000000000001","hash":"4444444444444444444444444444444444444444444444444444444444444444","kid":"k1"}]'::jsonb
  );
  IF r->>'replayed'<>'true'
    OR r->'clear_slots' IS DISTINCT FROM '["10000000000040008000000000000001"]'::jsonb THEN
    RAISE EXCEPTION 'rate_replay_cut_failed: %',r;
  END IF;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa','30000000-0000-4000-8000-000000000001',decode(repeat('81',32),'hex'),'v1',
      'qa-test',decode(repeat('82',32),'hex'),'qr',decode(repeat('83',32),'hex'),
      decode(repeat('84',32),'hex'),'k1',clock_timestamp()-interval '1 second',
      'within_limit',0,0,'[]'::jsonb
    );
    RAISE EXCEPTION 'expired_claim_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_CLAIM_EXPIRED' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa','30000000-0000-4000-8000-000000000003',decode(repeat('95',32),'hex'),'v1',
      'qa-test',decode(repeat('96',32),'hex'),'qr',decode(repeat('97',32),'hex'),
      decode(repeat('98',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
      'skipped_landing',0,0,'[]'::jsonb
    );
    RAISE EXCEPTION 'skipped_landing_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_RESOLVER_INPUT_INVALID' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE r jsonb; c jsonb:='[{"slot":"10000000000040008000000000000001","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kid":"k1"}]'::jsonb;
BEGIN
  r:=private.qr_resolver_registrar_core_v1(
    'qa','50000000-0000-4000-8000-000000000001',decode(repeat('b1',32),'hex'),'v1',
    'qa-test',decode(repeat('b2',32),'hex'),'link',decode(repeat('b3',32),'hex'),
    decode(repeat('b4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
    'within_limit',1,100,c
  );
  IF r->>'tracked'<>'true' THEN RAISE EXCEPTION 'valid_candidate_failed: %',r; END IF;
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa','50000000-0000-4000-8000-000000000002',decode(repeat('c1',32),'hex'),'v1',
      'qa-test',decode(repeat('c2',32),'hex'),'link',decode(repeat('c3',32),'hex'),
      decode(repeat('c4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
      'within_limit',2,200,c||c
    );
    RAISE EXCEPTION 'duplicate_candidate_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_COOKIE_CANDIDATE_DUPLICATE' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM private.qr_resolver_registrar_core_v1(
      'qa','30000000-0000-4000-8000-000000000002',decode(repeat('91',32),'hex'),'v1',
      'qa-test',decode(repeat('92',32),'hex'),'qr',decode(repeat('93',32),'hex'),
      decode(repeat('94',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
      'overflow',33,17000,'[{"slot":"10000000000040008000000000000001","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","kid":"k1"}]'::jsonb
    );
    RAISE EXCEPTION 'overflow_candidates_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_COOKIE_MATRIX_INVALID' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  IF has_function_privilege('service_role',
    'private.qr_resolver_registrar_core_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb)',
    'EXECUTE') THEN RAISE EXCEPTION 'premature_core_grant'; END IF;
  IF (SELECT count(*) FROM private.qr_ingresos_v1 i JOIN public.visitas v ON v.id=i.visita_id
      WHERE v.created_at=i.created_at AND v.canal_ref=i.codigo AND v.canal_via=i.via)
     <> (SELECT count(*) FROM private.qr_ingresos_v1) THEN
    RAISE EXCEPTION 'commercial_snapshot_mismatch';
  END IF;
END $$;

INSERT INTO public.campanas VALUES (
  '70000000-0000-4000-8000-000000000001','/propiedades',true,
  clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day'
);
DO $$ BEGIN
  IF (SELECT count(*) FROM private.qr_campana_control_v1
      WHERE campana_id='70000000-0000-4000-8000-000000000001')<>1
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='qr_campana_control_ingreso_v1' AND NOT condeferrable
    ) THEN
    RAISE EXCEPTION 'campaign_control_insert_or_immediate_fk_failed';
  END IF;
END $$;
INSERT INTO public.campanas_canales VALUES (
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_request uuid:='70000000-0000-4000-8000-000000000002';
  v_result jsonb; v_ingreso uuid;
BEGIN
  IF private.qr_resolver_snapshot_v1('qa-test')->>'destino' <> '/propiedades'
    OR EXISTS (SELECT 1 FROM private.qr_campana_control_v1
      WHERE definicion_congelada_at IS NOT NULL) THEN
    RAISE EXCEPTION 'pure_resolution_freeze_failed';
  END IF;
  v_result:=private.qr_resolver_registrar_core_v1(
    'qa',v_request,decode(repeat('c1',32),'hex'),'v1','qa-test',
    decode(repeat('c2',32),'hex'),'qr',decode(repeat('c3',32),'hex'),
    decode(repeat('c4',32),'hex'),'k1',clock_timestamp()+interval '2 minutes',
    'within_limit',0,0,'[]'::jsonb
  );
  v_ingreso:=(SELECT id FROM private.qr_ingresos_v1 WHERE request_id=v_request);
  IF v_result->>'tracked'<>'true' OR v_result->>'destino'<>'/propiedades'
    OR (SELECT campana_id FROM private.qr_ingresos_v1 WHERE id=v_ingreso)
      IS DISTINCT FROM '70000000-0000-4000-8000-000000000001'::uuid
    OR (SELECT congelada_por_ingreso_id FROM private.qr_campana_control_v1
        WHERE campana_id='70000000-0000-4000-8000-000000000001')
      IS DISTINCT FROM v_ingreso
    OR (SELECT congelada_por FROM private.qr_campana_control_v1
        WHERE campana_id='70000000-0000-4000-8000-000000000001')
      IS DISTINCT FROM 'primer_ingreso' THEN
    RAISE EXCEPTION 'campaign_first_ingress_freeze_failed: %',v_result;
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
END $$;

INSERT INTO public.campanas VALUES (
  '70000000-0000-4000-8000-000000000003','/proyectos',true,
  clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day'
);
INSERT INTO public.campanas_canales VALUES (
  '70000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001'
);
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result:=private.qr_resolver_registrar_core_v1(
    'qa','70000000-0000-4000-8000-000000000004',decode(repeat('d1',32),'hex'),
    'v1','qa-test',decode(repeat('d2',32),'hex'),'qr',
    decode(repeat('d3',32),'hex'),decode(repeat('e4',32),'hex'),'k1',
    clock_timestamp()+interval '2 minutes','within_limit',0,0,'[]'::jsonb
  );
  IF v_result->>'destino'<>'/'
    OR EXISTS (SELECT 1 FROM private.qr_campana_control_v1
      WHERE campana_id='70000000-0000-4000-8000-000000000003'
        AND definicion_congelada_at IS NOT NULL) THEN
    RAISE EXCEPTION 'campaign_overlap_froze_unselected: %',v_result;
  END IF;
END $$;

ROLLBACK;
\echo 'PASS local resolver transactional core; not QA and no public Worker wrapper'
