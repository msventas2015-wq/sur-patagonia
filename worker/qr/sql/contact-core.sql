-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Durable consultation core. Runtime access is supplied by contact-boundary.sql.
-- Direct execution remains owner-only and requires a one-shot transaction context.

ALTER TABLE public.contactos ALTER COLUMN email DROP NOT NULL;

CREATE TABLE private.qr_consulta_requests_v1 (
  request_id uuid PRIMARY KEY,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
  payload_key_id text NOT NULL CHECK (payload_key_id='v1'),
  estado text NOT NULL CHECK (estado IN ('en_curso','confirmada','rechazada')),
  resultado text NULL CHECK (resultado IS NULL OR resultado IN (
    'contacto_atribuido','contacto_directo','contacto_directo_token_invalido',
    'contacto_directo_token_vencido','contacto_directo_token_revocado',
    'contacto_directo_extra_no_disponible','contacto_directo_cookie_overflow',
    'degradado_vinculo','payload_invalid','rate_limited'
  )),
  contacto_id uuid NULL REFERENCES public.contactos(id) ON DELETE RESTRICT,
  rate_limited_until timestamptz NULL,
  created_xid bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz NULL,
  CONSTRAINT qr_consulta_request_estado_v1 CHECK (
    (estado='en_curso' AND resultado IS NULL AND contacto_id IS NULL
      AND rate_limited_until IS NULL AND completed_at IS NULL)
    OR
    (estado='confirmada' AND resultado LIKE 'contacto_%'
      AND contacto_id IS NOT NULL AND rate_limited_until IS NULL AND completed_at IS NOT NULL)
    OR
    (estado='confirmada' AND resultado='degradado_vinculo'
      AND contacto_id IS NOT NULL AND rate_limited_until IS NULL AND completed_at IS NOT NULL)
    OR
    (estado='rechazada' AND resultado='payload_invalid'
      AND contacto_id IS NULL AND rate_limited_until IS NULL AND completed_at IS NOT NULL)
    OR
    (estado='rechazada' AND resultado='rate_limited'
      AND contacto_id IS NULL AND rate_limited_until IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE private.qr_contactos_v1 (
  request_id uuid PRIMARY KEY
    REFERENCES private.qr_consulta_requests_v1(request_id) ON DELETE RESTRICT,
  contacto_id uuid UNIQUE NULL REFERENCES public.contactos(id) ON DELETE RESTRICT,
  ingreso_id uuid NULL REFERENCES private.qr_ingresos_v1(id) ON DELETE RESTRICT,
  resultado text NOT NULL CHECK (resultado IN (
    'contacto_atribuido','contacto_directo','contacto_directo_token_invalido',
    'contacto_directo_token_vencido','contacto_directo_token_revocado',
    'contacto_directo_extra_no_disponible','contacto_directo_cookie_overflow',
    'degradado_vinculo','rate_limited','payload_invalid'
  )),
  evidencia text NULL CHECK (evidencia IS NULL OR evidencia IN (
    'handoff_verificado','sin_handoff','handoff_invalido','handoff_vencido',
    'handoff_revocado','extra_no_disponible','cookie_family_overflow',
    'vinculo_degradado','rate_limited','payload_invalid'
  )),
  fuente text NULL CHECK (fuente IS NULL OR fuente IN (
    'home_form','home_chatbot','propiedades_form','proyectos_form','servicios_form',
    'burbuja_global','propiedad_form','propiedad_whatsapp','proyecto_mini_form'
  )),
  propiedad_id uuid NULL REFERENCES public.propiedades(id) ON DELETE RESTRICT,
  proyecto_slug text NULL,
  canal_ref text NULL,
  canal_via text NULL CHECK (canal_via IS NULL OR canal_via IN ('qr','link')),
  campana_id uuid NULL REFERENCES public.campanas(id) ON DELETE RESTRICT,
  cookie_candidates_hash bytea[] NOT NULL DEFAULT ARRAY[]::bytea[],
  rate_limited_until timestamptz NULL,
  event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_contacto_atribucion_v1 CHECK (
    (resultado='contacto_atribuido' AND evidencia='handoff_verificado'
      AND contacto_id IS NOT NULL AND ingreso_id IS NOT NULL
      AND canal_ref IS NOT NULL AND canal_via IS NOT NULL
      AND rate_limited_until IS NULL)
    OR
    (resultado LIKE 'contacto_%' AND resultado<>'contacto_atribuido'
      AND contacto_id IS NOT NULL AND ingreso_id IS NULL
      AND canal_ref IS NULL AND canal_via IS NULL AND campana_id IS NULL
      AND rate_limited_until IS NULL)
    OR
    (resultado='degradado_vinculo' AND contacto_id IS NOT NULL
      AND ingreso_id IS NULL AND canal_ref IS NULL AND canal_via IS NULL
      AND campana_id IS NULL AND rate_limited_until IS NULL)
    OR
    (resultado='rate_limited' AND contacto_id IS NULL AND ingreso_id IS NULL
      AND canal_ref IS NULL AND canal_via IS NULL AND campana_id IS NULL
      AND rate_limited_until IS NOT NULL)
    OR
    (resultado='payload_invalid' AND contacto_id IS NULL AND ingreso_id IS NULL
      AND canal_ref IS NULL AND canal_via IS NULL AND campana_id IS NULL
      AND rate_limited_until IS NULL)
  ),
  CONSTRAINT qr_contacto_contenido_v1 CHECK (
    (contacto_id IS NOT NULL AND fuente IN ('propiedad_form','propiedad_whatsapp')
      AND propiedad_id IS NOT NULL AND proyecto_slug IS NULL)
    OR
    (contacto_id IS NOT NULL AND fuente='proyecto_mini_form' AND propiedad_id IS NULL
      AND proyecto_slug ~ '^[a-z0-9][a-z0-9-]*$')
    OR
    (contacto_id IS NOT NULL AND fuente IN ('home_form','home_chatbot','propiedades_form','proyectos_form',
      'servicios_form','burbuja_global')
      AND propiedad_id IS NULL AND proyecto_slug IS NULL)
    OR
    (contacto_id IS NULL AND fuente IS NULL
      AND propiedad_id IS NULL AND proyecto_slug IS NULL)
  )
);

-- Deliberately non-unique: one real ingress may support several later queries.
CREATE INDEX qr_contactos_ingreso_evento_v1
  ON private.qr_contactos_v1(ingreso_id,event_at,contacto_id)
  WHERE ingreso_id IS NOT NULL;

-- Commercial projection: direct consultations never erase a demonstrated
-- channel, and reusing an older handoff later never makes that ingress newer.
CREATE VIEW private.qr_persona_ultimo_canal_v1
WITH (security_barrier=true) AS
SELECT DISTINCT ON (c.persona_id)
  c.persona_id,
  q.contacto_id,
  q.ingreso_id,
  i.referencia_id,
  i.canal_id,
  i.codigo AS canal_ref,
  i.via AS canal_via,
  i.campana_id,
  i.created_at AS ingreso_at,
  i.event_seq AS ingreso_event_seq,
  q.event_at AS consulta_at
FROM private.qr_contactos_v1 q
JOIN public.contactos c ON c.id=q.contacto_id
JOIN private.qr_ingresos_v1 i ON i.id=q.ingreso_id
WHERE q.resultado='contacto_atribuido' AND c.persona_id IS NOT NULL
ORDER BY c.persona_id,i.created_at DESC,i.event_seq DESC,i.id DESC,
  q.event_at DESC,q.contacto_id DESC;

CREATE TABLE private.qr_handoff_revocaciones_v1 (
  request_id uuid PRIMARY KEY,
  ingreso_id_solicitado uuid NOT NULL,
  handoff_hash bytea NULL CHECK (handoff_hash IS NULL OR octet_length(handoff_hash)=32),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
  payload_key_id text NOT NULL CHECK (payload_key_id='v1'),
  actor_user_id uuid NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('comprometido','solicitud_operativa')),
  resultado text NOT NULL CHECK (resultado IN ('applied','already_revoked','not_available')),
  http_status integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_handoff_revocacion_resultado_v1 CHECK (
    (resultado IN ('applied','already_revoked') AND http_status=200 AND handoff_hash IS NOT NULL)
    OR (resultado='not_available' AND http_status=404 AND handoff_hash IS NULL)
  )
);
CREATE UNIQUE INDEX qr_handoff_una_revocacion_aplicada_v1
  ON private.qr_handoff_revocaciones_v1(handoff_hash)
  WHERE resultado='applied';

-- A revocation writer and a consultation reader serialize on the same ingress
-- before either one decides whether the handoff is still usable. This makes the
-- lock order a database guarantee instead of a convention left to one writer.
CREATE FUNCTION private.qr_handoff_revocacion_lock_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF new.handoff_hash IS NOT NULL THEN
    PERFORM 1
    FROM private.qr_ingresos_v1 i
    WHERE i.id=new.ingreso_id_solicitado
      AND i.handoff_hash=new.handoff_hash
    FOR UPDATE OF i;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'QR_HANDOFF_REVOCATION_INGRESS_MISMATCH';
    END IF;
  END IF;
  RETURN new;
END
$fn$;

CREATE TRIGGER qr_handoff_revocaciones_lock_v1
BEFORE INSERT ON private.qr_handoff_revocaciones_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_handoff_revocacion_lock_v1();

-- Transaction-scoped evidence used only to let an already demonstrated ingress
-- preserve its historic reference after that reference/channel is archived.
CREATE TABLE private.qr_contacto_insert_context_v1 (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  contacto_id uuid NOT NULL,
  request_id uuid NOT NULL,
  ingreso_id uuid NOT NULL,
  canal_ref text NOT NULL,
  canal_via text NOT NULL CHECK (canal_via IN ('qr','link')),
  PRIMARY KEY (backend_pid,transaction_id)
);

CREATE FUNCTION private.qr_consulta_request_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF tg_op='TRUNCATE' OR tg_op='DELETE' THEN
    RAISE EXCEPTION 'QR_CONSULTA_LEDGER_APPEND_ONLY';
  END IF;
  IF tg_op='UPDATE' THEN
    IF old.estado<>'en_curso' OR new.estado NOT IN ('confirmada','rechazada')
      OR old.created_xid<>txid_current() OR new.created_xid<>old.created_xid
      OR new.request_id IS DISTINCT FROM old.request_id
      OR new.payload_hash IS DISTINCT FROM old.payload_hash
      OR new.payload_key_id IS DISTINCT FROM old.payload_key_id
      OR new.created_at IS DISTINCT FROM old.created_at THEN
      RAISE EXCEPTION 'QR_CONSULTA_REQUEST_INMUTABLE';
    END IF;
  END IF;
  RETURN new;
END
$fn$;

CREATE TRIGGER qr_consulta_requests_update_guard_v1
BEFORE UPDATE OR DELETE ON private.qr_consulta_requests_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_consulta_request_guard_v1();
CREATE TRIGGER qr_consulta_requests_no_truncate_v1
BEFORE TRUNCATE ON private.qr_consulta_requests_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_consulta_request_guard_v1();
CREATE TRIGGER qr_contactos_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_contactos_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_contactos_no_truncate_v1
BEFORE TRUNCATE ON private.qr_contactos_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_handoff_revocaciones_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_handoff_revocaciones_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_handoff_revocaciones_no_truncate_v1
BEFORE TRUNCATE ON private.qr_handoff_revocaciones_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();

CREATE FUNCTION private.qr_contacto_contexto_valido_v1(
  p_contacto_id uuid,p_canal_ref text,p_canal_via text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS(
    SELECT 1
    FROM private.qr_contacto_insert_context_v1 x
    JOIN private.qr_ingresos_v1 i ON i.id=x.ingreso_id
    WHERE x.backend_pid=pg_backend_pid()
      AND x.transaction_id=txid_current()
      AND x.contacto_id=p_contacto_id
      AND x.canal_ref=p_canal_ref AND x.canal_via=p_canal_via
      AND i.request_id IS NOT NULL
      AND i.codigo=x.canal_ref AND i.via=x.canal_via
  )
$fn$;

-- Forward definition. The package must capture and restore the exact live body
-- on rollback; this component never infers that body from an old local setup.
CREATE OR REPLACE FUNCTION public.validar_canal_ref()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF new.canal_ref IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.referencias r
    JOIN public.canales c ON c.id=r.canal_id
    WHERE r.codigo=new.canal_ref AND r.activo IS TRUE AND c.activo IS TRUE
  ) THEN
    IF new.origen='web'
      AND private.qr_contacto_contexto_valido_v1(new.id,new.canal_ref,new.canal_via) THEN
      RETURN new;
    END IF;
    IF new.origen='manual' THEN
      RAISE EXCEPTION USING errcode='23514',message='Referencia manual inexistente o inactiva';
    END IF;
    new.canal_ref:=NULL;
  END IF;
  RETURN new;
END
$fn$;

-- Existing web submissions link identity but never overwrite a consolidated
-- profile. New persons have no purge deadline. Manual behavior is preserved.
CREATE OR REPLACE FUNCTION public.contactos_resolver_persona()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_email_norm text;
  v_celular_norm text;
  v_fijo_norm text;
  v_persona_id uuid;
  v_primera_fecha timestamptz;
BEGIN
  new.persona_id:=NULL;
  v_email_norm:=public.normalizar_email(new.email);
  v_celular_norm:=public.normalizar_telefono_ar(new.telefono);
  v_fijo_norm:=NULL;
  IF v_email_norm IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('persona:email:'||v_email_norm,0));
    SELECT p.id INTO v_persona_id
    FROM public.personas p WHERE p.email_norm=v_email_norm
    ORDER BY p.created_at,p.id LIMIT 1 FOR UPDATE;
  END IF;
  IF v_persona_id IS NOT NULL THEN
    new.persona_id:=v_persona_id;
    IF new.origen='manual' THEN
      UPDATE public.personas
      SET nombre=coalesce(nullif(nombre,''),nullif(btrim(new.nombre),'')),
          celular_norm=coalesce(celular_norm,v_celular_norm),
          fijo_norm=coalesce(fijo_norm,v_fijo_norm)
      WHERE id=v_persona_id;
    END IF;
    RETURN new;
  END IF;
  v_primera_fecha:=coalesce(new.fecha,new.created_at,now());
  INSERT INTO public.personas(
    estado_persona,nombre,email_norm,celular_norm,fijo_norm,primera_fecha,
    primer_canal_ref,vence_atribucion_at,retencion_hasta
  ) VALUES(
    'activa',nullif(btrim(new.nombre),''),v_email_norm,v_celular_norm,v_fijo_norm,
    v_primera_fecha,new.canal_ref,NULL,NULL
  ) RETURNING id INTO new.persona_id;
  RETURN new;
END
$fn$;

CREATE FUNCTION private.qr_consulta_core_v1(
  p_modo text,
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
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_existing private.qr_consulta_requests_v1%ROWTYPE;
  v_admission_at timestamptz;
  v_event_at timestamptz;
  v_contacto_id uuid;
  v_ingreso private.qr_ingresos_v1%ROWTYPE;
  v_locked_ingreso private.qr_ingresos_v1%ROWTYPE;
  v_revocation_id uuid;
  v_candidate jsonb;
  v_authentic_hashes bytea[]:=ARRAY[]::bytea[];
  v_resultado text;
  v_evidencia text;
  v_payload_valid boolean;
  v_rate_allowed boolean;
  v_rate_until timestamptz;
  v_retry_after integer;
  v_handoff_bucket bytea;
BEGIN
  -- Mandatory first action: a direct core call cannot bypass the runtime gate.
  PERFORM private.qr_runtime_contexto_consumir_v1(
    p_ambiente,'qr_contacto_registrar_interno_v1',p_request_id
  );

  IF p_modo IS DISTINCT FROM 'worker'
    OR p_ambiente IS NULL OR p_ambiente !~ '^[a-z0-9_-]{1,32}$'
    OR p_request_id IS NULL
    OR p_payload_hash IS NULL OR octet_length(p_payload_hash)<>32
    OR p_payload_key_id IS DISTINCT FROM 'v1'
    OR p_network_hash IS NULL OR octet_length(p_network_hash)<>32
    OR p_cookie_scan_state NOT IN ('within_limit','overflow')
    OR p_cookie_family_count IS NULL OR p_cookie_family_count<0
    OR p_cookie_family_bytes IS NULL OR p_cookie_family_bytes<0
    OR p_cookie_candidates IS NULL OR jsonb_typeof(p_cookie_candidates)<>'array'
    OR jsonb_array_length(p_cookie_candidates)>32 THEN
    RAISE EXCEPTION 'QR_CONTACT_INPUT_INVALID';
  END IF;
  IF (p_cookie_scan_state='within_limit' AND (
        p_cookie_family_count>32 OR p_cookie_family_bytes>16384
        OR jsonb_array_length(p_cookie_candidates)>p_cookie_family_count))
    OR (p_cookie_scan_state='overflow' AND (
        p_cookie_family_count<=32 AND p_cookie_family_bytes<=16384
        OR jsonb_array_length(p_cookie_candidates)<>0)) THEN
    RAISE EXCEPTION 'QR_CONTACT_INPUT_INVALID';
  END IF;
  IF p_nombre IS NULL OR btrim(p_nombre)='' OR char_length(p_nombre)>120
    OR octet_length(convert_to(p_nombre,'UTF8'))>480
    OR p_mensaje IS NULL OR btrim(p_mensaje)='' OR char_length(p_mensaje)>2000
    OR octet_length(convert_to(p_mensaje,'UTF8'))>8000
    OR (p_email IS NULL AND p_telefono IS NULL)
    OR (p_email IS NOT NULL AND (
      octet_length(convert_to(p_email,'UTF8'))>254
      OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
      OR split_part(p_email,'@',1)='' OR char_length(split_part(p_email,'@',1))>64
      OR split_part(p_email,'@',2)='' OR char_length(split_part(p_email,'@',2))>253
      OR split_part(p_email,'@',2) IS DISTINCT FROM lower(split_part(p_email,'@',2))))
    OR (p_telefono IS NOT NULL AND p_telefono !~ '^[+]?[0-9]{7,15}$')
    OR p_fuente NOT IN ('home_form','home_chatbot','propiedades_form','proyectos_form',
      'servicios_form','burbuja_global','propiedad_form','propiedad_whatsapp','proyecto_mini_form') THEN
    RAISE EXCEPTION 'QR_CONTACT_INPUT_INVALID';
  END IF;
  FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_cookie_candidates)
  LOOP
    IF jsonb_typeof(v_candidate)<>'object'
      OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v_candidate) key)
          IS DISTINCT FROM ARRAY['hash','kid','slot']::text[]
      OR coalesce(v_candidate->>'hash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(v_candidate->>'kid','') !~ '^[A-Za-z0-9_-]{1,32}$'
      OR coalesce(v_candidate->>'slot','') !~ '^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$' THEN
      RAISE EXCEPTION 'QR_CONTACT_INPUT_INVALID';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_cookie_candidates))
      IS DISTINCT FROM
      (SELECT count(DISTINCT value->>'slot') FROM jsonb_array_elements(p_cookie_candidates)) THEN
    RAISE EXCEPTION 'QR_CONTACT_INPUT_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qr-contact-v1/'||p_request_id::text,0));
  SELECT * INTO v_existing FROM private.qr_consulta_requests_v1
  WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_existing.payload_key_id IS DISTINCT FROM p_payload_key_id THEN
      RAISE EXCEPTION 'QR_CONTACT_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('ok',v_existing.estado='confirmada',
      'resultado',v_existing.resultado,'contacto_id',v_existing.contacto_id,
      'rate_limited_until',v_existing.rate_limited_until,'replayed',true);
  END IF;

  INSERT INTO private.qr_consulta_requests_v1(
    request_id,payload_hash,payload_key_id,estado,created_xid
  ) VALUES(p_request_id,p_payload_hash,p_payload_key_id,'en_curso',txid_current());

  v_admission_at:=clock_timestamp();
  SELECT permitido,window_end,retry_after
  INTO STRICT v_rate_allowed,v_rate_until,v_retry_after
  FROM private.qr_rate_consumir_v1(
    'contacto_network',p_network_hash,v_admission_at,5
  );
  IF NOT v_rate_allowed THEN
    INSERT INTO private.qr_contactos_v1(
      request_id,resultado,evidencia,cookie_candidates_hash,
      rate_limited_until,event_at
    ) VALUES(
      p_request_id,'rate_limited','rate_limited',ARRAY[]::bytea[],
      v_rate_until,v_admission_at
    );
    UPDATE private.qr_consulta_requests_v1
    SET estado='rechazada',resultado='rate_limited',
        rate_limited_until=v_rate_until,completed_at=clock_timestamp()
    WHERE request_id=p_request_id;
    RETURN jsonb_build_object('ok',false,'resultado','rate_limited',
      'retry_after',v_retry_after,'rate_limited_until',v_rate_until,'replayed',false);
  END IF;

  -- Lock every authentic candidate first, then every matching revocation, in
  -- stable order. A revocation writer must take the ingress lock first.
  IF p_cookie_scan_state='within_limit' THEN
    FOR v_locked_ingreso IN
      SELECT i.*
      FROM jsonb_array_elements(p_cookie_candidates) c(value)
      JOIN private.qr_ingresos_v1 i
        ON i.handoff_key_id=c.value->>'kid'
        AND i.handoff_hash=decode(c.value->>'hash','hex')
        AND i.request_id=(substr(c.value->>'slot',1,8)||'-'||substr(c.value->>'slot',9,4)||'-'||
          substr(c.value->>'slot',13,4)||'-'||substr(c.value->>'slot',17,4)||'-'||
          substr(c.value->>'slot',21,12))::uuid
      ORDER BY i.id
      FOR SHARE OF i
    LOOP
      IF NOT v_locked_ingreso.handoff_hash=ANY(v_authentic_hashes) THEN
        v_authentic_hashes:=array_append(v_authentic_hashes,v_locked_ingreso.handoff_hash);
      END IF;
    END LOOP;
    FOR v_revocation_id IN
      SELECT r.request_id
      FROM private.qr_handoff_revocaciones_v1 r
      WHERE r.handoff_hash=ANY(v_authentic_hashes) AND r.resultado='applied'
      ORDER BY r.request_id
      FOR SHARE OF r
    LOOP NULL; END LOOP;
  END IF;

  -- The semantic content row is part of the same locked decision.
  IF p_fuente IN ('propiedad_form','propiedad_whatsapp')
    AND p_propiedad_id IS NOT NULL AND p_proyecto_slug IS NULL THEN
    PERFORM 1 FROM public.propiedades p
    WHERE p.id=p_propiedad_id AND p.activa IS TRUE FOR SHARE OF p;
    v_payload_valid:=FOUND;
  ELSIF p_fuente='proyecto_mini_form' AND p_propiedad_id IS NULL
    AND p_proyecto_slug ~ '^[a-z0-9][a-z0-9-]*$' THEN
    PERFORM 1 FROM public.proyectos p
    WHERE p.slug=p_proyecto_slug AND p.estado='activo' FOR SHARE OF p;
    v_payload_valid:=FOUND;
  ELSE
    v_payload_valid:=p_fuente IN ('home_form','home_chatbot','propiedades_form',
      'proyectos_form','servicios_form','burbuja_global')
      AND p_propiedad_id IS NULL AND p_proyecto_slug IS NULL;
  END IF;
  v_event_at:=clock_timestamp();
  IF NOT v_payload_valid THEN
    INSERT INTO private.qr_contactos_v1(
      request_id,resultado,evidencia,cookie_candidates_hash,event_at
    ) VALUES(p_request_id,'payload_invalid','payload_invalid',
      v_authentic_hashes,v_event_at);
    UPDATE private.qr_consulta_requests_v1
    SET estado='rechazada',resultado='payload_invalid',completed_at=v_event_at
    WHERE request_id=p_request_id;
    RETURN jsonb_build_object('ok',false,'resultado','payload_invalid','replayed',false);
  END IF;

  IF p_cookie_scan_state='overflow' THEN
    v_resultado:='contacto_directo_cookie_overflow';
    v_evidencia:='cookie_family_overflow';
  ELSIF jsonb_array_length(p_cookie_candidates)=0 THEN
    v_resultado:='contacto_directo'; v_evidencia:='sin_handoff';
  ELSE
    SELECT i.* INTO v_ingreso
    FROM jsonb_array_elements(p_cookie_candidates) c(value)
    JOIN private.qr_ingresos_v1 i
      ON i.handoff_key_id=c.value->>'kid'
      AND i.handoff_hash=decode(c.value->>'hash','hex')
      AND i.request_id=(substr(c.value->>'slot',1,8)||'-'||substr(c.value->>'slot',9,4)||'-'||
        substr(c.value->>'slot',13,4)||'-'||substr(c.value->>'slot',17,4)||'-'||
        substr(c.value->>'slot',21,12))::uuid
    ORDER BY i.created_at DESC,i.event_seq DESC,i.id DESC LIMIT 1;
    IF NOT FOUND THEN
      v_resultado:='contacto_directo_token_invalido'; v_evidencia:='handoff_invalido';
    ELSIF EXISTS(SELECT 1 FROM private.qr_handoff_revocaciones_v1 r
        WHERE r.handoff_hash=v_ingreso.handoff_hash AND r.resultado='applied') THEN
      v_resultado:='contacto_directo_token_revocado'; v_evidencia:='handoff_revocado';
    ELSIF v_ingreso.handoff_expira<=v_event_at THEN
      v_resultado:='contacto_directo_token_vencido'; v_evidencia:='handoff_vencido';
    ELSE
      v_resultado:='contacto_atribuido'; v_evidencia:='handoff_verificado';
    END IF;
  END IF;

  IF v_resultado='contacto_atribuido' THEN
    v_handoff_bucket:=extensions.digest(
      convert_to('qr-rate-v1/contact/handoff','UTF8')||decode('00','hex')||
      v_ingreso.handoff_hash,'sha256'
    );
    SELECT permitido,window_end,retry_after
    INTO STRICT v_rate_allowed,v_rate_until,v_retry_after
    FROM private.qr_rate_consumir_v1(
      'contacto_handoff',v_handoff_bucket,v_event_at,3
    );
    IF NOT v_rate_allowed THEN
      INSERT INTO private.qr_contactos_v1(
        request_id,resultado,evidencia,cookie_candidates_hash,
        rate_limited_until,event_at
      ) VALUES(
        p_request_id,'rate_limited','rate_limited',v_authentic_hashes,
        v_rate_until,v_event_at
      );
      UPDATE private.qr_consulta_requests_v1
      SET estado='rechazada',resultado='rate_limited',
          rate_limited_until=v_rate_until,completed_at=clock_timestamp()
      WHERE request_id=p_request_id;
      RETURN jsonb_build_object('ok',false,'resultado','rate_limited',
        'retry_after',v_retry_after,'rate_limited_until',v_rate_until,'replayed',false);
    END IF;
  END IF;

  IF v_resultado='contacto_atribuido' THEN
    BEGIN
      v_contacto_id:=gen_random_uuid();
      INSERT INTO private.qr_contacto_insert_context_v1(
        backend_pid,transaction_id,contacto_id,request_id,ingreso_id,canal_ref,canal_via
      ) VALUES(pg_backend_pid(),txid_current(),v_contacto_id,p_request_id,
        v_ingreso.id,v_ingreso.codigo,v_ingreso.via);
      INSERT INTO public.contactos(
        id,nombre,email,telefono,mensaje,propiedad_id,proyecto_slug,
        canal_ref,canal_via,origen
      ) VALUES(v_contacto_id,p_nombre,p_email,p_telefono,p_mensaje,
        p_propiedad_id,p_proyecto_slug,v_ingreso.codigo,v_ingreso.via,'web');
      SELECT c.fecha INTO STRICT v_event_at FROM public.contactos c WHERE c.id=v_contacto_id;
      INSERT INTO private.qr_contactos_v1(
        request_id,contacto_id,ingreso_id,resultado,evidencia,fuente,
        propiedad_id,proyecto_slug,canal_ref,canal_via,campana_id,
        cookie_candidates_hash,event_at
      ) VALUES(p_request_id,v_contacto_id,v_ingreso.id,v_resultado,v_evidencia,p_fuente,
        p_propiedad_id,p_proyecto_slug,v_ingreso.codigo,v_ingreso.via,v_ingreso.campana_id,
        v_authentic_hashes,v_event_at);
      DELETE FROM private.qr_contacto_insert_context_v1
      WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
    EXCEPTION WHEN OTHERS THEN
      v_resultado:='degradado_vinculo'; v_evidencia:='vinculo_degradado';
      v_contacto_id:=NULL;
    END;
  END IF;

  IF v_contacto_id IS NULL THEN
    v_contacto_id:=gen_random_uuid();
    INSERT INTO public.contactos(
      id,nombre,email,telefono,mensaje,propiedad_id,proyecto_slug,
      canal_ref,canal_via,origen
    ) VALUES(v_contacto_id,p_nombre,p_email,p_telefono,p_mensaje,
      p_propiedad_id,p_proyecto_slug,NULL,NULL,'web');
    SELECT c.fecha INTO STRICT v_event_at FROM public.contactos c WHERE c.id=v_contacto_id;
    INSERT INTO private.qr_contactos_v1(
      request_id,contacto_id,resultado,evidencia,fuente,propiedad_id,
      proyecto_slug,cookie_candidates_hash,event_at
    ) VALUES(p_request_id,v_contacto_id,v_resultado,v_evidencia,p_fuente,
      p_propiedad_id,p_proyecto_slug,v_authentic_hashes,v_event_at);
  END IF;

  UPDATE private.qr_consulta_requests_v1
  SET estado='confirmada',resultado=v_resultado,contacto_id=v_contacto_id,
      completed_at=clock_timestamp()
  WHERE request_id=p_request_id;
  RETURN jsonb_build_object('ok',true,'resultado',v_resultado,
    'contacto_id',v_contacto_id,'replayed',false);
END
$fn$;

REVOKE ALL ON TABLE private.qr_consulta_requests_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_contactos_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_persona_ultimo_canal_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_handoff_revocaciones_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_contacto_insert_context_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_consulta_request_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_handoff_revocacion_lock_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_contacto_contexto_valido_v1(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_consulta_core_v1(
  text,text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb
)
  FROM PUBLIC,anon,authenticated,service_role;
