-- First step of a production retreat. Keep the new gate active until the
-- previous PUBLIC frontend has been deployed and verified. Never drop qr_*.
\set ON_ERROR_STOP on
\if :{?qr_cycle_id}
\else
  \quit 'qr_cycle_id is required'
\endif
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('qr.install.cycle_id',:'qr_cycle_id',false);
SELECT set_config('qr.install.connection_host',:'HOST',false);
SELECT set_config('qr.install.connection_user',:'USER',false);
SELECT pg_advisory_xact_lock(hashtextextended('qr-runtime-fence-v1/prod/1',0));

DO $restore_legacy$
DECLARE b auditoria_privada.qr_blindaje_v19_backups%ROWTYPE;
  p jsonb; roles_sql text; using_sql text:=''; check_sql text:=''; current_policy jsonb;
  v_count integer;
BEGIN
  IF current_setting('qr.install.connection_host') NOT IN (
      'db.wajkfydxutptcvvfwrvq.supabase.co',
      'aws-0-sa-east-1.pooler.supabase.com',
      'aws-0-us-east-1.pooler.supabase.com',
      'aws-0-us-east-2.pooler.supabase.com')
    OR (current_setting('qr.install.connection_host')='db.wajkfydxutptcvvfwrvq.supabase.co'
      AND current_setting('qr.install.connection_user')<>'postgres')
    OR (current_setting('qr.install.connection_host') LIKE '%.pooler.supabase.com'
      AND current_setting('qr.install.connection_user') NOT LIKE '%.wajkfydxutptcvvfwrvq') THEN
    RAISE EXCEPTION 'QR_PROD_IDENTITY_INVALID';
  END IF;
  SELECT * INTO STRICT b FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
    AND project_ref='wajkfydxutptcvvfwrvq' AND environment='prod'
    AND forward_completed_at IS NOT NULL AND rollback_completed_at IS NULL;
  IF NOT EXISTS(SELECT 1 FROM private.qr_runtime_gate_v1
      WHERE ambiente='prod' AND version=1 AND accepting AND motivo='active') THEN
    RAISE EXCEPTION 'QR_PROD_GATE_NOT_ACTIVE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.acl_snapshot) x
      WHERE x.value->>'grantee'='anon' AND x.value->>'table_name'='visitas'
        AND x.value->>'privilege'='INSERT')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.acl_snapshot) x
      WHERE x.value->>'grantee'='anon' AND x.value->>'table_name'='contactos'
        AND x.value->>'privilege'='INSERT') THEN
    RAISE EXCEPTION 'QR_PROD_LEGACY_INSERT_NOT_IN_BASELINE';
  END IF;
  p:=b.contactos_insertar_policy;
  IF p IS NULL THEN RAISE EXCEPTION 'QR_PROD_CONTACT_POLICY_SNAPSHOT_MISSING'; END IF;
  SELECT to_jsonb(x) INTO current_policy FROM pg_policies x
  WHERE x.schemaname='public' AND x.tablename='contactos'
    AND x.policyname='Insertar contactos';
  IF current_policy IS NOT NULL AND current_policy IS DISTINCT FROM p THEN
    RAISE EXCEPTION 'QR_PROD_CONTACT_POLICY_CHANGED';
  END IF;
  IF current_policy IS NULL THEN
    SELECT string_agg(CASE WHEN value='public' THEN 'PUBLIC' ELSE quote_ident(value) END,
      ', ' ORDER BY ordinality) INTO roles_sql
    FROM jsonb_array_elements_text(p->'roles') WITH ORDINALITY AS r(value,ordinality);
    IF roles_sql IS NULL THEN RAISE EXCEPTION 'QR_PROD_CONTACT_POLICY_ROLES_MISSING'; END IF;
    IF p->>'qual' IS NOT NULL THEN using_sql:=format(' USING (%s)',p->>'qual'); END IF;
    IF p->>'with_check' IS NOT NULL THEN check_sql:=format(' WITH CHECK (%s)',p->>'with_check'); END IF;
    EXECUTE format('CREATE POLICY %I ON public.contactos AS %s FOR %s TO %s%s%s',
      p->>'policyname',p->>'permissive',p->>'cmd',roles_sql,using_sql,check_sql);
  END IF;
  GRANT INSERT ON TABLE public.visitas,public.contactos TO anon;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(b.acl_snapshot) x
      WHERE x.value->>'grantee'='authenticated' AND x.value->>'table_name'='visitas'
        AND x.value->>'privilege'='INSERT') THEN
    GRANT INSERT ON TABLE public.visitas TO authenticated;
  END IF;
  IF NOT has_table_privilege('anon','public.visitas','INSERT')
    OR NOT has_table_privilege('anon','public.contactos','INSERT')
    OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='contactos' AND policyname='Insertar contactos') THEN
    RAISE EXCEPTION 'QR_PROD_LEGACY_RESTORE_FAILED';
  END IF;
  ALTER TABLE auditoria_privada.qr_blindaje_v19_backups
    ADD COLUMN IF NOT EXISTS prod_legacy_restored_at timestamptz;
  UPDATE auditoria_privada.qr_blindaje_v19_backups
    SET prod_legacy_restored_at=clock_timestamp()
    WHERE cycle_id=b.cycle_id AND prod_legacy_restored_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_PROD_LEGACY_RESTORE_REPLAY'; END IF;
END
$restore_legacy$;
COMMIT;
