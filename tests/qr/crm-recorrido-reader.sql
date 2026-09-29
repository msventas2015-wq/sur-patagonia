-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA private;
CREATE TABLE public.personas(id uuid PRIMARY KEY);
CREATE TABLE public.contactos(
  id uuid PRIMARY KEY,persona_id uuid REFERENCES public.personas(id),fecha timestamptz,
  created_at timestamptz,estado text,origen text,propiedad_id uuid,proyecto_slug text,
  canal_ref text,canal_via text
);
CREATE TABLE public.crm_eventos(
  id uuid PRIMARY KEY,persona_id uuid,contacto_id uuid,fecha_evento timestamptz,
  created_at timestamptz,tipo_evento text,estado_anterior text,estado_nuevo text,
  origen text,actor_id uuid,propiedad_id uuid,proyecto_slug text,canal_ref text,
  canal_via text,nota text,metadata jsonb,fecha_programada timestamptz
);
CREATE TABLE public.visitas(
  id uuid PRIMARY KEY,pagina text,propiedad_id uuid
);
CREATE TABLE private.qr_ingresos_v1(
  id uuid PRIMARY KEY,event_seq bigint,referencia_id uuid,canal_id uuid,codigo text,
  via text,campana_id uuid,destino_efectivo text,pagina text,propiedad_id uuid,
  proyecto_id uuid,proyecto_slug_snapshot text,created_at timestamptz
);
CREATE TABLE private.qr_contactos_v1(
  contacto_id uuid,ingreso_id uuid,resultado text,event_at timestamptz
);
CREATE TABLE private.qr_navegaciones_v1(
  request_id uuid PRIMARY KEY,ingreso_id uuid,visita_id uuid,resultado text,created_at timestamptz
);
CREATE TABLE private.qr_aterrizajes_v1(
  ingreso_id uuid,pageview_request_id uuid,path text,propiedad_id uuid,proyecto_slug_snapshot text
);
CREATE TABLE private.qr_destino_cambios_v1(
  request_id uuid PRIMARY KEY,referencia_id uuid,canal_id uuid,destino_anterior text,
  destino_nuevo text,actor_user_id uuid,motivo text,mensaje_id uuid,created_at timestamptz
);
CREATE FUNCTION private.e2_es_admin_vivo_v6() RETURNS boolean
LANGUAGE sql STABLE AS $$SELECT true$$;

\ir ../../worker/qr/sql/crm-recorrido-reader.sql

INSERT INTO public.personas VALUES ('10000000-0000-4000-8000-000000000001');
INSERT INTO public.contactos VALUES
('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
 '2026-01-03 12:00+00','2026-01-03 12:00+00','nueva','web',NULL,NULL,'canal-a','qr');
INSERT INTO private.qr_ingresos_v1 VALUES
('10000000-0000-4000-8000-000000000003',1,'10000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000005','canal-a','qr',NULL,'/propiedades',
 '/propiedades',NULL,NULL,NULL,'2026-01-01 12:00+00');
INSERT INTO private.qr_contactos_v1 VALUES
('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
 'contacto_atribuido','2026-01-03 12:00+00');
INSERT INTO public.visitas VALUES
('10000000-0000-4000-8000-000000000007','/servicios',NULL);
INSERT INTO private.qr_navegaciones_v1 VALUES
('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000007','pageview_tracked','2026-01-02 12:00+00');
INSERT INTO public.crm_eventos VALUES
('10000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','2026-01-04 12:00+00','2026-01-04 12:00+00',
 'estado','nueva','contactado','admin','10000000-0000-4000-8000-000000000009',NULL,NULL,
 'canal-a','qr','Llamada realizada','{}',NULL);
INSERT INTO private.qr_destino_cambios_v1 VALUES
('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000004',
 '10000000-0000-4000-8000-000000000005','/propiedades','/proyectos',
 '10000000-0000-4000-8000-000000000009','Cambio validado',
 '10000000-0000-4000-8000-000000000011','2026-01-05 12:00+00');

DO $$
DECLARE r jsonb; c jsonb;
BEGIN
  r:=public.rpc_admin_recorrido_persona_v1(
    '10000000-0000-4000-8000-000000000001',NULL,NULL,3);
  IF jsonb_array_length(r->'items')<>3 OR (r->>'has_more')::boolean IS DISTINCT FROM true
    OR r#>>'{items,0,tipo}'<>'cambio_destino_qr'
    OR r#>>'{items,1,tipo}'<>'crm'
    OR r#>>'{items,2,tipo}'<>'consulta' THEN
    RAISE EXCEPTION 'first_page_invalid: %',r;
  END IF;
  c:=r->'next_cursor';
  r:=public.rpc_admin_recorrido_persona_v1(
    '10000000-0000-4000-8000-000000000001',
    (c->>'before_at')::timestamptz,c->>'before_key',3);
  IF jsonb_array_length(r->'items')<>2 OR (r->>'has_more')::boolean
    OR r#>>'{items,0,tipo}'<>'navegacion'
    OR r#>>'{items,0,detalle,pagina}'<>'/servicios'
    OR r#>>'{items,1,tipo}'<>'ingreso' THEN
    RAISE EXCEPTION 'second_page_invalid: %',r;
  END IF;
END $$;
ROLLBACK;
\echo 'PASS CRM QR journey reader and keyset pagination'
