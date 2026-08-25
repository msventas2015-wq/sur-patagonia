-- ALQ F1-A · PRECHECK SELLADO · SOLO QA · READ ONLY
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

do $alq_f1a_pre$
declare
  v_qr_sha text;
  v_executor_sha text;
  v_last bigint;
  v_called boolean;
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
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_DESTINO_O_SESION_INVALIDA';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq' and c.relkind in ('r','p'))<>46
     or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname in ('alq','public') and c.relkind='v'
           and c.relname like 'alq\_v\_%' escape '\')<>27
     or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='alq' and c.relkind in ('r','p')
           and (not c.relrowsecurity or not c.relforcerowsecurity
                or c.relowner<>to_regrole('postgres')))<>0
     or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname in ('alq','public') and c.relkind='v'
           and c.relname like 'alq\_v\_%' escape '\'
           and (c.relowner<>to_regrole('postgres')
                or not coalesce(c.reloptions@>array['security_invoker=true'],false)))<>0 then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_CATALOGO_RLS_O_VISTAS_DERIVADO';
  end if;

  if cardinality(alq_private.alq_operaciones_v1())<>45
     or (select count(*) from alq.alq_operacion)<>112
     or (select count(*) from alq.alq_operacion where estado='aplicada')<>112
     or (select count(*) from alq.alq_operacion where estado='preparada')<>0
     or (select count(*) from supabase_migrations.schema_migrations)<>46
     or (select count(*) from supabase_migrations.schema_migrations
         where name='alq_f1a_guardas_financieras_y_metodo')<>0 then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_CORTE_OPERACIONES_O_MIGRACIONES_DERIVADO';
  end if;

  if to_regclass('alq_private.alq_hecho_idempotente_v2') is not null
     or to_regclass('alq_private.alq_operacion_evento_v2') is not null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is not null
     or exists (select 1 from pg_attribute
                where attrelid='alq.alq_operacion'::regclass and attnum>0
                  and not attisdropped and attname in ('hecho_id','intento','expires_at'))
     or exists (select 1 from pg_attribute
                where attrelid='alq.alq_transaccion_caja'::regclass and attnum>0
                  and not attisdropped
                  and attname in ('cuenta_validacion_version','cuenta_validada_activa_at')) then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_F1A_YA_PRESENTE';
  end if;

  if (select count(*) from alq.alq_transaccion_caja)<>12
     or (select count(*) from alq.alq_transaccion_caja where ambito='custodiada')<>7
     or (select count(*) from alq.alq_transaccion_caja where transferencia_id is not null)<>0
     or (select count(*) from alq.alq_cuenta_custodia where activa)<>1 then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_CORTE_CAJA_DERIVADO';
  end if;

  select last_value,is_called into v_last,v_called from alq.alq_journal_id_seq;
  if v_last<>157 or not v_called
     or (select coalesce(max(id),0) from alq.alq_journal)<>129 then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_SECUENCIA_JOURNAL_DERIVADA';
  end if;

  select encode(extensions.digest(convert_to(pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure),
    'UTF8'),'sha256'),'hex') into v_executor_sha;
  if v_executor_sha<>'ff5368d253119830d048f372d3cfdef80354676b4eab9d7ff8a7617bd0ce2d23' then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_EJECUTOR_DERIVADO';
  end if;

  with resuelto as (
    select r.codigo,r.activo,
      case when public.es_canal_pasivo(c.tipo) then c.destino else r.destino end as destino_resuelto
    from public.referencias r join public.canales c on c.id=r.canal_id
  )
  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_array(codigo,destino_resuelto,activo) order by codigo),
    '[]'::jsonb)::text,'UTF8'),'sha256'),'hex') into v_qr_sha from resuelto;
  if (select count(*) from public.referencias)<>115
     or v_qr_sha<>'9db8d6cf2fb22511af5f6b1374d0d4f460f6177eae61ef52599f2fbce7410d35' then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_QR_DERIVADO';
  end if;

  if alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK'
     or exists (select 1 from alq.alq_nota n join alq.alq_cargo c on c.id=n.cargo_id
                where n.moneda<>c.moneda)
     or exists (select 1 from alq.alq_credito_consumo x
       join alq.alq_credito cr on cr.id=x.credito_id join alq.alq_cargo c on c.id=x.cargo_id
       join alq.alq_contrato co on co.id=cr.contrato_id
       where x.moneda<>cr.moneda or x.moneda<>c.moneda or cr.contrato_id<>c.contrato_id
          or cr.parte_id<>c.deudor_parte_id or co.propiedad_id<>c.propiedad_id)
     or exists (select 1 from alq.alq_transaccion_caja t
       join alq.alq_cuenta_custodia c on c.id=t.cuenta_custodia_id
       where t.ambito='custodiada' and (t.moneda<>c.moneda or not c.activa))
     or exists (select 1 from alq.alq_cargo c join alq.alq_contrato co on co.id=c.contrato_id
       left join alq.alq_periodo p on p.id=c.periodo_id
       where c.propiedad_id<>co.propiedad_id
          or (c.periodo_id is not null and p.contrato_id<>c.contrato_id)
          or (c.concepto='alquiler_periodo' and c.deudor_parte_id<>co.inquilino_parte_id))
     or exists (select 1 from alq.alq_aplicacion a
       join alq.alq_transaccion_caja t on t.id=a.transaccion_id
       join alq.alq_cargo c on c.id=a.cargo_id
       where (t.contraparte_parte_id<>c.deudor_parte_id and not exists (
         select 1 from alq.alq_garantia g where g.contrato_id=c.contrato_id
           and g.garante_parte_id=t.contraparte_parte_id and t.fecha<@g.vigencia))
          or t.beneficiario_parte_id<>c.acreedor_parte_id)
     or exists (select 1 from alq.alq_deposito d where
       coalesce((select sum(e.monto) from alq.alq_deposito_evento e
         where e.deposito_id=d.id and e.tipo in
           ('aplicacion','devolucion','transferencia_a_sucesor')),0)
       +coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
         join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
         where l.deposito_id=d.id and l.estado in ('aprobada','pagada')),0)>d.monto_constituido) then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_INVARIANTE_FINANCIERA_VIOLADA';
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq' and c.relkind in ('r','p') and (
      has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))) then
    raise exception using errcode='P0001',message='ALQ_F1A_PRE_DML_DIRECTO_API';
  end if;
end
$alq_f1a_pre$;

select 'ALQ_F1A_PRE_RECEIPT|'||jsonb_build_object(
  'schema_version',1,'status','ALQ_F1A_PRE_PASS',
  'target_ref','rsjwqmpseknvydistgfr',
  'production_ref_denied',('wajk'||'fydxutptcvvfwrvq'),
  'server_version_num',current_setting('server_version_num')::integer,
  'source_sha256','d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701',
  'run_id','f1a20260821000000000000000000001',
  'captured_utc',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'alq_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='alq' and c.relkind in ('r','p')),
  'alq_views',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname in ('alq','public') and c.relkind='v'
                 and c.relname like 'alq\_v\_%' escape '\'),
  'operations_applied',(select count(*) from alq.alq_operacion where estado='aplicada'),
  'operations_prepared',(select count(*) from alq.alq_operacion where estado='preparada'),
  'migration_rows',(select count(*) from supabase_migrations.schema_migrations),
  'migration_name_absent',not exists (select 1 from supabase_migrations.schema_migrations
    where name='alq_f1a_guardas_financieras_y_metodo'),
  'qa_marker',exists (select 1 from private.qa_marca_descartable
    where singleton and project_ref='rsjwqmpseknvydistgfr'))::text as alq_f1a_pre_receipt;
rollback;
