-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Signed service-only wrapper for landing ACKs and real pageviews.

CREATE FUNCTION public.qr_pageview_registrar_interno_v1(
  p_ambiente text,p_request_id uuid,p_payload_hash bytea,p_payload_key_id text,
  p_landing_id uuid,p_path text,p_propiedad_id uuid,p_proyecto_slug text,
  p_network_hash bytea,p_cookie_scan_state text,p_cookie_family_count integer,
  p_cookie_family_bytes integer,p_cookie_candidates jsonb,p_assertion_kid text,
  p_assertion_ts text,p_assertion_nonce uuid,p_worker_assertion bytea
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_gate private.qr_runtime_gate_v1%ROWTYPE; v_arguments_hash bytea;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('qr-runtime-fence-v1/'||coalesce(p_ambiente,'')||'/1',0));
  SELECT * INTO v_gate FROM private.qr_runtime_gate_v1 g
  WHERE g.ambiente=p_ambiente AND g.version=1;
  IF NOT FOUND OR v_gate.motivo<>'active' OR v_gate.accepting IS NOT TRUE THEN
    RAISE EXCEPTION 'QR_RUNTIME_GATE_CLOSED';
  END IF;
  BEGIN
    v_arguments_hash:=extensions.digest(private.qr_pageview_arguments_bytes_v1(
      p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_landing_id,p_path,
      p_propiedad_id,p_proyecto_slug,p_network_hash,p_cookie_scan_state,
      p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates
    ),'sha256');
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'QR_NOT_AUTHORIZED'; END;
  PERFORM private.qr_worker_assertion_consumir_v1(
    p_ambiente,'qr_pageview_registrar_interno_v1',p_request_id,v_arguments_hash,
    p_assertion_kid,p_assertion_ts,p_assertion_nonce,p_worker_assertion);
  PERFORM private.qr_runtime_contexto_abrir_v1(
    p_ambiente,'qr_pageview_registrar_interno_v1',p_request_id,p_assertion_nonce);
  IF p_landing_id IS NOT NULL THEN
    RETURN private.qr_pageview_ack_core_v1(
      p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_landing_id,
      p_path,p_propiedad_id,p_proyecto_slug);
  END IF;
  RETURN private.qr_pageview_navegacion_core_v1(
    p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_path,
    p_propiedad_id,p_proyecto_slug,p_network_hash,p_cookie_scan_state,
    p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates);
END
$fn$;

REVOKE ALL ON FUNCTION public.qr_pageview_registrar_interno_v1(
  text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb,
  text,text,uuid,bytea
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qr_pageview_registrar_interno_v1(
  text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb,
  text,text,uuid,bytea
) TO service_role;
