begin;

do $l1c_rollback_precheck$
declare
  v_bad integer;
begin
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.contactos'::regclass
      and c.relrowsecurity is true
  ) then
    raise exception 'L1C_ROLLBACK_RLS_CONTACTOS_DESHABILITADA';
  end if;

  select count(*) into v_bad
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname in ('Agente ve sus contactos', 'Agente ve sus leads')
    and p.cmd = 'SELECT'
    and p.roles::text[] = array['authenticated']
    and position('l1_es_colaborador_activo_vivo_pub_v1' in coalesce(p.qual, '')) > 0;
  if v_bad <> 2 then
    raise exception 'L1C_ROLLBACK_POLICIES_NO_SON_L1C: %', v_bad;
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'contactos'
      and p.policyname = 'Desarrollador ve contactos de su proyecto'
  ) then
    raise exception 'L1C_ROLLBACK_POLICY_DESARROLLADOR_YA_EXISTE';
  end if;
end
$l1c_rollback_precheck$;

drop policy "Agente ve sus contactos" on public.contactos;
create policy "Agente ve sus contactos"
on public.contactos
for select
to public
using (
  canal_ref in (
    select r.codigo
    from (public.referencias r
    join public.canales c on ((r.canal_id = c.id)))
    where (c.user_id = auth.uid())
    union
    select canales.codigo
    from public.canales
    where (canales.user_id = auth.uid())
  )
);

drop policy "Agente ve sus leads" on public.contactos;
create policy "Agente ve sus leads"
on public.contactos
for select
to public
using (
  canal_ref = (
    select canales.codigo
    from public.canales
    where (canales.user_id = auth.uid())
    limit 1
  )
);

create policy "Desarrollador ve contactos de su proyecto"
on public.contactos
for select
to authenticated
using (
  (((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'rol'::text) = 'colaborador'::text
  and (((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'tipo_acceso'::text) = 'desarrollador'::text
  and nullif((((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'proyecto_slug'::text), ''::text) is not null
  and proyecto_slug = (((select auth.jwt() as jwt) -> 'app_metadata'::text) ->> 'proyecto_slug'::text)
);

-- Decisión de Mariano: TRUNCATE no se restaura. Cualquier restauración requiere
-- una autorización extraordinaria y una migración independiente.

do $l1c_rollback_postcheck$
declare
  v_md5 text;
  v_bad integer;
begin
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.contactos'::regclass
      and c.relrowsecurity is true
  ) then
    raise exception 'L1C_ROLLBACK_RLS_CONTACTOS_DESHABILITADA_POSTCHECK';
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Agente ve sus contactos'
    and p.cmd = 'SELECT' and p.roles::text[] = array['public'];
  if v_md5 is distinct from '06dd70e004fba30e66794b9a8be72df4' then
    raise exception 'L1C_ROLLBACK_POLICY_CONTACTOS_NO_RESTAURADA: %', coalesce(v_md5, '<null>');
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Agente ve sus leads'
    and p.cmd = 'SELECT' and p.roles::text[] = array['public'];
  if v_md5 is distinct from '5f5b68aef7c182025f4b00dfdd8873cb' then
    raise exception 'L1C_ROLLBACK_POLICY_LEADS_NO_RESTAURADA: %', coalesce(v_md5, '<null>');
  end if;

  select md5(coalesce(p.qual, '')) into v_md5
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'contactos'
    and p.policyname = 'Desarrollador ve contactos de su proyecto'
    and p.cmd = 'SELECT' and p.roles::text[] = array['authenticated'];
  if v_md5 is distinct from '70abcbace501fa7a54252f18d5828976' then
    raise exception 'L1C_ROLLBACK_POLICY_DESARROLLADOR_NO_RESTAURADA: %', coalesce(v_md5, '<null>');
  end if;

  if has_table_privilege('anon', 'public.contactos', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.contactos', 'TRUNCATE') then
    raise exception 'L1C_ROLLBACK_TRUNCATE_RESTAURADO_SIN_AUTORIZACION';
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
  if v_bad <> 14 or exists (
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
    raise exception 'L1C_ROLLBACK_ACL_INESPERADA: %', v_bad;
  end if;
end
$l1c_rollback_postcheck$;

select 'L1C_CORTE_RLS_ACL_ROLLBACK_OK_TRUNCATE_NO_RESTAURADO'::text as recibo;

commit;
