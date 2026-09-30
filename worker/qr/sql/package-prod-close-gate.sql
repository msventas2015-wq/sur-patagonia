-- Final step of a production retreat after the previous PUBLIC frontend is
-- online. This closes V1 writers but preserves every business and ledger row.
\set ON_ERROR_STOP on
\if :{?qr_cycle_id}
\else
  \quit 'qr_cycle_id is required'
\endif
\if :{?qr_public_reverted}
\else
  \quit 'qr_public_reverted=YES is required'
\endif
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('qr.install.cycle_id',:'qr_cycle_id',false);
SELECT set_config('qr.install.public_reverted',:'qr_public_reverted',false);
SELECT set_config('qr.install.connection_host',:'HOST',false);
SELECT set_config('qr.install.connection_user',:'USER',false);
SELECT pg_advisory_xact_lock(hashtextextended('qr-runtime-fence-v1/prod/1',0));

DO $close_gate$
DECLARE v_counts_before jsonb; v_counts_after jsonb; v_count integer;
BEGIN
  IF current_setting('qr.install.public_reverted') IS DISTINCT FROM 'YES'
    OR current_setting('qr.install.connection_host') NOT IN (
      'db.wajkfydxutptcvvfwrvq.supabase.co',
      'aws-0-sa-east-1.pooler.supabase.com',
      'aws-0-us-east-1.pooler.supabase.com',
      'aws-0-us-east-2.pooler.supabase.com')
    OR (current_setting('qr.install.connection_host')='db.wajkfydxutptcvvfwrvq.supabase.co'
      AND current_setting('qr.install.connection_user')<>'postgres')
    OR (current_setting('qr.install.connection_host') LIKE '%.pooler.supabase.com'
      AND current_setting('qr.install.connection_user') NOT LIKE '%.wajkfydxutptcvvfwrvq') THEN
    RAISE EXCEPTION 'QR_PROD_RETREAT_IDENTITY_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auditoria_privada.qr_blindaje_v19_backups
      WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
        AND project_ref='wajkfydxutptcvvfwrvq' AND environment='prod'
        AND forward_completed_at IS NOT NULL AND rollback_completed_at IS NULL
        AND prod_legacy_restored_at IS NOT NULL)
    OR NOT has_table_privilege('anon','public.visitas','INSERT')
    OR NOT has_table_privilege('anon','public.contactos','INSERT')
    OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='contactos' AND policyname='Insertar contactos') THEN
    RAISE EXCEPTION 'QR_PROD_LEGACY_PATH_NOT_RESTORED';
  END IF;
  SELECT jsonb_build_object(
    'resoluciones',(SELECT count(*) FROM private.qr_resoluciones_v1),
    'ingresos',(SELECT count(*) FROM private.qr_ingresos_v1),
    'consultas',(SELECT count(*) FROM private.qr_contactos_v1),
    'navegaciones',(SELECT count(*) FROM private.qr_navegaciones_v1),
    'aterrizajes',(SELECT count(*) FROM private.qr_aterrizajes_v1),
    'destino_cambios',(SELECT count(*) FROM private.qr_destino_cambios_v1)) INTO v_counts_before;
  UPDATE private.qr_runtime_gate_v1
    SET accepting=false,motivo='rollback',changed_at=clock_timestamp()
  WHERE ambiente='prod' AND version=1 AND accepting AND motivo='active';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_PROD_ACTIVE_GATE_NOT_FOUND'; END IF;
  UPDATE auditoria_privada.qr_blindaje_v19_backups
    SET rollback_completed_at=clock_timestamp()
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
    AND rollback_completed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_PROD_RETREAT_MARK_FAILED'; END IF;
  SELECT jsonb_build_object(
    'resoluciones',(SELECT count(*) FROM private.qr_resoluciones_v1),
    'ingresos',(SELECT count(*) FROM private.qr_ingresos_v1),
    'consultas',(SELECT count(*) FROM private.qr_contactos_v1),
    'navegaciones',(SELECT count(*) FROM private.qr_navegaciones_v1),
    'aterrizajes',(SELECT count(*) FROM private.qr_aterrizajes_v1),
    'destino_cambios',(SELECT count(*) FROM private.qr_destino_cambios_v1)) INTO v_counts_after;
  IF v_counts_after IS DISTINCT FROM v_counts_before
    OR NOT EXISTS(SELECT 1 FROM private.qr_runtime_gate_v1
      WHERE ambiente='prod' AND version=1 AND NOT accepting AND motivo='rollback') THEN
    RAISE EXCEPTION 'QR_PROD_RETREAT_POSTCHECK_FAILED';
  END IF;
END
$close_gate$;
COMMIT;
