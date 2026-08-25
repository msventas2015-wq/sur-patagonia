-- ALQ F1-A · POSTCHECK DE INSTALACION · SOLO QA · READ ONLY
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

do $alq_f1a_post_install$
declare
  v_last bigint;
  v_called boolean;
begin
  if current_setting('transaction_read_only') is distinct from 'on'
     or current_database() is distinct from 'postgres'
     or session_user is distinct from 'postgres'
     or current_user is distinct from 'postgres'
     or current_setting('application_name',true) is distinct from 'Supavisor'
     or current_setting('server_version_num')::integer<>170006
     or (select count(*) from private.qa_marca_descartable)<>1
     or (select count(*) from private.qa_marca_descartable
         where singleton and project_ref='rsjwqmpseknvydistgfr')<>1
     or exists (select 1 from private.qa_marca_descartable
                where project_ref=('wajk'||'fydxutptcvvfwrvq'))
     or (select coalesce(array_agg(etapa order by etapa),array[]::text[])
         from private.alq_instalacion_etapas_v1)
        <>array['A','B','C','D','PRE']::text[] then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_DESTINO_O_SESION_INVALIDA';
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
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_CORTE_DERIVADO';
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq_private' and c.relkind in ('r','p')
        and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2'))<>2
     or exists (select 1 from alq_private.alq_hecho_idempotente_v2)
     or exists (select 1 from alq_private.alq_operacion_evento_v2)
     or exists (select 1 from alq.alq_operacion where hecho_id is not null)
     or (select count(*) from pg_attribute where attnum>0 and not attisdropped and (
          (attrelid='alq.alq_operacion'::regclass
           and attname in ('hecho_id','intento','expires_at'))
          or (attrelid='alq.alq_transaccion_caja'::regclass
           and attname in ('cuenta_validacion_version','cuenta_validada_activa_at'))))<>5
     or (select count(*) from alq.alq_transaccion_caja
         where ambito='custodiada' and cuenta_validacion_version is null
           and cuenta_validada_activa_at is null)<>7 then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_FORMA_O_LEGADO_INVALIDO';
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
        'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu'))<>9 then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_OBJETOS_INCOMPLETOS';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('alq_admin_preparar_v2','alq_admin_aplicar_v2','alq_admin_cancelar_v2','alq_admin_reintentar_v2')
        and not p.prosecdef and p.proconfig=array['search_path=""']::text[])<>4
     or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='alq_private' and p.proname in
          ('alq_admin_preparar_core_v2','alq_admin_aplicar_core_v2',
           'alq_admin_cancelar_core_v2','alq_admin_reintentar_core_v2')
          and p.prosecdef and p.proconfig=array['search_path=""']::text[])<>4 then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_RPC_INVALIDA';
  end if;

  if exists (select 1 from pg_policies where schemaname='alq_private'
      and tablename in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2'))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='alq_private'
         and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
         and (not c.relrowsecurity or not c.relforcerowsecurity
              or c.relowner<>to_regrole('postgres')))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
       where n.nspname='alq_private'
         and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
         and a.grantee<>c.relowner)
     or exists (select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid
       join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(a.attacl) x
       where n.nspname='alq_private'
         and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
         and a.attnum>0 and not a.attisdropped and x.grantee<>c.relowner) then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_RLS_O_ACL_PRIVADA_INVALIDA';
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
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
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_SUPERFICIE_API_INVALIDA';
  end if;

  select last_value,is_called into v_last,v_called from alq.alq_journal_id_seq;
  if v_last<>157 or not v_called
     or (select coalesce(max(id),0) from alq.alq_journal)<>129
     or alq_private.alq_assert_financiero_f1a_v1()<>'ALQ_ASSERT_FINANCIERO_F1A_OK'
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception using errcode='P0001',message='ALQ_F1A_POST_INSTALL_ESTADO_FINANCIERO_DERIVADO';
  end if;
end
$alq_f1a_post_install$;

select 'ALQ_F1A_POST_INSTALL_RECEIPT|'||jsonb_build_object(
  'schema_version',1,'status','ALQ_F1A_POST_INSTALL_PASS',
  'target_ref','rsjwqmpseknvydistgfr',
  'production_ref_denied',('wajk'||'fydxutptcvvfwrvq'),
  'server_version_num',current_setting('server_version_num')::integer,
  'source_sha256','d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701',
  'run_id','f1a20260821000000000000000000001',
  'captured_utc',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'new_private_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq_private' and c.relkind in ('r','p')
      and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')),
  'legacy_snapshot_null_rows',(select count(*) from alq.alq_transaccion_caja
    where ambito='custodiada' and cuenta_validacion_version is null
      and cuenta_validada_activa_at is null),
  'assert_global_ok',alq_private.alq_assert_global_v1()='ALQ_ASSERT_GLOBAL_OK',
  'migration_exactly_one',(select count(*) from supabase_migrations.schema_migrations
    where name='alq_f1a_guardas_financieras_y_metodo')=1)::text as alq_f1a_post_install_receipt;
rollback;
