-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Shared serialization primitives for the resolver and every writer that can
-- create a previously absent reference, campaign link or public content row.

CREATE FUNCTION private.qr_lock_key_v1(p_namespace text,p_key text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  IF p_namespace !~ '^[a-z0-9_-]{1,64}$'
    OR p_key='' OR octet_length(convert_to(p_key,'UTF8'))>512 THEN
    RAISE EXCEPTION 'QR_LOCK_KEY_INVALID';
  END IF;
  RETURN hashtextextended('qr-lock-v1/'||p_namespace||'/'||p_key,0);
END
$fn$;

CREATE FUNCTION private.qr_referencia_codigo_lock_v1(p_codigo text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  IF p_codigo !~ '^[a-z0-9-]{2,80}$' THEN
    RAISE EXCEPTION 'QR_REFERENCE_CODE_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(private.qr_lock_key_v1('referencia-codigo',p_codigo));
END
$fn$;

CREATE FUNCTION private.qr_campana_set_lock_v1(p_canal_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path=''
AS $fn$
  SELECT pg_advisory_xact_lock(
    private.qr_lock_key_v1('campana-set',p_canal_id::text)
  )
$fn$;

CREATE FUNCTION private.qr_contenido_lock_v1(p_tipo text,p_clave text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  IF p_tipo NOT IN ('propiedad','proyecto') OR p_clave='' THEN
    RAISE EXCEPTION 'QR_CONTENT_LOCK_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(
    private.qr_lock_key_v1('contenido-'||p_tipo,p_clave)
  );
END
$fn$;

CREATE FUNCTION private.qr_referencia_insert_lock_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  PERFORM private.qr_referencia_codigo_lock_v1(new.codigo);
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_propiedad_insert_lock_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  PERFORM private.qr_contenido_lock_v1('propiedad',new.id::text);
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_proyecto_insert_lock_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  IF new.slug IS NULL OR new.slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION 'QR_PROJECT_SLUG_INVALID';
  END IF;
  PERFORM private.qr_contenido_lock_v1('proyecto',new.slug);
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_campana_link_insert_lock_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  -- The existing validar_canal_pasivo_campana_2c trigger also locks this
  -- channel, but fires later by name. Take the parent lock before the set
  -- advisory regardless of trigger ordering.
  PERFORM 1 FROM public.canales c WHERE c.id=new.canal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_CAMPAIGN_CHANNEL_MISSING'; END IF;
  PERFORM private.qr_campana_set_lock_v1(new.canal_id);
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_campana_control_insert_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $fn$
BEGIN
  INSERT INTO private.qr_campana_control_v1(campana_id) VALUES (new.id);
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_campana_congelar_por_ingreso_v1(
  p_campana_id uuid,
  p_ingreso_id uuid,
  p_event_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE v_control private.qr_campana_control_v1%ROWTYPE;
BEGIN
  IF p_campana_id IS NULL OR p_ingreso_id IS NULL OR p_event_at IS NULL
    OR NOT isfinite(p_event_at) THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_FREEZE_INPUT_INVALID';
  END IF;

  SELECT * INTO v_control
  FROM private.qr_campana_control_v1 c
  WHERE c.campana_id=p_campana_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_CAMPAIGN_CONTROL_MISSING'; END IF;

  IF v_control.definicion_congelada_at IS NULL THEN
    UPDATE private.qr_campana_control_v1
    SET definicion_congelada_at=p_event_at,
        congelada_por='primer_ingreso',
        congelada_por_ingreso_id=p_ingreso_id,
        updated_at=p_event_at
    WHERE campana_id=p_campana_id
      AND definicion_congelada_at IS NULL;
  ELSIF v_control.congelada_por NOT IN ('primer_ingreso','primer_token','legacy_seed') THEN
    RAISE EXCEPTION 'QR_CAMPAIGN_CONTROL_INVALID';
  END IF;
END
$fn$;

CREATE TRIGGER qr_referencia_insert_lock_v1
BEFORE INSERT ON public.referencias
FOR EACH ROW EXECUTE FUNCTION private.qr_referencia_insert_lock_v1();

CREATE TRIGGER qr_propiedad_insert_lock_v1
BEFORE INSERT ON public.propiedades
FOR EACH ROW EXECUTE FUNCTION private.qr_propiedad_insert_lock_v1();

CREATE TRIGGER qr_proyecto_insert_lock_v1
BEFORE INSERT ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION private.qr_proyecto_insert_lock_v1();

CREATE TRIGGER qr_campana_link_insert_lock_v1
BEFORE INSERT ON public.campanas_canales
FOR EACH ROW EXECUTE FUNCTION private.qr_campana_link_insert_lock_v1();

CREATE TRIGGER qr_campana_control_insert_v1
AFTER INSERT ON public.campanas
FOR EACH ROW EXECUTE FUNCTION private.qr_campana_control_insert_v1();

REVOKE ALL ON FUNCTION private.qr_lock_key_v1(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_referencia_codigo_lock_v1(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_campana_set_lock_v1(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_contenido_lock_v1(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_referencia_insert_lock_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_propiedad_insert_lock_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_proyecto_insert_lock_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_campana_link_insert_lock_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_campana_control_insert_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_campana_congelar_por_ingreso_v1(uuid,uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
