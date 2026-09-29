-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER. Requires pageview-ledger.sql
-- and a signed runtime wrapper that opens qr_runtime_contexto_consumir_v1.
-- A landing ACK is an idempotent fact about an existing ingress, not a visit.

CREATE FUNCTION private.qr_pageview_ack_core_v1(
  p_ambiente text,
  p_request_id uuid,
  p_payload_hash bytea,
  p_payload_key_id text,
  p_landing_id uuid,
  p_path text,
  p_propiedad_id uuid,
  p_proyecto_slug text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_existing private.qr_navegaciones_v1%ROWTYPE;
  v_ingreso private.qr_ingresos_v1%ROWTYPE;
  v_at timestamptz;
  v_resultado text;
BEGIN
  PERFORM private.qr_runtime_contexto_consumir_v1(
    p_ambiente,'qr_pageview_registrar_interno_v1',p_request_id
  );
  IF p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL OR p_landing_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS DISTINCT FROM 'v1'
    OR p_path IS NULL OR p_path NOT IN
      ('/','/propiedades','/proyectos','/servicios','/propiedad','/proyecto-mini')
    OR (p_path IN ('/','/propiedades','/proyectos','/servicios')
      AND (p_propiedad_id IS NOT NULL OR p_proyecto_slug IS NOT NULL))
    OR (p_path='/propiedad'
      AND (p_propiedad_id IS NULL OR p_proyecto_slug IS NOT NULL))
    OR (p_path='/proyecto-mini'
      AND (p_propiedad_id IS NOT NULL OR p_proyecto_slug IS NULL)) THEN
    RAISE EXCEPTION 'QR_PAGEVIEW_ACK_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('qr-pageview-v1/'||p_request_id::text,0)
  );
  SELECT * INTO v_existing FROM private.qr_navegaciones_v1
  WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_existing.payload_key_id IS DISTINCT FROM p_payload_key_id THEN
      RAISE EXCEPTION 'QR_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('ok',v_existing.resultado='landing_absorbed',
      'resultado',v_existing.resultado,'replayed',true);
  END IF;

  -- A content archive after /consume cannot invalidate the original landing.
  -- This checks the immutable ingress snapshot, not the live content catalog.
  SELECT * INTO v_ingreso FROM private.qr_ingresos_v1
  WHERE landing_id=p_landing_id
  FOR SHARE;
  IF FOUND AND v_ingreso.landing_pageview_request_id=p_request_id
    AND v_ingreso.pagina=p_path
    AND v_ingreso.propiedad_id IS NOT DISTINCT FROM p_propiedad_id
    AND v_ingreso.proyecto_slug_snapshot IS NOT DISTINCT FROM p_proyecto_slug THEN
    v_resultado:='landing_absorbed';
  ELSE
    v_resultado:='payload_invalid';
  END IF;
  v_at:=clock_timestamp();
  IF v_resultado='landing_absorbed' THEN
    INSERT INTO private.qr_aterrizajes_v1(
      ingreso_id,landing_id,pageview_request_id,path,
      propiedad_id,proyecto_slug_snapshot,created_at
    ) VALUES(v_ingreso.id,p_landing_id,p_request_id,p_path,
      p_propiedad_id,p_proyecto_slug,v_at);
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,ingreso_id,payload_hash,payload_key_id,created_at
    ) VALUES(p_request_id,v_resultado,200,v_ingreso.id,p_payload_hash,p_payload_key_id,v_at);
  ELSE
    INSERT INTO private.qr_navegaciones_v1(
      request_id,resultado,http_status,payload_hash,payload_key_id,created_at
    ) VALUES(p_request_id,v_resultado,400,p_payload_hash,p_payload_key_id,v_at);
  END IF;
  RETURN jsonb_build_object('ok',v_resultado='landing_absorbed',
    'resultado',v_resultado,'replayed',false);
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_pageview_ack_core_v1(
  text,uuid,bytea,text,uuid,text,uuid,text
) FROM PUBLIC,anon,authenticated,service_role;
