-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
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
CREATE FUNCTION public.es_canal_pasivo(public.tipo_canal) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1 NOT IN ('inmobiliaria','particular')$$;
-- Minimal fixture classifier, NOT a copy or proof of live E2. Its intentionally
-- restricted destinations test the resolver's composition, not E2 correctness.
CREATE FUNCTION private.e2_clasificar_destino_v6(text,boolean) RETURNS TABLE(contenido_tipo text,propiedad_id uuid,proyecto_id uuid,slug text)
LANGUAGE plpgsql AS $$ DECLARE p public.propiedades%ROWTYPE; BEGIN
 IF $1 IN ('/','/propiedades','/proyectos') THEN RETURN QUERY SELECT 'general',NULL::uuid,NULL::uuid,NULL::text; RETURN; END IF;
 IF $1 ~ '^/propiedad\.html\?id=[0-9a-f-]{36}$' THEN
   SELECT * INTO p FROM public.propiedades WHERE id=split_part($1,'=',2)::uuid;
   IF NOT FOUND OR ($2 AND p.activa IS DISTINCT FROM true) THEN RAISE EXCEPTION 'E2_DESTINO_PROPIEDAD_INACTIVA'; END IF;
   RETURN QUERY SELECT 'propiedad',p.id,NULL::uuid,p.slug; RETURN;
 END IF;
 RAISE EXCEPTION 'E2_DESTINO_FORMA_NO_PERMITIDA';
END $$;
CREATE TABLE private.qr_ingresos_v1(id uuid PRIMARY KEY);
CREATE TABLE private.qr_campana_control_v1(
  campana_id uuid PRIMARY KEY REFERENCES public.campanas(id),
  version bigint NOT NULL DEFAULT 1,
  definicion_congelada_at timestamptz,
  congelada_por text,
  congelada_por_ingreso_id uuid,
  archivada_at timestamptz,
  updated_at timestamptz,
  ultimo_request_id uuid
);
\ir ../../worker/qr/sql/resolver-concurrency.sql
\ir ../../worker/qr/sql/resolver-read.sql
INSERT INTO public.canales VALUES ('00000000-0000-4000-8000-000000000001','punto_venta',true,'/');
INSERT INTO public.referencias VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','qa-test',true,'/');
SELECT set_config('request.method','POST',true);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.qr_resolver_anon_v1('qa-test');
 IF r IS DISTINCT FROM '{"ok":true,"tracked":false,"destino":"/","landing":null}'::jsonb THEN RAISE EXCEPTION 'base_failed: %',r; END IF;
 r:=private.qr_resolver_snapshot_v1('qa-test');
 IF r->>'resultado'<>'tracked'
   OR r->>'referencia_id'<>'00000000-0000-4000-8000-000000000002'
   OR r->>'canal_id'<>'00000000-0000-4000-8000-000000000001'
   OR r->>'destino_fuente'<>'base' OR r->>'pagina'<>'/'
   OR (r->>'resolved_at')::timestamptz IS NULL
   OR r->'campana_id'<>'null'::jsonb OR r->'alerta'<>'null'::jsonb THEN
   RAISE EXCEPTION 'private_snapshot_failed: %',r;
 END IF;
 IF public.qr_resolver_anon_v1('unknown')->>'ok' <> 'false' THEN RAISE EXCEPTION 'unknown_failed'; END IF;
 IF private.qr_resolver_snapshot_v1('unknown')->>'resultado' <> 'unknown_or_inactive' THEN RAISE EXCEPTION 'unknown_reason_failed'; END IF;
 IF public.qr_resolver_anon_v1(NULL)->>'ok' <> 'false' THEN RAISE EXCEPTION 'null_failed'; END IF;
 IF has_function_privilege('anon','public.qr_resolver_anon_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'premature_grant'; END IF;
END $$;
UPDATE public.referencias SET destino='/propiedades';
DO $$ BEGIN IF public.qr_resolver_anon_v1('qa-test')->>'ok' <> 'false' THEN RAISE EXCEPTION 'divergence_failed'; END IF; END $$;
UPDATE public.referencias SET destino='/';
INSERT INTO public.campanas VALUES ('00000000-0000-4000-8000-000000000003','/propiedades',true,now()-interval '1 hour',now()+interval '1 hour');
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM private.qr_campana_control_v1 WHERE campana_id='00000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'campaign_control_insert_failed'; END IF; END $$;
INSERT INTO public.campanas_canales SELECT id,'00000000-0000-4000-8000-000000000001'::uuid FROM public.campanas;
DO $$ DECLARE r jsonb; BEGIN
 r:=private.qr_resolver_snapshot_v1('qa-test');
 IF r->>'destino'<>'/propiedades' OR r->>'destino_fuente'<>'campana'
   OR r->>'campana_id'<>'00000000-0000-4000-8000-000000000003'
   OR r->>'pagina'<>'/propiedades' THEN RAISE EXCEPTION 'campaign_failed: %',r; END IF;
 IF public.qr_resolver_anon_v1('qa-test')->>'destino' <> '/propiedades' THEN RAISE EXCEPTION 'campaign_public_failed'; END IF;
END $$;
UPDATE public.canales SET tipo='inmobiliaria';
DO $$ BEGIN IF public.qr_resolver_anon_v1('qa-test')->>'destino' <> '/' THEN RAISE EXCEPTION 'active_override_failed'; END IF; END $$;
UPDATE public.canales SET tipo='punto_venta';
INSERT INTO public.campanas VALUES ('00000000-0000-4000-8000-000000000004','/proyectos',true,now()-interval '1 hour',now()+interval '1 hour');
INSERT INTO public.campanas_canales VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001');
DO $$ DECLARE r jsonb; BEGIN
 r:=private.qr_resolver_snapshot_v1('qa-test');
 IF r->>'destino'<>'/' OR r->>'destino_fuente'<>'base'
   OR r->>'alerta'<>'campaign_overlap_fallback' THEN RAISE EXCEPTION 'ambiguous_failed: %',r; END IF;
END $$;
UPDATE public.campanas SET activa=false WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE public.campanas SET url_destino='https://outside.invalid/' WHERE activa;
DO $$ DECLARE r jsonb; BEGIN
 r:=private.qr_resolver_snapshot_v1('qa-test');
 IF r->>'destino'<>'/' OR r->>'alerta'<>'campaign_destination_fallback' THEN RAISE EXCEPTION 'unsafe_override_failed: %',r; END IF;
END $$;
UPDATE public.campanas SET url_destino='/propiedades',fecha_fin=now()-interval '1 minute' WHERE activa;
DO $$ BEGIN IF public.qr_resolver_anon_v1('qa-test')->>'destino' <> '/' THEN RAISE EXCEPTION 'expired_override_failed'; END IF; END $$;
INSERT INTO public.propiedades VALUES ('00000000-0000-4000-8000-000000000005',true,'qa-fixture');
UPDATE public.canales SET tipo='inmobiliaria';
UPDATE public.referencias SET destino='/propiedad.html?id=00000000-0000-4000-8000-000000000005';
DO $$ BEGIN IF public.qr_resolver_anon_v1('qa-test')->>'destino' <> '/propiedad.html?id=00000000-0000-4000-8000-000000000005' THEN RAISE EXCEPTION 'property_failed'; END IF; END $$;
UPDATE public.propiedades SET activa=false;
DO $$ BEGIN IF public.qr_resolver_anon_v1('qa-test')->>'ok' <> 'false' THEN RAISE EXCEPTION 'inactive_property_failed'; END IF; END $$;
UPDATE public.canales SET activo=false;
DO $$ BEGIN
 IF public.qr_resolver_anon_v1('qa-test')->>'ok' <> 'false' THEN RAISE EXCEPTION 'inactive_failed'; END IF;
 IF private.qr_resolver_snapshot_v1('qa-test')->>'resultado'<>'channel_inactive' THEN RAISE EXCEPTION 'inactive_reason_failed'; END IF;
END $$;
SELECT set_config('request.method','GET',true);
DO $$ BEGIN
 BEGIN PERFORM public.qr_resolver_anon_v1('qa-test'); RAISE EXCEPTION 'method_failed';
 EXCEPTION WHEN SQLSTATE 'PGRST' THEN NULL; END;
END $$;
ROLLBACK;
\echo 'PASS local resolver fixture; not QA, not E2 concurrency validation'
