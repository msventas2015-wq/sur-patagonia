begin;

do $crm_bitacora_rollback_precheck$
declare
  v_comment text;
  v_insert_policy text;
begin
  if to_regprocedure('public.rpc_admin_agregar_nota_crm(uuid,text)') is null then
    raise exception 'CRM_BITACORA_RPC_INEXISTENTE';
  end if;

  select d.description
  into v_comment
  from pg_catalog.pg_proc p
  left join pg_catalog.pg_description d
    on d.objoid = p.oid and d.classoid = 'pg_catalog.pg_proc'::regclass
  where p.oid = 'public.rpc_admin_agregar_nota_crm(uuid,text)'::regprocedure;

  if v_comment is distinct from 'CRM_BITACORA_NOTAS_INMUTABLES_V1: inserta una nota administrativa con autor y hora resueltos en servidor' then
    raise exception 'CRM_BITACORA_RPC_INESPERADA: %', coalesce(v_comment, '<null>');
  end if;

  select p.with_check
  into v_insert_policy
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'crm_eventos'
    and p.policyname = 'crm_eventos_admin_insert';

  if v_insert_policy is null
     or position('actor_id = auth.uid()' in v_insert_policy) = 0
     or position('admin' in v_insert_policy) = 0 then
    raise exception 'CRM_BITACORA_POLICY_INESPERADA: %', coalesce(v_insert_policy, '<null>');
  end if;
end
$crm_bitacora_rollback_precheck$;

drop function public.rpc_admin_agregar_nota_crm(uuid,text);

drop policy crm_eventos_admin_insert on public.crm_eventos;
create policy crm_eventos_admin_insert
on public.crm_eventos
for insert
to authenticated
with check (
  (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'
);

do $crm_bitacora_rollback_postcheck$
declare
  v_insert_policy text;
begin
  if to_regprocedure('public.rpc_admin_agregar_nota_crm(uuid,text)') is not null then
    raise exception 'CRM_BITACORA_RPC_NO_ELIMINADA';
  end if;

  select p.with_check
  into v_insert_policy
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'crm_eventos'
    and p.policyname = 'crm_eventos_admin_insert';

  if v_insert_policy is distinct from '(((auth.jwt() -> ''app_metadata''::text) ->> ''rol''::text) = ''admin''::text)' then
    raise exception 'CRM_BITACORA_POLICY_NO_RESTAURADA: %', coalesce(v_insert_policy, '<null>');
  end if;
end
$crm_bitacora_rollback_postcheck$;

commit;
