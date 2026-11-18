-- Apply all statements in a single transaction. The original signature remains
-- in service for general inquiries. Historical inquiries have no selected lot.
ALTER TABLE public.contactos ADD COLUMN lote_id uuid, ADD COLUMN lote_numero text;
COMMENT ON COLUMN public.contactos.lote_id IS 'UUID del lote al consultar. Se conserva aunque el lote se retire.';
COMMENT ON COLUMN public.contactos.lote_numero IS 'Nombre del lote obtenido del inventario en el momento de la consulta.';

-- The established contact guard predates these two capture fields. Only the
-- definer's registration may populate them once; history is read-only.
CREATE FUNCTION private.contacto_lote_captura_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.lote_id,NEW.lote_numero) IS NOT DISTINCT FROM (OLD.lote_id,OLD.lote_numero) THEN RETURN NEW; END IF;
    IF OLD.lote_id IS NOT NULL OR OLD.lote_numero IS NOT NULL THEN RAISE EXCEPTION 'Consulta ya asociada'; END IF;
  END IF;
  IF NEW.lote_id IS NOT NULL OR NEW.lote_numero IS NOT NULL THEN
    IF current_user<>'postgres' OR NEW.lote_id IS NULL OR NEW.lote_numero IS NULL THEN
      RAISE EXCEPTION 'Asociación de lote inválida';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION private.contacto_lote_captura_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER contacto_lote_captura_guard BEFORE INSERT OR UPDATE OF lote_id,lote_numero
  ON public.contactos FOR EACH ROW EXECUTE FUNCTION private.contacto_lote_captura_guard();

CREATE FUNCTION public.qr_contacto_registrar_interno_v1(
  p_ambiente text, p_request_id uuid, p_payload_hash bytea, p_payload_key_id text,
  p_nombre text, p_email text, p_telefono text, p_mensaje text, p_propiedad_id uuid,
  p_proyecto_slug text, p_fuente text, p_network_hash bytea, p_cookie_scan_state text,
  p_cookie_family_count integer, p_cookie_family_bytes integer, p_cookie_candidates jsonb,
  p_assertion_kid text, p_assertion_ts text, p_assertion_nonce uuid, p_worker_assertion bytea,
  p_lote_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_args bytea;
  v_project_id uuid;
  v_theme text;
  v_config jsonb;
  v_card jsonb;
  v_zones jsonb;
  v_zone jsonb;
  v_zone_id text;
  v_number text;
  v_valid boolean := false;
  v_result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('qr-runtime-fence-v1/'||coalesce(p_ambiente,'')||'/1',0));
  IF NOT EXISTS (SELECT 1 FROM private.qr_runtime_gate_v1
    WHERE ambiente=p_ambiente AND version=1 AND accepting IS TRUE AND motivo='active') THEN
    RAISE EXCEPTION 'QR_RUNTIME_GATE_CLOSED';
  END IF;
  IF p_lote_id IS NULL OR p_fuente IS DISTINCT FROM 'proyecto_mini_form' OR p_propiedad_id IS NOT NULL THEN
    RAISE EXCEPTION 'QR_ASSERTION_ARGUMENTS_INVALID';
  END IF;
  v_args := private.qr_contacto_arguments_bytes_v1(p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,
    p_nombre,p_email,p_telefono,p_mensaje,p_propiedad_id,p_proyecto_slug,p_fuente,p_network_hash,
    p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates) || uuid_send(p_lote_id);
  PERFORM private.qr_worker_assertion_consumir_v1(p_ambiente,'qr_contacto_registrar_interno_v1',
    p_request_id,extensions.digest(v_args,'sha256'),p_assertion_kid,p_assertion_ts,p_assertion_nonce,p_worker_assertion);
  PERFORM private.qr_runtime_contexto_abrir_v1(p_ambiente,'qr_contacto_registrar_interno_v1',p_request_id,p_assertion_nonce);

  -- The editor locks the project before its inventory. Hold both through commit.
  SELECT p.id,btrim(p.tema::text,E' \t\r\n') INTO v_project_id,v_theme FROM public.proyectos p
    WHERE p.slug=p_proyecto_slug AND p.estado='activo' FOR SHARE OF p;
  IF FOUND THEN
    -- Plain palette names and an absent theme predate the miniweb editor.
    IF coalesce(v_theme,'')='' OR (v_theme ~ '^[[:alpha:]][[:alnum:]_-]*$'
      AND lower(v_theme) NOT IN ('true','false','null')) THEN
      v_valid := true;
    ELSIF left(v_theme,1)='{' AND pg_input_is_valid(v_theme,'jsonb') THEN
      v_config := v_theme::jsonb->'miniweb';
      v_card := v_config #> ARRAY['lotes',p_lote_id::text];
      v_zones := v_config #> '{recursos,zonasVenta,zonas}';
      -- Missing optional keys are valid. Present values must match the editor's shape.
      v_valid := coalesce(jsonb_typeof(v_config),'object')='object'
        AND coalesce(jsonb_typeof(v_config->'lotes'),'object')='object'
        AND coalesce(jsonb_typeof(v_card),'object')='object'
        AND coalesce(jsonb_typeof(v_card->'zonaVenta'),'string')='string'
        AND coalesce(jsonb_typeof(v_config->'recursos'),'object')='object'
        AND coalesce(jsonb_typeof(v_config #> '{recursos,zonasVenta}'),'object')='object'
        AND coalesce(jsonb_typeof(v_zones),'array')='array';
    END IF;
  END IF;
  IF v_valid THEN
    SELECT l.numero INTO v_number FROM public.lotes l
      WHERE l.proyecto_id=v_project_id AND l.id=p_lote_id
        AND nullif(btrim(l.numero::text),'') IS NOT NULL
        AND coalesce(l.estado::text,'') NOT IN ('vendido','no_a_la_venta') FOR SHARE OF l;
    v_valid := FOUND;
    v_zone_id := v_card->>'zonaVenta';
    IF v_valid AND nullif(v_zone_id,'') IS NOT NULL THEN
      -- An assignment needs one unambiguous zone. Legacy zones used a boolean switch.
      SELECT jsonb_agg(z)->0 INTO v_zone FROM jsonb_array_elements(v_zones) z
        WHERE z->'id'=to_jsonb(v_zone_id) HAVING count(*)=1;
      v_valid := FOUND AND CASE WHEN v_zone ? 'estado' THEN v_zone->>'estado'='a_la_venta'
        WHEN v_zone ? 'aLaVenta' THEN v_zone->'aLaVenta'='true'::jsonb ELSE true END;
    END IF;
  END IF;

  -- A project-form request without an eligible project enters the normal
  -- recorded rejection path, including quotas, idempotency and attribution.
  v_result := private.qr_consulta_core_v1('worker',p_ambiente,p_request_id,p_payload_hash,p_payload_key_id,
    p_nombre,p_email,p_telefono,p_mensaje,NULL,CASE WHEN v_valid THEN p_proyecto_slug END,p_fuente,
    p_network_hash,p_cookie_scan_state,p_cookie_family_count,p_cookie_family_bytes,p_cookie_candidates);
  IF v_result->>'resultado'='rate_limited' THEN
    RETURN jsonb_build_object('ok',false,'resultado','rate_limited','replayed',v_result->'replayed',
      'retry_after',greatest(1,ceil(extract(epoch FROM ((v_result->>'rate_limited_until')::timestamptz-clock_timestamp())))::integer));
  END IF;
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok',false,'resultado','lote_no_disponible','replayed',v_result->'replayed');
  END IF;
  IF NOT (v_result->>'replayed')::boolean THEN
    UPDATE public.contactos SET lote_id=p_lote_id,lote_numero=v_number
      WHERE id=(v_result->>'contacto_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'QR_CONTACTO_AUSENTE'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'resultado','contacto_creado','replayed',v_result->'replayed');
END
$fn$;
REVOKE ALL ON FUNCTION public.qr_contacto_registrar_interno_v1(
 text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea,uuid
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.qr_contacto_registrar_interno_v1(
 text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea,uuid
) TO service_role;
NOTIFY pgrst,'reload schema';
