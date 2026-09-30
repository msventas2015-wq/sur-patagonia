-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Requires runtime-boundary.sql, rate-limit.sql and contact-core.sql.
-- One authenticated Worker wrapper; no browser role can execute it.

CREATE FUNCTION private.qr_nullable_text_bytes_v1(p_value text)
RETURNS bytea
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT CASE WHEN p_value IS NULL THEN decode('00','hex')
    ELSE decode('01','hex')||private.qr_lp_text_v1(p_value) END
$fn$;

CREATE FUNCTION private.qr_nullable_uuid_bytes_v1(p_value uuid)
RETURNS bytea
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT CASE WHEN p_value IS NULL THEN decode('00','hex')
    ELSE decode('01','hex')||uuid_send(p_value) END
$fn$;

CREATE FUNCTION private.qr_contacto_arguments_bytes_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_nombre text,
  p_email text,
  p_telefono text,
  p_mensaje text,
  p_propiedad_id uuid,
  p_proyecto_slug text,
  p_fuente text,
  p_network_hash bytea,
  p_cookie_scan_state text,
  p_cookie_family_count integer,
  p_cookie_family_bytes integer,
  p_cookie_candidates jsonb
)
RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS NULL
    OR p_nombre IS NULL OR p_mensaje IS NULL OR p_fuente IS NULL
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_cookie_scan_state NOT IN ('within_limit','overflow')
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0 THEN
    RAISE EXCEPTION 'QR_ASSERTION_ARGUMENTS_INVALID';
  END IF;
  RETURN private.qr_lp_text_v1('qr-contact-args-v1')||
    private.qr_lp_text_v1(p_ambiente)||uuid_send(p_request_id)||p_payload_hash||
    private.qr_lp_text_v1(p_payload_key_id)||private.qr_lp_text_v1(p_nombre)||
    private.qr_nullable_text_bytes_v1(p_email)||
    private.qr_nullable_text_bytes_v1(p_telefono)||
    private.qr_lp_text_v1(p_mensaje)||
    private.qr_nullable_uuid_bytes_v1(p_propiedad_id)||
    private.qr_nullable_text_bytes_v1(p_proyecto_slug)||
    private.qr_lp_text_v1(p_fuente)||p_network_hash||
    private.qr_lp_text_v1(p_cookie_scan_state)||
    int8send(p_cookie_family_count::bigint)||int8send(p_cookie_family_bytes::bigint)||
    private.qr_cookie_candidates_bytes_v1(p_cookie_candidates);
END
$fn$;

CREATE FUNCTION public.qr_contacto_registrar_interno_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_nombre text,
  p_email text,
  p_telefono text,
  p_mensaje text,
  p_propiedad_id uuid,
  p_proyecto_slug text,
  p_fuente text,
  p_network_hash bytea,
  p_cookie_scan_state text,
  p_cookie_family_count integer,
  p_cookie_family_bytes integer,
  p_cookie_candidates jsonb,
  p_assertion_kid text,
  p_assertion_ts text,
  p_assertion_nonce uuid,
  p_worker_assertion bytea
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_gate private.qr_runtime_gate_v1%ROWTYPE;
  v_arguments_hash bytea;
  v_internal jsonb;
  v_resultado text;
  v_retry_after integer;
BEGIN
  -- First SQL action: join the shared runtime fence before reading gate state.
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('qr-runtime-fence-v1/'||coalesce(p_ambiente,'')||'/1',0)
  );
  SELECT * INTO v_gate
  FROM private.qr_runtime_gate_v1 g
  WHERE g.ambiente=p_ambiente AND g.version=1;
  IF NOT FOUND OR v_gate.motivo<>'active' OR v_gate.accepting IS NOT TRUE THEN
    RAISE EXCEPTION 'QR_RUNTIME_GATE_CLOSED';
  END IF;

  BEGIN
    v_arguments_hash:=extensions.digest(private.qr_contacto_arguments_bytes_v1(
      p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_nombre,p_email,
      p_telefono,p_mensaje,p_propiedad_id,p_proyecto_slug,p_fuente,p_network_hash,
      p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates
    ),'sha256');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'QR_NOT_AUTHORIZED';
  END;
  PERFORM private.qr_worker_assertion_consumir_v1(
    p_ambiente,'qr_contacto_registrar_interno_v1',p_request_id,v_arguments_hash,
    p_assertion_kid,p_assertion_ts,p_assertion_nonce,p_worker_assertion
  );
  PERFORM private.qr_runtime_contexto_abrir_v1(
    p_ambiente,'qr_contacto_registrar_interno_v1',p_request_id,p_assertion_nonce
  );
  v_internal:=private.qr_consulta_core_v1(
    'worker',p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_nombre,p_email,
    p_telefono,p_mensaje,p_propiedad_id,p_proyecto_slug,p_fuente,p_network_hash,
    p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates
  );
  v_resultado:=v_internal->>'resultado';
  IF v_resultado='rate_limited' THEN
    v_retry_after:=greatest(1,ceil(extract(epoch FROM
      ((v_internal->>'rate_limited_until')::timestamptz-clock_timestamp())))::integer);
    RETURN jsonb_build_object('ok',false,'resultado','rate_limited',
      'retry_after',v_retry_after,'replayed',coalesce((v_internal->>'replayed')::boolean,false));
  ELSIF v_resultado='payload_invalid' THEN
    RETURN jsonb_build_object('ok',false,'resultado','payload_invalid',
      'replayed',coalesce((v_internal->>'replayed')::boolean,false));
  END IF;
  RETURN jsonb_build_object('ok',true,'resultado','contacto_creado',
    'replayed',coalesce((v_internal->>'replayed')::boolean,false));
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_nullable_text_bytes_v1(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_nullable_uuid_bytes_v1(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_contacto_arguments_bytes_v1(
  text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.qr_contacto_registrar_interno_v1(
  text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,
  jsonb,text,text,uuid,bytea
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qr_contacto_registrar_interno_v1(
  text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,
  jsonb,text,text,uuid,bytea
) TO service_role;
