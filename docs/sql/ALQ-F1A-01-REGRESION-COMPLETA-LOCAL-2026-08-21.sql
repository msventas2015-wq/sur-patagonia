-- ALQ F1-A · regresion completa derivada de D0 · fixture PostgreSQL 17.6 local
-- Prohibido ejecutar en QA o produccion. No repite el D0 sellado: usa sus mismos
-- 17 vectores contra los bytes F1-A ya instalados en un clon local descartable.
-- Los 14 defectos deben ser rechazos financieros exactos; TCTRL/RCTRL/ACTRL deben
-- conservar sus SQLSTATE/mensajes. Todo vive en esta transaccion y termina ROLLBACK.

begin isolation level repeatable read;
set local search_path='';
set local quote_all_identifiers=off;
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local bytea_output='hex';
set local statement_timeout='90s';
set local lock_timeout='5s';

do $d0_guard$
declare
  v_tables integer;
begin
  if current_database()<>'alq_f1a_fixture' or current_user<>'postgres' then
    raise exception 'ALQ_F1A_LOCAL_DESTINO_DB_USUARIO_INVALIDO';
  end if;
  if current_setting('server_version_num')::int<>170006 then
    raise exception 'ALQ_F1A_LOCAL_VERSION_SERVIDOR_INVALIDA:%',current_setting('server_version_num');
  end if;
  if to_regclass('alq_f1a_local.fixture_marca') is null
     or not exists (
       select 1 from alq_f1a_local.fixture_marca
       where singleton and data_directory=current_setting('data_directory')
     ) then
    raise exception 'ALQ_F1A_LOCAL_MARKER_INVALIDA';
  end if;
  if to_regclass('private.qa_marca_descartable') is not null
     and exists (select 1 from private.qa_marca_descartable) then
    raise exception 'ALQ_F1A_LOCAL_QA_MARKER_PRESENTE';
  end if;
  select count(*) into v_tables
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='alq' and c.relkind in ('r','p');
  if v_tables<>46 then raise exception 'ALQ_D0_INVENTARIO_TABLAS_INVALIDO:%',v_tables; end if;
  if cardinality(alq_private.alq_operaciones_v1())<>45
     or cardinality(alq_private.alq_f1a_operaciones_v2())<>8 then
    raise exception 'ALQ_F1A_LOCAL_CATALOGO_OPERACIONES_INVALIDO';
  end if;
  if to_regprocedure('public.alq_admin_preparar(text,jsonb)') is null
     or to_regprocedure('public.alq_admin_aplicar(uuid,text,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_aplicar_v2(uuid,uuid,text,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_cancelar_v2(uuid,uuid,text)') is null
     or to_regprocedure('public.alq_admin_reintentar_v2(uuid,uuid,text)') is null then
    raise exception 'ALQ_F1A_LOCAL_WRAPPERS_AUSENTES';
  end if;
  if (select count(*) from alq.alq_operacion where estado='preparada')<>0 then
    raise exception 'ALQ_D0_OPERACIONES_PREPARADAS_PREEXISTENTES';
  end if;
  if alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F1A_LOCAL_ASSERT_GLOBAL_PRE_FALLO';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('ALQ-F1A-REGRESION-LOCAL-20260821',0)) then
    raise exception 'ALQ_F1A_LOCAL_LOCK_OCUPADO';
  end if;
end
$d0_guard$;

-- BEGIN ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE
-- Bloque byte-copiable a la migración forward. No abre ni cierra transacción,
-- no usa variables psql y no ejecuta ningún apply exitoso. Toda escritura de
-- calificación es transitoria y la identity de journal debe quedar bit a bit igual.
set local search_path='';
set local quote_all_identifiers=off;
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local bytea_output='hex';
set local statement_timeout='90s';
set local lock_timeout='5s';
set constraints all deferred;

do $f1a_forward_guard$
declare
  v_tables integer;
begin
  if session_user<>'postgres' or current_user<>'postgres' then
    raise exception 'ALQ_F1A_FORWARD_USUARIO_INVALIDO';
  end if;
  select count(*) into v_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='alq' and c.relkind in ('r','p');
  if v_tables<>46
     or cardinality(alq_private.alq_operaciones_v1())<>45
     or cardinality(alq_private.alq_f1a_operaciones_v2())<>8 then
    raise exception 'ALQ_F1A_FORWARD_INVENTARIO_INVALIDO';
  end if;
  if to_regprocedure('alq_private.alq_f1a_prevalidar_v2(text,jsonb,uuid)') is null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_cancelar_v2(uuid,uuid,text)') is null then
    raise exception 'ALQ_F1A_FORWARD_FUNCIONES_AUSENTES';
  end if;
  if to_regclass('pg_temp.alq_f1a_qualification_context') is not null then
    raise exception 'ALQ_F1A_FORWARD_CONTEXTO_PREEXISTENTE';
  end if;
  if exists (
    select 1 from auth.users where id in (
      'f1af0000-0000-4000-8000-000000000001'::uuid,
      'f1af0000-0000-4000-8000-000000000010'::uuid,
      'f1af0000-0000-4000-8000-000000000020'::uuid,
      'f1af0000-0000-4000-8000-000000000030'::uuid,
      'f1af0000-0000-4000-8000-000000000040'::uuid)
  ) or exists (
    select 1 from alq.alq_parte where id in (
      'f1af0000-0000-4000-8000-000000000002'::uuid,
      'f1af0000-0000-4000-8000-000000000011'::uuid,
      'f1af0000-0000-4000-8000-000000000021'::uuid,
      'f1af0000-0000-4000-8000-000000000041'::uuid)
  ) or exists (
    select 1 from alq.alq_parte_usuario where id in (
      'f1af0000-0000-4000-8000-000000000003'::uuid,
      'f1af0000-0000-4000-8000-000000000012'::uuid,
      'f1af0000-0000-4000-8000-000000000022'::uuid,
      'f1af0000-0000-4000-8000-000000000042'::uuid)
  ) or exists (
    select 1 from alq.alq_propiedad where id in (
      'f1af0000-0000-4000-8000-000000000050'::uuid,
      'f1af0000-0000-4000-8000-000000000051'::uuid)
  ) then
    raise exception 'ALQ_F1A_FORWARD_IDS_RESERVADOS_OCUPADOS';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended('ALQ-F1A-FORWARD-SINGLE-SESSION-20260821',0)) then
    raise exception 'ALQ_F1A_FORWARD_LOCK_OCUPADO';
  end if;
  if alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F1A_FORWARD_ASSERT_GLOBAL_PRE_FALLO';
  end if;
end
$f1a_forward_guard$;

-- Impide writers de journal durante la medición. Nunca se llama nextval/setval:
-- cualquier consumo accidental de la identity hace fallar el POST.
lock table alq.alq_journal in share row exclusive mode;
create temporary table alq_f1a_forward_sequence_snapshot (
  fase text primary key,
  sequence_name text not null,
  last_value bigint not null,
  is_called boolean not null
) on commit drop;
do $f1a_forward_sequence_pre$
declare v_seq regclass; v_last bigint; v_called boolean;
begin
  v_seq:=pg_catalog.pg_get_serial_sequence('alq.alq_journal','id')::regclass;
  if v_seq is null then raise exception 'ALQ_F1A_FORWARD_JOURNAL_IDENTITY_AUSENTE'; end if;
  execute pg_catalog.format('select last_value,is_called from %s',v_seq)
    into v_last,v_called;
  insert into pg_temp.alq_f1a_forward_sequence_snapshot(
    fase,sequence_name,last_value,is_called)
  values ('PRE',v_seq::text,v_last,v_called);
end
$f1a_forward_sequence_pre$;

-- UUID fijo, explícito y reservado para la suite forward; no es el run_id del
-- one-shot ni depende del cliente. La función server-owned valida el destino.
create temporary table alq_f1a_qualification_context (
  run_id uuid primary key
) on commit drop;
insert into pg_temp.alq_f1a_qualification_context(run_id)
values ('f1af1a00-0000-4000-8000-000000000001'::uuid);

do $f1a_forward_context_guard$
begin
  if (select count(*) from pg_temp.alq_f1a_qualification_context)<>1
     or (select run_id from pg_temp.alq_f1a_qualification_context limit 1)
        <>'f1af1a00-0000-4000-8000-000000000001'::uuid then
    raise exception 'ALQ_F1A_FORWARD_CONTEXT_INVALIDO';
  end if;
end
$f1a_forward_context_guard$;

create temporary table alq_d0_resultado (
  ordinal integer primary key,
  caso text not null unique,
  familia text not null,
  invariante text not null,
  vector_unico text not null,
  ruta text not null,
  comportamiento_requerido text not null default 'RECHAZAR',
  resultado text not null,
  estado_test text not null,
  sqlstate text not null,
  mensaje text not null,
  constraint_name text,
  fase_fallo text,
  evidencia jsonb not null,
  evidencia_sha256 text not null,
  regression_test_id text not null,
  esperado_sqlstate text,
  esperado_mensaje text,
  esperado_constraint text
) on commit drop;

create temporary table alq_d0_snapshot (
  fase text not null,
  tabla text not null,
  filas bigint not null,
  sha256 text not null,
  primary key(fase,tabla)
) on commit drop;

create function pg_temp.alq_d0_tomar_snapshot(p_fase text)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare r record; v_count bigint; v_sha text;
begin
  for r in
    select c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq' and c.relkind in ('r','p')
    order by c.relname
  loop
    execute format(
      'select count(*),encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text,''UTF8''),''sha256''),''hex'') from alq.%I t',
      r.relname) into v_count,v_sha;
    insert into pg_temp.alq_d0_snapshot(fase,tabla,filas,sha256)
    values (p_fase,r.relname,v_count,v_sha);
  end loop;
end
$fn$;

select pg_temp.alq_d0_tomar_snapshot('PRE');

-- Actor administrativo sintético y actores RLS de IDs fijos. Nacen después del
-- PRE y se eliminan en orden FK antes del POST; no usan UUID ni credenciales reales.
create function pg_temp.alq_f1a_actor_fixture()
returns void language plpgsql security invoker set search_path=''
as $f1a_actor_fixture$
declare
  v_auth constant uuid:='f1af0000-0000-4000-8000-000000000001';
  v_parte constant uuid:='f1af0000-0000-4000-8000-000000000002';
  v_pu constant uuid:='f1af0000-0000-4000-8000-000000000003';
  v_owner_auth constant uuid:='f1af0000-0000-4000-8000-000000000010';
  v_owner_parte constant uuid:='f1af0000-0000-4000-8000-000000000011';
  v_owner_pu constant uuid:='f1af0000-0000-4000-8000-000000000012';
  v_ajeno_auth constant uuid:='f1af0000-0000-4000-8000-000000000020';
  v_ajeno_parte constant uuid:='f1af0000-0000-4000-8000-000000000021';
  v_ajeno_pu constant uuid:='f1af0000-0000-4000-8000-000000000022';
  v_sin_vinculo_auth constant uuid:='f1af0000-0000-4000-8000-000000000030';
  v_overlap_auth constant uuid:='f1af0000-0000-4000-8000-000000000040';
  v_overlap_parte constant uuid:='f1af0000-0000-4000-8000-000000000041';
  v_overlap_pu constant uuid:='f1af0000-0000-4000-8000-000000000042';
  v_prop_owner constant uuid:='f1af0000-0000-4000-8000-000000000050';
  v_prop_ajena constant uuid:='f1af0000-0000-4000-8000-000000000051';
begin
  insert into auth.users(id,email) values
    (v_auth,'f1a-local-admin.invalid'),
    (v_owner_auth,'f1a-local-owner.invalid'),
    (v_ajeno_auth,'f1a-local-outsider.invalid'),
    (v_sin_vinculo_auth,'f1a-local-unlinked.invalid'),
    (v_overlap_auth,'f1a-local-overlap.invalid');
  insert into alq.alq_parte(id,tipo_persona,nombre,email)
  values
    (v_parte,'fisica','F1A local admin','f1a-local-admin.invalid'),
    (v_owner_parte,'fisica','F1A local owner','f1a-local-owner.invalid'),
    (v_ajeno_parte,'fisica','F1A local outsider','f1a-local-outsider.invalid'),
    (v_overlap_parte,'fisica','F1A local overlap','f1a-local-overlap.invalid');
  insert into alq.alq_parte_usuario(id,parte_id,auth_user_id,vigencia)
  values
    (v_pu,v_parte,v_auth,tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_owner_pu,v_owner_parte,v_owner_auth,tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_ajeno_pu,v_ajeno_parte,v_ajeno_auth,tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_overlap_pu,v_overlap_parte,v_overlap_auth,tstzrange('2026-01-01 00:00:00+00',null,'[)'));
  insert into alq.alq_capacidad_admin(parte_usuario_id,capacidad,vigencia)
  values
    (v_pu,'supervisor',tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_overlap_pu,'supervisor',tstzrange('2026-01-01 00:00:00+00',null,'[)'));
  insert into alq.alq_propiedad(id,direccion,direccion_norm,ciudad,ciudad_norm,provincia)
  values
    (v_prop_owner,'F1A RLS owner','f1a rls owner','Local','local','Chubut'),
    (v_prop_ajena,'F1A RLS ajena','f1a rls ajena','Local','local','Chubut');
  insert into alq.alq_acceso_propiedad(parte_usuario_id,propiedad_id,vigencia)
  values
    (v_owner_pu,v_prop_owner,tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_ajeno_pu,v_prop_ajena,tstzrange('2026-01-01 00:00:00+00',null,'[)')),
    (v_overlap_pu,v_prop_owner,tstzrange('2026-01-01 00:00:00+00',null,'[)'));
end
$f1a_actor_fixture$;

select pg_temp.alq_f1a_actor_fixture();

-- Se simula el JWT del único admin vigente. No se cambia ROLE: es el patrón
-- probado del bootstrap y evita que ACL/RLS eclipse el objeto financiero de D0.
select set_config('request.jwt.claim.sub',(
  select pu.auth_user_id::text
  from alq.alq_capacidad_admin ca join alq.alq_parte_usuario pu on pu.id=ca.parte_usuario_id
  where statement_timestamp()<@ca.vigencia and statement_timestamp()<@pu.vigencia
  order by ca.id limit 1),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',(
  select jsonb_build_object('sub',pu.auth_user_id,'role','authenticated',
    'app_metadata',jsonb_build_object('rol','admin'))::text
  from alq.alq_capacidad_admin ca join alq.alq_parte_usuario pu on pu.id=ca.parte_usuario_id
  where statement_timestamp()<@ca.vigencia and statement_timestamp()<@pu.vigencia
  order by ca.id limit 1),true);

do $d0_actor_guard$
begin
  if alq_private.alq_actor_v1(true) is null then raise exception 'ALQ_D0_ACTOR_INVALIDO'; end if;
end
$d0_actor_guard$;

create function pg_temp.alq_d0_rpc(p_operacion text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_pre jsonb; v_aplicada jsonb; v_actor uuid;
begin
  if current_setting('alq.f1a_forward_prevalidate_only',true)='on' then
    v_actor:=alq_private.alq_actor_v1(true);
    perform alq_private.alq_f1a_prevalidar_v2(p_operacion,p_payload,v_actor);
    return jsonb_build_object('forward_prevalidated',true,'operacion',p_operacion);
  end if;
  v_pre:=public.alq_admin_preparar(p_operacion,p_payload);
  v_aplicada:=public.alq_admin_aplicar(
    (v_pre->>'request_id')::uuid,p_operacion,v_pre->>'firma',p_payload);
  return jsonb_build_object(
    'request_id',v_pre->>'request_id',
    'operacion_id',v_pre->>'operacion_id',
    'firma',v_pre->>'firma',
    'respuesta',v_aplicada);
end
$fn$;

create function pg_temp.alq_d0_fixture(p_caso text)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare
  v_actor uuid; v_op uuid:=pg_catalog.gen_random_uuid();
  v_payload jsonb:=jsonb_build_object('fixture',true,'caso',p_caso);
  v_tenant_a uuid; v_owner_a uuid; v_tenant_b uuid; v_owner_b uuid; v_outsider uuid;
  v_prop_a uuid; v_prop_b uuid; v_tit_a uuid; v_tit_b uuid;
  v_contract_a uuid; v_contract_b uuid; v_ver_a uuid; v_ver_b uuid;
  v_period_a uuid; v_period_b uuid;
  v_acc_ars uuid; v_acc_ars_2 uuid; v_acc_usd uuid; v_acc_inactive uuid;
  v_cargo_ars_a uuid; v_cargo_usd_a uuid; v_cargo_ars_b uuid;
  v_tx_credit_ars uuid; v_tx_credit_usd uuid; v_tx_out_ars uuid;
  v_credit_ars uuid; v_credit_usd uuid; v_deposit_ars uuid;
begin
  select ca.parte_usuario_id into v_actor
  from alq.alq_capacidad_admin ca join alq.alq_parte_usuario pu on pu.id=ca.parte_usuario_id
  where statement_timestamp()<@ca.vigencia and statement_timestamp()<@pu.vigencia
  order by ca.id limit 1;
  if v_actor is null then raise exception 'ALQ_D0_FIXTURE_SIN_ACTOR'; end if;

  -- Los hijos financieros F1-A sólo nacen mientras su operación padre está
  -- preparada. Esta operación técnica nunca se aplica: el subbloque de cada caso
  -- revierte íntegramente la fixture antes de liberar la transacción exterior.
  insert into alq.alq_operacion(id,request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at)
  values (v_op,pg_catalog.gen_random_uuid(),'d0_fixture',v_payload,
    alq_private.alq_firma_v1('d0_fixture',v_payload),'preparada',v_actor,
    clock_timestamp());

  insert into alq.alq_parte(tipo_persona,nombre) values ('fisica','D0 tenant A '||p_caso) returning id into v_tenant_a;
  insert into alq.alq_parte(tipo_persona,nombre) values ('fisica','D0 owner A '||p_caso) returning id into v_owner_a;
  insert into alq.alq_parte(tipo_persona,nombre) values ('fisica','D0 tenant B '||p_caso) returning id into v_tenant_b;
  insert into alq.alq_parte(tipo_persona,nombre) values ('fisica','D0 owner B '||p_caso) returning id into v_owner_b;
  insert into alq.alq_parte(tipo_persona,nombre) values ('fisica','D0 outsider '||p_caso) returning id into v_outsider;

  insert into alq.alq_propiedad(direccion,direccion_norm,ciudad,ciudad_norm,provincia)
  values ('D0 A '||p_caso,'d0 a '||lower(p_caso),'QA','qa','Chubut') returning id into v_prop_a;
  insert into alq.alq_propiedad(direccion,direccion_norm,ciudad,ciudad_norm,provincia)
  values ('D0 B '||p_caso,'d0 b '||lower(p_caso),'QA','qa','Chubut') returning id into v_prop_b;

  insert into alq.alq_titularidad(propiedad_id,parte_id,vigencia)
  values (v_prop_a,v_owner_a,tstzrange('2026-01-01 00:00:00+00',null,'[)')) returning id into v_tit_a;
  insert into alq.alq_titularidad(propiedad_id,parte_id,vigencia)
  values (v_prop_b,v_owner_b,tstzrange('2026-01-01 00:00:00+00',null,'[)')) returning id into v_tit_b;

  insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,inicio,fin_pactado,estado)
  values (v_prop_a,v_tenant_a,'2026-01-01','2026-12-31','vigente') returning id into v_contract_a;
  insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,inicio,fin_pactado,estado)
  values (v_prop_b,v_tenant_b,'2026-01-01','2026-12-31','vigente') returning id into v_contract_b;

  insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,dia_pago_desde,
    dia_pago_hasta,formula_punitorio_version,metodo_prorrateo,regla_redondeo,
    regla_pago_otra_moneda)
  values (v_contract_a,tstzrange('2026-01-01 00:00:00+00',null,'[)'),1000,'ARS',1,10,
    'd0-v1','dias_reales','centavos','prohibido') returning id into v_ver_a;
  insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,dia_pago_desde,
    dia_pago_hasta,formula_punitorio_version,metodo_prorrateo,regla_redondeo,
    regla_pago_otra_moneda)
  values (v_contract_b,tstzrange('2026-01-01 00:00:00+00',null,'[)'),1000,'ARS',1,10,
    'd0-v1','dias_reales','centavos','prohibido') returning id into v_ver_b;

  insert into alq.alq_periodo(contrato_id,contrato_version_id,secuencia,rango,vence_at,
    moneda,monto_emitido,snapshot_regla)
  values (v_contract_a,v_ver_a,1,daterange('2026-01-01','2026-02-01','[)'),
    '2026-01-10 12:00:00+00','ARS',1000,'{"d0":true}') returning id into v_period_a;
  insert into alq.alq_periodo(contrato_id,contrato_version_id,secuencia,rango,vence_at,
    moneda,monto_emitido,snapshot_regla)
  values (v_contract_b,v_ver_b,1,daterange('2026-01-01','2026-02-01','[)'),
    '2026-01-10 12:00:00+00','ARS',1000,'{"d0":true}') returning id into v_period_b;

  insert into alq.alq_cuenta_custodia(banco_billetera,identificador,moneda,activa)
  values ('D0','ARS-1-'||pg_catalog.gen_random_uuid(),'ARS',true) returning id into v_acc_ars;
  insert into alq.alq_cuenta_custodia(banco_billetera,identificador,moneda,activa)
  values ('D0','ARS-2-'||pg_catalog.gen_random_uuid(),'ARS',true) returning id into v_acc_ars_2;
  insert into alq.alq_cuenta_custodia(banco_billetera,identificador,moneda,activa)
  values ('D0','USD-'||pg_catalog.gen_random_uuid(),'USD',true) returning id into v_acc_usd;
  insert into alq.alq_cuenta_custodia(banco_billetera,identificador,moneda,activa)
  values ('D0','INACTIVE-'||pg_catalog.gen_random_uuid(),'ARS',false) returning id into v_acc_inactive;

  insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
    acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
    snapshot_regla,saldo_pendiente)
  values (v_prop_a,v_contract_a,v_period_a,v_tenant_a,v_owner_a,'custodiada',
    'alquiler_periodo','ARS',1000,'2026-01-10 12:00:00+00','admin',v_op,
    '{"d0":true}',1000) returning id into v_cargo_ars_a;
  insert into alq.alq_cargo(propiedad_id,contrato_id,deudor_parte_id,acreedor_parte_id,
    ambito,concepto,moneda,monto,vence_at,origen,operacion_id,snapshot_regla,saldo_pendiente)
  values (v_prop_a,v_contract_a,v_tenant_a,v_owner_a,'custodiada','d0_extra',
    'USD',1000,'2026-01-10 12:00:00+00','admin',v_op,'{"d0":true}',1000)
  returning id into v_cargo_usd_a;
  insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
    acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
    snapshot_regla,saldo_pendiente)
  values (v_prop_b,v_contract_b,v_period_b,v_tenant_b,v_owner_b,'custodiada',
    'alquiler_periodo','ARS',1000,'2026-01-10 12:00:00+00','admin',v_op,
    '{"d0":true}',1000) returning id into v_cargo_ars_b;

  insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,
    beneficiario_parte_id,cuenta_custodia_id,moneda,monto,fecha,medio,estado,operacion_id)
  values ('entrada','custodiada',v_tenant_a,v_owner_a,v_acc_ars,'ARS',500,
    '2026-01-05 12:00:00+00','transferencia','confirmada',v_op) returning id into v_tx_credit_ars;
  insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,
    beneficiario_parte_id,cuenta_custodia_id,moneda,monto,fecha,medio,estado,operacion_id)
  values ('entrada','custodiada',v_tenant_a,v_owner_a,v_acc_usd,'USD',500,
    '2026-01-05 12:00:00+00','transferencia','confirmada',v_op) returning id into v_tx_credit_usd;
  insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,
    beneficiario_parte_id,cuenta_custodia_id,moneda,monto,fecha,medio,estado,operacion_id)
  values ('salida','custodiada',v_owner_a,v_tenant_a,v_acc_ars,'ARS',500,
    '2026-01-06 12:00:00+00','transferencia','confirmada',v_op) returning id into v_tx_out_ars;

  insert into alq.alq_credito(parte_id,contrato_id,moneda,monto_original,saldo_pendiente,
    transaccion_origen_id,operacion_id)
  values (v_tenant_a,v_contract_a,'ARS',500,500,v_tx_credit_ars,v_op) returning id into v_credit_ars;
  insert into alq.alq_credito(parte_id,contrato_id,moneda,monto_original,saldo_pendiente,
    transaccion_origen_id,operacion_id)
  values (v_tenant_a,v_contract_a,'USD',500,500,v_tx_credit_usd,v_op) returning id into v_credit_usd;
  insert into alq.alq_deposito(contrato_id,moneda,monto_constituido,custodia_parte_id)
  values (v_contract_a,'ARS',500,v_owner_a) returning id into v_deposit_ars;

  return jsonb_build_object(
    'actor',v_actor,'op',v_op,
    'tenant_a',v_tenant_a,'owner_a',v_owner_a,'tenant_b',v_tenant_b,
    'owner_b',v_owner_b,'outsider',v_outsider,
    'prop_a',v_prop_a,'prop_b',v_prop_b,'contract_a',v_contract_a,'contract_b',v_contract_b,
    'period_a',v_period_a,'period_b',v_period_b,
    'acc_ars',v_acc_ars,'acc_ars_2',v_acc_ars_2,'acc_usd',v_acc_usd,
    'acc_inactive',v_acc_inactive,
    'cargo_ars_a',v_cargo_ars_a,'cargo_usd_a',v_cargo_usd_a,'cargo_ars_b',v_cargo_ars_b,
    'tx_credit_ars',v_tx_credit_ars,'tx_credit_usd',v_tx_credit_usd,
    'tx_out_ars',v_tx_out_ars,'credit_ars',v_credit_ars,'credit_usd',v_credit_usd,
    'deposit_ars',v_deposit_ars);
end
$fn$;

create function pg_temp.alq_d0_pago_base(p_f jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_tx uuid; v_app uuid;
begin
  insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,
    beneficiario_parte_id,cuenta_custodia_id,moneda,monto,fecha,medio,estado,operacion_id)
  values ('entrada','custodiada',(p_f->>'tenant_a')::uuid,(p_f->>'owner_a')::uuid,
    (p_f->>'acc_ars')::uuid,'ARS',100,'2026-01-07 12:00:00+00','transferencia',
    'confirmada',(p_f->>'op')::uuid) returning id into v_tx;
  insert into alq.alq_aplicacion(transaccion_id,cargo_id,importe_origen,moneda_origen,
    importe_destino,moneda_destino,operacion_id)
  values (v_tx,(p_f->>'cargo_ars_a')::uuid,100,'ARS',100,'ARS',(p_f->>'op')::uuid)
  returning id into v_app;
  perform alq_private.alq_validar_aplicacion_v1(v_app);
  return jsonb_build_object('transaccion',v_tx,'aplicacion',v_app);
end
$fn$;

create function pg_temp.alq_f1a_pago_parcial(p_f jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_tx uuid; v_app uuid;
begin
  insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,
    beneficiario_parte_id,cuenta_custodia_id,moneda,monto,fecha,medio,estado,operacion_id)
  values ('entrada','custodiada',(p_f->>'tenant_a')::uuid,(p_f->>'owner_a')::uuid,
    (p_f->>'acc_ars')::uuid,'ARS',100,'2026-01-07 12:00:00+00','transferencia',
    'confirmada',(p_f->>'op')::uuid) returning id into v_tx;
  insert into alq.alq_aplicacion(transaccion_id,cargo_id,importe_origen,moneda_origen,
    importe_destino,moneda_destino,operacion_id)
  values (v_tx,(p_f->>'cargo_ars_a')::uuid,60,'ARS',60,'ARS',(p_f->>'op')::uuid)
  returning id into v_app;
  perform alq_private.alq_validar_aplicacion_v1(v_app);
  return jsonb_build_object('transaccion',v_tx,'aplicacion',v_app);
end
$fn$;

create function pg_temp.alq_d0_registrar(
  p_ordinal integer,p_caso text,p_familia text,p_invariante text,p_vector text,p_ruta text,
  p_resultado text,p_sqlstate text,p_mensaje text,p_constraint text,p_fase text,p_evidencia jsonb,
  p_expected_state text default null,p_expected_message text default null,
  p_expected_constraint text default null)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare v_estado text;
begin
  if p_expected_state is null then
    p_expected_state:='P0001';
    p_expected_message:=case p_caso
      when 'N01' then 'ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE'
      when 'C01' then 'ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE'
      when 'C02' then 'ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE'
      when 'T01' then 'ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE'
      when 'T02' then 'ALQ_F1A_T02_CUENTA_INACTIVA'
      when 'D01' then 'ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE'
      when 'D02' then 'ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO'
      when 'R01' then 'ALQ_F1A_R_REAPERTURA_INSUFICIENTE'
      when 'R02' then 'ALQ_F1A_R_REAPERTURA_INSUFICIENTE'
      when 'J01' then 'ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE'
      when 'J02' then 'ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE'
      when 'J03' then 'ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE'
      when 'J04' then 'ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE'
      when 'J05' then 'ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE'
      else null
    end;
  end if;
  v_estado:=case
    when p_resultado='REPRODUCIDO' then 'ROJO_F1A'
    when p_resultado='RECHAZADO' and p_sqlstate=p_expected_state
      and (p_expected_message is null or p_mensaje=p_expected_message)
      and (p_expected_constraint is null or p_constraint=p_expected_constraint)
      then 'VERDE_F1A'
    when p_resultado='RECHAZADO' then 'SONDA_INVALIDA'
    else 'SONDA_INVALIDA'
  end;
  insert into pg_temp.alq_d0_resultado(
    ordinal,caso,familia,invariante,vector_unico,ruta,resultado,estado_test,sqlstate,
    mensaje,constraint_name,fase_fallo,evidencia,evidencia_sha256,regression_test_id,
    esperado_sqlstate,esperado_mensaje,esperado_constraint)
  values (p_ordinal,p_caso,p_familia,p_invariante,p_vector,p_ruta,p_resultado,v_estado,
    p_sqlstate,p_mensaje,nullif(p_constraint,''),p_fase,coalesce(p_evidencia,'{}'::jsonb),
    encode(extensions.digest(convert_to(coalesce(p_evidencia,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex'),
    'ALQ-F1A-'||p_caso,p_expected_state,p_expected_message,p_expected_constraint);
end
$fn$;
create temporary table alq_d0_case_ctx (
  caso text primary key,
  fixture jsonb not null,
  aux jsonb,
  run1 jsonb,
  run2 jsonb
) on commit drop;

create function pg_temp.alq_d0_ejecutar_caso(
  p_ordinal integer,p_caso text,p_familia text,p_invariante text,p_vector text,p_ruta text,
  p_action_sql text,p_oracle_sql text,p_expected_state text default null,
  p_expected_message text default null,p_expected_constraint text default null)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_fixture jsonb; v_ok boolean; v_evidence jsonb:='{}'::jsonb;
  v_phase text:='FIXTURE'; v_state text; v_message text; v_constraint text;
  v_result text;
begin
  begin
    v_fixture:=pg_temp.alq_d0_fixture(p_caso);
    insert into pg_temp.alq_d0_case_ctx(caso,fixture) values (p_caso,v_fixture);
    v_phase:='MUTACION';
    execute p_action_sql;
    set constraints all immediate;
    v_phase:='ORACULO';
    execute p_oracle_sql into v_ok,v_evidence;
    if not coalesce(v_ok,false) then
      raise exception using errcode='ZX002',message='ALQ_D0_ORACULO_NO_CONFIRMADO';
    end if;
    raise exception using errcode='ZX001',message='ALQ_D0_INVALIDO_ACEPTADO';
  exception when others then
    get stacked diagnostics
      v_state=returned_sqlstate,
      v_message=message_text,
      v_constraint=constraint_name;
    if v_state='ZX001' and v_message='ALQ_D0_INVALIDO_ACEPTADO' then
      v_result:='REPRODUCIDO'; v_state:='00000';
    elsif v_state='ZX002' or v_phase<>'MUTACION' then
      v_result:='SONDA_INVALIDA';
    else
      v_result:='RECHAZADO';
    end if;
  end;
  perform pg_temp.alq_d0_registrar(
    p_ordinal,p_caso,p_familia,p_invariante,p_vector,p_ruta,
    v_result,v_state,v_message,v_constraint,v_phase,v_evidence,
    p_expected_state,p_expected_message,p_expected_constraint);
end
$fn$;

create temporary table alq_f1a_valid_result (
  ordinal integer primary key,
  caso text not null unique,
  estado_test text not null check (estado_test in ('PASS','FAIL')),
  sqlstate text not null,
  mensaje text not null,
  evidencia jsonb not null
) on commit drop;

create temporary table alq_f1a_valid_spec (
  ordinal integer primary key,
  caso text not null unique,
  action_sql text not null,
  oracle_sql text not null,
  expected_gate text
) on commit drop;

create function pg_temp.alq_f1a_ejecutar_valido(
  p_ordinal integer,p_caso text,p_action_sql text,p_oracle_sql text,
  p_expected_gate text default null)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_fixture jsonb; v_ok boolean:=false; v_evidence jsonb:='{}'::jsonb;
  v_state text:='00000'; v_message text:='ALQ_F1A_VALIDO_PASS';
  v_phase text:='FIXTURE'; v_pass boolean:=false;
begin
  insert into pg_temp.alq_f1a_valid_spec(
    ordinal,caso,action_sql,oracle_sql,expected_gate)
  values (p_ordinal,p_caso,p_action_sql,p_oracle_sql,p_expected_gate);
  begin
    v_fixture:=pg_temp.alq_d0_fixture(p_caso);
    insert into pg_temp.alq_d0_case_ctx(caso,fixture) values (p_caso,v_fixture);
    set constraints all immediate;
    set constraints all deferred;
    perform set_config('alq.f1a_forward_prevalidate_only','on',true);
    v_phase:='MUTACION';
    execute p_action_sql;
    set constraints all immediate;
    if p_expected_gate is not null then
      raise exception using errcode='ZX012',message='ALQ_F1A_GATE_ESPERADO_NO_OCURRIO';
    end if;
    v_ok:=true;
    v_evidence:=jsonb_build_object(
      'prevalidacion_directa',true,'dml_fixture_constraints_immediate',true,
      'journal_apply_ejecutado',false);
    raise exception using errcode='ZX011',message='ALQ_F1A_VALIDO_PASS_ROLLBACK';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    if v_state='ZX011' and v_message='ALQ_F1A_VALIDO_PASS_ROLLBACK' then
      v_pass:=true; v_state:='00000'; v_message:='ALQ_F1A_VALIDO_PASS';
    elsif p_expected_gate is not null and v_state='P0001'
       and v_message=p_expected_gate and v_phase='MUTACION' then
      v_pass:=true;
      v_evidence:=jsonb_build_object('gate_terminal',v_message,'guardas_nominales_pasaron',true);
    end if;
  end;
  insert into pg_temp.alq_f1a_valid_result(
    ordinal,caso,estado_test,sqlstate,mensaje,evidencia)
  values (p_ordinal,p_caso,case when v_pass then 'PASS' else 'FAIL' end,
    v_state,v_message,coalesce(v_evidence,'{}'::jsonb));
end
$fn$;

-- La suite forward valida sin invocar el executor: las constraint triggers
-- diferidas se fuerzan sobre la fixture y no se consume la identity de journal.
-- ACTRL queda exceptuado abajo y alcanza el CHECK físico mediante DML directo.
select set_config('alq.f1a_forward_prevalidate_only','on',true);

-- N01 · la moneda de una nota debe ser la del cargo.
select pg_temp.alq_d0_ejecutar_caso(
  1,'N01','NOTA_MONEDA','nota.moneda = cargo.moneda',
  'nota de credito USD por 10 sobre cargo ARS por 1000','nota_emitir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('nota_emitir',
      jsonb_build_object('tipo','credito','cargo_id',x.fixture->>'cargo_ars_a',
        'monto',10,'moneda','USD','motivo','D0 moneda incompatible',
        'fecha','2026-01-08T12:00:00Z'))
  $action$,
  $oracle$
    select n.moneda='USD' and c.moneda='ARS' and c.saldo_pendiente=990,
      jsonb_build_object('nota_moneda',n.moneda,'cargo_moneda',c.moneda,
        'cargo_monto',c.monto,'cargo_saldo_resultante',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_nota n on n.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_cargo c on c.id=n.cargo_id
  $oracle$);

-- C01 · moneda de crédito/consumo incompatible con la del cargo.
select pg_temp.alq_d0_ejecutar_caso(
  2,'C01','CREDITO_MONEDA','credito.moneda = consumo.moneda = cargo.moneda',
  'credito USD de contrato A consumido por 10 USD contra cargo ARS del mismo contrato',
  'credito_consumir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('credito_consumir',
      jsonb_build_object('credito_id',x.fixture->>'credit_usd','cargo_id',x.fixture->>'cargo_ars_a',
        'monto',10,'moneda','USD'))
  $action$,
  $oracle$
    select cr.moneda='USD' and cc.moneda='USD' and c.moneda='ARS'
       and cr.saldo_pendiente=490 and c.saldo_pendiente=990,
      jsonb_build_object('credito_moneda',cr.moneda,'consumo_moneda',cc.moneda,
        'cargo_moneda',c.moneda,'credito_saldo',cr.saldo_pendiente,
        'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_credito_consumo cc on cc.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_credito cr on cr.id=cc.credito_id
    join alq.alq_cargo c on c.id=cc.cargo_id
  $oracle$);

-- C02 · un crédito no puede cruzar contrato/propiedad.
select pg_temp.alq_d0_ejecutar_caso(
  3,'C02','CREDITO_PROPIEDAD','credito.contrato/parte corresponden al cargo',
  'credito ARS del contrato/propiedad A consumido contra cargo ARS del contrato/propiedad B',
  'credito_consumir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('credito_consumir',
      jsonb_build_object('credito_id',x.fixture->>'credit_ars','cargo_id',x.fixture->>'cargo_ars_b',
        'monto',10,'moneda','ARS'))
  $action$,
  $oracle$
    select cr.contrato_id<>c.contrato_id and ct.propiedad_id<>c.propiedad_id
       and cr.saldo_pendiente=490 and c.saldo_pendiente=990,
      jsonb_build_object('mismo_contrato',cr.contrato_id=c.contrato_id,
        'misma_propiedad',ct.propiedad_id=c.propiedad_id,
        'credito_saldo',cr.saldo_pendiente,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_credito_consumo cc on cc.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_credito cr on cr.id=cc.credito_id
    join alq.alq_contrato ct on ct.id=cr.contrato_id
    join alq.alq_cargo c on c.id=cc.cargo_id
  $oracle$);

-- T01 · las dos cuentas y las dos piernas deben usar la misma moneda.
select pg_temp.alq_d0_ejecutar_caso(
  4,'T01','TRANSFERENCIA_MONEDA_CUENTA','transaccion.moneda = cuenta_origen.moneda = cuenta_destino.moneda',
  'transferencia ARS desde cuenta ARS hacia cuenta USD','transferencia_interna',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('transferencia_interna',
      jsonb_build_object('cuenta_origen_id',x.fixture->>'acc_ars','cuenta_destino_id',x.fixture->>'acc_usd',
        'contraparte_parte_id',x.fixture->>'owner_a','beneficiario_parte_id',x.fixture->>'owner_a',
        'moneda','ARS','monto',10,'fecha','2026-01-08T12:00:00Z','medio','transferencia'))
  $action$,
  $oracle$
    select count(*)=2 and bool_or(t.moneda<>c.moneda),
      jsonb_build_object('piernas',count(*),'monedas_pierna',jsonb_agg(t.moneda order by t.direccion),
        'monedas_cuenta',jsonb_agg(c.moneda order by t.direccion))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_cuenta_custodia c on c.id=t.cuenta_custodia_id
  $oracle$);

-- T02 · una cuenta inactiva no puede integrar una transferencia.
select pg_temp.alq_d0_ejecutar_caso(
  5,'T02','TRANSFERENCIA_CUENTA_ACTIVA','ambas cuentas de transferencia estan activas',
  'transferencia ARS desde cuenta inactiva hacia cuenta activa','transferencia_interna',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('transferencia_interna',
      jsonb_build_object('cuenta_origen_id',x.fixture->>'acc_inactive',
        'cuenta_destino_id',x.fixture->>'acc_ars_2','contraparte_parte_id',x.fixture->>'owner_a',
        'beneficiario_parte_id',x.fixture->>'owner_a','moneda','ARS','monto',10,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia'))
  $action$,
  $oracle$
    select count(*)=2 and bool_or(not c.activa),
      jsonb_build_object('piernas',count(*),'cuentas_activas',jsonb_agg(c.activa order by t.direccion))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_cuenta_custodia c on c.id=t.cuenta_custodia_id
  $oracle$);

-- TCTRL · control positivo del validador I9: misma cuenta en ambas piernas.
select pg_temp.alq_d0_ejecutar_caso(
  6,'TCTRL','CONTROL_TRANSFERENCIA','transferencia exige dos cuentas distintas',
  'misma cuenta como origen y destino','transferencia_interna',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('transferencia_interna',
      jsonb_build_object('cuenta_origen_id',x.fixture->>'acc_ars','cuenta_destino_id',x.fixture->>'acc_ars',
        'contraparte_parte_id',x.fixture->>'owner_a','beneficiario_parte_id',x.fixture->>'owner_a',
        'moneda','ARS','monto',10,'fecha','2026-01-08T12:00:00Z','medio','transferencia'))
  $action$,
  $oracle$
    select count(*)=2 and count(distinct t.cuenta_custodia_id)=1,
      jsonb_build_object('piernas',count(*),'cuentas_distintas',count(distinct t.cuenta_custodia_id))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
  $oracle$,
  'P0001','ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO');

-- D01 · el saldo global del depósito no puede quedar negativo.
select pg_temp.alq_d0_ejecutar_caso(
  7,'D01','DEPOSITO_SALDO','aplicaciones acumuladas <= saldo global del deposito',
  'deposito ARS 500; un evento aplicacion ARS 501','deposito_evento_registrar',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('deposito_evento_registrar',
      jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','tipo','aplicacion',
        'monto',501,'moneda','ARS'))
  $action$,
  $oracle$
    select d.moneda='ARS' and e.moneda='ARS' and e.monto>d.monto_constituido,
      jsonb_build_object('deposito_constituido',d.monto_constituido,'evento_tipo',e.tipo,
        'evento_monto',e.monto,'saldo_resultante',d.monto_constituido-e.monto)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_deposito d on d.id=e.deposito_id
  $oracle$);

-- D02 · liquidación + devolución deben compartir el mismo saldo disponible.
select pg_temp.alq_d0_ejecutar_caso(
  8,'D02','DEPOSITO_LIQUIDACION','sum(lineas cubiertas)+devolucion <= saldo deposito',
  'deposito 500; linea deuda 300 y devolucion 300 sin cargo residual',
  'deposito_liquidar_y_devolver',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('deposito_liquidar_y_devolver',
      jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','fecha','2026-01-08T12:00:00Z',
        'lineas',jsonb_build_array(jsonb_build_object('concepto','deuda','monto',300,'moneda','ARS')),
        'contraparte_parte_id',x.fixture->>'owner_a','beneficiario_parte_id',x.fixture->>'tenant_a',
        'cuenta_custodia_id',x.fixture->>'acc_ars','moneda','ARS','monto_devolver',300,
        'medio','transferencia'))
  $action$,
  $oracle$
    select l.estado='pagada' and d.monto_constituido <
        (select coalesce(sum(ll.monto),0) from alq.alq_deposito_liquidacion_linea ll where ll.liquidacion_id=l.id)
        +(select coalesce(sum(e.monto),0) from alq.alq_deposito_evento e
          where e.deposito_id=d.id and e.tipo='devolucion' and e.operacion_id=l.operacion_id),
      jsonb_build_object('deposito_constituido',d.monto_constituido,'liquidacion_estado',l.estado,
        'lineas',(select coalesce(sum(ll.monto),0) from alq.alq_deposito_liquidacion_linea ll where ll.liquidacion_id=l.id),
        'devuelto',(select coalesce(sum(e.monto),0) from alq.alq_deposito_evento e
          where e.deposito_id=d.id and e.tipo='devolucion' and e.operacion_id=l.operacion_id))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_liquidacion l on l.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_deposito d on d.id=l.deposito_id
  $oracle$);

-- R01 · una reversa de dinero aplicado no puede omitir toda reapertura.
select pg_temp.alq_d0_ejecutar_caso(
  9,'R01','REVERSA_SUFICIENCIA','reapertura = porcion aplicada que se revierte',
  'pago 100 aplicado; reversa 40; reaperturas vacias','reversa_con_reapertura',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_d0_pago_base(x.fixture) aux
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set aux=p.aux,
      run1=pg_temp.alq_d0_rpc('reversa_con_reapertura',jsonb_build_object(
        'original_id',p.aux->>'transaccion','contraparte_parte_id',p.fixture->>'owner_a',
        'beneficiario_parte_id',p.fixture->>'tenant_a','monto',40,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia','reaperturas','[]'::jsonb))
    from p where x.caso=p.caso
  $action$,
  $oracle$
    select r.monto=40
       and (select count(*) from alq.alq_aplicacion_reversa ar where ar.reversa_transaccion_id=r.id)=0
       and c.saldo_pendiente=900,
      jsonb_build_object('reversa_monto',r.monto,'reapertura_total',
        (select coalesce(sum(ar.importe_destino_reabierto),0) from alq.alq_aplicacion_reversa ar
          where ar.reversa_transaccion_id=r.id),'cargo_saldo_tras_reversa',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja r on r.operacion_id=(x.run1->>'operacion_id')::uuid and r.reversa_de is not null
    join alq.alq_cargo c on c.id=(x.fixture->>'cargo_ars_a')::uuid
  $oracle$);

-- R02 · una reapertura parcial tampoco alcanza.
select pg_temp.alq_d0_ejecutar_caso(
  10,'R02','REVERSA_SUFICIENCIA','reapertura = porcion aplicada que se revierte',
  'pago 100 aplicado; reversa 40; reapertura solamente 10','reversa_con_reapertura',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_d0_pago_base(x.fixture) aux
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set aux=p.aux,
      run1=pg_temp.alq_d0_rpc('reversa_con_reapertura',jsonb_build_object(
        'original_id',p.aux->>'transaccion','contraparte_parte_id',p.fixture->>'owner_a',
        'beneficiario_parte_id',p.fixture->>'tenant_a','monto',40,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'reaperturas',jsonb_build_array(jsonb_build_object(
          'aplicacion_original_id',p.aux->>'aplicacion','importe_origen_revertido',10,
          'moneda_origen','ARS','importe_destino_reabierto',10,'moneda_destino','ARS'))))
    from p where x.caso=p.caso
  $action$,
  $oracle$
    select r.monto=40
       and (select coalesce(sum(ar.importe_destino_reabierto),0)
            from alq.alq_aplicacion_reversa ar where ar.reversa_transaccion_id=r.id)=10
       and c.saldo_pendiente=910,
      jsonb_build_object('reversa_monto',r.monto,'reapertura_total',
        (select coalesce(sum(ar.importe_destino_reabierto),0) from alq.alq_aplicacion_reversa ar
          where ar.reversa_transaccion_id=r.id),'cargo_saldo_tras_reversa',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja r on r.operacion_id=(x.run1->>'operacion_id')::uuid and r.reversa_de is not null
    join alq.alq_cargo c on c.id=(x.fixture->>'cargo_ars_a')::uuid
  $oracle$);

-- RCTRL · el tope superior T1 sí debe rechazar 41 sobre reversa 40.
select pg_temp.alq_d0_ejecutar_caso(
  11,'RCTRL','CONTROL_REVERSA','sum(reapertura_origen) <= monto reversa',
  'reversa 40 con reapertura 41','reversa_con_reapertura',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_d0_pago_base(x.fixture) aux
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set aux=p.aux,
      run1=pg_temp.alq_d0_rpc('reversa_con_reapertura',jsonb_build_object(
        'original_id',p.aux->>'transaccion','contraparte_parte_id',p.fixture->>'owner_a',
        'beneficiario_parte_id',p.fixture->>'tenant_a','monto',40,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'reaperturas',jsonb_build_array(jsonb_build_object(
          'aplicacion_original_id',p.aux->>'aplicacion','importe_origen_revertido',41,
          'moneda_origen','ARS','importe_destino_reabierto',41,'moneda_destino','ARS'))))
    from p where x.caso=p.caso
  $action$,
  $oracle$
    select r.monto=40 and coalesce(sum(ar.importe_origen_revertido),0)=41,
      jsonb_build_object('reversa_monto',r.monto,'reapertura_origen',
        coalesce(sum(ar.importe_origen_revertido),0))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja r on r.operacion_id=(x.run1->>'operacion_id')::uuid and r.reversa_de is not null
    left join alq.alq_aplicacion_reversa ar on ar.reversa_transaccion_id=r.id
    group by r.id,r.monto
  $oracle$,
  'P0001','ALQ_T1_REAPERTURAS_SUPERAN_REVERSA');

-- J01 · propiedad del cargo debe coincidir con contrato/período.
select pg_temp.alq_d0_ejecutar_caso(
  12,'J01','GRAFO_PROPIEDAD_CONTRATO','cargo.propiedad = contrato.propiedad; periodo pertenece al contrato',
  'cargo en propiedad A ligado a contrato y periodo coherentes entre si pero de propiedad B',
  'cargo_manual_emitir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('cargo_manual_emitir',
      jsonb_build_object('propiedad_id',x.fixture->>'prop_a','contrato_id',x.fixture->>'contract_b',
        'periodo_id',x.fixture->>'period_b','deudor_parte_id',x.fixture->>'tenant_b',
        'acreedor_parte_id',x.fixture->>'owner_b','ambito','custodiada',
        'concepto','alquiler_periodo','moneda','ARS','monto',100,
        'vence_at','2026-01-10T12:00:00Z','snapshot_regla',jsonb_build_object('d0',true)))
  $action$,
  $oracle$
    select c.propiedad_id<>ct.propiedad_id and p.contrato_id=ct.id,
      jsonb_build_object('cargo_propiedad_coincide_contrato',c.propiedad_id=ct.propiedad_id,
        'periodo_coincide_contrato',p.contrato_id=ct.id,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_cargo c on c.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_contrato ct on ct.id=c.contrato_id
    join alq.alq_periodo p on p.id=c.periodo_id
  $oracle$);

-- J02 · período debe pertenecer al contrato del cargo.
select pg_temp.alq_d0_ejecutar_caso(
  13,'J02','GRAFO_CONTRATO_PERIODO','cargo.periodo.contrato = cargo.contrato',
  'cargo propiedad/contrato A ligado a periodo de contrato B','cargo_manual_emitir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('cargo_manual_emitir',
      jsonb_build_object('propiedad_id',x.fixture->>'prop_a','contrato_id',x.fixture->>'contract_a',
        'periodo_id',x.fixture->>'period_b','deudor_parte_id',x.fixture->>'tenant_a',
        'acreedor_parte_id',x.fixture->>'owner_a','ambito','custodiada',
        'concepto','alquiler_periodo','moneda','ARS','monto',100,
        'vence_at','2026-01-10T12:00:00Z','snapshot_regla',jsonb_build_object('d0',true)))
  $action$,
  $oracle$
    select c.propiedad_id=ct.propiedad_id and p.contrato_id<>ct.id,
      jsonb_build_object('cargo_propiedad_coincide_contrato',c.propiedad_id=ct.propiedad_id,
        'periodo_coincide_contrato',p.contrato_id=ct.id,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_cargo c on c.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_contrato ct on ct.id=c.contrato_id
    join alq.alq_periodo p on p.id=c.periodo_id
  $oracle$);

-- J03 · deudor del alquiler debe ser inquilino/obligado del contrato.
select pg_temp.alq_d0_ejecutar_caso(
  14,'J03','GRAFO_DEUDOR','cargo.deudor pertenece a la obligacion contractual',
  'cargo alquiler A con deudor outsider sin relacion','cargo_manual_emitir',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('cargo_manual_emitir',
      jsonb_build_object('propiedad_id',x.fixture->>'prop_a','contrato_id',x.fixture->>'contract_a',
        'periodo_id',x.fixture->>'period_a','deudor_parte_id',x.fixture->>'outsider',
        'acreedor_parte_id',x.fixture->>'owner_a','ambito','custodiada',
        'concepto','alquiler_periodo','moneda','ARS','monto',100,
        'vence_at','2026-01-10T12:00:00Z','snapshot_regla',jsonb_build_object('d0',true)))
  $action$,
  $oracle$
    select c.deudor_parte_id<>ct.inquilino_parte_id,
      jsonb_build_object('deudor_es_inquilino',c.deudor_parte_id=ct.inquilino_parte_id,
        'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_cargo c on c.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_contrato ct on ct.id=c.contrato_id
  $oracle$);

-- J04 · un tercero totalmente ajeno no debe poder pagar un cargo contractual.
select pg_temp.alq_d0_ejecutar_caso(
  15,'J04','GRAFO_PAGADOR','pagador es deudor o garante vigente del contrato',
  'outsider sin garantia paga cargo del inquilino A','pago_multimoneda',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('pago_multimoneda',
      jsonb_build_object('ambito','custodiada','contraparte_parte_id',x.fixture->>'outsider',
        'beneficiario_parte_id',x.fixture->>'owner_a','cuenta_custodia_id',x.fixture->>'acc_ars',
        'moneda','ARS','monto',100,'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'aplicaciones',jsonb_build_array(jsonb_build_object('cargo_id',x.fixture->>'cargo_ars_a',
          'importe_origen',100,'moneda_origen','ARS','importe_destino',100,'moneda_destino','ARS'))))
  $action$,
  $oracle$
    select t.contraparte_parte_id<>c.deudor_parte_id
       and not exists (select 1 from alq.alq_garantia g
         where g.contrato_id=c.contrato_id and g.garante_parte_id=t.contraparte_parte_id
           and t.fecha<@g.vigencia)
       and c.saldo_pendiente=900,
      jsonb_build_object('pagador_es_deudor',t.contraparte_parte_id=c.deudor_parte_id,
        'pagador_es_garante',exists(select 1 from alq.alq_garantia g
          where g.contrato_id=c.contrato_id and g.garante_parte_id=t.contraparte_parte_id
            and t.fecha<@g.vigencia),'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    join alq.alq_cargo c on c.id=a.cargo_id
  $oracle$);

-- J05 · el beneficiario económico debe ser el acreedor del cargo.
select pg_temp.alq_d0_ejecutar_caso(
  16,'J05','GRAFO_BENEFICIARIO','beneficiario de pago = acreedor del cargo',
  'inquilino A paga cargo A pero beneficiario es outsider','pago_multimoneda',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('pago_multimoneda',
      jsonb_build_object('ambito','custodiada','contraparte_parte_id',x.fixture->>'tenant_a',
        'beneficiario_parte_id',x.fixture->>'outsider','cuenta_custodia_id',x.fixture->>'acc_ars',
        'moneda','ARS','monto',100,'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'aplicaciones',jsonb_build_array(jsonb_build_object('cargo_id',x.fixture->>'cargo_ars_a',
          'importe_origen',100,'moneda_origen','ARS','importe_destino',100,'moneda_destino','ARS'))))
  $action$,
  $oracle$
    select t.beneficiario_parte_id<>c.acreedor_parte_id and c.saldo_pendiente=900,
      jsonb_build_object('beneficiario_es_acreedor',t.beneficiario_parte_id=c.acreedor_parte_id,
        'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    join alq.alq_cargo c on c.id=a.cargo_id
  $oracle$);

-- ACTRL · evidencia de la parte de moneda que sí cubre el CHECK señalado por Cloud.
select pg_temp.alq_d0_ejecutar_caso(
  17,'ACTRL','CONTROL_APLICACION_MONEDA','monedas distintas exigen conversion_id',
  'aplicacion ARS a cargo USD sin conversion','aplicacion_asignar',
  $action$
    insert into alq.alq_aplicacion(transaccion_id,cargo_id,importe_origen,
      moneda_origen,importe_destino,moneda_destino,operacion_id)
    select (x.fixture->>'tx_credit_ars')::uuid,(x.fixture->>'cargo_usd_a')::uuid,
      10,'ARS',10,'USD',(x.fixture->>'op')::uuid
    from pg_temp.alq_d0_case_ctx x
  $action$,
  $oracle$
    select a.moneda_origen<>a.moneda_destino and a.conversion_id is null,
      jsonb_build_object('moneda_origen',a.moneda_origen,'moneda_destino',a.moneda_destino,
        'conversion_id',a.conversion_id)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_aplicacion a on a.operacion_id=(x.run1->>'operacion_id')::uuid
  $oracle$,
  '23514','new row for relation "alq_aplicacion" violates check constraint "alq_aplicacion_moneda_ck"',
  'alq_aplicacion_moneda_ck');

-- Casos válidos adyacentes. Cada uno confirma efecto exacto o, para rutas
-- custodiadas, que las guardas nominales pasaron antes del gate terminal F0.
select pg_temp.alq_f1a_ejecutar_valido(1,'V01_NOTA_MONEDA',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('nota_emitir',
      jsonb_build_object('tipo','credito','cargo_id',x.fixture->>'cargo_ars_a',
        'monto',10,'moneda','ARS','motivo','F1A valido','fecha','2026-01-08T12:00:00Z'))
  $action$,
  $oracle$
    select n.moneda=c.moneda and c.saldo_pendiente=990,
      jsonb_build_object('nota',n.id,'saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_nota n on n.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_cargo c on c.id=n.cargo_id
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(2,'V02_CREDITO_COHERENTE',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('credito_consumir',
      jsonb_build_object('credito_id',x.fixture->>'credit_ars',
        'cargo_id',x.fixture->>'cargo_ars_a','monto',10,'moneda','ARS'))
  $action$,
  $oracle$
    select cr.saldo_pendiente=490 and c.saldo_pendiente=990,
      jsonb_build_object('credito_saldo',cr.saldo_pendiente,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_credito_consumo cc on cc.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_credito cr on cr.id=cc.credito_id
    join alq.alq_cargo c on c.id=cc.cargo_id
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(3,'V03_TRANSFERENCIA_ACTIVA',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('transferencia_interna',
      jsonb_build_object('cuenta_origen_id',x.fixture->>'acc_ars',
        'cuenta_destino_id',x.fixture->>'acc_ars_2',
        'contraparte_parte_id',x.fixture->>'owner_a',
        'beneficiario_parte_id',x.fixture->>'owner_a','moneda','ARS','monto',10,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia'))
  $action$,
  $oracle$select false,'{}'::jsonb$oracle$,
  'ALQ_CUSTODIADA_DESHABILITADA');

select pg_temp.alq_f1a_ejecutar_valido(4,'V04_DEPOSITO_TOPE_EXACTO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('deposito_evento_registrar',
      jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','tipo','aplicacion',
        'monto',500,'moneda','ARS'))
  $action$,
  $oracle$
    select sum(e.monto)=500 and count(*)=1,
      jsonb_build_object('eventos',count(*),'consumido',sum(e.monto))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.deposito_id=(x.fixture->>'deposit_ars')::uuid
      and e.tipo='aplicacion'
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(5,'V05_DEPOSITO_ACUMULADO_EXACTO',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_d0_rpc('deposito_evento_registrar',
        jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','tipo','aplicacion',
          'monto',200,'moneda','ARS')) as r1
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set run1=p.r1,
      run2=pg_temp.alq_d0_rpc('deposito_evento_registrar',
        jsonb_build_object('deposito_id',p.fixture->>'deposit_ars','tipo','aplicacion',
          'monto',300,'moneda','ARS'))
    from p where x.caso=p.caso
  $action$,
  $oracle$
    select sum(e.monto)=500 and count(*)=2,
      jsonb_build_object('eventos',count(*),'consumido',sum(e.monto))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.deposito_id=(x.fixture->>'deposit_ars')::uuid
      and e.tipo='aplicacion'
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(6,'V06_DEPOSITO_CONSTITUCION_CERO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('deposito_evento_registrar',
      jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','tipo','constitucion',
        'monto',700,'moneda','ARS'))
  $action$,
  $oracle$
    select count(*)=1 and coalesce(sum(e.monto) filter(where e.tipo in
      ('aplicacion','devolucion','transferencia_a_sucesor')),0)=0,
      jsonb_build_object('eventos',count(*),'consumo',coalesce(sum(e.monto) filter(where e.tipo in
        ('aplicacion','devolucion','transferencia_a_sucesor')),0))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.deposito_id=(x.fixture->>'deposit_ars')::uuid
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(7,'V07_DEPOSITO_ACTUALIZACION_CERO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('deposito_evento_registrar',
      jsonb_build_object('deposito_id',x.fixture->>'deposit_ars','tipo','actualizacion',
        'monto',900,'moneda','ARS'))
  $action$,
  $oracle$
    select count(*)=1 and coalesce(sum(e.monto) filter(where e.tipo in
      ('aplicacion','devolucion','transferencia_a_sucesor')),0)=0,
      jsonb_build_object('eventos',count(*),'consumo',coalesce(sum(e.monto) filter(where e.tipo in
        ('aplicacion','devolucion','transferencia_a_sucesor')),0))
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.deposito_id=(x.fixture->>'deposit_ars')::uuid
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(8,'V08_DEPOSITO_SUCESOR_VALIDO',
  $action$
    with cerrado as materialized (
      update alq.alq_contrato c set estado='cerrado',fin_efectivo='2026-12-31'
      from pg_temp.alq_d0_case_ctx x
      where c.id=(x.fixture->>'contract_a')::uuid returning c.id),
    s as materialized (
      insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,predecesor_id,
        inicio,fin_pactado,estado)
      select (x.fixture->>'prop_a')::uuid,(x.fixture->>'tenant_a')::uuid,
        (x.fixture->>'contract_a')::uuid,'2027-01-01','2027-12-31','vigente'
      from pg_temp.alq_d0_case_ctx x cross join cerrado returning id)
    update pg_temp.alq_d0_case_ctx x set aux=jsonb_build_object('sucesor',s.id),
      run1=pg_temp.alq_d0_rpc('deposito_evento_registrar',jsonb_build_object(
        'deposito_id',x.fixture->>'deposit_ars','tipo','transferencia_a_sucesor',
        'monto',500,'moneda','ARS','contrato_sucesor_id',s.id))
    from s
  $action$,
  $oracle$
    select e.monto=500 and s.predecesor_id=(x.fixture->>'contract_a')::uuid
       and s.propiedad_id=(x.fixture->>'prop_a')::uuid,
      jsonb_build_object('evento',e.id,'sucesor',s.id)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_deposito_evento e on e.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_contrato s on s.id=e.contrato_sucesor_id
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(9,'V09_LIQUIDACION_TOPE_EXACTO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc(
      'deposito_liquidar_y_devolver',jsonb_build_object(
        'deposito_id',x.fixture->>'deposit_ars','fecha','2026-01-08T12:00:00Z',
        'lineas',jsonb_build_array(jsonb_build_object(
          'concepto','deuda','monto',300,'moneda','ARS')),
        'contraparte_parte_id',x.fixture->>'owner_a',
        'beneficiario_parte_id',x.fixture->>'tenant_a',
        'cuenta_custodia_id',x.fixture->>'acc_ars','moneda','ARS',
        'monto_devolver',200,'medio','transferencia'))
  $action$,
  $oracle$select false,'{}'::jsonb$oracle$,
  'ALQ_CUSTODIADA_DESHABILITADA');

select pg_temp.alq_f1a_ejecutar_valido(10,'V10_REVERSA_REAPERTURA_EXACTA',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_d0_pago_base(x.fixture) aux
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set aux=p.aux,
      run1=pg_temp.alq_d0_rpc('reversa_con_reapertura',jsonb_build_object(
        'original_id',p.aux->>'transaccion','contraparte_parte_id',p.fixture->>'owner_a',
        'beneficiario_parte_id',p.fixture->>'tenant_a','monto',40,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'reaperturas',jsonb_build_array(jsonb_build_object(
          'aplicacion_original_id',p.aux->>'aplicacion','importe_origen_revertido',40,
          'moneda_origen','ARS','importe_destino_reabierto',40,'moneda_destino','ARS'))))
    from p where x.caso=p.caso
  $action$,
  $oracle$select false,'{}'::jsonb$oracle$,
  'ALQ_CUSTODIADA_DESHABILITADA');

select pg_temp.alq_f1a_ejecutar_valido(11,'V11_REVERSA_NO_IMPUTADO',
  $action$
    with p as materialized (
      select x.caso,x.fixture,pg_temp.alq_f1a_pago_parcial(x.fixture) aux
      from pg_temp.alq_d0_case_ctx x)
    update pg_temp.alq_d0_case_ctx x set aux=p.aux,
      run1=pg_temp.alq_d0_rpc('reversa_con_reapertura',jsonb_build_object(
        'original_id',p.aux->>'transaccion','contraparte_parte_id',p.fixture->>'owner_a',
        'beneficiario_parte_id',p.fixture->>'tenant_a','monto',50,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'reaperturas',jsonb_build_array(jsonb_build_object(
          'aplicacion_original_id',p.aux->>'aplicacion','importe_origen_revertido',10,
          'moneda_origen','ARS','importe_destino_reabierto',10,'moneda_destino','ARS'))))
    from p where x.caso=p.caso
  $action$,
  $oracle$select false,'{}'::jsonb$oracle$,
  'ALQ_CUSTODIADA_DESHABILITADA');

select pg_temp.alq_f1a_ejecutar_valido(12,'V12_GRAFO_CARGO_VALIDO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('cargo_manual_emitir',
      jsonb_build_object('propiedad_id',x.fixture->>'prop_a',
        'contrato_id',x.fixture->>'contract_a','periodo_id',x.fixture->>'period_a',
        'deudor_parte_id',x.fixture->>'tenant_a','acreedor_parte_id',x.fixture->>'owner_a',
        'ambito','externa','concepto','alquiler_periodo','moneda','ARS',
        'monto',100,'vence_at','2026-01-10T12:00:00Z',
        'snapshot_regla',jsonb_build_object('f1a',true)))
  $action$,
  $oracle$
    select c.propiedad_id=ct.propiedad_id and c.periodo_id=p.id
       and p.contrato_id=ct.id and c.deudor_parte_id=ct.inquilino_parte_id,
      jsonb_build_object('cargo',c.id,'saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_cargo c on c.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_contrato ct on ct.id=c.contrato_id
    join alq.alq_periodo p on p.id=c.periodo_id
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(13,'V13_PAGO_DEUDOR_VALIDO',
  $action$
    update pg_temp.alq_d0_case_ctx x set run1=pg_temp.alq_d0_rpc('pago_multimoneda',
      jsonb_build_object('ambito','externa_informativa',
        'contraparte_parte_id',x.fixture->>'tenant_a',
        'beneficiario_parte_id',x.fixture->>'owner_a','moneda','ARS','monto',100,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'aplicaciones',jsonb_build_array(jsonb_build_object(
          'cargo_id',x.fixture->>'cargo_ars_a','importe_origen',100,'moneda_origen','ARS',
          'importe_destino',100,'moneda_destino','ARS'))))
  $action$,
  $oracle$
    select t.contraparte_parte_id=c.deudor_parte_id
       and t.beneficiario_parte_id=c.acreedor_parte_id and c.saldo_pendiente=900,
      jsonb_build_object('transaccion',t.id,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    join alq.alq_cargo c on c.id=a.cargo_id
  $oracle$);

select pg_temp.alq_f1a_ejecutar_valido(14,'V14_PAGO_GARANTE_VALIDO',
  $action$
    with g as materialized (
      insert into alq.alq_garantia(contrato_id,garante_parte_id,tipo,vigencia,
        regla_notificacion_mora)
      select (x.fixture->>'contract_a')::uuid,(x.fixture->>'outsider')::uuid,'fiador',
        tstzrange('2026-01-01 00:00:00+00','2026-12-31 00:00:00+00','[)'),
        '{}'::jsonb from pg_temp.alq_d0_case_ctx x returning id)
    update pg_temp.alq_d0_case_ctx x set aux=jsonb_build_object('garantia',g.id),
      run1=pg_temp.alq_d0_rpc('pago_multimoneda',jsonb_build_object(
        'ambito','externa_informativa','contraparte_parte_id',x.fixture->>'outsider',
        'beneficiario_parte_id',x.fixture->>'owner_a','moneda','ARS','monto',100,
        'fecha','2026-01-08T12:00:00Z','medio','transferencia',
        'aplicaciones',jsonb_build_array(jsonb_build_object(
          'cargo_id',x.fixture->>'cargo_ars_a','importe_origen',100,'moneda_origen','ARS',
          'importe_destino',100,'moneda_destino','ARS'))))
    from g
  $action$,
  $oracle$
    select exists(select 1 from alq.alq_garantia g where g.id=(x.aux->>'garantia')::uuid
        and t.fecha<@g.vigencia) and c.saldo_pendiente=900,
      jsonb_build_object('transaccion',t.id,'cargo_saldo',c.saldo_pendiente)
    from pg_temp.alq_d0_case_ctx x
    join alq.alq_transaccion_caja t on t.operacion_id=(x.run1->>'operacion_id')::uuid
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    join alq.alq_cargo c on c.id=a.cargo_id
  $oracle$);

create temporary table alq_f1a_state_result (
  caso text primary key,
  estado_test text not null check (estado_test in ('PASS','FAIL')),
  evidencia jsonb not null
) on commit drop;

create function pg_temp.alq_f1a_ejecutar_state()
returns void language plpgsql security invoker set search_path=''
as $f1a_state_machine$
declare
  v_f jsonb; v_payload1 jsonb; v_payload2 jsonb; v_bad_payload jsonb;
  v_p1 jsonb; v_p1_replay jsonb;
  v_p2 jsonb; v_c2 jsonb; v_c2_replay jsonb;
  v_rejected_apply jsonb; v_rejected_cancel jsonb;
  v_bad jsonb; v_bad_replay jsonb;
  v_prepare_ok boolean:=false; v_prepare_replay_ok boolean:=false;
  v_cancel_ok boolean:=false; v_cancel_replay_ok boolean:=false;
  v_reject_ok boolean:=false; v_conflict boolean:=false;
  v_cardinality_ok boolean:=false; v_constraints_ok boolean:=false;
  v_pass boolean:=false;
  v_state text:='00000'; v_message text:='ALQ_F1A_STATE_PASS';
  v_prepare_cmd constant uuid:='f1af1000-0000-4000-8000-000000000001';
  v_prepare_cancel_cmd constant uuid:='f1af1000-0000-4000-8000-000000000003';
  v_cancel_cmd constant uuid:='f1af1000-0000-4000-8000-000000000004';
  v_bad_cmd constant uuid:='f1af1000-0000-4000-8000-000000000005';
  v_rejected_apply_cmd constant uuid:='f1af1000-0000-4000-8000-000000000006';
  v_rejected_cancel_cmd constant uuid:='f1af1000-0000-4000-8000-000000000007';
begin
  begin
    v_f:=pg_temp.alq_d0_fixture('STATE_MACHINE');
    v_payload1:=jsonb_build_object(
      'cargo_fuente_ref','f1af2000-0000-4000-8000-000000000001',
      'propiedad_id',v_f->>'prop_a','contrato_id',v_f->>'contract_a',
      'periodo_id',v_f->>'period_a','deudor_parte_id',v_f->>'tenant_a',
      'acreedor_parte_id',v_f->>'owner_a','ambito','externa',
      'concepto','alquiler_periodo','moneda','ARS','monto',100,
      'vence_at','2026-01-10T12:00:00Z','snapshot_regla',jsonb_build_object('f1a',true));
    v_p1:=public.alq_admin_preparar_v2(v_prepare_cmd,'cargo_manual_emitir',v_payload1);
    v_p1_replay:=public.alq_admin_preparar_v2(v_prepare_cmd,'cargo_manual_emitir',v_payload1);
    v_prepare_ok:=coalesce(v_p1->>'estado'='preparada'
      and (v_p1->>'ok')::boolean is true
      and v_p1->>'comando_request_id'=v_prepare_cmd::text,false);
    v_prepare_replay_ok:=v_p1 is not distinct from v_p1_replay;
    if not coalesce(v_prepare_ok,false) or not v_prepare_replay_ok then
      raise exception using errcode='ZX022',message='ALQ_F1A_STATE_PREPARE_REPLAY_FALLO';
    end if;
    v_payload2:=v_payload1||jsonb_build_object(
      'cargo_fuente_ref','f1af2000-0000-4000-8000-000000000002','monto',101);
    v_p2:=public.alq_admin_preparar_v2(
      v_prepare_cancel_cmd,'cargo_manual_emitir',v_payload2);
    -- La calificación vive dentro de la transacción tool-owned, pero esta
    -- frontera reproduce el commit entre preparar y cancelar del protocolo.
    set constraints all immediate;
    set constraints all deferred;
    v_c2:=public.alq_admin_cancelar_v2((v_p2->>'operacion_request_id')::uuid,
      v_cancel_cmd,'cancelacion local explicita');
    v_c2_replay:=public.alq_admin_cancelar_v2((v_p2->>'operacion_request_id')::uuid,
      v_cancel_cmd,'cancelacion local explicita');
    v_rejected_apply:=public.alq_admin_aplicar_v2(
      (v_p2->>'operacion_request_id')::uuid,v_rejected_apply_cmd,
      'cargo_manual_emitir',v_p2->>'firma',v_payload2);
    v_rejected_cancel:=public.alq_admin_cancelar_v2(
      (v_p2->>'operacion_request_id')::uuid,v_rejected_cancel_cmd,
      'otra cancelacion sobre terminal');
    v_cancel_ok:=coalesce(v_c2->>'estado'='rechazada'
      and v_c2->>'codigo'='ALQ_F1A_CANCELADA'
      and v_c2->>'comando_request_id'=v_cancel_cmd::text
      and v_rejected_apply->>'estado'='rechazada'
      and v_rejected_apply->>'codigo'=v_c2->>'codigo'
      and v_rejected_apply->>'comando_request_id'=v_rejected_apply_cmd::text
      and v_rejected_cancel->>'estado'='rechazada'
      and v_rejected_cancel->>'codigo'=v_c2->>'codigo'
      and v_rejected_cancel->>'comando_request_id'=v_rejected_cancel_cmd::text,false);
    v_cancel_replay_ok:=v_c2 is not distinct from v_c2_replay;
    if not coalesce(v_cancel_ok,false) or not v_cancel_replay_ok then
      raise exception using errcode='ZX024',message='ALQ_F1A_STATE_CANCEL_REPLAY_FALLO';
    end if;

    v_bad_payload:=jsonb_build_object(
      'nota_ref','f1af2000-0000-4000-8000-000000000003',
      'tipo','credito','cargo_id',v_f->>'cargo_ars_a','monto',10,'moneda','USD',
      'motivo','prevalidacion local','fecha','2026-01-08T12:00:00Z');
    v_bad:=public.alq_admin_preparar_v2(v_bad_cmd,'nota_emitir',v_bad_payload);
    v_bad_replay:=public.alq_admin_preparar_v2(v_bad_cmd,'nota_emitir',v_bad_payload);
    v_reject_ok:=coalesce(v_bad is not distinct from v_bad_replay
      and v_bad->>'estado'='rechazada_sin_fila'
      and v_bad->>'codigo'='ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE'
      and not (v_bad ? 'hecho_id') and not (v_bad ? 'operacion_id'),false);
    if not coalesce(v_reject_ok,false) then
      raise exception using errcode='ZX025',message='ALQ_F1A_STATE_RECHAZO_SIN_FILA_FALLO';
    end if;

    begin
      perform public.alq_admin_preparar_v2(v_prepare_cmd,'cargo_manual_emitir',
        v_payload1||jsonb_build_object('monto',102));
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message=message_text;
      v_conflict:=v_message='ALQ_F1A_COMANDO_CONFLICTO';
    end;
    if not v_conflict then
      raise exception using errcode='ZX026',message='ALQ_F1A_STATE_COMANDO_CONFLICTO_FALLO';
    end if;

    v_cardinality_ok:=(select count(*) from alq_private.alq_hecho_idempotente_v2
        where id in ((v_p1->>'hecho_id')::uuid,(v_p2->>'hecho_id')::uuid))=2
      and (select count(*) from alq.alq_operacion
           where id in ((v_p1->>'operacion_id')::uuid,(v_p2->>'operacion_id')::uuid)
             and estado in ('preparada','rechazada'))=2
      and (select count(*) from alq_private.alq_operacion_evento_v2
           where comando_request_id in (
             v_prepare_cmd,v_prepare_cancel_cmd,v_cancel_cmd,v_bad_cmd,
             v_rejected_apply_cmd,v_rejected_cancel_cmd)
             and run_id=(select run_id
               from pg_temp.alq_f1a_qualification_context))=6;
    if not v_cardinality_ok then
      raise exception using errcode='ZX027',message='ALQ_F1A_STATE_CARDINALIDAD_FALLO';
    end if;
    set constraints all immediate;
    v_constraints_ok:=true;
    raise exception using errcode='ZX021',message='ALQ_F1A_STATE_PASS_ROLLBACK';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    if v_state='ZX021' and v_message='ALQ_F1A_STATE_PASS_ROLLBACK' then
      v_pass:=true; v_state:='00000'; v_message:='ALQ_F1A_STATE_PASS';
    end if;
  end;

  insert into pg_temp.alq_f1a_state_result(caso,estado_test,evidencia)
  select x.caso,case when x.ok then 'PASS' else 'FAIL' end,
    jsonb_build_object('sqlstate',v_state,'mensaje',v_message,
      'check_observado',x.check_observado,'cardinalidad',v_cardinality_ok,
      'constraints_immediate',v_constraints_ok,'suite_completa',v_pass,
      'modo','forward_sin_apply',
      'qualification_run_id',(select run_id
        from pg_temp.alq_f1a_qualification_context))
  from (values
    ('PREPARAR_SIN_APLICAR',
      v_prepare_ok and v_cardinality_ok and v_constraints_ok and v_pass,v_prepare_ok),
    ('REPLAY_PREPARAR_MISMO_ENVELOPE',
      v_prepare_replay_ok and v_cardinality_ok and v_constraints_ok and v_pass,
      v_prepare_replay_ok),
    ('CANCELAR_REPLAY_TERMINAL',
      v_cancel_ok and v_cancel_replay_ok and v_cardinality_ok
        and v_constraints_ok and v_pass,
      v_cancel_ok and v_cancel_replay_ok),
    ('RECHAZO_PREVALIDACION_SIN_FILA',
      v_reject_ok and v_cardinality_ok and v_constraints_ok and v_pass,v_reject_ok),
    ('COMANDO_REUTILIZADO_CONFLICTO',
      v_conflict and v_cardinality_ok and v_constraints_ok and v_pass,v_conflict)
  ) as x(caso,ok,check_observado);
end
$f1a_state_machine$;

select set_config('alq.f1a_forward_prevalidate_only','off',true);
select pg_temp.alq_f1a_ejecutar_state();

-- La prueba RLS no infiere seguridad desde el catálogo solamente. Primero sella
-- estructura/ACL y luego ejecuta las mismas lecturas con roles API reales del
-- fixture, cambiando el sub JWT entre propietario, ajeno, sin vínculo y admin.
create temporary table alq_f1a_rls_result (
  caso text primary key,
  estado_test text not null check (estado_test in ('PASS','FAIL')),
  sqlstate text not null,
  mensaje text not null,
  evidencia jsonb not null
) on commit drop;

grant insert,select on pg_temp.alq_f1a_rls_result
  to anon,authenticated,service_role;

do $f1a_rls_catalogo$
declare
  v_privadas integer;
  v_privadas_inseguras integer;
  v_policies integer;
  v_acl_privada integer;
  v_vistas integer;
  v_vistas_inseguras integer;
  v_vistas_auth integer;
  v_acl_vista integer;
  v_wrappers integer;
  v_wrappers_auth integer;
  v_acl_wrapper integer;
begin
  select count(*),
         count(*) filter (where not c.relrowsecurity or not c.relforcerowsecurity)
    into v_privadas,v_privadas_inseguras
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='alq_private' and c.relkind='r'
    and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2');
  select count(*) into v_policies
  from pg_catalog.pg_policies
  where schemaname='alq_private'
    and tablename in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2');
  select count(*) into v_acl_privada
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
  where n.nspname='alq_private'
    and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
    and a.grantee<>c.relowner;
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values ('RLS01_PRIVADAS_FORCE_SIN_POLICY_SIN_ACL',
    case when v_privadas=2 and v_privadas_inseguras=0
      and v_policies=0 and v_acl_privada=0
      then 'PASS' else 'FAIL' end,'00000','ALQ_F1A_RLS_CATALOGO_PRIVADO',
    jsonb_build_object('tablas',v_privadas,'sin_force_rls',v_privadas_inseguras,
      'policies',v_policies,'acl_no_owner',v_acl_privada));

  select count(*),count(*) filter (
      where not coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']),
      count(*) filter (where pg_catalog.has_table_privilege(
        'authenticated',c.oid,'SELECT'))
    into v_vistas,v_vistas_inseguras,v_vistas_auth
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind='v' and (
    (n.nspname='public' and c.relname like 'alq\_v\_%' escape '\')
    or (n.nspname='alq' and c.relname in (
      'alq_v_comunicados_propietario','alq_v_estado_cartera',
      'alq_v_propiedades_propietario')));
  select count(*) into v_acl_vista
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
  where c.relkind='v' and (
    (n.nspname='public' and c.relname like 'alq\_v\_%' escape '\')
    or (n.nspname='alq' and c.relname in (
      'alq_v_comunicados_propietario','alq_v_estado_cartera',
      'alq_v_propiedades_propietario')))
    and a.grantee<>c.relowner
    and not (a.grantee=to_regrole('authenticated')::oid
      and a.privilege_type='SELECT' and not a.is_grantable);
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values ('RLS02_27_VISTAS_INVOKER_ACL_EXACTA',
    case when v_vistas=27 and v_vistas_inseguras=0
      and v_vistas_auth=27 and v_acl_vista=0
      then 'PASS' else 'FAIL' end,'00000','ALQ_F1A_RLS_CATALOGO_VISTAS',
    jsonb_build_object('vistas',v_vistas,'sin_security_invoker',v_vistas_inseguras,
      'select_authenticated',v_vistas_auth,'acl_inesperada',v_acl_vista));

  select count(*),count(*) filter (where pg_catalog.has_function_privilege(
      'authenticated',p.oid,'EXECUTE'))
    into v_wrappers,v_wrappers_auth
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('alq_admin_preparar_v2','alq_admin_aplicar_v2',
     'alq_admin_cancelar_v2','alq_admin_reintentar_v2')
    and not p.prosecdef and p.proconfig=array['search_path=""']::text[];
  select count(*) into v_acl_wrapper
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where n.nspname='public' and p.proname in
    ('alq_admin_preparar_v2','alq_admin_aplicar_v2',
     'alq_admin_cancelar_v2','alq_admin_reintentar_v2')
    and a.grantee<>p.proowner
    and not (a.grantee=to_regrole('authenticated')::oid
      and a.privilege_type='EXECUTE' and not a.is_grantable);
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values ('RLS03_RPC_V2_INVOKER_ACL_EXACTA',
    case when v_wrappers=4 and v_wrappers_auth=4 and v_acl_wrapper=0
      then 'PASS' else 'FAIL' end,
    '00000','ALQ_F1A_RLS_CATALOGO_RPC',
    jsonb_build_object('wrappers_invoker_search_path_vacio',v_wrappers,
      'execute_authenticated',v_wrappers_auth,'acl_inesperada',v_acl_wrapper));
end
$f1a_rls_catalogo$;

create function pg_temp.alq_f1a_rls_actor_case(
  p_caso text,p_prop_visible uuid,p_prop_oculta uuid,p_total_esperado integer)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_total integer;
  v_visible boolean;
  v_oculta boolean;
  v_state text:='00000';
  v_message text:='ALQ_F1A_RLS_ACTOR_PASS';
  v_dml_state text:='00000';
  v_dml_message text:='ALQ_F1A_RLS_DML_ACEPTADO';
  v_private_state text:='00000';
  v_private_message text:='ALQ_F1A_RLS_PRIVADA_ACEPTADA';
  v_dummy bigint;
  v_pass boolean:=false;
begin
  begin
    select count(*),bool_or(id=p_prop_visible),bool_or(id=p_prop_oculta)
      into v_total,v_visible,v_oculta
    from public.alq_v_propiedad
    where id in (p_prop_visible,p_prop_oculta);
    begin
      update alq.alq_propiedad set direccion=direccion where false;
    exception when others then
      get stacked diagnostics v_dml_state=returned_sqlstate,v_dml_message=message_text;
    end;
    begin
      execute 'select count(*) from alq_private.alq_hecho_idempotente_v2'
        into v_dummy;
    exception when others then
      get stacked diagnostics
        v_private_state=returned_sqlstate,v_private_message=message_text;
    end;
    v_pass:=v_total=p_total_esperado
      and coalesce(v_visible,false)=(p_total_esperado>0)
      and not coalesce(v_oculta,false)
      and v_dml_state='42501' and v_private_state='42501';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  end;
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values (p_caso,case when v_pass then 'PASS' else 'FAIL' end,v_state,v_message,
    jsonb_build_object('role',current_user,'jwt_sub',
      nullif(current_setting('request.jwt.claim.sub',true),''),
      'filas',v_total,'visible',v_visible,'oculta',v_oculta,
      'dml_sqlstate',v_dml_state,'dml_mensaje',v_dml_message,
      'privada_sqlstate',v_private_state,'privada_mensaje',v_private_message));
end
$fn$;

create function pg_temp.alq_f1a_rls_admin_case(p_caso text)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_total integer;
  v_state text:='00000';
  v_message text:='ALQ_F1A_RLS_ADMIN_PASS';
  v_dml_state text:='00000';
  v_dml_message text:='ALQ_F1A_RLS_DML_ACEPTADO';
  v_private_state text:='00000';
  v_private_message text:='ALQ_F1A_RLS_PRIVADA_ACEPTADA';
  v_rpc_state text:='00000';
  v_rpc_message text:='ALQ_F1A_RLS_RPC_NO_RECHAZO';
  v_dummy bigint;
  v_pass boolean:=false;
begin
  begin
    select count(*) into v_total from public.alq_v_propiedad
    where id in ('f1af0000-0000-4000-8000-000000000050'::uuid,
                 'f1af0000-0000-4000-8000-000000000051'::uuid);
    begin
      update alq.alq_propiedad set direccion=direccion where false;
    exception when others then
      get stacked diagnostics v_dml_state=returned_sqlstate,v_dml_message=message_text;
    end;
    begin
      execute 'select count(*) from alq_private.alq_hecho_idempotente_v2'
        into v_dummy;
    exception when others then
      get stacked diagnostics
        v_private_state=returned_sqlstate,v_private_message=message_text;
    end;
    begin
      perform public.alq_admin_preparar_v2(null,'cargo_manual_emitir','{}'::jsonb);
    exception when others then
      get stacked diagnostics v_rpc_state=returned_sqlstate,v_rpc_message=message_text;
    end;
    v_pass:=v_total=2 and v_dml_state='42501' and v_private_state='42501'
      and v_rpc_state='P0001' and v_rpc_message='ALQ_F1A_COMANDO_REQUEST_REQUERIDO';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
  end;
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values (p_caso,case when v_pass then 'PASS' else 'FAIL' end,v_state,v_message,
    jsonb_build_object('role',current_user,'jwt_sub',
      nullif(current_setting('request.jwt.claim.sub',true),''),'filas',v_total,
      'dml_sqlstate',v_dml_state,'dml_mensaje',v_dml_message,
      'privada_sqlstate',v_private_state,'privada_mensaje',v_private_message,
      'rpc_sqlstate',v_rpc_state,'rpc_mensaje',v_rpc_message));
end
$fn$;

create function pg_temp.alq_f1a_rls_denied_case(p_caso text)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  v_view_state text:='00000';
  v_view_message text:='ALQ_F1A_RLS_VISTA_ACEPTADA';
  v_private_state text:='00000';
  v_private_message text:='ALQ_F1A_RLS_PRIVADA_ACEPTADA';
  v_dummy bigint;
begin
  begin
    execute 'select count(*) from public.alq_v_propiedad' into v_dummy;
  exception when others then
    get stacked diagnostics v_view_state=returned_sqlstate,v_view_message=message_text;
  end;
  begin
    execute 'select count(*) from alq_private.alq_hecho_idempotente_v2' into v_dummy;
  exception when others then
    get stacked diagnostics v_private_state=returned_sqlstate,v_private_message=message_text;
  end;
  insert into pg_temp.alq_f1a_rls_result(caso,estado_test,sqlstate,mensaje,evidencia)
  values (p_caso,case when v_view_state='42501' and v_private_state='42501'
      then 'PASS' else 'FAIL' end,v_view_state,v_view_message,
    jsonb_build_object('role',current_user,'vista_sqlstate',v_view_state,
      'vista_mensaje',v_view_message,
      'privada_sqlstate',v_private_state,'privada_mensaje',v_private_message));
end
$fn$;

grant execute on function pg_temp.alq_f1a_rls_actor_case(text,uuid,uuid,integer),
  pg_temp.alq_f1a_rls_admin_case(text),pg_temp.alq_f1a_rls_denied_case(text)
  to anon,authenticated,service_role;

select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000010',true);
set local role authenticated;
select pg_temp.alq_f1a_rls_actor_case('RLS04_PROPIETARIO_SOLO_PROPIA',
  'f1af0000-0000-4000-8000-000000000050'::uuid,
  'f1af0000-0000-4000-8000-000000000051'::uuid,1);
reset role;

select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000020',true);
set local role authenticated;
select pg_temp.alq_f1a_rls_actor_case('RLS05_AJENO_SOLO_PROPIA',
  'f1af0000-0000-4000-8000-000000000051'::uuid,
  'f1af0000-0000-4000-8000-000000000050'::uuid,1);
reset role;

select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000030',true);
set local role authenticated;
select pg_temp.alq_f1a_rls_actor_case('RLS06_SIN_VINCULO_VACIO',
  'f1af0000-0000-4000-8000-000000000050'::uuid,
  'f1af0000-0000-4000-8000-000000000051'::uuid,0);
reset role;

select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.alq_f1a_rls_admin_case('RLS07_ADMIN_VE_AMBAS');
reset role;

select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000040',true);
set local role authenticated;
select pg_temp.alq_f1a_rls_admin_case('RLS08_OVERLAP_ADMIN_VE_AMBAS');
reset role;

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.alq_f1a_rls_denied_case('RLS09_ANON_DENEGADO');
reset role;

set local role service_role;
select pg_temp.alq_f1a_rls_denied_case('RLS10_SERVICE_ROLE_DENEGADO');
reset role;

-- Restablece el actor admin para los asserts server-owned posteriores.
select set_config('request.jwt.claim.sub',
  'f1af0000-0000-4000-8000-000000000001',true);

-- Autoclean explícito de todos los actores y propiedades forward, en orden FK.
create function pg_temp.alq_f1a_actor_cleanup()
returns void language plpgsql security invoker set search_path=''
as $f1a_actor_cleanup$
begin
delete from alq.alq_acceso_propiedad
where parte_usuario_id in (
  'f1af0000-0000-4000-8000-000000000012'::uuid,
  'f1af0000-0000-4000-8000-000000000022'::uuid,
  'f1af0000-0000-4000-8000-000000000042'::uuid);
delete from alq.alq_capacidad_admin
where parte_usuario_id in (
  'f1af0000-0000-4000-8000-000000000003'::uuid,
  'f1af0000-0000-4000-8000-000000000042'::uuid);
delete from alq.alq_parte_usuario where id in (
  'f1af0000-0000-4000-8000-000000000003'::uuid,
  'f1af0000-0000-4000-8000-000000000012'::uuid,
  'f1af0000-0000-4000-8000-000000000022'::uuid,
  'f1af0000-0000-4000-8000-000000000042'::uuid);
delete from alq.alq_propiedad where id in (
  'f1af0000-0000-4000-8000-000000000050'::uuid,
  'f1af0000-0000-4000-8000-000000000051'::uuid);
delete from alq.alq_parte where id in (
  'f1af0000-0000-4000-8000-000000000002'::uuid,
  'f1af0000-0000-4000-8000-000000000011'::uuid,
  'f1af0000-0000-4000-8000-000000000021'::uuid,
  'f1af0000-0000-4000-8000-000000000041'::uuid);
delete from auth.users where id in (
  'f1af0000-0000-4000-8000-000000000001'::uuid,
  'f1af0000-0000-4000-8000-000000000010'::uuid,
  'f1af0000-0000-4000-8000-000000000020'::uuid,
  'f1af0000-0000-4000-8000-000000000030'::uuid,
  'f1af0000-0000-4000-8000-000000000040'::uuid);
set constraints all immediate;
set constraints all deferred;
end
$f1a_actor_cleanup$;

select pg_temp.alq_f1a_actor_cleanup();

select pg_temp.alq_d0_tomar_snapshot('POST');

do $f1a_forward_sequence_post$
declare v_seq regclass; v_last bigint; v_called boolean;
begin
  v_seq:=pg_catalog.pg_get_serial_sequence('alq.alq_journal','id')::regclass;
  execute pg_catalog.format('select last_value,is_called from %s',v_seq)
    into v_last,v_called;
  insert into pg_temp.alq_f1a_forward_sequence_snapshot(
    fase,sequence_name,last_value,is_called)
  values ('POST',v_seq::text,v_last,v_called);
  if exists (
    select 1
    from pg_temp.alq_f1a_forward_sequence_snapshot pre
    join pg_temp.alq_f1a_forward_sequence_snapshot post
      on post.fase='POST' and pre.fase='PRE'
    where pre.sequence_name<>post.sequence_name
       or pre.last_value<>post.last_value
       or pre.is_called<>post.is_called
  ) then
    raise exception 'ALQ_F1A_FORWARD_JOURNAL_IDENTITY_CONSUMIDA';
  end if;
end
$f1a_forward_sequence_post$;

-- Diagnóstico determinista previo a los asserts fail-closed. No declara PASS:
-- serializa exclusivamente filas observadas para que cualquier STOP sea accionable.
select 'ALQ_F1A_FORWARD_DIAG_D0|'||coalesce(jsonb_agg(jsonb_build_object(
  'caso',caso,'estado_test',estado_test,'sqlstate',sqlstate,
  'mensaje',mensaje,'fase',fase_fallo) order by ordinal),'[]'::jsonb)::text
from pg_temp.alq_d0_resultado;
select 'ALQ_F1A_FORWARD_DIAG_VALID|'||coalesce(jsonb_agg(jsonb_build_object(
  'caso',caso,'estado_test',estado_test,'sqlstate',sqlstate,
  'mensaje',mensaje) order by ordinal),'[]'::jsonb)::text
from pg_temp.alq_f1a_valid_result;
select 'ALQ_F1A_FORWARD_DIAG_STATE|'||coalesce(jsonb_agg(jsonb_build_object(
  'caso',caso,'estado_test',estado_test,
  'sqlstate',evidencia->>'sqlstate','mensaje',evidencia->>'mensaje')
  order by caso),'[]'::jsonb)::text
from pg_temp.alq_f1a_state_result;
select 'ALQ_F1A_FORWARD_DIAG_RLS|'||coalesce(jsonb_agg(jsonb_build_object(
  'caso',caso,'estado_test',estado_test,'sqlstate',sqlstate,
  'mensaje',mensaje) order by caso),'[]'::jsonb)::text
from pg_temp.alq_f1a_rls_result;

do $d0_post$
begin
  if (select count(*) from pg_temp.alq_d0_resultado)<>17 then
    raise exception 'ALQ_D0_RESULTADOS_INCOMPLETOS';
  end if;
  if exists (select 1 from pg_temp.alq_d0_resultado where estado_test='SONDA_INVALIDA') then
    raise exception 'ALQ_F1A_SONDA_INVALIDA';
  end if;
  if (select count(*) from pg_temp.alq_d0_resultado where estado_test='VERDE_F1A')<>17
     or exists (select 1 from pg_temp.alq_d0_resultado where sqlstate='00000') then
    raise exception 'ALQ_F1A_NO_CONVIRTIO_14_MAS_3_A_RECHAZOS_EXACTOS';
  end if;
  if (select count(*) from pg_temp.alq_f1a_valid_result)<>14
     or exists (select 1 from pg_temp.alq_f1a_valid_result where estado_test<>'PASS') then
    raise exception 'ALQ_F1A_CASOS_VALIDOS_ADYACENTES_FALLARON';
  end if;
  if (select count(*) from pg_temp.alq_f1a_state_result)<>5
     or exists (select 1 from pg_temp.alq_f1a_state_result where estado_test<>'PASS') then
    raise exception 'ALQ_F1A_MAQUINA_ESTADOS_FALLO';
  end if;
  if (select count(*) from pg_temp.alq_f1a_rls_result)<>10
     or exists (select 1 from pg_temp.alq_f1a_rls_result where estado_test<>'PASS') then
    raise exception 'ALQ_F1A_RLS_RUNTIME_O_CATALOGO_FALLO';
  end if;
  if exists (
    select 1 from pg_temp.alq_d0_snapshot a full join pg_temp.alq_d0_snapshot b
      on b.fase='POST' and a.fase='PRE' and a.tabla=b.tabla
    where a.fase='PRE' and (b.tabla is null or a.filas<>b.filas or a.sha256<>b.sha256)
  ) or exists (
    select 1 from pg_temp.alq_d0_snapshot b left join pg_temp.alq_d0_snapshot a
      on a.fase='PRE' and a.tabla=b.tabla
    where b.fase='POST' and a.tabla is null
  ) then
    raise exception 'ALQ_F1A_DERIVA_PRE_POST';
  end if;
  if alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F1A_ASSERT_GLOBAL_POST_FALLO';
  end if;
  if exists (
    select 1 from auth.users where id in (
      'f1af0000-0000-4000-8000-000000000001'::uuid,
      'f1af0000-0000-4000-8000-000000000010'::uuid,
      'f1af0000-0000-4000-8000-000000000020'::uuid,
      'f1af0000-0000-4000-8000-000000000030'::uuid,
      'f1af0000-0000-4000-8000-000000000040'::uuid)
  ) or exists (
    select 1 from alq.alq_parte where id::text like 'f1af0000-0000-4000-8000-%'
  ) or exists (
    select 1 from alq.alq_parte_usuario where id::text like 'f1af0000-0000-4000-8000-%'
  ) or exists (
    select 1 from alq.alq_propiedad where id::text like 'f1af0000-0000-4000-8000-%'
  ) then
    raise exception 'ALQ_F1A_FORWARD_AUTOCLEAN_FALLO';
  end if;
end
$d0_post$;

select 'ALQ_F1A_FORWARD_SINGLE_SESSION_RECEIPT|'||jsonb_build_object(
  'schema_version',1,
  'status','ALQ_F1A_FORWARD_SINGLE_SESSION_PASS',
  'qualification_run_id',(select run_id
    from pg_temp.alq_f1a_qualification_context),
  'exact_rejections',(select count(*) from pg_temp.alq_d0_resultado
    where estado_test='VERDE_F1A'),
  'valid_prevalidations',(select count(*) from pg_temp.alq_f1a_valid_result
    where estado_test='PASS'),
  'state_cases',(select count(*) from pg_temp.alq_f1a_state_result
    where estado_test='PASS'),
  'rls_cases',(select count(*) from pg_temp.alq_f1a_rls_result
    where estado_test='PASS'),
  'journal_apply_executed',false,
  'journal_identity_unchanged',(select
    pre.sequence_name=post.sequence_name
    and pre.last_value=post.last_value
    and pre.is_called=post.is_called
    from pg_temp.alq_f1a_forward_sequence_snapshot pre
    join pg_temp.alq_f1a_forward_sequence_snapshot post
      on pre.fase='PRE' and post.fase='POST'),
  'cleanup_residual_rows',(select count(*) from (
    select coalesce(a.tabla,b.tabla) as tabla
    from (select * from pg_temp.alq_d0_snapshot where fase='PRE') a
    full join (select * from pg_temp.alq_d0_snapshot where fase='POST') b
      on b.tabla=a.tabla
    where a.tabla is null or b.tabla is null
      or a.filas<>b.filas or a.sha256<>b.sha256) deriva),
  'assert_global_ok',alq_private.alq_assert_global_v1()='ALQ_ASSERT_GLOBAL_OK'
)::text as alq_f1a_forward_single_session_receipt;

drop table pg_temp.alq_f1a_qualification_context;
-- END ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE

-- Suplemento exclusivo del fixture PG17 descartable: recién fuera del bloque
-- forward se habilitan apply/replay exitosos y, por tanto, consumo de journal.
-- El cluster completo se destruye al cerrar el harness; estos casos jamás viajan
-- en los statements del one-shot QA.
create function pg_temp.alq_f1a_ejecutar_valido_local_full(
  p_ordinal integer,p_caso text,p_action_sql text,p_oracle_sql text,
  p_expected_gate text default null)
returns void language plpgsql security invoker set search_path=''
as $f1a_valid_local_full$
declare
  v_fixture jsonb; v_ok boolean:=false; v_evidence jsonb:='{}'::jsonb;
  v_state text:='00000'; v_message text:='ALQ_F1A_VALIDO_PASS';
  v_phase text:='FIXTURE'; v_pass boolean:=false;
begin
  begin
    v_fixture:=pg_temp.alq_d0_fixture(p_caso);
    insert into pg_temp.alq_d0_case_ctx(caso,fixture) values (p_caso,v_fixture);
    v_phase:='MUTACION';
    execute p_action_sql;
    set constraints all immediate;
    if p_expected_gate is not null then
      raise exception using errcode='ZX012',message='ALQ_F1A_GATE_ESPERADO_NO_OCURRIO';
    end if;
    v_phase:='ORACULO';
    execute p_oracle_sql into v_ok,v_evidence;
    if not coalesce(v_ok,false) then
      raise exception using errcode='ZX013',message='ALQ_F1A_VALIDO_ORACULO_NO_CONFIRMADO';
    end if;
    raise exception using errcode='ZX011',message='ALQ_F1A_VALIDO_PASS_ROLLBACK';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    if v_state='ZX011' and v_message='ALQ_F1A_VALIDO_PASS_ROLLBACK' then
      v_pass:=true; v_state:='00000'; v_message:='ALQ_F1A_VALIDO_PASS';
    elsif p_expected_gate is not null and v_state='P0001'
       and v_message=p_expected_gate and v_phase='MUTACION' then
      v_pass:=true;
      v_evidence:=jsonb_build_object(
        'gate_terminal',v_message,'guardas_nominales_pasaron',true);
    end if;
  end;
  insert into pg_temp.alq_f1a_valid_result(
    ordinal,caso,estado_test,sqlstate,mensaje,evidencia)
  values (p_ordinal,p_caso,case when v_pass then 'PASS' else 'FAIL' end,
    v_state,v_message,coalesce(v_evidence,'{}'::jsonb));
end
$f1a_valid_local_full$;

create temporary table alq_f1a_v1_giro_result (
  ordinal integer primary key,
  operacion text not null unique,
  estado_test text not null check (estado_test in ('PASS','FAIL')),
  sqlstate text not null,
  mensaje text not null,
  evidencia jsonb not null
) on commit drop;

-- Prueba mínima directa del dispatcher V1. Queda fuera del bloque forward porque
-- un éxito consume la identity de journal; el cluster local entero es descartable.
create function pg_temp.alq_f1a_ejecutar_giro_v1_local(
  p_ordinal integer,p_operacion text)
returns void language plpgsql security invoker set search_path=''
as $f1a_giro_v1_local$
declare
  v_f jsonb; v_actor uuid; v_tit uuid; v_mandato uuid; v_mv uuid; v_rendicion uuid;
  v_op uuid:=pg_catalog.gen_random_uuid(); v_payload jsonb; v_result jsonb;
  v_evento_esperado text; v_evento_observado text;
  v_journal_ok boolean:=false; v_efecto_ok boolean:=false; v_pass boolean:=false;
  v_state text:='00000'; v_message text:='ALQ_F1A_V1_GIRO_PASS';
begin
  v_evento_esperado:=case p_operacion
    when 'giro_registrar' then 'giro_a_propietario'
    when 'giro_a_propietario' then 'giro_a_propietario'
    else null end;
  if v_evento_esperado is null then
    raise exception 'ALQ_F1A_V1_GIRO_OPERACION_INVALIDA:%',p_operacion;
  end if;
  begin
    v_f:=pg_temp.alq_d0_fixture('V1_GIRO_'||p_operacion);
    v_actor:=(v_f->>'actor')::uuid;
    select id into strict v_tit from alq.alq_titularidad
    where propiedad_id=(v_f->>'prop_a')::uuid
      and parte_id=(v_f->>'owner_a')::uuid;
    insert into alq.alq_mandato(propiedad_id,titularidad_id,vigencia,estado)
    values ((v_f->>'prop_a')::uuid,v_tit,
      tstzrange('2026-01-01 00:00:00+00',null,'[)'),'activo')
    returning id into v_mandato;
    insert into alq.alq_mandato_version(
      mandato_id,vigencia,honorario_base,honorario_pct,honorario_minimo,
      honorario_fijo,incluye_punitorios,moneda,tratamiento_impuestos)
    values (v_mandato,tstzrange('2026-01-01 00:00:00+00',null,'[)'),
      'cobrado',0,0,0,false,'ARS','{}'::jsonb)
    returning id into v_mv;
    insert into alq.alq_rendicion(
      propiedad_id,mandato_version_id,periodo,moneda,saldo_inicial,saldo_final,
      estado,operacion_id,emitida_at)
    values ((v_f->>'prop_a')::uuid,v_mv,'2026-01-01','ARS',100,100,
      'emitida',(v_f->>'op')::uuid,'2026-01-08 11:00:00+00')
    returning id into v_rendicion;
    v_payload:=jsonb_build_object(
      'rendicion_id',v_rendicion,
      'contraparte_parte_id',v_f->>'owner_a',
      'beneficiario_parte_id',v_f->>'owner_a',
      'cuenta_custodia_id',v_f->>'acc_ars',
      'moneda','ARS','monto',10,
      'fecha','2026-01-08T12:00:00Z','medio','transferencia');
    insert into alq.alq_operacion(
      id,request_id,operacion,payload_normalizado,firma_sha256,estado,
      actor_parte_usuario_id,preparada_at)
    values (v_op,pg_catalog.gen_random_uuid(),p_operacion,v_payload,
      alq_private.alq_firma_v1(p_operacion,v_payload),'preparada',v_actor,
      clock_timestamp());
    v_result:=alq_private.alq_aplicar_operacion_v1(
      p_operacion,v_payload,v_op,v_actor);
    select min(evento),count(*)=1 and bool_and(
      entidad='operacion' and entidad_id=v_op and evento=v_evento_esperado
      and actor=v_actor and antes is null and despues=v_result)
      into v_evento_observado,v_journal_ok
    from alq.alq_journal where operacion_id=v_op;
    select count(*)=1 and bool_and(
      t.direccion='salida' and t.ambito='custodiada' and t.moneda='ARS'
      and t.monto=10 and a.rendicion_id=v_rendicion
      and a.importe_origen=10 and a.importe_destino=10
      and a.moneda_origen='ARS' and a.moneda_destino='ARS')
      into v_efecto_ok
    from alq.alq_transaccion_caja t
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    where t.operacion_id=v_op and a.operacion_id=v_op;
    set constraints all immediate;
    if not coalesce(v_journal_ok,false)
       or not coalesce(v_efecto_ok,false)
       or v_result->>'operacion'<>v_evento_esperado then
      raise exception using errcode='ZX032',message='ALQ_F1A_V1_GIRO_ORACULO_FALLO';
    end if;
    raise exception using errcode='ZX031',message='ALQ_F1A_V1_GIRO_PASS_ROLLBACK';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    if v_state='ZX031' and v_message='ALQ_F1A_V1_GIRO_PASS_ROLLBACK' then
      v_pass:=true; v_state:='00000'; v_message:='ALQ_F1A_V1_GIRO_PASS';
    end if;
  end;
  insert into pg_temp.alq_f1a_v1_giro_result(
    ordinal,operacion,estado_test,sqlstate,mensaje,evidencia)
  values (p_ordinal,p_operacion,case when v_pass then 'PASS' else 'FAIL' end,
    v_state,v_message,jsonb_build_object(
      'evento_esperado_derivado',v_evento_esperado,
      'evento_observado',v_evento_observado,
      'journal_exacto',v_journal_ok,'efecto_exacto',v_efecto_ok));
end
$f1a_giro_v1_local$;

create function pg_temp.alq_f1a_ejecutar_state_local_full()
returns void language plpgsql security invoker set search_path=''
as $f1a_state_local_full$
declare
  v_f jsonb; v_payload1 jsonb; v_payload2 jsonb; v_bad_payload jsonb;
  v_p1 jsonb; v_p1_replay jsonb; v_a1 jsonb; v_a1_replay jsonb;
  v_p2 jsonb; v_c2 jsonb; v_c2_replay jsonb; v_bad jsonb; v_bad_replay jsonb;
  v_prepare_ok boolean:=false; v_prepare_replay_ok boolean:=false;
  v_apply_ok boolean:=false; v_apply_replay_ok boolean:=false;
  v_cancel_ok boolean:=false; v_cancel_replay_ok boolean:=false;
  v_reject_ok boolean:=false; v_conflict boolean:=false;
  v_cardinality_ok boolean:=false; v_constraints_ok boolean:=false;
  v_pass boolean:=false;
  v_state text:='00000'; v_message text:='ALQ_F1A_STATE_LOCAL_FULL_PASS';
  v_prepare_cmd constant uuid:='f1af1000-0000-4000-8000-000000000001';
  v_apply_cmd constant uuid:='f1af1000-0000-4000-8000-000000000002';
  v_prepare_cancel_cmd constant uuid:='f1af1000-0000-4000-8000-000000000003';
  v_cancel_cmd constant uuid:='f1af1000-0000-4000-8000-000000000004';
  v_bad_cmd constant uuid:='f1af1000-0000-4000-8000-000000000005';
begin
  begin
    v_f:=pg_temp.alq_d0_fixture('STATE_MACHINE_LOCAL_FULL');
    v_payload1:=jsonb_build_object(
      'cargo_fuente_ref','f1af2000-0000-4000-8000-000000000001',
      'propiedad_id',v_f->>'prop_a','contrato_id',v_f->>'contract_a',
      'periodo_id',v_f->>'period_a','deudor_parte_id',v_f->>'tenant_a',
      'acreedor_parte_id',v_f->>'owner_a','ambito','externa',
      'concepto','alquiler_periodo','moneda','ARS','monto',100,
      'vence_at','2026-01-10T12:00:00Z',
      'snapshot_regla',jsonb_build_object('f1a',true));
    v_p1:=public.alq_admin_preparar_v2(v_prepare_cmd,'cargo_manual_emitir',v_payload1);
    v_p1_replay:=public.alq_admin_preparar_v2(
      v_prepare_cmd,'cargo_manual_emitir',v_payload1);
    v_prepare_ok:=coalesce(v_p1->>'estado'='preparada'
      and (v_p1->>'ok')::boolean is true
      and v_p1->>'comando_request_id'=v_prepare_cmd::text,false);
    v_prepare_replay_ok:=v_p1 is not distinct from v_p1_replay;
    if not v_prepare_ok or not v_prepare_replay_ok then
      raise exception using errcode='ZX022',message='ALQ_F1A_STATE_PREPARE_REPLAY_FALLO';
    end if;

    v_a1:=public.alq_admin_aplicar_v2((v_p1->>'operacion_request_id')::uuid,
      v_apply_cmd,'cargo_manual_emitir',v_p1->>'firma',v_payload1);
    v_a1_replay:=public.alq_admin_aplicar_v2((v_p1->>'operacion_request_id')::uuid,
      v_apply_cmd,'cargo_manual_emitir',v_p1->>'firma',v_payload1);
    v_apply_ok:=coalesce(v_a1->>'estado'='aplicada'
      and (v_a1->>'ok')::boolean is true
      and v_a1->>'comando_request_id'=v_apply_cmd::text,false);
    v_apply_replay_ok:=v_a1 is not distinct from v_a1_replay;
    if not v_apply_ok or not v_apply_replay_ok then
      raise exception using errcode='ZX023',message='ALQ_F1A_STATE_APPLY_REPLAY_FALLO';
    end if;

    v_payload2:=v_payload1||jsonb_build_object(
      'cargo_fuente_ref','f1af2000-0000-4000-8000-000000000002','monto',101);
    v_p2:=public.alq_admin_preparar_v2(
      v_prepare_cancel_cmd,'cargo_manual_emitir',v_payload2);
    v_c2:=public.alq_admin_cancelar_v2((v_p2->>'operacion_request_id')::uuid,
      v_cancel_cmd,'cancelacion local explicita');
    v_c2_replay:=public.alq_admin_cancelar_v2((v_p2->>'operacion_request_id')::uuid,
      v_cancel_cmd,'cancelacion local explicita');
    v_cancel_ok:=coalesce(v_c2->>'estado'='rechazada'
      and v_c2->>'codigo'='ALQ_F1A_CANCELADA'
      and v_c2->>'comando_request_id'=v_cancel_cmd::text,false);
    v_cancel_replay_ok:=v_c2 is not distinct from v_c2_replay;
    if not v_cancel_ok or not v_cancel_replay_ok then
      raise exception using errcode='ZX024',message='ALQ_F1A_STATE_CANCEL_REPLAY_FALLO';
    end if;

    v_bad_payload:=jsonb_build_object(
      'nota_ref','f1af2000-0000-4000-8000-000000000003',
      'tipo','credito','cargo_id',v_f->>'cargo_ars_a','monto',10,'moneda','USD',
      'motivo','prevalidacion local','fecha','2026-01-08T12:00:00Z');
    v_bad:=public.alq_admin_preparar_v2(v_bad_cmd,'nota_emitir',v_bad_payload);
    v_bad_replay:=public.alq_admin_preparar_v2(v_bad_cmd,'nota_emitir',v_bad_payload);
    v_reject_ok:=coalesce(v_bad is not distinct from v_bad_replay
      and v_bad->>'estado'='rechazada_sin_fila'
      and v_bad->>'codigo'='ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE'
      and not (v_bad ? 'hecho_id') and not (v_bad ? 'operacion_id'),false);
    if not v_reject_ok then
      raise exception using errcode='ZX025',message='ALQ_F1A_STATE_RECHAZO_SIN_FILA_FALLO';
    end if;

    begin
      perform public.alq_admin_preparar_v2(v_prepare_cmd,'cargo_manual_emitir',
        v_payload1||jsonb_build_object('monto',102));
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message=message_text;
      v_conflict:=v_message='ALQ_F1A_COMANDO_CONFLICTO';
    end;
    if not v_conflict then
      raise exception using errcode='ZX026',message='ALQ_F1A_STATE_COMANDO_CONFLICTO_FALLO';
    end if;

    v_cardinality_ok:=(select count(*) from alq_private.alq_hecho_idempotente_v2
        where id in ((v_p1->>'hecho_id')::uuid,(v_p2->>'hecho_id')::uuid))=2
      and (select count(*) from alq.alq_operacion
           where id in ((v_p1->>'operacion_id')::uuid,(v_p2->>'operacion_id')::uuid)
             and estado in ('aplicada','rechazada'))=2
      and (select count(*) from alq_private.alq_operacion_evento_v2
           where comando_request_id in (v_prepare_cmd,v_apply_cmd,
             v_prepare_cancel_cmd,v_cancel_cmd,v_bad_cmd)
             and run_id=(select run_id
               from pg_temp.alq_f1a_qualification_context))=5;
    if not v_cardinality_ok then
      raise exception using errcode='ZX027',message='ALQ_F1A_STATE_CARDINALIDAD_FALLO';
    end if;
    set constraints all immediate;
    v_constraints_ok:=true;
    raise exception using errcode='ZX021',message='ALQ_F1A_STATE_PASS_ROLLBACK';
  exception when others then
    get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
    if v_state='ZX021' and v_message='ALQ_F1A_STATE_PASS_ROLLBACK' then
      v_pass:=true; v_state:='00000'; v_message:='ALQ_F1A_STATE_LOCAL_FULL_PASS';
    end if;
  end;

  insert into pg_temp.alq_f1a_state_result(caso,estado_test,evidencia)
  select x.caso,case when x.ok then 'PASS' else 'FAIL' end,
    jsonb_build_object('sqlstate',v_state,'mensaje',v_message,
      'check_observado',x.check_observado,'cardinalidad',v_cardinality_ok,
      'constraints_immediate',v_constraints_ok,'suite_completa',v_pass,
      'modo','local_full','qualification_run_id',(select run_id
        from pg_temp.alq_f1a_qualification_context))
  from (values
    ('PREPARAR_APLICAR_DOS_TRANSACCIONES_LOGICAS',
      v_prepare_ok and v_apply_ok and v_cardinality_ok and v_constraints_ok and v_pass,
      v_prepare_ok and v_apply_ok),
    ('REPLAY_COMANDO_MISMO_ENVELOPE',
      v_prepare_replay_ok and v_apply_replay_ok and v_cardinality_ok
        and v_constraints_ok and v_pass,v_prepare_replay_ok and v_apply_replay_ok),
    ('CANCELAR_REPLAY_TERMINAL',
      v_cancel_ok and v_cancel_replay_ok and v_cardinality_ok
        and v_constraints_ok and v_pass,v_cancel_ok and v_cancel_replay_ok),
    ('RECHAZO_PREVALIDACION_SIN_FILA',
      v_reject_ok and v_cardinality_ok and v_constraints_ok and v_pass,v_reject_ok),
    ('COMANDO_REUTILIZADO_CONFLICTO',
      v_conflict and v_cardinality_ok and v_constraints_ok and v_pass,v_conflict)
  ) as x(caso,ok,check_observado);
end
$f1a_state_local_full$;

select pg_temp.alq_f1a_actor_fixture();
create temporary table alq_f1a_qualification_context (
  run_id uuid primary key
) on commit drop;
insert into pg_temp.alq_f1a_qualification_context(run_id)
values (:'RUN_ID'::uuid);
select set_config('alq.f1a_forward_prevalidate_only','off',true);
truncate table pg_temp.alq_f1a_valid_result,
  pg_temp.alq_f1a_state_result,pg_temp.alq_d0_case_ctx;

select pg_temp.alq_f1a_ejecutar_giro_v1_local(1,'giro_registrar');
select pg_temp.alq_f1a_ejecutar_giro_v1_local(2,'giro_a_propietario');
select pg_temp.alq_f1a_ejecutar_valido_local_full(
  s.ordinal,s.caso,s.action_sql,s.oracle_sql,s.expected_gate)
from pg_temp.alq_f1a_valid_spec s
order by s.ordinal;
select pg_temp.alq_f1a_ejecutar_state_local_full();
select pg_temp.alq_f1a_actor_cleanup();

select 'ALQ_F1A_LOCAL_DIAG_V1_GIRO|'||coalesce(jsonb_agg(jsonb_build_object(
  'operacion',operacion,'estado_test',estado_test,'sqlstate',sqlstate,
  'mensaje',mensaje,'evidencia',evidencia) order by ordinal),'[]'::jsonb)::text
from pg_temp.alq_f1a_v1_giro_result;

do $f1a_local_full_post$
begin
  if (select count(*) from pg_temp.alq_f1a_valid_result)<>14
     or exists (select 1 from pg_temp.alq_f1a_valid_result where estado_test<>'PASS') then
    raise exception 'ALQ_F1A_LOCAL_FULL_VALIDOS_FALLARON';
  end if;
  if (select count(*) from pg_temp.alq_f1a_state_result)<>5
     or exists (select 1 from pg_temp.alq_f1a_state_result
       where estado_test<>'PASS' or evidencia->>'modo'<>'local_full') then
    raise exception 'ALQ_F1A_LOCAL_FULL_STATE_FALLO';
  end if;
  if (select count(*) from pg_temp.alq_f1a_v1_giro_result)<>2
     or exists (select 1 from pg_temp.alq_f1a_v1_giro_result
       where estado_test<>'PASS'
          or evidencia->>'evento_esperado_derivado'<>'giro_a_propietario'
          or evidencia->>'evento_observado'<>'giro_a_propietario') then
    raise exception 'ALQ_F1A_LOCAL_V1_GIROS_FALLARON';
  end if;
  if alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F1A_LOCAL_FULL_ASSERT_GLOBAL_FALLO';
  end if;
end
$f1a_local_full_post$;

select 'ALQ_F1A_LOCAL_SQL_RECEIPT|'||jsonb_build_object(
  'schema_version',1,
  'status','ALQ_F1A_LOCAL_SQL_PASS',
  'run_id',:'RUN_ID',
  'integrity_cases',(select count(*) from pg_temp.alq_d0_resultado),
  'nominal_rejections',(select count(*) from pg_temp.alq_d0_resultado
    where caso not in ('TCTRL','RCTRL','ACTRL')),
  'legacy_controls',(select count(*) from pg_temp.alq_d0_resultado
    where caso in ('TCTRL','RCTRL','ACTRL')),
  'invalid_probes',(select count(*) from pg_temp.alq_d0_resultado
    where estado_test='SONDA_INVALIDA'),
  'valid_cases',(select count(*) from pg_temp.alq_f1a_valid_result
    where estado_test='PASS'),
  'v1_giro_cases',(select count(*) from pg_temp.alq_f1a_v1_giro_result
    where estado_test='PASS'),
  'state_machine_pass',(select count(*)=5 and bool_and(estado_test='PASS')
    from pg_temp.alq_f1a_state_result),
  'rls_pass',(select count(*)=10 and bool_and(estado_test='PASS')
    from pg_temp.alq_f1a_rls_result),
  'cleanup_residual_rows',(select count(*) from (
    select coalesce(a.tabla,b.tabla) as tabla
    from (select * from pg_temp.alq_d0_snapshot where fase='PRE') a
    full join (select * from pg_temp.alq_d0_snapshot where fase='POST') b
      on b.tabla=a.tabla
    where a.tabla is null or b.tabla is null
      or a.filas<>b.filas or a.sha256<>b.sha256) deriva),
  'assert_global_ok',alq_private.alq_assert_global_v1()='ALQ_ASSERT_GLOBAL_OK',
  'target','fixture PostgreSQL 17.6 local descartable',
  'channel','psql local por socket Unix sin red',
  'outer_rollback',true,
  'journal_identity_disposable_fixture_only',true,
  'motor_modified',false,
  'cases_total',(select count(*) from pg_temp.alq_d0_resultado),
  'aceptados_indebidamente',(select count(*) from pg_temp.alq_d0_resultado where sqlstate='00000'),
  'rechazados',(select count(*) from pg_temp.alq_d0_resultado where resultado='RECHAZADO'),
  'sondas_invalidas',(select count(*) from pg_temp.alq_d0_resultado where estado_test='SONDA_INVALIDA'),
  'pre_post_tables',(select count(*) from pg_temp.alq_d0_snapshot where fase='PRE'),
  'pre_sha256',encode(extensions.digest(convert_to((select jsonb_agg(
    jsonb_build_object('tabla',tabla,'filas',filas,'sha256',sha256) order by tabla)::text
    from pg_temp.alq_d0_snapshot where fase='PRE'),'UTF8'),'sha256'),'hex'),
  'post_sha256',encode(extensions.digest(convert_to((select jsonb_agg(
    jsonb_build_object('tabla',tabla,'filas',filas,'sha256',sha256) order by tabla)::text
    from pg_temp.alq_d0_snapshot where fase='POST'),'UTF8'),'sha256'),'hex'),
  'catalogo_v1',cardinality(alq_private.alq_operaciones_v1()),
  'catalogo_v2',cardinality(alq_private.alq_f1a_operaciones_v2()),
  'results',(select jsonb_agg(to_jsonb(r) order by r.ordinal)
    from pg_temp.alq_d0_resultado r),
  'valid_results',(select jsonb_agg(to_jsonb(r) order by r.ordinal)
    from pg_temp.alq_f1a_valid_result r),
  'v1_giro_results',(select jsonb_agg(to_jsonb(r) order by r.ordinal)
    from pg_temp.alq_f1a_v1_giro_result r),
  'state_results',(select jsonb_agg(to_jsonb(r) order by r.caso)
    from pg_temp.alq_f1a_state_result r),
  'rls_results',(select jsonb_agg(to_jsonb(r) order by r.caso)
    from pg_temp.alq_f1a_rls_result r)
)::text as alq_f1a_local_sql_receipt;

rollback;
