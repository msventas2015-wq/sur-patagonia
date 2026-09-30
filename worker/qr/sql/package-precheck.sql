-- QA-ONLY PRECHECK AND EXACT CAPTURE FOR BLINDAJE QR V1.9.
-- Required psql variables: qr_project_ref, qr_environment and qr_cycle_id.
-- HOST and USER are psql connection variables resolved from the effective
-- libpq connection, not values supplied by the runner.
-- This file records evidence only; the product schema is changed by the
-- component files that follow it in package-forward.sql.

\if :{?qr_project_ref}
\else
  \quit 'qr_project_ref is required'
\endif
\if :{?qr_environment}
\else
  \quit 'qr_environment is required'
\endif
\if :{?qr_cycle_id}
\else
  \quit 'qr_cycle_id is required'
\endif
SELECT set_config('qr.install.project_ref', :'qr_project_ref', false);
SELECT set_config('qr.install.environment', :'qr_environment', false);
SELECT set_config('qr.install.cycle_id', :'qr_cycle_id', false);
SELECT set_config('qr.install.connection_host', :'HOST', false);
SELECT set_config('qr.install.connection_user', :'USER', false);

DO $preflight$
BEGIN
  IF current_setting('qr.install.project_ref') IS DISTINCT FROM 'rsjwqmpseknvydistgfr'
    OR current_setting('qr.install.environment') IS DISTINCT FROM 'qa'
    OR current_setting('qr.install.connection_host') NOT IN (
      'db.rsjwqmpseknvydistgfr.supabase.co',
      'aws-0-sa-east-1.pooler.supabase.com',
      'aws-0-us-east-1.pooler.supabase.com',
      'aws-0-us-east-2.pooler.supabase.com'
    )
    OR (
      current_setting('qr.install.connection_host')='db.rsjwqmpseknvydistgfr.supabase.co'
      AND current_setting('qr.install.connection_user')<>'postgres'
    )
    OR (
      current_setting('qr.install.connection_host') LIKE '%.pooler.supabase.com'
      AND current_setting('qr.install.connection_user') NOT LIKE '%.rsjwqmpseknvydistgfr'
    ) THEN
    RAISE EXCEPTION 'QR_INSTALL_QA_IDENTITY_INVALID';
  END IF;
  IF current_setting('qr.install.cycle_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'QR_INSTALL_CYCLE_INVALID';
  END IF;
  IF to_regprocedure('public.p2_guardar_manifestar_y_mover(text,uuid,text,text)') IS NULL
    OR encode(extensions.digest(convert_to((SELECT prosrc FROM pg_proc
      WHERE oid='public.p2_guardar_manifestar_y_mover(text,uuid,text,text)'::regprocedure),'UTF8'),'sha256'),'hex')
      IS DISTINCT FROM '73a115afce098bf9a0c1a805df4353fbefd6e60600791c61cf79eb6284bddab2'
    OR NOT EXISTS(SELECT 1 FROM private.e2_etapas_v62 WHERE etapa='04')
    OR private.e2_enforcement_v6() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'QR_INSTALL_E2_P2_BASELINE_CHANGED';
  END IF;
  IF encode(extensions.digest(convert_to(
      pg_get_functiondef('public.validar_canal_ref()'::regprocedure),'UTF8'),'sha256'),'hex')
      IS DISTINCT FROM '1288df8edfda49d367c38c5320be5cba432ac80a4a23bf34bcc2eb376998c530'
    OR encode(extensions.digest(convert_to(
      pg_get_functiondef('public.contactos_resolver_persona()'::regprocedure),'UTF8'),'sha256'),'hex')
      IS DISTINCT FROM '2ed35e3916c9384e39056fc605f26f92bae5ed741ff285f6df21034b1dc533ea' THEN
    RAISE EXCEPTION 'QR_INSTALL_CONTACT_FUNCTION_BASELINE_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('private','public')
        AND (p.proname LIKE 'qr\_%\_v1' ESCAPE E'\\'
          OR p.proname='rpc_admin_recorrido_persona_v1'))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='private' AND c.relname LIKE 'qr\_%\_v1' ESCAPE E'\\') THEN
    RAISE EXCEPTION 'QR_INSTALL_NOMINAL_OBJECT_ALREADY_EXISTS';
  END IF;
  IF EXISTS(SELECT 1 FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
      WHERE public.es_canal_pasivo(c.tipo) AND r.destino IS DISTINCT FROM c.destino) THEN
    RAISE EXCEPTION 'QR_INSTALL_PASSIVE_DESTINATION_DIVERGENCE';
  END IF;
  IF EXISTS(SELECT 1 FROM public.referencias WHERE codigo !~ '^[a-z0-9-]{2,80}$'
      OR codigo LIKE '-%' OR codigo LIKE '%-') THEN
    RAISE EXCEPTION 'QR_INSTALL_CODE_GRAMMAR_INVALID';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='contactos'
        AND policyname='Insertar contactos')<>1 THEN
    RAISE EXCEPTION 'QR_INSTALL_CONTACT_POLICY_BASELINE_CHANGED';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS auditoria_privada;
CREATE TABLE IF NOT EXISTS auditoria_privada.qr_blindaje_v19_backups (
  cycle_id uuid PRIMARY KEY,
  project_ref text NOT NULL,
  environment text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  validar_canal_ref_def text NOT NULL,
  contactos_resolver_persona_def text NOT NULL,
  admin_archivar_propiedad_def text NOT NULL,
  admin_archivar_proyecto_def text NOT NULL,
  contactos_email_not_null boolean NOT NULL,
  acl_snapshot jsonb NOT NULL,
  contactos_insertar_policy jsonb NOT NULL,
  campaign_ids uuid[] NOT NULL,
  business_snapshot jsonb NOT NULL,
  forward_completed_at timestamptz NULL,
  rollback_completed_at timestamptz NULL,
  reapplied_from uuid NULL
);
ALTER TABLE auditoria_privada.qr_blindaje_v19_backups
  ADD COLUMN IF NOT EXISTS contactos_insertar_policy jsonb;
REVOKE ALL ON TABLE auditoria_privada.qr_blindaje_v19_backups
  FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO auditoria_privada.qr_blindaje_v19_backups(
  cycle_id,project_ref,environment,validar_canal_ref_def,
  contactos_resolver_persona_def,admin_archivar_propiedad_def,
  admin_archivar_proyecto_def,contactos_email_not_null,acl_snapshot,
  contactos_insertar_policy,campaign_ids,business_snapshot
)
SELECT
  :'qr_cycle_id'::uuid,:'qr_project_ref',:'qr_environment',
  pg_get_functiondef('public.validar_canal_ref()'::regprocedure),
  pg_get_functiondef('public.contactos_resolver_persona()'::regprocedure),
  pg_get_functiondef('public.admin_archivar_propiedad(uuid,text,text)'::regprocedure),
  pg_get_functiondef('public.admin_archivar_proyecto(uuid,text,text)'::regprocedure),
  (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.contactos'::regclass
    AND attname='email' AND NOT attisdropped),
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'table_name',c.relname,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,
      'privilege',x.privilege_type,'grantable',x.is_grantable
    ) ORDER BY c.relname,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE r.rolname END,x.privilege_type),'[]'::jsonb)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
   LEFT JOIN pg_roles r ON r.oid=x.grantee
   WHERE n.nspname='public' AND c.relname IN ('visitas','contactos','personas','crm_eventos')
     AND (x.grantee=0 OR r.rolname IN ('anon','authenticated','service_role'))),
  (SELECT to_jsonb(p) FROM pg_policies p
   WHERE p.schemaname='public' AND p.tablename='contactos'
     AND p.policyname='Insertar contactos'),
  (SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) FROM public.campanas),
  jsonb_build_object(
    'canales',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.canales c),'[]'::jsonb),
    'referencias',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.referencias r),'[]'::jsonb),
    'referencia_propiedad',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.propiedad_id) FROM public.referencia_propiedad x),'[]'::jsonb),
    'referencia_proyecto',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.proyecto_id) FROM public.referencia_proyecto x),'[]'::jsonb),
    'campanas',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.campanas c),'[]'::jsonb),
    'campanas_canales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.campana_id,x.canal_id) FROM public.campanas_canales x),'[]'::jsonb)
  );

DO $policy_snapshot_check$
BEGIN
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='contactos'
        AND policyname='Insertar contactos')<>1
    OR EXISTS(
      SELECT 1 FROM auditoria_privada.qr_blindaje_v19_backups
      WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
        AND contactos_insertar_policy IS NULL
    ) THEN
    RAISE EXCEPTION 'QR_INSTALL_CONTACT_POLICY_BASELINE_CHANGED';
  END IF;
END
$policy_snapshot_check$;
