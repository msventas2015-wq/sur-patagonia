-- Production compatibility activation inside package-prod-forward.sql.
-- The assertion key must already be in Vault under
-- qr_worker_assertion_v1/prod/<kid>; never pass its value to psql variables.
\if :{?qr_assertion_kid}
\else
  \quit 'qr_assertion_kid is required'
\endif
SELECT set_config('qr.install.assertion_kid', :'qr_assertion_kid', false);

DO $activation_precheck$
BEGIN
  IF current_setting('qr.install.project_ref') IS DISTINCT FROM 'wajkfydxutptcvvfwrvq'
    OR current_setting('qr.install.environment') IS DISTINCT FROM 'prod'
    OR current_setting('qr.install.assertion_kid') !~ '^[A-Za-z0-9_-]{1,32}$'
    OR NOT EXISTS(
      SELECT 1 FROM vault.decrypted_secrets s
      WHERE s.name='qr_worker_assertion_v1/prod/'||current_setting('qr.install.assertion_kid')
        AND s.decrypted_secret ~ '^[0-9a-f]{64}$'
    ) THEN
    RAISE EXCEPTION 'QR_PROD_ASSERTION_SECRET_MISSING';
  END IF;
END
$activation_precheck$;

SELECT private.qr_seed_legacy_campanas_v1(b.campaign_ids)
FROM auditoria_privada.qr_blindaje_v19_backups b
WHERE b.cycle_id=current_setting('qr.install.cycle_id')::uuid;
DROP FUNCTION private.qr_seed_legacy_campanas_v1(uuid[]);
GRANT EXECUTE ON FUNCTION public.qr_resolver_anon_v1(text) TO anon;

INSERT INTO private.qr_runtime_gate_v1(ambiente,version,accepting,motivo)
VALUES('prod',1,true,'active');

DO $activation_mark$
DECLARE v_count integer;
BEGIN
  UPDATE auditoria_privada.qr_blindaje_v19_backups
  SET forward_completed_at=clock_timestamp()
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
    AND project_ref='wajkfydxutptcvvfwrvq' AND environment='prod'
    AND forward_completed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_PROD_BACKUP_MARK_FAILED'; END IF;
END
$activation_mark$;
