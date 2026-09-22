-- Panel del desarrollador: agregados de solo lectura, sin datos personales.
-- 1) Aperturas de la página del proyecto (visitas.pagina = proyecto), agrupadas por
--    tramo, canal propio y vía. Nunca devuelve filas ni códigos de canales ajenos.
-- 2) Cantidad de consultas del proyecto sin movimiento CRM en más de 5 días.
-- El proyecto sale de la identidad autenticada (app_metadata); el cliente no lo elige.
-- No se ejecuta sin aprobación explícita de Mariano. Orden de instalación: ver el brief.
begin;

do $precheck$
begin
  if to_regprocedure('private.l1_es_desarrollador_vivo_v1(uuid)') is null then
    raise exception 'PANEL_DEV_DEPENDENCIA_ROL_INEXISTENTE';
  end if;
  if to_regclass('public.visitas') is null or to_regclass('public.referencias') is null
     or to_regclass('public.canales') is null or to_regclass('public.contactos') is null
     or to_regclass('public.crm_eventos') is null or to_regclass('public.proyectos') is null then
    raise exception 'PANEL_DEV_TABLA_INEXISTENTE';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('rpc_desarrollador_aperturas_proyecto_v1',
                                 'rpc_desarrollador_seguimiento_pendiente_v1')) then
    raise exception 'PANEL_DEV_OBJETOS_DESTINO_YA_EXISTEN';
  end if;
end
$precheck$;

create function public.rpc_desarrollador_aperturas_proyecto_v1(
  p_corte timestamptz default null
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
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_corte timestamptz := coalesce(p_corte, statement_timestamp());
  v_inicio_horario timestamptz;
  v_total bigint;
  v_grupos jsonb;
begin
  if not private.l1_es_desarrollador_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_DESARROLLADOR_NO_AUTORIZADO';
  end if;

  select nullif(btrim(u.raw_app_meta_data->>'proyecto_slug'), '')
    into v_slug
  from auth.users u
  where u.id = v_uid;

  if not exists (select 1 from public.proyectos p where p.slug = v_slug) then
    raise exception using errcode = '42501', message = 'L1_DESARROLLADOR_PROYECTO_INEXISTENTE';
  end if;

  if p_corte is not null and p_corte > statement_timestamp() then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CORTE_FUTURO';
  end if;

  -- Tramos horarios desde el inicio de ayer (hora argentina); antes, tramos diarios.
  v_inicio_horario := (date_trunc('day', v_corte at time zone v_tz) - interval '1 day') at time zone v_tz;

  with propios as (
    select r.codigo
    from public.referencias r
    where r.proyecto_slug = v_slug and r.codigo is not null
    union
    select c.codigo
    from public.canales c
    where c.codigo is not null
      and c.id in (select r.canal_id from public.referencias r where r.proyecto_slug = v_slug)
  ), aperturas as (
    select
      case when v.created_at >= v_inicio_horario
        then date_trunc('hour', v.created_at at time zone v_tz) at time zone v_tz
        else date_trunc('day', v.created_at at time zone v_tz) at time zone v_tz
      end as desde,
      case when v.canal_ref in (select p.codigo from propios p) then v.canal_ref end as canal_ref,
      case
        when v.canal_via = 'qr' then 'qr'
        when v.canal_via = 'link' then 'link'
        when v.canal_via in ('directo', 'directa') or v.canal_ref is null then 'directo'
        else 'no_identificado'
      end as clase
    from public.visitas v
    where v.pagina = v_slug
      and v.created_at <= v_corte
  ), grupos as (
    select a.desde, a.canal_ref, a.clase, count(*)::bigint as aperturas
    from aperturas a
    group by a.desde, a.canal_ref, a.clase
  )
  select
    coalesce(sum(g.aperturas), 0)::bigint,
    coalesce(jsonb_agg(jsonb_build_object(
      'desde', g.desde,
      'canal_ref', g.canal_ref,
      'clase', g.clase,
      'aperturas', g.aperturas
    ) order by g.desde, g.canal_ref nulls first, g.clase), '[]'::jsonb)
    into v_total, v_grupos
  from grupos g;

  return jsonb_build_object(
    'corte_created_at', v_corte,
    'inicio_horario', v_inicio_horario,
    'total_aperturas', v_total,
    'grupos', v_grupos
  );
end
$function$;

create function public.rpc_desarrollador_seguimiento_pendiente_v1(
  p_corte timestamptz default null
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
  v_sin_seguimiento bigint;
begin
  if not private.l1_es_desarrollador_vivo_v1(v_uid) then
    raise exception using errcode = '42501', message = 'L1_DESARROLLADOR_NO_AUTORIZADO';
  end if;

  select nullif(btrim(u.raw_app_meta_data->>'proyecto_slug'), '')
    into v_slug
  from auth.users u
  where u.id = v_uid;

  if not exists (select 1 from public.proyectos p where p.slug = v_slug) then
    raise exception using errcode = '42501', message = 'L1_DESARROLLADOR_PROYECTO_INEXISTENTE';
  end if;

  if p_corte is not null and p_corte > statement_timestamp() then
    raise exception using errcode = '22023', message = 'L1_DESARROLLADOR_CORTE_FUTURO';
  end if;

  -- Abierta = ni cerrada ni descartada. Último movimiento = último evento CRM, o el alta.
  select count(*)::bigint
    into v_sin_seguimiento
  from public.contactos c
  where c.proyecto_slug = v_slug
    and c.created_at <= v_corte
    and coalesce(c.estado, 'nueva') not in ('cerrado', 'descartado')
    and coalesce(
      (select max(e.created_at) from public.crm_eventos e
        where e.contacto_id = c.id and e.created_at <= v_corte),
      c.created_at
    ) < v_corte - interval '5 days';

  return jsonb_build_object(
    'corte_created_at', v_corte,
    'consultas_sin_seguimiento', v_sin_seguimiento
  );
end
$function$;

alter function public.rpc_desarrollador_aperturas_proyecto_v1(timestamptz) owner to postgres;
revoke all on function public.rpc_desarrollador_aperturas_proyecto_v1(timestamptz) from public, anon, service_role;
grant execute on function public.rpc_desarrollador_aperturas_proyecto_v1(timestamptz) to authenticated;
comment on function public.rpc_desarrollador_aperturas_proyecto_v1(timestamptz) is 'PANEL_DEV_APERTURAS_PROYECTO_V1';

alter function public.rpc_desarrollador_seguimiento_pendiente_v1(timestamptz) owner to postgres;
revoke all on function public.rpc_desarrollador_seguimiento_pendiente_v1(timestamptz) from public, anon, service_role;
grant execute on function public.rpc_desarrollador_seguimiento_pendiente_v1(timestamptz) to authenticated;
comment on function public.rpc_desarrollador_seguimiento_pendiente_v1(timestamptz) is 'PANEL_DEV_SEGUIMIENTO_PENDIENTE_V1';

do $postcheck$
declare
  v_fn regprocedure;
begin
  foreach v_fn in array array[
    'public.rpc_desarrollador_aperturas_proyecto_v1(timestamp with time zone)'::regprocedure,
    'public.rpc_desarrollador_seguimiento_pendiente_v1(timestamp with time zone)'::regprocedure
  ] loop
    if not exists (select 1 from pg_proc p where p.oid = v_fn and p.prosecdef and p.provolatile = 's'
                   and p.proconfig @> array['search_path=""']) then
      raise exception 'PANEL_DEV_POSTCHECK_DEFINICION: %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'PANEL_DEV_POSTCHECK_PRIVILEGIOS: %', v_fn;
    end if;
  end loop;
end
$postcheck$;

commit;
