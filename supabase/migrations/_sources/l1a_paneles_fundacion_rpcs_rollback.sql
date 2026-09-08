begin;

do $l1a_rollback_precheck$
begin
  if to_regprocedure('public.rpc_pasivo_trazabilidad_comercial()') is null
     or position('visita_realizada' in pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure)) = 0
     or position('l1_es_colaborador_pasivo_vivo_v1' in pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure)) = 0 then
    raise exception 'L1A_ROLLBACK_TRAZABILIDAD_NO_ES_L1A';
  end if;

  if to_regprocedure('public.rpc_activo_trazabilidad_comercial()') is null then
    raise exception 'L1A_ROLLBACK_TRAZABILIDAD_ACTIVA_INEXISTENTE';
  end if;

  if has_function_privilege('authenticated', 'public.rpc_activo_trazabilidad_comercial()', 'EXECUTE') then
    raise exception 'L1A_ROLLBACK_TRAZABILIDAD_ACTIVA_NO_ES_L1A';
  end if;

  if to_regprocedure('private.l1_es_colaborador_pasivo_vivo_v1(uuid)') is null
     or to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is null
     or to_regprocedure('private.l1_es_desarrollador_vivo_v1(uuid)') is null
     or to_regprocedure('public.l1_es_colaborador_activo_vivo_pub_v1()') is null
     or to_regprocedure('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()') is null
     or to_regprocedure('public.rpc_activo_trazabilidad_comercial_snapshot_v1()') is null then
    raise exception 'L1A_ROLLBACK_OBJETOS_L1A_INCOMPLETOS';
  end if;

  if exists (
    select 1
    from pg_policy p
    where p.polrelid = 'public.contactos'::regclass
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%l1_es_colaborador_activo_vivo_pub_v1%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%l1_es_colaborador_activo_vivo_pub_v1%'
      )
  ) then
    raise exception 'L1A_ROLLBACK_ORDEN_INVALIDO: REVERTIR_L1C_Y_L1B_PRIMERO';
  end if;
end
$l1a_rollback_precheck$;

create or replace function public.rpc_pasivo_trazabilidad_comercial()
returns table(fila_tipo text, mes_ingreso date, mes_ingreso_key text, cohorte_color_key text, mes_evento date, fecha_evento_publica date, precision_fecha text, registro_anon_n integer, estado_publico text, estado_label text, etapa_columna integer, cantidad integer, orden_evento integer, es_legacy_sin_fecha boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
with mis_canales as (
  select c.id, c.codigo
  from public.canales c
  where c.user_id = auth.uid()
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
      when coalesce(c.estado, 'nueva') in ('nueva', 'contactado', 'visita', 'descartado', 'oferta', 'cerrado')
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
      when 'descartado' then 'Descartado'
      when 'oferta' then 'Oferta enviada'
      when 'cerrado' then 'Cerrado'
      else 'Sin avance'
    end as estado_label,
    case cp.estado_actual
      when 'nueva' then 1
      when 'contactado' then 2
      when 'visita' then 3
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
      when 'descartado' then 'Descartado'
      when 'oferta' then 'Oferta enviada'
      when 'cerrado' then 'Cerrado'
    end as estado_label,
    case ep.estado_publico
      when 'contactado' then 2
      when 'visita' then 3
      when 'oferta' then 4
      when 'cerrado' then 5
      when 'descartado' then 90
    end as etapa_columna,
    1::int as cantidad,
    case ep.estado_publico
      when 'contactado' then 20
      when 'visita' then 30
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
      when 'descartado' then 'Descartado'
      when 'oferta' then 'Oferta enviada'
      when 'cerrado' then 'Cerrado'
      else 'Sin avance'
    end as estado_label,
    case cp.estado_actual
      when 'contactado' then 2
      when 'visita' then 3
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

grant execute on function public.rpc_activo_trazabilidad_comercial() to authenticated;

drop function public.rpc_activo_trazabilidad_comercial_snapshot_v1();
drop function public.rpc_pasivo_trazabilidad_comercial_snapshot_v1();

drop function public.rpc_desarrollador_contactos_sin_pii_v1(timestamptz,timestamptz,text,integer);
drop function public.rpc_pasivo_contactos_anon(timestamptz,timestamptz,text,integer);
drop function public.l1_es_colaborador_activo_vivo_pub_v1();
drop function private.l1_es_desarrollador_vivo_v1(uuid);
drop function private.l1_es_colaborador_activo_vivo_v1(uuid);
drop function private.l1_es_colaborador_pasivo_vivo_v1(uuid);

do $l1a_rollback_postcheck$
declare
  v_trace_md5 text;
begin
  select md5(pg_get_functiondef('public.rpc_pasivo_trazabilidad_comercial()'::regprocedure))
    into v_trace_md5;
  if v_trace_md5 <> '77727d7765678515402e6c8a0b57dcd8' then
    raise exception 'L1A_ROLLBACK_TRAZABILIDAD_NO_RESTAURADA: %', v_trace_md5;
  end if;

  if to_regprocedure('private.l1_es_colaborador_pasivo_vivo_v1(uuid)') is not null
     or to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is not null
     or to_regprocedure('private.l1_es_desarrollador_vivo_v1(uuid)') is not null
     or to_regprocedure('public.l1_es_colaborador_activo_vivo_pub_v1()') is not null
     or to_regprocedure('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)') is not null
     or to_regprocedure('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)') is not null
     or to_regprocedure('public.rpc_pasivo_trazabilidad_comercial_snapshot_v1()') is not null
     or to_regprocedure('public.rpc_activo_trazabilidad_comercial_snapshot_v1()') is not null then
    raise exception 'L1A_ROLLBACK_OBJETOS_RESIDUALES';
  end if;

  if not has_function_privilege('authenticated', 'public.rpc_activo_trazabilidad_comercial()', 'EXECUTE') then
    raise exception 'L1A_ROLLBACK_TRAZABILIDAD_ACTIVA_NO_RESTAURADA';
  end if;
end
$l1a_rollback_postcheck$;

notify pgrst, 'reload schema';

select 'L1A_PANELES_FUNDACION_RPCS_ROLLBACK_OK'::text as recibo;

commit;
