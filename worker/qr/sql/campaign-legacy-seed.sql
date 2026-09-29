-- LOCAL INSTALL COMPONENT, NOT A STANDALONE MIGRATION.
-- Call once in the same closed activation transaction that creates the control
-- table and INSERT trigger, with the exact campaign UUID set from precheck.
-- The installer must DROP this owner-only helper after successful seeding.
CREATE FUNCTION private.qr_seed_legacy_campanas_v1(p_expected_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_actual uuid[]; v_expected uuid[]; v_cut timestamptz; v_count bigint;
BEGIN
  IF p_expected_ids IS NULL OR array_position(p_expected_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_SEED_EXPECTED_INVALID';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}'::uuid[])
    INTO v_expected FROM unnest(p_expected_ids) AS x;
  IF cardinality(v_expected)<>cardinality(p_expected_ids) THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_SEED_EXPECTED_DUPLICATE';
  END IF;

  -- E2/P2 writers take this exclusive lock before their business rows. New
  -- campaign INSERTs do not necessarily use E2, hence the table lock too.
  PERFORM pg_catalog.pg_advisory_xact_lock(20260812,2);
  LOCK TABLE public.campanas IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(array_agg(c.id ORDER BY c.id),'{}'::uuid[])
    INTO v_actual FROM public.campanas c;
  IF v_actual IS DISTINCT FROM v_expected OR
     EXISTS (SELECT 1 FROM private.qr_campana_control_v1) THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_SEED_BASELINE_CHANGED';
  END IF;

  v_cut:=clock_timestamp();
  INSERT INTO private.qr_campana_control_v1
    (campana_id,version,definicion_congelada_at,congelada_por,updated_at)
  SELECT c.id,1,v_cut,'legacy_seed',v_cut FROM public.campanas c ORDER BY c.id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(v_expected) OR EXISTS (
    SELECT 1 FROM public.campanas c LEFT JOIN private.qr_campana_control_v1 ctl
      ON ctl.campana_id=c.id
    WHERE ctl.campana_id IS NULL OR ctl.version<>1 OR
      ctl.definicion_congelada_at IS DISTINCT FROM v_cut OR
      ctl.congelada_por IS DISTINCT FROM 'legacy_seed' OR
      ctl.congelada_por_ingreso_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_SEED_VERIFY_FAILED';
  END IF;
  RETURN pg_catalog.jsonb_build_object('count',v_count,'cut',v_cut);
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_seed_legacy_campanas_v1(uuid[])
  FROM PUBLIC,anon,authenticated,service_role;
