begin;

do $l1b_rollback_precheck$
declare
  v_check text;
  v_guard text;
begin
  if to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is null then
    raise exception 'L1B_ROLLBACK_DEPENDENCIA_L1A_INEXISTENTE';
  end if;

  select pg_get_expr(p.polwithcheck, p.polrelid)
    into v_check
  from pg_policy p
  where p.polrelid = 'public.contactos'::regclass
    and p.polname = 'Colaborador activo carga consulta manual';
  if v_check is null or position('l1_es_colaborador_activo_vivo_pub_v1' in v_check) = 0 then
    raise exception 'L1B_ROLLBACK_POLICY_NO_ES_L1B';
  end if;

  select pg_get_functiondef('public.contactos_insert_guard_v32()'::regprocedure)
    into v_guard;
  if position('private.l1_es_colaborador_activo_vivo_v1(v_uid)' in v_guard) = 0
     or position('c.tipo_acceso' in v_guard) > 0 then
    raise exception 'L1B_ROLLBACK_GUARD_NO_ES_L1B';
  end if;
end
$l1b_rollback_precheck$;

drop policy "Colaborador activo carga consulta manual" on public.contactos;

create policy "Colaborador activo carga consulta manual"
on public.contactos
for insert
to authenticated
with check (
  origen = 'manual'::text
  and (select auth.uid() as uid) is not null
  and (((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'rol'::text) = 'colaborador'::text
  and (((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'tipo_acceso'::text) = 'activo'::text
  and canal_ref is not null
  and exists (
    select 1
    from (public.referencias r
    join public.canales c on ((c.id = r.canal_id)))
    where r.codigo = contactos.canal_ref
      and r.codigo = c.codigo
      and r.punto_tipo = 'principal'::text
      and r.activo is true
      and c.activo is true
      and c.tipo_acceso = 'activo'::text
      and c.user_id = (select auth.uid() as uid)
  )
);

create or replace function public.contactos_insert_guard_v32()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(),'{}'::jsonb);
  v_rol text;
  v_tipo text;
begin
  new.created_at := v_now;
  new.fecha := v_now;

  if new.origen not in ('web','manual') then
    raise exception using errcode='23514',message='Origen de captura inválido';
  end if;

  if new.propiedad_id is not null and nullif(btrim(new.proyecto_slug),'') is not null then
    raise exception using errcode='23514',message='Una consulta no puede tener propiedad y proyecto simultáneos';
  end if;
  if new.proyecto_slug is not null and btrim(new.proyecto_slug)='' then
    raise exception using errcode='23514',message='El proyecto no puede ser vacío';
  end if;
  if new.proyecto_slug is not null then
    new.proyecto_slug := btrim(new.proyecto_slug);
  end if;
  if new.propiedad_id is not null and not exists (
    select 1 from public.propiedades p where p.id=new.propiedad_id and p.activa is true
  ) then
    raise exception using errcode='23514',message='La propiedad no existe o no está activa';
  end if;
  if nullif(btrim(new.proyecto_slug),'') is not null and not exists (
    select 1 from public.proyectos p where p.slug=btrim(new.proyecto_slug) and p.estado='activo'
  ) then
    raise exception using errcode='23514',message='El proyecto no existe o no está activo';
  end if;

  if new.origen='manual' then
    v_rol := v_claims->'app_metadata'->>'rol';
    v_tipo := v_claims->'app_metadata'->>'tipo_acceso';
    if new.estado is distinct from 'nueva' then
      raise exception using errcode='23514',message='Una consulta manual debe comenzar en estado nueva';
    end if;
    if new.canal_via is not null then
      raise exception using errcode='23514',message='Una consulta manual no usa vía QR ni Link';
    end if;
    if btrim(coalesce(new.nombre,''))=''
       or btrim(coalesce(new.email,''))=''
       or btrim(coalesce(new.telefono,''))=''
       or btrim(new.email) !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
      raise exception using errcode='23514',message='Nombre, email válido y teléfono son obligatorios';
    end if;

    if v_uid is not null and v_rol='admin' then
      if new.canal_ref is not null and not exists (
        select 1 from public.referencias r join public.canales c on c.id=r.canal_id
        where r.codigo=new.canal_ref and r.codigo=c.codigo and r.punto_tipo='principal'
          and r.activo is true and c.activo is true
      ) then
        raise exception using errcode='23514',message='El canal manual no tiene principal elegible';
      end if;
    elsif v_uid is not null and v_rol='colaborador' and v_tipo='activo' then
      if new.canal_ref is null or not exists (
        select 1 from public.referencias r join public.canales c on c.id=r.canal_id
        where r.codigo=new.canal_ref and r.codigo=c.codigo and r.punto_tipo='principal'
          and r.activo is true and c.activo is true and c.user_id=v_uid
          and c.tipo_acceso='activo'
      ) then
        raise exception using errcode='42501',message='El colaborador activo debe usar una principal propia elegible';
      end if;
    else
      raise exception using errcode='42501',message='Rol no autorizado para carga manual';
    end if;
  end if;
  return new;
end;
$function$;

alter function public.contactos_insert_guard_v32() owner to postgres;
revoke all on function public.contactos_insert_guard_v32() from public, anon, authenticated;
grant execute on function public.contactos_insert_guard_v32() to service_role;

do $l1b_rollback_postcheck$
declare
  v_guard_md5 text;
  v_policy_md5 text;
begin
  select md5(pg_get_functiondef('public.contactos_insert_guard_v32()'::regprocedure))
    into v_guard_md5;
  if v_guard_md5 <> 'ddf2a6382b048a8a028c12864dbab0d1' then
    raise exception 'L1B_ROLLBACK_GUARD_NO_RESTAURADO: %', v_guard_md5;
  end if;

  select md5(pg_get_expr(p.polwithcheck, p.polrelid))
    into v_policy_md5
  from pg_policy p
  where p.polrelid = 'public.contactos'::regclass
    and p.polname = 'Colaborador activo carga consulta manual';
  if v_policy_md5 is distinct from '1bfe5da049ae5af97e58cd44ef1d440d' then
    raise exception 'L1B_ROLLBACK_POLICY_NO_RESTAURADA: %', coalesce(v_policy_md5, '<null>');
  end if;
end
$l1b_rollback_postcheck$;

select 'L1B_DERIVACION_ACTIVA_ROLLBACK_OK'::text as recibo;

commit;
