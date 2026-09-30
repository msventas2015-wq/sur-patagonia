-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Requires private.qr_rate_buckets_v1 from ledger-schema.sql. The caller
-- supplies an already pseudonymized 32-byte bucket identity; raw IP, token,
-- email and user-agent are never accepted here.

CREATE FUNCTION private.qr_rate_consumir_v1(
  p_scope text,
  p_bucket_hash bytea,
  p_bucket_at timestamptz,
  p_limite integer
)
RETURNS TABLE(
  permitido boolean,
  window_start timestamptz,
  window_end timestamptz,
  contador integer,
  retry_after integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_interval interval;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer;
BEGIN
  IF p_scope NOT IN (
    'resolver_network_code','resolver_network','resolver_code','pageview_network',
    'contacto_network','contacto_handoff','report_network',
    'report_network_token','report_token'
  ) THEN
    RAISE EXCEPTION 'QR_RATE_SCOPE_INVALID';
  END IF;
  IF p_bucket_hash IS NULL OR octet_length(p_bucket_hash) <> 32 THEN
    RAISE EXCEPTION 'QR_RATE_HASH_INVALID';
  END IF;
  IF p_bucket_at IS NULL OR NOT isfinite(p_bucket_at) THEN
    RAISE EXCEPTION 'QR_RATE_TIME_INVALID';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 1000000 THEN
    RAISE EXCEPTION 'QR_RATE_LIMIT_INVALID';
  END IF;

  v_interval := CASE
    WHEN p_scope IN ('contacto_network','contacto_handoff') THEN interval '10 minutes'
    ELSE interval '1 minute'
  END;
  v_start := date_bin(v_interval,p_bucket_at,timestamptz '1970-01-01 00:00:00+00');
  v_end := v_start + v_interval;

  INSERT INTO private.qr_rate_buckets_v1(
    scope,bucket_hash,window_start,contador,updated_at
  ) VALUES(p_scope,p_bucket_hash,v_start,1,p_bucket_at)
  ON CONFLICT ON CONSTRAINT qr_rate_buckets_v1_pkey DO UPDATE
    SET contador=private.qr_rate_buckets_v1.contador+1,
        updated_at=EXCLUDED.updated_at
  RETURNING private.qr_rate_buckets_v1.contador INTO v_count;

  RETURN QUERY SELECT
    v_count <= p_limite,
    v_start,
    v_end,
    v_count,
    greatest(1,ceil(extract(epoch FROM v_end-clock_timestamp())))::integer;
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_rate_consumir_v1(text,bytea,timestamptz,integer)
  FROM PUBLIC,anon,authenticated,service_role;
