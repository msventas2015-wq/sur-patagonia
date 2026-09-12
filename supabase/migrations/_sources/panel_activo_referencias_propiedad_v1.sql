begin;

do $panel_activo_rel_precheck$
begin
  if to_regprocedure('private.l1_es_colaborador_activo_vivo_v1(uuid)') is null then
    raise exception 'PANEL_ACTIVO_REL_HELPER_INEXISTENTE';
  end if;
  if to_regclass('public.canales') is null
     or to_regclass('public.referencias') is null
     or to_regclass('public.referencia_propiedad') is null
     or to_regclass('public.contactos') is null then
    raise exception 'PANEL_ACTIVO_REL_TABLAS_INEXISTENTES';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.contactos'::regclass
      and a.attname = 'fecha_cierre'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'PANEL_ACTIVO_REL_CONTACTOS_FECHA_CIERRE_INEXISTENTE';
  end if;
  if to_regprocedure('public.rpc_activo_referencias_propiedad_v1()') is not null then
    raise exception 'PANEL_ACTIVO_REL_RPC_YA_EXISTE';
  end if;
end
$panel_activo_rel_precheck$;

create function public.rpc_activo_referencias_propiedad_v1()
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
    raise exception using errcode = '42501', message = 'PANEL_ACTIVO_REL_NO_AUTORIZADO';
  end if;

  with relaciones as (
    select
      r.id as referencia_id,
      r.codigo as referencia_codigo,
      rp.propiedad_id
    from public.referencias r
    join public.canales c on c.id = r.canal_id
    join public.referencia_propiedad rp on rp.referencia_id = r.id
    where c.user_id = v_uid
  )
  select
    count(*)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'referencia_id', referencia_id,
          'referencia_codigo', referencia_codigo,
          'propiedad_id', propiedad_id
        ) order by referencia_codigo, referencia_id
      ),
      '[]'::jsonb
    )
  into v_total, v_filas
  from relaciones;

  return jsonb_build_object(
    'total_filas', v_total,
    'filas', v_filas
  );
end
$function$;

alter function public.rpc_activo_referencias_propiedad_v1() owner to postgres;
revoke all on function public.rpc_activo_referencias_propiedad_v1() from public, anon, authenticated, service_role;
grant execute on function public.rpc_activo_referencias_propiedad_v1() to authenticated;
comment on function public.rpc_activo_referencias_propiedad_v1() is 'PANEL_ACTIVO_REFERENCIAS_PROPIEDAD_V1';

do $panel_activo_rel_postcheck$
declare
  v_def_md5 text;
  v_owner text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_acl_exact boolean;
begin
  if to_regprocedure('public.rpc_activo_referencias_propiedad_v1()') is null then
    raise exception 'PANEL_ACTIVO_REL_RPC_NO_CREADA';
  end if;

  select
    md5(pg_catalog.pg_get_functiondef(p.oid)),
    owner_role.rolname,
    p.prosecdef,
    p.provolatile,
    p.proconfig
  into v_def_md5, v_owner, v_security_definer, v_volatility, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public'
    and p.proname = 'rpc_activo_referencias_propiedad_v1'
    and p.pronargs = 0;

  if v_def_md5 is distinct from 'a96499a8450770ce6182b9057792bbab'
     or v_owner is distinct from 'postgres'
     or v_security_definer is distinct from true
     or v_volatility is distinct from 's'::"char"
     or v_config is distinct from array['search_path=""']::text[] then
    raise exception 'PANEL_ACTIVO_REL_DEFINICION_INCORRECTA: md5=%, owner=%, secdef=%, volatility=%, config=%',
      coalesce(v_def_md5, '<null>'), coalesce(v_owner, '<null>'), v_security_definer,
      v_volatility, coalesce(v_config::text, '<null>');
  end if;

  select
    count(*) = 2
    and pg_catalog.bool_and(
      (
        grantee_role.rolname = 'postgres'
        and grantor_role.rolname = 'postgres'
        and not acl.is_grantable
      )
      or (
        grantee_role.rolname = 'authenticated'
        and grantor_role.rolname = 'postgres'
        and not acl.is_grantable
      )
    )
    into v_acl_exact
  from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
  left join pg_catalog.pg_roles grantee_role on grantee_role.oid = acl.grantee
  left join pg_catalog.pg_roles grantor_role on grantor_role.oid = acl.grantor
  where p.oid = 'public.rpc_activo_referencias_propiedad_v1()'::regprocedure
    and acl.privilege_type = 'EXECUTE';

  if has_function_privilege('anon', 'public.rpc_activo_referencias_propiedad_v1()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.rpc_activo_referencias_propiedad_v1()', 'EXECUTE')
     or has_function_privilege('public', 'public.rpc_activo_referencias_propiedad_v1()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.rpc_activo_referencias_propiedad_v1()', 'EXECUTE')
     or v_acl_exact is distinct from true then
    raise exception 'PANEL_ACTIVO_REL_ACL_INCORRECTA';
  end if;
end
$panel_activo_rel_postcheck$;

commit;
