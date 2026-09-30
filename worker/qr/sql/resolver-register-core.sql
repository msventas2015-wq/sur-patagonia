-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Owner-only transactional core for one QR/link admission. A future public
-- wrapper must validate the runtime gate and the Worker one-shot assertion
-- before opening the private context that authorizes this function.

CREATE FUNCTION private.qr_bucket_compuesto_v1(
  p_etiqueta text,
  p_izquierdo bytea,
  p_derecho bytea
)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_etiqueta IS NULL OR p_etiqueta = '' OR octet_length(convert_to(p_etiqueta,'UTF8')) > 128
    OR p_izquierdo IS NULL OR octet_length(p_izquierdo) <> 32
    OR p_derecho IS NULL OR octet_length(p_derecho) <> 32 THEN
    RAISE EXCEPTION 'QR_BUCKET_INPUT_INVALID';
  END IF;
  RETURN extensions.digest(
    convert_to(p_etiqueta,'UTF8') || decode('00','hex') || p_izquierdo || p_derecho,
    'sha256'
  );
END
$fn$;

CREATE FUNCTION private.qr_resolucion_proyectar_v1(
  p_request_id uuid,
  p_replayed boolean,
  p_cookie_scan_state text,
  p_cookie_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_res private.qr_resoluciones_v1%ROWTYPE;
  v_ing private.qr_ingresos_v1%ROWTYPE;
  v_clear_slots jsonb:='[]'::jsonb;
BEGIN
  IF p_request_id IS NULL OR p_replayed IS NULL
    OR p_cookie_scan_state NOT IN ('within_limit','overflow')
    OR p_cookie_candidates IS NULL OR jsonb_typeof(p_cookie_candidates)<>'array' THEN
    RAISE EXCEPTION 'QR_OUTCOME_INPUT_INVALID';
  END IF;
  SELECT * INTO v_res
  FROM private.qr_resoluciones_v1 r
  WHERE r.request_id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_OUTCOME_NOT_FOUND'; END IF;

  IF v_res.resultado='tracked' THEN
    SELECT * INTO STRICT v_ing
    FROM private.qr_ingresos_v1 i
    WHERE i.id=v_res.ingreso_id AND i.request_id=v_res.request_id;
    IF p_replayed IS FALSE AND p_cookie_scan_state='within_limit' THEN
      WITH authentic_candidates AS (
        SELECT c.value->>'slot' AS slot,
          row_number() OVER (
            ORDER BY old_i.created_at DESC,old_i.event_seq DESC,old_i.id DESC
          ) AS recency
        FROM jsonb_array_elements(p_cookie_candidates) c(value)
        JOIN private.qr_ingresos_v1 old_i ON old_i.request_id=(
          substr(c.value->>'slot',1,8)||'-'||substr(c.value->>'slot',9,4)||'-'||
          substr(c.value->>'slot',13,4)||'-'||substr(c.value->>'slot',17,4)||'-'||
          substr(c.value->>'slot',21,12)
        )::uuid
        WHERE old_i.request_id<>v_ing.request_id
          AND old_i.handoff_key_id=c.value->>'kid'
          AND encode(old_i.handoff_hash,'hex')=c.value->>'hash'
          AND old_i.handoff_expira>clock_timestamp()
      )
      SELECT coalesce(jsonb_agg(slot ORDER BY slot),'[]'::jsonb)
      INTO v_clear_slots
      FROM authentic_candidates
      WHERE recency>7;
    END IF;
    RETURN jsonb_build_object(
      'ok',true,
      'tracked',true,
      'replayed',p_replayed,
      'destino',v_ing.destino_efectivo,
      'resultado','tracked',
      'handoff',jsonb_build_object(
        'request_id',v_ing.request_id,
        'kid',v_ing.handoff_key_id,
        'hash',encode(v_ing.handoff_hash,'hex'),
        'expires_at',v_ing.handoff_expira
      ),
      'clear_slots',v_clear_slots,
      'landing',jsonb_build_object(
        'landing_id',v_ing.landing_id,
        'pageview_request_id',v_ing.landing_pageview_request_id,
        'path',v_ing.pagina,
        'propiedad_id',v_ing.propiedad_id,
        'proyecto_slug',v_ing.proyecto_slug_snapshot
      )
    );
  ELSIF v_res.resultado='rate_limited' THEN
    IF p_cookie_scan_state='within_limit' THEN
      SELECT coalesce(jsonb_agg(c.value->>'slot' ORDER BY c.value->>'slot'),'[]'::jsonb)
      INTO v_clear_slots
      FROM jsonb_array_elements(p_cookie_candidates) c(value)
      JOIN private.qr_ingresos_v1 old_i ON old_i.request_id=(
        substr(c.value->>'slot',1,8)||'-'||substr(c.value->>'slot',9,4)||'-'||
        substr(c.value->>'slot',13,4)||'-'||substr(c.value->>'slot',17,4)||'-'||
        substr(c.value->>'slot',21,12)
      )::uuid
      WHERE old_i.handoff_key_id=c.value->>'kid'
        AND encode(old_i.handoff_hash,'hex')=c.value->>'hash'
        AND old_i.handoff_expira>clock_timestamp()
        AND (old_i.created_at,old_i.event_seq)<(v_res.created_at,v_res.event_seq);
    END IF;
    RETURN jsonb_build_object(
      'ok',false,
      'tracked',false,
      'replayed',p_replayed,
      'resultado','rate_limited',
      'http_status',429,
      'clear_slots',v_clear_slots,
      'retry_after',greatest(1,ceil(extract(epoch FROM v_res.rate_limited_until-clock_timestamp())))::integer
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',false,
    'tracked',false,
    'replayed',p_replayed,
    'resultado',v_res.resultado,
    'http_status',v_res.http_status
  );
END
$fn$;

CREATE FUNCTION private.qr_resolver_registrar_core_v1(
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
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_existing private.qr_resoluciones_v1%ROWTYPE;
  v_snapshot jsonb;
  v_result text;
  v_admission_at timestamptz;
  v_event_at timestamptz;
  v_event_seq bigint;
  v_ingreso_id uuid;
  v_visita_id uuid;
  v_landing_id uuid;
  v_pageview_id uuid;
  v_rate_network record;
  v_rate_code record;
  v_rate_pair record;
  v_rate_until timestamptz;
  v_candidate jsonb;
  v_candidate_count integer;
BEGIN
  -- First business action: a signed wrapper must have opened this exact
  -- transaction-scoped one-shot context. A direct owner invocation fails
  -- before validation, locks, quotas or commercial ledgers are touched.
  PERFORM private.qr_runtime_contexto_consumir_v1(
    p_ambiente,'qr_resolver_registrar_interno_v1',p_request_id
  );

  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS DISTINCT FROM 'v1'
    OR p_codigo IS NULL OR p_codigo !~ '^[a-z0-9-]{2,80}$'
    OR p_codigo_hash IS NULL OR octet_length(p_codigo_hash)<>32
    OR p_via NOT IN ('qr','link')
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_handoff_hash IS NULL OR octet_length(p_handoff_hash)<>32
    OR p_handoff_key_id IS NULL OR p_handoff_key_id !~ '^[A-Za-z0-9_-]{1,32}$'
    OR p_claim_expires_at IS NULL OR NOT isfinite(p_claim_expires_at)
    OR p_cookie_scan_state NOT IN ('within_limit','overflow')
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0
    OR p_cookie_candidates IS NULL OR jsonb_typeof(p_cookie_candidates)<>'array' THEN
    RAISE EXCEPTION 'QR_RESOLVER_INPUT_INVALID';
  END IF;

  v_candidate_count:=jsonb_array_length(p_cookie_candidates);
  IF (p_cookie_scan_state='within_limit'
        AND (p_cookie_family_count>32 OR p_cookie_family_bytes>16384 OR v_candidate_count>p_cookie_family_count))
    OR (p_cookie_scan_state='overflow'
        AND NOT (p_cookie_family_count>32 OR p_cookie_family_bytes>16384))
    OR (p_cookie_scan_state='overflow' AND v_candidate_count<>0) THEN
    RAISE EXCEPTION 'QR_COOKIE_MATRIX_INVALID';
  END IF;

  FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_cookie_candidates)
  LOOP
    IF jsonb_typeof(v_candidate)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_candidate) key)
           IS DISTINCT FROM ARRAY['hash','kid','slot']::text[]
      OR coalesce(v_candidate->>'slot','') !~ '^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$'
      OR coalesce(v_candidate->>'hash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(v_candidate->>'kid','') !~ '^[A-Za-z0-9_-]{1,32}$' THEN
      RAISE EXCEPTION 'QR_COOKIE_CANDIDATE_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM (
      SELECT value->>'slot',value->>'hash',value->>'kid'
      FROM jsonb_array_elements(p_cookie_candidates)
      GROUP BY 1,2,3 HAVING count(*)>1
    ) d)>0 THEN
    RAISE EXCEPTION 'QR_COOKIE_CANDIDATE_DUPLICATE';
  END IF;

  -- UUID business idempotency is serialized before quota or semantic locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('qr-resolver-v1/'||p_request_id::text,0));
  v_admission_at:=clock_timestamp();
  IF v_admission_at>=p_claim_expires_at THEN RAISE EXCEPTION 'QR_CLAIM_EXPIRED'; END IF;

  SELECT * INTO v_existing
  FROM private.qr_resoluciones_v1 r
  WHERE r.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_existing.payload_key_id IS DISTINCT FROM p_payload_key_id THEN
      RAISE EXCEPTION 'QR_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN private.qr_resolucion_proyectar_v1(
      p_request_id,true,p_cookie_scan_state,p_cookie_candidates
    );
  END IF;

  SELECT * INTO STRICT v_rate_network
  FROM private.qr_rate_consumir_v1('resolver_network',p_network_hash,v_admission_at,120);
  SELECT * INTO STRICT v_rate_code
  FROM private.qr_rate_consumir_v1('resolver_code',p_codigo_hash,v_admission_at,1000);
  SELECT * INTO STRICT v_rate_pair
  FROM private.qr_rate_consumir_v1(
    'resolver_network_code',
    private.qr_bucket_compuesto_v1('qr-rate-v1/resolver/network-code',p_network_hash,p_codigo_hash),
    v_admission_at,
    20
  );

  IF NOT v_rate_network.permitido OR NOT v_rate_code.permitido OR NOT v_rate_pair.permitido THEN
    v_event_at:=clock_timestamp();
    v_event_seq:=nextval('private.qr_event_seq_v1'::regclass);
    SELECT max(x) INTO v_rate_until FROM (VALUES
      (CASE WHEN NOT v_rate_network.permitido THEN v_rate_network.window_end END),
      (CASE WHEN NOT v_rate_code.permitido THEN v_rate_code.window_end END),
      (CASE WHEN NOT v_rate_pair.permitido THEN v_rate_pair.window_end END)
    ) q(x);
    INSERT INTO private.qr_resoluciones_v1(
      request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
      rate_limited_until,created_at
    ) VALUES(
      p_request_id,v_event_seq,p_payload_hash,p_payload_key_id,'rate_limited',429,
      v_rate_until,v_event_at
    );
    RETURN private.qr_resolucion_proyectar_v1(
      p_request_id,false,p_cookie_scan_state,p_cookie_candidates
    );
  END IF;

  -- One semantic resolution under the E2-compatible lock order. Its own
  -- resolved_at is the business timestamp persisted in every linked row.
  v_ingreso_id:=gen_random_uuid();
  v_snapshot:=private.qr_resolver_snapshot_locked_v1(p_codigo,v_ingreso_id);
  v_result:=v_snapshot->>'resultado';
  IF v_result IS NULL OR v_result NOT IN (
    'tracked','unknown_or_inactive','channel_inactive','base_destination_invalid'
  ) THEN RAISE EXCEPTION 'QR_RESOLVER_OUTCOME_INVALID'; END IF;
  v_event_at:=coalesce((v_snapshot->>'resolved_at')::timestamptz,clock_timestamp());
  v_event_seq:=nextval('private.qr_event_seq_v1'::regclass);

  IF v_result<>'tracked' THEN
    INSERT INTO private.qr_resoluciones_v1(
      request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,created_at
    ) VALUES(p_request_id,v_event_seq,p_payload_hash,p_payload_key_id,v_result,404,v_event_at);
    RETURN private.qr_resolucion_proyectar_v1(
      p_request_id,false,p_cookie_scan_state,p_cookie_candidates
    );
  END IF;

  v_visita_id:=gen_random_uuid();
  v_landing_id:=gen_random_uuid();
  v_pageview_id:=gen_random_uuid();

  INSERT INTO public.visitas(
    id,pagina,propiedad_id,referrer,dispositivo,created_at,canal_ref,canal_via
  ) VALUES(
    v_visita_id,v_snapshot->>'pagina',nullif(v_snapshot->>'propiedad_id','')::uuid,
    NULL,NULL,v_event_at,p_codigo,p_via
  );

  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,alerta,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(
    p_request_id,v_event_seq,p_payload_hash,p_payload_key_id,'tracked',
    nullif(v_snapshot->>'alerta',''),200,v_snapshot->>'destino',v_ingreso_id,v_event_at
  );

  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,campana_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,propiedad_id,proyecto_id,
    proyecto_slug_snapshot,landing_id,landing_pageview_request_id,handoff_hash,
    handoff_key_id,handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(
    v_ingreso_id,v_event_seq,p_request_id,v_visita_id,
    (v_snapshot->>'referencia_id')::uuid,(v_snapshot->>'canal_id')::uuid,
    nullif(v_snapshot->>'campana_id','')::uuid,p_codigo,p_via,
    v_snapshot->>'destino_base',v_snapshot->>'destino',v_snapshot->>'destino_fuente',
    v_snapshot->>'pagina',nullif(v_snapshot->>'propiedad_id','')::uuid,
    nullif(v_snapshot->>'proyecto_id','')::uuid,
    nullif(v_snapshot->>'proyecto_slug_snapshot',''),v_landing_id,v_pageview_id,
    p_handoff_hash,p_handoff_key_id,v_event_at+interval '400 days',
    p_payload_hash,p_payload_key_id,v_event_at
  );

  -- The snapshot already locked campaign/control and fixed event_at. Freeze
  -- only after the referenced ingress exists; the FK needs no deferral.
  IF v_snapshot->>'destino_fuente'='campana' THEN
    PERFORM private.qr_campana_congelar_por_ingreso_v1(
      (v_snapshot->>'campana_id')::uuid,v_ingreso_id,v_event_at
    );
  END IF;

  RETURN private.qr_resolucion_proyectar_v1(
    p_request_id,false,p_cookie_scan_state,p_cookie_candidates
  );
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_bucket_compuesto_v1(text,bytea,bytea)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolucion_proyectar_v1(uuid,boolean,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolver_registrar_core_v1(
  text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated,service_role;

-- No public/service-role wrapper is created here. That wrapper must pass the
-- runtime fence and one-shot Worker assertion before invoking this core.
