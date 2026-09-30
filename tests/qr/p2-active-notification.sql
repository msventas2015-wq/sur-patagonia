-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.es_canal_pasivo(text) RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$SELECT $1='pasivo'$$;
CREATE FUNCTION private.e2_es_admin_vivo_v6() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE FUNCTION private.e2_clasificar_destino_v6(text,boolean) RETURNS TABLE(destino text)
LANGUAGE sql STABLE AS $$SELECT $1$$;
CREATE FUNCTION private.e2_sync_relaciones_ref_v6(uuid,text,boolean) RETURNS void
LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION private.e2_assert_global_v6() RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION private.e2_assert_journal_v6() RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION private.e2_contexto_abrir_v6(uuid,uuid,text,boolean) RETURNS void
LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION private.qr_append_only_guard_v1() RETURNS trigger
LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'QR_LEDGER_APPEND_ONLY'; END$$;

CREATE TABLE public.canales(
  id uuid PRIMARY KEY,codigo text,tipo text,activo boolean,user_id uuid
);
CREATE TABLE public.referencias(
  id uuid PRIMARY KEY,canal_id uuid REFERENCES public.canales(id),codigo text,
  activo boolean,destino text
);
CREATE TABLE public.referencia_propiedad(referencia_id uuid,propiedad_id uuid);
CREATE TABLE public.referencia_proyecto(referencia_id uuid,proyecto_id uuid);
CREATE TABLE public.mensajes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),asunto text,cuerpo text,
  usuario_id uuid,canal_ids jsonb
);
CREATE TABLE private.e2_contextos_v6(
  txid bigint,token uuid,operacion text
);

CREATE FUNCTION public.p2_refs_propiedad(uuid) RETURNS TABLE(referencia_id uuid)
LANGUAGE sql STABLE AS $$SELECT rp.referencia_id FROM public.referencia_propiedad rp WHERE rp.propiedad_id=$1$$;
CREATE FUNCTION public.p2_refs_proyecto(uuid) RETURNS TABLE(referencia_id uuid)
LANGUAGE sql STABLE AS $$SELECT rp.referencia_id FROM public.referencia_proyecto rp WHERE rp.proyecto_id=$1$$;
CREATE FUNCTION public.p2_guardar_manifestar_y_mover(text,uuid,text,text) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE v_token uuid:=gen_random_uuid();
BEGIN
  PERFORM set_config('surpatagonian.e2_token',v_token::text,true);
  INSERT INTO private.e2_contextos_v6 VALUES(
    txid_current(),v_token,CASE $1 WHEN 'propiedad' THEN 'p2_archivar_propiedad' ELSE 'p2_archivar_proyecto' END);
  IF $1='propiedad' THEN
    UPDATE public.referencias SET destino='/'
    WHERE id IN (SELECT referencia_id FROM public.p2_refs_propiedad($2));
  ELSE
    UPDATE public.referencias SET destino='/'
    WHERE id IN (SELECT referencia_id FROM public.p2_refs_proyecto($2));
  END IF;
  RETURN jsonb_build_object('ok',true);
END
$fn$;

\ir ../../worker/qr/sql/active-destination-contract.sql
\ir ../../worker/qr/sql/p2-active-notification.sql

SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
INSERT INTO public.canales VALUES
('20000000-0000-4000-8000-000000000002','activo-a','activo',true,
 '20000000-0000-4000-8000-000000000003');
INSERT INTO public.referencias VALUES
('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002',
 'qr-activo-a',true,'/propiedad.html?id=20000000-0000-4000-8000-000000000005');
INSERT INTO public.referencia_propiedad VALUES
('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005');

DO $$
DECLARE r jsonb;
BEGIN
  r:=public.admin_archivar_propiedad(
    '20000000-0000-4000-8000-000000000005','Archivado validado en prueba local','digest-local');
  IF r->>'ok'<>'true' OR (r->>'canales_activos_notificados')::integer<>1
    OR (SELECT destino FROM public.referencias WHERE id='20000000-0000-4000-8000-000000000004')<>'/'
    OR (SELECT count(*) FROM private.qr_destino_cambios_v1)<>1
    OR (SELECT count(*) FROM public.mensajes
        WHERE usuario_id='20000000-0000-4000-8000-000000000003'
          AND canal_ids='["20000000-0000-4000-8000-000000000002"]'::jsonb)<>1 THEN
    RAISE EXCEPTION 'p2_active_notification_failed:%',r;
  END IF;
END $$;
ROLLBACK;
\echo 'PASS P2 active archival keeps guard and emits targeted immutable notification'
