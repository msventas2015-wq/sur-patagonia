-- G4 V2. La función histórica queda instalada con su definición original para retorno.
begin;
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
commit;
