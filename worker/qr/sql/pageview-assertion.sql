-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER. Uses the existing runtime
-- assertion codec helpers; no grant or public wrapper is added here.

CREATE FUNCTION private.qr_pageview_arguments_bytes_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_landing_id uuid,
  p_path text,
  p_propiedad_id uuid,
  p_proyecto_slug text,
  p_network_hash bytea,
  p_cookie_scan_state text,
  p_cookie_family_count integer,
  p_cookie_family_bytes integer,
  p_cookie_candidates jsonb
) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_count integer;
BEGIN
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS DISTINCT FROM 'v1'
    OR p_path IS NULL OR p_path NOT IN
      ('/','/propiedades','/proyectos','/servicios','/propiedad','/proyecto-mini')
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_cookie_scan_state NOT IN ('skipped_landing','within_limit','overflow')
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0
    OR p_cookie_candidates IS NULL OR jsonb_typeof(p_cookie_candidates)<>'array'
    OR (p_path IN ('/','/propiedades','/proyectos','/servicios')
      AND (p_propiedad_id IS NOT NULL OR p_proyecto_slug IS NOT NULL))
    OR (p_path='/propiedad'
      AND (p_propiedad_id IS NULL OR p_proyecto_slug IS NOT NULL))
    OR (p_path='/proyecto-mini' AND
      (p_propiedad_id IS NOT NULL OR p_proyecto_slug IS NULL
        OR p_proyecto_slug !~ '^[a-z0-9][a-z0-9-]*$'
        OR length(p_proyecto_slug)>120)) THEN
    RAISE EXCEPTION 'QR_PAGEVIEW_ASSERTION_INPUT_INVALID';
  END IF;
  v_count:=jsonb_array_length(p_cookie_candidates);
  IF (p_landing_id IS NOT NULL AND (p_cookie_scan_state<>'skipped_landing'
      OR p_cookie_family_count<>0 OR p_cookie_family_bytes<>0 OR v_count<>0))
    OR (p_landing_id IS NULL AND p_cookie_scan_state='skipped_landing')
    OR (p_cookie_scan_state='within_limit' AND
      (p_cookie_family_count>32 OR p_cookie_family_bytes>16384
        OR v_count>p_cookie_family_count))
    OR (p_cookie_scan_state='overflow' AND
      (v_count<>0 OR NOT
        (p_cookie_family_count>32 OR p_cookie_family_bytes>16384))) THEN
    RAISE EXCEPTION 'QR_PAGEVIEW_ASSERTION_INPUT_INVALID';
  END IF;
  RETURN private.qr_lp_text_v1('qr-pageview-args-v1')||
    private.qr_lp_text_v1(p_ambiente)||uuid_send(p_request_id)||
    p_payload_hash||private.qr_lp_text_v1(p_payload_key_id)||
    (CASE WHEN p_landing_id IS NULL THEN decode('00','hex')
      ELSE decode('01','hex')||uuid_send(p_landing_id) END)||
    private.qr_lp_text_v1(p_path)||
    (CASE WHEN p_propiedad_id IS NULL THEN decode('00','hex')
      ELSE decode('01','hex')||uuid_send(p_propiedad_id) END)||
    (CASE WHEN p_proyecto_slug IS NULL THEN decode('00','hex')
      ELSE decode('01','hex')||private.qr_lp_text_v1(p_proyecto_slug) END)||
    p_network_hash||private.qr_lp_text_v1(p_cookie_scan_state)||
    int8send(p_cookie_family_count::bigint)||
    int8send(p_cookie_family_bytes::bigint)||
    private.qr_cookie_candidates_bytes_v1(p_cookie_candidates);
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_pageview_arguments_bytes_v1(
  text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated,service_role;
