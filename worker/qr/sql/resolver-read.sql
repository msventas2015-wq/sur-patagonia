-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER. Include only in the audited
-- transactional package with owner/ACL baseline and QA identity prechecks.
-- CREATE (not REPLACE) deliberately fails if any nominal function exists.
-- Requires resolver-concurrency.sql in the same audited transaction package.
CREATE FUNCTION private.qr_destino_publico_v1(p_destino text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v record;
BEGIN
  SELECT * INTO STRICT v FROM private.e2_clasificar_destino_v6(p_destino, true);
  -- The E2 classifier is the authority that proves the stored destination is
  -- a live, internal catalog target.  Once it does, preserve the exact stored
  -- path: printed QR destinations are contractual and must not be silently
  -- canonicalised from /<slug> to /proyecto-mini?slug=<slug> (or vice versa).
  IF p_destino IS NOT NULL
    AND p_destino LIKE '/%'
    AND p_destino NOT LIKE '//%'
    AND p_destino !~ '[\\\\[:cntrl:]]'
    AND (
      v.contenido_tipo = 'general'
      OR (v.contenido_tipo = 'propiedad' AND v.propiedad_id IS NOT NULL)
      OR (v.contenido_tipo = 'proyecto' AND v.proyecto_id IS NOT NULL
        AND v.slug ~ '^[a-z0-9][a-z0-9-]*$')
    ) THEN
    RETURN p_destino;
  END IF;
  RETURN NULL;
EXCEPTION WHEN raise_exception THEN
  -- Only catalog validation errors are unavailable content. Permissions,
  -- undefined functions, timeouts and database faults must propagate.
  IF SQLERRM LIKE 'E2_DESTINO_%' OR SQLERRM LIKE 'E2_PROPIEDAD_%' THEN RETURN NULL; END IF;
  RAISE;
END
$fn$;

CREATE FUNCTION private.qr_resolver_snapshot_locked_v1(p_codigo text,p_ingreso_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_ref public.referencias%ROWTYPE;
  v_canal public.canales%ROWTYPE;
  v_ref_id uuid; v_canal_id uuid;
  v_campaign_ids uuid[] := ARRAY[]::uuid[];
  v_property_ids uuid[] := ARRAY[]::uuid[];
  v_project_ids uuid[] := ARRAY[]::uuid[];
  v_project_slugs text[] := ARRAY[]::text[];
  v_ids_after uuid[];
  v_destination text; v_base text; v_override text; v_effective_raw text; v_count integer;
  v_campaign_id uuid; v_destination_source text := 'base'; v_alert text;
  v_id uuid; v_item record; v_content record; v_at timestamptz;
BEGIN
  IF p_codigo IS NULL OR p_codigo !~ '^[a-z0-9-]{2,80}$' THEN
    RETURN jsonb_build_object('ok',false,'resultado','unknown_or_inactive');
  END IF;
  -- P2 takes the exclusive E2 advisory before locking content, then channels.
  -- Readers take its shared form before any business-row/advisory lock so P2
  -- cannot invert the channel -> reference -> content resolver order.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(20260812,2);
  SELECT r.id,r.canal_id INTO v_ref_id,v_canal_id FROM public.referencias r WHERE r.codigo=p_codigo;
  IF NOT FOUND THEN
    PERFORM private.qr_referencia_codigo_lock_v1(p_codigo);
    SELECT r.id,r.canal_id INTO v_ref_id,v_canal_id
    FROM public.referencias r WHERE r.codigo=p_codigo;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok',false,'resultado','unknown_or_inactive');
    END IF;
  END IF;
  -- Locate without lock, then acquire parent before child, as E2 writers do.
  SELECT * INTO v_canal FROM public.canales c WHERE c.id=v_canal_id FOR SHARE;
  IF NOT FOUND OR v_canal.activo IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok',false,'resultado','channel_inactive');
  END IF;
  SELECT * INTO v_ref FROM public.referencias r WHERE r.id=v_ref_id FOR SHARE;
  IF NOT FOUND OR v_ref.canal_id IS DISTINCT FROM v_canal.id
    OR v_ref.codigo IS DISTINCT FROM p_codigo OR v_ref.activo IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok',false,'resultado','unknown_or_inactive');
  END IF;
  IF public.es_canal_pasivo(v_canal.tipo) IS TRUE THEN
    IF v_ref.destino IS DISTINCT FROM v_canal.destino THEN
      RETURN jsonb_build_object('ok',false,'resultado','base_destination_invalid');
    END IF;
    PERFORM private.qr_campana_set_lock_v1(v_canal.id);
    SELECT coalesce(array_agg(cc.campana_id ORDER BY cc.campana_id),ARRAY[]::uuid[])
      INTO v_campaign_ids FROM public.campanas_canales cc WHERE cc.canal_id=v_canal.id;
    FOREACH v_id IN ARRAY v_campaign_ids LOOP
      PERFORM 1 FROM public.campanas c WHERE c.id=v_id FOR SHARE;
    END LOOP;
    FOREACH v_id IN ARRAY v_campaign_ids LOOP
      IF p_ingreso_id IS NULL THEN
        PERFORM 1 FROM private.qr_campana_control_v1 c
        WHERE c.campana_id=v_id FOR SHARE;
      ELSE
        PERFORM 1 FROM private.qr_campana_control_v1 c
        WHERE c.campana_id=v_id FOR UPDATE;
      END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'QR_CAMPAIGN_CONTROL_MISSING'; END IF;
    END LOOP;
    FOREACH v_id IN ARRAY v_campaign_ids LOOP
      PERFORM 1 FROM public.campanas_canales cc WHERE cc.campana_id=v_id AND cc.canal_id=v_canal.id FOR SHARE;
    END LOOP;
  END IF;
  -- Preclassification only gathers content locks. It never chooses a redirect.
  FOR v_item IN SELECT v_ref.destino AS destino UNION ALL
    SELECT c.url_destino FROM public.campanas c WHERE c.id=ANY(v_campaign_ids)
  LOOP
    BEGIN
      SELECT * INTO STRICT v_content FROM private.e2_clasificar_destino_v6(v_item.destino,false);
      IF v_content.propiedad_id IS NOT NULL THEN v_property_ids:=array_append(v_property_ids,v_content.propiedad_id); END IF;
      IF v_content.proyecto_id IS NOT NULL THEN v_project_ids:=array_append(v_project_ids,v_content.proyecto_id); END IF;
      IF v_content.slug IS NOT NULL THEN v_project_slugs:=array_append(v_project_slugs,v_content.slug); END IF;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'E2_DESTINO_%' AND SQLERRM NOT LIKE 'E2_PROPIEDAD_%' THEN RAISE; END IF;
      IF v_item.destino ~ '^/propiedad\.html\?id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_property_ids:=array_append(v_property_ids,split_part(v_item.destino,'=',2)::uuid);
      ELSIF v_item.destino ~ '^/proyecto-mini\?slug=[a-z0-9][a-z0-9-]*$' THEN
        v_project_slugs:=array_append(v_project_slugs,split_part(v_item.destino,'=',2));
      END IF;
    END;
  END LOOP;
  FOR v_id IN SELECT DISTINCT unnest(v_property_ids) ORDER BY 1 LOOP
    PERFORM private.qr_contenido_lock_v1('propiedad',v_id::text);
  END LOOP;
  FOR v_item IN SELECT DISTINCT unnest(v_project_slugs) AS slug ORDER BY 1 LOOP
    PERFORM private.qr_contenido_lock_v1('proyecto',v_item.slug);
  END LOOP;
  FOR v_id IN SELECT DISTINCT unnest(v_property_ids) ORDER BY 1 LOOP
    PERFORM 1 FROM public.propiedades p WHERE p.id=v_id FOR SHARE;
  END LOOP;
  FOR v_id IN SELECT DISTINCT unnest(v_project_ids) ORDER BY 1 LOOP
    PERFORM 1 FROM public.proyectos p WHERE p.id=v_id FOR SHARE;
  END LOOP;
  FOR v_item IN SELECT v_ref.destino AS destino UNION ALL
    SELECT c.url_destino FROM public.campanas c WHERE c.id=ANY(v_campaign_ids)
  LOOP
    BEGIN
      SELECT * INTO STRICT v_content FROM private.e2_clasificar_destino_v6(v_item.destino,false);
      IF (v_content.propiedad_id IS NOT NULL AND NOT v_content.propiedad_id=ANY(v_property_ids))
        OR (v_content.proyecto_id IS NOT NULL AND NOT v_content.proyecto_id=ANY(v_project_ids))
        OR (v_content.slug IS NOT NULL AND NOT v_content.slug=ANY(v_project_slugs)) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='qr_content_changed';
      END IF;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'E2_DESTINO_%' AND SQLERRM NOT LIKE 'E2_PROPIEDAD_%' THEN RAISE; END IF;
    END;
  END LOOP;
  IF public.es_canal_pasivo(v_canal.tipo) IS TRUE THEN
    SELECT coalesce(array_agg(cc.campana_id ORDER BY cc.campana_id),ARRAY[]::uuid[])
      INTO v_ids_after FROM public.campanas_canales cc WHERE cc.canal_id=v_canal.id;
    IF v_ids_after IS DISTINCT FROM v_campaign_ids THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='qr_resolution_changed';
    END IF;
  END IF;
  v_base:=private.qr_destino_publico_v1(v_ref.destino);
  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok',false,'resultado','base_destination_invalid');
  END IF;
  v_at:=clock_timestamp();
  SELECT count(*),(array_agg(c.id ORDER BY c.id))[1],(array_agg(c.url_destino ORDER BY c.id))[1]
    INTO v_count,v_campaign_id,v_destination
    FROM public.campanas c
    JOIN private.qr_campana_control_v1 ctl ON ctl.campana_id=c.id
    WHERE c.id=ANY(v_campaign_ids) AND c.activa IS TRUE
      AND ctl.archivada_at IS NULL
      AND c.fecha_inicio IS NOT NULL AND c.fecha_fin IS NOT NULL
      AND c.fecha_inicio<c.fecha_fin AND c.fecha_fin<=c.fecha_inicio+interval '366 days'
      AND c.fecha_inicio<=v_at AND v_at<c.fecha_fin;
  IF v_count=1 THEN
    v_override:=private.qr_destino_publico_v1(v_destination);
    IF v_override IS NULL THEN
      v_campaign_id:=NULL;
      v_alert:='campaign_destination_fallback';
    ELSE
      v_destination_source:='campana';
    END IF;
  ELSIF v_count>1 THEN
    v_campaign_id:=NULL;
    v_alert:='campaign_overlap_fallback';
  ELSE
    v_campaign_id:=NULL;
  END IF;

  v_effective_raw:=CASE WHEN v_destination_source='campana' THEN v_destination ELSE v_ref.destino END;
  SELECT * INTO STRICT v_content FROM private.e2_clasificar_destino_v6(v_effective_raw,true);
  -- Private canonical snapshot. Public callers never receive IDs or alert class.
  RETURN jsonb_build_object(
    'ok',true,
    'resultado','tracked',
    'codigo',p_codigo,
    'referencia_id',v_ref.id,
    'canal_id',v_canal.id,
    'campana_id',v_campaign_id,
    'destino_base',v_base,
    'destino',coalesce(v_override,v_base),
    'destino_fuente',v_destination_source,
    'pagina',CASE
      WHEN v_content.contenido_tipo='general' THEN coalesce(v_override,v_base)
      WHEN v_content.contenido_tipo='propiedad' THEN '/propiedad'
      WHEN v_content.contenido_tipo='proyecto' THEN '/proyecto-mini'
    END,
    'propiedad_id',v_content.propiedad_id,
    'proyecto_id',v_content.proyecto_id,
    'proyecto_slug_snapshot',CASE WHEN v_content.contenido_tipo='proyecto' THEN v_content.slug ELSE NULL END,
    'resolved_at',v_at,
    'alerta',v_alert
  );
END
$fn$;

CREATE FUNCTION private.qr_resolver_snapshot_v1(p_codigo text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT private.qr_resolver_snapshot_locked_v1(p_codigo,NULL)
$fn$;

CREATE FUNCTION private.qr_resolver_core_v1(p_codigo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_snapshot jsonb;
BEGIN
  v_snapshot:=private.qr_resolver_snapshot_v1(p_codigo);
  IF coalesce((v_snapshot->>'ok')::boolean,false) IS DISTINCT FROM true THEN
    RETURN '{"ok":false,"error":"contenido_no_disponible"}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'tracked',false,'destino',v_snapshot->>'destino','landing',NULL
  );
END
$fn$;

CREATE FUNCTION public.qr_resolver_anon_v1(p_codigo text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF current_setting('request.method',true) IS DISTINCT FROM 'POST' THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE='{"code":"method_not_allowed","message":"solicitud_no_valida","details":null,"hint":null}',
      DETAIL='{"status":405,"headers":{"Allow":"POST","Cache-Control":"no-store"}}';
  END IF;
  PERFORM set_config('response.headers','[{"Cache-Control":"no-store"},{"Pragma":"no-cache"}]',true);
  RETURN private.qr_resolver_core_v1(p_codigo);
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_destino_publico_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolver_snapshot_locked_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolver_snapshot_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_resolver_core_v1(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.qr_resolver_anon_v1(text) FROM PUBLIC,anon,authenticated,service_role;
-- Runtime grants intentionally withheld until the complete audited package.
-- No existing table ACL, E2 writer, reference, destination or history is changed.
