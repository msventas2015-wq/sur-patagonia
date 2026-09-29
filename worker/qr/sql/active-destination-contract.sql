-- BLINDAJE QR V1.9 COMPONENT.
-- Exceptional destination changes for active channels. This component closes
-- every direct active-reference destination write and supplies a two-step,
-- admin-only, E2-compatible path with immutable evidence and a targeted
-- internal message. It never changes passive-channel semantics.

CREATE TABLE private.qr_destino_activo_previews_v1 (
  request_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  referencia_id uuid NOT NULL REFERENCES public.referencias(id) ON DELETE RESTRICT,
  canal_id uuid NOT NULL REFERENCES public.canales(id) ON DELETE RESTRICT,
  destino_anterior text NOT NULL,
  destino_nuevo text NOT NULL,
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 10 AND 500),
  before_sha256 text NOT NULL CHECK (before_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  aplicada_at timestamptz NULL,
  CONSTRAINT qr_destino_activo_preview_tiempo_v1 CHECK (
    expires_at=created_at+interval '15 minutes'
      AND (aplicada_at IS NULL OR aplicada_at>=created_at)
  )
);

CREATE TABLE private.qr_destino_activo_contextos_v1 (
  txid bigint PRIMARY KEY,
  request_id uuid UNIQUE NOT NULL,
  actor_user_id uuid NOT NULL,
  referencia_id uuid UNIQUE NOT NULL,
  destino_nuevo text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE private.qr_destino_cambios_v1 (
  request_id uuid PRIMARY KEY,
  referencia_id uuid NOT NULL REFERENCES public.referencias(id) ON DELETE RESTRICT,
  canal_id uuid NOT NULL REFERENCES public.canales(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  destino_anterior text NOT NULL,
  destino_nuevo text NOT NULL,
  motivo text NOT NULL,
  before_sha256 text NOT NULL CHECK (before_sha256 ~ '^[0-9a-f]{64}$'),
  after_sha256 text NOT NULL CHECK (after_sha256 ~ '^[0-9a-f]{64}$'),
  mensaje_id uuid NOT NULL REFERENCES public.mensajes(id) ON DELETE RESTRICT,
  mensaje_usuario_id uuid NOT NULL,
  mensaje_canal_ids jsonb NOT NULL,
  mensaje_asunto text NOT NULL,
  mensaje_cuerpo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_destino_cambio_real_v1 CHECK (destino_anterior<>destino_nuevo),
  CONSTRAINT qr_destino_mensaje_canal_v1 CHECK (
    jsonb_typeof(mensaje_canal_ids)='array'
      AND jsonb_array_length(mensaje_canal_ids)=1
      AND mensaje_canal_ids->>0=canal_id::text
  )
);

CREATE FUNCTION private.qr_destino_activo_estado_hash_v1(p_referencia_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'referencia_id',r.id,
    'canal_id',r.canal_id,
    'codigo',r.codigo,
    'referencia_activa',r.activo,
    'destino',r.destino,
    'canal_codigo',c.codigo,
    'canal_tipo',c.tipo,
    'canal_activo',c.activo,
    'canal_user_id',c.user_id,
    'rel_propiedad',coalesce((SELECT jsonb_agg(rp.propiedad_id ORDER BY rp.propiedad_id)
      FROM public.referencia_propiedad rp WHERE rp.referencia_id=r.id),'[]'::jsonb),
    'rel_proyecto',coalesce((SELECT jsonb_agg(rp.proyecto_id ORDER BY rp.proyecto_id)
      FROM public.referencia_proyecto rp WHERE rp.referencia_id=r.id),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex')
  FROM public.referencias r
  JOIN public.canales c ON c.id=r.canal_id
  WHERE r.id=p_referencia_id
$fn$;

CREATE FUNCTION private.qr_destino_activo_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_canal public.canales%ROWTYPE;
BEGIN
  IF NEW.destino IS NOT DISTINCT FROM OLD.destino THEN RETURN NEW; END IF;
  SELECT * INTO STRICT v_canal FROM public.canales c WHERE c.id=OLD.canal_id;
  IF public.es_canal_pasivo(v_canal.tipo) THEN RETURN NEW; END IF;
  -- Archiving is an already-confirmed P2 operation. It may move an active QR
  -- only to the safe root destination; the public P2 wrappers installed by
  -- this package record the immutable change and notify the channel.
  IF NEW.destino='/' AND EXISTS (
    SELECT 1 FROM private.e2_contextos_v6 c
    WHERE c.txid=txid_current()
      AND c.token::text=current_setting('surpatagonian.e2_token',true)
      AND c.operacion IN ('p2_archivar_propiedad','p2_archivar_proyecto')
  ) THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.qr_destino_activo_contextos_v1 x
    WHERE x.txid=txid_current()
      AND x.actor_user_id=auth.uid()
      AND x.referencia_id=OLD.id
      AND x.destino_nuevo=NEW.destino
  ) THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_REQUIERE_PROCESO_EXCEPCIONAL';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER qr_destino_activo_guard_v1
BEFORE UPDATE OF destino ON public.referencias
FOR EACH ROW EXECUTE FUNCTION private.qr_destino_activo_guard_v1();

CREATE FUNCTION public.qr_destino_activo_preparar_v1(
  p_request_id uuid,p_referencia_id uuid,p_destino_nuevo text,p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_canal_id uuid;
  v_canal public.canales%ROWTYPE;
  v_ref public.referencias%ROWTYPE;
  v_before text;
  v_existing private.qr_destino_activo_previews_v1%ROWTYPE;
BEGIN
  -- Same global writer gate as E2/P2, before all business rows.
  PERFORM pg_advisory_xact_lock(20260812,2);
  IF NOT private.e2_es_admin_vivo_v6() THEN RAISE EXCEPTION 'E2_ADMIN_VIVO_REQUERIDO'; END IF;
  IF p_request_id IS NULL OR p_referencia_id IS NULL
    OR p_destino_nuevo IS NULL OR length(p_destino_nuevo)>500
    OR length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_SOLICITUD_INVALIDA';
  END IF;
  SELECT r.canal_id INTO v_canal_id FROM public.referencias r WHERE r.id=p_referencia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'E2_REFERENCIA_INEXISTENTE'; END IF;
  SELECT * INTO STRICT v_canal FROM public.canales c WHERE c.id=v_canal_id FOR UPDATE;
  SELECT * INTO STRICT v_ref FROM public.referencias r
    WHERE r.id=p_referencia_id AND r.canal_id=v_canal.id FOR UPDATE;
  IF public.es_canal_pasivo(v_canal.tipo) THEN RAISE EXCEPTION 'QR_DESTINO_EXCEPCIONAL_SOLO_ACTIVO'; END IF;
  IF v_canal.user_id IS NULL THEN RAISE EXCEPTION 'QR_DESTINO_ACTIVO_SIN_DESTINATARIO'; END IF;
  IF p_destino_nuevo IS NOT DISTINCT FROM v_ref.destino THEN RAISE EXCEPTION 'QR_DESTINO_ACTIVO_SIN_CAMBIO'; END IF;
  PERFORM 1 FROM private.e2_clasificar_destino_v6(p_destino_nuevo,true);
  v_before:=private.qr_destino_activo_estado_hash_v1(p_referencia_id);
  SELECT * INTO v_existing FROM private.qr_destino_activo_previews_v1
    WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM v_actor
      OR v_existing.referencia_id IS DISTINCT FROM p_referencia_id
      OR v_existing.destino_nuevo IS DISTINCT FROM p_destino_nuevo
      OR v_existing.motivo IS DISTINCT FROM btrim(p_motivo)
      OR v_existing.before_sha256 IS DISTINCT FROM v_before THEN
      RAISE EXCEPTION 'QR_DESTINO_ACTIVO_IDEMPOTENCY_CONFLICT';
    END IF;
  ELSE
    INSERT INTO private.qr_destino_activo_previews_v1(
      request_id,actor_user_id,referencia_id,canal_id,destino_anterior,
      destino_nuevo,motivo,before_sha256,expires_at
    ) VALUES(
      p_request_id,v_actor,v_ref.id,v_canal.id,v_ref.destino,
      p_destino_nuevo,btrim(p_motivo),v_before,clock_timestamp()+interval '15 minutes'
    ) RETURNING * INTO v_existing;
  END IF;
  RETURN jsonb_build_object(
    'request_id',v_existing.request_id,
    'referencia_id',v_existing.referencia_id,
    'canal_id',v_existing.canal_id,
    'destino_anterior',v_existing.destino_anterior,
    'destino_nuevo',v_existing.destino_nuevo,
    'motivo',v_existing.motivo,
    'before_sha256',v_existing.before_sha256,
    'expires_at',v_existing.expires_at,
    'advertencia','Este cambio modifica el contenido de un QR activo ya distribuido y notificara al canal.'
  );
END
$fn$;

CREATE FUNCTION public.qr_destino_activo_aplicar_v1(
  p_request_id uuid,p_expected_sha256 text,p_acepto_cambio_destino_activo boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_actor uuid:=auth.uid();
  v_preview private.qr_destino_activo_previews_v1%ROWTYPE;
  v_canal public.canales%ROWTYPE;
  v_ref public.referencias%ROWTYPE;
  v_now_hash text; v_after text; v_message_id uuid;
  v_asunto text:='Cambio validado en un QR activo';
  v_cuerpo text;
BEGIN
  PERFORM pg_advisory_xact_lock(20260812,2);
  IF NOT private.e2_es_admin_vivo_v6() THEN RAISE EXCEPTION 'E2_ADMIN_VIVO_REQUERIDO'; END IF;
  IF p_acepto_cambio_destino_activo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_ACEPTACION_REQUERIDA';
  END IF;
  SELECT * INTO v_preview FROM private.qr_destino_activo_previews_v1
    WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_DESTINO_ACTIVO_PREVIEW_INEXISTENTE'; END IF;
  IF v_preview.actor_user_id IS DISTINCT FROM v_actor
    OR v_preview.before_sha256 IS DISTINCT FROM p_expected_sha256 THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_PREVIEW_NO_COINCIDE';
  END IF;
  IF v_preview.aplicada_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'request_id',p_request_id,'idempotente',true,
      'after_sha256',(SELECT after_sha256 FROM private.qr_destino_cambios_v1
        WHERE request_id=p_request_id));
  END IF;
  IF clock_timestamp()>=v_preview.expires_at THEN RAISE EXCEPTION 'QR_DESTINO_ACTIVO_PREVIEW_VENCIDA'; END IF;
  SELECT * INTO STRICT v_canal FROM public.canales c WHERE c.id=v_preview.canal_id FOR UPDATE;
  SELECT * INTO STRICT v_ref FROM public.referencias r
    WHERE r.id=v_preview.referencia_id AND r.canal_id=v_canal.id FOR UPDATE;
  IF public.es_canal_pasivo(v_canal.tipo) THEN RAISE EXCEPTION 'QR_DESTINO_EXCEPCIONAL_SOLO_ACTIVO'; END IF;
  IF v_canal.user_id IS NULL THEN RAISE EXCEPTION 'QR_DESTINO_ACTIVO_SIN_DESTINATARIO'; END IF;
  v_now_hash:=private.qr_destino_activo_estado_hash_v1(v_ref.id);
  IF v_now_hash IS DISTINCT FROM v_preview.before_sha256
    OR v_ref.destino IS DISTINCT FROM v_preview.destino_anterior THEN
    RAISE EXCEPTION 'QR_DESTINO_ACTIVO_ESTADO_CAMBIO_DESDE_PREPARACION';
  END IF;
  PERFORM 1 FROM private.e2_clasificar_destino_v6(v_preview.destino_nuevo,true);
  PERFORM private.e2_contexto_abrir_v6(v_actor,p_request_id,'qr_destino_activo_excepcional',true);
  INSERT INTO private.qr_destino_activo_contextos_v1(
    txid,request_id,actor_user_id,referencia_id,destino_nuevo
  ) VALUES(txid_current(),p_request_id,v_actor,v_ref.id,v_preview.destino_nuevo);
  UPDATE public.referencias SET destino=v_preview.destino_nuevo WHERE id=v_ref.id;
  PERFORM private.e2_sync_relaciones_ref_v6(v_ref.id,v_preview.destino_nuevo,true);
  PERFORM private.e2_assert_global_v6();
  PERFORM private.e2_assert_journal_v6();
  v_after:=private.qr_destino_activo_estado_hash_v1(v_ref.id);
  v_cuerpo:='Sur Patagonian actualizo el destino del QR '||v_ref.codigo||
    '. Destino anterior: '||v_preview.destino_anterior||
    '. Destino nuevo: '||v_preview.destino_nuevo||
    '. Motivo: '||v_preview.motivo||'.';
  INSERT INTO public.mensajes(asunto,cuerpo,usuario_id,canal_ids)
  VALUES(v_asunto,v_cuerpo,v_canal.user_id,jsonb_build_array(v_canal.id::text))
  RETURNING id INTO v_message_id;
  INSERT INTO private.qr_destino_cambios_v1(
    request_id,referencia_id,canal_id,actor_user_id,destino_anterior,destino_nuevo,
    motivo,before_sha256,after_sha256,mensaje_id,mensaje_usuario_id,
    mensaje_canal_ids,mensaje_asunto,mensaje_cuerpo
  ) VALUES(
    p_request_id,v_ref.id,v_canal.id,v_actor,v_preview.destino_anterior,
    v_preview.destino_nuevo,v_preview.motivo,v_preview.before_sha256,v_after,
    v_message_id,v_canal.user_id,jsonb_build_array(v_canal.id::text),v_asunto,v_cuerpo
  );
  UPDATE private.qr_destino_activo_previews_v1
    SET aplicada_at=clock_timestamp() WHERE request_id=p_request_id;
  DELETE FROM private.qr_destino_activo_contextos_v1 WHERE txid=txid_current();
  RETURN jsonb_build_object('ok',true,'request_id',p_request_id,'idempotente',false,
    'before_sha256',v_preview.before_sha256,'after_sha256',v_after,
    'mensaje_id',v_message_id);
END
$fn$;

CREATE TRIGGER qr_destino_cambios_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_destino_cambios_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_destino_cambios_no_truncate_v1
BEFORE TRUNCATE ON private.qr_destino_cambios_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();

REVOKE ALL ON TABLE private.qr_destino_activo_previews_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_destino_activo_contextos_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_destino_cambios_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_destino_activo_estado_hash_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_destino_activo_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.qr_destino_activo_preparar_v1(uuid,uuid,text,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.qr_destino_activo_aplicar_v1(uuid,text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.qr_destino_activo_preparar_v1(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qr_destino_activo_aplicar_v1(uuid,text,boolean) TO authenticated;
