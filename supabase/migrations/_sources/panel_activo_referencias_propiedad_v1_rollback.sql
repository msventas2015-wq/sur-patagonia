begin;

do $panel_activo_rel_rollback_precheck$
declare
  v_comment text;
  v_def_md5 text;
  v_owner text;
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_acl_exact boolean;
begin
  if to_regprocedure('public.rpc_activo_referencias_propiedad_v1()') is null then
    raise exception 'PANEL_ACTIVO_REL_RPC_INEXISTENTE';
  end if;

  select
    d.description,
    md5(pg_catalog.pg_get_functiondef(p.oid)),
    owner_role.rolname,
    p.prosecdef,
    p.provolatile,
    p.proconfig
    into v_comment, v_def_md5, v_owner, v_security_definer, v_volatility, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
  left join pg_catalog.pg_description d on d.objoid = p.oid and d.classoid = 'pg_catalog.pg_proc'::regclass
  where n.nspname = 'public'
    and p.proname = 'rpc_activo_referencias_propiedad_v1'
    and p.pronargs = 0;

  if v_comment is distinct from 'PANEL_ACTIVO_REFERENCIAS_PROPIEDAD_V1'
     or v_def_md5 is distinct from 'a96499a8450770ce6182b9057792bbab'
     or v_owner is distinct from 'postgres'
     or v_security_definer is distinct from true
     or v_volatility is distinct from 's'::"char"
     or v_config is distinct from array['search_path=""']::text[] then
    raise exception 'PANEL_ACTIVO_REL_RPC_DEFINICION_INESPERADA: md5=%, owner=%, secdef=%, volatility=%, config=%',
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
    raise exception 'PANEL_ACTIVO_REL_RPC_ACL_INESPERADA';
  end if;
end
$panel_activo_rel_rollback_precheck$;

drop function public.rpc_activo_referencias_propiedad_v1();

do $panel_activo_rel_rollback_postcheck$
begin
  if to_regprocedure('public.rpc_activo_referencias_propiedad_v1()') is not null then
    raise exception 'PANEL_ACTIVO_REL_RPC_NO_ELIMINADA';
  end if;
end
$panel_activo_rel_rollback_postcheck$;

commit;
