-- PREPARADO, NO EJECUTADO. Destino nominal: wajkfydxutptcvvfwrvq.
-- Verificar la URL y el nombre visible del proyecto antes de ejecutar.
-- Migración miniweb_cierre_20261117: G4V2 y consulta UUID, una transacción.
-- Conservar el respaldo de funciones/ACL previo; no ejecutar rollbacks históricos
-- que rehabilitan V1. No crea proyectos ni contactos ni ejecuta RPC comerciales.
begin;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
DO $identidad$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) IS DISTINCT FROM '7642734024280108049'
    THEN RAISE EXCEPTION 'PASE_IDENTIDAD_DISTINTA'; END IF;
END
$identidad$;
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('qr-runtime-fence-v1/prod/1',0));
DO $guardas$
BEGIN
  IF NOT EXISTS (SELECT FROM private.qr_runtime_gate_v1 WHERE ambiente='prod' AND version=1 AND accepting AND motivo='active')
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.proyectos'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.contactos'::regclass AND t.tgname='ab_contactos_inmutabilidad_guard_v32'
        AND t.tgenabled='O' AND md5(p.prosrc)='be7c07a7306bb751d13fa35c9aa24b59')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.contactos'::regclass AND t.tgname='aa_contactos_insert_guard_v32'
        AND t.tgenabled='O' AND md5(p.prosrc)='8fcd84a039255c8779e4628445efa6cb')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.proyectos'::regclass AND t.tgname='qr_proyecto_insert_lock_v1'
        AND t.tgenabled='O' AND md5(p.prosrc)='d2a04464836a2a751afd7d894a429a87')
    OR EXISTS (SELECT FROM public.propiedades WHERE slug='terrazas-del-piltri')
    THEN RAISE EXCEPTION 'PASE_GUARDAS_O_DESTINO_DISTINTOS'; END IF;
END
$guardas$;
-- Invariantes QR contrastadas en producción17-nov; no leen filas de clientes.
-- Si la base cambió, abortar: no reemplazar a ciegas núcleo, E2 ni controles activos.
do $pase_qr_preflight$
declare esperado record;
begin
  if current_user <> 'postgres' then raise exception 'PASE_ROL_DE_MIGRACION_DISTINTO'; end if;
  for esperado in select * from (values
('private.e2_aplicar_operacion_v6(text,jsonb)','be99bfac44b22bc5c1da93d0ee82876b'),
('private.qr_consulta_core_v1(text,text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)','1ff003d049bda04c8afb0ddbfb460a3e'),
('private.qr_contacto_arguments_bytes_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)','35b45c61060d0f32dcdfab9648460b36'),
('private.qr_runtime_contexto_abrir_v1(text,text,uuid,uuid)','e4027acd2876c20f9f9c46787787653f'),
('private.qr_worker_assertion_consumir_v1(text,text,uuid,bytea,text,text,uuid,bytea)','30f5e907c8577298a5f4d3ec3c46a2b6'),
('public.admin_e2_aplicar(uuid,text,text,jsonb)','bc66f96e43c440275e3b33e77eb85a3f'),
('public.admin_e2_preparar(text,jsonb)','feabb7f17058027e751297e20827195c'),
('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)','3c29e795c9fb6ad110100cf1d1629045'),
('public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)','635d84d6db9fe6b700a69e2f907e0131'),
('public.qr_resolver_anon_v1(text)','d0cb50ec5d0055aba75f8877c9384656'),
('private.qr_destino_activo_estado_hash_v1(uuid)','4dd31764aa83c346176ad9a26b7568e1'),
('private.qr_destino_activo_guard_v1()','59291e5b32386c859ff7da102deb7c7c'),
('public.qr_destino_activo_aplicar_v1(uuid,text,boolean)','980a1328238f74c56e4a57d3318ef754'),
('public.qr_destino_activo_preparar_v1(uuid,uuid,text,text)','a06ca5c59b24c0137f910c4121b40e98')
  ) as base(firma,huella) loop
    if not exists(select 1 from pg_catalog.pg_proc p
      where p.oid=to_regprocedure(esperado.firma) and md5(p.prosrc)=esperado.huella
        and p.proowner='postgres'::regrole and p.prosecdef and p.proconfig=array['search_path=""']) then
      raise exception 'PASE_QR_BASE_DISTINTA:%',esperado.firma;
    end if;
  end loop;
  if to_regclass('private.qr_ingresos_v1') is null
    or to_regclass('private.qr_contactos_v1') is null
    or to_regclass('private.qr_consulta_requests_v1') is null then
    raise exception 'PASE_LEDGER_QR_AUSENTE';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('canales','referencias','referencia_propiedad',
      'destino_asignaciones','contactos','personas','crm_eventos') and c.relrowsecurity) <> 7 then
    raise exception 'PASE_FRONTERA_RLS_QR_DISTINTA';
  end if;
end
$pase_qr_preflight$;
do $pase_preflight$
begin
  if to_regprocedure('public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[])') is not null then
    raise exception 'PASE_V2_YA_INSTALADA_REVISAR_CORTE';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)') and md5(prosrc)='635d84d6db9fe6b700a69e2f907e0131') then
    raise exception 'PASE_CONSULTA_LEGADA_DISTINTA';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then raise exception 'PASE_DIGEST_AUSENTE'; end if;
  if exists(select 1 from public.proyectos where slug='terrazas-del-piltri' or id='29f8203d-fbd2-4bbb-8187-62464333a0b3') then
    raise exception 'PASE_TERRAZAS_EXISTENTE_NO_REINTENTAR';
  end if;
  if exists(select 1 from public.lotes where id=any(array['02480f60-8f77-4b82-a339-60eee57e825d','0441e5cc-bfb1-4ab4-b608-54667cfc114a','04d6f84b-f5a5-4d7e-9868-b847ae93f175','07ac5524-87c2-42ad-9745-0a51c024f962','08aa4d0a-95f5-4ad5-bc38-135c59659501','0a50ff0f-e086-4888-9cb7-d48bcf72f6ec','0b2254c4-e80b-4868-b47a-3376682792ae','0b5c053b-0e8a-4701-aad4-15fd25053f05','0db320f0-5f8e-4232-b00c-1ea27c8f93d7','0eac3521-8a88-4fc5-a211-1dabf928f8c5','156aa13f-bed7-438c-bddd-230b9f3ac4f7','203f4c30-82f3-4000-b7e7-00e250b3d0c9','20ca22a2-62c2-4dd7-9822-6ef08838571b','225b460a-17de-4a11-876c-e857d36a70f8','245c59a0-952f-4eb6-a53b-85f44f7aa5cb','2b6872fc-876c-4628-96ec-340a414a3039','2e241e83-39a9-4745-b243-0d8d9bd6c728','32967a71-ef44-4dd7-ace0-f82f4c5ea439','346efb61-4cac-460b-b6a9-7fd76bba2ec1','378cfc54-04ec-4d01-a763-724a0e7e358b','3a2de190-148f-4496-a30f-5f86b4dba744','3abe422d-08e6-4483-90e3-59e48e585b6f','3ec68eb3-2f75-4952-b95c-00261a0a4327','3ef0cdb5-d1f7-40cf-9a42-8668f3e5133d','45dc8793-a855-43ea-9a90-de941b73bf94','45f227fb-57f5-4fca-b118-0e47e25c0645','46947115-6fd1-4fe5-8fe6-844865ec6108','4a19edf7-3a34-4acf-848f-bb9283fafda6','52a871ac-e29b-4494-b2e8-a830128ac687','5669d69c-124d-4dbd-9252-57357781e33c','59fb1c42-98b5-453c-9d22-2a9037487f2d','5c93176c-2f5f-4805-8325-1430a99b8641','5cce00c0-df26-478f-9195-fcd8f7c84445','6033cece-0624-4a3b-8f4d-b912aaa93c94','610d42b3-4d9b-4dc9-bb02-6b847076bdb4','62d753ed-a9f3-4618-a33b-869ab7bb5f4a','6391c0d7-2b16-4b87-9d89-008d5246563e','677914f0-46ec-4e9e-9b8a-3173f7689d20','6997e8f0-de3c-49e1-8288-044dd4e2a30f','6b767cda-e61f-4c6f-bebe-7fe0c6a0121e','6eae0767-7491-4f13-9e74-7dc12fb8e5b2','6ee414f4-8deb-4be5-8b25-63811bb68e26','73b66bb6-a7a6-4e28-ab66-d7e4cb074fcd','73bb73d7-246f-45ee-b9d6-ee3d70794733','7bd09f7d-f4ca-47a6-b368-544965738e4e','7cf758ab-4bae-4b80-8c1b-df5de1257646','84617b65-23f8-464c-9ac7-bc5d1fbcc71a','85ad7a11-aa18-4a63-8987-71805de38ed8','86964008-b298-412a-b940-dd9dbc0129c2','8776965a-4006-4a9e-8e0f-96ad3f00ad0b','8d1cc624-6010-4bfb-9224-7f1c92b42fec','9278b911-6a7d-436f-bafe-53d6250b42e0','983c91aa-a1b3-4cc8-ae8d-4c2c281bbed9','9b3bd80c-a94f-449c-b434-36e2289e90db','9f2a02e9-54a9-47f9-a2df-ab7e936a1aa9','a62420ed-a9cc-4fa8-9ea1-0807d0392255','a80c1712-0a78-49b0-b41d-a6446f177b67','bb1ffef3-21b0-42d2-b09c-16c49c315c45','c5942376-7e55-4604-98de-d55d84995cd0','c5b79ea3-fd19-4871-9013-fc3b2f1ba1dc','d19fc26c-523a-4a73-865b-6347d375fa07','d3641d34-6afc-4015-a1e7-81fa23a5c56b','d3dcc46e-9d31-4080-a151-2a4baf78b1c9','d464ae58-4aec-4c73-85cf-553b9160af70','d837da39-61d7-46be-a11b-df453f6b6e03','d96ac5a0-570e-4d7f-8f83-b6cf9ca34771','dc33dc77-e06e-4f1e-9a9f-2210d2569d51','dd61669e-ac24-4bc8-b540-3a04fcc2e5ec','e1e6c799-a60a-4260-89ba-38b8c11a3f69','e3eba6e2-ea69-4044-8a69-4684832304de','e46858fa-b617-49ab-a476-f0f8a2fa2499','e9aa8328-5c18-4a35-9951-b1552774be79','ed3d9b0d-cf8d-4058-927a-f2904b7b2ef4','ede691e7-868b-4442-963b-0d7c21ea5aab','efbe292c-d9be-4c46-b4b4-901b5705883f','f0deb384-9ca8-4e11-8f5a-2c59d46ef16a','f31a77e9-3129-4b20-a17f-ac2e1bd62900','f641ae7f-d2fd-4778-990a-ee4391a75b53','fc65205e-12ff-4e9b-94aa-dd21435fe5c0','fdf862bd-63e6-4b91-ab0f-182b7bfe0366']::uuid[])) then
    raise exception 'PASE_COLISION_UUID_NO_TRASLADAR';
  end if;
end
$pase_preflight$;
-- G4 V2. La función histórica queda instalada con su definición original para retorno.
do $pre$
declare
  historica pg_catalog.pg_proc%rowtype;
begin
  select * into historica from pg_catalog.pg_proc
  where oid=to_regprocedure('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)');
  if not found or md5(historica.prosrc) <> '3c29e795c9fb6ad110100cf1d1629045'
     or pg_catalog.obj_description(historica.oid,'pg_proc') is distinct from 'G4_EDITOR_PROYECTOS_V1'
     or historica.proowner <> 'postgres'::regrole or not historica.prosecdef
     or not has_function_privilege('authenticated',historica.oid,'EXECUTE')
     or exists (select from aclexplode(coalesce(historica.proacl,acldefault('f',historica.proowner))) a
                where a.grantee not in (historica.proowner,'authenticated'::regrole)) then
    raise exception 'G4_V2_BASE_O_PERMISOS_NO_RECONOCIDOS';
  end if;
  if not exists (select from pg_catalog.pg_proc where oid=to_regprocedure('private.e2_es_admin_vivo_v6()')
                  and prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=""'])
     or (select count(*) from pg_catalog.pg_trigger where tgrelid='public.proyectos'::regclass
         and not tgisinternal and tgenabled='O' and tgname in ('a00_e2_proy_catalog_stmt_v6',
         'a01_e2_proy_catalog_row_v6','p2_guardar_proyecto_vigente')) <> 3 then
    raise exception 'G4_V2_GUARDAS_INCOMPATIBLES';
  end if;
end
$pre$;

create function public.admin_guardar_proyecto_lotes_v2(
  p_proyecto_id uuid, p_proyecto jsonb, p_lotes jsonb,
  p_updated_at_esperado timestamptz, p_lotes_eliminados uuid[]
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $guardar$
declare
  campos_proyecto constant text[] := array[
    'nombre','slug','tagline','descripcion','categoria','estado','destacado',
    'provincia','ciudad','distancia_km','tipo_acceso','acceso_desc','latitud','longitud',
    'hectareas_total','cantidad_lotes','sup_min_m2','sup_max_m2','zonificacion','expediente',
    'altura_max','fos','reglamento_obs','servicios','fecha_entrega','cronograma',
    'tipo_propiedad','financiacion','precio_desde','precio_hasta','monto_reserva','comision_pct',
    'condiciones_venta','financiacion_banco','ajuste_precios','tema','foto_portada','fotos',
    'foto_atmosfera','foto_fondo','opacidad_fondo','video_url','masterplan_url','brochure_url',
    'plano_activo','mapa_activo','rep_activo','dev_empresa','dev_cuit','dev_contacto_nombre',
    'dev_contacto_cargo','dev_whatsapp','dev_email','dev_domicilio','notas_internas',
    'contacto_nombre','contacto_whatsapp','contacto_email','representantes'
  ];
  requeridos_lote constant text[] := array['origen_id','numero','superficie_m2','precio_usd','estado','frente_agua','notas'];
  campos_lote constant text[] := requeridos_lote || array['mapa_x','mapa_y','tipo_lote','id_nuevo'];
  proyecto_id_guardado uuid := p_proyecto_id;
  version_anterior timestamptz;
  version_guardada timestamptz;
  columnas text;
  valores text;
  ids_actuales uuid[] := '{}';
  ids_conservados uuid[] := '{}';
  ids_resultado uuid[] := '{}';
  entrada jsonb;
  origen uuid;
  nuevo uuid;
  anterior public.lotes%rowtype;
  lote public.lotes%rowtype;
begin
  if private.e2_es_admin_vivo_v6() is not true then
    raise exception 'G4_ADMIN_VIVO_REQUERIDO';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260812,2);

  if jsonb_typeof(p_proyecto) is distinct from 'object' then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:OBJETO_REQUERIDO';
  end if;
  if exists (select from jsonb_object_keys(p_proyecto) k where k <> all(campos_proyecto)) then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:CLAVES';
  end if;
  if nullif(btrim(p_proyecto->>'nombre'),'') is null or nullif(btrim(p_proyecto->>'slug'),'') is null then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:NOMBRE_Y_SLUG_REQUERIDOS';
  end if;
  if jsonb_typeof(p_lotes) is distinct from 'array' or p_lotes_eliminados is null then
    raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ARRAY_REQUERIDO';
  end if;

  if p_proyecto_id is not null then
    select p.updated_at into version_anterior from public.proyectos p where p.id=p_proyecto_id for update;
    if not found then raise exception 'G4_PROYECTO_INEXISTENTE'; end if;
    if version_anterior is distinct from p_updated_at_esperado then
      raise exception 'G4_PROYECTO_DESACTUALIZADO';
    end if;
    select coalesce(array_agg(bloqueado.id),'{}'::uuid[]) into ids_actuales
    from (select l.id from public.lotes l where l.proyecto_id=p_proyecto_id order by l.id for update) bloqueado;
  elsif p_updated_at_esperado is not null then
    raise exception 'G4_PROYECTO_DESACTUALIZADO';
  end if;

  -- Cada fila previa debe tener exactamente un destino: conservarse o baja explícita.
  if cardinality(p_lotes_eliminados) <> (select count(distinct id) from unnest(p_lotes_eliminados) id)
     or not p_lotes_eliminados <@ ids_actuales then
    raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_AJENO_O_DESACTUALIZADO';
  end if;
  for entrada in select value from jsonb_array_elements(p_lotes) loop
    if jsonb_typeof(entrada) is distinct from 'object' then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:OBJETO_REQUERIDO'; end if;
    if not entrada ?& requeridos_lote then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:CLAVES_REQUERIDAS'; end if;
    if exists (select from jsonb_object_keys(entrada) k where k <> all(campos_lote)) then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:CLAVES';
    end if;
    begin
      origen := (entrada->>'origen_id')::uuid;
    exception when invalid_text_representation then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_ID';
    end;
    if entrada ? 'id_nuevo' then
      if origen is not null or jsonb_typeof(entrada->'id_nuevo') is distinct from 'string' then
        raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ID_NUEVO';
      end if;
      begin
        nuevo := (entrada->>'id_nuevo')::uuid;
      exception when invalid_text_representation then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ID_NUEVO';
      end;
      if nuevo=any(ids_actuales) then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ID_NUEVO_EN_USO'; end if;
    end if;
    if origen is not null then
      if origen=any(ids_conservados) then raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_REPETIDO'; end if;
      if origen<>all(ids_actuales) or origen=any(p_lotes_eliminados) then
        raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_AJENO_O_DESACTUALIZADO';
      end if;
      ids_conservados := array_append(ids_conservados,origen);
    end if;
  end loop;
  if cardinality(ids_actuales) <> cardinality(ids_conservados)+cardinality(p_lotes_eliminados) then
    raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_AJENO_O_DESACTUALIZADO';
  end if;

  select string_agg(format('%I',k),', ' order by k), string_agg(format('src.%I',k),', ' order by k)
    into columnas,valores from jsonb_object_keys(p_proyecto) k;
  version_guardada := greatest(clock_timestamp(),version_anterior+interval '1 microsecond');
  if p_proyecto_id is null then
    execute format('insert into public.proyectos (%s,updated_at) select %s,$2 '
                   'from pg_catalog.jsonb_populate_record(null::public.proyectos,$1) src returning id,updated_at',columnas,valores)
      into proyecto_id_guardado,version_guardada using p_proyecto,version_guardada;
  else
    execute format('update public.proyectos p set (%s,updated_at)=(%s,$3) '
                   'from pg_catalog.jsonb_populate_record(null::public.proyectos,$1) src where p.id=$2 returning p.updated_at',columnas,valores)
      into version_guardada using p_proyecto,p_proyecto_id,version_guardada;
    if cardinality(p_lotes_eliminados)>0 then
      delete from public.lotes l where l.proyecto_id=p_proyecto_id and l.id=any(p_lotes_eliminados);
    end if;
  end if;
  if version_guardada is null or (version_anterior is not null and version_guardada<=version_anterior) then
    raise exception 'G4_VERSION_NO_AVANZO';
  end if;

  for entrada in select value from jsonb_array_elements(p_lotes) with ordinality e(value,n) order by n loop
    origen := (entrada->>'origen_id')::uuid;
    if origen is null then
      lote := jsonb_populate_record(null::public.lotes,entrada-'origen_id');
      insert into public.lotes(id,proyecto_id,numero,superficie_m2,precio_usd,estado,frente_agua,notas,mapa_x,mapa_y,tipo_lote)
        values(coalesce((entrada->>'id_nuevo')::uuid,pg_catalog.gen_random_uuid()),proyecto_id_guardado,lote.numero,lote.superficie_m2,lote.precio_usd,lote.estado,lote.frente_agua,
               lote.notas,lote.mapa_x,lote.mapa_y,lote.tipo_lote) returning id into origen;
    else
      select * into strict anterior from public.lotes l where l.proyecto_id=proyecto_id_guardado and l.id=origen;
      -- Un campo opcional ausente conserva su valor, incluso sin coordenada X.
      lote := jsonb_populate_record(anterior,entrada-'origen_id');
      if (lote.numero,lote.superficie_m2,lote.precio_usd,lote.estado,lote.frente_agua,lote.notas,lote.mapa_x,lote.mapa_y,lote.tipo_lote)
         is distinct from
         (anterior.numero,anterior.superficie_m2,anterior.precio_usd,anterior.estado,anterior.frente_agua,anterior.notas,anterior.mapa_x,anterior.mapa_y,anterior.tipo_lote) then
        update public.lotes l set
          numero=lote.numero, superficie_m2=lote.superficie_m2, precio_usd=lote.precio_usd,
          estado=lote.estado, frente_agua=lote.frente_agua, notas=lote.notas,
          mapa_x=lote.mapa_x, mapa_y=lote.mapa_y, tipo_lote=lote.tipo_lote, updated_at=clock_timestamp()
        where l.id=origen and l.proyecto_id=proyecto_id_guardado;
      end if;
    end if;
    ids_resultado := array_append(ids_resultado,origen);
  end loop;
  return jsonb_build_object('proyecto_id',proyecto_id_guardado,'creado',p_proyecto_id is null,
                            'lotes',cardinality(ids_resultado),'lote_ids',ids_resultado,'updated_at',version_guardada);
end
$guardar$;

alter function public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[]) owner to postgres;
comment on function public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[]) is 'G4_EDITOR_PROYECTOS_IDENTIDAD_V2';
revoke all on function public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[]) to authenticated;
revoke execute on function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb) from authenticated;
notify pgrst,'reload schema';

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

-- Preparación aditiva. La vista sirve únicamente la presentación de proyectos activos.
-- Su dueño lee la tabla. La condición de estado es obligatoria para todos los lectores.
CREATE VIEW public.proyectos_publicos_v1 WITH (security_barrier=true) AS
SELECT p.id,p.slug,p.nombre,p.estado,p.categoria,p.tipo_propiedad,p.destacado,p.created_at,
  p.tagline,p.descripcion,p.provincia,p.ciudad,p.descripcion_ubicacion,p.distancia_km,
  p.tipo_acceso,p.acceso_desc,p.latitud,p.longitud,p.hectareas_total,p.cantidad_lotes,
  p.sup_min_m2,p.sup_max_m2,p.zonificacion,p.altura_max,p.fos,p.reglamento_obs,p.servicios,
  p.fecha_entrega,p.cronograma,p.precio_desde,p.precio_hasta,p.monto_reserva,p.condiciones_venta,
  p.financiacion,p.foto_portada,p.fotos,p.foto_atmosfera,p.foto_fondo,p.opacidad_fondo,
  p.video_url,p.masterplan_url,p.brochure_url,p.mapa_imagen_url,p.mapa_zonas,p.mapa_pin_estilo,
  p.mapa_activo,p.plano_activo,p.rep_activo,p.contacto_nombre,p.contacto_whatsapp,p.contacto_email,
  CASE WHEN p.rep_activo IS FALSE THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'nombre',r.item->>'nombre','empresa',r.item->>'empresa','ciudad',r.item->>'ciudad',
      'zona',r.item->>'zona','logo_url',r.item->>'logo_url')) ORDER BY r.pos)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(p.representantes))='array'
      THEN to_jsonb(p.representantes) ELSE '[]'::jsonb END) WITH ORDINALITY r(item,pos)
    WHERE jsonb_typeof(r.item)='object'
  ),'[]'::jsonb) END AS representantes,
  CASE WHEN theme.obj IS NOT NULL THEN (
    SELECT coalesce(jsonb_object_agg(entry.key,
      CASE WHEN entry.key='miniweb' AND jsonb_typeof(entry.value)='object' THEN (
        SELECT coalesce(jsonb_object_agg(m.key,m.value),'{}'::jsonb)
        FROM jsonb_each(entry.value) m
        WHERE m.key IN ('version','bloques','controlBloques','paleta','activa','estilo','selector',
          'ficha','densidad','presentacion','alineacion','altura','columnas','medio','videoActivo',
          'modulos','lotes','recorrido','recursos')
      ) ELSE entry.value END),'{}'::jsonb)::text
    FROM jsonb_each(theme.obj) entry
    WHERE entry.key IN ('paleta','titulo','cuerpo','colorTitulo','colorAccento','colorTexto',
      'colorCuerpo','elementos','miniweb')
  ) WHEN btrim(p.tema) ~ '^[[:alpha:]][[:alnum:]_-]*$'
    AND lower(btrim(p.tema)) NOT IN ('true','false','null') THEN btrim(p.tema) END AS tema
FROM public.proyectos p
CROSS JOIN LATERAL (SELECT CASE WHEN left(btrim(p.tema,E' \t\r\n'),1)='{'
  AND pg_catalog.pg_input_is_valid(p.tema,'jsonb') THEN p.tema::jsonb END AS obj) theme
WHERE p.estado='activo';

REVOKE ALL ON public.proyectos_publicos_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.proyectos_publicos_v1 TO anon,authenticated;

do $pase_qr_preflight$
declare esperado record;
begin
  if current_user <> 'postgres' then raise exception 'PASE_ROL_DE_MIGRACION_DISTINTO'; end if;
  for esperado in select * from (values
('private.e2_aplicar_operacion_v6(text,jsonb)','be99bfac44b22bc5c1da93d0ee82876b'),
('private.qr_consulta_core_v1(text,text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)','1ff003d049bda04c8afb0ddbfb460a3e'),
('private.qr_contacto_arguments_bytes_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb)','35b45c61060d0f32dcdfab9648460b36'),
('private.qr_runtime_contexto_abrir_v1(text,text,uuid,uuid)','e4027acd2876c20f9f9c46787787653f'),
('private.qr_worker_assertion_consumir_v1(text,text,uuid,bytea,text,text,uuid,bytea)','30f5e907c8577298a5f4d3ec3c46a2b6'),
('public.admin_e2_aplicar(uuid,text,text,jsonb)','bc66f96e43c440275e3b33e77eb85a3f'),
('public.admin_e2_preparar(text,jsonb)','feabb7f17058027e751297e20827195c'),
('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)','3c29e795c9fb6ad110100cf1d1629045'),
('public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea)','635d84d6db9fe6b700a69e2f907e0131'),
('public.qr_resolver_anon_v1(text)','d0cb50ec5d0055aba75f8877c9384656'),
('private.qr_destino_activo_estado_hash_v1(uuid)','4dd31764aa83c346176ad9a26b7568e1'),
('private.qr_destino_activo_guard_v1()','59291e5b32386c859ff7da102deb7c7c'),
('public.qr_destino_activo_aplicar_v1(uuid,text,boolean)','980a1328238f74c56e4a57d3318ef754'),
('public.qr_destino_activo_preparar_v1(uuid,uuid,text,text)','a06ca5c59b24c0137f910c4121b40e98')
  ) as base(firma,huella) loop
    if not exists(select 1 from pg_catalog.pg_proc p
      where p.oid=to_regprocedure(esperado.firma) and md5(p.prosrc)=esperado.huella
        and p.proowner='postgres'::regrole and p.prosecdef and p.proconfig=array['search_path=""']) then
      raise exception 'PASE_QR_BASE_DISTINTA:%',esperado.firma;
    end if;
  end loop;
  if to_regclass('private.qr_ingresos_v1') is null
    or to_regclass('private.qr_contactos_v1') is null
    or to_regclass('private.qr_consulta_requests_v1') is null then
    raise exception 'PASE_LEDGER_QR_AUSENTE';
  end if;
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('canales','referencias','referencia_propiedad',
      'destino_asignaciones','contactos','personas','crm_eventos') and c.relrowsecurity) <> 7 then
    raise exception 'PASE_FRONTERA_RLS_QR_DISTINTA';
  end if;
end
$pase_qr_preflight$;
DO $guardas$
BEGIN
  IF NOT EXISTS (SELECT FROM private.qr_runtime_gate_v1 WHERE ambiente='prod' AND version=1 AND accepting AND motivo='active')
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.proyectos'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.contactos'::regclass AND t.tgname='ab_contactos_inmutabilidad_guard_v32'
        AND t.tgenabled='O' AND md5(p.prosrc)='be7c07a7306bb751d13fa35c9aa24b59')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.contactos'::regclass AND t.tgname='aa_contactos_insert_guard_v32'
        AND t.tgenabled='O' AND md5(p.prosrc)='8fcd84a039255c8779e4628445efa6cb')
    OR NOT EXISTS (SELECT FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid='public.proyectos'::regclass AND t.tgname='qr_proyecto_insert_lock_v1'
        AND t.tgenabled='O' AND md5(p.prosrc)='d2a04464836a2a751afd7d894a429a87')
    OR EXISTS (SELECT FROM public.propiedades WHERE slug='terrazas-del-piltri')
    THEN RAISE EXCEPTION 'PASE_GUARDAS_O_DESTINO_DISTINTOS'; END IF;
END
$guardas$;
DO $instalado$
DECLARE f record;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('public.admin_guardar_proyecto_lotes_v2(uuid,jsonb,jsonb,timestamptz,uuid[])','e0ee718d5790e126f600622b95cfc973','authenticated'),('public.qr_contacto_registrar_interno_v1(text,uuid,bytea,text,text,text,text,text,uuid,text,text,bytea,text,integer,integer,jsonb,text,text,uuid,bytea,uuid)','a33ff24d274ac2543620b86c7deba4a6','service_role'),('private.contacto_lote_captura_guard()','e0fb13922fad361a86f5fca7d29159f2',NULL)
  ) expected(firma,huella,rol) LOOP
    IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(f.firma)
      AND md5(p.prosrc)=f.huella AND p.proowner='postgres'::regrole AND p.proconfig=array['search_path=""']
      AND p.prosecdef=(f.rol IS NOT NULL)
      AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee<>p.proowner AND acl.grantee IS DISTINCT FROM f.rol::regrole::oid)
      AND (f.rol IS NULL OR has_function_privilege(f.rol,p.oid,'EXECUTE')))
    THEN RAISE EXCEPTION 'PASE_FUNCION_O_PRIVILEGIO_DISTINTO:%',f.firma; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)','EXECUTE')
    OR NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='public.contactos'::regclass
      AND tgname='contacto_lote_captura_guard' AND tgenabled='O' AND tgfoid='private.contacto_lote_captura_guard()'::regprocedure)
    OR NOT has_table_privilege('anon','public.proyectos_publicos_v1','SELECT')
    OR has_table_privilege('anon','public.proyectos_publicos_v1','UPDATE')
    THEN RAISE EXCEPTION 'PASE_POSTCHECK_PRIVILEGIOS'; END IF;
END
$instalado$;
commit;
