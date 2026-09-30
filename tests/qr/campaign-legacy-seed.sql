-- Run only in an empty disposable local PostgreSQL database, never Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE private.qr_campana_control_v1(
  campana_id uuid PRIMARY KEY REFERENCES public.campanas(id),
  version bigint NOT NULL,
  definicion_congelada_at timestamptz,
  congelada_por text,
  congelada_por_ingreso_id uuid,
  updated_at timestamptz NOT NULL
);
INSERT INTO public.campanas VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
\ir ../../worker/qr/sql/campaign-legacy-seed.sql
DO $$ DECLARE v_result jsonb; BEGIN
  IF has_function_privilege('anon','private.qr_seed_legacy_campanas_v1(uuid[])','EXECUTE')
    OR has_function_privilege('authenticated','private.qr_seed_legacy_campanas_v1(uuid[])','EXECUTE')
    OR has_function_privilege('service_role','private.qr_seed_legacy_campanas_v1(uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'legacy_seed_runtime_grant';
  END IF;
  BEGIN
    PERFORM private.qr_seed_legacy_campanas_v1(ARRAY[
      '10000000-0000-4000-8000-000000000001'::uuid]);
    RAISE EXCEPTION 'missing_precheck_id_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'QR_CAMPAIGN_SEED_BASELINE_CHANGED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM private.qr_seed_legacy_campanas_v1(ARRAY[
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid]);
    RAISE EXCEPTION 'duplicate_precheck_id_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'QR_CAMPAIGN_SEED_EXPECTED_DUPLICATE' THEN RAISE; END IF;
  END;
  v_result:=private.qr_seed_legacy_campanas_v1(ARRAY[
    '10000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000001'::uuid]);
  IF v_result->>'count'<>'2' OR
    (SELECT count(*) FROM private.qr_campana_control_v1
      WHERE version=1 AND congelada_por='legacy_seed' AND
        definicion_congelada_at=(v_result->>'cut')::timestamptz)<>2 THEN
    RAISE EXCEPTION 'legacy_seed_incomplete: %',v_result;
  END IF;
  BEGIN
    PERFORM private.qr_seed_legacy_campanas_v1(ARRAY[
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid]);
    RAISE EXCEPTION 'seed_replay_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'QR_CAMPAIGN_SEED_BASELINE_CHANGED' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
\echo 'PASS local campaign legacy seed; not an installer or QA proof'
