-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
-- Minimal copies of the existing runtime codec helpers for this isolated
-- fixture. The full candidate codec remains covered by runtime-boundary.sql.
CREATE FUNCTION private.qr_lp_text_v1(p text) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT SET search_path=''
AS $$ SELECT int4send(octet_length(convert_to(p,'UTF8')))||convert_to(p,'UTF8') $$;
CREATE FUNCTION private.qr_cookie_candidates_bytes_v1(p jsonb) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $fn$
BEGIN
  IF p IS NULL OR p<>'[]'::jsonb THEN RAISE EXCEPTION 'fixture_only_empty'; END IF;
  RETURN int4send(0);
END
$fn$;
\ir ../../worker/qr/sql/pageview-assertion.sql

DO $test$
DECLARE
  v_args bytea;
  v_expected bytea:=decode(
    '0000001371722d70616765766965772d617267732d7631'||
    '00000002716150000000000040008000000000000001'||
    '0eee7213de0ebbf089d0145df6e8083cf1b1ed6f0e663ac4c15da7dfde2c2156'||
    '0000000276310150000000000040008000000000000003'||
    '000000012f0000'||
    '1492ebfff7dbbb062756c142efbe30cc2dab028de2281ffce9f1a833e4d3ecd1'||
    '0000000f736b69707065645f6c616e64696e67'||
    '0000000000000000000000000000000000000000','hex');
BEGIN
  v_args:=private.qr_pageview_arguments_bytes_v1(
    'qa','50000000-0000-4000-8000-000000000001',
    decode('0eee7213de0ebbf089d0145df6e8083cf1b1ed6f0e663ac4c15da7dfde2c2156','hex'),
    'v1','50000000-0000-4000-8000-000000000003','/',NULL,NULL,
    decode('1492ebfff7dbbb062756c142efbe30cc2dab028de2281ffce9f1a833e4d3ecd1','hex'),
    'skipped_landing',0,0,'[]'::jsonb);
  IF v_args IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'pageview_arguments_codec_mismatch: % <> %',
      encode(v_args,'hex'),encode(v_expected,'hex');
  END IF;
  IF has_function_privilege('anon',
    'private.qr_pageview_arguments_bytes_v1(text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb)',
    'EXECUTE') THEN RAISE EXCEPTION 'public_assertion_codec_grant'; END IF;
  BEGIN
    PERFORM private.qr_pageview_arguments_bytes_v1(
      'qa','50000000-0000-4000-8000-000000000001',
      decode(repeat('11',32),'hex'),'v1',
      '50000000-0000-4000-8000-000000000003','/',NULL,NULL,
      decode(repeat('22',32),'hex'),'within_limit',0,0,'[]'::jsonb);
    RAISE EXCEPTION 'bad_landing_cookie_matrix_accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_PAGEVIEW_ASSERTION_INPUT_INVALID' THEN RAISE; END IF;
  END;
END
$test$;
ROLLBACK;
\echo 'PASS local pageview assertion codec fixture; not QA and no wrapper installed'
