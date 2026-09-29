-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Requires pageview-ledger.sql, pageview-classifier.sql, pageview-ack-core.sql,
-- contact-core.sql (revocation ledger), rate-limit.sql and runtime-boundary.sql.
-- A real navigation may inherit only a verified handoff. It never copies the
-- original QR/link via: attributed pageviews always persist canal_via = NULL.

CREATE FUNCTION private.qr_pageview_proyectar_v1(p_request_id uuid,p_replayed boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_row private.qr_navegaciones_v1%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_row FROM private.qr_navegaciones_v1
  WHERE request_id=p_request_id;
  IF v_row.resultado='rate_limited' THEN
    RETURN jsonb_build_object('ok',false,'resultado','rate_limited',
      'retry_after',greatest(1,ceil(extract(epoch FROM
        (v_row.rate_limited_until-clock_timestamp())))::integer),
      'replayed',p_replayed);
  END IF;
  RETURN jsonb_build_object('ok',v_row.resultado IN (
      'landing_absorbed','pageview_tracked','pageview_direct'),
    'resultado',v_row.resultado,'replayed',p_replayed);
END
$fn$;

CREATE FUNCTION private.qr_pageview_navegacion_core_v1(
  p_ambiente text,p_request_id uuid,p_payload_hash bytea,p_payload_key_id text,
  p_path text,p_propiedad_id uuid,p_proyecto_slug text,p_network_hash bytea,
  p_cookie_scan_state text,p_cookie_family_count integer,
  p_cookie_family_bytes integer,p_cookie_candidates jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_existing private.qr_navegaciones_v1%ROWTYPE;
  v_locked private.qr_ingresos_v1%ROWTYPE;
  v_ingreso private.qr_ingresos_v1%ROWTYPE;
  v_revocation uuid;
  v_admission_at timestamptz;
  v_event_at timestamptz;
  v_rate_allowed boolean;
  v_rate_until timestamptz;
  v_retry integer;
  v_resultado text;
  v_visita_id uuid;
BEGIN
  PERFORM private.qr_runtime_contexto_consumir_v1(
    p_ambiente,'qr_pageview_registrar_interno_v1',p_request_id
  );
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL OR p_payload_hash IS NULL
    OR octet_length(p_payload_hash)<>32 OR p_payload_key_id IS DISTINCT FROM 'v1'
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_cookie_scan_state NOT IN ('within_limit','overflow')
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0
    OR p_cookie_candidates IS NULL OR jsonb_typeof(p_cookie_candidates)<>'array'
    OR jsonb_array_length(p_cookie_candidates)>32
    OR (p_cookie_scan_state='within_limit' AND
      (p_cookie_family_count>32 OR p_cookie_family_bytes>16384
       OR jsonb_array_length(p_cookie_candidates)>p_cookie_family_count))
    OR (p_cookie_scan_state='overflow' AND
      (jsonb_array_length(p_cookie_candidates)<>0
       OR NOT (p_cookie_family_count>32 OR p_cookie_family_bytes>16384))) THEN
    RAISE EXCEPTION 'QR_PAGEVIEW_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'qr-pageview-v1/'||p_request_id::text,0));
  SELECT * INTO v_existing FROM private.qr_navegaciones_v1
  WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_existing.payload_key_id IS DISTINCT FROM p_payload_key_id THEN
      RAISE EXCEPTION 'QR_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN private.qr_pageview_proyectar_v1(p_request_id,true);
  END IF;

  v_admission_at:=clock_timestamp();
  SELECT permitido,window_end,retry_after
  INTO STRICT v_rate_allowed,v_rate_until,v_retry
  FROM private.qr_rate_consumir_v1(
    'pageview_network',p_network_hash,v_admission_at,180
  );
  IF NOT v_rate_allowed THEN
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,payload_hash,payload_key_id,
      rate_limited_until,created_at
    ) VALUES(p_request_id,'rate_limited',429,p_payload_hash,p_payload_key_id,
      v_rate_until,v_admission_at);
    RETURN private.qr_pageview_proyectar_v1(p_request_id,false);
  END IF;

  -- Lock all authentic candidates first, then matching revocations in stable
  -- order. The most recent authentic touch decides; an expired/revoked latest
  -- touch degrades to direct and never resurrects an older touch.
  IF p_cookie_scan_state='within_limit' THEN
    FOR v_locked IN
      SELECT i.*
      FROM jsonb_array_elements(p_cookie_candidates) c(value)
      JOIN private.qr_ingresos_v1 i
        ON i.handoff_key_id=c.value->>'kid'
       AND i.handoff_hash=decode(c.value->>'hash','hex')
       AND i.request_id=(substr(c.value->>'slot',1,8)||'-'||
         substr(c.value->>'slot',9,4)||'-'||substr(c.value->>'slot',13,4)||'-'||
         substr(c.value->>'slot',17,4)||'-'||substr(c.value->>'slot',21,12))::uuid
      ORDER BY i.id FOR SHARE OF i
    LOOP NULL; END LOOP;
    FOR v_revocation IN
      SELECT r.request_id FROM private.qr_handoff_revocaciones_v1 r
      JOIN jsonb_array_elements(p_cookie_candidates) c(value)
        ON r.handoff_hash=decode(c.value->>'hash','hex')
      ORDER BY r.request_id FOR SHARE OF r
    LOOP NULL; END LOOP;
  END IF;

  v_event_at:=clock_timestamp();
  IF NOT private.qr_pagina_clasificar_v1(
      p_path,p_propiedad_id,p_proyecto_slug) THEN
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,payload_hash,payload_key_id,created_at
    ) VALUES(p_request_id,'payload_invalid',400,p_payload_hash,p_payload_key_id,
      v_event_at);
    RETURN private.qr_pageview_proyectar_v1(p_request_id,false);
  END IF;

  IF p_cookie_scan_state='within_limit' THEN
    SELECT i.* INTO v_ingreso
    FROM jsonb_array_elements(p_cookie_candidates) c(value)
    JOIN private.qr_ingresos_v1 i
      ON i.handoff_key_id=c.value->>'kid'
     AND i.handoff_hash=decode(c.value->>'hash','hex')
     AND i.request_id=(substr(c.value->>'slot',1,8)||'-'||
       substr(c.value->>'slot',9,4)||'-'||substr(c.value->>'slot',13,4)||'-'||
       substr(c.value->>'slot',17,4)||'-'||substr(c.value->>'slot',21,12))::uuid
    ORDER BY i.created_at DESC,i.event_seq DESC,i.id DESC LIMIT 1;
  END IF;
  IF FOUND AND v_ingreso.handoff_expira>v_event_at
    AND NOT EXISTS(SELECT 1 FROM private.qr_handoff_revocaciones_v1 r
      WHERE r.handoff_hash=v_ingreso.handoff_hash AND r.resultado='applied') THEN
    v_resultado:='pageview_tracked';
  ELSE
    v_resultado:='pageview_direct';
    v_ingreso:=NULL;
  END IF;

  v_visita_id:=gen_random_uuid();
  INSERT INTO public.visitas(
    id,pagina,propiedad_id,referrer,dispositivo,created_at,canal_ref,canal_via
  ) VALUES(
    v_visita_id,p_path,p_propiedad_id,NULL,NULL,v_event_at,
    CASE WHEN v_resultado='pageview_tracked' THEN v_ingreso.codigo END,NULL
  );
  INSERT INTO private.qr_navegaciones_v1(
    request_id,resultado,http_status,visita_id,ingreso_id,payload_hash,
    payload_key_id,created_at
  ) VALUES(
    p_request_id,v_resultado,200,v_visita_id,
    CASE WHEN v_resultado='pageview_tracked' THEN v_ingreso.id END,
    p_payload_hash,p_payload_key_id,v_event_at
  );
  RETURN private.qr_pageview_proyectar_v1(p_request_id,false);
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_pageview_proyectar_v1(uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_pageview_navegacion_core_v1(
  text,uuid,bytea,text,text,uuid,text,bytea,text,integer,integer,jsonb
) FROM PUBLIC,anon,authenticated,service_role;
