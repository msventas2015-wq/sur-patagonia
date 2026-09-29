-- Production-only legacy-write cut. Run only after the new public release is
-- verified and old browser traffic has been quiet for at least 24 hours.
-- This transaction does not touch any QR ledger or business row.
\set ON_ERROR_STOP on
\if :{?qr_cycle_id}
\else
  \quit 'qr_cycle_id is required'
\endif
\if :{?qr_public_cut_at}
\else
  \quit 'qr_public_cut_at is required'
\endif
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('qr.install.cycle_id',:'qr_cycle_id',false);
SELECT set_config('qr.install.public_cut_at',:'qr_public_cut_at',false);
SELECT set_config('qr.install.connection_host',:'HOST',false);
SELECT set_config('qr.install.connection_user',:'USER',false);
SELECT pg_advisory_xact_lock(hashtextextended('qr-runtime-fence-v1/prod/1',0));

DO $harden_precheck$
DECLARE v_cut_at timestamptz; v_forward_at timestamptz; v_expected jsonb; v_current jsonb;
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
  SELECT forward_completed_at,contactos_insertar_policy
    INTO STRICT v_forward_at,v_expected
  FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
    AND project_ref='wajkfydxutptcvvfwrvq' AND environment='prod'
    AND forward_completed_at IS NOT NULL AND rollback_completed_at IS NULL;
  v_cut_at:=current_setting('qr.install.public_cut_at')::timestamptz;
  IF NOT isfinite(v_cut_at) OR v_cut_at<v_forward_at
    OR v_cut_at>clock_timestamp()-interval '24 hours' THEN
    RAISE EXCEPTION 'QR_PROD_PUBLIC_CUT_NOT_MATURE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.qr_runtime_gate_v1
      WHERE ambiente='prod' AND version=1 AND accepting AND motivo='active')
    OR NOT has_table_privilege('anon','public.visitas','INSERT')
    OR NOT has_table_privilege('anon','public.contactos','INSERT') THEN
    RAISE EXCEPTION 'QR_PROD_COMPATIBILITY_STATE_CHANGED';
  END IF;
  SELECT to_jsonb(p) INTO v_current FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename='contactos'
    AND p.policyname='Insertar contactos';
  IF v_current IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'QR_PROD_CONTACT_POLICY_CHANGED';
  END IF;
  -- A legacy browser contact has no server-side QR contact evidence.
  IF EXISTS(SELECT 1 FROM public.contactos c
      WHERE c.origen='web' AND c.created_at>=clock_timestamp()-interval '24 hours'
        AND NOT EXISTS(SELECT 1 FROM private.qr_contactos_v1 q
          WHERE q.contacto_id=c.id)) THEN
    RAISE EXCEPTION 'QR_PROD_LEGACY_CONTACTS_STILL_ARRIVING';
  END IF;
END
$harden_precheck$;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.visitas FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.contactos FROM anon;
DROP POLICY "Insertar contactos" ON public.contactos;
REVOKE INSERT ON TABLE public.visitas FROM authenticated;
REVOKE TRUNCATE ON TABLE public.visitas,public.contactos,public.personas,public.crm_eventos
  FROM anon,authenticated;

ALTER TABLE auditoria_privada.qr_blindaje_v19_backups
  ADD COLUMN IF NOT EXISTS prod_hardened_at timestamptz;
ALTER TABLE auditoria_privada.qr_blindaje_v19_backups
  ADD COLUMN IF NOT EXISTS prod_public_cut_at timestamptz;
UPDATE auditoria_privada.qr_blindaje_v19_backups
  SET prod_hardened_at=clock_timestamp(),
      prod_public_cut_at=current_setting('qr.install.public_cut_at')::timestamptz
WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
  AND prod_hardened_at IS NULL;

DO $harden_postcheck$
BEGIN
  IF has_table_privilege('anon','public.visitas','INSERT')
    OR has_table_privilege('anon','public.contactos','INSERT')
    OR has_table_privilege('anon','public.visitas','TRUNCATE')
    OR has_table_privilege('authenticated','public.visitas','TRUNCATE')
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='contactos' AND policyname='Insertar contactos')
    OR NOT EXISTS(SELECT 1 FROM auditoria_privada.qr_blindaje_v19_backups
      WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
        AND prod_hardened_at IS NOT NULL) THEN
    RAISE EXCEPTION 'QR_PROD_HARDEN_POSTCHECK_FAILED';
  END IF;
END
$harden_postcheck$;
COMMIT;
