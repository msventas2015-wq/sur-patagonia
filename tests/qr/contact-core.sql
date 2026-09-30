-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA private; CREATE SCHEMA auth;
DO $roles$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $roles$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

CREATE TABLE public.canales(id uuid PRIMARY KEY,activo boolean NOT NULL);
CREATE TABLE public.referencias(id uuid PRIMARY KEY,canal_id uuid NOT NULL REFERENCES public.canales,
  codigo text UNIQUE NOT NULL,activo boolean NOT NULL);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY,activa boolean NOT NULL);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY,slug text UNIQUE NOT NULL,estado text NOT NULL);
CREATE TABLE public.visitas(id uuid PRIMARY KEY);
CREATE TABLE public.personas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),estado_persona text,nombre text,email_norm text,
  celular_norm text,fijo_norm text,primera_fecha timestamptz,primer_canal_ref text,
  vence_atribucion_at timestamptz,retencion_hasta timestamptz,created_at timestamptz DEFAULT clock_timestamp()
);
CREATE TABLE public.contactos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text NOT NULL,email text NOT NULL,
  telefono text,mensaje text,propiedad_id uuid REFERENCES public.propiedades,proyecto_slug text,
  canal_ref text,canal_via text,origen text NOT NULL DEFAULT 'web',persona_id uuid REFERENCES public.personas,
  estado text DEFAULT 'nueva',fecha timestamptz DEFAULT clock_timestamp(),created_at timestamptz DEFAULT clock_timestamp()
);
CREATE FUNCTION public.normalizar_email(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT nullif(lower(btrim(p)),'') $$;
CREATE FUNCTION public.normalizar_telefono_ar(p text) RETURNS text LANGUAGE sql IMMUTABLE
AS $$ SELECT nullif(regexp_replace(coalesce(p,''),'[^0-9+]','','g'),'') $$;
CREATE FUNCTION public.fixture_contact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.fecha:=clock_timestamp();new.created_at:=new.fecha;RETURN new;END $$;
CREATE TRIGGER aa_contact_guard BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.fixture_contact_guard();
CREATE FUNCTION public.validar_canal_ref() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN new; END $$;
CREATE TRIGGER contactos_validar_canal BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.validar_canal_ref();
CREATE FUNCTION public.contactos_resolver_persona() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN new; END $$;
CREATE TRIGGER zz_contactos_resolver_persona BEFORE INSERT ON public.contactos
FOR EACH ROW EXECUTE FUNCTION public.contactos_resolver_persona();

\ir ../../worker/qr/sql/ledger-schema.sql
CREATE FUNCTION private.qr_runtime_contexto_consumir_v1(text,text,uuid)
RETURNS void LANGUAGE sql VOLATILE AS $$ SELECT $$;
CREATE FUNCTION private.qr_rate_consumir_v1(
  p_scope text,p_hash bytea,p_at timestamptz,p_limit integer
)
RETURNS TABLE(permitido boolean,window_start timestamptz,window_end timestamptz,
  contador integer,retry_after integer)
LANGUAGE sql VOLATILE AS $$
  SELECT true,p_at,p_at+interval '10 minutes',1,600
$$;
\ir ../../worker/qr/sql/contact-core.sql

CREATE FUNCTION private.fixture_qr_consulta_core_v1(
  p_modo text,p_request_id uuid,p_payload_hash bytea,p_payload_key_id text,
  p_nombre text,p_email text,p_telefono text,p_mensaje text,p_propiedad_id uuid,
  p_proyecto_slug text,p_fuente text,p_extra_enabled boolean,p_cookie_candidates jsonb
)
RETURNS jsonb LANGUAGE sql VOLATILE AS $fixture$
  SELECT private.qr_consulta_core_v1(
    'worker','qa',p_request_id,p_payload_hash,p_payload_key_id,p_nombre,p_email,
    p_telefono,p_mensaje,p_propiedad_id,p_proyecto_slug,p_fuente,
    extensions.digest(uuid_send(p_request_id),'sha256'),
    CASE WHEN p_extra_enabled THEN 'within_limit' ELSE 'overflow' END,
    CASE WHEN p_extra_enabled THEN jsonb_array_length(p_cookie_candidates) ELSE 33 END,
    CASE WHEN p_extra_enabled THEN 0 ELSE 0 END,
    CASE WHEN p_extra_enabled THEN p_cookie_candidates ELSE '[]'::jsonb END
  )
$fixture$;

DO $test$
DECLARE
  v_canal uuid:='10000000-0000-4000-8000-000000000001';
  v_ref uuid:='10000000-0000-4000-8000-000000000002';
  v_canal_newer uuid:='10000000-0000-4000-8000-000000000014';
  v_ref_newer uuid:='10000000-0000-4000-8000-000000000015';
  v_visita uuid:='10000000-0000-4000-8000-000000000003';
  v_ingreso uuid:='10000000-0000-4000-8000-000000000004';
  v_ingress_request uuid:='10000000-0000-4000-8000-000000000005';
  v_property uuid:='10000000-0000-4000-8000-000000000006';
  v_at timestamptz:=clock_timestamp()-interval '1 day';
  v_at_newer timestamptz:=clock_timestamp()-interval '12 hours';
  v_handoff bytea:=decode(repeat('22',32),'hex');
  v_payload bytea:=decode(repeat('11',32),'hex');
  v_candidate jsonb:=jsonb_build_array(jsonb_build_object(
    'slot','10000000000040008000000000000005','kid','test','hash',repeat('22',32)));
  v_candidate_moved jsonb:=jsonb_build_array(jsonb_build_object(
    'slot','99999999000040008000000000000009','kid','test','hash',repeat('22',32)));
  v_candidate_newer jsonb:=jsonb_build_array(jsonb_build_object(
    'slot','10000000000040008000000000000009','kid','test','hash',repeat('24',32)));
  v_result jsonb;
  v_first_contact uuid;
  v_person uuid;
BEGIN
  -- Preserve the live admin contract: a manual contact may be direct, but an
  -- explicitly supplied nonexistent reference must still be rejected.
  INSERT INTO public.contactos(id,nombre,email,mensaje,canal_ref,canal_via,origen)
  VALUES('05000000-0000-4000-8000-000000000001','Manual directo',
    'manual-directo@example.invalid','Alta manual',NULL,NULL,'manual');
  BEGIN
    INSERT INTO public.contactos(id,nombre,email,mensaje,canal_ref,canal_via,origen)
    VALUES('05000000-0000-4000-8000-000000000002','Manual inválido',
      'manual-invalido@example.invalid','Alta manual','no-existe','qr','manual');
    RAISE EXCEPTION 'manual_invalid_reference_not_rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.contactos(id,nombre,email,mensaje,canal_ref,canal_via,origen)
  VALUES('05000000-0000-4000-8000-000000000003','Web inválido',
    'web-invalido@example.invalid','Alta web','no-existe','qr','web');
  IF EXISTS(SELECT 1 FROM public.contactos
      WHERE id='05000000-0000-4000-8000-000000000003'
        AND (canal_ref IS NOT NULL OR canal_via IS DISTINCT FROM 'qr')) THEN
    RAISE EXCEPTION 'web_invalid_reference_legacy_behavior_changed';
  END IF;

  INSERT INTO public.canales VALUES(v_canal,true);
  INSERT INTO public.referencias VALUES(v_ref,v_canal,'qa-channel',true);
  INSERT INTO public.canales VALUES(v_canal_newer,true);
  INSERT INTO public.referencias VALUES(v_ref_newer,v_canal_newer,'qa-cafe',true);
  INSERT INTO public.visitas VALUES(v_visita);
  INSERT INTO public.propiedades VALUES(v_property,true);
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES(v_ingress_request,1,v_payload,'v1','tracked',200,
    '/propiedad.html?id='||v_property,v_ingreso,v_at);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,propiedad_id,
    landing_id,landing_pageview_request_id,handoff_hash,handoff_key_id,
    handoff_expira,payload_hash,payload_key_id,created_at
  ) VALUES(v_ingreso,1,v_ingress_request,v_visita,v_ref,v_canal,'qa-channel','qr',
    '/propiedad.html?id='||v_property,'/propiedad.html?id='||v_property,'base',
    '/propiedad',v_property,'10000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000008',v_handoff,'test',
    v_at+interval '400 days',v_payload,'v1',v_at);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;

  -- Archived after the real ingress: the demonstrated historic origin survives.
  UPDATE public.referencias SET activo=false WHERE id=v_ref;
  UPDATE public.canales SET activo=false WHERE id=v_canal;
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000001',decode(repeat('31',32),'hex'),'v1',
    'Primera persona','persona@example.invalid',NULL,'Consulta uno',v_property,NULL,
    'propiedad_form',true,v_candidate);
  IF v_result->>'resultado'<>'contacto_atribuido' THEN
    RAISE EXCEPTION 'attributed_failed:%',v_result;
  END IF;
  v_first_contact:=(v_result->>'contacto_id')::uuid;
  SELECT persona_id INTO STRICT v_person FROM public.contactos WHERE id=v_first_contact;
  IF (SELECT canal_ref FROM public.contactos WHERE id=v_first_contact) IS DISTINCT FROM 'qa-channel'
    OR (SELECT count(*) FROM private.qr_contactos_v1 WHERE ingreso_id=v_ingreso)<>1 THEN
    RAISE EXCEPTION 'historic_attribution_failed';
  END IF;

  -- The same ingress legitimately supports another later consultation.
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000002',decode(repeat('32',32),'hex'),'v1',
    'Nombre hostil','PERSONA@example.invalid','+542944123456','Consulta dos',v_property,NULL,
    'propiedad_whatsapp',true,v_candidate);
  IF v_result->>'resultado'<>'contacto_atribuido'
    OR (SELECT count(*) FROM private.qr_contactos_v1 WHERE ingreso_id=v_ingreso)<>2
    OR (SELECT count(*) FROM private.qr_ingresos_v1 WHERE id=v_ingreso)<>1 THEN
    RAISE EXCEPTION 'multi_contact_one_ingress_failed';
  END IF;
  IF (SELECT nombre FROM public.personas WHERE id=v_person) IS DISTINCT FROM 'Primera persona'
    OR (SELECT retencion_hasta FROM public.personas WHERE id=v_person) IS NOT NULL THEN
    RAISE EXCEPTION 'web_profile_or_retention_regression';
  END IF;

  -- Direct later consultation never erases or fabricates the previous evidence.
  v_result:=private.fixture_qr_consulta_core_v1('fallback',
    '20000000-0000-4000-8000-000000000003',decode(repeat('33',32),'hex'),'v1',
    'Primera persona','persona@example.invalid',NULL,'Consulta directa',NULL,NULL,
    'home_form',true,'[]'::jsonb);
  IF v_result->>'resultado'<>'contacto_directo'
    OR EXISTS(SELECT 1 FROM public.contactos c WHERE c.id=(v_result->>'contacto_id')::uuid
      AND (c.canal_ref IS NOT NULL OR c.canal_via IS NOT NULL))
    OR (SELECT count(*) FROM private.qr_contactos_v1 WHERE ingreso_id=v_ingreso)<>2 THEN
    RAISE EXCEPTION 'direct_non_interference_failed';
  END IF;

  -- Idempotent replay does not duplicate business rows; changed payload conflicts.
  IF (private.fixture_qr_consulta_core_v1('fallback',
    '20000000-0000-4000-8000-000000000003',decode(repeat('33',32),'hex'),'v1',
    'Ignored on replay','persona@example.invalid',NULL,'Ignored',NULL,NULL,
    'home_form',true,'[]'::jsonb)->>'replayed')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'idempotent_replay_failed';
  END IF;
  BEGIN
    PERFORM private.fixture_qr_consulta_core_v1('fallback',
      '20000000-0000-4000-8000-000000000003',decode(repeat('44',32),'hex'),'v1',
      'X','x@example.invalid',NULL,'X',NULL,NULL,'home_form',true,'[]'::jsonb);
    RAISE EXCEPTION 'idempotency_conflict_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_CONTACT_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;

  -- Semantic content mismatch is a stable negative ledger, not a lost request.
  v_result:=private.fixture_qr_consulta_core_v1('fallback',
    '20000000-0000-4000-8000-000000000004',decode(repeat('34',32),'hex'),'v1',
    'QA','qa@example.invalid',NULL,'Inválida',NULL,NULL,
    'propiedad_form',true,'[]'::jsonb);
  IF v_result->>'resultado'<>'payload_invalid'
    OR (SELECT estado FROM private.qr_consulta_requests_v1
      WHERE request_id='20000000-0000-4000-8000-000000000004')<>'rechazada' THEN
    RAISE EXCEPTION 'negative_ledger_failed';
  END IF;

  -- A failure in the optional attributed pair rolls back that pair and still
  -- creates exactly one direct contact, without claiming its channel.
  CREATE FUNCTION private.fixture_fail_attributed_link() RETURNS trigger LANGUAGE plpgsql AS $x$
  BEGIN IF new.ingreso_id IS NOT NULL THEN RAISE EXCEPTION 'fixture_link_failure'; END IF; RETURN new; END $x$;
  CREATE TRIGGER fixture_fail_attributed_link BEFORE INSERT ON private.qr_contactos_v1
  FOR EACH ROW EXECUTE FUNCTION private.fixture_fail_attributed_link();
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000005',decode(repeat('35',32),'hex'),'v1',
    'QA degradado','degradado@example.invalid',NULL,'No perder',v_property,NULL,
    'propiedad_form',true,v_candidate);
  DROP TRIGGER fixture_fail_attributed_link ON private.qr_contactos_v1;
  IF v_result->>'resultado'<>'degradado_vinculo'
    OR (SELECT count(*) FROM public.contactos c WHERE c.email='degradado@example.invalid')<>1
    OR EXISTS(SELECT 1 FROM public.contactos c WHERE c.email='degradado@example.invalid'
      AND (c.canal_ref IS NOT NULL OR c.canal_via IS NOT NULL)) THEN
    RAISE EXCEPTION 'savepoint_degrade_failed:%',v_result;
  END IF;

  -- A valid capability moved under another slot is not authentic in SQL.
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000006',decode(repeat('36',32),'hex'),'v1',
    'Slot movido','slot@example.invalid',NULL,'No atribuir',NULL,NULL,
    'home_form',true,v_candidate_moved);
  IF v_result->>'resultado'<>'contacto_directo_token_invalido' THEN
    RAISE EXCEPTION 'moved_slot_not_rejected:%',v_result;
  END IF;
  BEGIN
    PERFORM private.fixture_qr_consulta_core_v1('worker',
      '20000000-0000-4000-8000-000000000007',decode(repeat('37',32),'hex'),'v1',
      'Slot doble','doble@example.invalid',NULL,'No aceptar',NULL,NULL,'home_form',true,
      v_candidate||v_candidate);
    RAISE EXCEPTION 'duplicate_slot_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_CONTACT_INPUT_INVALID' THEN RAISE; END IF;
  END;

  -- Disabling the optional memory still saves one direct, phone-only query.
  v_result:=private.fixture_qr_consulta_core_v1('fallback',
    '20000000-0000-4000-8000-000000000008',decode(repeat('38',32),'hex'),'v1',
    'Sólo teléfono',NULL,'+542944000001','Consulta sin correo',NULL,NULL,
    'home_form',false,v_candidate);
  IF v_result->>'resultado'<>'contacto_directo_cookie_overflow'
    OR (SELECT count(*) FROM public.contactos WHERE email IS NULL AND telefono='+542944000001')<>1 THEN
    RAISE EXCEPTION 'extra_disabled_or_phone_only_failed:%',v_result;
  END IF;

  -- A newer authentic but revoked handoff makes the query direct; it never
  -- resurrects the older authentic ingress.
  INSERT INTO public.visitas VALUES('10000000-0000-4000-8000-000000000013');
  INSERT INTO private.qr_resoluciones_v1(
    request_id,event_seq,payload_hash,payload_key_id,resultado,http_status,
    destino_seguro,ingreso_id,created_at
  ) VALUES('10000000-0000-4000-8000-000000000009',2,decode(repeat('23',32),'hex'),
    'v1','tracked',200,'/','10000000-0000-4000-8000-000000000010',v_at_newer);
  INSERT INTO private.qr_ingresos_v1(
    id,event_seq,request_id,visita_id,referencia_id,canal_id,codigo,via,
    destino_base,destino_efectivo,destino_fuente,pagina,landing_id,
    landing_pageview_request_id,handoff_hash,handoff_key_id,handoff_expira,
    payload_hash,payload_key_id,created_at
  ) VALUES('10000000-0000-4000-8000-000000000010',2,
    '10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000013',
    v_ref_newer,v_canal_newer,'qa-cafe','qr','/','/','base','/',
    '10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000012',
    decode(repeat('24',32),'hex'),'test',v_at_newer+interval '400 days',
    decode(repeat('23',32),'hex'),'v1',v_at_newer);

  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000010',decode(repeat('40',32),'hex'),'v1',
    'Cafetería','persona@example.invalid',NULL,'Consulta en café',NULL,NULL,
    'home_form',true,v_candidate_newer);
  IF v_result->>'resultado'<>'contacto_atribuido' THEN
    RAISE EXCEPTION 'newer_attribution_failed:%',v_result;
  END IF;
  -- A later form using the old channel keeps its own truthful origin but does
  -- not displace the newer real ingress in the person projection.
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000011',decode(repeat('41',32),'hex'),'v1',
    'Cookie vieja','persona@example.invalid',NULL,'Consulta posterior',NULL,NULL,
    'home_form',true,v_candidate);
  IF v_result->>'resultado'<>'contacto_atribuido'
    OR (SELECT canal_ref FROM private.qr_persona_ultimo_canal_v1
      WHERE persona_id=v_person) IS DISTINCT FROM 'qa-cafe' THEN
    RAISE EXCEPTION 'older_cookie_displaced_newer_ingress:%',v_result;
  END IF;

  INSERT INTO private.qr_handoff_revocaciones_v1(
    request_id,ingreso_id_solicitado,handoff_hash,payload_hash,payload_key_id,
    actor_user_id,motivo,resultado,http_status
  ) VALUES('30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000010',decode(repeat('24',32),'hex'),
    decode(repeat('25',32),'hex'),'v1','30000000-0000-4000-8000-000000000002',
    'comprometido','applied',200);
  BEGIN
    INSERT INTO private.qr_handoff_revocaciones_v1(
      request_id,ingreso_id_solicitado,handoff_hash,payload_hash,payload_key_id,
      actor_user_id,motivo,resultado,http_status
    ) VALUES('30000000-0000-4000-8000-000000000003',v_ingreso,
      decode(repeat('24',32),'hex'),decode(repeat('26',32),'hex'),'v1',
      '30000000-0000-4000-8000-000000000004','comprometido','applied',200);
    RAISE EXCEPTION 'revocation_ingress_mismatch_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_HANDOFF_REVOCATION_INGRESS_MISMATCH' THEN RAISE; END IF;
  END;
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000012',decode(repeat('39',32),'hex'),'v1',
    'Revocado','revocado@example.invalid',NULL,'No resucitar',NULL,NULL,'home_form',true,
    v_candidate||v_candidate_newer);
  IF v_result->>'resultado'<>'contacto_directo_token_revocado'
    OR EXISTS(SELECT 1 FROM public.contactos c WHERE c.id=(v_result->>'contacto_id')::uuid
      AND c.canal_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'revoked_latest_resurrected_old:%',v_result;
  END IF;

  -- Project mini accepts only an active exact slug.
  INSERT INTO public.proyectos VALUES(
    '60000000-0000-4000-8000-000000000001','proyecto-activo','activo'
  ),(
    '60000000-0000-4000-8000-000000000002','proyecto-inactivo','inactivo'
  );
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000013',decode(repeat('42',32),'hex'),'v1',
    'Proyecto activo','proyecto@example.invalid',NULL,'Consulta proyecto',NULL,
    'proyecto-activo','proyecto_mini_form',true,'[]'::jsonb);
  IF v_result->>'resultado'<>'contacto_directo' THEN
    RAISE EXCEPTION 'active_project_rejected:%',v_result;
  END IF;
  v_result:=private.fixture_qr_consulta_core_v1('worker',
    '20000000-0000-4000-8000-000000000014',decode(repeat('43',32),'hex'),'v1',
    'Proyecto inactivo','inactivo@example.invalid',NULL,'Consulta proyecto',NULL,
    'proyecto-inactivo','proyecto_mini_form',true,'[]'::jsonb);
  IF v_result->>'resultado'<>'payload_invalid' THEN
    RAISE EXCEPTION 'inactive_project_accepted:%',v_result;
  END IF;

  -- A browser insert cannot forge the archived channel without the exact
  -- owner-only, same-transaction contact context.
  INSERT INTO public.contactos(id,nombre,email,mensaje,canal_ref,canal_via,origen)
  VALUES('40000000-0000-4000-8000-000000000001','Forjado','forjado@example.invalid',
    'Intento','qa-channel','qr','web');
  IF EXISTS(SELECT 1 FROM public.contactos
      WHERE id='40000000-0000-4000-8000-000000000001'
        AND canal_ref IS NOT NULL) THEN
    RAISE EXCEPTION 'historical_context_forge_succeeded';
  END IF;

  BEGIN
    UPDATE private.qr_contactos_v1 SET evidencia='sin_handoff'
    WHERE contacto_id=v_first_contact;
    RAISE EXCEPTION 'contact_ledger_update_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.qr_consulta_requests_v1
    WHERE request_id='20000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'request_delete_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_CONSULTA_LEDGER_APPEND_ONLY' THEN RAISE; END IF;
  END;

  IF has_table_privilege('anon','private.qr_contactos_v1','SELECT')
    OR has_table_privilege('authenticated','private.qr_consulta_requests_v1','INSERT')
    OR has_function_privilege('service_role',
      'private.qr_consulta_core_v1(text,text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'private_acl_failed';
  END IF;
END
$test$;

ROLLBACK;
\echo 'contact-core-pass'
