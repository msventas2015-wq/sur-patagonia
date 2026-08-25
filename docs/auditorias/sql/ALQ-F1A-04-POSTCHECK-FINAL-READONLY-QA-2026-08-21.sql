-- ALQ F1-A · POSTCHECK FINAL/CERO RESIDUO · SOLO QA · READ ONLY
-- Autoridad de fuente: d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701
begin isolation level repeatable read read only;
set local statement_timeout='120s';
set local lock_timeout='5s';
set local idle_in_transaction_session_timeout='120s';
set local search_path=pg_catalog;
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local bytea_output='hex';

do $alq_f1a_final$
declare
  v_fixture_rows bigint;
  v_last bigint;
  v_called boolean;
  v_qr_sha text;
begin
  -- Señal OPERATIVA, no frontera de seguridad: application_name es falsificable con SET.
  -- La frontera real es private.qa_marca_descartable, ausente en producción (sello Cloud 2026-08-21).
  -- 'mgmt-api' lo asigna Supabase al canal MCP y puede cambiar; si cambia, esta guarda vuelve a frenar.
  -- Antes se esperaba 'Supavisor', heredado del runner F0 por psql/pooler.
  if current_setting('transaction_read_only') is distinct from 'on'
     or current_database() is distinct from 'postgres'
     or session_user is distinct from 'postgres'
     or current_user is distinct from 'postgres'
     or current_setting('application_name',true) is distinct from 'mgmt-api'
     or current_setting('server_version_num')::integer<>170006
     or (select count(*) from private.qa_marca_descartable)<>1
     or (select count(*) from private.qa_marca_descartable
         where singleton and project_ref='rsjwqmpseknvydistgfr')<>1
     or exists (select 1 from private.qa_marca_descartable
                where project_ref=('wajk'||'fydxutptcvvfwrvq'))
     or (select coalesce(array_agg(etapa order by etapa),array[]::text[])
         from private.alq_instalacion_etapas_v1)
        <>array['A','B','C','D','PRE']::text[] then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_DESTINO_O_SESION_INVALIDA';
  end if;

  if (select count(*) from supabase_migrations.schema_migrations)<>47
     or (select count(*) from supabase_migrations.schema_migrations
         where name='alq_f1a_guardas_financieras_y_metodo')<>1
     or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='alq' and c.relkind in ('r','p'))<>46
     or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname in ('alq','public') and c.relkind='v'
           and c.relname like 'alq\_v\_%' escape '\')<>27
     or cardinality(alq_private.alq_operaciones_v1())<>45
     or cardinality(alq_private.alq_f1a_operaciones_v2())<>8
     or (select count(*) from alq.alq_operacion where estado='aplicada')<>112
     or (select count(*) from alq.alq_operacion where estado='preparada')<>0 then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_CORTE_DERIVADO';
  end if;

  select
    (select count(*) from alq_private.alq_hecho_idempotente_v2)
    +(select count(*) from alq_private.alq_operacion_evento_v2)
    +(select count(*) from alq.alq_operacion where hecho_id is not null)
    +(select count(*) from auth.users where id::text like 'f1af0000-0000-4000-8000-%')
    +(select count(*) from alq.alq_parte where id::text like 'f1af0000-0000-4000-8000-%')
    +(select count(*) from alq.alq_parte_usuario where id::text like 'f1af0000-0000-4000-8000-%')
    +(select count(*) from alq.alq_propiedad where id::text like 'f1af0000-0000-4000-8000-%')
  into v_fixture_rows;
  if v_fixture_rows<>0 then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_RESIDUO_SINTETICO';
  end if;

  if exists (select 1 from pg_policies where schemaname='alq_private'
      and tablename in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2'))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='alq_private'
         and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
         and (not c.relrowsecurity or not c.relforcerowsecurity
              or c.relowner<>to_regrole('postgres')))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='alq' and c.relkind in ('r','p') and
         (not c.relrowsecurity or not c.relforcerowsecurity
          or c.relowner<>to_regrole('postgres')
          or has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
          or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
          or has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname in ('alq','public') and c.relkind='v'
         and c.relname like 'alq\_v\_%' escape '\'
         and (c.relowner<>to_regrole('postgres')
              or not coalesce(c.reloptions@>array['security_invoker=true'],false))) then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_RLS_O_ACL_INVALIDA';
  end if;

  if (select count(*) from pg_constraint where conname in (
        'alq_hecho_idempotente_v2_clave_uq','alq_operacion_hecho_fk',
        'alq_operacion_hecho_intento_uq','alq_operacion_id_hecho_request_uq',
        'alq_operacion_evento_v2_ids_ck','alq_operacion_evento_v2_comando_ck',
        'alq_operacion_evento_v2_intento_fk','alq_transaccion_cuenta_validacion_ck'))<>8
     or (select count(*) from pg_trigger where not tgisinternal and tgname in (
        'alq_operacion_estado_guard_biud','alq_operacion_aplicada_gate_ct',
        'alq_operacion_hecho_consistencia_ct','alq_hecho_aplicada_consistencia_ct',
        'alq_evento_consistencia_ct','alq_hecho_inmutable_bud','alq_evento_append_only_bud',
        'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu'))<>9
     or (select count(*) from alq.alq_transaccion_caja
         where ambito='custodiada' and cuenta_validacion_version is null
           and cuenta_validada_activa_at is null)<>7 then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_OBJETOS_O_LEGADO_DERIVADO';
  end if;

  select last_value,is_called into v_last,v_called from alq.alq_journal_id_seq;
  if v_last<>157 or not v_called
     or (select coalesce(max(id),0) from alq.alq_journal)<>129
     or alq_private.alq_assert_financiero_f1a_v1()<>'ALQ_ASSERT_FINANCIERO_F1A_OK'
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_ESTADO_FINANCIERO_DERIVADO';
  end if;

  with resuelto as (
    select r.codigo,r.activo,
      case when public.es_canal_pasivo(c.tipo) then c.destino else r.destino end as destino_resuelto
    from public.referencias r join public.canales c on c.id=r.canal_id
  )
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_array(codigo,destino_resuelto,activo) order by codigo),
    '[]'::jsonb)::text,'UTF8'),'sha256'),'hex') into v_qr_sha from resuelto;
  -- Debe coincidir con el baseline QR de QA sellado por el PRE del mismo paquete.
  if (select count(*) from public.referencias)<>117
     or v_qr_sha<>'df0919b2477e1c010bc2bd62ae5c2e199c0ed950aea2a794ed075e71294a92ce' then
    raise exception using errcode='P0001',message='ALQ_F1A_FINAL_QR_DERIVADO';
  end if;
end
$alq_f1a_final$;

select 'ALQ_F1A_FINAL_RECEIPT|'||jsonb_build_object(
  'schema_version',1,'status','ALQ_F1A_FINAL_PASS',
  'target_ref','rsjwqmpseknvydistgfr',
  'production_ref_denied',('wajk'||'fydxutptcvvfwrvq'),
  'server_version_num',current_setting('server_version_num')::integer,
  'source_sha256','d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701',
  'run_id','f1a20260821000000000000000000001',
  'captured_utc',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'fixture_rows',0,
  'prepared_test_rows',(select count(*) from alq.alq_operacion where estado='preparada'),
  'sequence_delta',(select last_value-157 from alq.alq_journal_id_seq),
  'postmigration_hashes_restored',true,
  'assert_global_ok',alq_private.alq_assert_global_v1()='ALQ_ASSERT_GLOBAL_OK')::text
  as alq_f1a_final_receipt;
rollback;
