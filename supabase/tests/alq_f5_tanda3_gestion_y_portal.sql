\set ON_ERROR_STOP on
begin;
set local application_name='alq-f5-tanda3-regression';
set local timezone='UTC';

-- El fixture PG17 reducido no trae todas las columnas de GoTrue. Se agregan
-- dentro de esta transacción (que siempre termina en ROLLBACK) para probar la
-- misma habilitación de identidad que existe en Supabase.
do $alq_f5t3_auth_users_environment$
begin
  alter table auth.users
    add column if not exists role text,
    add column if not exists raw_app_meta_data jsonb,
    add column if not exists deleted_at timestamptz,
    add column if not exists banned_until timestamptz;
exception when insufficient_privilege then
  if (
    select pg_catalog.count(*)
    from information_schema.columns c
    where c.table_schema='auth'
      and c.table_name='users'
      and c.column_name in (
        'role','raw_app_meta_data','deleted_at','banned_until')
  )<>4 then
    raise exception using
      errcode='42501',
      message='ALQ_F5_T3_AUTH_USERS_HOSTED_STATE_INVALID: faltan columnas requeridas (role, raw_app_meta_data, deleted_at, banned_until)';
  end if;
end
$alq_f5t3_auth_users_environment$;

-- El fixture local simplifica Storage y deja RLS/grants apagados. Se emula el
-- contrato real de Supabase dentro de este ROLLBACK para probar alq_docs_select.
do $alq_f5t3_storage_environment$
declare
  v_sql text;
  v_insufficient_privilege boolean:=false;
  v_schema_usage boolean;
  v_objects_select boolean;
  v_objects_rls boolean;
begin
  foreach v_sql in array array[
    'grant usage on schema storage to authenticated',
    'grant select on storage.objects to authenticated',
    'alter table storage.objects enable row level security'
  ]
  loop
    begin
      execute v_sql;
    exception when insufficient_privilege then
      v_insufficient_privilege:=true;
    end;
  end loop;

  if v_insufficient_privilege then
    v_schema_usage:=pg_catalog.has_schema_privilege(
      'authenticated','storage','USAGE');
    v_objects_select:=pg_catalog.has_table_privilege(
      'authenticated','storage.objects','SELECT');

    select c.relrowsecurity
      into v_objects_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage'
      and c.relname='objects';

    if not coalesce(v_schema_usage,false)
       or not coalesce(v_objects_select,false)
       or not coalesce(v_objects_rls,false) then
      raise exception using
        errcode='42501',
        message=pg_catalog.format(
          'ALQ_F5_T3_STORAGE_HOSTED_STATE_INVALID: schema_usage=%s objects_select=%s objects_rls=%s',
          coalesce(v_schema_usage,false),
          coalesce(v_objects_select,false),
          coalesce(v_objects_rls,false));
    end if;
  end if;
end
$alq_f5t3_storage_environment$;

-- Prueba focalizada, siempre con ROLLBACK. Usa un administrador ALQ real del
-- entorno y crea sólo datos identificables de fixture dentro de la transacción.
select set_config('alq_f5.fixture_sub',(
  select u.id::text
  from auth.users u
  join alq.alq_parte_usuario pu on pu.auth_user_id=u.id
  join alq.alq_capacidad_admin ca on ca.parte_usuario_id=pu.id
  where statement_timestamp()<@pu.vigencia
    and statement_timestamp()<@ca.vigencia
  order by u.id limit 1
),true);
select set_config('request.jwt.claim.sub',current_setting('alq_f5.fixture_sub'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub',current_setting('alq_f5.fixture_sub'),'role','authenticated',
  'app_metadata',pg_catalog.jsonb_build_object('rol','admin'))::text,true);

do $preflight$
begin
  perform alq_private.alq_actor_v1(true);
  if exists(select 1 from alq.alq_operacion where request_id=any(array[
    'f5000000-0000-4000-8000-000000003001',
    'f5000000-0000-4000-8000-000000003002',
    'f5000000-0000-4000-8000-000000003003',
    'f5000000-0000-4000-8000-000000003004',
    'f5000000-0000-4000-8000-000000003005',
    'f5000000-0000-4000-8000-000000003011',
    'f5000000-0000-4000-8000-000000003012',
    'f5000000-0000-4000-8000-000000003013'
  ]::uuid[])) then
    raise exception 'ALQ_F5_FIXTURE_REQUEST_ID_OCUPADO';
  end if;
  if exists(select 1 from auth.users where id=any(array[
    'f5000000-0000-4000-8000-000000009001',
    'f5000000-0000-4000-8000-000000009002'
  ]::uuid[])) then
    raise exception 'ALQ_F5_FIXTURE_AUTH_ID_OCUPADO';
  end if;
end
$preflight$;

create function pg_temp.alq_f5_rpc(p_operacion text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_p jsonb;
begin
  v_p:=public.alq_admin_preparar(p_operacion,p_payload);
  return public.alq_admin_aplicar((v_p->>'request_id')::uuid,p_operacion,
    v_p->>'firma',p_payload);
end
$fn$;

create function pg_temp.alq_f5_assert_global()
returns text language sql stable security definer set search_path=''
as $fn$
  select alq_private.alq_assert_global_v1()
$fn$;

-- Cuenta todas las filas que una escritura del portal podría dejar. Es
-- SECURITY DEFINER sólo para que las verificaciones negativas no confundan
-- "la RLS no me deja ver el residuo" con "el residuo no existe".
create function pg_temp.alq_f5_portal_write_counts()
returns jsonb language sql stable security definer set search_path=''
as $fn$
  select pg_catalog.jsonb_build_object(
    'operaciones',(select count(*) from alq.alq_operacion
      where operacion in ('comunicado_abrir','comunicado_responder')),
    'comunicados',(select count(*) from alq.alq_comunicado),
    'mensajes',(select count(*) from alq.alq_comunicado_mensaje),
    'journal',(select count(*) from alq.alq_journal
      where evento in ('comunicado_abrir','comunicado_responder')))
$fn$;

-- Esta función es SECURITY INVOKER: las dos RPC se ejecutan realmente con el
-- SET ROLE authenticated y el JWT configurado por cada caso de la matriz.
create function pg_temp.alq_f5_owner_writes_denied(
  p_caso text,p_propiedad uuid,p_comunicado uuid
)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_antes jsonb:=pg_temp.alq_f5_portal_write_counts();
begin
  begin
    perform public.alq_prop_abrir_consulta(
      p_propiedad,'No debe abrir · '||p_caso,null);
    raise exception 'ALQ_F5_OWNER_WRITE_ABRIR_NO_RECHAZADO:%',p_caso;
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_PROPIETARIO_SIN_ACCESO' then raise; end if;
  end;
  begin
    perform public.alq_prop_responder_consulta(
      p_comunicado,'No debe responder · '||p_caso);
    raise exception 'ALQ_F5_OWNER_WRITE_RESPONDER_NO_RECHAZADO:%',p_caso;
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_PROPIETARIO_SIN_ACCESO' then raise; end if;
  end;
  if pg_temp.alq_f5_portal_write_counts() is distinct from v_antes then
    raise exception 'ALQ_F5_OWNER_WRITE_DEJO_RESIDUO:%',p_caso;
  end if;
end
$fn$;

create function pg_temp.alq_f5_owner_identidad_visible(
  p_parte uuid,p_parte_usuario uuid
)
returns boolean language sql stable security invoker set search_path=''
as $fn$
  select exists(select 1 from public.alq_v_parte where id=p_parte)
     and exists(select 1 from public.alq_v_parte_usuario
       where id=p_parte_usuario)
$fn$;

create function pg_temp.alq_f5_owner_storage_visible(p_path text)
returns boolean language sql stable security invoker set search_path=''
as $fn$
  select exists(select 1 from storage.objects
    where bucket_id='alq-docs' and name=p_path)
$fn$;

set local role authenticated;

select set_config('alq_f5.alta',public.alq_admin_alta_integral(
  'f5000000-0000-4000-8000-000000003001',
  pg_catalog.jsonb_build_object(
    'schema_version',1,
    'propietario',pg_catalog.jsonb_build_object('tipo_persona','fisica',
      'nombre','Propietaria F5 portal','documento_tipo','DNI',
      'documento_numero','F5-OWNER-PORTAL','email','f5-owner@example.invalid'),
    'inquilino',pg_catalog.jsonb_build_object('tipo_persona','fisica',
      'nombre','Inquilino F5 portal','documento_tipo','DNI',
      'documento_numero','F5-TENANT-PORTAL','email','f5-tenant@example.invalid'),
    'propiedad',pg_catalog.jsonb_build_object('direccion','F5 Portal 300',
      'ciudad','Local','provincia','Río Negro'),
    'mandato',pg_catalog.jsonb_build_object('inicio','2026-08-01','fin','2027-07-31',
      'honorario_base','devengado','honorario_pct','0.08',
      'honorario_minimo','0','honorario_fijo','0','incluye_punitorios',false,
      'moneda','ARS','tratamiento_impuestos',pg_catalog.jsonb_build_object()),
    'contrato',pg_catalog.jsonb_build_object('inicio','2026-08-01',
      'fin_pactado','2027-07-31','monto','500000','moneda','ARS',
      'dia_pago_desde','1','dia_pago_hasta','10','ajuste_tipo','sin_ajuste',
      'frecuencia_ajuste_meses',null,'punitorio_pct_dia','0',
      'punitorio_desde_dia','0','formula_punitorio_version','sin_mora_automatica',
      'metodo_prorrateo','dias_reales','regla_redondeo','centavos',
      'regla_pago_otra_moneda','prohibido','fuente_conversion',null,
      'fallback_indice',pg_catalog.jsonb_build_object()),
    'garantia',null,'deposito',null,'servicios',pg_catalog.jsonb_build_array(),
    'documentos',pg_catalog.jsonb_build_object()
  ))::text,true);

select set_config('alq_f5.garantia_payload',pg_catalog.jsonb_build_object(
  'schema_version',1,
  'contrato_id',current_setting('alq_f5.alta')::jsonb->>'contrato_id',
  'garante',pg_catalog.jsonb_build_object('tipo_persona','fisica',
    'nombre','Garante F5 atómico','documento_tipo','DNI',
    'documento_numero','F5-GUARANTOR-ATOMIC','email','f5-guarantor@example.invalid'),
  'tipo','fiador','poliza',null,'emisor',null,'cobertura','500000',
  'moneda','ARS','desde','2026-08-01T00:00:00Z','hasta','2027-08-01T00:00:00Z',
  'documento_id',null,'regla_notificacion_mora',pg_catalog.jsonb_build_object()
)::text,true);
do $garantia_nan$
begin
  perform public.alq_admin_garantia_alta_integral(
    'f5000000-0000-4000-8000-000000003013',
    pg_catalog.jsonb_set(current_setting('alq_f5.garantia_payload')::jsonb,
      '{cobertura}','"NaN"'::jsonb));
  raise exception 'ALQ_F5_GARANTIA_NAN_NO_RECHAZADA';
exception when sqlstate 'P0001' then
  if sqlerrm<>'ALQ_F5_GARANTIA_PAYLOAD_INVALIDO' then
    raise;
  end if;
end
$garantia_nan$;
select set_config('alq_f5.garantia',public.alq_admin_garantia_alta_integral(
  'f5000000-0000-4000-8000-000000003002',
  current_setting('alq_f5.garantia_payload')::jsonb)::text,true);
select set_config('alq_f5.garantia_replay',public.alq_admin_garantia_alta_integral(
  'f5000000-0000-4000-8000-000000003002',
  current_setting('alq_f5.garantia_payload')::jsonb)::text,true);

do $mandato_retroactivo$
begin
  perform public.alq_admin_mandato_cambio_previsualizar(
    (current_setting('alq_f5.alta')::jsonb->>'mandato_id')::uuid,
    pg_catalog.date_trunc('month',pg_catalog.statement_timestamp())::date,
    pg_catalog.jsonb_build_object('honorario_pct','0.10',
      'honorario_minimo','0','honorario_fijo','0',
      'incluye_punitorios',false));
  raise exception 'ALQ_F5_MANDATO_RETROACTIVO_NO_RECHAZADO';
exception when sqlstate 'P0001' then
  if sqlerrm<>'ALQ_F5_MANDATO_FECHA_RETROACTIVA' then
    raise;
  end if;
end
$mandato_retroactivo$;

do $mandato_nan$
begin
  perform public.alq_admin_mandato_cambio_previsualizar(
    (current_setting('alq_f5.alta')::jsonb->>'mandato_id')::uuid,
    '2026-12-01',pg_catalog.jsonb_build_object('honorario_pct','NaN',
      'honorario_minimo','0','honorario_fijo','0',
      'incluye_punitorios',false));
  raise exception 'ALQ_F5_MANDATO_NAN_NO_RECHAZADO';
exception when sqlstate 'P0001' then
  if sqlerrm<>'ALQ_F5_MANDATO_CONFIG_INVALIDA' then
    raise;
  end if;
end
$mandato_nan$;

select set_config('alq_f5.mandato_preview',
  public.alq_admin_mandato_cambio_previsualizar(
    (current_setting('alq_f5.alta')::jsonb->>'mandato_id')::uuid,
    '2026-12-01',pg_catalog.jsonb_build_object('honorario_pct','0.10',
      'honorario_minimo','1000','honorario_fijo','500',
      'incluye_punitorios',true))::text,true);
do $mandato_sin_preview$
begin
  perform public.alq_admin_mandato_version_reemplazar(
    'f5000000-0000-4000-8000-000000003012',
    pg_catalog.jsonb_build_object(
      'schema_version',1,
      'mandato_id',current_setting('alq_f5.alta')::jsonb->>'mandato_id',
      'desde','2026-12-01','honorario_pct','0.10','honorario_minimo','1000',
      'honorario_fijo','500','incluye_punitorios',true,
      'motivo','Intento sin confirmar la vista previa'));
  raise exception 'ALQ_F5_MANDATO_SIN_PREVIEW_NO_RECHAZADO';
exception when sqlstate 'P0001' then
  if sqlerrm<>'ALQ_F5_MANDATO_PAYLOAD_INVALIDO' then
    raise;
  end if;
end
$mandato_sin_preview$;
select set_config('alq_f5.mandato_payload',pg_catalog.jsonb_build_object(
  'schema_version',1,
  'mandato_id',current_setting('alq_f5.alta')::jsonb->>'mandato_id',
  'desde','2026-12-01','honorario_pct','0.10','honorario_minimo','1000',
  'honorario_fijo','500','incluye_punitorios',true,
  'motivo','Nueva comisión acordada para el próximo período',
  'preview_sha256',current_setting('alq_f5.mandato_preview')::jsonb->>'preview_sha256'
)::text,true);
select set_config('alq_f5.mandato',public.alq_admin_mandato_version_reemplazar(
  'f5000000-0000-4000-8000-000000003003',
  current_setting('alq_f5.mandato_payload')::jsonb)::text,true);
select set_config('alq_f5.mandato_replay',public.alq_admin_mandato_version_reemplazar(
  'f5000000-0000-4000-8000-000000003003',
  current_setting('alq_f5.mandato_payload')::jsonb)::text,true);

select set_config('alq_f5.acceso_preview_sin_auth',
  public.alq_admin_propietario_acceso_previsualizar(
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
    'f5-owner@example.invalid')::text,true);

reset role;

insert into auth.users(id,email,role,raw_app_meta_data,deleted_at,banned_until)
values
  ('f5000000-0000-4000-8000-000000009001','f5-owner@example.invalid',
    'authenticated',pg_catalog.jsonb_build_object('rol','colaborador',
      'tipo_acceso','propietario'),null,null),
  ('f5000000-0000-4000-8000-000000009002','f5-stranger@example.invalid',
    'authenticated',pg_catalog.jsonb_build_object('rol','colaborador',
      'tipo_acceso','propietario'),null,null);

-- Ni la previsualización ni el alta aceptan un Auth existente que no tenga
-- exactamente el rol de colaborador con acceso de propietario.
update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','colaborador',
  'tipo_acceso','agente')
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $auth_inhabilitado_preview_apply$
declare
  v_prop uuid:=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid;
  v_owner uuid:=(current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid;
  v_payload jsonb:=pg_catalog.jsonb_build_object('schema_version',1,
    'propiedad_id',v_prop,'parte_id',v_owner,
    'email','f5-owner@example.invalid','motivo','No debe otorgarse');
begin
  begin
    perform public.alq_admin_propietario_acceso_previsualizar(
      v_prop,v_owner,'f5-owner@example.invalid');
    raise exception 'ALQ_F5_PREVIEW_ACEPTO_AUTH_INHABILITADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F5_ACCESO_AUTH_NO_HABILITADO' then raise; end if;
  end;
  begin
    perform public.alq_admin_propietario_acceso_otorgar(
      'f5000000-0000-4000-8000-000000003011',v_payload);
    raise exception 'ALQ_F5_APPLY_ACEPTO_AUTH_INHABILITADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F5_ACCESO_AUTH_NO_HABILITADO' then raise; end if;
  end;
end
$auth_inhabilitado_preview_apply$;
reset role;
update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','colaborador',
  'tipo_acceso','propietario')
where id='f5000000-0000-4000-8000-000000009001';
do $auth_inhabilitado_sin_residuo$
begin
  if exists(select 1 from alq.alq_operacion
    where request_id='f5000000-0000-4000-8000-000000003011') then
    raise exception 'ALQ_F5_APPLY_INHABILITADO_DEJO_OPERACION';
  end if;
end
$auth_inhabilitado_sin_residuo$;

set local role authenticated;
select set_config('alq_f5.acceso_payload',pg_catalog.jsonb_build_object(
  'schema_version',1,
  'propiedad_id',current_setting('alq_f5.alta')::jsonb->>'propiedad_id',
  'parte_id',current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id',
  'email','f5-owner@example.invalid','motivo','Habilitación del portal F5'
)::text,true);
select set_config('alq_f5.acceso',public.alq_admin_propietario_acceso_otorgar(
  'f5000000-0000-4000-8000-000000003004',
  current_setting('alq_f5.acceso_payload')::jsonb)::text,true);
select set_config('alq_f5.acceso_replay',public.alq_admin_propietario_acceso_otorgar(
  'f5000000-0000-4000-8000-000000003004',
  current_setting('alq_f5.acceso_payload')::jsonb)::text,true);

select set_config('alq_f5.documento_owner',pg_temp.alq_f5_rpc(
  'documento_registrar',pg_catalog.jsonb_build_object(
    'tipo','comunicado_adjunto','path','f5/portal/documento-owner.pdf',
    'sha256',pg_catalog.repeat('b',64),'mime','application/pdf','bytes',1,
    'version',1,
    'propiedad_id',current_setting('alq_f5.alta')::jsonb->>'propiedad_id',
    'mandato_id',null,'audiencia','propietario',
    'retencion',pg_catalog.jsonb_build_object()))::text,true);

-- Documento propietario real, con objeto en Storage, pero de otra propiedad.
-- Sirve para probar que el SECURITY DEFINER del portal no puede ligar un UUID
-- ajeno aunque el documento sea descargable por su dueño legítimo.
select set_config('alq_f5.propiedad_ajena',pg_temp.alq_f5_rpc(
  'propiedad_alta',pg_catalog.jsonb_build_object(
    'direccion','F5 Documento ajeno 999','direccion_norm','f5 documento ajeno 999',
    'ciudad','Local','ciudad_norm','local','provincia','Río Negro'))::text,true);
select set_config('alq_f5.documento_ajeno',pg_temp.alq_f5_rpc(
  'documento_registrar',pg_catalog.jsonb_build_object(
    'tipo','comunicado_adjunto','path','f5/portal/documento-ajeno.pdf',
    'sha256',pg_catalog.repeat('a',64),'mime','application/pdf','bytes',1,
    'version',1,
    'propiedad_id',current_setting('alq_f5.propiedad_ajena')::jsonb->>'id',
    'mandato_id',null,'audiencia','propietario',
    'retencion',pg_catalog.jsonb_build_object()))::text,true);

reset role;

insert into storage.objects(bucket_id,name,metadata)
values
  ('alq-docs','f5/portal/documento-owner.pdf',
    pg_catalog.jsonb_build_object('mimetype','application/pdf','size',1)),
  ('alq-docs','f5/portal/documento-ajeno.pdf',
    pg_catalog.jsonb_build_object('mimetype','application/pdf','size',1));

-- Camino positivo de escritura real del portal, con el mismo rol/JWT que usa
-- PostgREST. También se rechaza un adjunto válido de una propiedad ajena sin
-- dejar operación, comunicado, mensaje ni journal ocultos por RLS.
select set_config('request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000009001',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub','f5000000-0000-4000-8000-000000009001',
  'role','authenticated')::text,true);
set local role authenticated;
select set_config('alq_f5.comunicado_owner',public.alq_prop_abrir_consulta(
  (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
  'Consulta válida del propietario F5',
  (current_setting('alq_f5.documento_owner')::jsonb->>'id')::uuid)::text,true);
select set_config('alq_f5.mensaje_owner',public.alq_prop_responder_consulta(
  current_setting('alq_f5.comunicado_owner')::uuid,
  'Respuesta válida del propietario F5')::text,true);
do $owner_adjunto_ajeno$
declare
  v_antes jsonb:=pg_temp.alq_f5_portal_write_counts();
begin
  begin
    perform public.alq_prop_abrir_consulta(
      (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
      'No debe adjuntar documento ajeno',
      (current_setting('alq_f5.documento_ajeno')::jsonb->>'id')::uuid);
    raise exception 'ALQ_F5_OWNER_ADJUNTO_AJENO_NO_RECHAZADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_PROPIETARIO_ADJUNTO_INVALIDO' then raise; end if;
  end;
  if pg_temp.alq_f5_portal_write_counts() is distinct from v_antes then
    raise exception 'ALQ_F5_OWNER_ADJUNTO_AJENO_DEJO_RESIDUO';
  end if;
end
$owner_adjunto_ajeno$;
reset role;

do $resultados$
declare
  v_alta jsonb:=current_setting('alq_f5.alta')::jsonb;
  v_g jsonb:=current_setting('alq_f5.garantia')::jsonb;
  v_gr jsonb:=current_setting('alq_f5.garantia_replay')::jsonb;
  v_m jsonb:=current_setting('alq_f5.mandato')::jsonb;
  v_mr jsonb:=current_setting('alq_f5.mandato_replay')::jsonb;
  v_a jsonb:=current_setting('alq_f5.acceso')::jsonb;
  v_ar jsonb:=current_setting('alq_f5.acceso_replay')::jsonb;
  v_mandato uuid:=(v_alta->>'mandato_id')::uuid;
  v_comunicado uuid:=current_setting('alq_f5.comunicado_owner')::uuid;
  v_mensaje uuid:=current_setting('alq_f5.mensaje_owner')::uuid;
  v_versiones integer;
begin
  if v_g->>'garantia_id' is null or (v_gr->>'replay') is distinct from 'true'
     or v_gr->>'garantia_id' is distinct from v_g->>'garantia_id'
     or (select count(*) from alq.alq_garantia
       where id=(v_g->>'garantia_id')::uuid)<>1
     or (select count(*) from alq.alq_parte
       where documento_tipo='DNI' and documento_numero='F5-GUARANTOR-ATOMIC')<>1 then
    raise exception 'ALQ_F5_GARANTIA_ATOMICA_O_REPLAY_FALLO';
  end if;
  select count(*) into v_versiones from alq.alq_mandato_version
  where mandato_id=v_mandato;
  if v_versiones<>2 or (v_mr->>'replay') is distinct from 'true'
     or v_mr->>'mandato_version_id' is distinct from v_m->>'mandato_version_id'
     or exists(select 1 from alq.alq_mandato_version a
       join alq.alq_mandato_version b on a.mandato_id=b.mandato_id and a.id<b.id
       where a.mandato_id=v_mandato and a.vigencia&&b.vigencia)
     or not exists(select 1 from alq.alq_mandato_version
       where id=(v_m->>'version_anterior_id')::uuid
         and upper(vigencia)='2026-12-01'::date::timestamptz)
     or not exists(select 1 from alq.alq_mandato_version
       where id=(v_m->>'mandato_version_id')::uuid
         and lower(vigencia)='2026-12-01'::date::timestamptz
         and honorario_base='devengado' and honorario_pct=0.10
         and honorario_minimo=1000 and honorario_fijo=500
         and incluye_punitorios) then
    raise exception 'ALQ_F5_MANDATO_ATOMICO_O_REPLAY_FALLO';
  end if;
  if (current_setting('alq_f5.acceso_preview_sin_auth')::jsonb
        ->>'requiere_invitacion') is distinct from 'true'
     or v_a->>'acceso_id' is null or (v_ar->>'replay') is distinct from 'true'
     or v_ar->>'acceso_id' is distinct from v_a->>'acceso_id'
     or (select count(*) from alq.alq_parte_usuario
       where auth_user_id='f5000000-0000-4000-8000-000000009001')<>1
     or (select count(*) from alq.alq_acceso_propiedad
       where id=(v_a->>'acceso_id')::uuid)<>1 then
    raise exception 'ALQ_F5_ACCESO_ATOMICO_O_REPLAY_FALLO';
  end if;
  if not exists(select 1 from alq.alq_comunicado c
       where c.id=v_comunicado and c.propiedad_id=(v_alta->>'propiedad_id')::uuid
         and c.abierto_por_tipo='propietario' and c.estado='abierto')
     or (select count(*) from alq.alq_comunicado_mensaje cm
       where cm.comunicado_id=v_comunicado)<>2
     or not exists(select 1 from alq.alq_comunicado_mensaje cm
       where cm.id=v_mensaje and cm.comunicado_id=v_comunicado
         and cm.autor_tipo='propietario'
         and cm.texto='Respuesta válida del propietario F5')
     or not exists(select 1 from alq.alq_comunicado_mensaje cm
       join alq.alq_comunicado_adjunto ca on ca.mensaje_id=cm.id
       where cm.comunicado_id=v_comunicado
         and cm.texto='Consulta válida del propietario F5'
         and ca.documento_id=(current_setting('alq_f5.documento_owner')::jsonb
           ->>'id')::uuid)
     or (select count(*) from alq.alq_operacion o
       where o.operacion in ('comunicado_abrir','comunicado_responder')
         and o.estado='aplicada' and o.resultado->>'comunicado_id'=v_comunicado::text)<>2
     or (select count(*) from alq.alq_journal j
       where j.evento in ('comunicado_abrir','comunicado_responder')
         and j.despues->>'comunicado_id'=v_comunicado::text)<>2 then
    raise exception 'ALQ_F5_OWNER_WRITE_POSITIVO_FALLO';
  end if;
  if not (select count(*)=3 and pg_catalog.bool_and(
      j.entidad='operacion' and j.entidad_id=o.id
      and j.evento=o.operacion and j.actor=o.actor_parte_usuario_id
      and j.antes is null and j.despues=o.resultado)
    from alq.alq_operacion o
    join alq.alq_journal j on j.operacion_id=o.id
    where o.request_id=any(array[
      'f5000000-0000-4000-8000-000000003002',
      'f5000000-0000-4000-8000-000000003003',
      'f5000000-0000-4000-8000-000000003004'
    ]::uuid[])) then
    raise exception 'ALQ_F5_JOURNAL_CANONICO_FALLO';
  end if;
end
$resultados$;

do $mandato_lock_contract$
declare
  v_def text:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_f5_mandato_version_reemplazar_v1(uuid,jsonb)'::pg_catalog.regprocedure);
  v_lock integer;
  v_check integer;
begin
  v_lock:=pg_catalog.strpos(v_def,'ALQ_F5_MANDATO_LOCK_CONTRATOS');
  v_check:=pg_catalog.strpos(v_def,'ALQ_F5_MANDATO_POSTLOCK_MES_CHECK');
  if v_lock=0 or v_check<=v_lock
     or pg_catalog.strpos(v_def,'order by c.id for update')=0
     or pg_catalog.strpos(v_def,
       'mg.propiedad_id=v_m.propiedad_id and mg.mes>=v_desde')<v_check then
    raise exception 'ALQ_F5_MANDATO_LOCK_O_RECHECK_FALLO';
  end if;
end
$mandato_lock_contract$;

-- La integridad global se comprueba antes de crear una liquidación mínima de
-- prueba RLS. El fixture siguiente carece deliberadamente de objeto físico en
-- Storage: prueba autorización de filas, no simula bytes que no existen.
select pg_temp.alq_f5_assert_global() as debe_ser_ALQ_ASSERT_GLOBAL_OK;

do $liquidacion_fixture$
declare
  v_actor uuid;
  v_op uuid;
  v_liq uuid;
  v_prop uuid:=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid;
  v_owner uuid:=(current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid;
  v_mv uuid;
  v_payload jsonb;
  v_content jsonb:=pg_catalog.jsonb_build_object('fixture','alq_f5_rls');
  v_sha text;
  v_result jsonb;
begin
  select pu.id into v_actor from alq.alq_parte_usuario pu
  where pu.auth_user_id=current_setting('alq_f5.fixture_sub')::uuid
    and pg_catalog.statement_timestamp()<@pu.vigencia;
  select mv.id into v_mv from alq.alq_mandato_version mv
  where mv.mandato_id=(current_setting('alq_f5.alta')::jsonb->>'mandato_id')::uuid
    and '2026-08-01'::date::timestamptz<@mv.vigencia;
  v_sha:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_content::text,'UTF8'),'sha256'),'hex');
  v_payload:=pg_catalog.jsonb_build_object('propiedad_id',v_prop,
    'periodo','2026-08-01','contenido_sha256',v_sha,'fixture_rls',true);
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,
    firma_sha256,estado,actor_parte_usuario_id,preparada_at,expires_at)
  values('f5000000-0000-4000-8000-000000003005',
    'liquidacion_propietario_emitir',v_payload,
    alq_private.alq_firma_v1('liquidacion_propietario_emitir',v_payload),
    'preparada',v_actor,pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()+interval '5 minutes')
  returning id into v_op;
  perform alq_private.alq_f1a_writer_context_v1('enter',v_op);
  insert into alq.alq_liquidacion_propietario(propiedad_id,
    propietario_parte_id,mandato_version_id,periodo,moneda,version_documento,
    estado,saldo_apertura_admin,saldo_cierre_admin,contenido,contenido_sha256,
    sucesora_de,emitida_por_parte_usuario_id,emitida_at,operacion_id)
  values(v_prop,v_owner,v_mv,'2026-08-01','ARS',1,'emitida',0,0,v_content,v_sha,
    null,v_actor,pg_catalog.clock_timestamp(),v_op)
  returning id into v_liq;
  v_result:=pg_catalog.jsonb_build_object('liquidacion_id',v_liq,
    'fixture_rls',true);
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values(v_op,'operacion',v_op,'liquidacion_propietario_emitir',v_result,v_actor);
  perform alq_private.alq_f1a_writer_context_v1('exit',v_op);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,
    aplicada_at=pg_catalog.clock_timestamp() where id=v_op;
  set constraints all deferred;
  perform pg_catalog.set_config('alq_f5.liquidacion_id',v_liq::text,true);
end
$liquidacion_fixture$;

-- Matriz RLS del portal: el dueño habilitado ve su propiedad. Además del
-- vínculo ALQ, su fila de Auth debe seguir vigente y conservar exactamente
-- colaborador → propietario; el JWT por sí solo no alcanza.
select set_config('request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000009001',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub','f5000000-0000-4000-8000-000000009001','role','authenticated')::text,true);
set local role authenticated;
do $owner_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>1
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>1
     or not pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or not pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf')
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-ajeno.pdf') then
    raise exception 'ALQ_F5_OWNER_RLS_NO_VE_PROPIEDAD';
  end if;
end
$owner_rls$;

reset role;
update auth.users set role='anon'
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_auth_role_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_AUTH_ROLE_INCORRECTO_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('auth_role',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$owner_auth_role_rls$;
reset role;
update auth.users set role='authenticated'
where id='f5000000-0000-4000-8000-000000009001';

update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','admin',
  'tipo_acceso','propietario')
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_app_rol_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_APP_ROL_INCORRECTO_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('app_rol',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$owner_app_rol_rls$;
reset role;
update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','colaborador',
  'tipo_acceso','propietario')
where id='f5000000-0000-4000-8000-000000009001';

update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','colaborador',
  'tipo_acceso','agente')
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_tipo_acceso_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_TIPO_ACCESO_INCORRECTO_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('tipo_agente',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$owner_tipo_acceso_rls$;
reset role;
update auth.users
set raw_app_meta_data=pg_catalog.jsonb_build_object('rol','colaborador',
  'tipo_acceso','propietario')
where id='f5000000-0000-4000-8000-000000009001';

update auth.users set banned_until=pg_catalog.statement_timestamp()-interval '1 day'
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_ban_vencido_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>1
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>1
     or not pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or not pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_AUTH_BAN_VENCIDO_NO_RECUPERA_ACCESO';
  end if;
end
$owner_ban_vencido_rls$;
reset role;

update auth.users set banned_until=pg_catalog.statement_timestamp()+interval '1 day'
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_banned_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_AUTH_BANNED_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('banned',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$owner_banned_rls$;
reset role;
update auth.users set banned_until=null
where id='f5000000-0000-4000-8000-000000009001';

update auth.users set deleted_at=pg_catalog.statement_timestamp()
where id='f5000000-0000-4000-8000-000000009001';
set local role authenticated;
do $owner_deleted_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_AUTH_DELETED_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('deleted',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$owner_deleted_rls$;
reset role;

-- El administrador ALQ conserva el bypass canónico aunque el usuario dueño
-- esté inhabilitado: su autorización no depende de la fila Auth del dueño.
select set_config('request.jwt.claim.sub',current_setting('alq_f5.fixture_sub'),true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub',current_setting('alq_f5.fixture_sub'),'role','authenticated',
  'app_metadata',pg_catalog.jsonb_build_object('rol','admin'))::text,true);
set local role authenticated;
do $admin_bypass_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>1
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>1
     or not pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or not pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_ADMIN_BYPASS_RLS_PERDIDO';
  end if;
end
$admin_bypass_rls$;
reset role;
update auth.users set deleted_at=null
where id='f5000000-0000-4000-8000-000000009001';
select set_config('request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000009001',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub','f5000000-0000-4000-8000-000000009001','role','authenticated')::text,true);

select set_config('alq_f5.titularidad_vigencia',(
  select t.vigencia::text from alq.alq_titularidad t
  where t.propiedad_id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid
),true);
update alq.alq_titularidad
set vigencia=pg_catalog.tstzrange(lower(vigencia),
  pg_catalog.statement_timestamp(),'[)')
where propiedad_id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid;
set local role authenticated;
do $expired_title_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_TITULARIDAD_VENCIDA_CONSERVA_ACCESO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('titularidad_vencida',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$expired_title_rls$;
reset role;
update alq.alq_titularidad
set vigencia=current_setting('alq_f5.titularidad_vigencia')::pg_catalog.tstzrange
where propiedad_id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid;

select set_config('request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000009002',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub','f5000000-0000-4000-8000-000000009002','role','authenticated')::text,true);
set local role authenticated;
do $stranger_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_STRANGER_RLS_VE_PROPIEDAD';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('stranger',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$stranger_rls$;

reset role;
select set_config('request.jwt.claim.sub',current_setting('alq_f5.fixture_sub'),true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub',current_setting('alq_f5.fixture_sub'),'role','authenticated',
  'app_metadata',pg_catalog.jsonb_build_object('rol','admin'))::text,true);
set local role authenticated;
select pg_temp.alq_f5_rpc('acceso_revocar',pg_catalog.jsonb_build_object(
  'acceso_id',current_setting('alq_f5.acceso')::jsonb->>'acceso_id',
  'motivo','Prueba de revocación inmediata'));
reset role;

select set_config('request.jwt.claim.sub',
  'f5000000-0000-4000-8000-000000009001',true);
select set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub','f5000000-0000-4000-8000-000000009001','role','authenticated')::text,true);
set local role authenticated;
-- La revocación escribe el extremo superior con clock_timestamp(), mientras
-- las políticas consultan statement_timestamp(). \gexec obliga a psql a enviar
-- esta comprobación como una solicitud nueva y reproduce el siguiente request
-- real del portal, aun cuando el archivo se haya cargado como un solo lote.
select $fresh_request$
do $revoked_rls$
begin
  if (select count(*) from public.alq_v_propiedad
      where id=(current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid)<>0
     or (select count(*) from public.alq_v_liquidacion_propietario
      where id=current_setting('alq_f5.liquidacion_id')::uuid)<>0
     or pg_temp.alq_f5_owner_identidad_visible(
       (current_setting('alq_f5.alta')::jsonb->>'propietario_parte_id')::uuid,
       (current_setting('alq_f5.acceso')::jsonb->>'parte_usuario_id')::uuid)
     or pg_temp.alq_f5_owner_storage_visible(
       'f5/portal/documento-owner.pdf') then
    raise exception 'ALQ_F5_REVOCO_PERO_OWNER_SIGUE_VIENDO';
  end if;
  perform pg_temp.alq_f5_owner_writes_denied('acceso_revocado',
    (current_setting('alq_f5.alta')::jsonb->>'propiedad_id')::uuid,
    current_setting('alq_f5.comunicado_owner')::uuid);
end
$revoked_rls$;
$fresh_request$ \gexec
reset role;

do $acl$
begin
  if pg_catalog.has_function_privilege('anon',
       'public.alq_admin_garantia_alta_integral(uuid,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.alq_admin_mandato_version_reemplazar(uuid,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.alq_admin_propietario_acceso_otorgar(uuid,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.alq_prop_abrir_consulta(uuid,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.alq_prop_responder_consulta(uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'alq_private.alq_prop_operar_v1(text,jsonb)','EXECUTE') then
    raise exception 'ALQ_F5_ACL_ANON_INCORRECTA';
  end if;
end
$acl$;

select
  'ALQ_F5_T3_REGRESSION_OK' as resultado,
  'GARANTIA_ATOMICA_OK' as garantia,
  'GARANTIA_REPLAY_OK' as garantia_replay,
  'MANDATO_RETROACTIVO_RECHAZADO_OK' as mandato_retroactivo,
  'MANDATO_LOCK_Y_RECHECK_OK' as mandato_concurrencia,
  'MANDATO_ATOMICO_OK' as mandato,
  'MANDATO_REPLAY_OK' as mandato_replay,
  'ACCESO_ATOMICO_OK' as acceso,
  'ACCESO_REPLAY_OK' as acceso_replay,
  'OWNER_WRITE_ABRIR_RESPONDER_OK' as owner_write,
  'OWNER_WRITE_AUTH_MATRIX_OK' as owner_write_auth,
  'OWNER_ADJUNTO_AJENO_RECHAZADO_OK' as owner_adjunto,
  'RLS_OWNER_OK' as rls_owner,
  'RLS_AUTH_ROLE_OK' as rls_auth_role,
  'RLS_APP_ROL_OK' as rls_app_rol,
  'RLS_TIPO_ACCESO_OK' as rls_tipo_acceso,
  'RLS_BAN_VENCIDO_OK' as rls_ban_vencido,
  'RLS_BANNED_OK' as rls_banned,
  'RLS_DELETED_OK' as rls_deleted,
  'RLS_ADMIN_BYPASS_OK' as rls_admin_bypass,
  'RLS_STRANGER_OK' as rls_stranger,
  'RLS_TITULARIDAD_VENCIDA_OK' as rls_titularidad_vencida,
  'RLS_REVOCADO_OK' as rls_revocado,
  'ACL_ANON_OK' as acl,
  'ALQ_ASSERT_GLOBAL_OK' as integridad_global;

rollback;
