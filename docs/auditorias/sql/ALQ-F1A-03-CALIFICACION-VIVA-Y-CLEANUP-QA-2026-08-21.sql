-- ALQ F1-A · calificacion viva QA y cleanup allowlisted
-- CONSTRUCCION LOCAL: no ejecutado. Destino futuro unico QA rsjwqmpseknvydistgfr.
-- Debe ejecutarse despues de las dos queries A/B selladas en el case-spec QA.
-- No aplica efectos financieros: valida los dos rechazos tecnicos de la misma
-- clave/hash, recibe los SHA de las transcripciones MCP externas ya validadas
-- por el harness/coordinador y elimina solo ese run_id. Los tres valores deben
-- llegar en la misma llamada mediante set_config(...,true), antes de estos bytes:
--   alq.f1a_external_response_a_sha256
--   alq.f1a_external_response_b_sha256
--   alq.f1a_external_concurrency_receipt_sha256
-- Este SQL no atribuye a la base el hash de una respuesta que la base no vio.
set local search_path='';
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local statement_timeout='60s';
set local lock_timeout='5s';
set constraints all deferred;

do $alq_f1a_q_guard$
declare
  v_qa boolean;
begin
  select current_database()='postgres'
     and session_user='postgres'
     and current_user='postgres'
     and current_setting('server_version_num')::integer=170006
     and count(*)=1
     and bool_and(m.singleton and m.project_ref='rsjwqmpseknvydistgfr')
    into v_qa
  from private.qa_marca_descartable m;
  if not coalesce(v_qa,false) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_DESTINO_INVALIDO';
  end if;
  if to_regclass('alq_private.alq_hecho_idempotente_v2') is null
     or to_regclass('alq_private.alq_operacion_evento_v2') is null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is null
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_INSTALACION_INVALIDA';
  end if;
end
$alq_f1a_q_guard$;

create temporary table alq_f1a_qualification_context(
  run_id uuid primary key
) on commit drop;
insert into pg_temp.alq_f1a_qualification_context(run_id)
values ('f1a20260-8210-0000-0000-000000000001'::uuid);

create temporary table alq_f1a_cleanup_allowlist(
  kind text not null check(kind in ('evento','operacion','hecho')),
  id uuid not null,
  run_id uuid not null,
  primary key(kind,id)
) on commit drop;

create temporary table alq_f1a_qualification_evidence(
  singleton boolean primary key check(singleton),
  response_a_sha256 text not null check(response_a_sha256 ~ '^[0-9a-f]{64}$'),
  response_b_sha256 text not null check(response_b_sha256 ~ '^[0-9a-f]{64}$'),
  concurrency_receipt_sha256 text not null
    check(concurrency_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  rls_pass boolean not null
) on commit drop;

do $alq_f1a_q_validate$
declare
  v_count integer;
  v_distinct_keys integer;
  v_distinct_payloads integer;
  v_a text;
  v_b text;
  v_all text;
  v_rls boolean;
begin
  v_a:=current_setting('alq.f1a_external_response_a_sha256',true);
  v_b:=current_setting('alq.f1a_external_response_b_sha256',true);
  v_all:=current_setting(
    'alq.f1a_external_concurrency_receipt_sha256',true);
  if v_a is null or v_a !~ '^[0-9a-f]{64}$'
     or v_b is null or v_b !~ '^[0-9a-f]{64}$'
     or v_all is null or v_all !~ '^[0-9a-f]{64}$'
     or v_a=v_b then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_EVIDENCIA_MCP_INVALIDA';
  end if;

  select count(*),count(distinct e.clave_sha256),
         count(distinct e.payload_sha256)
    into v_count,v_distinct_keys,v_distinct_payloads
  from alq_private.alq_operacion_evento_v2 e
  where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid;

  if v_count<>2 or v_distinct_keys<>1 or v_distinct_payloads<>1 then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_AB_CARDINALIDAD_INVALIDA';
  end if;

  if exists (
    select 1
    from alq_private.alq_operacion_evento_v2 e
    where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid
      and (e.namespace<>'alq.nota'
        or e.accion<>'preparar'
        or e.hecho_id is not null
        or e.operacion_id is not null
        or e.operacion_request_id is not null
        or e.codigo<>'ALQ_F1A_REFERENCIA_NO_EXISTE'
        or e.envelope->>'estado'<>'rechazada_sin_fila'
        or coalesce((e.envelope->>'ok')::boolean,true)
        or e.comando_request_id not in (
          'f1a20260-8210-4000-8000-00000000000a'::uuid,
          'f1a20260-8210-4000-8000-00000000000b'::uuid))
  ) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_AB_FORMA_INVALIDA';
  end if;

  if (select count(distinct e.comando_request_id)
      from alq_private.alq_operacion_evento_v2 e
      where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid)<>2
     or exists (
       select 1
       from alq_private.alq_hecho_idempotente_v2 h
       join alq.alq_operacion o on o.hecho_id=h.id
       where h.namespace='alq.nota'
         and h.clave_sha256=(
           select min(e.clave_sha256)
           from alq_private.alq_operacion_evento_v2 e
           where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid))
  then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_EFECTO_FINANCIERO_INESPERADO';
  end if;

  select count(*)=2
     and bool_and(c.relrowsecurity and c.relforcerowsecurity)
     and not exists (
       select 1 from pg_catalog.pg_policy p
       where p.polrelid=any(array[
         'alq_private.alq_hecho_idempotente_v2'::regclass,
         'alq_private.alq_operacion_evento_v2'::regclass]))
    into v_rls
  from pg_catalog.pg_class c
  where c.oid=any(array[
    'alq_private.alq_hecho_idempotente_v2'::regclass,
    'alq_private.alq_operacion_evento_v2'::regclass]);

  if not coalesce(v_rls,false) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_RLS_INVALIDA';
  end if;

  insert into pg_temp.alq_f1a_qualification_evidence(
    singleton,response_a_sha256,response_b_sha256,
    concurrency_receipt_sha256,rls_pass)
  values (true,v_a,v_b,v_all,v_rls);

  insert into pg_temp.alq_f1a_cleanup_allowlist(kind,id,run_id)
  select 'evento',e.id,e.run_id
  from alq_private.alq_operacion_evento_v2 e
  where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid;
end
$alq_f1a_q_validate$;

delete from alq_private.alq_operacion_evento_v2 e
where e.run_id='f1a20260-8210-0000-0000-000000000001'::uuid
  and exists (
    select 1 from pg_temp.alq_f1a_cleanup_allowlist a
    where a.kind='evento' and a.id=e.id and a.run_id=e.run_id);

set constraints all immediate;

do $alq_f1a_q_post$
begin
  if exists (
    select 1 from alq_private.alq_operacion_evento_v2
    where run_id='f1a20260-8210-0000-0000-000000000001'::uuid)
     or exists (
       select 1 from alq.alq_operacion
       where hecho_id in (
         select id from alq_private.alq_hecho_idempotente_v2
         where namespace='alq.nota'
           and clave_sha256 in (
             select clave_sha256
             from alq_private.alq_operacion_evento_v2
             where run_id='f1a20260-8210-0000-0000-000000000001'::uuid)))
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception using errcode='P0001',
      message='ALQ_F1A_QUALIFICATION_CLEANUP_INCOMPLETO';
  end if;
end
$alq_f1a_q_post$;

select 'ALQ_F1A_QUALIFICATION_RECEIPT|'||
  jsonb_build_object(
    'schema_version',1,
    'status','ALQ_F1A_QUALIFICATION_CLEAN_PASS',
    'environment','QA',
    'target_ref','rsjwqmpseknvydistgfr',
    'production_ref_denied','wajkfydxutptcvvfwrvq',
    'server_version_num',170006,
    'network',false,
    'source_sha256','d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701',
    'run_id','f1a20260821000000000000000000001',
    'captured_utc',to_char(clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'financial_successes',0,
    'cleanup_residual_rows',0,
    'two_backends',true,
    'barrier_observed_by_both',true,
    'rls_pass',e.rls_pass,
    'concurrency_case','QA_IDEMPOTENCIA_MISMA_CLAVE_HASH',
    'concurrency_receipt_sha256',e.concurrency_receipt_sha256,
    'response_a_sha256',e.response_a_sha256,
    'response_b_sha256',e.response_b_sha256)
from pg_temp.alq_f1a_qualification_evidence e
where e.singleton;
