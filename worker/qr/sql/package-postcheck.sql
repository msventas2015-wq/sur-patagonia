-- FAIL-CLOSED POSTCHECK. Runs before COMMIT in package-forward.sql and can be
-- run independently afterwards with qr_cycle_id set to the installed cycle.

DO $postcheck$
DECLARE v_expected jsonb; v_current jsonb;
BEGIN
  IF current_setting('qr.install.project_ref',true) IS DISTINCT FROM 'rsjwqmpseknvydistgfr'
    OR current_setting('qr.install.environment',true) IS DISTINCT FROM 'qa' THEN
    RAISE EXCEPTION 'QR_POSTCHECK_ENVIRONMENT_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.qr_runtime_gate_v1
      WHERE ambiente='qa' AND version=1 AND accepting AND motivo='active') THEN
    RAISE EXCEPTION 'QR_POSTCHECK_GATE_NOT_ACTIVE';
  END IF;
  IF to_regprocedure('public.qr_resolver_anon_v1(text)') IS NULL
    OR to_regprocedure('public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)') IS NULL
    OR to_regprocedure('public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)') IS NULL
    OR to_regprocedure('public.qr_pageview_registrar_interno_v1(text,uuid,bytea,text,uuid,text,uuid,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)') IS NULL
    OR to_regprocedure('public.qr_destino_activo_preparar_v1(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.qr_destino_activo_aplicar_v1(uuid,text,boolean)') IS NULL
    OR to_regprocedure('public.rpc_admin_recorrido_persona_v1(uuid,timestamptz,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'QR_POSTCHECK_REQUIRED_FUNCTION_MISSING';
  END IF;
  IF NOT has_function_privilege('anon','public.qr_resolver_anon_v1(text)','EXECUTE')
    OR has_function_privilege('anon','public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)','EXECUTE')
    OR has_function_privilege('authenticated','public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.qr_resolver_registrar_interno_v1(text,uuid,bytea,text,text,bytea,text,bytea,bytea,text,timestamptz,text,integer,integer,jsonb,text,text,uuid,bytea)','EXECUTE') THEN
    RAISE EXCEPTION 'QR_POSTCHECK_FUNCTION_ACL_INVALID';
  END IF;
  IF has_table_privilege('anon','public.visitas','INSERT')
    OR has_table_privilege('anon','public.contactos','INSERT')
    OR has_table_privilege('anon','public.visitas','TRUNCATE')
    OR has_table_privilege('anon','public.personas','TRUNCATE')
    OR has_table_privilege('anon','public.crm_eventos','TRUNCATE')
    OR has_table_privilege('authenticated','public.visitas','INSERT')
    OR NOT has_table_privilege('authenticated','public.contactos','INSERT')
    OR has_table_privilege('authenticated','public.visitas','TRUNCATE')
    OR has_table_privilege('authenticated','public.personas','TRUNCATE')
    OR has_table_privilege('authenticated','public.crm_eventos','TRUNCATE') THEN
    RAISE EXCEPTION 'QR_POSTCHECK_LEGACY_DOOR_OPEN';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='contactos'
        AND policyname='Insertar contactos') THEN
    RAISE EXCEPTION 'QR_POSTCHECK_PUBLIC_WEB_CONTACT_POLICY_OPEN';
  END IF;
  IF EXISTS(SELECT 1 FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
      WHERE public.es_canal_pasivo(c.tipo) AND r.destino IS DISTINCT FROM c.destino) THEN
    RAISE EXCEPTION 'QR_POSTCHECK_PASSIVE_DESTINATION_DIVERGENCE';
  END IF;
  IF (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.contactos'::regclass
      AND attname='email' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'QR_POSTCHECK_CONTACT_EMAIL_STILL_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM public.campanas)
      IS DISTINCT FROM (SELECT count(*) FROM private.qr_campana_control_v1) THEN
    RAISE EXCEPTION 'QR_POSTCHECK_CAMPAIGN_CONTROL_INCOMPLETE';
  END IF;
  SELECT business_snapshot INTO STRICT v_expected
  FROM auditoria_privada.qr_blindaje_v19_backups
  WHERE cycle_id=current_setting('qr.install.cycle_id')::uuid;
  SELECT jsonb_build_object(
    'canales',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.canales c),'[]'::jsonb),
    'referencias',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.referencias r),'[]'::jsonb),
    'referencia_propiedad',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.propiedad_id) FROM public.referencia_propiedad x),'[]'::jsonb),
    'referencia_proyecto',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.referencia_id,x.proyecto_id) FROM public.referencia_proyecto x),'[]'::jsonb),
    'campanas',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.campanas c),'[]'::jsonb),
    'campanas_canales',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.campana_id,x.canal_id) FROM public.campanas_canales x),'[]'::jsonb)
  ) INTO v_current;
  IF v_current IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'QR_POSTCHECK_BUSINESS_BASELINE_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.referencias'::regclass
      AND tgname='qr_destino_activo_guard_v1' AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'QR_POSTCHECK_ACTIVE_DESTINATION_GUARD_MISSING';
  END IF;
  IF to_regprocedure('private.qr_archivar_con_notificacion_v1(text,uuid,text,text)') IS NULL
    OR position('qr_archivar_con_notificacion_v1' IN
      pg_get_functiondef('public.admin_archivar_propiedad(uuid,text,text)'::regprocedure))=0
    OR position('qr_archivar_con_notificacion_v1' IN
      pg_get_functiondef('public.admin_archivar_proyecto(uuid,text,text)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'QR_POSTCHECK_P2_NOTIFICATION_WRAPPER_MISSING';
  END IF;
END
$postcheck$;
