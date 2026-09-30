-- Destructive only inside an empty, disposable local PostgreSQL database.
-- Never run against Supabase or any database containing user data.
\set ON_ERROR_STOP on
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
LANGUAGE plpgsql AS $$ BEGIN
 IF $1 IN ('/','/propiedades','/proyectos') THEN
   RETURN QUERY SELECT 'general',NULL::uuid,NULL::uuid,NULL::text; RETURN;
 END IF;
 RAISE EXCEPTION 'E2_DESTINO_FORMA_NO_PERMITIDA';
END $$;
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/rate-limit.sql
\ir ../../worker/qr/sql/resolver-concurrency.sql
\ir ../../worker/qr/sql/resolver-read.sql
\ir ../../worker/qr/sql/resolver-register-core.sql
INSERT INTO public.canales VALUES ('00000000-0000-4000-8000-000000000001','punto_venta',true,'/');
INSERT INTO public.referencias VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','qa-concurrent',true,'/');
