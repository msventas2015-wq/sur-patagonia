-- QA-ONLY transactional qualification. Each writer case has an independent
-- transaction so E2 context cannot leak between exceptional destination and
-- P2 archive flows. Every mutation is rolled back before this file exits.
\set ON_ERROR_STOP on

SELECT id AS qr_admin_id FROM auth.users
WHERE deleted_at IS NULL AND raw_app_meta_data->>'rol'='admin'
ORDER BY created_at LIMIT 1 \gset

-- Case 1: baseline invariants and an ordinary direct write are rejected by
-- the outer E2 statement guard (or, defensively, by the QR row guard).
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('request.jwt.claim.sub', :'qr_admin_id', true);
DO $direct_guard$
DECLARE v_ref public.referencias%ROWTYPE; v_new_dest text;
BEGIN
  IF has_table_privilege('authenticated','public.visitas','INSERT')
    OR NOT has_table_privilege('authenticated','public.contactos','INSERT') THEN
    RAISE EXCEPTION 'QR_QA_AUTHENTICATED_WRITE_BOUNDARY_INVALID';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='contactos'
        AND policyname='Insertar contactos') THEN
    RAISE EXCEPTION 'QR_QA_PUBLIC_WEB_CONTACT_POLICY_OPEN';
  END IF;
  IF EXISTS(SELECT 1 FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
      WHERE public.es_canal_pasivo(c.tipo) AND r.destino IS DISTINCT FROM c.destino) THEN
    RAISE EXCEPTION 'QR_QA_PASSIVE_DESTINATION_DIVERGENCE';
  END IF;
  IF (SELECT count(*) FROM public.referencias)<>117 THEN
    RAISE EXCEPTION 'QR_QA_REFERENCE_BASELINE_CHANGED';
  END IF;
  SELECT r.* INTO STRICT v_ref
  FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
  WHERE r.activo AND c.activo AND NOT public.es_canal_pasivo(c.tipo)
    AND c.user_id IS NOT NULL
  ORDER BY r.id LIMIT 1;
  v_new_dest:=CASE WHEN v_ref.destino='/' THEN '/propiedades' ELSE '/' END;
  BEGIN
    UPDATE public.referencias SET destino=v_new_dest WHERE id=v_ref.id;
    RAISE EXCEPTION 'QR_QA_DIRECT_ACTIVE_CHANGE_WAS_ALLOWED';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      IF position('E2_CLIENTE_DESACTUALIZADO' IN SQLERRM)=0 THEN RAISE; END IF;
    WHEN raise_exception THEN
      IF SQLERRM<>'QR_DESTINO_ACTIVO_REQUIERE_PROCESO_EXCEPCIONAL' THEN RAISE; END IF;
  END;
END
$direct_guard$;
ROLLBACK;

-- Case 2: even inside a valid, non-P2 E2 context, the QR-specific row guard
-- refuses an active destination change that lacks the exceptional QR context.
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('request.jwt.claim.sub', :'qr_admin_id', true);
DO $qr_guard_inside_e2$
DECLARE v_ref public.referencias%ROWTYPE; v_new_dest text;
BEGIN
  SELECT r.* INTO STRICT v_ref
  FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
  WHERE r.activo AND c.activo AND NOT public.es_canal_pasivo(c.tipo)
    AND c.user_id IS NOT NULL
  ORDER BY r.id LIMIT 1;
  v_new_dest:=CASE WHEN v_ref.destino='/' THEN '/propiedades' ELSE '/' END;
  PERFORM private.e2_contexto_abrir_v6(
    auth.uid(),gen_random_uuid(),'referencia_guardar',true);
  BEGIN
    UPDATE public.referencias SET destino=v_new_dest WHERE id=v_ref.id;
    RAISE EXCEPTION 'QR_QA_QR_GUARD_INSIDE_E2_WAS_BYPASSED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_DESTINO_ACTIVO_REQUIERE_PROCESO_EXCEPCIONAL' THEN RAISE; END IF;
  END;
END
$qr_guard_inside_e2$;
ROLLBACK;

-- Case 3: the explicit, accepted active-destination operation succeeds and
-- leaves exactly one immutable change plus one targeted message.
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('request.jwt.claim.sub', :'qr_admin_id', true);
DO $exceptional_change$
DECLARE
  v_ref public.referencias%ROWTYPE;
  v_new_dest text;
  v_preview jsonb;
  v_applied jsonb;
  v_request uuid:=gen_random_uuid();
BEGIN
  SELECT r.* INTO STRICT v_ref
  FROM public.referencias r JOIN public.canales c ON c.id=r.canal_id
  WHERE r.activo AND c.activo AND NOT public.es_canal_pasivo(c.tipo)
    AND c.user_id IS NOT NULL
  ORDER BY r.id LIMIT 1;
  v_new_dest:=CASE WHEN v_ref.destino='/' THEN '/propiedades' ELSE '/' END;
  v_preview:=public.qr_destino_activo_preparar_v1(
    v_request,v_ref.id,v_new_dest,'Prueba QA transaccional del proceso excepcional');
  v_applied:=public.qr_destino_activo_aplicar_v1(
    v_request,v_preview->>'before_sha256',true);
  IF v_applied->>'ok'<>'true'
    OR (SELECT destino FROM public.referencias WHERE id=v_ref.id) IS DISTINCT FROM v_new_dest
    OR (SELECT count(*) FROM private.qr_destino_cambios_v1 WHERE request_id=v_request)<>1
    OR (SELECT count(*) FROM public.mensajes m JOIN private.qr_destino_cambios_v1 d
        ON d.mensaje_id=m.id WHERE d.request_id=v_request
          AND m.usuario_id IS NOT NULL AND jsonb_array_length(m.canal_ids)=1)<>1 THEN
    RAISE EXCEPTION 'QR_QA_EXCEPTIONAL_ACTIVE_CHANGE_FAILED';
  END IF;
END
$exceptional_change$;
ROLLBACK;

-- Case 4: P2 runs in a fresh transaction/context and archives an active
-- destination with its own targeted notification contract.
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('request.jwt.claim.sub', :'qr_admin_id', true);
DO $p2_notification$
DECLARE v_content uuid; v_content_preview jsonb; v_archive jsonb;
BEGIN
  SELECT p.id INTO v_content
  FROM public.propiedades p
  WHERE p.activa AND EXISTS(
    SELECT 1 FROM public.referencia_propiedad rp
    JOIN public.referencias r ON r.id=rp.referencia_id
    JOIN public.canales c ON c.id=r.canal_id
    WHERE rp.propiedad_id=p.id AND r.destino IS DISTINCT FROM '/'
      AND NOT public.es_canal_pasivo(c.tipo) AND c.user_id IS NOT NULL
  ) ORDER BY p.id LIMIT 1;
  IF v_content IS NULL THEN RAISE EXCEPTION 'QR_QA_P2_ACTIVE_FIXTURE_MISSING'; END IF;
  v_content_preview:=public.admin_previsualizar_archivado_propiedad(v_content);
  v_archive:=public.admin_archivar_propiedad(v_content,
    'Prueba QA transaccional de archivado y notificacion',v_content_preview->>'digest');
  IF coalesce((v_archive->>'canales_activos_notificados')::integer,0)<1 THEN
    RAISE EXCEPTION 'QR_QA_P2_ACTIVE_NOTIFICATION_MISSING:%',v_archive;
  END IF;
END
$p2_notification$;
ROLLBACK;

-- Case 5: the admin recorrido reader is callable without altering CRM data.
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
SELECT set_config('request.jwt.claim.sub', :'qr_admin_id', true);
DO $crm_reader$
DECLARE v_person uuid;
BEGIN
  SELECT id INTO v_person FROM public.personas ORDER BY created_at,id LIMIT 1;
  IF v_person IS NOT NULL THEN
    PERFORM public.rpc_admin_recorrido_persona_v1(v_person,NULL,NULL,20);
  END IF;
END
$crm_reader$;
ROLLBACK;

\echo 'PASS QA isolated transactional qualification; zero persisted test rows'
