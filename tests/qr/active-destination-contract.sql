-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE
AS $$SELECT public.digest($1,$2)$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TYPE public.tipo_canal AS ENUM ('punto_venta','inmobiliaria','particular');
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.canales(id uuid PRIMARY KEY,codigo text,tipo public.tipo_canal,
  activo boolean,destino text,user_id uuid);
CREATE TABLE public.referencias(id uuid PRIMARY KEY,canal_id uuid REFERENCES public.canales(id),
  codigo text,activo boolean,destino text);
CREATE TABLE public.referencia_propiedad(referencia_id uuid,propiedad_id uuid,
  PRIMARY KEY(referencia_id,propiedad_id));
CREATE TABLE public.referencia_proyecto(referencia_id uuid,proyecto_id uuid,
  PRIMARY KEY(referencia_id,proyecto_id));
CREATE TABLE public.mensajes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),asunto text,cuerpo text,
  usuario_id uuid,canal_ids jsonb);
CREATE TABLE private.e2_contextos_v6(
  txid bigint PRIMARY KEY,token uuid,operacion text
);
CREATE FUNCTION public.es_canal_pasivo(public.tipo_canal) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$SELECT $1 NOT IN ('inmobiliaria','particular')$$;
CREATE FUNCTION private.e2_es_admin_vivo_v6() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE FUNCTION private.e2_clasificar_destino_v6(text,boolean)
RETURNS TABLE(contenido_tipo text,propiedad_id uuid,proyecto_id uuid,slug text)
LANGUAGE sql STABLE AS $$SELECT 'general',NULL::uuid,NULL::uuid,NULL::text
  WHERE $1 IN ('/','/propiedades','/proyectos')$$;
CREATE FUNCTION private.e2_contexto_abrir_v6(uuid,uuid,text,boolean) RETURNS uuid
LANGUAGE sql VOLATILE AS $$SELECT gen_random_uuid()$$;
CREATE FUNCTION private.e2_sync_relaciones_ref_v6(uuid,text,boolean) RETURNS void
LANGUAGE sql VOLATILE AS $$SELECT$$;
CREATE FUNCTION private.e2_assert_global_v6() RETURNS void LANGUAGE sql STABLE AS $$SELECT$$;
CREATE FUNCTION private.e2_assert_journal_v6() RETURNS void LANGUAGE sql STABLE AS $$SELECT$$;
CREATE FUNCTION private.qr_append_only_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'QR_LEDGER_APPEND_ONLY'; END$$;

\ir ../../worker/qr/sql/active-destination-contract.sql

INSERT INTO auth.users VALUES
  ('00000000-0000-4000-8000-000000000010'),
  ('00000000-0000-4000-8000-000000000011');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true);
INSERT INTO public.canales VALUES
  ('00000000-0000-4000-8000-000000000020','activo-test','inmobiliaria',true,'/',
   '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000021','pasivo-test','punto_venta',true,'/',
   '00000000-0000-4000-8000-000000000011');
INSERT INTO public.referencias VALUES
  ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020',
   'ref-activa',true,'/'),
  ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000021',
   'ref-pasiva',true,'/');

DO $$
BEGIN
  BEGIN
    UPDATE public.referencias SET destino='/propiedades'
      WHERE id='00000000-0000-4000-8000-000000000030';
    RAISE EXCEPTION 'direct_active_change_was_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_DESTINO_ACTIVO_REQUIERE_PROCESO_EXCEPCIONAL' THEN RAISE; END IF;
  END;
END$$;

DO $$
DECLARE p jsonb; r jsonb; before_hash text;
BEGIN
  p:=public.qr_destino_activo_preparar_v1(
    '00000000-0000-4000-8000-000000000040',
    '00000000-0000-4000-8000-000000000030','/propiedades',
    'La propiedad cambio de estrategia comercial'
  );
  before_hash:=p->>'before_sha256';
  IF before_hash !~ '^[0-9a-f]{64}$' OR p->>'destino_anterior'<>'/' THEN
    RAISE EXCEPTION 'preview_invalid: %',p;
  END IF;
  BEGIN
    PERFORM public.qr_destino_activo_aplicar_v1(
      '00000000-0000-4000-8000-000000000040',before_hash,false);
    RAISE EXCEPTION 'missing_acceptance_was_allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_DESTINO_ACTIVO_ACEPTACION_REQUERIDA' THEN RAISE; END IF;
  END;
  r:=public.qr_destino_activo_aplicar_v1(
    '00000000-0000-4000-8000-000000000040',before_hash,true);
  IF r->>'ok'<>'true' OR r->>'idempotente'<>'false' THEN RAISE EXCEPTION 'apply_invalid: %',r; END IF;
  IF (SELECT destino FROM public.referencias WHERE id='00000000-0000-4000-8000-000000000030')<>'/propiedades'
    OR (SELECT count(*) FROM private.qr_destino_cambios_v1)<>1
    OR (SELECT count(*) FROM public.mensajes WHERE usuario_id='00000000-0000-4000-8000-000000000011'
      AND canal_ids='["00000000-0000-4000-8000-000000000020"]'::jsonb)<>1 THEN
    RAISE EXCEPTION 'atomic_change_or_message_missing';
  END IF;
  r:=public.qr_destino_activo_aplicar_v1(
    '00000000-0000-4000-8000-000000000040',before_hash,true);
  IF r->>'idempotente'<>'true' OR (SELECT count(*) FROM public.mensajes)<>1 THEN
    RAISE EXCEPTION 'idempotency_failed: %',r;
  END IF;
END$$;

DO $$ BEGIN
  BEGIN
    UPDATE private.qr_destino_cambios_v1 SET motivo='alterado';
    RAISE EXCEPTION 'immutable_event_was_mutable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
END$$;
ROLLBACK;
\echo 'PASS active destination exceptional contract'
