-- FINAL ACTIVATION INSIDE THE SAME TRANSACTION AS THE COMPONENT INSTALL.
-- Required psql variable: qr_assertion_kid. The matching 32-byte hex secret
-- must already exist in Supabase Vault under qr_worker_assertion_v1/qa/<kid>.

\if :{?qr_assertion_kid}
\else
  \quit 'qr_assertion_kid is required'
\endif

SELECT set_config('qr.install.assertion_kid', :'qr_assertion_kid', false);

DO $activation_precheck$
BEGIN
  IF current_setting('qr.install.assertion_kid') !~ '^[A-Za-z0-9_-]{1,32}$'
    OR NOT EXISTS(
      SELECT 1 FROM vault.decrypted_secrets s
      WHERE s.name='qr_worker_assertion_v1/qa/'||current_setting('qr.install.assertion_kid')
        AND s.decrypted_secret ~ '^[0-9a-f]{64}$'
    ) THEN
    RAISE EXCEPTION 'QR_INSTALL_ASSERTION_SECRET_MISSING';
  END IF;
END
$activation_precheck$;

SELECT private.qr_seed_legacy_campanas_v1(b.campaign_ids)
FROM auditoria_privada.qr_blindaje_v19_backups b
WHERE b.cycle_id=current_setting('qr.install.cycle_id')::uuid;
DROP FUNCTION private.qr_seed_legacy_campanas_v1(uuid[]);

-- The new server boundaries become the only anonymous write path.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.visitas FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON TABLE public.contactos FROM anon;
-- Browser-originated web contacts now enter only through the QR/contact core.
-- Authenticated INSERT on contactos remains available because the admin and
-- active collaborator interfaces create manual contacts directly and their
-- existing role-specific RLS policies remain in force.
DROP POLICY "Insertar contactos" ON public.contactos;
REVOKE INSERT ON TABLE public.visitas FROM authenticated;
REVOKE TRUNCATE ON TABLE public.visitas,public.contactos,public.personas,public.crm_eventos
  FROM anon,authenticated;

GRANT EXECUTE ON FUNCTION public.qr_resolver_anon_v1(text) TO anon;

INSERT INTO private.qr_runtime_gate_v1(ambiente,version,accepting,motivo)
VALUES('qa',1,true,'active');

DO $activation_mark$
DECLARE v_count integer;
BEGIN
  UPDATE auditoria_privada.qr_blindaje_v19_backups
  SET forward_completed_at=clock_timestamp()
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid
    AND forward_completed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'QR_INSTALL_BACKUP_MARK_FAILED'; END IF;
END
$activation_mark$;
