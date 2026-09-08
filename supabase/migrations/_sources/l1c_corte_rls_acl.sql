begin;

do $l1c_precheck$
declare
  v_md5 text;
  v_bad integer;
  v_truncate integer;
begin
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.contactos'::regclass
      and c.relrowsecurity is true
  ) then
    raise exception 'L1C_RLS_CONTACTOS_DESHABILITADA';
  end if;

  if to_regprocedure('public.l1_es_colaborador_activo_vivo_pub_v1()') is null
     or to_regprocedure('public.rpc_pasivo_contactos_anon(timestamp with time zone,timestamp with time zone,text,integer)') is null
     or to_regprocedure('public.rpc_desarrollador_contactos_sin_pii_v1(timestamp with time zone,timestamp with time zone,text,integer)') is null then
    raise exception 'L1C_DEPENDENCIA_L1A_INEXISTENTE';
  end if;

  if position(
       'private.l1_es_colaborador_activo_vivo_v1(v_uid)'
       in pg_get_functiondef('public.contactos_insert_guard_v32()'::regprocedure)
     ) = 0
     or not exists (
       select 1
       from pg_policy p
       where p.polrelid = 'public.contactos'::regclass
         and p.polname = 'Colaborador activo carga consulta manual'
         and position(
           'l1_es_colaborador_activo_vivo_pub_v1'
           in coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         ) > 0
     ) then
    raise exception 'L1C_DEPENDENCIA_L1B_INEXISTENTE';
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Agente ve sus contactos'
    and p.cmd = 'SELECT' and p.roles::text[] = array['public'];
  if v_md5 is distinct from '06dd70e004fba30e66794b9a8be72df4' then
    raise exception 'L1C_POLICY_CONTACTOS_BASE_INESPERADA: %', coalesce(v_md5, '<null>');
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Agente ve sus leads'
    and p.cmd = 'SELECT' and p.roles::text[] = array['public'];
  if v_md5 is distinct from '5f5b68aef7c182025f4b00dfdd8873cb' then
    raise exception 'L1C_POLICY_LEADS_BASE_INESPERADA: %', coalesce(v_md5, '<null>');
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Desarrollador ve contactos de su proyecto'
    and p.cmd = 'SELECT' and p.roles::text[] = array['authenticated'];
  if v_md5 is distinct from '70abcbace501fa7a54252f18d5828976' then
    raise exception 'L1C_POLICY_DESARROLLADOR_BASE_INESPERADA: %', coalesce(v_md5, '<null>');
  end if;

  select count(*) into v_bad
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid = x.grantee
  join pg_roles g on g.oid = x.grantor
  where c.oid = 'public.contactos'::regclass
    and r.rolname in ('anon', 'authenticated')
    and g.rolname = 'postgres'
    and x.is_grantable is false
    and x.privilege_type in ('DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','UPDATE');

  select count(*) into v_truncate
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid = x.grantee
  join pg_roles g on g.oid = x.grantor
  where c.oid = 'public.contactos'::regclass
    and r.rolname in ('anon', 'authenticated')
    and g.rolname = 'postgres'
    and x.is_grantable is false
    and x.privilege_type = 'TRUNCATE';

  if v_bad <> 14
     or v_truncate not in (0, 2)
     or has_table_privilege('anon', 'public.contactos', 'TRUNCATE')
        is distinct from has_table_privilege('authenticated', 'public.contactos', 'TRUNCATE')
     or exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
    join pg_roles r on r.oid = x.grantee
    join pg_roles g on g.oid = x.grantor
    where c.oid = 'public.contactos'::regclass
      and r.rolname in ('anon', 'authenticated')
      and not (
        g.rolname = 'postgres'
        and x.is_grantable is false
        and x.privilege_type in ('DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE')
      )
  ) then
    raise exception 'L1C_ACL_BASE_INESPERADA: operativas=%, truncate=%', v_bad, v_truncate;
  end if;
end
$l1c_precheck$;

drop policy "Agente ve sus contactos" on public.contactos;
create policy "Agente ve sus contactos"
on public.contactos
for select
to authenticated
using (
  public.l1_es_colaborador_activo_vivo_pub_v1()
  and canal_ref in (
    select r.codigo
    from public.referencias r
    join public.canales c on r.canal_id = c.id
    where c.user_id = auth.uid()
    union
    select c.codigo
    from public.canales c
    where c.user_id = auth.uid()
  )
);

drop policy "Agente ve sus leads" on public.contactos;
create policy "Agente ve sus leads"
on public.contactos
for select
to authenticated
using (
  public.l1_es_colaborador_activo_vivo_pub_v1()
  and canal_ref = (
    select c.codigo
    from public.canales c
    where c.user_id = auth.uid()
    limit 1
  )
);

drop policy "Desarrollador ve contactos de su proyecto" on public.contactos;

revoke truncate on table public.contactos from anon, authenticated;

do $l1c_postcheck$
declare
  v_bad integer;
begin
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.contactos'::regclass
      and c.relrowsecurity is true
  ) then
    raise exception 'L1C_RLS_CONTACTOS_DESHABILITADA_POSTCHECK';
  end if;

  select count(*) into v_bad
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname in ('Agente ve sus contactos', 'Agente ve sus leads')
    and p.cmd = 'SELECT'
    and p.roles::text[] = array['authenticated']
    and position('l1_es_colaborador_activo_vivo_pub_v1' in coalesce(p.qual, '')) > 0;
  if v_bad <> 2 then
    raise exception 'L1C_POLICIES_ACTIVO_POSTCHECK_FALLIDO: %', v_bad;
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'contactos'
      and p.policyname = 'Desarrollador ve contactos de su proyecto'
  ) then
    raise exception 'L1C_POLICY_DESARROLLADOR_SIGUE_PRESENTE';
  end if;

  if has_table_privilege('anon', 'public.contactos', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.contactos', 'TRUNCATE') then
    raise exception 'L1C_TRUNCATE_SIGUE_OTORGADO';
  end if;

  select count(*) into v_bad
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  join pg_roles r on r.oid = x.grantee
  join pg_roles g on g.oid = x.grantor
  where c.oid = 'public.contactos'::regclass
    and r.rolname in ('anon', 'authenticated')
    and x.privilege_type in ('DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','UPDATE')
    and g.rolname = 'postgres'
    and x.is_grantable is false;
  if v_bad <> 14 then
    raise exception 'L1C_ACL_OPERATIVA_ALTERADA: %', v_bad;
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
    join pg_roles r on r.oid = x.grantee
    join pg_roles g on g.oid = x.grantor
    where c.oid = 'public.contactos'::regclass
      and r.rolname in ('anon', 'authenticated')
      and not (
        g.rolname = 'postgres'
        and x.is_grantable is false
        and x.privilege_type in ('DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','UPDATE')
      )
  ) then
    raise exception 'L1C_ACL_OPERATIVA_TIENE_FILAS_INESPERADAS';
  end if;
end
$l1c_postcheck$;

select 'L1C_CORTE_RLS_ACL_OK'::text as recibo;

commit;
