-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.propiedades(id uuid PRIMARY KEY,activa boolean NOT NULL);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,estado text NOT NULL);
\ir ../../worker/qr/sql/pageview-classifier.sql

DO $test$
DECLARE
  v_active uuid:='00000000-0000-4000-8000-000000000001';
  v_inactive uuid:='00000000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.propiedades VALUES(v_active,true),(v_inactive,false);
  INSERT INTO public.proyectos VALUES
    ('00000000-0000-4000-8000-000000000003','vigente','activo'),
    ('00000000-0000-4000-8000-000000000004','archivado','archivado');

  IF NOT (SELECT bool_and(private.qr_pagina_clasificar_v1(path,NULL,NULL))
    FROM (VALUES ('/'),('/propiedades'),('/proyectos'),('/servicios')) AS v(path)) THEN
    RAISE EXCEPTION 'general_page_rejected';
  END IF;
  IF private.qr_pagina_clasificar_v1('/',v_active,NULL)
    OR private.qr_pagina_clasificar_v1('/propiedades',NULL,'vigente')
    OR private.qr_pagina_clasificar_v1('/propiedad',NULL,NULL)
    OR private.qr_pagina_clasificar_v1('/propiedad',v_inactive,NULL)
    OR private.qr_pagina_clasificar_v1('/propiedad',v_active,'vigente')
    OR private.qr_pagina_clasificar_v1('/propiedad.html',v_active,NULL)
    OR private.qr_pagina_clasificar_v1('/admin',NULL,NULL)
    OR private.qr_pagina_clasificar_v1(NULL,NULL,NULL) THEN
    RAISE EXCEPTION 'invalid_path_or_content_accepted';
  END IF;
  IF NOT private.qr_pagina_clasificar_v1('/propiedad',v_active,NULL)
    OR NOT private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,'vigente') THEN
    RAISE EXCEPTION 'active_content_rejected';
  END IF;
  IF private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,'archivado')
    OR private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,'inexistente')
    OR private.qr_pagina_clasificar_v1('/proyecto-mini',v_active,'vigente')
    OR private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,'VIGENTE')
    OR private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,repeat('a',121))
    OR private.qr_pagina_clasificar_v1('/proyecto-mini',NULL,'vigente/') THEN
    RAISE EXCEPTION 'invalid_project_accepted';
  END IF;
  IF has_function_privilege('anon','private.qr_pagina_clasificar_v1(text,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','private.qr_pagina_clasificar_v1(text,uuid,text)','EXECUTE')
    OR has_function_privilege('service_role','private.qr_pagina_clasificar_v1(text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'premature_runtime_grant';
  END IF;
END
$test$;
ROLLBACK;
\echo 'PASS local pageview classifier fixture; not QA and no runtime wrapper installed'
