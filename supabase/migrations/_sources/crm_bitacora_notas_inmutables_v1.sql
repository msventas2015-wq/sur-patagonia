begin;

do $crm_bitacora_precheck$
declare
  v_insert_policy text;
begin
  if to_regclass('public.crm_eventos') is null
     or to_regclass('public.contactos') is null then
    raise exception 'CRM_BITACORA_TABLAS_INEXISTENTES';
  end if;

  if to_regprocedure('public.rpc_admin_agregar_nota_crm(uuid,text)') is not null then
    raise exception 'CRM_BITACORA_RPC_YA_EXISTE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.crm_eventos'::regclass
      and a.attname in ('contacto_id','persona_id','tipo_evento','origen','actor_id','nota','metadata','fecha_evento')
      and a.attnum > 0
      and not a.attisdropped
    group by a.attrelid
    having count(*) = 8
  ) then
    raise exception 'CRM_BITACORA_COLUMNAS_INCOMPLETAS';
  end if;

  select p.with_check
  into v_insert_policy
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'crm_eventos'
    and p.policyname = 'crm_eventos_admin_insert'
    and p.cmd = 'INSERT';

  if v_insert_policy is distinct from '(((auth.jwt() -> ''app_metadata''::text) ->> ''rol''::text) = ''admin''::text)' then
    raise exception 'CRM_BITACORA_POLICY_INSERT_INESPERADA: %', coalesce(v_insert_policy, '<null>');
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = 'public.crm_eventos'::regclass
      and c.relforcerowsecurity
  ) then
    raise exception 'CRM_BITACORA_FORCE_RLS_INESPERADO';
  end if;
end
$crm_bitacora_precheck$;

create function public.rpc_admin_agregar_nota_crm(
  p_contacto_id uuid,
  p_nota text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_rol text := coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '');
  v_nota text := btrim(coalesce(p_nota, ''));
  v_contacto record;
  v_evento public.crm_eventos%rowtype;
begin
  if v_uid is null or v_rol is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'CRM_NOTA_NO_AUTORIZADO';
  end if;

  if char_length(v_nota) = 0 then
    raise exception using errcode = '22023', message = 'CRM_NOTA_VACIA';
  end if;

  if char_length(v_nota) > 4000 then
    raise exception using errcode = '22023', message = 'CRM_NOTA_DEMASIADO_LARGA';
  end if;

  select
    c.id,
    c.persona_id,
    c.propiedad_id,
    c.proyecto_slug,
    c.canal_ref,
    c.canal_via
  into v_contacto
  from public.contactos c
  where c.id = p_contacto_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'CRM_CONTACTO_INEXISTENTE';
  end if;

  insert into public.crm_eventos (
    contacto_id,
    persona_id,
    tipo_evento,
    origen,
    actor_id,
    propiedad_id,
    proyecto_slug,
    canal_ref,
    canal_via,
    nota,
    metadata,
    fecha_evento
  ) values (
    v_contacto.id,
    v_contacto.persona_id,
    'nota',
    'admin',
    v_uid,
    v_contacto.propiedad_id,
    v_contacto.proyecto_slug,
    v_contacto.canal_ref,
    v_contacto.canal_via,
    v_nota,
    jsonb_build_object('schema_version', 1, 'fuente', 'crm_admin'),
    clock_timestamp()
  )
  returning * into v_evento;

  return jsonb_build_object(
    'id', v_evento.id,
    'contacto_id', v_evento.contacto_id,
    'persona_id', v_evento.persona_id,
    'tipo_evento', v_evento.tipo_evento,
    'origen', v_evento.origen,
    'actor_id', v_evento.actor_id,
    'nota', v_evento.nota,
    'fecha_evento', v_evento.fecha_evento,
    'created_at', v_evento.created_at
  );
end
$function$;

alter function public.rpc_admin_agregar_nota_crm(uuid,text) owner to postgres;
revoke all on function public.rpc_admin_agregar_nota_crm(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_admin_agregar_nota_crm(uuid,text) to authenticated;
comment on function public.rpc_admin_agregar_nota_crm(uuid,text) is
  'CRM_BITACORA_NOTAS_INMUTABLES_V1: inserta una nota administrativa con autor y hora resueltos en servidor';

drop policy crm_eventos_admin_insert on public.crm_eventos;
create policy crm_eventos_admin_insert
on public.crm_eventos
for insert
to authenticated
with check (
  (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'
  and actor_id = auth.uid()
);

do $crm_bitacora_postcheck$
declare
  v_owner text;
  v_secdef boolean;
  v_config text[];
  v_insert_policy text;
begin
  select r.rolname, p.prosecdef, p.proconfig
  into v_owner, v_secdef, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = 'public.rpc_admin_agregar_nota_crm(uuid,text)'::regprocedure;

  if v_owner is distinct from 'postgres'
     or v_secdef is distinct from true
     or v_config is distinct from array['search_path=""']::text[] then
    raise exception 'CRM_BITACORA_RPC_CONFIG_INCORRECTA: owner=%, secdef=%, config=%',
      coalesce(v_owner, '<null>'), v_secdef, coalesce(v_config::text, '<null>');
  end if;

  if has_function_privilege('anon', 'public.rpc_admin_agregar_nota_crm(uuid,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.rpc_admin_agregar_nota_crm(uuid,text)', 'EXECUTE')
     or has_function_privilege('public', 'public.rpc_admin_agregar_nota_crm(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.rpc_admin_agregar_nota_crm(uuid,text)', 'EXECUTE') then
    raise exception 'CRM_BITACORA_RPC_ACL_INCORRECTA';
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
    raise exception 'CRM_BITACORA_POLICY_NO_ENDURECIDA: %', coalesce(v_insert_policy, '<null>');
  end if;
end
$crm_bitacora_postcheck$;

commit;
