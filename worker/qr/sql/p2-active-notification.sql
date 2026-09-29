-- BLINDAJE QR V1.9 COMPONENT.
-- Keeps P2 archival functional without silently changing an active QR. The
-- existing P2 digest/motive/confirmation remains the acceptance gate. This
-- wrapper records each real active destination change and sends a targeted
-- channel message in the same transaction.

CREATE FUNCTION private.qr_archivar_con_notificacion_v1(
  p_tipo text,p_id uuid,p_motivo text,p_expected_digest text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_refs jsonb:='[]'::jsonb;
  v_item jsonb;
  v_result jsonb;
  v_request_id uuid;
  v_message_id uuid;
  v_after text;
  v_asunto text:='QR actualizado por archivado de contenido';
  v_cuerpo text;
BEGIN
  PERFORM pg_advisory_xact_lock(20260812,2);
  IF NOT private.e2_es_admin_vivo_v6() THEN RAISE EXCEPTION 'P2_ADMIN_VIVO_REQUERIDO'; END IF;
  IF p_tipo NOT IN ('propiedad','proyecto') THEN RAISE EXCEPTION 'P2_TIPO_INVALIDO'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'referencia_id',r.id,'canal_id',r.canal_id,'codigo',r.codigo,
    'destino_anterior',r.destino,'before_sha256',private.qr_destino_activo_estado_hash_v1(r.id),
    'usuario_id',c.user_id
  ) ORDER BY r.id),'[]'::jsonb)
  INTO v_refs
  FROM public.referencias r
  JOIN public.canales c ON c.id=r.canal_id
  WHERE NOT public.es_canal_pasivo(c.tipo)
    AND r.destino IS DISTINCT FROM '/'
    AND r.id IN (
      SELECT referencia_id FROM public.p2_refs_propiedad(p_id) WHERE p_tipo='propiedad'
      UNION ALL
      SELECT referencia_id FROM public.p2_refs_proyecto(p_id) WHERE p_tipo='proyecto'
    );

  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_refs) x WHERE nullif(x->>'usuario_id','') IS NULL) THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_SIN_DESTINATARIO';
  END IF;

  v_result:=public.p2_guardar_manifestar_y_mover(p_tipo,p_id,p_motivo,p_expected_digest);

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_refs)
  LOOP
    v_request_id:=gen_random_uuid();
    v_after:=private.qr_destino_activo_estado_hash_v1((v_item->>'referencia_id')::uuid);
    v_cuerpo:='Sur Patagonian archivo el contenido vinculado al QR '||(v_item->>'codigo')||
      ' y traslado su destino a la pagina principal. Destino anterior: '||
      (v_item->>'destino_anterior')||'. Motivo: '||btrim(p_motivo)||'.';
    INSERT INTO public.mensajes(asunto,cuerpo,usuario_id,canal_ids)
    VALUES(v_asunto,v_cuerpo,(v_item->>'usuario_id')::uuid,
      jsonb_build_array(v_item->>'canal_id'))
    RETURNING id INTO v_message_id;
    INSERT INTO private.qr_destino_cambios_v1(
      request_id,referencia_id,canal_id,actor_user_id,destino_anterior,destino_nuevo,
      motivo,before_sha256,after_sha256,mensaje_id,mensaje_usuario_id,
      mensaje_canal_ids,mensaje_asunto,mensaje_cuerpo
    ) VALUES(
      v_request_id,(v_item->>'referencia_id')::uuid,(v_item->>'canal_id')::uuid,v_actor,
      v_item->>'destino_anterior','/',btrim(p_motivo),v_item->>'before_sha256',v_after,
      v_message_id,(v_item->>'usuario_id')::uuid,jsonb_build_array(v_item->>'canal_id'),
      v_asunto,v_cuerpo
    );
  END LOOP;
  RETURN v_result||jsonb_build_object('canales_activos_notificados',jsonb_array_length(v_refs));
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_archivar_propiedad(
  p_propiedad_id uuid,p_motivo text,p_expected_digest text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT private.qr_archivar_con_notificacion_v1(
    'propiedad',p_propiedad_id,p_motivo,p_expected_digest)
$fn$;

CREATE OR REPLACE FUNCTION public.admin_archivar_proyecto(
  p_proyecto_id uuid,p_motivo text,p_expected_digest text
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT private.qr_archivar_con_notificacion_v1(
    'proyecto',p_proyecto_id,p_motivo,p_expected_digest)
$fn$;

REVOKE ALL ON FUNCTION private.qr_archivar_con_notificacion_v1(text,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
