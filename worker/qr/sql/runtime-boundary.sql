-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Runtime fence and one-shot server assertion for the tracked resolver.
-- The public pure resolver remains intentionally outside this boundary.

CREATE TABLE private.qr_runtime_gate_v1 (
  ambiente text NOT NULL CHECK (ambiente ~ '^[a-z0-9_-]{1,32}$'),
  version integer NOT NULL CHECK (version=1),
  accepting boolean NOT NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'installing','active','qa_closing','rollback','qa_quarantine'
  )),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ambiente,version),
  CONSTRAINT qr_runtime_gate_state_v1 CHECK (
    (motivo='active' AND accepting)
    OR (motivo<>'active' AND NOT accepting)
  )
);

CREATE TABLE private.qr_worker_assertion_nonces_v1 (
  ambiente text NOT NULL CHECK (ambiente ~ '^[a-z0-9_-]{1,32}$'),
  endpoint text NOT NULL CHECK (endpoint IN (
    'qr_resolver_registrar_interno_v1','qr_contacto_registrar_interno_v1',
    'qr_pageview_registrar_interno_v1'
  )),
  assertion_nonce uuid NOT NULL,
  assertion_kid text NOT NULL CHECK (assertion_kid ~ '^[A-Za-z0-9_-]{1,32}$'),
  request_id uuid NOT NULL,
  arguments_hash bytea NOT NULL CHECK (octet_length(arguments_hash)=32),
  used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ambiente,endpoint,assertion_nonce)
);

CREATE TABLE private.qr_runtime_contextos_v1 (
  txid bigint NOT NULL,
  ambiente text NOT NULL CHECK (ambiente ~ '^[a-z0-9_-]{1,32}$'),
  endpoint text NOT NULL CHECK (endpoint IN (
    'qr_resolver_registrar_interno_v1','qr_contacto_registrar_interno_v1',
    'qr_pageview_registrar_interno_v1'
  )),
  request_id uuid NOT NULL,
  assertion_nonce uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (txid,endpoint,request_id),
  UNIQUE (txid,endpoint,assertion_nonce)
);

CREATE TRIGGER qr_worker_assertion_nonces_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_worker_assertion_nonces_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_worker_assertion_nonces_no_truncate_v1
BEFORE TRUNCATE ON private.qr_worker_assertion_nonces_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();

CREATE FUNCTION private.qr_lp_text_v1(p_value text)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_bytes bytea;
BEGIN
  v_bytes:=convert_to(p_value,'UTF8');
  RETURN int4send(octet_length(v_bytes))||v_bytes;
END
$fn$;

CREATE FUNCTION private.qr_constant_time_equal_v1(p_left bytea,p_right bytea)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_i integer;
  v_diff integer:=0;
BEGIN
  IF p_left IS NULL OR p_right IS NULL
    OR octet_length(p_left)<>octet_length(p_right) THEN
    RETURN false;
  END IF;
  IF octet_length(p_left)=0 THEN RETURN true; END IF;
  FOR v_i IN 0..octet_length(p_left)-1 LOOP
    v_diff:=v_diff | (get_byte(p_left,v_i) # get_byte(p_right,v_i));
  END LOOP;
  RETURN v_diff=0;
END
$fn$;

CREATE FUNCTION private.qr_cookie_candidates_bytes_v1(p_candidates jsonb)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_result bytea;
  v_candidate jsonb;
  v_slot text;
  v_request_id uuid;
BEGIN
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates)<>'array'
    OR jsonb_array_length(p_candidates)>32 THEN
    RAISE EXCEPTION 'QR_ASSERTION_ARGUMENTS_INVALID';
  END IF;
  v_result:=int4send(jsonb_array_length(p_candidates));
  FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    IF jsonb_typeof(v_candidate)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_candidate) key)
           IS DISTINCT FROM ARRAY['hash','kid','slot']::text[]
      OR coalesce(v_candidate->>'slot','') !~ '^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$'
      OR coalesce(v_candidate->>'hash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(v_candidate->>'kid','') !~ '^[A-Za-z0-9_-]{1,32}$' THEN
      RAISE EXCEPTION 'QR_ASSERTION_ARGUMENTS_INVALID';
    END IF;
    v_slot:=v_candidate->>'slot';
    v_request_id:=(substr(v_slot,1,8)||'-'||substr(v_slot,9,4)||'-'||
      substr(v_slot,13,4)||'-'||substr(v_slot,17,4)||'-'||substr(v_slot,21,12))::uuid;
    v_result:=v_result||uuid_send(v_request_id)||decode(v_candidate->>'hash','hex')||
      private.qr_lp_text_v1(v_candidate->>'kid');
  END LOOP;
  RETURN v_result;
END
$fn$;

CREATE FUNCTION private.qr_resolver_arguments_bytes_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_codigo text,
  p_codigo_hash bytea,
  p_via text,
  p_network_hash bytea,
  p_handoff_hash bytea,
  p_handoff_key_id text,
  p_claim_expires_at timestamptz,
  p_cookie_scan_state text,
  p_cookie_family_count integer,
  p_cookie_family_bytes integer,
  p_cookie_candidates jsonb
)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS NULL
    OR p_codigo IS NULL OR p_codigo !~ '^[a-z0-9-]{2,80}$'
    OR p_codigo_hash IS NULL OR octet_length(p_codigo_hash)<>32
    OR p_via NOT IN ('qr','link')
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_handoff_hash IS NULL OR octet_length(p_handoff_hash)<>32
    OR p_handoff_key_id IS NULL OR p_handoff_key_id !~ '^[A-Za-z0-9_-]{1,32}$'
    OR p_claim_expires_at IS NULL OR NOT isfinite(p_claim_expires_at)
    OR p_cookie_scan_state IS NULL
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0 THEN
    RAISE EXCEPTION 'QR_ASSERTION_ARGUMENTS_INVALID';
  END IF;
  RETURN private.qr_lp_text_v1('qr-resolver-args-v1')||
    private.qr_lp_text_v1(p_ambiente)||uuid_send(p_request_id)||p_payload_hash||
    private.qr_lp_text_v1(p_payload_key_id)||private.qr_lp_text_v1(p_codigo)||p_codigo_hash||
    private.qr_lp_text_v1(p_via)||p_network_hash||p_handoff_hash||
    private.qr_lp_text_v1(p_handoff_key_id)||
    int8send((extract(epoch FROM p_claim_expires_at)*1000000)::bigint)||
    private.qr_lp_text_v1(p_cookie_scan_state)||
    int8send(p_cookie_family_count::bigint)||int8send(p_cookie_family_bytes::bigint)||
    private.qr_cookie_candidates_bytes_v1(p_cookie_candidates);
END
$fn$;

CREATE FUNCTION private.qr_worker_assertion_consumir_v1(
  p_ambiente text,
  p_endpoint text,
  p_request_id uuid,
  p_arguments_hash bytea,
  p_assertion_kid text,
  p_assertion_ts text,
  p_assertion_nonce uuid,
  p_worker_assertion bytea
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_ts timestamptz;
  v_key bytea;
  v_expected bytea;
  v_message bytea;
BEGIN
  -- Every rejection at this boundary is intentionally indistinguishable.
  BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
      OR current_setting('request.method',true) IS DISTINCT FROM 'POST'
      OR p_endpoint NOT IN (
        'qr_resolver_registrar_interno_v1','qr_contacto_registrar_interno_v1',
        'qr_pageview_registrar_interno_v1'
      )
      OR p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
      OR p_request_id IS NULL
      OR p_arguments_hash IS NULL OR octet_length(p_arguments_hash)<>32
      OR p_assertion_kid IS NULL OR p_assertion_kid !~ '^[A-Za-z0-9_-]{1,32}$'
      OR p_assertion_ts IS NULL
         OR p_assertion_ts !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
      OR p_assertion_nonce IS NULL
      OR p_worker_assertion IS NULL OR octet_length(p_worker_assertion)<>32 THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    v_ts:=p_assertion_ts::timestamptz;
    IF NOT isfinite(v_ts)
      OR p_assertion_ts IS DISTINCT FROM
        to_char(v_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z'
      OR abs(extract(epoch FROM clock_timestamp()-v_ts))>60 THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    SELECT decode(s.decrypted_secret,'hex') INTO STRICT v_key
    FROM vault.decrypted_secrets s
    WHERE s.name='qr_worker_assertion_v1/'||p_ambiente||'/'||p_assertion_kid
      AND s.decrypted_secret ~ '^[0-9a-f]{64}$';
    v_message:=private.qr_lp_text_v1('qr-worker-assert-v1')||
      private.qr_lp_text_v1(p_ambiente)||private.qr_lp_text_v1(p_endpoint)||
      uuid_send(p_request_id)||private.qr_lp_text_v1(p_assertion_kid)||
      private.qr_lp_text_v1(p_assertion_ts)||uuid_send(p_assertion_nonce)||p_arguments_hash;
    v_expected:=extensions.hmac(v_message,v_key,'sha256');
    IF NOT private.qr_constant_time_equal_v1(v_expected,p_worker_assertion) THEN
      RAISE EXCEPTION 'invalid';
    END IF;
    INSERT INTO private.qr_worker_assertion_nonces_v1(
      ambiente,endpoint,assertion_nonce,assertion_kid,request_id,arguments_hash
    ) VALUES(
      p_ambiente,p_endpoint,p_assertion_nonce,p_assertion_kid,p_request_id,p_arguments_hash
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'QR_NOT_AUTHORIZED';
  END;
END
$fn$;

CREATE FUNCTION private.qr_runtime_contexto_abrir_v1(
  p_ambiente text,
  p_endpoint text,
  p_request_id uuid,
  p_assertion_nonce uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_endpoint NOT IN (
      'qr_resolver_registrar_interno_v1','qr_contacto_registrar_interno_v1',
      'qr_pageview_registrar_interno_v1'
    )
    OR p_request_id IS NULL OR p_assertion_nonce IS NULL THEN
    RAISE EXCEPTION 'QR_CONTEXT_INVALID';
  END IF;
  INSERT INTO private.qr_runtime_contextos_v1(
    txid,ambiente,endpoint,request_id,assertion_nonce
  ) VALUES(
    txid_current(),p_ambiente,p_endpoint,p_request_id,p_assertion_nonce
  );
END
$fn$;

CREATE FUNCTION private.qr_runtime_contexto_consumir_v1(
  p_ambiente text,
  p_endpoint text,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_nonce uuid;
BEGIN
  DELETE FROM private.qr_runtime_contextos_v1 c
  WHERE c.txid=txid_current()
    AND c.ambiente=p_ambiente
    AND c.endpoint=p_endpoint
    AND c.request_id=p_request_id
  RETURNING c.assertion_nonce INTO v_nonce;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_CONTEXT_MISSING'; END IF;
END
$fn$;

CREATE FUNCTION public.qr_resolver_registrar_interno_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_codigo text,
  p_codigo_hash bytea,
  p_via text,
  p_network_hash bytea,
  p_handoff_hash bytea,
  p_handoff_key_id text,
  p_claim_expires_at timestamptz,
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_gate private.qr_runtime_gate_v1%ROWTYPE;
  v_arguments_hash bytea;
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
    v_arguments_hash:=extensions.digest(private.qr_resolver_arguments_bytes_v1(
      p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_codigo,p_codigo_hash,
      p_via,p_network_hash,p_handoff_hash,p_handoff_key_id,p_claim_expires_at,
      p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates
    ),'sha256');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'QR_NOT_AUTHORIZED';
  END;
  PERFORM private.qr_worker_assertion_consumir_v1(
    p_ambiente,'qr_resolver_registrar_interno_v1',p_request_id,v_arguments_hash,
    p_assertion_kid,p_assertion_ts,p_assertion_nonce,p_worker_assertion
  );
  PERFORM private.qr_runtime_contexto_abrir_v1(
    p_ambiente,'qr_resolver_registrar_interno_v1',p_request_id,p_assertion_nonce
  );
  RETURN private.qr_resolver_registrar_core_v1(
    p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,p_codigo,p_codigo_hash,
    p_via,p_network_hash,p_handoff_hash,p_handoff_key_id,p_claim_expires_at,
    p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates
  );
END
$fn$;

REVOKE ALL ON TABLE private.qr_runtime_gate_v1
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_worker_assertion_nonces_v1
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_runtime_contextos_v1
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_lp_text_v1(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_constant_time_equal_v1(bytea,bytea)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_cookie_candidates_bytes_v1(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolver_arguments_bytes_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_worker_assertion_consumir_v1(
  text,text,uuid,bytea,text,text,uuid,bytea
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_runtime_contexto_abrir_v1(text,text,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_runtime_contexto_consumir_v1(text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.qr_resolver_registrar_interno_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,
  jsonb,text,text,uuid,bytea
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.qr_resolver_registrar_interno_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,
  jsonb,text,text,uuid,bytea
) TO service_role;
