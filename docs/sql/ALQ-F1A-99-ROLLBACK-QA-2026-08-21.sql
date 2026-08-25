-- ALQ F1-A · 99 ROLLBACK QA · ARTEFACTO SELLABLE, NO EJECUTABLE
-- will_execute=false
--
-- Este archivo no forma parte del flujo normal. Sólo puede convertirse en una
-- migración nueva después de una autorización nueva, nueva auditoría y cambio
-- explícito de v_will_execute. El cambio altera su SHA y obliga a volver a
-- sellar todos los bytes. Nunca se ejecuta como SQL directo.
--
-- ADVERTENCIA: restaurar V1 reabre deliberadamente los 14 rojos diagnosticados
-- por D0. El camino preferido después de un commit F1-A es fail-forward.
--
-- Autoridad forward que este artefacto sabe retirar:
-- supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql
-- SHA-256 d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701
-- Baseline de restauración:
-- supabase/baselines/alq_v1_qa_adoptado_20260821.sql
--
-- La transacción exterior pertenece a Supabase apply_migration. No se emiten
-- sentencias top-level de control transaccional, no hay CASCADE, setval ni DML
-- sobre historial de migraciones, journal o ledger.

set local search_path=pg_catalog,public,extensions;
set local quote_all_identifiers=off;
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local bytea_output='hex';
set local lock_timeout='5s';
set local statement_timeout='180s';

-- Compuerta física de autorización. Está antes de cualquier DDL del rollback.
do $alq_f1a_rollback_authorization$
declare
  v_will_execute constant boolean:=false;
begin
  if not v_will_execute then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_WILL_EXECUTE_FALSE';
  end if;
end
$alq_f1a_rollback_authorization$;

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'alq_f1a_99_rollback_qa',0));

-- Todas las condiciones destructivas se demuestran antes del primer DROP,
-- ALTER, CREATE OR REPLACE o REVOKE del rollback.
do $alq_f1a_rollback_precheck$
declare
  v_source_sha constant text:=
    'd05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701';
  v_migration_version text;
  v_statements_sha text;
  v_restored_executor text;
  v_executor text;
  v_expected_columns text[]:=array[
    'alq_operacion.expires_at:timestamptz',
    'alq_operacion.hecho_id:uuid',
    'alq_operacion.intento:integer',
    'alq_transaccion_caja.cuenta_validacion_version:smallint',
    'alq_transaccion_caja.cuenta_validada_activa_at:timestamptz']::text[];
  v_observed_columns text[];
begin
  if current_database() is distinct from 'postgres'
     or current_user is distinct from 'postgres'
     or session_user is distinct from 'postgres'
     or current_setting('server_version_num') is distinct from '170006'
     or current_setting('application_name') is distinct from 'Supavisor'
     or (select count(*) from private.qa_marca_descartable m
         where m.singleton and m.project_ref='rsjwqmpseknvydistgfr')<>1
     or (select coalesce(array_agg(etapa order by etapa),array[]::text[])
         from private.alq_instalacion_etapas_v1)
        <>array['A','B','C','D','PRE']::text[] then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_DESTINO_O_RUNTIME_INVALIDO';
  end if;

  if (select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq' and c.relkind in ('r','p'))<>46
     or (select count(*) from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='v'
           and c.relname like 'alq\_v\_%' escape '\')<>24
     or (select count(*) from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='alq' and c.relkind='v'
           and c.relname in ('alq_v_comunicados_propietario',
             'alq_v_estado_cartera','alq_v_propiedades_propietario'))<>3
     or cardinality(alq_private.alq_operaciones_v1())<>45
     or (select count(*) from alq.alq_operacion where estado='aplicada')<>112
     or exists (select 1 from alq.alq_operacion where estado='preparada')
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK'
     or alq_private.alq_assert_financiero_f1a_v1()<>'ALQ_ASSERT_FINANCIERO_F1A_OK' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_BASELINE_DERIVADO';
  end if;

  -- La fila F1-A debe ser única, la última migración confirmada y contener los
  -- bytes exactos sellados. No se borra ni modifica esta fila: el rollback, si
  -- alguna vez se autoriza, se registra como una migración posterior.
  select m.version,
         encode(extensions.digest(convert_to(
           pg_catalog.array_to_string(m.statements,E'\n'),'UTF8'),'sha256'),'hex')
    into v_migration_version,v_statements_sha
  from supabase_migrations.schema_migrations m
  where m.name='alq_f1a_guardas_financieras_y_metodo';
  if not found
     or (select count(*) from supabase_migrations.schema_migrations
         where name='alq_f1a_guardas_financieras_y_metodo')<>1
     or v_statements_sha is distinct from v_source_sha
     or v_migration_version is distinct from
       (select max(version) from supabase_migrations.schema_migrations) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_MIGRACION_NO_ES_ULTIMA_O_BYTES_DERIVADOS';
  end if;

  if to_regclass('alq_private.alq_hecho_idempotente_v2') is null
     or to_regclass('alq_private.alq_operacion_evento_v2') is null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_aplicar_v2(uuid,uuid,text,text,jsonb)') is null
     or to_regprocedure('public.alq_admin_cancelar_v2(uuid,uuid,text)') is null
     or to_regprocedure('public.alq_admin_reintentar_v2(uuid,uuid,text)') is null
     or to_regprocedure('alq_private.alq_admin_preparar_core_v2(uuid,text,jsonb)') is null
     or to_regprocedure('alq_private.alq_admin_aplicar_core_v2(uuid,uuid,text,text,jsonb)') is null
     or to_regprocedure('alq_private.alq_admin_cancelar_core_v2(uuid,uuid,text)') is null
     or to_regprocedure('alq_private.alq_admin_reintentar_core_v2(uuid,uuid,text)') is null then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_IDENTIDAD_OBJETOS_INCOMPLETA';
  end if;

  select coalesce(array_agg(format('%s.%s:%s',c.relname,a.attname,
           pg_catalog.format_type(a.atttypid,a.atttypmod)) order by c.relname,a.attname),
           array[]::text[])
    into v_observed_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='alq' and ((c.relname='alq_operacion' and a.attname in
      ('hecho_id','intento','expires_at')) or
    (c.relname='alq_transaccion_caja' and a.attname in
      ('cuenta_validacion_version','cuenta_validada_activa_at')))
    and a.attnum>0 and not a.attisdropped;
  if v_observed_columns is distinct from v_expected_columns then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_COLUMNAS_DERIVADAS';
  end if;

  -- Cero uso real de F1-A. No se borra evidencia ni se nullean columnas para
  -- fabricar compatibilidad.
  if exists (select 1 from alq_private.alq_hecho_idempotente_v2)
     or exists (select 1 from alq_private.alq_operacion_evento_v2)
     or exists (select 1 from alq.alq_operacion
       where hecho_id is not null or intento is not null or expires_at is not null)
     or exists (select 1 from alq.alq_transaccion_caja
       where cuenta_validacion_version is not null
          or cuenta_validada_activa_at is not null) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_USO_DETECTADO';
  end if;

  -- La reconstrucción del executor debe ser exactamente la definición V1 del
  -- baseline. Esto valida a la vez el parche vigente y la reversibilidad.
  v_executor:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_restored_executor:=pg_catalog.replace(v_executor,
    E'\n  perform alq_private.alq_f1a_writer_context_v1(''enter'',p_operacion_id);\n  perform alq_private.alq_f1a_lock_revalidar_payload_v1(p_operacion,p_payload);',
    '');
  v_restored_executor:=pg_catalog.replace(v_restored_executor,
    E'\n  perform alq_private.alq_f1a_writer_context_v1(''exit'',p_operacion_id);\n  return v_result;',
    E'\n  return v_result;');
  if v_restored_executor is not distinct from v_executor
     or encode(extensions.digest(convert_to(v_restored_executor,'UTF8'),'sha256'),'hex')
       is distinct from 'ff5368d253119830d048f372d3cfdef80354676b4eab9d7ff8a7617bd0ce2d23' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_EJECUTOR_NO_RESTAURABLE_EXACTO';
  end if;

  -- No se admite ninguna migración posterior. Como defensa contra DDL manual,
  -- también se rechazan consumidores no F1-A que nombren RPC, tablas o columnas
  -- nuevas; los DROP posteriores siguen usando RESTRICT.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where not (n.nspname='public' and p.proname in
             ('alq_admin_preparar_v2','alq_admin_aplicar_v2',
              'alq_admin_cancelar_v2','alq_admin_reintentar_v2'))
      and not (n.nspname='alq_private' and
        (p.proname like 'alq\_f1a\_%' escape '\'
         or p.proname like '%\_f1a\_v%' escape '\'
         or p.proname in ('alq_admin_preparar_core_v2','alq_admin_aplicar_core_v2',
           'alq_admin_cancelar_core_v2','alq_admin_reintentar_core_v2',
           'alq_operacion_estado_guard_f1a_v2','alq_operacion_aplicada_gate_f1a_v2',
           'alq_evento_consistencia_f1a_v2','alq_hecho_consistencia_f1a_v2',
           'alq_hecho_guard_f1a_v2','alq_evento_guard_f1a_v2',
           'alq_assert_global_pre_f1a_v1','alq_assert_global_v1',
           'alq_sanear_preparadas_v2','alq_preparadas_estado_v2')))
      and pg_catalog.pg_get_functiondef(p.oid) ~
        '(alq_admin_(preparar|aplicar|cancelar|reintentar)_v2|alq_hecho_idempotente_v2|alq_operacion_evento_v2|cuenta_validacion_version|cuenta_validada_activa_at|\mhecho_id\M|\mintento\M|\mexpires_at\M)') then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_DEPENDENCIA_POSTERIOR_FUNCION';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('v','m')
      and pg_catalog.pg_get_viewdef(c.oid,true) ~
        '(alq_hecho_idempotente_v2|alq_operacion_evento_v2|cuenta_validacion_version|cuenta_validada_activa_at|\mhecho_id\M|\mintento\M|\mexpires_at\M)') then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_DEPENDENCIA_POSTERIOR_VISTA';
  end if;
end
$alq_f1a_rollback_precheck$;

-- Foto PRE transaccional, tomada sólo después de cerrar autorización, destino,
-- bytes, cero uso y dependencias. Se compara al final; no persiste.
create temporary table alq_f1a_rollback_pre_data (
  tabla text primary key,
  filas bigint not null,
  sha256 text not null
) on commit drop;

do $alq_f1a_rollback_snapshot_pre$
declare r record; v_projection text;
begin
  for r in
    select c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq' and c.relkind in ('r','p') order by c.relname
  loop
    v_projection:=case r.relname
      when 'alq_operacion' then
        'to_jsonb(t)-''hecho_id''-''intento''-''expires_at'''
      when 'alq_transaccion_caja' then
        'to_jsonb(t)-''cuenta_validacion_version''-''cuenta_validada_activa_at'''
      else 'to_jsonb(t)' end;
    execute format(
      'insert into pg_temp.alq_f1a_rollback_pre_data(tabla,filas,sha256) '
      'select %L,count(*),encode(extensions.digest(convert_to(coalesce('
      'string_agg((%s)::text,E''\\n'' order by (%s)::text),''''),''UTF8''),''sha256''),''hex'') '
      'from alq.%I t',r.relname,v_projection,v_projection,r.relname);
  end loop;
end
$alq_f1a_rollback_snapshot_pre$;

create temporary table alq_f1a_rollback_pre_sequences on commit drop as
select c.oid::regclass::text as secuencia,
       pg_catalog.pg_sequence_last_value(c.oid) as last_value
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='alq' and c.relkind='S';

-- --------------------------------------------------------------------------
-- Retiro en orden RESTRICT. Ningún paso borra datos ni historial.
-- --------------------------------------------------------------------------

-- Triggers F1-A: primero se retiran todos los consumidores de funciones.
do $alq_f1a_rollback_drop_triggers$
declare r record; v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='alq' and (
    t.tgname like 'alq\_f1a\_%' escape '\' or t.tgname in (
      'alq_operacion_estado_guard_biud','alq_operacion_aplicada_gate_ct',
      'alq_operacion_hecho_consistencia_ct','alq_hecho_aplicada_consistencia_ct',
      'alq_evento_consistencia_ct','alq_hecho_inmutable_bud','alq_evento_append_only_bud',
      'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu',
      'alq_nota_financiera_ct','alq_credito_consumo_financiero_ct','alq_cargo_grafo_ct',
      'alq_deposito_evento_saldo_ct','alq_deposito_liquidacion_saldo_ct',
      'alq_deposito_linea_saldo_ct','alq_cuenta_raiz_inmutable_bu',
      'alq_contrato_raiz_inmutable_bu','alq_periodo_raiz_inmutable_bu',
      'alq_garantia_raiz_inmutable_bu','alq_garantia_delete_guard_bd',
      'alq_deposito_raiz_inmutable_bu','alq_credito_raiz_inmutable_bu',
      'alq_conversion_raiz_inmutable_bu','alq_cargo_raiz_inmutable_bu',
      'alq_transaccion_raiz_inmutable_bu','alq_aplicacion_raiz_inmutable_bu'));
  if v_count<>86 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_INVENTARIO_TRIGGER_DERIVADO';
  end if;
  for r in
    select n.nspname,c.relname,t.tgname
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='alq' and (
      t.tgname like 'alq\_f1a\_%' escape '\' or t.tgname in (
        'alq_operacion_estado_guard_biud','alq_operacion_aplicada_gate_ct',
        'alq_operacion_hecho_consistencia_ct','alq_hecho_aplicada_consistencia_ct',
        'alq_evento_consistencia_ct','alq_hecho_inmutable_bud','alq_evento_append_only_bud',
        'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu',
        'alq_nota_financiera_ct','alq_credito_consumo_financiero_ct','alq_cargo_grafo_ct',
        'alq_deposito_evento_saldo_ct','alq_deposito_liquidacion_saldo_ct',
        'alq_deposito_linea_saldo_ct','alq_cuenta_raiz_inmutable_bu',
        'alq_contrato_raiz_inmutable_bu','alq_periodo_raiz_inmutable_bu',
        'alq_garantia_raiz_inmutable_bu','alq_garantia_delete_guard_bd',
        'alq_deposito_raiz_inmutable_bu','alq_credito_raiz_inmutable_bu',
        'alq_conversion_raiz_inmutable_bu','alq_cargo_raiz_inmutable_bu',
        'alq_transaccion_raiz_inmutable_bu','alq_aplicacion_raiz_inmutable_bu'))
    order by t.tgname
  loop
    execute format('drop trigger %I on %I.%I',r.tgname,r.nspname,r.relname);
  end loop;
end
$alq_f1a_rollback_drop_triggers$;

-- Restauración exacta del executor V1 mediante inversión verificada del único
-- parche textual F1-A; el SHA resultante es el SHA pg_get_functiondef baseline.
do $alq_f1a_rollback_restore_executor$
declare v_def text; v_restored text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_restored:=pg_catalog.replace(v_def,
    E'\n  perform alq_private.alq_f1a_writer_context_v1(''enter'',p_operacion_id);\n  perform alq_private.alq_f1a_lock_revalidar_payload_v1(p_operacion,p_payload);','');
  v_restored:=pg_catalog.replace(v_restored,
    E'\n  perform alq_private.alq_f1a_writer_context_v1(''exit'',p_operacion_id);\n  return v_result;',
    E'\n  return v_result;');
  if encode(extensions.digest(convert_to(v_restored,'UTF8'),'sha256'),'hex')
     is distinct from 'ff5368d253119830d048f372d3cfdef80354676b4eab9d7ff8a7617bd0ce2d23' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_EJECUTOR_RESTAURADO_NO_BASELINE';
  end if;
  execute v_restored;
end
$alq_f1a_rollback_restore_executor$;

-- Las demás definiciones V1 restauradas abajo son copia literal de
-- supabase/baselines/alq_v1_qa_adoptado_20260821.sql.

create or replace function alq_private.alq_admin_aplicar_core_v1(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) returns jsonb
    language plpgsql security definer
    set search_path to ''
    as $$
declare v_op alq.alq_operacion%rowtype; v_actor uuid; v_result jsonb;
begin
  v_actor:=alq_private.alq_actor_v1(true);
  select * into v_op from alq.alq_operacion where request_id=p_request_id for update;
  if not found then raise exception 'ALQ_REQUEST_NO_PREPARADO'; end if;
  if v_op.operacion<>p_operacion or v_op.payload_normalizado<>coalesce(p_payload,'{}'::jsonb)
     or v_op.firma_sha256<>p_firma
     or p_firma<>alq_private.alq_firma_v1(p_operacion,coalesce(p_payload,'{}'::jsonb)) then
    raise exception 'ALQ_FIRMA_O_PAYLOAD_NO_COINCIDE';
  end if;
  if v_op.actor_parte_usuario_id<>v_actor then raise exception 'ALQ_ACTOR_DISTINTO_AL_PREPARADOR'; end if;
  if v_op.estado='aplicada' then return v_op.resultado; end if;
  if v_op.estado<>'preparada' then raise exception 'ALQ_OPERACION_NO_APLICABLE:%',v_op.estado; end if;
  v_result:=alq_private.alq_aplicar_operacion_v1(p_operacion,v_op.payload_normalizado,v_op.id,v_actor);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,aplicada_at=clock_timestamp()
    where id=v_op.id;
  return v_result;
end
$$;

create or replace function alq_private.alq_assert_global_v1() returns text
    language plpgsql stable security definer
    set search_path to ''
    as $$
begin
  if exists (select 1 from alq.alq_transaccion_caja t where
    (select coalesce(sum(a.importe_origen),0) from alq.alq_aplicacion a where a.transaccion_id=t.id)>t.monto)
  then raise exception 'ALQ_ASSERT_I1'; end if;
  if exists (select 1 from alq.alq_aplicacion a
    join alq.alq_transaccion_caja t on t.id=a.transaccion_id
    left join alq.alq_cargo c on c.id=a.cargo_id
    left join alq.alq_credito cr on cr.id=a.credito_id
    left join alq.alq_rendicion r on r.id=a.rendicion_id
    left join alq.alq_deposito_evento de on de.id=a.deposito_evento_id
    where t.estado<>'confirmada' or a.moneda_origen<>t.moneda
      or (a.conversion_id is null and a.importe_origen<>a.importe_destino)
      or (c.id is not null and (t.direccion<>'entrada' or a.moneda_destino<>c.moneda))
      or (cr.id is not null and (t.direccion<>'salida' or a.moneda_destino<>cr.moneda))
      or (r.id is not null and (t.direccion<>'salida' or a.moneda_destino<>r.moneda
        or r.estado not in ('emitida','corregida')))
      or (de.id is not null and a.moneda_destino<>de.moneda))
  then raise exception 'ALQ_ASSERT_APLICACIONES_INVALIDAS'; end if;
  if exists (select 1 from alq.alq_cargo c where c.saldo_pendiente<>
    c.monto-coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a where a.cargo_id=c.id),0)
    -coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.cargo_id=c.id),0)
    -coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='credito'),0)
    +coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='debito'),0)
    +coalesce((select sum(ar.importe_destino_reabierto) from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id where a.cargo_id=c.id),0))
  then raise exception 'ALQ_ASSERT_SALDO_CARGO'; end if;
  if exists (select 1 from alq.alq_credito cr where cr.saldo_pendiente<>
    cr.monto_original-coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.credito_id=cr.id),0)
    -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a join alq.alq_transaccion_caja t on t.id=a.transaccion_id
      where a.credito_id=cr.id and t.direccion='salida' and t.estado='confirmada'),0)
    +coalesce((select sum(ar.importe_destino_reabierto) from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id where a.credito_id=cr.id),0))
  then raise exception 'ALQ_ASSERT_SALDO_CREDITO'; end if;
  if exists (select 1 from alq.alq_transaccion_caja where transferencia_id is not null group by transferencia_id
    having count(*)<>2 or count(distinct direccion)<>2 or count(distinct monto)<>1
      or count(distinct moneda)<>1 or count(distinct cuenta_custodia_id)<>2)
  then raise exception 'ALQ_ASSERT_I9'; end if;
  if exists (select 1 from alq.alq_rendicion r where r.estado in ('emitida','corregida') and
    (exists (select 1 from alq.alq_rendicion_linea l where l.rendicion_id=r.id and l.moneda<>r.moneda)
     or r.saldo_final<>r.saldo_inicial+coalesce((select sum(l.monto*l.signo)
        from alq.alq_rendicion_linea l where l.rendicion_id=r.id),0)))
  then raise exception 'ALQ_ASSERT_I10'; end if;
  if exists (select 1 from alq.alq_rendicion r where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a where a.rendicion_id=r.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.rendicion_id=r.id)>greatest(r.saldo_final,0))
  then raise exception 'ALQ_ASSERT_GIROS_RENDICION'; end if;
  if exists (select 1 from alq.alq_deposito_evento de where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a
      where a.deposito_evento_id=de.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.deposito_evento_id=de.id)>de.monto)
  then raise exception 'ALQ_ASSERT_APLICACION_DEPOSITO'; end if;
  if exists (select 1 from alq.alq_servicio_factura f join alq.alq_cargo c on c.id=f.cargo_id
    where f.saldada is distinct from (c.saldo_pendiente=0)
      or f.propiedad_id<>c.propiedad_id or f.moneda<>c.moneda or f.monto<>c.monto)
  then raise exception 'ALQ_ASSERT_SERVICIO_PROYECCION'; end if;
  return 'ALQ_ASSERT_GLOBAL_OK';
end
$$;

create or replace function alq_private.alq_constraint_check_v1() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  if tg_table_name='alq_transaccion_caja' then
    if coalesce(new.transferencia_id,old.transferencia_id) is not null then
      perform alq_private.alq_validar_transferencia_v1(coalesce(new.transferencia_id,old.transferencia_id));
    end if;
    if coalesce(new.reversa_de,old.reversa_de) is not null then
      perform alq_private.alq_validar_reversa_v1(coalesce(new.id,old.id));
    end if;
  elsif tg_table_name='alq_aplicacion' then
    perform alq_private.alq_validar_aplicacion_v1(coalesce(new.id,old.id));
  elsif tg_table_name='alq_aplicacion_reversa' then
    perform alq_private.alq_validar_reversa_v1(coalesce(new.reversa_transaccion_id,old.reversa_transaccion_id));
  end if;
  return null;
end
$$;

create or replace function alq_private.alq_recalcular_cargo_v1(p_cargo_id uuid) returns numeric
    language plpgsql security definer
    set search_path to ''
    as $$
declare v_saldo numeric;
begin
  perform 1 from alq.alq_cargo where id=p_cargo_id for update;
  if not found then raise exception 'ALQ_CARGO_NO_EXISTE'; end if;
  select c.monto
    -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a where a.cargo_id=c.id),0)
    -coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.cargo_id=c.id),0)
    -coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='credito'),0)
    +coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='debito'),0)
    +coalesce((select sum(ar.importe_destino_reabierto)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.cargo_id=c.id),0)
    into v_saldo from alq.alq_cargo c where c.id=p_cargo_id;
  if v_saldo<0 then raise exception 'ALQ_CARGO_SALDO_NEGATIVO'; end if;
  update alq.alq_cargo set saldo_pendiente=v_saldo where id=p_cargo_id;
  update alq.alq_servicio_factura set saldada=(v_saldo=0) where cargo_id=p_cargo_id;
  return v_saldo;
end
$$;

create or replace function alq_private.alq_recalcular_credito_v1(p_credito_id uuid) returns numeric
    language plpgsql security definer
    set search_path to ''
    as $$
declare v_saldo numeric;
begin
  perform 1 from alq.alq_credito where id=p_credito_id for update;
  if not found then raise exception 'ALQ_CREDITO_NO_EXISTE'; end if;
  select cr.monto_original
    -coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.credito_id=cr.id),0)
    -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a
      join alq.alq_transaccion_caja t on t.id=a.transaccion_id
      where a.credito_id=cr.id and t.direccion='salida' and t.estado='confirmada'),0)
    +coalesce((select sum(ar.importe_destino_reabierto)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.credito_id=cr.id),0)
    into v_saldo from alq.alq_credito cr where cr.id=p_credito_id;
  if v_saldo<0 then raise exception 'ALQ_CREDITO_SALDO_NEGATIVO'; end if;
  update alq.alq_credito set saldo_pendiente=v_saldo where id=p_credito_id;
  return v_saldo;
end
$$;

create or replace function alq_private.alq_validar_aplicacion_v1(p_aplicacion_id uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare a alq.alq_aplicacion%rowtype; t alq.alq_transaccion_caja%rowtype;
        c alq.alq_cargo%rowtype; cr alq.alq_credito%rowtype;
        rd alq.alq_rendicion%rowtype; de alq.alq_deposito_evento%rowtype;
        cv alq.alq_conversion_moneda%rowtype;
begin
  select * into a from alq.alq_aplicacion where id=p_aplicacion_id for update;
  select * into t from alq.alq_transaccion_caja where id=a.transaccion_id for update;
  if t.estado<>'confirmada' then raise exception 'ALQ_APLICACION_TRANSACCION_NO_CONFIRMADA'; end if;
  if a.moneda_origen<>t.moneda then raise exception 'ALQ_APLICACION_MONEDA_ORIGEN'; end if;
  if a.conversion_id is null and a.importe_origen<>a.importe_destino then
    raise exception 'ALQ_APLICACION_IMPORTE_SIN_CONVERSION';
  end if;
  if (select coalesce(sum(importe_origen),0) from alq.alq_aplicacion where transaccion_id=t.id)>t.monto then
    raise exception 'ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION';
  end if;
  if a.cargo_id is not null then
    select * into c from alq.alq_cargo where id=a.cargo_id for update;
    if t.direccion<>'entrada' then raise exception 'ALQ_APLICACION_CARGO_REQUIERE_ENTRADA'; end if;
    if a.moneda_destino<>c.moneda then raise exception 'ALQ_APLICACION_MONEDA_CARGO'; end if;
  end if;
  if a.credito_id is not null then
    select * into cr from alq.alq_credito where id=a.credito_id for update;
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_CREDITO_REQUIERE_SALIDA'; end if;
    if a.moneda_destino<>cr.moneda then raise exception 'ALQ_APLICACION_MONEDA_CREDITO'; end if;
  end if;
  if a.rendicion_id is not null then
    select * into rd from alq.alq_rendicion where id=a.rendicion_id for update;
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_RENDICION_REQUIERE_SALIDA'; end if;
    if rd.estado not in ('emitida','corregida') or a.moneda_destino<>rd.moneda then
      raise exception 'ALQ_APLICACION_RENDICION_INVALIDA';
    end if;
    if ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
          where ap.rendicion_id=rd.id)
        -(select coalesce(sum(ar.importe_destino_reabierto),0)
          from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion ap
            on ap.id=ar.aplicacion_original_id where ap.rendicion_id=rd.id))
       >greatest(rd.saldo_final,0) then
      raise exception 'ALQ_GIROS_SUPERAN_SALDO_RENDICION';
    end if;
  end if;
  if a.deposito_evento_id is not null then
    select * into de from alq.alq_deposito_evento where id=a.deposito_evento_id for update;
    if a.moneda_destino<>de.moneda
       or ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
             where ap.deposito_evento_id=de.id)
           -(select coalesce(sum(ar.importe_destino_reabierto),0)
             from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion ap
               on ap.id=ar.aplicacion_original_id where ap.deposito_evento_id=de.id))>de.monto then
      raise exception 'ALQ_APLICACION_DEPOSITO_INVALIDA';
    end if;
  end if;
  if a.conversion_id is not null then
    select * into cv from alq.alq_conversion_moneda where id=a.conversion_id for update;
    if cv.importe_origen<>a.importe_origen or cv.moneda_origen<>a.moneda_origen
       or cv.importe_destino<>a.importe_destino or cv.moneda_destino<>a.moneda_destino
       or cv.importe_destino<>alq_private.alq_redondear_v1(cv.importe_origen*cv.tasa,cv.regla_redondeo) then
      raise exception 'ALQ_I4_CONVERSION_NO_LIGADA';
    end if;
  end if;
  if a.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(a.cargo_id); end if;
  if a.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(a.credito_id); end if;
end
$$;

create or replace function alq_private.alq_validar_reversa_v1(p_reversa_id uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare r alq.alq_transaccion_caja%rowtype; o alq.alq_transaccion_caja%rowtype;
        x record; cv alq.alq_conversion_moneda%rowtype; cvr alq.alq_conversion_moneda%rowtype;
begin
  select * into r from alq.alq_transaccion_caja where id=p_reversa_id for update;
  if r.reversa_de is null then raise exception 'ALQ_REVERSA_SIN_ORIGINAL'; end if;
  select * into o from alq.alq_transaccion_caja where id=r.reversa_de for update;
  if o.estado<>'confirmada' or r.moneda<>o.moneda or r.ambito<>o.ambito
     or r.cuenta_custodia_id is distinct from o.cuenta_custodia_id
     or r.direccion=o.direccion then raise exception 'ALQ_I3_REVERSA_INCOMPATIBLE'; end if;
  if (select coalesce(sum(monto),0) from alq.alq_transaccion_caja
      where reversa_de=o.id and estado='confirmada')>o.monto then
    raise exception 'ALQ_I3_REVERSAS_SUPERAN_ORIGINAL';
  end if;
  if (select coalesce(sum(importe_origen_revertido),0) from alq.alq_aplicacion_reversa
      where reversa_transaccion_id=r.id)>r.monto then
    raise exception 'ALQ_T1_REAPERTURAS_SUPERAN_REVERSA';
  end if;
  for x in select ar.*,a.transaccion_id,a.importe_destino as original_destino,a.conversion_id,
                  a.moneda_origen as original_moneda_origen,
                  a.moneda_destino as original_moneda_destino,a.cargo_id,a.credito_id
           from alq.alq_aplicacion_reversa ar
           join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
           where ar.reversa_transaccion_id=r.id order by ar.id
  loop
    if x.transaccion_id<>o.id then raise exception 'ALQ_T3_APLICACION_NO_PERTENECE'; end if;
    if x.moneda_origen<>x.original_moneda_origen
       or x.moneda_destino<>x.original_moneda_destino then
      raise exception 'ALQ_T4_MONEDAS_NO_COINCIDEN_CON_APLICACION';
    end if;
    if (select coalesce(sum(importe_destino_reabierto),0) from alq.alq_aplicacion_reversa
        where aplicacion_original_id=x.aplicacion_original_id)>x.original_destino then
      raise exception 'ALQ_T2_REAPERTURA_SUPERA_APLICACION';
    end if;
    if x.moneda_origen=x.moneda_destino then
      if x.importe_origen_revertido<>x.importe_destino_reabierto or x.conversion_reversa_id is not null then
        raise exception 'ALQ_T4_REAPERTURA_MISMA_MONEDA';
      end if;
    elsif x.conversion_reversa_id is not null then
      select * into cvr from alq.alq_conversion_moneda where id=x.conversion_reversa_id;
      if cvr.importe_origen<>x.importe_origen_revertido or cvr.moneda_origen<>x.moneda_origen
         or cvr.importe_destino<>x.importe_destino_reabierto or cvr.moneda_destino<>x.moneda_destino
         or cvr.importe_destino<>alq_private.alq_redondear_v1(cvr.importe_origen*cvr.tasa,cvr.regla_redondeo) then
        raise exception 'ALQ_T4_CONVERSION_REVERSA_NO_LIGADA';
      end if;
    else
      select * into cv from alq.alq_conversion_moneda where id=x.conversion_id;
      if not found or x.importe_destino_reabierto<>
        alq_private.alq_redondear_v1(x.importe_origen_revertido*cv.tasa,cv.regla_redondeo) then
        raise exception 'ALQ_T4_PROPORCION_ORIGINAL_INVALIDA';
      end if;
    end if;
    if x.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(x.cargo_id); end if;
    if x.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(x.credito_id); end if;
  end loop;
end
$$;

create or replace function alq_private.alq_validar_transferencia_v1(p_transferencia_id uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare v_count int; v_dirs int; v_montos int; v_monedas int; v_cuentas int;
begin
  if p_transferencia_id is null then return; end if;
  perform 1 from alq.alq_transaccion_caja where transferencia_id=p_transferencia_id order by id for update;
  select count(*),count(distinct direccion),count(distinct monto),count(distinct moneda),
         count(distinct cuenta_custodia_id)
    into v_count,v_dirs,v_montos,v_monedas,v_cuentas
  from alq.alq_transaccion_caja where transferencia_id=p_transferencia_id;
  if v_count<>2 or v_dirs<>2 or v_montos<>1 or v_monedas<>1 or v_cuentas<>2 then
    raise exception 'ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO';
  end if;
end
$$;

-- El baseline conserva owner postgres; sólo el core administrativo V1 es
-- invocable por authenticated. Los helpers vuelven a ser owner-only.
do $alq_f1a_rollback_restore_v1_acl$
declare r record;
begin
  for r in select unnest(array[
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)',
    'alq_private.alq_admin_aplicar_core_v1(uuid,text,text,jsonb)',
    'alq_private.alq_assert_global_v1()',
    'alq_private.alq_constraint_check_v1()',
    'alq_private.alq_recalcular_cargo_v1(uuid)',
    'alq_private.alq_recalcular_credito_v1(uuid)',
    'alq_private.alq_validar_aplicacion_v1(uuid)',
    'alq_private.alq_validar_reversa_v1(uuid)',
    'alq_private.alq_validar_transferencia_v1(uuid)']::text[]) as firma
  loop
    if to_regprocedure(r.firma) is null then
      raise exception using errcode='P0001',
        message='ALQ_F1A_ROLLBACK_RESTAURACION_V1_INCOMPLETA';
    end if;
    execute format('alter function %s owner to postgres',to_regprocedure(r.firma));
    execute format('revoke all on function %s from public,anon,authenticated,service_role',
      to_regprocedure(r.firma));
  end loop;
end
$alq_f1a_rollback_restore_v1_acl$;

grant all on function alq_private.alq_admin_aplicar_core_v1(uuid,text,text,jsonb)
  to authenticated;

-- Primero salen las cuatro superficies públicas; RESTRICT obliga a que no
-- exista ningún consumidor posterior no detectado por el PRE.
drop function public.alq_admin_reintentar_v2(uuid,uuid,text) restrict;
drop function public.alq_admin_cancelar_v2(uuid,uuid,text) restrict;
drop function public.alq_admin_aplicar_v2(uuid,uuid,text,text,jsonb) restrict;
drop function public.alq_admin_preparar_v2(uuid,text,jsonb) restrict;

-- Retiro de las 45 funciones privadas creadas por F1-A. La lista es cerrada;
-- se itera con RESTRICT para respetar su grafo interno sin adivinar el orden.
do $alq_f1a_rollback_drop_private_functions$
declare
  r record;
  v_before integer;
  v_after integer;
  v_names constant text[]:=array[
    'alq_transaccion_cuenta_snapshot_f1a_v1',
    'alq_f1a_writer_context_v1','alq_f1a_tabla_permitida_operacion_v1',
    'alq_f1a_operacion_hijo_guard_v1','alq_f1a_hijo_indirecto_guard_v1',
    'alq_f1a_operacion_tiene_efectos_v1','alq_f1a_tabla_permitida_operacion_v2',
    'alq_f1a_efecto_final_valido_v2','alq_f1a_hijo_estado_final_ct_v2',
    'alq_f1a_hijo_indirecto_estado_final_ct_v2','alq_operacion_estado_guard_f1a_v2',
    'alq_operacion_aplicada_gate_f1a_v2','alq_hecho_guard_f1a_v2',
    'alq_evento_guard_f1a_v2','alq_hecho_consistencia_f1a_v2',
    'alq_evento_consistencia_f1a_v2','alq_f1a_operaciones_lock_v1',
    'alq_f1a_raices_payload_snapshot_v1','alq_f1a_lock_agregados_v1',
    'alq_f1a_lock_revalidar_payload_v1','alq_f1a_hijo_agregado_lock_bi_v1',
    'alq_validar_nota_f1a_v1','alq_validar_credito_consumo_f1a_v1',
    'alq_validar_cargo_f1a_v1','alq_validar_deposito_f1a_v1',
    'alq_f1a_constraint_check_v1','alq_f1a_raiz_inmutable_v1',
    'alq_f1a_garantia_delete_guard_v1','alq_f1a_operaciones_v2',
    'alq_f1a_identidad_v2','alq_f1a_comando_sha_v2','alq_f1a_evento_replay_v2',
    'alq_f1a_qualification_run_id_v1','alq_f1a_registrar_evento_v2',
    'alq_f1a_actor_puede_operar_v2','alq_f1a_prevalidar_v2',
    'alq_f1a_error_negocio_v2','alq_admin_preparar_core_v2',
    'alq_admin_aplicar_core_v2','alq_admin_cancelar_core_v2',
    'alq_admin_reintentar_core_v2','alq_sanear_preparadas_v2',
    'alq_preparadas_estado_v2','alq_assert_financiero_f1a_v1',
    'alq_assert_global_pre_f1a_v1']::text[];
begin
  select count(*) into v_before
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='alq_private' and p.proname=any(v_names);
  if cardinality(v_names)<>45 or v_before<>45 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_INVENTARIO_FUNCION_PRIVADA_DERIVADO';
  end if;
  loop
    select count(*) into v_before
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='alq_private' and p.proname=any(v_names);
    exit when v_before=0;
    for r in
      select p.oid::regprocedure as firma
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='alq_private' and p.proname=any(v_names)
      order by p.proname,p.oid
    loop
      begin
        execute format('drop function %s restrict',r.firma);
      exception when dependent_objects_still_exist then
        null;
      end;
    end loop;
    select count(*) into v_after
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='alq_private' and p.proname=any(v_names);
    if v_after>=v_before then
      raise exception using errcode='P0001',
        message='ALQ_F1A_ROLLBACK_DEPENDENCIA_FUNCION_NO_RESUELTA';
    end if;
  end loop;
end
$alq_f1a_rollback_drop_private_functions$;

-- Estructuras v2 vacías y columnas F1-A. Cada nombre es explícito y cada
-- retiro usa RESTRICT. Las tablas de recibos/hechos deben seguir vacías.
drop table alq_private.alq_operacion_evento_v2 restrict;

alter table alq_private.alq_hecho_idempotente_v2
  drop constraint alq_hecho_idempotente_v2_aplicada_fk restrict;

drop index alq.alq_operacion_hecho_preparada_uq restrict;
drop index alq.alq_operacion_hecho_aplicada_uq restrict;
drop index alq.alq_operacion_expires_ix restrict;

alter table alq.alq_operacion
  drop constraint alq_operacion_hecho_fk restrict,
  drop constraint alq_operacion_v2_forma_ck restrict,
  drop constraint alq_operacion_expiry_ck restrict,
  drop constraint alq_operacion_hecho_intento_uq restrict,
  drop constraint alq_operacion_id_hecho_uq restrict,
  drop constraint alq_operacion_id_hecho_request_uq restrict;

drop table alq_private.alq_hecho_idempotente_v2 restrict;

alter table alq.alq_transaccion_caja
  drop constraint alq_transaccion_cuenta_validacion_ck restrict;

alter table alq.alq_operacion
  drop column hecho_id restrict,
  drop column intento restrict,
  drop column expires_at restrict;

alter table alq.alq_transaccion_caja
  drop column cuenta_validacion_version restrict,
  drop column cuenta_validada_activa_at restrict;

-- --------------------------------------------------------------------------
-- POST fail-closed: baseline V1 exacto, cero residuo F1-A y foto de datos y
-- secuencias idéntica. La evidencia de la migración forward se conserva.
-- --------------------------------------------------------------------------

create temporary table alq_f1a_rollback_post_data (
  tabla text primary key,
  filas bigint not null,
  sha256 text not null
) on commit drop;

do $alq_f1a_rollback_snapshot_post$
declare r record;
begin
  for r in
    select c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq' and c.relkind in ('r','p') order by c.relname
  loop
    execute format(
      'insert into pg_temp.alq_f1a_rollback_post_data(tabla,filas,sha256) '
      'select %L,count(*),encode(extensions.digest(convert_to(coalesce('
      'string_agg(to_jsonb(t)::text,E''\\n'' order by to_jsonb(t)::text),''''),'
      '''UTF8''),''sha256''),''hex'') from alq.%I t',r.relname,r.relname);
  end loop;
end
$alq_f1a_rollback_snapshot_post$;

do $alq_f1a_rollback_postcheck$
declare
  v_executor_sha text;
  v_bad integer;
begin
  if exists (
    select 1 from pg_temp.alq_f1a_rollback_pre_data pre
    full join pg_temp.alq_f1a_rollback_post_data post using(tabla)
    where pre.tabla is null or post.tabla is null
       or pre.filas is distinct from post.filas
       or pre.sha256 is distinct from post.sha256) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_DATOS_PRE_POST_DERIVARON';
  end if;

  if exists (
    select 1 from pg_temp.alq_f1a_rollback_pre_sequences pre
    full join (
      select c.oid::regclass::text as secuencia,
             pg_catalog.pg_sequence_last_value(c.oid) as last_value
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq' and c.relkind='S') post using(secuencia)
    where pre.secuencia is null or post.secuencia is null
       or pre.last_value is distinct from post.last_value) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_SECUENCIAS_PRE_POST_DERIVARON';
  end if;

  if to_regclass('alq_private.alq_hecho_idempotente_v2') is not null
     or to_regclass('alq_private.alq_operacion_evento_v2') is not null
     or exists (
       select 1 from pg_catalog.pg_attribute a
       join pg_catalog.pg_class c on c.oid=a.attrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='alq' and a.attnum>0 and not a.attisdropped and (
         (c.relname='alq_operacion' and a.attname in ('hecho_id','intento','expires_at'))
         or (c.relname='alq_transaccion_caja' and a.attname in
           ('cuenta_validacion_version','cuenta_validada_activa_at'))))
     or exists (
       select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where (n.nspname='public' and p.proname in
          ('alq_admin_preparar_v2','alq_admin_aplicar_v2',
           'alq_admin_cancelar_v2','alq_admin_reintentar_v2'))
          or (n.nspname='alq_private' and p.proname in (
           'alq_transaccion_cuenta_snapshot_f1a_v1','alq_f1a_writer_context_v1',
           'alq_f1a_tabla_permitida_operacion_v1','alq_f1a_operacion_hijo_guard_v1',
           'alq_f1a_hijo_indirecto_guard_v1','alq_f1a_operacion_tiene_efectos_v1',
           'alq_f1a_tabla_permitida_operacion_v2','alq_f1a_efecto_final_valido_v2',
           'alq_f1a_hijo_estado_final_ct_v2','alq_f1a_hijo_indirecto_estado_final_ct_v2',
           'alq_operacion_estado_guard_f1a_v2','alq_operacion_aplicada_gate_f1a_v2',
           'alq_hecho_guard_f1a_v2','alq_evento_guard_f1a_v2',
           'alq_hecho_consistencia_f1a_v2','alq_evento_consistencia_f1a_v2',
           'alq_f1a_operaciones_lock_v1','alq_f1a_raices_payload_snapshot_v1',
           'alq_f1a_lock_agregados_v1','alq_f1a_lock_revalidar_payload_v1',
           'alq_f1a_hijo_agregado_lock_bi_v1','alq_validar_nota_f1a_v1',
           'alq_validar_credito_consumo_f1a_v1','alq_validar_cargo_f1a_v1',
           'alq_validar_deposito_f1a_v1','alq_f1a_constraint_check_v1',
           'alq_f1a_raiz_inmutable_v1','alq_f1a_garantia_delete_guard_v1',
           'alq_f1a_operaciones_v2','alq_f1a_identidad_v2','alq_f1a_comando_sha_v2',
           'alq_f1a_evento_replay_v2','alq_f1a_qualification_run_id_v1',
           'alq_f1a_registrar_evento_v2','alq_f1a_actor_puede_operar_v2',
           'alq_f1a_prevalidar_v2','alq_f1a_error_negocio_v2',
           'alq_admin_preparar_core_v2','alq_admin_aplicar_core_v2',
           'alq_admin_cancelar_core_v2','alq_admin_reintentar_core_v2',
           'alq_sanear_preparadas_v2','alq_preparadas_estado_v2',
           'alq_assert_financiero_f1a_v1','alq_assert_global_pre_f1a_v1')))
     or exists (
       select 1 from pg_catalog.pg_trigger t
       join pg_catalog.pg_class c on c.oid=t.tgrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where not t.tgisinternal and n.nspname='alq' and (
         t.tgname like 'alq\_f1a\_%' escape '\' or t.tgname in (
          'alq_operacion_estado_guard_biud','alq_operacion_aplicada_gate_ct',
          'alq_operacion_hecho_consistencia_ct','alq_hecho_aplicada_consistencia_ct',
          'alq_evento_consistencia_ct','alq_hecho_inmutable_bud','alq_evento_append_only_bud',
          'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu',
          'alq_nota_financiera_ct','alq_credito_consumo_financiero_ct','alq_cargo_grafo_ct',
          'alq_deposito_evento_saldo_ct','alq_deposito_liquidacion_saldo_ct',
          'alq_deposito_linea_saldo_ct','alq_cuenta_raiz_inmutable_bu',
          'alq_contrato_raiz_inmutable_bu','alq_periodo_raiz_inmutable_bu',
          'alq_garantia_raiz_inmutable_bu','alq_garantia_delete_guard_bd',
          'alq_deposito_raiz_inmutable_bu','alq_credito_raiz_inmutable_bu',
          'alq_conversion_raiz_inmutable_bu','alq_cargo_raiz_inmutable_bu',
          'alq_transaccion_raiz_inmutable_bu','alq_aplicacion_raiz_inmutable_bu'))) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_RESIDUO_F1A';
  end if;

  select encode(extensions.digest(convert_to(pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure),
    'UTF8'),'sha256'),'hex') into v_executor_sha;
  if v_executor_sha is distinct from
       'ff5368d253119830d048f372d3cfdef80354676b4eab9d7ff8a7617bd0ce2d23' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_EJECUTOR_V1_NO_EXACTO';
  end if;

  select count(*) into v_bad
  from (values
    ('alq_admin_aplicar_core_v1','1b430748542b3c3520df94d0eb90352e7efdcfdb2866d9335b9583292b39c5a1'),
    ('alq_assert_global_v1','472086c23b58c3cfe28a88723c84f9da42ce72c712c1b7f1ee7e16e5cdc6cb5a'),
    ('alq_constraint_check_v1','91bc5a54b880cb4fc23d288ba49aa9bd7aa2f014b63c717d14fb59087b24e0b5'),
    ('alq_recalcular_cargo_v1','c7c6321c7fac3f04437e24d57bd5fbb666773ad31326b6edaa5c91da68772667'),
    ('alq_recalcular_credito_v1','97115afe5fb3cda94d4e2e36107a9331875bc397e036729392481fbebf18099e'),
    ('alq_validar_aplicacion_v1','bcee53663c885af2265f7244c4aff25e86e647bbb68128f28a8c824c97233346'),
    ('alq_validar_reversa_v1','ad00a77f73b1022b0d506e72fef4ace06e4934cee8d58b243a52bdb6a4eca935'),
    ('alq_validar_transferencia_v1','656cb4ae2db95427f13eb869f564d92e39f378c93b9f8906fc3f7ca529b656e9')
  ) expected(proname,sha256)
  left join pg_catalog.pg_proc p on p.proname=expected.proname
  left join pg_catalog.pg_namespace n on n.oid=p.pronamespace and n.nspname='alq_private'
  where n.oid is null or p.proowner<>to_regrole('postgres')
     or not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]
     or encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex')
          is distinct from expected.sha256;
  if v_bad<>0 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_DEFINICION_V1_NO_EXACTA';
  end if;

  if (select count(*) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid=t.tgrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname='alq' and
        (c.relname,t.tgname) in (
          ('alq_aplicacion','alq_aplicacion_limites_ct'),
          ('alq_aplicacion_reversa','alq_reapertura_limites_ct'),
          ('alq_transaccion_caja','alq_transferencia_par_ct'))
        and t.tgdeferrable and t.tginitdeferred
        and t.tgfoid='alq_private.alq_constraint_check_v1()'::regprocedure)<>3 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_TRIGGERS_V1_DERIVADOS';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where n.nspname='alq_private' and p.proname in (
      'alq_aplicar_operacion_v1','alq_admin_aplicar_core_v1','alq_assert_global_v1',
      'alq_constraint_check_v1','alq_recalcular_cargo_v1','alq_recalcular_credito_v1',
      'alq_validar_aplicacion_v1','alq_validar_reversa_v1','alq_validar_transferencia_v1')
      and a.grantee<>p.proowner
      and not (p.proname='alq_admin_aplicar_core_v1'
        and a.grantee=to_regrole('authenticated')::oid
        and a.privilege_type='EXECUTE') )
     or not pg_catalog.has_function_privilege('authenticated',
       'alq_private.alq_admin_aplicar_core_v1(uuid,text,text,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'alq_private.alq_admin_aplicar_core_v1(uuid,text,text,jsonb)','EXECUTE') then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_ACL_V1_DERIVADA';
  end if;

  if (select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq' and c.relkind in ('r','p'))<>46
     or cardinality(alq_private.alq_operaciones_v1())<>45
     or (select count(*) from alq.alq_operacion where estado='aplicada')<>112
     or exists(select 1 from alq.alq_operacion where estado='preparada')
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK'
     or (select count(*) from supabase_migrations.schema_migrations
         where name='alq_f1a_guardas_financieras_y_metodo')<>1 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_ROLLBACK_POST_BASELINE_DERIVADO';
  end if;
end
$alq_f1a_rollback_postcheck$;

select 'ALQ_F1A_99_ROLLBACK_READY_TO_COMMIT|'||jsonb_build_object(
  'status','PASS',
  'target_ref','rsjwqmpseknvydistgfr',
  'will_execute',true,
  'forward_history_preserved',true,
  'f1a_rows_removed',0,
  'alq_tables_preserved',46,
  'applied_operations_preserved',112,
  'v1_operations',45,
  'restored_baseline','supabase/baselines/alq_v1_qa_adoptado_20260821.sql',
  'warning','V1_REABRE_14_ROJOS_D0'
)::text as alq_f1a_99_rollback_receipt;
