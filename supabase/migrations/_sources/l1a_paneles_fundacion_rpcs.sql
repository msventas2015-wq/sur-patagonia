begin;

do $l1a_precheck$
declare
  v_trace_md5 text;
begin
  if to_regprocedure('public.rpc_pasivo_trazabilidad_comercial()') is null then
    raise exception 'L1A_RPC_TRAZABILIDAD_BASE_INEXISTENTE';
  end if;

  if to_regprocedure('public.rpc_activo_trazabilidad_comercial()') is null then
    raise exception 'L1A_RPC_TRAZABILIDAD_ACTIVA_BASE_INEXISTENTE';
  end if;

  if not has_function_privilege('authenticated', 'public.rpc_activo_trazabilidad_comercial()', 'EXECUTE')
     or has_function_privilege('anon', 'public.rpc_activo_trazabilidad_comercial()', 'EXECUTE') then
    raise exception 'L1A_RPC_TRAZABILIDAD_ACTIVA_BASE_INESPERADA';
  end if;

  select md5(pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure))
    into v_trace_md5;
  if v_trace_md5 <> '77727d7765678515402e6c8a0b57dcd8' then
    raise exception 'L1A_RPC_TRAZABILIDAD_BASE_INESPERADA: %', v_trace_md5;
  end if;

  if to_regprocedure('private.l1_es_colaborador_pasivo_vivo_v1(uuid)') is not null
     or to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is not null
     or to_regprocedure('private.l1_es_desarrollador_vivo_v1(uuid)') is not null
     or to_regprocedure('public.l1_es_colaborador_activo_vivo_pub_v1()') is not null
     or to_regprocedure('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)') is not null
     or to_regprocedure('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)') is not null
     or to_regprocedure('public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()') is not null
     or to_regprocedure('public.rpc_activo_trazabilidad_comercial_snapshot_v1()') is not null then
    raise exception 'L1A_OBJETOS_DESTINO_YA_EXISTEN';
  end if;

  if exists (select 1 from public.contactos where created_at is null) then
    raise exception 'L1A_CONTACTOS_CREATED_AT_NULL';
  end if;
end
$l1a_precheck$;

create function private.l1_es_colaborador_pasivo_vivo_v1(p_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select p_uid is not null and exists (
    select 1
    from auth.users u
    where u.id = p_uid
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < pg_catalog.now())
      and u.raw_app_meta_data->>'rol' = 'colaborador'
      and u.raw_app_meta_data->>'tipo_acceso' = 'pasivo'
  )
$function$;

alter function private.l1_es_colaborador_pasivo_vivo_v1(uuid) owner to postgres;
revoke all on function private.l1_es_colaborador_pasivo_vivo_v1(uuid) from public, anon, authenticated, service_role;

create function private.l1_es_colaborador_activo_vivo_v1(p_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select p_uid is not null and exists (
    select 1
    from auth.users u
    where u.id = p_uid
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < pg_catalog.now())
      and u.raw_app_meta_data->>'rol' = 'colaborador'
      and u.raw_app_meta_data->>'tipo_acceso' = 'activo'
  )
$function$;

alter function private.l1_es_colaborador_activo_vivo_v1(uuid) owner to postgres;
revoke all on function private.l1_es_colaborador_activo_vivo_v1(uuid) from public, anon, authenticated, service_role;

create function private.l1_es_desarrollador_vivo_v1(p_uid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select p_uid is not null and exists (
    select 1
    from auth.users u
    where u.id = p_uid
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until < pg_catalog.now())
      and u.raw_app_meta_data->>'rol' = 'colaborador'
      and u.raw_app_meta_data->>'tipo_acceso' = 'desarrollador'
      and nullif(btrim(u.raw_app_meta_data->>'proyecto_slug'), '') is not null
  )
$function$;

alter function private.l1_es_desarrollador_vivo_v1(uuid) owner to postgres;
revoke all on function private.l1_es_desarrollador_vivo_v1(uuid) from public, anon, authenticated, service_role;

create function public.l1_es_colaborador_activo_vivo_pub_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(private.l1_es_colaborador_activo_vivo_v1((select auth.uid())), false)
$function$;

alter function public.l1_es_colaborador_activo_vivo_pub_v1() owner to postgres;
revoke all on function public.l1_es_colaborador_activo_vivo_pub_v1() from public, anon, service_role;
grant execute on function public.l1_es_colaborador_activo_vivo_pub_v1() to authenticated;

create function public.rpc_pasivo_contactos_anon(
  p_corte timestamptz default null,
  p_cursor_ts timestamptz default null,
  p_cursor_key text default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_corte timestamptz := coalesce(p_corte, statement_timestamp());
  v_total bigint;
  v_filas jsonb := '[]'::jsonb;
  v_hay_mas boolean := false;
  v_next_ts timestamptz;
  v_next_key text;
begin
  if not private.l1_es_colaborador_pasivo_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_PASIVO_NO_AUTORIZADO';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'L1_PASIVO_LIMITE_INVALIDO';
  end if;
  if (p_cursor_ts is null) <> (p_cursor_key is null) then
    raise exception using errcode = '22023', message = 'L1_PASIVO_CURSOR_INCOMPLETO';
  end if;
  if p_cursor_key is not null and p_cursor_key !~ '^[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'L1_PASIVO_CURSOR_INVALIDO';
  end if;
  if p_corte is not null and p_corte > statement_timestamp() then
    raise exception using errcode = '22023', message = 'L1_PASIVO_CORTE_FUTURO';
  end if;
  if p_cursor_ts is not null and p_cursor_ts > v_corte then
    raise exception using errcode = '22023', message = 'L1_PASIVO_CURSOR_FUERA_DE_CORTE';
  end if;

  select count(*)::bigint
    into v_total
  from public.contactos c
  where c.created_at <= v_corte
    and c.canal_ref in (
      select r.codigo
      from public.referencias r
      join public.canales ca on ca.id = r.canal_id
      where ca.user_id = v_uid
      union
      select ca.codigo
      from public.canales ca
      where ca.user_id = v_uid
    );

  with candidatas as (
    select
      md5(v_uid::text || ':f:' || c.id::text) as fila_key,
      md5(v_uid::text || ':s:' || coalesce('p:' || c.persona_id::text, 'c:' || c.id::text)) as sujeto_key,
      c.created_at,
      c.fecha,
      c.estado,
      c.origen,
      c.canal_ref,
      c.canal_via
    from public.contactos c
    where c.created_at <= v_corte
      and c.canal_ref in (
        select r.codigo
        from public.referencias r
        join public.canales ca on ca.id = r.canal_id
        where ca.user_id = v_uid
        union
        select ca.codigo
        from public.canales ca
        where ca.user_id = v_uid
      )
      and (
        p_cursor_ts is null
        or c.created_at < p_cursor_ts
        or (
          c.created_at = p_cursor_ts
          and md5(v_uid::text || ':f:' || c.id::text) < p_cursor_key
        )
      )
    order by c.created_at desc, md5(v_uid::text || ':f:' || c.id::text) desc
    limit p_limit + 1
  ), numeradas as (
    select c.*, row_number() over (order by c.created_at desc, c.fila_key desc) as rn
    from candidatas c
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'fila_key', fila_key,
          'sujeto_key', sujeto_key,
          'created_at', created_at,
          'fecha', fecha,
          'estado', estado,
          'origen', origen,
          'canal_ref', canal_ref,
          'canal_via', canal_via
        ) order by rn
      ) filter (where rn <= p_limit),
      '[]'::jsonb
    ),
    count(*) > p_limit,
    max(created_at) filter (where rn = p_limit),
    max(fila_key) filter (where rn = p_limit)
  into v_filas, v_hay_mas, v_next_ts, v_next_key
  from numeradas;

  return jsonb_build_object(
    'corte_created_at', v_corte,
    'total_filas', v_total,
    'filas', v_filas,
    'next_cursor', case
      when v_hay_mas then jsonb_build_object('created_at', v_next_ts, 'fila_key', v_next_key)
      else null
    end
  );
end
$function$;

alter function public.rpc_pasivo_contactos_anon(timestamptz,timestamptz,text,integer) owner to postgres;
revoke all on function public.rpc_pasivo_contactos_anon(timestamptz,timestamptz,text,integer) from public, anon, service_role;
grant execute on function public.rpc_pasivo_contactos_anon(timestamptz,timestamptz,text,integer) to authenticated;
comment on function public.rpc_pasivo_contactos_anon(timestamptz,timestamptz,text,integer) is 'L1_PASIVO_CONTACTOS_ANON_V1';

create function public.rpc_desarrollador_contactos_sin_pii_v1(
  p_corte timestamptz default null,
  p_cursor_ts timestamptz default null,
  p_cursor_key text default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_slug text;
  v_corte timestamptz := coalesce(p_corte, statement_timestamp());
  v_total bigint;
  v_filas jsonb := '[]'::jsonb;
  v_hay_mas boolean := false;
  v_next_ts timestamptz;
  v_next_key text;
begin
  if not private.l1_es_desarrollador_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_DESARROLLADOR_NO_AUTORIZADO';
  end if;

  select nullif(btrim(u.raw_app_meta_data->>'proyecto_slug'), '')
    into v_slug
  from auth.users u
  where u.id = v_uid;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_LIMITE_INVALIDO';
  end if;
  if (p_cursor_ts is null) <> (p_cursor_key is null) then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CURSOR_INCOMPLETO';
  end if;
  if p_cursor_key is not null and p_cursor_key !~ '^[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CURSOR_INVALIDO';
  end if;
  if p_corte is not null and p_corte > statement_timestamp() then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CORTE_FUTURO';
  end if;
  if p_cursor_ts is not null and p_cursor_ts > v_corte then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CURSOR_FUERA_DE_CORTE';
  end if;

  select count(*)::bigint
    into v_total
  from public.contactos c
  where c.created_at <= v_corte
    and c.proyecto_slug = v_slug;

  with candidatas as (
    select
      md5(v_uid::text || ':f:' || c.id::text) as fila_key,
      c.created_at,
      c.estado,
      c.origen,
      c.canal_ref,
      c.canal_via
    from public.contactos c
    where c.created_at <= v_corte
      and c.proyecto_slug = v_slug
      and (
        p_cursor_ts is null
        or c.created_at < p_cursor_ts
        or (
          c.created_at = p_cursor_ts
          and md5(v_uid::text || ':f:' || c.id::text) < p_cursor_key
        )
      )
    order by c.created_at desc, md5(v_uid::text || ':f:' || c.id::text) desc
    limit p_limit + 1
  ), numeradas as (
    select c.*, row_number() over (order by c.created_at desc, c.fila_key desc) as rn
    from candidatas c
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'fila_key', fila_key,
          'created_at', created_at,
          'estado', estado,
          'origen', origen,
          'canal_ref', canal_ref,
          'canal_via', canal_via
        ) order by rn
      ) filter (where rn <= p_limit),
      '[]'::jsonb
    ),
    count(*) > p_limit,
    max(created_at) filter (where rn = p_limit),
    max(fila_key) filter (where rn = p_limit)
  into v_filas, v_hay_mas, v_next_ts, v_next_key
  from numeradas;

  return jsonb_build_object(
    'corte_created_at', v_corte,
    'total_filas', v_total,
    'filas', v_filas,
    'next_cursor', case
      when v_hay_mas then jsonb_build_object('created_at', v_next_ts, 'fila_key', v_next_key)
      else null
    end
  );
end
$function$;

alter function public.rpc_desarrollador_contactos_sin_pii_v1(timestamptz,timestamptz,text,integer) owner to postgres;
revoke all on function public.rpc_desarrollador_contactos_sin_pii_v1(timestamptz,timestamptz,text,integer) from public, anon, service_role;
grant execute on function public.rpc_desarrollador_contactos_sin_pii_v1(timestamptz,timestamptz,text,integer) to authenticated;
comment on function public.rpc_desarrollador_contactos_sin_pii_v1(timestamptz,timestamptz,text,integer) is 'L1_DESARROLLADOR_CONTACTOS_SIN_PII_V1';

create or replace function public.rpc_pasivo_trazabilidad_comercial()
returns table(fila_tipo text, mes_ingreso date, mes_ingreso_key text, cohorte_color_key text, mes_evento date, fecha_evento_publica date, precision_fecha text, registro_anon_n integer, estado_publico text, estado_label text, etapa_columna integer, cantidad integer, orden_evento integer, es_legacy_sin_fecha boolean)
language sql
stable security definer
set search_path = ''
as $function$
with mis_canales as (
 select c.id, c.codigo
 from public.canales c
 where private.l1_es_colaborador_pasivo_vivo_v1((select auth.uid()))
   and c.user_id = (select auth.uid())
),

codigos_permitidos as (
 select codigo
 from mis_canales

 union

 select r.codigo
 from public.referencias r
 join mis_canales c on c.id = r.canal_id
),

contactos_permitidos as (
 select
 c.id as contacto_id,
 coalesce(c.fecha, c.created_at) as fecha_ingreso,
 date_trunc('month', coalesce(c.fecha, c.created_at))::date as mes_ingreso,
 to_char(date_trunc('month', coalesce(c.fecha, c.created_at)), 'YYYY-MM') as mes_ingreso_key,
 case
 when coalesce(c.estado, 'nueva') in ('nueva', 'contactado', 'visita', 'visita_realizada', 'descartado', 'oferta', 'cerrado')
 then coalesce(c.estado, 'nueva')
 else 'nueva'
 end as estado_actual,
 row_number() over (
 partition by date_trunc('month', coalesce(c.fecha, c.created_at))::date
 order by coalesce(c.fecha, c.created_at), c.id
 )::int as registro_anon_n
 from public.contactos c
 join codigos_permitidos cp on cp.codigo = c.canal_ref
 where coalesce(c.fecha, c.created_at) is not null
),

eventos_publicos_base as (
 select
 cp.contacto_id,
 cp.mes_ingreso,
 cp.mes_ingreso_key,
 cp.registro_anon_n,
 e.fecha_evento,
 date_trunc('month', e.fecha_evento)::date as mes_evento,
 case
 when e.estado_nuevo = 'contactado' then 'contactado'
 when e.estado_nuevo = 'visita' then 'visita'
 when e.estado_nuevo = 'visita_realizada' then 'visita_realizada'
 when e.estado_nuevo = 'descartado' then 'descartado'
 when e.estado_nuevo = 'oferta' then 'oferta'
 when e.estado_nuevo = 'cerrado' then 'cerrado'
 when e.tipo_evento = 'oferta_enviada' then 'oferta'
 else null
 end as estado_publico
 from contactos_permitidos cp
 join public.crm_eventos e on e.contacto_id = cp.contacto_id
 where e.tipo_evento <> 'ingreso'
 and e.fecha_evento is not null
),

eventos_publicos_dedup as (
 select *
 from (
 select
 ep.*,
 row_number() over (
 partition by ep.contacto_id, ep.estado_publico
 order by ep.fecha_evento
 ) as rn
 from eventos_publicos_base ep
 where ep.estado_publico is not null
 ) x
 where rn = 1
),

contactos_con_flag_evento as (
 select
 cp.*,
 exists (
 select 1
 from eventos_publicos_dedup ep
 where ep.contacto_id = cp.contacto_id
 ) as tiene_evento_publico
 from contactos_permitidos cp
),

bloque_estado_actual as (
 select
 'bloque_estado_actual'::text as fila_tipo,
 cp.mes_ingreso,
 cp.mes_ingreso_key,
 cp.mes_ingreso_key as cohorte_color_key,
 null::date as mes_evento,
 null::date as fecha_evento_publica,
 'estado_actual'::text as precision_fecha,
 null::int as registro_anon_n,
 cp.estado_actual as estado_publico,
 case cp.estado_actual
 when 'nueva' then 'Sin avance'
 when 'contactado' then 'Contactado'
 when 'visita' then 'En visita'
 when 'visita_realizada' then 'Visita realizada'
 when 'descartado' then 'Descartado'
 when 'oferta' then 'Oferta enviada'
 when 'cerrado' then 'Cerrado'
 else 'Sin avance'
 end as estado_label,
 case cp.estado_actual
 when 'nueva' then 1
 when 'contactado' then 2
 when 'visita' then 3
 when 'visita_realizada' then 3
 when 'oferta' then 4
 when 'cerrado' then 5
 when 'descartado' then 90
 else 1
 end as etapa_columna,
 count(*)::int as cantidad,
 case cp.estado_actual
 when 'nueva' then 10
 when 'contactado' then 20
 when 'visita' then 30
 when 'visita_realizada' then 35
 when 'oferta' then 40
 when 'cerrado' then 50
 when 'descartado' then 90
 else 10
 end as orden_evento,
 (
 cp.estado_actual <> 'nueva'
 and cp.tiene_evento_publico = false
 )::boolean as es_legacy_sin_fecha
 from contactos_con_flag_evento cp
 group by
 cp.mes_ingreso,
 cp.mes_ingreso_key,
 cp.estado_actual,
 (
 cp.estado_actual <> 'nueva'
 and cp.tiene_evento_publico = false
 )
),

movimientos_timeline as (
 select
 'movimiento_registro_anonimo'::text as fila_tipo,
 ep.mes_ingreso,
 ep.mes_ingreso_key,
 ep.mes_ingreso_key as cohorte_color_key,
 ep.mes_evento,
 date_trunc('month', ep.fecha_evento)::date as fecha_evento_publica,
 'mes'::text as precision_fecha,
 ep.registro_anon_n,
 ep.estado_publico,
 case ep.estado_publico
 when 'contactado' then 'Contactado'
 when 'visita' then 'En visita'
 when 'visita_realizada' then 'Visita realizada'
 when 'descartado' then 'Descartado'
 when 'oferta' then 'Oferta enviada'
 when 'cerrado' then 'Cerrado'
 end as estado_label,
 case ep.estado_publico
 when 'contactado' then 2
 when 'visita' then 3
 when 'visita_realizada' then 3
 when 'oferta' then 4
 when 'cerrado' then 5
 when 'descartado' then 90
 end as etapa_columna,
 1::int as cantidad,
 case ep.estado_publico
 when 'contactado' then 20
 when 'visita' then 30
 when 'visita_realizada' then 35
 when 'oferta' then 40
 when 'cerrado' then 50
 when 'descartado' then 90
 end as orden_evento,
 false::boolean as es_legacy_sin_fecha
 from eventos_publicos_dedup ep
),

sin_movimiento as (
 select
 'sin_movimiento'::text as fila_tipo,
 cp.mes_ingreso,
 cp.mes_ingreso_key,
 cp.mes_ingreso_key as cohorte_color_key,
 null::date as mes_evento,
 null::date as fecha_evento_publica,
 'sin_fecha'::text as precision_fecha,
 null::int as registro_anon_n,
 'nueva'::text as estado_publico,
 'Sin avance'::text as estado_label,
 1::int as etapa_columna,
 count(*)::int as cantidad,
 10::int as orden_evento,
 false::boolean as es_legacy_sin_fecha
 from contactos_con_flag_evento cp
 where cp.estado_actual = 'nueva'
 and cp.tiene_evento_publico = false
 group by cp.mes_ingreso, cp.mes_ingreso_key
),

estado_actual_sin_fecha_historica as (
 select
 'estado_actual_sin_fecha_historica'::text as fila_tipo,
 cp.mes_ingreso,
 cp.mes_ingreso_key,
 cp.mes_ingreso_key as cohorte_color_key,
 null::date as mes_evento,
 null::date as fecha_evento_publica,
 'sin_fecha_historica'::text as precision_fecha,
 null::int as registro_anon_n,
 cp.estado_actual as estado_publico,
 case cp.estado_actual
 when 'contactado' then 'Contactado'
 when 'visita' then 'En visita'
 when 'visita_realizada' then 'Visita realizada'
 when 'descartado' then 'Descartado'
 when 'oferta' then 'Oferta enviada'
 when 'cerrado' then 'Cerrado'
 else 'Sin avance'
 end as estado_label,
 case cp.estado_actual
 when 'contactado' then 2
 when 'visita' then 3
 when 'visita_realizada' then 3
 when 'oferta' then 4
 when 'cerrado' then 5
 when 'descartado' then 90
 else 1
 end as etapa_columna,
 count(*)::int as cantidad,
 15::int as orden_evento,
 true::boolean as es_legacy_sin_fecha
 from contactos_con_flag_evento cp
 where cp.estado_actual <> 'nueva'
 and cp.tiene_evento_publico = false
 group by cp.mes_ingreso, cp.mes_ingreso_key, cp.estado_actual
)

select * from bloque_estado_actual
union all
select * from movimientos_timeline
union all
select * from sin_movimiento
union all
select * from estado_actual_sin_fecha_historica
order by
 mes_ingreso desc,
 fila_tipo,
 registro_anon_n nulls last,
 fecha_evento_publica nulls last,
 orden_evento;
$function$;

alter function public.rpc_pasivo_trazabilidad_comercial() owner to postgres;
revoke all on function public.rpc_pasivo_trazabilidad_comercial() from public, anon;
grant execute on function public.rpc_pasivo_trazabilidad_comercial() to authenticated, service_role;

create function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_filas jsonb;
begin
  if not private.l1_es_colaborador_pasivo_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_PASIVO_NO_AUTORIZADO';
  end if;

  select count(*)::bigint,
         coalesce(jsonb_agg(s.fila order by s.ordinalidad), '[]'::jsonb)
    into v_total, v_filas
  from (
    select t.ordinality as ordinalidad,
           to_jsonb(t) - 'ordinality' as fila
    from public.rpc_pasivo_trazabilidad_comercial() with ordinality as t
    limit 100001
  ) s;

  if v_total > 100000 then
    raise exception using errcode = '54000', message = 'L1_TRAZABILIDAD_SUPERA_MAXIMO_SEGURO';
  end if;

  return jsonb_build_object(
    'snapshot_at', statement_timestamp(),
    'total_filas', v_total,
    'filas', v_filas
  );
end
$function$;

alter function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1() owner to postgres;
revoke all on function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1() from public, anon, service_role;
grant execute on function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1() to authenticated;
comment on function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1() is 'L1_TRAZABILIDAD_PASIVA_SNAPSHOT_V1';

create function public.rpc_activo_trazabilidad_comercial_snapshot_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_filas jsonb;
begin
  if not private.l1_es_colaborador_activo_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_ACTIVO_NO_AUTORIZADO';
  end if;

  select count(*)::bigint,
         coalesce(jsonb_agg(s.fila order by s.ordinalidad), '[]'::jsonb)
    into v_total, v_filas
  from (
    select t.ordinality as ordinalidad,
           to_jsonb(t) - 'ordinality' as fila
    from public.rpc_activo_trazabilidad_comercial() with ordinality as t
    limit 100001
  ) s;

  if v_total > 100000 then
    raise exception using errcode = '54000', message = 'L1_TRAZABILIDAD_SUPERA_MAXIMO_SEGURO';
  end if;

  return jsonb_build_object(
    'snapshot_at', statement_timestamp(),
    'total_filas', v_total,
    'filas', v_filas
  );
end
$function$;

alter function public.rpc_activo_trazabilidad_comercial_snapshot_v1() owner to postgres;
revoke all on function public.rpc_activo_trazabilidad_comercial_snapshot_v1() from public, anon, service_role;
grant execute on function public.rpc_activo_trazabilidad_comercial_snapshot_v1() to authenticated;
comment on function public.rpc_activo_trazabilidad_comercial_snapshot_v1() is 'L1_TRAZABILIDAD_ACTIVA_SNAPSHOT_V1';

revoke execute on function public.rpc_activo_trazabilidad_comercial() from authenticated;

do $l1a_postcheck$
declare
  v_bad integer;
begin
  if to_regprocedure('private.l1_es_colaborador_pasivo_vivo_v1(uuid)') is null
     or to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is null
     or to_regprocedure('private.l1_es_desarrollador_vivo_v1(uuid)') is null
     or to_regprocedure('public.l1_es_colaborador_activo_vivo_pub_v1()') is null
     or to_regprocedure('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()') is null
     or to_regprocedure('public.rpc_activo_trazabilidad_comercial_snapshot_v1()') is null then
    raise exception 'L1A_OBJETOS_PUBLICADOS_INCOMPLETOS';
  end if;

  if position('visita_realizada' in pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure)) = 0
     or position('l1_es_colaborador_pasivo_vivo_v1' in pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure)) = 0 then
    raise exception 'L1A_TRAZABILIDAD_PASIVA_INCOMPLETA';
  end if;

  select count(*) into v_bad
  from (
    values
      ('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure),
      ('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)'::regprocedure),
      ('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)'::regprocedure),
      ('public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()'::regprocedure),
      ('public.rpc_activo_trazabilidad_comercial_snapshot_v1()'::regprocedure)
  ) f(oid)
  where not exists (
          select 1 from pg_proc p
          where p.oid = f.oid and p.prosecdef and p.proconfig @> array['search_path=""']::text[]
        )
     or has_function_privilege('anon', f.oid, 'EXECUTE')
     or not has_function_privilege('authenticated', f.oid, 'EXECUTE');
  if v_bad <> 0 then
    raise exception 'L1A_RPC_ACL_O_CONFIG_INCORRECTA: %', v_bad;
  end if;

  if has_function_privilege('anon', 'public.l1_es_colaborador_activo_vivo_pub_v1()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.l1_es_colaborador_activo_vivo_pub_v1()', 'EXECUTE') then
    raise exception 'L1A_WRAPPER_ACL_INCORRECTA';
  end if;

  if has_function_privilege('authenticated', 'public.rpc_activo_trazabilidad_comercial()', 'EXECUTE') then
    raise exception 'L1A_TRAZABILIDAD_ACTIVA_DIRECTA_SIGUE_PUBLICADA';
  end if;
end
$l1a_postcheck$;

notify pgrst, 'reload schema';

select 'L1A_PANELES_FUNDACION_RPCS_OK'::text as recibo;

commit;
