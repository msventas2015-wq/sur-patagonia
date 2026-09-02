begin;

do $g4_precheck$
declare
  v_faltantes text[];
  v_helper pg_catalog.pg_proc%rowtype;
  v_helper_def text;
begin
  if to_regclass('public.proyectos') is null
     or to_regclass('public.lotes') is null then
    raise exception 'G4_TABLAS_REQUERIDAS_INEXISTENTES';
  end if;

  select p.*
    into v_helper
  from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('private.e2_es_admin_vivo_v6()');
  if not found then
    raise exception 'G4_HELPER_ADMIN_INEXISTENTE';
  end if;
  v_helper_def := pg_catalog.pg_get_functiondef(v_helper.oid);
  if not v_helper.prosecdef
     or pg_catalog.pg_get_userbyid(v_helper.proowner) <> 'postgres'
     or v_helper.proconfig is distinct from array['search_path=""']::text[]
     or v_helper_def not like '%raw_app_meta_data%rol%admin%'
     or v_helper_def not like '%deleted_at is null%'
     or v_helper_def not like '%banned_until%'
     or pg_catalog.has_function_privilege('anon', 'private.e2_es_admin_vivo_v6()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'private.e2_es_admin_vivo_v6()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'private.e2_es_admin_vivo_v6()', 'EXECUTE') then
    raise exception 'G4_HELPER_ADMIN_INCOMPATIBLE';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.proyectos'::regclass
      and t.tgname in (
        'a00_e2_proy_catalog_stmt_v6',
        'a01_e2_proy_catalog_row_v6',
        'p2_guardar_proyecto_vigente'
      )
      and t.tgenabled = 'O'
      and not t.tgisinternal
  ) <> 3 then
    raise exception 'G4_GUARDAS_PROYECTO_INCOMPATIBLES';
  end if;

  if to_regprocedure('public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)') is not null then
    raise exception 'G4_RPC_YA_EXISTE';
  end if;

  select array_agg(x order by x)
    into v_faltantes
  from unnest(array[
    'nombre','slug','tagline','descripcion','categoria','estado','destacado',
    'provincia','ciudad','distancia_km','tipo_acceso','acceso_desc','latitud','longitud',
    'hectareas_total','cantidad_lotes','sup_min_m2','sup_max_m2','zonificacion','expediente',
    'altura_max','fos','reglamento_obs','servicios','fecha_entrega','cronograma',
    'tipo_propiedad','financiacion','precio_desde','precio_hasta','monto_reserva','comision_pct',
    'condiciones_venta','financiacion_banco','ajuste_precios','tema','foto_portada','fotos',
    'foto_atmosfera','foto_fondo','opacidad_fondo','video_url','masterplan_url','brochure_url',
    'plano_activo','mapa_activo','rep_activo','dev_empresa','dev_cuit','dev_contacto_nombre',
    'dev_contacto_cargo','dev_whatsapp','dev_email','dev_domicilio','notas_internas',
    'contacto_nombre','contacto_whatsapp','contacto_email','representantes','updated_at'
  ]) as q(x)
  where not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.proyectos'::regclass
      and a.attname = q.x
      and a.attnum > 0
      and not a.attisdropped
  );
  if v_faltantes is not null then
    raise exception 'G4_COLUMNAS_PROYECTO_FALTANTES:%', v_faltantes;
  end if;

  select array_agg(x order by x)
    into v_faltantes
  from unnest(array[
    'proyecto_id','numero','superficie_m2','precio_usd','estado','frente_agua',
    'notas','mapa_x','mapa_y','tipo_lote'
  ]) as q(x)
  where not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.lotes'::regclass
      and a.attname = q.x
      and a.attnum > 0
      and not a.attisdropped
  );
  if v_faltantes is not null then
    raise exception 'G4_COLUMNAS_LOTE_FALTANTES:%', v_faltantes;
  end if;
end
$g4_precheck$;

create function public.admin_guardar_proyecto_lotes(
  p_proyecto_id uuid,
  p_proyecto jsonb,
  p_lotes jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $g4_rpc$
declare
  v_allowed_proyecto constant text[] := array[
    'nombre','slug','tagline','descripcion','categoria','estado','destacado',
    'provincia','ciudad','distancia_km','tipo_acceso','acceso_desc','latitud','longitud',
    'hectareas_total','cantidad_lotes','sup_min_m2','sup_max_m2','zonificacion','expediente',
    'altura_max','fos','reglamento_obs','servicios','fecha_entrega','cronograma',
    'tipo_propiedad','financiacion','precio_desde','precio_hasta','monto_reserva','comision_pct',
    'condiciones_venta','financiacion_banco','ajuste_precios','tema','foto_portada','fotos',
    'foto_atmosfera','foto_fondo','opacidad_fondo','video_url','masterplan_url','brochure_url',
    'plano_activo','mapa_activo','rep_activo','dev_empresa','dev_cuit','dev_contacto_nombre',
    'dev_contacto_cargo','dev_whatsapp','dev_email','dev_domicilio','notas_internas',
    'contacto_nombre','contacto_whatsapp','contacto_email','representantes','updated_at'
  ];
  v_allowed_lote constant text[] := array[
    'origen_id','numero','superficie_m2','precio_usd','estado','frente_agua','notas',
    'mapa_x','mapa_y','tipo_lote'
  ];
  v_required_lote constant text[] := array[
    'origen_id','numero','superficie_m2','precio_usd','estado','frente_agua','notas'
  ];
  v_id uuid := p_proyecto_id;
  v_creado boolean := p_proyecto_id is null;
  v_unknown text[];
  v_columns text;
  v_source_columns text;
  v_lote jsonb;
  v_lote_row public.lotes%rowtype;
  v_lote_id uuid;
  v_origen_id uuid;
  v_old_lote record;
  v_origen_ids uuid[] := '{}'::uuid[];
  v_origen_vistos uuid[] := '{}'::uuid[];
  v_mapa_backup jsonb := '{}'::jsonb;
  v_mapa jsonb;
  v_cantidad integer := 0;
  v_lote_ids jsonb := '[]'::jsonb;
begin
  -- Mismo orden global que E2/P2: advisory antes de filas.
  perform pg_catalog.pg_advisory_xact_lock(20260812, 2);

  if not private.e2_es_admin_vivo_v6() then
    raise exception 'G4_ADMIN_VIVO_REQUERIDO';
  end if;
  if pg_catalog.jsonb_typeof(p_proyecto) is distinct from 'object' then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:OBJETO_REQUERIDO';
  end if;
  if pg_catalog.jsonb_typeof(p_lotes) is distinct from 'array' then
    raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ARRAY_REQUERIDO';
  end if;

  select array_agg(k order by k)
    into v_unknown
  from pg_catalog.jsonb_object_keys(p_proyecto) as q(k)
  where not (k = any(v_allowed_proyecto));
  if v_unknown is not null then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:CLAVES:%', v_unknown;
  end if;

  if nullif(pg_catalog.btrim(p_proyecto ->> 'nombre'), '') is null
     or nullif(pg_catalog.btrim(p_proyecto ->> 'slug'), '') is null then
    raise exception 'G4_PROYECTO_PAYLOAD_INVALIDO:NOMBRE_Y_SLUG_REQUERIDOS';
  end if;

  select string_agg(pg_catalog.format('%I', k), ', ' order by k),
         string_agg(pg_catalog.format('src.%I', k), ', ' order by k)
    into v_columns, v_source_columns
  from pg_catalog.jsonb_object_keys(p_proyecto) as q(k);

  if v_id is null then
    execute pg_catalog.format(
      'insert into public.proyectos (%s) '
      'select %s from pg_catalog.jsonb_populate_record(null::public.proyectos, $1) as src '
      'returning id',
      v_columns,
      v_source_columns
    ) into v_id using p_proyecto;
  else
    perform 1
    from public.proyectos
    where id = v_id
    for update;
    if not found then
      raise exception 'G4_PROYECTO_INEXISTENTE';
    end if;

    -- Los locks de lote también respetan un orden estable.
    perform 1
    from public.lotes
    where proyecto_id = v_id
    order by id
    for update;

    select coalesce(array_agg(id order by id), '{}'::uuid[])
      into v_origen_ids
    from public.lotes
    where proyecto_id = v_id;

    for v_old_lote in
      select id, mapa_x, mapa_y, tipo_lote
      from public.lotes
      where proyecto_id = v_id
      order by id
    loop
      if v_old_lote.mapa_x is not null then
        v_mapa_backup := v_mapa_backup || pg_catalog.jsonb_build_object(
          v_old_lote.id::text,
          pg_catalog.jsonb_build_object(
            'mapa_x', v_old_lote.mapa_x,
            'mapa_y', v_old_lote.mapa_y,
            'tipo_lote', v_old_lote.tipo_lote
          )
        );
      end if;
    end loop;

    execute pg_catalog.format(
      'update public.proyectos as dst set (%s) = (%s) '
      'from pg_catalog.jsonb_populate_record(null::public.proyectos, $1) as src '
      'where dst.id = $2',
      v_columns,
      v_source_columns
    ) using p_proyecto, v_id;
  end if;

  delete from public.lotes where proyecto_id = v_id;

  for v_lote in
    select value
    from pg_catalog.jsonb_array_elements(p_lotes) with ordinality as q(value, orden)
    order by orden
  loop
    if pg_catalog.jsonb_typeof(v_lote) is distinct from 'object' then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:OBJETO_REQUERIDO';
    end if;

    select array_agg(k order by k)
      into v_unknown
    from pg_catalog.jsonb_object_keys(v_lote) as q(k)
    where not (k = any(v_allowed_lote));
    if v_unknown is not null then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:CLAVES:%', v_unknown;
    end if;

    select array_agg(k order by k)
      into v_unknown
    from unnest(v_required_lote) as q(k)
    where not (v_lote ? k);
    if v_unknown is not null then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:CLAVES_REQUERIDAS:%', v_unknown;
    end if;

    begin
      v_origen_id := nullif(v_lote ->> 'origen_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_ID';
    end;
    if v_creado and v_origen_id is not null then
      raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_EN_ALTA';
    end if;
    if not v_creado and v_origen_id is not null then
      if not (v_origen_id = any(v_origen_ids)) then
        raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_AJENO_O_DESACTUALIZADO';
      end if;
      if v_origen_id = any(v_origen_vistos) then
        raise exception 'G4_LOTES_PAYLOAD_INVALIDO:ORIGEN_REPETIDO';
      end if;
      v_origen_vistos := array_append(v_origen_vistos, v_origen_id);
    end if;

    v_mapa := v_mapa_backup -> v_origen_id::text;
    if v_mapa is not null then
      -- El payload explícito gana; si no trae mapa, se preserva el ya guardado.
      v_lote := v_mapa || v_lote;
    end if;

    v_lote_row := pg_catalog.jsonb_populate_record(null::public.lotes, v_lote - 'origen_id');
    insert into public.lotes(
      proyecto_id, numero, superficie_m2, precio_usd, estado, frente_agua,
      notas, mapa_x, mapa_y, tipo_lote
    ) values (
      v_id, v_lote_row.numero, v_lote_row.superficie_m2, v_lote_row.precio_usd,
      v_lote_row.estado, v_lote_row.frente_agua, v_lote_row.notas,
      v_lote_row.mapa_x, v_lote_row.mapa_y, v_lote_row.tipo_lote
    ) returning id into v_lote_id;
    v_lote_ids := v_lote_ids || pg_catalog.jsonb_build_array(v_lote_id);
    v_cantidad := v_cantidad + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'proyecto_id', v_id,
    'creado', v_creado,
    'lotes', v_cantidad,
    'lote_ids', v_lote_ids
  );
end
$g4_rpc$;

alter function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)
  owner to postgres;
comment on function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)
  is 'G4_EDITOR_PROYECTOS_V1';

revoke all on function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)
  to authenticated;

do $g4_postcheck$
declare
  v_proc pg_catalog.pg_proc%rowtype;
begin
  select p.* into v_proc
  from pg_catalog.pg_proc p
  where p.oid = 'public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)'::regprocedure;

  if not found
     or not v_proc.prosecdef
     or pg_catalog.pg_get_userbyid(v_proc.proowner) <> 'postgres'
     or pg_catalog.obj_description(v_proc.oid, 'pg_proc') <> 'G4_EDITOR_PROYECTOS_V1' then
    raise exception 'G4_RPC_POSTCHECK_ESTRUCTURA';
  end if;
  if not pg_catalog.has_function_privilege(
       'authenticated', 'public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.admin_guardar_proyecto_lotes(uuid,jsonb,jsonb)', 'EXECUTE'
     ) then
    raise exception 'G4_RPC_POSTCHECK_ACL';
  end if;
end
$g4_postcheck$;

notify pgrst, 'reload schema';
select 'G4_EDITOR_PROYECTOS_OK' as recibo;

commit;
