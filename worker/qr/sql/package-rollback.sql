-- QA-ONLY EXACT ROLLBACK FOR AN UNUSED/TRANSACTIONALLY-TESTED INSTALL.
-- It deliberately aborts if committed QR business rows exist. A future
-- production rollback must preserve/export those rows and is not this script.
\set ON_ERROR_STOP on
\if :{?qr_cycle_id}
\else
  \quit 'qr_cycle_id is required'
\endif
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('qr.install.project_ref','rsjwqmpseknvydistgfr',false);
SELECT set_config('qr.install.environment','qa',false);
SELECT set_config('qr.install.cycle_id',:'qr_cycle_id',false);
SELECT pg_advisory_xact_lock(hashtextextended('qr-runtime-fence-v1/qa/1',0));
SELECT pg_advisory_xact_lock(20260812,2);

DO $rollback_precheck$
DECLARE v_count bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auditoria_privada.qr_blindaje_v19_backups b
      WHERE b.cycle_id=current_setting('qr.install.cycle_id')::uuid
        AND b.project_ref='rsjwqmpseknvydistgfr' AND b.environment='qa'
        AND b.forward_completed_at IS NOT NULL AND b.rollback_completed_at IS NULL) THEN
    RAISE EXCEPTION 'QR_ROLLBACK_BACKUP_INVALID';
  END IF;
  UPDATE private.qr_runtime_gate_v1
    SET accepting=false,motivo='rollback',changed_at=clock_timestamp()
    WHERE ambiente='qa' AND version=1;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_ROLLBACK_GATE_MISSING'; END IF;
  IF EXISTS(SELECT 1 FROM private.qr_resoluciones_v1)
    OR EXISTS(SELECT 1 FROM private.qr_ingresos_v1)
    OR EXISTS(SELECT 1 FROM private.qr_consulta_requests_v1)
    OR EXISTS(SELECT 1 FROM private.qr_contactos_v1)
    OR EXISTS(SELECT 1 FROM private.qr_navegaciones_v1)
    OR EXISTS(SELECT 1 FROM private.qr_aterrizajes_v1)
    OR EXISTS(SELECT 1 FROM private.qr_destino_cambios_v1) THEN
    RAISE EXCEPTION 'QR_ROLLBACK_COMMITTED_BUSINESS_ROWS_REQUIRE_PRESERVATION_PLAN';
  END IF;
END
$rollback_precheck$;

DROP TRIGGER IF EXISTS qr_destino_activo_guard_v1 ON public.referencias;
DROP TRIGGER IF EXISTS qr_visita_enlazada_guard_v1 ON public.visitas;
DROP TRIGGER IF EXISTS qr_referencia_insert_lock_v1 ON public.referencias;
DROP TRIGGER IF EXISTS qr_propiedad_insert_lock_v1 ON public.propiedades;
DROP TRIGGER IF EXISTS qr_proyecto_insert_lock_v1 ON public.proyectos;
DROP TRIGGER IF EXISTS qr_campana_link_insert_lock_v1 ON public.campanas_canales;
DROP TRIGGER IF EXISTS qr_campana_control_insert_v1 ON public.campanas;

DO $drop_qr_relations$
DECLARE r record; v_kind text;
BEGIN
  FOR r IN
    SELECT n.nspname,c.relname,c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relname LIKE 'qr\_%\_v1' ESCAPE E'\\'
      AND c.relkind IN ('v','m','r','p','S')
    ORDER BY CASE c.relkind WHEN 'v' THEN 1 WHEN 'm' THEN 1 WHEN 'r' THEN 2
      WHEN 'p' THEN 2 WHEN 'S' THEN 3 END,c.relname
  LOOP
    v_kind:=CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
      WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END;
    EXECUTE format('DROP %s IF EXISTS %I.%I CASCADE',v_kind,r.nspname,r.relname);
  END LOOP;
END
$drop_qr_relations$;

DO $drop_qr_functions$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('private','public')
      AND (p.proname LIKE 'qr\_%\_v1' ESCAPE E'\\'
        OR p.proname='rpc_admin_recorrido_persona_v1')
    ORDER BY n.nspname,p.proname,p.oid
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE',r.signature);
  END LOOP;
END
$drop_qr_functions$;

DO $restore_live_functions$
DECLARE b auditoria_privada.qr_blindaje_v19_backups%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM auditoria_privada.qr_blindaje_v19_backups
    WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  EXECUTE b.validar_canal_ref_def;
  EXECUTE b.contactos_resolver_persona_def;
  EXECUTE b.admin_archivar_propiedad_def;
  EXECUTE b.admin_archivar_proyecto_def;
  IF b.contactos_email_not_null THEN
    IF EXISTS(SELECT 1 FROM public.contactos WHERE email IS NULL) THEN
      RAISE EXCEPTION 'QR_ROLLBACK_CONTACT_EMAIL_NULL_ROWS';
    END IF;
    ALTER TABLE public.contactos ALTER COLUMN email SET NOT NULL;
  END IF;
END
$restore_live_functions$;

DO $restore_acl$
DECLARE b jsonb; item jsonb; role_name text; table_name text; privilege_name text;
BEGIN
  SELECT acl_snapshot INTO STRICT b FROM auditoria_privada.qr_blindaje_v19_backups
    WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  REVOKE ALL ON TABLE public.visitas,public.contactos,public.personas,public.crm_eventos
    FROM PUBLIC,anon,authenticated,service_role;
  FOR item IN SELECT value FROM jsonb_array_elements(b)
  LOOP
    role_name:=item->>'grantee'; table_name:=item->>'table_name';
    privilege_name:=item->>'privilege';
    EXECUTE format('GRANT %s ON TABLE public.%I TO %s%s',
      privilege_name,table_name,
      CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END,
      CASE WHEN (item->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
END
$restore_acl$;

DO $restore_contact_policy$
DECLARE
  p jsonb;
  roles_sql text;
  using_sql text:='';
  check_sql text:='';
BEGIN
  SELECT contactos_insertar_policy INTO STRICT p
  FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  IF p IS NULL THEN
    RAISE EXCEPTION 'QR_ROLLBACK_CONTACT_POLICY_SNAPSHOT_MISSING';
  END IF;
  SELECT string_agg(
    CASE WHEN value='public' THEN 'PUBLIC' ELSE quote_ident(value) END,', '
    ORDER BY ordinality
  ) INTO roles_sql
  FROM jsonb_array_elements_text(p->'roles') WITH ORDINALITY AS r(value,ordinality);
  IF roles_sql IS NULL THEN
    RAISE EXCEPTION 'QR_ROLLBACK_CONTACT_POLICY_ROLES_MISSING';
  END IF;
  IF p->>'qual' IS NOT NULL THEN
    using_sql:=format(' USING (%s)',p->>'qual');
  END IF;
  IF p->>'with_check' IS NOT NULL THEN
    check_sql:=format(' WITH CHECK (%s)',p->>'with_check');
  END IF;
  DROP POLICY IF EXISTS "Insertar contactos" ON public.contactos;
  EXECUTE format('CREATE POLICY %I ON public.contactos AS %s FOR %s TO %s%s%s',
    p->>'policyname',p->>'permissive',p->>'cmd',roles_sql,using_sql,check_sql);
END
$restore_contact_policy$;

DO $rollback_compare$
DECLARE v_expected jsonb; v_current jsonb; v_policy_expected jsonb;
  v_policy_current jsonb; v_count integer;
BEGIN
  SELECT business_snapshot INTO STRICT v_expected
  FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  SELECT jsonb_build_object(
    'canales',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.canales c),'[]'::jsonb),
    'referencias',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.referencias r),'[]'::jsonb),
    'referencia_propiedad',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.propiedad_id) FROM public.referencia_propiedad x),'[]'::jsonb),
    'referencia_proyecto',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.proyecto_id) FROM public.referencia_proyecto x),'[]'::jsonb),
    'campanas',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.campanas c),'[]'::jsonb),
    'campanas_canales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.campana_id,x.canal_id) FROM public.campanas_canales x),'[]'::jsonb)
  ) INTO v_current;
  IF v_current IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'QR_ROLLBACK_BUSINESS_MISMATCH'; END IF;
  SELECT contactos_insertar_policy INTO STRICT v_policy_expected
  FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  SELECT to_jsonb(p) INTO v_policy_current FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename='contactos'
    AND p.policyname='Insertar contactos';
  IF v_policy_current IS DISTINCT FROM v_policy_expected THEN
    RAISE EXCEPTION 'QR_ROLLBACK_CONTACT_POLICY_MISMATCH';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('private','public')
        AND (p.proname LIKE 'qr\_%\_v1' ESCAPE E'\\'
          OR p.proname='rpc_admin_recorrido_persona_v1'))
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='private' AND c.relname LIKE 'qr\_%\_v1' ESCAPE E'\\') THEN
    RAISE EXCEPTION 'QR_ROLLBACK_OBJECT_RESIDUE';
  END IF;
  UPDATE auditoria_privada.qr_blindaje_v19_backups
    SET rollback_completed_at=clock_timestamp()
    WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
      AND rollback_completed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_ROLLBACK_MARK_FAILED'; END IF;
END
$rollback_compare$;
COMMIT;
