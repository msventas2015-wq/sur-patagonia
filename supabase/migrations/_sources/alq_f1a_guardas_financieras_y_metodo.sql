-- ALQ F1-A · guardas financieras + método v2
-- Autoridad forward única. Destino futuro: QA rsjwqmpseknvydistgfr.
-- CONSTRUCCIÓN 2026-08-21: estos bytes NO fueron ejecutados en QA.
-- La transacción exterior pertenece a Supabase apply_migration; este archivo no
-- emite BEGIN/COMMIT/ROLLBACK top-level.

set local search_path=pg_catalog,public,extensions;
set local quote_all_identifiers=off;
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local intervalstyle='iso_8601';
set local bytea_output='hex';
set local lock_timeout='5s';
set local statement_timeout='180s';

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  'alq_f1a_guardas_financieras_y_metodo',0));

do $alq_f1a_guard$
declare
  v_qa boolean:=false;
  v_local boolean:=false;
  v_local_marker boolean:=false;
  v_local_reg regclass;
  v_sha text;
begin
  select current_database()='postgres' and count(*)=1 and coalesce(bool_and(m.singleton and
         m.project_ref='rsjwqmpseknvydistgfr'),false)
    into v_qa
  from private.qa_marca_descartable m;

  v_local_reg:=to_regclass('alq_f1a_local.fixture_marca');
  if v_local_reg is not null then
    execute format('select exists(select 1 from %s where singleton '
      'and data_directory=current_setting(''data_directory''))',v_local_reg)
      into v_local_marker;
  end if;
  v_local := current_database()='alq_f1a_fixture'
    and current_setting('server_version_num')='170006'
    and inet_server_addr() is null
    and current_setting('listen_addresses')=''
    and v_local_marker
    and not exists (select 1 from private.qa_marca_descartable);

  if current_user<>'postgres' or current_setting('server_version_num')<>'170006'
     or (v_qa::int+v_local::int)<>1 then
    raise exception using errcode='P0001',message='ALQ_F1A_DESTINO_O_RUNTIME_INVALIDO';
  end if;
  if to_regnamespace('alq') is null or to_regnamespace('alq_private') is null
     or to_regclass('alq.alq_operacion') is null
     or to_regprocedure('alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)') is null
     or cardinality(alq_private.alq_operaciones_v1())<>45 then
    raise exception using errcode='P0001',message='ALQ_F1A_BASELINE_INCOMPLETO';
  end if;
  if exists (select 1 from alq.alq_operacion where estado='preparada') then
    raise exception using errcode='P0001',message='ALQ_F1A_PREPARADAS_EXISTENTES';
  end if;
  if to_regclass('alq_private.alq_hecho_idempotente_v2') is not null
     or to_regprocedure('public.alq_admin_preparar_v2(uuid,text,jsonb)') is not null then
    raise exception using errcode='P0001',message='ALQ_F1A_YA_INSTALADO';
  end if;

  if v_qa then
    if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n
        on n.oid=c.relnamespace where n.nspname='alq' and c.relkind in ('r','p'))<>46
       or (select count(*) from alq.alq_operacion where estado='aplicada')<>112
       or (select coalesce(array_agg(etapa order by etapa),array[]::text[])
           from private.alq_instalacion_etapas_v1)<>array['A','B','C','D','PRE']::text[] then
      raise exception using errcode='P0001',message='ALQ_F1A_CORTE_QA_DERIVADO';
    end if;
    select encode(extensions.digest(convert_to(pg_get_functiondef(
      'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure),'UTF8'),'sha256'),'hex')
      into v_sha;
    if v_sha<>'ff5368d253119830d048f372d3cfdef80354676b4eab9d7ff8a7617bd0ce2d23' then
      raise exception using errcode='P0001',message='ALQ_F1A_EJECUTOR_BASE_DERIVADO';
    end if;
  end if;
end
$alq_f1a_guard$;

-- --------------------------------------------------------------------------
-- Hecho idempotente, intento y recibos append-only.
-- --------------------------------------------------------------------------

create table alq_private.alq_hecho_idempotente_v2 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  namespace text not null check (namespace ~ '^alq\.[a-z_]+$'),
  clave_version smallint not null check (clave_version=1),
  clave_evidencia jsonb not null check (jsonb_typeof(clave_evidencia)='object'),
  clave_sha256 text not null check (clave_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  actor_parte_usuario_id uuid not null,
  aplicada_operacion_id uuid,
  creado_at timestamptz not null default clock_timestamp(),
  actualizado_at timestamptz not null default clock_timestamp(),
  constraint alq_hecho_idempotente_v2_clave_uq
    unique(namespace,clave_version,clave_sha256),
  constraint alq_hecho_idempotente_v2_actor_fk foreign key(actor_parte_usuario_id)
    references alq.alq_parte_usuario(id) on delete restrict
);

alter table alq.alq_operacion
  add column hecho_id uuid,
  add column intento integer,
  add column expires_at timestamptz;

alter table alq.alq_operacion
  add constraint alq_operacion_hecho_fk foreign key(hecho_id)
    references alq_private.alq_hecho_idempotente_v2(id) on delete restrict,
  add constraint alq_operacion_v2_forma_ck check (
    (hecho_id is null and intento is null)
    or (hecho_id is not null and intento is not null and intento>0)),
  add constraint alq_operacion_expiry_ck check (
    estado<>'preparada' or expires_at is not null),
  add constraint alq_operacion_hecho_intento_uq unique(hecho_id,intento),
  add constraint alq_operacion_id_hecho_uq unique(id,hecho_id),
  add constraint alq_operacion_id_hecho_request_uq unique(id,hecho_id,request_id);

create unique index alq_operacion_hecho_preparada_uq
  on alq.alq_operacion(hecho_id) where hecho_id is not null and estado='preparada';
create unique index alq_operacion_hecho_aplicada_uq
  on alq.alq_operacion(hecho_id) where hecho_id is not null and estado='aplicada';
create index alq_operacion_expires_ix
  on alq.alq_operacion(expires_at) where estado='preparada';

alter table alq_private.alq_hecho_idempotente_v2
  add constraint alq_hecho_idempotente_v2_aplicada_fk
  foreign key(aplicada_operacion_id,id)
  references alq.alq_operacion(id,hecho_id) on delete restrict;

create table alq_private.alq_operacion_evento_v2 (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  namespace text not null,
  clave_version smallint not null check (clave_version=1),
  clave_sha256 text not null check (clave_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  run_id uuid,
  hecho_id uuid,
  operacion_id uuid,
  operacion_request_id uuid,
  accion text not null check (accion in
    ('preparar','aplicar','cancelar','reintentar','sanear','consulta')),
  actor_efectivo_parte_usuario_id uuid,
  capacidad_snapshot jsonb not null default '{}'::jsonb,
  ocurrido_at timestamptz not null default clock_timestamp(),
  codigo text,
  comando_request_id uuid,
  comando_sha256 text,
  envelope jsonb not null check (jsonb_typeof(envelope)='object'),
  latencia_ms bigint check (latencia_ms is null or latencia_ms>=0),
  constraint alq_operacion_evento_v2_ids_ck check (
    (hecho_id is null and operacion_id is null and operacion_request_id is null)
    or (hecho_id is not null and operacion_id is not null and operacion_request_id is not null)),
  constraint alq_operacion_evento_v2_comando_ck check (
    (comando_request_id is null)=(comando_sha256 is null)
    and (comando_sha256 is null or comando_sha256 ~ '^[0-9a-f]{64}$')
    and (comando_request_id is null or actor_efectivo_parte_usuario_id is not null)
    and (comando_request_id is null
      or (envelope?'comando_request_id' and
          envelope->>'comando_request_id' is not distinct from comando_request_id::text))),
  constraint alq_operacion_evento_v2_capacidad_ck check (
    jsonb_typeof(capacidad_snapshot)='object'),
  constraint alq_operacion_evento_v2_actor_fk foreign key(actor_efectivo_parte_usuario_id)
    references alq.alq_parte_usuario(id) on delete restrict,
  constraint alq_operacion_evento_v2_intento_fk
    foreign key(operacion_id,hecho_id,operacion_request_id)
    references alq.alq_operacion(id,hecho_id,request_id) on delete restrict
);

create unique index alq_operacion_evento_v2_comando_uq
  on alq_private.alq_operacion_evento_v2(comando_request_id)
  where comando_request_id is not null;
create index alq_operacion_evento_v2_clave_ix
  on alq_private.alq_operacion_evento_v2(namespace,clave_version,clave_sha256,ocurrido_at);
create index alq_operacion_evento_v2_hecho_ix
  on alq_private.alq_operacion_evento_v2(hecho_id,ocurrido_at);
create index alq_operacion_evento_v2_run_ix
  on alq_private.alq_operacion_evento_v2(run_id) where run_id is not null;

alter table alq_private.alq_hecho_idempotente_v2 enable row level security;
alter table alq_private.alq_hecho_idempotente_v2 force row level security;
alter table alq_private.alq_operacion_evento_v2 enable row level security;
alter table alq_private.alq_operacion_evento_v2 force row level security;
revoke all on alq_private.alq_hecho_idempotente_v2 from public,anon,authenticated,service_role;
revoke all on alq_private.alq_operacion_evento_v2 from public,anon,authenticated,service_role;

-- --------------------------------------------------------------------------
-- Snapshot server-owned de cuenta custodiada (T01/T02).
-- --------------------------------------------------------------------------

alter table alq.alq_transaccion_caja
  add column cuenta_validacion_version smallint,
  add column cuenta_validada_activa_at timestamptz;

alter table alq.alq_transaccion_caja
  add constraint alq_transaccion_cuenta_validacion_ck check (
    (cuenta_validacion_version is null and cuenta_validada_activa_at is null)
    or (cuenta_validacion_version=1 and
       ((ambito='custodiada' and cuenta_validada_activa_at is not null)
        or (ambito='externa_informativa' and cuenta_validada_activa_at is null)))) not valid;

comment on column alq.alq_transaccion_caja.cuenta_validacion_version is
  'Server-owned. NULL identifica legado pre-F1-A; 1 identifica validación F1-A.';
comment on column alq.alq_transaccion_caja.cuenta_validada_activa_at is
  'Server-owned. Instante en que la cuenta custodiada fue bloqueada y observada activa.';

alter table alq.alq_transaccion_caja
  validate constraint alq_transaccion_cuenta_validacion_ck;

create function alq_private.alq_transaccion_cuenta_snapshot_f1a_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_moneda text; v_activa boolean;
begin
  if tg_op='INSERT' then
    if new.ambito='externa_informativa' then
      new.cuenta_validacion_version:=1;
      new.cuenta_validada_activa_at:=null;
      return new;
    end if;
    select c.moneda,c.activa into v_moneda,v_activa
    from alq.alq_cuenta_custodia c where c.id=new.cuenta_custodia_id for update;
    if not found then return new; end if; -- La FK conserva su SQLSTATE nominal.
    if new.moneda<>v_moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE';
    end if;
    if not v_activa then
      raise exception using errcode='P0001',message='ALQ_F1A_T02_CUENTA_INACTIVA';
    end if;
    new.cuenta_validacion_version:=1;
    new.cuenta_validada_activa_at:=clock_timestamp();
    return new;
  end if;

  if (new.ambito,new.cuenta_custodia_id,new.moneda,
      new.cuenta_validacion_version,new.cuenta_validada_activa_at)
     is distinct from
     (old.ambito,old.cuenta_custodia_id,old.moneda,
      old.cuenta_validacion_version,old.cuenta_validada_activa_at) then
    raise exception using errcode='P0001',message='ALQ_F1A_T02_SNAPSHOT_INMUTABLE';
  end if;
  return new;
end
$fn$;

create trigger alq_transaccion_cuenta_snapshot_bi
before insert on alq.alq_transaccion_caja for each row
execute function alq_private.alq_transaccion_cuenta_snapshot_f1a_v1();
create trigger alq_transaccion_cuenta_tupla_inmutable_bu
before update on alq.alq_transaccion_caja for each row
execute function alq_private.alq_transaccion_cuenta_snapshot_f1a_v1();

-- Contexto efímero del dispatcher. Autoriza INSERT financieros únicamente
-- mientras alq_aplicar_operacion_v1 está ejecutando esa misma operación. No es
-- un GUC falsificable: se valida owner, persistencia y forma de la tabla temp.
create function alq_private.alq_f1a_writer_context_v1(
  p_accion text,p_operacion_id uuid)
returns boolean language plpgsql volatile security definer set search_path=''
as $fn$
declare v_oid oid; v_owner oid; v_persistencia "char";
        v_id uuid; v_depth integer;
begin
  if p_operacion_id is null or p_accion is null
     or p_accion not in ('enter','exit','check') then
    raise exception using errcode='P0001',message='ALQ_F1A_WRITER_CONTEXT_INVALIDO';
  end if;
  v_oid:=pg_catalog.to_regclass('pg_temp.alq_f1a_writer_context');
  if v_oid is null and p_accion='enter' then
    execute 'create temporary table pg_temp.alq_f1a_writer_context('
      'singleton boolean primary key check(singleton),operacion_id uuid not null,'
      'depth integer not null check(depth>0)) on commit delete rows';
    v_oid:=pg_catalog.to_regclass('pg_temp.alq_f1a_writer_context');
  elsif v_oid is null then
    return false;
  end if;
  select c.relowner,c.relpersistence into v_owner,v_persistencia
  from pg_catalog.pg_class c where c.oid=v_oid;
  if v_owner is distinct from pg_catalog.to_regrole('postgres')::oid
     or v_persistencia is distinct from 't'::"char"
     or (select count(*) from pg_catalog.pg_attribute a
         where a.attrelid=v_oid and a.attnum>0 and not a.attisdropped)<>3
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid=v_oid
         and a.attname='operacion_id' and a.atttypid='uuid'::regtype and a.attnotnull)
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid=v_oid
         and a.attname='depth' and a.atttypid='integer'::regtype and a.attnotnull) then
    raise exception using errcode='P0001',message='ALQ_F1A_WRITER_CONTEXT_INVALIDO';
  end if;
  execute 'select operacion_id,depth from pg_temp.alq_f1a_writer_context '
          'where singleton' into v_id,v_depth;
  if p_accion='check' then
    return v_id is not distinct from p_operacion_id and coalesce(v_depth,0)>0;
  elsif p_accion='enter' then
    if v_id is null then
      execute 'insert into pg_temp.alq_f1a_writer_context values(true,$1,1)'
        using p_operacion_id;
    elsif v_id is distinct from p_operacion_id then
      raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
    else
      execute 'update pg_temp.alq_f1a_writer_context set depth=depth+1 where singleton';
    end if;
    return true;
  end if;
  if v_id is distinct from p_operacion_id or coalesce(v_depth,0)<1 then
    raise exception using errcode='P0001',message='ALQ_F1A_WRITER_CONTEXT_INVALIDO';
  elsif v_depth=1 then
    execute 'delete from pg_temp.alq_f1a_writer_context where singleton';
  else
    execute 'update pg_temp.alq_f1a_writer_context set depth=depth-1 where singleton';
  end if;
  return true;
end
$fn$;

-- Relación física writer→tabla para las superficies financieras. Evita que
-- DML privilegiado cuelgue un efecto de una operación preparada cuyo payload
-- no describe ese efecto y, además, garantiza que todo INSERT admitido use una
-- de las rutas cuyo grafo completo se bloquea antes de mutar.
create function alq_private.alq_f1a_tabla_permitida_operacion_v1(
  p_operacion text,p_tabla text)
returns boolean language sql immutable security definer set search_path=''
as $fn$
  select case p_tabla
    when 'alq_nota' then p_operacion='nota_emitir'
    when 'alq_credito_consumo' then p_operacion='credito_consumir'
    when 'alq_transaccion_caja' then p_operacion=any(array[
      'transaccion_registrar','giro_registrar','transferencia_interna',
      'reversa_con_reapertura','pago_multimoneda','credito_devolver',
      'deposito_liquidar_y_devolver','giro_a_propietario']::text[])
    when 'alq_aplicacion' then p_operacion=any(array[
      'aplicacion_asignar','giro_registrar','pago_multimoneda',
      'credito_devolver','giro_a_propietario']::text[])
    when 'alq_deposito_evento' then p_operacion=any(array[
      'deposito_evento_registrar','deposito_liquidar_y_devolver']::text[])
    when 'alq_deposito_liquidacion' then p_operacion=any(array[
      'deposito_liquidar','deposito_liquidar_y_devolver']::text[])
    when 'alq_aplicacion_reversa' then p_operacion='reversa_con_reapertura'
    when 'alq_cargo' then p_operacion='cargo_manual_emitir'
    when 'alq_conversion_moneda' then p_operacion=any(array[
      'conversion_registrar','pago_multimoneda']::text[])
    when 'alq_rendicion' then p_operacion=any(array[
      'rendicion_emitir','rendicion_corregir']::text[])
    when 'alq_credito' then false
    when 'alq_deposito_liquidacion_linea' then p_operacion='deposito_liquidar_y_devolver'
    when 'alq_rendicion_linea' then p_operacion=any(array[
      'rendicion_emitir','rendicion_corregir']::text[])
    else false end
$fn$;

create function alq_private.alq_f1a_operacion_hijo_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_estado text; v_hecho uuid; v_operacion text; v_payload jsonb;
        v_esperado numeric;
begin
  if tg_op='UPDATE' then
    if tg_table_name='alq_transaccion_caja' then
      if (new.ambito,new.cuenta_custodia_id,new.moneda,
          new.cuenta_validacion_version,new.cuenta_validada_activa_at)
         is distinct from
         (old.ambito,old.cuenta_custodia_id,old.moneda,
          old.cuenta_validacion_version,old.cuenta_validada_activa_at) then
        raise exception using errcode='P0001',message='ALQ_F1A_T02_SNAPSHOT_INMUTABLE';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then
    if old.operacion_id is null then return old; end if;
    select estado,hecho_id,operacion into v_estado,v_hecho,v_operacion from alq.alq_operacion
    where id=old.operacion_id for update nowait;
    if v_hecho is null and tg_table_name not in (
      'alq_nota','alq_credito_consumo','alq_transaccion_caja','alq_aplicacion',
      'alq_deposito_evento','alq_deposito_liquidacion','alq_aplicacion_reversa',
      'alq_cargo','alq_credito','alq_conversion_moneda','alq_rendicion') then return old; end if;
    if not found or v_estado<>'preparada' then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_HISTORICO';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and new.operacion_id is distinct from old.operacion_id then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_INMUTABLE';
  end if;
  if tg_op='INSERT' and new.operacion_id is not null then
    select estado,hecho_id,operacion,payload_normalizado
      into v_estado,v_hecho,v_operacion,v_payload from alq.alq_operacion
    where id=new.operacion_id for update nowait;
    if v_hecho is null and tg_table_name not in (
      'alq_nota','alq_credito_consumo','alq_transaccion_caja','alq_aplicacion',
      'alq_deposito_evento','alq_deposito_liquidacion','alq_aplicacion_reversa',
      'alq_cargo','alq_credito','alq_conversion_moneda','alq_rendicion') then return new; end if;
    if not found or v_estado<>'preparada' then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_TARDIO';
    end if;
    if (v_operacion=any(alq_private.alq_f1a_operaciones_lock_v1())
        or v_operacion='conversion_registrar')
       and not (v_operacion='d0_fixture' and
         alq_private.alq_f1a_qualification_run_id_v1() is not null)
       and not alq_private.alq_f1a_writer_context_v1('check',new.operacion_id) then
      raise exception using errcode='P0001',message='ALQ_F1A_DML_FINANCIERO_DIRECTO_PROHIBIDO';
    end if;
    if v_hecho is null and not
       alq_private.alq_f1a_tabla_permitida_operacion_v1(v_operacion,tg_table_name)
       and not (v_operacion='d0_fixture' and
         alq_private.alq_f1a_qualification_run_id_v1() is not null) then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_INCOMPATIBLE';
    end if;
    if v_operacion=any(alq_private.alq_f1a_operaciones_lock_v1()) then
      perform alq_private.alq_f1a_lock_revalidar_payload_v1(v_operacion,v_payload);
    end if;
    if v_hecho is not null and not
       alq_private.alq_f1a_tabla_permitida_operacion_v2(v_operacion,tg_table_name) then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_INCOMPATIBLE';
    end if;
  elsif tg_op='UPDATE' and new.operacion_id is not null then
    select estado,hecho_id,operacion into v_estado,v_hecho,v_operacion from alq.alq_operacion
    where id=new.operacion_id for update nowait;
    if v_hecho is null and tg_table_name not in (
      'alq_nota','alq_credito_consumo','alq_transaccion_caja','alq_aplicacion',
      'alq_deposito_evento','alq_deposito_liquidacion','alq_aplicacion_reversa',
      'alq_cargo','alq_credito','alq_conversion_moneda','alq_rendicion') then return new; end if;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_TARDIO';
    end if;
    if v_estado<>'preparada' then
      if tg_table_name='alq_cargo'
         and (to_jsonb(new)-'saldo_pendiente')=(to_jsonb(old)-'saldo_pendiente') then
        select c.monto
          -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a where a.cargo_id=c.id),0)
          -coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.cargo_id=c.id),0)
          -coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='credito'),0)
          +coalesce((select sum(n.monto) from alq.alq_nota n where n.cargo_id=c.id and n.tipo='debito'),0)
          +coalesce((select sum(ar.importe_destino_reabierto)
            from alq.alq_aplicacion_reversa ar
            join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
            join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
            where a.cargo_id=c.id and rv.estado='confirmada'),0)
          into v_esperado from alq.alq_cargo c where c.id=old.id;
        if new.saldo_pendiente is distinct from v_esperado then
          raise exception using errcode='P0001',message='ALQ_F1A_PROYECCION_CARGO_INVALIDA';
        end if;
      elsif tg_table_name='alq_credito'
         and (to_jsonb(new)-'saldo_pendiente')=(to_jsonb(old)-'saldo_pendiente') then
        select cr.monto_original
          -coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.credito_id=cr.id),0)
          -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a
            join alq.alq_transaccion_caja t on t.id=a.transaccion_id
            where a.credito_id=cr.id and t.direccion='salida' and t.estado='confirmada'),0)
          +coalesce((select sum(ar.importe_destino_reabierto)
            from alq.alq_aplicacion_reversa ar
            join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
            join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
            where a.credito_id=cr.id and rv.estado='confirmada'),0)
          into v_esperado from alq.alq_credito cr where cr.id=old.id;
        if new.saldo_pendiente is distinct from v_esperado then
          raise exception using errcode='P0001',message='ALQ_F1A_PROYECCION_CREDITO_INVALIDA';
        end if;
      else
        raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_HISTORICO';
      end if;
    end if;
  end if;
  return new;
exception when lock_not_available then
  raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
end
$fn$;

do $alq_f1a_child_triggers$
declare v_table text;
begin
  foreach v_table in array array[
    'alq_agenda_ocurrencia','alq_agenda_regla','alq_ajuste',
    'alq_nota','alq_credito_consumo','alq_transaccion_caja','alq_aplicacion',
    'alq_deposito_evento','alq_deposito_liquidacion','alq_aplicacion_reversa',
    'alq_cargo','alq_credito','alq_conversion_moneda','alq_rendicion',
    'alq_comunicado','alq_comunicado_mensaje','alq_export_baja','alq_factura_externa',
    'alq_indice_observacion','alq_journal','alq_notificacion','alq_rescision',
    'alq_servicio_cuenta','alq_servicio_factura'
  ]::text[] loop
    execute format('create trigger %I before insert or update or delete on alq.%I '
      'for each row execute function alq_private.alq_f1a_operacion_hijo_guard_v1()',
      'alq_f1a_operacion_hijo_'||v_table||'_biu',v_table);
  end loop;
end
$alq_f1a_child_triggers$;

create function alq_private.alq_f1a_hijo_indirecto_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_parent uuid; v_op uuid; v_estado text; v_operacion text;
        v_payload jsonb;
begin
  if tg_table_name='alq_deposito_liquidacion_linea' then
    v_parent:=case when tg_op='DELETE' then old.liquidacion_id else new.liquidacion_id end;
    if tg_op='UPDATE' and new.liquidacion_id is distinct from old.liquidacion_id then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_INMUTABLE';
    end if;
    select operacion_id into v_op from alq.alq_deposito_liquidacion where id=v_parent;
  else
    v_parent:=case when tg_op='DELETE' then old.rendicion_id else new.rendicion_id end;
    if tg_op='UPDATE' and new.rendicion_id is distinct from old.rendicion_id then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_INMUTABLE';
    end if;
    select operacion_id into v_op from alq.alq_rendicion where id=v_parent;
  end if;
  if v_op is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  select estado,operacion,payload_normalizado
    into v_estado,v_operacion,v_payload
  from alq.alq_operacion where id=v_op for update nowait;
  if not found or v_estado<>'preparada' then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_HIJO_TARDIO';
  end if;
  if (v_operacion=any(alq_private.alq_f1a_operaciones_lock_v1())
      or v_operacion='conversion_registrar')
     and not (v_operacion='d0_fixture' and
       alq_private.alq_f1a_qualification_run_id_v1() is not null)
     and not alq_private.alq_f1a_writer_context_v1('check',v_op) then
    raise exception using errcode='P0001',message='ALQ_F1A_DML_FINANCIERO_DIRECTO_PROHIBIDO';
  end if;
  if not alq_private.alq_f1a_tabla_permitida_operacion_v1(
       v_operacion,tg_table_name)
     and not (v_operacion='d0_fixture' and
       alq_private.alq_f1a_qualification_run_id_v1() is not null) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_INCOMPATIBLE';
  end if;
  if tg_op='INSERT' then
    if v_operacion=any(alq_private.alq_f1a_operaciones_lock_v1()) then
      perform alq_private.alq_f1a_lock_revalidar_payload_v1(v_operacion,v_payload);
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
exception when lock_not_available then
  raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
end
$fn$;

create trigger alq_f1a_operacion_hijo_deposito_linea_biud
before insert or update or delete on alq.alq_deposito_liquidacion_linea
for each row execute function alq_private.alq_f1a_hijo_indirecto_guard_v1();
create trigger alq_f1a_operacion_hijo_rendicion_linea_biud
before insert or update or delete on alq.alq_rendicion_linea
for each row execute function alq_private.alq_f1a_hijo_indirecto_guard_v1();

create function alq_private.alq_f1a_operacion_tiene_efectos_v1(p_operacion_id uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
  select exists(select 1 from alq.alq_agenda_ocurrencia where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_agenda_regla where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_ajuste where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_nota where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_credito_consumo where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_transaccion_caja where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_aplicacion where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_deposito_evento where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_deposito_liquidacion where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_aplicacion_reversa where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_cargo where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_credito where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_conversion_moneda where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_rendicion where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_comunicado where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_comunicado_mensaje where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_export_baja where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_factura_externa where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_indice_observacion where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_journal where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_notificacion where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_rescision where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_servicio_cuenta where operacion_id=p_operacion_id)
      or exists(select 1 from alq.alq_servicio_factura where operacion_id=p_operacion_id)
$fn$;

create function alq_private.alq_f1a_tabla_permitida_operacion_v2(
  p_operacion text,p_tabla text)
returns boolean language sql immutable security definer set search_path=''
as $fn$
  select p_tabla='alq_journal' or case p_operacion
    when 'nota_emitir' then p_tabla='alq_nota'
    when 'credito_consumir' then p_tabla='alq_credito_consumo'
    when 'transferencia_interna' then p_tabla='alq_transaccion_caja'
    when 'deposito_evento_registrar' then p_tabla='alq_deposito_evento'
    when 'deposito_liquidar_y_devolver' then p_tabla in
      ('alq_deposito_liquidacion','alq_deposito_liquidacion_linea',
       'alq_deposito_evento','alq_transaccion_caja')
    when 'reversa_con_reapertura' then p_tabla in
      ('alq_transaccion_caja','alq_aplicacion_reversa')
    when 'cargo_manual_emitir' then p_tabla='alq_cargo'
    when 'pago_multimoneda' then p_tabla in
      ('alq_transaccion_caja','alq_aplicacion','alq_conversion_moneda')
    else false end
$fn$;

create function alq_private.alq_f1a_efecto_final_valido_v2(
  p_operacion_id uuid,p_operacion text)
returns boolean language plpgsql stable security definer set search_path=''
as $fn$
declare v_ok boolean:=false; v_payload jsonb; v_actor uuid; v_result jsonb;
begin
  select o.payload_normalizado,o.actor_parte_usuario_id,o.resultado
    into v_payload,v_actor,v_result from alq.alq_operacion o where o.id=p_operacion_id;
  if not found then return false; end if;
  if (exists(select 1 from alq.alq_nota where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_nota'))
     or (exists(select 1 from alq.alq_credito_consumo where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_credito_consumo'))
     or (exists(select 1 from alq.alq_transaccion_caja where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_transaccion_caja'))
     or (exists(select 1 from alq.alq_aplicacion where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_aplicacion'))
     or (exists(select 1 from alq.alq_deposito_evento where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_deposito_evento'))
     or (exists(select 1 from alq.alq_deposito_liquidacion where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_deposito_liquidacion'))
     or (exists(select 1 from alq.alq_aplicacion_reversa where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_aplicacion_reversa'))
     or (exists(select 1 from alq.alq_cargo where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_cargo'))
     or (exists(select 1 from alq.alq_credito where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_credito'))
     or (exists(select 1 from alq.alq_conversion_moneda where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_conversion_moneda'))
     or (exists(select 1 from alq.alq_rendicion where operacion_id=p_operacion_id)
        and not alq_private.alq_f1a_tabla_permitida_operacion_v2(p_operacion,'alq_rendicion')) then
    return false;
  end if;
  -- Ninguna de las tablas operativas fuera de la allowlist de ocho puede
  -- quedar ligada a un intento v2.
  if exists (
    select 1 from (values
      ('alq_agenda_ocurrencia'),('alq_agenda_regla'),('alq_ajuste'),
      ('alq_comunicado'),('alq_comunicado_mensaje'),('alq_export_baja'),
      ('alq_factura_externa'),('alq_indice_observacion'),
      ('alq_notificacion'),('alq_rescision'),('alq_servicio_cuenta'),
      ('alq_servicio_factura')) q(tabla)
    where case q.tabla
      when 'alq_agenda_ocurrencia' then exists(select 1 from alq.alq_agenda_ocurrencia where operacion_id=p_operacion_id)
      when 'alq_agenda_regla' then exists(select 1 from alq.alq_agenda_regla where operacion_id=p_operacion_id)
      when 'alq_ajuste' then exists(select 1 from alq.alq_ajuste where operacion_id=p_operacion_id)
      when 'alq_comunicado' then exists(select 1 from alq.alq_comunicado where operacion_id=p_operacion_id)
      when 'alq_comunicado_mensaje' then exists(select 1 from alq.alq_comunicado_mensaje where operacion_id=p_operacion_id)
      when 'alq_export_baja' then exists(select 1 from alq.alq_export_baja where operacion_id=p_operacion_id)
      when 'alq_factura_externa' then exists(select 1 from alq.alq_factura_externa where operacion_id=p_operacion_id)
      when 'alq_indice_observacion' then exists(select 1 from alq.alq_indice_observacion where operacion_id=p_operacion_id)
      when 'alq_notificacion' then exists(select 1 from alq.alq_notificacion where operacion_id=p_operacion_id)
      when 'alq_rescision' then exists(select 1 from alq.alq_rescision where operacion_id=p_operacion_id)
      when 'alq_servicio_cuenta' then exists(select 1 from alq.alq_servicio_cuenta where operacion_id=p_operacion_id)
      when 'alq_servicio_factura' then exists(select 1 from alq.alq_servicio_factura where operacion_id=p_operacion_id)
      else false end) then return false;
  end if;

  case p_operacion
    when 'nota_emitir' then
      v_ok=(select count(*)=1 and bool_and(n.tipo=v_payload->>'tipo'
        and n.cargo_id=(v_payload->>'cargo_id')::uuid
        and n.monto=(v_payload->>'monto')::numeric and n.moneda=v_payload->>'moneda'
        and n.motivo is not distinct from v_payload->>'motivo'
        and n.aprobador_parte_usuario_id=v_actor
        and (not (v_payload?'fecha') or n.fecha=(v_payload->>'fecha')::timestamptz)
        and v_result=jsonb_build_object('id',n.id,'operacion','nota_emitir'))
        from alq.alq_nota n where n.operacion_id=p_operacion_id);
    when 'credito_consumir' then
      v_ok=(select count(*)=1 and bool_and(cc.credito_id=(v_payload->>'credito_id')::uuid
        and cc.cargo_id=(v_payload->>'cargo_id')::uuid
        and cc.monto=(v_payload->>'monto')::numeric and cc.moneda=v_payload->>'moneda'
        and v_result=jsonb_build_object('id',cc.id,'operacion','credito_consumir'))
        from alq.alq_credito_consumo cc where cc.operacion_id=p_operacion_id);
    when 'transferencia_interna' then
      select count(*)=2 and count(distinct transferencia_id)=1
        and count(*) filter(where direccion='salida'
          and cuenta_custodia_id=(v_payload->>'cuenta_origen_id')::uuid)=1
        and count(*) filter(where direccion='entrada'
          and cuenta_custodia_id=(v_payload->>'cuenta_destino_id')::uuid)=1
        and bool_and(ambito='custodiada' and estado='confirmada'
          and moneda=v_payload->>'moneda' and monto=(v_payload->>'monto')::numeric
          and contraparte_parte_id=(v_payload->>'contraparte_parte_id')::uuid
          and beneficiario_parte_id=(v_payload->>'beneficiario_parte_id')::uuid
          and fecha=(v_payload->>'fecha')::timestamptz and medio=v_payload->>'medio'
          and reversa_de is null and comprobante_documento_id is null)
        and bool_and(transferencia_id=(v_result->>'transferencia_id')::uuid)
        and count(*) filter(where id=(v_result->>'salida_id')::uuid and direccion='salida')=1
        and count(*) filter(where id=(v_result->>'entrada_id')::uuid and direccion='entrada')=1
        and v_result=jsonb_build_object('transferencia_id',min(transferencia_id),
          'salida_id',min(id) filter(where direccion='salida'),
          'entrada_id',min(id) filter(where direccion='entrada'))
        into v_ok from alq.alq_transaccion_caja where operacion_id=p_operacion_id;
    when 'deposito_evento_registrar' then
      v_ok=(select count(*)=1 and bool_and(e.deposito_id=(v_payload->>'deposito_id')::uuid
        and e.tipo=v_payload->>'tipo' and e.monto=(v_payload->>'monto')::numeric
        and e.moneda=v_payload->>'moneda'
        and e.transaccion_id is not distinct from nullif(v_payload->>'transaccion_id','')::uuid
        and e.contrato_sucesor_id is not distinct from
          nullif(v_payload->>'contrato_sucesor_id','')::uuid
        and e.evidencia_documento_id is not distinct from
          nullif(v_payload->>'evidencia_documento_id','')::uuid
        and v_result=jsonb_build_object('id',e.id,'operacion','deposito_evento_registrar'))
        from alq.alq_deposito_evento e where e.operacion_id=p_operacion_id);
    when 'deposito_liquidar_y_devolver' then
      v_ok=(select count(*)=1 and bool_and(l.deposito_id=(v_payload->>'deposito_id')::uuid
        and l.fecha=(v_payload->>'fecha')::timestamptz and l.estado='pagada'
        and l.documento_id is not distinct from nullif(v_payload->>'documento_id','')::uuid
        and v_result=jsonb_build_object('id',l.id,'operacion','deposito_liquidar_y_devolver'))
        from alq.alq_deposito_liquidacion l
        where l.operacion_id=p_operacion_id)
        and (select coalesce(jsonb_agg(jsonb_build_object(
              'concepto',x.concepto,'monto',x.monto,'moneda',x.moneda,
              'evidencia_documento_id',x.evidencia_documento_id,
              'cargo_residual_id',x.cargo_residual_id)
              order by jsonb_build_object('concepto',x.concepto,'monto',x.monto,
                'moneda',x.moneda,'evidencia_documento_id',x.evidencia_documento_id,
                'cargo_residual_id',x.cargo_residual_id)::text),'[]'::jsonb)
          from alq.alq_deposito_liquidacion_linea x
          join alq.alq_deposito_liquidacion l on l.id=x.liquidacion_id
          where l.operacion_id=p_operacion_id)
          =(select coalesce(jsonb_agg(jsonb_build_object(
              'concepto',i->>'concepto','monto',(i->>'monto')::numeric,
              'moneda',i->>'moneda',
              'evidencia_documento_id',nullif(i->>'evidencia_documento_id','')::uuid,
              'cargo_residual_id',nullif(i->>'cargo_residual_id','')::uuid)
              order by jsonb_build_object('concepto',i->>'concepto',
                'monto',(i->>'monto')::numeric,'moneda',i->>'moneda',
                'evidencia_documento_id',nullif(i->>'evidencia_documento_id','')::uuid,
                'cargo_residual_id',nullif(i->>'cargo_residual_id','')::uuid)::text),'[]'::jsonb)
            from jsonb_array_elements(coalesce(v_payload->'lineas','[]'::jsonb)) i)
        and (select count(*)=1 and bool_and(t.direccion='salida'
          and t.ambito='custodiada' and t.estado='confirmada'
          and t.cuenta_custodia_id=(v_payload->>'cuenta_custodia_id')::uuid
          and t.moneda=v_payload->>'moneda' and t.monto=(v_payload->>'monto_devolver')::numeric
          and t.fecha=(v_payload->>'fecha')::timestamptz and t.medio=v_payload->>'medio'
          and t.contraparte_parte_id=(v_payload->>'contraparte_parte_id')::uuid
          and t.beneficiario_parte_id=(v_payload->>'beneficiario_parte_id')::uuid
          and t.comprobante_documento_id is not distinct from
            nullif(v_payload->>'comprobante_documento_id','')::uuid
          and t.reversa_de is null and t.transferencia_id is null)
          from alq.alq_transaccion_caja t where t.operacion_id=p_operacion_id)
        and (select count(*)=1 and bool_and(e.tipo='devolucion'
          and e.deposito_id=(v_payload->>'deposito_id')::uuid
          and e.moneda=v_payload->>'moneda' and e.monto=(v_payload->>'monto_devolver')::numeric
          and e.evidencia_documento_id is not distinct from
            nullif(v_payload->>'comprobante_documento_id','')::uuid
          and e.contrato_sucesor_id is null
          and exists(select 1 from alq.alq_transaccion_caja t
            where t.id=e.transaccion_id and t.operacion_id=p_operacion_id))
          from alq.alq_deposito_evento e where e.operacion_id=p_operacion_id);
    when 'reversa_con_reapertura' then
      v_ok=(select count(*)=1 and bool_and(t.reversa_de=(v_payload->>'original_id')::uuid
        and t.monto=(v_payload->>'monto')::numeric and t.fecha=(v_payload->>'fecha')::timestamptz
        and t.estado='confirmada' and t.medio=v_payload->>'medio'
        and t.direccion=case o.direccion when 'entrada' then 'salida' else 'entrada' end
        and t.ambito=o.ambito and t.cuenta_custodia_id is not distinct from o.cuenta_custodia_id
        and t.moneda=o.moneda and t.transferencia_id is null
        and t.contraparte_parte_id=(v_payload->>'contraparte_parte_id')::uuid
        and t.beneficiario_parte_id=(v_payload->>'beneficiario_parte_id')::uuid
        and t.comprobante_documento_id is not distinct from
          nullif(v_payload->>'comprobante_documento_id','')::uuid
        and v_result=jsonb_build_object('id',t.id,'operacion','reversa_con_reapertura'))
        from alq.alq_transaccion_caja t
        join alq.alq_transaccion_caja o on o.id=t.reversa_de
        where t.operacion_id=p_operacion_id)
        and (select coalesce(jsonb_agg(jsonb_build_object(
              'aplicacion_original_id',ar.aplicacion_original_id,
              'importe_origen_revertido',ar.importe_origen_revertido,
              'moneda_origen',ar.moneda_origen,
              'importe_destino_reabierto',ar.importe_destino_reabierto,
              'moneda_destino',ar.moneda_destino,
              'conversion_reversa_id',ar.conversion_reversa_id)
              order by jsonb_build_object('aplicacion_original_id',ar.aplicacion_original_id,
                'importe_origen_revertido',ar.importe_origen_revertido,
                'moneda_origen',ar.moneda_origen,
                'importe_destino_reabierto',ar.importe_destino_reabierto,
                'moneda_destino',ar.moneda_destino,
                'conversion_reversa_id',ar.conversion_reversa_id)::text),'[]'::jsonb)
          from alq.alq_aplicacion_reversa ar where ar.operacion_id=p_operacion_id)
          =(select coalesce(jsonb_agg(jsonb_build_object(
              'aplicacion_original_id',(i->>'aplicacion_original_id')::uuid,
              'importe_origen_revertido',(i->>'importe_origen_revertido')::numeric,
              'moneda_origen',i->>'moneda_origen',
              'importe_destino_reabierto',(i->>'importe_destino_reabierto')::numeric,
              'moneda_destino',i->>'moneda_destino',
              'conversion_reversa_id',nullif(i->>'conversion_reversa_id','')::uuid)
              order by jsonb_build_object(
                'aplicacion_original_id',(i->>'aplicacion_original_id')::uuid,
                'importe_origen_revertido',(i->>'importe_origen_revertido')::numeric,
                'moneda_origen',i->>'moneda_origen',
                'importe_destino_reabierto',(i->>'importe_destino_reabierto')::numeric,
                'moneda_destino',i->>'moneda_destino',
                'conversion_reversa_id',nullif(i->>'conversion_reversa_id','')::uuid)::text),'[]'::jsonb)
            from jsonb_array_elements(coalesce(v_payload->'reaperturas','[]'::jsonb)) i);
    when 'cargo_manual_emitir' then
      v_ok=(select count(*)=1 and bool_and(c.propiedad_id=(v_payload->>'propiedad_id')::uuid
        and c.contrato_id is not distinct from nullif(v_payload->>'contrato_id','')::uuid
        and c.periodo_id is not distinct from nullif(v_payload->>'periodo_id','')::uuid
        and c.deudor_parte_id=(v_payload->>'deudor_parte_id')::uuid
        and c.acreedor_parte_id=(v_payload->>'acreedor_parte_id')::uuid
        and c.ambito=v_payload->>'ambito' and c.concepto=v_payload->>'concepto'
        and c.moneda=v_payload->>'moneda' and c.monto=(v_payload->>'monto')::numeric
        and c.saldo_pendiente=(v_payload->>'monto')::numeric
        and c.vence_at=(v_payload->>'vence_at')::timestamptz and c.origen='admin'
        and c.snapshot_regla=coalesce(v_payload->'snapshot_regla','{}'::jsonb)
        and v_result=jsonb_build_object('id',c.id,'operacion','cargo_manual_emitir'))
        from alq.alq_cargo c where c.operacion_id=p_operacion_id);
    when 'pago_multimoneda' then
      v_ok=(select count(*)=1 and bool_and(t.direccion='entrada'
        and t.ambito=v_payload->>'ambito' and t.moneda=v_payload->>'moneda'
        and t.monto=(v_payload->>'monto')::numeric
        and t.contraparte_parte_id=(v_payload->>'contraparte_parte_id')::uuid
        and t.beneficiario_parte_id=(v_payload->>'beneficiario_parte_id')::uuid
        and t.cuenta_custodia_id is not distinct from
          nullif(v_payload->>'cuenta_custodia_id','')::uuid
        and t.fecha=(v_payload->>'fecha')::timestamptz and t.medio=v_payload->>'medio'
        and t.comprobante_documento_id is not distinct from
          nullif(v_payload->>'comprobante_documento_id','')::uuid
        and t.estado='confirmada' and t.reversa_de is null and t.transferencia_id is null
        and v_result=jsonb_build_object('id',t.id,'operacion','pago_multimoneda'))
        from alq.alq_transaccion_caja t where t.operacion_id=p_operacion_id)
        and not exists (
          select 1 from (
            select jsonb_build_object(
              'cargo_id',a.cargo_id,'credito_id',a.credito_id,
              'deposito_evento_id',a.deposito_evento_id,'rendicion_id',a.rendicion_id,
              'importe_origen',a.importe_origen,'moneda_origen',a.moneda_origen,
              'importe_destino',a.importe_destino,'moneda_destino',a.moneda_destino,
              'conversion',case when cv.id is null then null else jsonb_build_object(
                'importe_origen',cv.importe_origen,'moneda_origen',cv.moneda_origen,
                'importe_destino',cv.importe_destino,'moneda_destino',cv.moneda_destino,
                'tasa',cv.tasa,'fuente',cv.fuente,'fecha',cv.fecha,
                'regla_redondeo',cv.regla_redondeo,
                'evidencia_documento_id',cv.evidencia_documento_id) end) obj,
              count(*) n
            from alq.alq_aplicacion a
            left join alq.alq_conversion_moneda cv on cv.id=a.conversion_id
            where a.operacion_id=p_operacion_id group by 1
          ) a full join (
            select jsonb_build_object(
              'cargo_id',nullif(i->>'cargo_id','')::uuid,
              'credito_id',null::uuid,
              -- pago_multimoneda sólo admite destino cargo o crédito. El
              -- cliente no puede ampliar la forma usando otros destinos de
              -- alq_aplicacion.
              'deposito_evento_id',null::uuid,
              'rendicion_id',null::uuid,
              'importe_origen',(i->>'importe_origen')::numeric,
              'moneda_origen',i->>'moneda_origen',
              'importe_destino',(i->>'importe_destino')::numeric,
              'moneda_destino',i->>'moneda_destino',
              'conversion',case when i?'conversion' then jsonb_build_object(
                'importe_origen',(i#>>'{conversion,importe_origen}')::numeric,
                'moneda_origen',i#>>'{conversion,moneda_origen}',
                'importe_destino',(i#>>'{conversion,importe_destino}')::numeric,
                'moneda_destino',i#>>'{conversion,moneda_destino}',
                'tasa',(i#>>'{conversion,tasa}')::numeric,
                'fuente',i#>>'{conversion,fuente}',
                'fecha',(i#>>'{conversion,fecha}')::timestamptz,
                'regla_redondeo',i#>>'{conversion,regla_redondeo}',
                'evidencia_documento_id',nullif(i#>>'{conversion,evidencia_documento_id}','')::uuid)
                else null end) obj,
              count(*) n
            from jsonb_array_elements(coalesce(v_payload->'aplicaciones','[]'::jsonb)) i
            group by 1
          ) p using (obj) where a.n is distinct from p.n);
    else v_ok:=false;
  end case;
  if not coalesce(v_ok,false) then return false; end if;
  if p_operacion='transferencia_interna' and exists (
      select 1 from alq.alq_transaccion_caja t where t.operacion_id=p_operacion_id
        and t.transferencia_id is null) then return false;
  elsif p_operacion='pago_multimoneda' and (
      exists (select 1 from alq.alq_aplicacion a
        where a.operacion_id=p_operacion_id
          and (a.cargo_id is null or a.credito_id is not null
            or a.deposito_evento_id is not null or a.rendicion_id is not null))
      or
      exists (select 1 from alq.alq_aplicacion a
        left join alq.alq_transaccion_caja t on t.id=a.transaccion_id
        left join alq.alq_conversion_moneda c on c.id=a.conversion_id
        where a.operacion_id=p_operacion_id and
          (t.operacion_id is distinct from p_operacion_id
           or (a.conversion_id is not null and
             (c.operacion_id is distinct from p_operacion_id
              or c.aprobador_parte_usuario_id is distinct from v_actor))))
      or exists (select 1 from alq.alq_conversion_moneda c
        where c.operacion_id=p_operacion_id and not exists (
          select 1 from alq.alq_aplicacion a where a.operacion_id=p_operacion_id
            and a.conversion_id=c.id))) then return false;
  elsif p_operacion='reversa_con_reapertura' and (
      exists (select 1 from alq.alq_aplicacion_reversa ar
        left join alq.alq_transaccion_caja r on r.id=ar.reversa_transaccion_id
        where ar.operacion_id=p_operacion_id and r.operacion_id is distinct from p_operacion_id)
      or exists (select 1 from alq.alq_conversion_moneda c
        where c.operacion_id=p_operacion_id and not exists (
          select 1 from alq.alq_aplicacion_reversa ar
          where ar.operacion_id=p_operacion_id and ar.conversion_reversa_id=c.id))) then
    return false;
  elsif p_operacion='deposito_liquidar_y_devolver' and exists (
      select 1 from alq.alq_deposito_liquidacion l
      where l.operacion_id=p_operacion_id and (
        exists(select 1 from alq.alq_deposito_evento e
          where e.operacion_id=p_operacion_id and e.deposito_id<>l.deposito_id)
        or exists(select 1 from alq.alq_aplicacion a
          left join alq.alq_transaccion_caja t on t.id=a.transaccion_id
          where a.operacion_id=p_operacion_id and t.operacion_id is distinct from p_operacion_id)))
    then return false;
  end if;
  return (select count(*)=1 and bool_and(j.entidad='operacion'
      and j.entidad_id=p_operacion_id and j.evento=p_operacion
      and j.actor=o.actor_parte_usuario_id and j.antes is null
      and j.despues=o.resultado)
    from alq.alq_journal j join alq.alq_operacion o on o.id=j.operacion_id
    where j.operacion_id=p_operacion_id);
end;
$fn$;

-- Toda fila financiera de un intento v2 debe llegar al cierre con su padre
-- aplicado y con la forma completa de efectos validada. El BEFORE anterior
-- serializa contra cancelar/sanear; estos constraint triggers cierran el caso
-- INSERT bajo preparada + COMMIT sin transición. En la ruta legítima el core
-- v2 transiciona operación/hecho, registra el recibo y recién entonces fuerza
-- las constraints dentro de la misma subtransacción.
create function alq_private.alq_f1a_hijo_estado_final_ct_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_op_id uuid; v_op alq.alq_operacion%rowtype;
begin
  if tg_op='UPDATE' and tg_table_name='alq_cargo'
     and (to_jsonb(new)-'saldo_pendiente')=(to_jsonb(old)-'saldo_pendiente') then
    return null;
  elsif tg_op='UPDATE' and tg_table_name='alq_credito'
     and (to_jsonb(new)-'saldo_pendiente')=(to_jsonb(old)-'saldo_pendiente') then
    return null;
  end if;
  v_op_id:=case when tg_op='DELETE' then old.operacion_id else new.operacion_id end;
  if v_op_id is null then return null; end if;
  select * into v_op from alq.alq_operacion where id=v_op_id for update;
  if not found or v_op.hecho_id is null then return null; end if;
  if v_op.operacion='d0_fixture'
     and alq_private.alq_f1a_qualification_run_id_v1() is not null then
    return null;
  end if;
  if v_op.estado<>'aplicada' then
    raise exception using errcode='P0001',message='ALQ_F1A_EFECTO_V2_SIN_APLICAR';
  end if;
  if v_op.operacion=any(alq_private.alq_f1a_operaciones_v2()) and not
     alq_private.alq_f1a_efecto_final_valido_v2(v_op.id,v_op.operacion) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_FINAL_INVALIDO';
  end if;
  return null;
end
$fn$;

create function alq_private.alq_f1a_hijo_indirecto_estado_final_ct_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_parent uuid; v_op_id uuid; v_op alq.alq_operacion%rowtype;
begin
  if tg_table_name='alq_deposito_liquidacion_linea' then
    v_parent:=case when tg_op='DELETE' then old.liquidacion_id else new.liquidacion_id end;
    select operacion_id into v_op_id from alq.alq_deposito_liquidacion where id=v_parent;
  else
    v_parent:=case when tg_op='DELETE' then old.rendicion_id else new.rendicion_id end;
    select operacion_id into v_op_id from alq.alq_rendicion where id=v_parent;
  end if;
  if v_op_id is null then return null; end if;
  select * into v_op from alq.alq_operacion where id=v_op_id for update;
  if not found or v_op.hecho_id is null then return null; end if;
  if v_op.operacion='d0_fixture'
     and alq_private.alq_f1a_qualification_run_id_v1() is not null then
    return null;
  end if;
  if v_op.estado<>'aplicada' then
    raise exception using errcode='P0001',message='ALQ_F1A_EFECTO_V2_SIN_APLICAR';
  end if;
  if v_op.operacion=any(alq_private.alq_f1a_operaciones_v2()) and not
     alq_private.alq_f1a_efecto_final_valido_v2(v_op.id,v_op.operacion) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_FINAL_INVALIDO';
  end if;
  return null;
end
$fn$;

do $alq_f1a_child_final_triggers$
declare v_table text;
begin
  foreach v_table in array array[
    'alq_agenda_ocurrencia','alq_agenda_regla','alq_ajuste',
    'alq_nota','alq_credito_consumo','alq_transaccion_caja','alq_aplicacion',
    'alq_deposito_evento','alq_deposito_liquidacion','alq_aplicacion_reversa',
    'alq_cargo','alq_credito','alq_conversion_moneda','alq_rendicion',
    'alq_comunicado','alq_comunicado_mensaje','alq_export_baja','alq_factura_externa',
    'alq_indice_observacion','alq_journal','alq_notificacion','alq_rescision',
    'alq_servicio_cuenta','alq_servicio_factura'
  ]::text[] loop
    execute format('create constraint trigger %I after insert or update or delete on alq.%I '
      'deferrable initially deferred for each row execute function '
      'alq_private.alq_f1a_hijo_estado_final_ct_v2()',
      'alq_f1a_operacion_hijo_final_'||v_table||'_ct',v_table);
  end loop;
end
$alq_f1a_child_final_triggers$;

create constraint trigger alq_f1a_operacion_hijo_final_deposito_linea_ct
after insert or update or delete on alq.alq_deposito_liquidacion_linea
deferrable initially deferred for each row
execute function alq_private.alq_f1a_hijo_indirecto_estado_final_ct_v2();
create constraint trigger alq_f1a_operacion_hijo_final_rendicion_linea_ct
after insert or update or delete on alq.alq_rendicion_linea
deferrable initially deferred for each row
execute function alq_private.alq_f1a_hijo_indirecto_estado_final_ct_v2();

create function alq_private.alq_operacion_estado_guard_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_allowed boolean:=false;
begin
  if tg_op='INSERT' then
    if new.estado<>'preparada' then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_DEBE_NACER_PREPARADA';
    end if;
    if new.estado='preparada' then
      new.expires_at:=new.preparada_at+interval '15 minutes';
    elsif new.hecho_id is not null and new.expires_at is not null then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EXPIRY_INVALIDA';
    end if;
    if new.estado='aplicada' and (new.resultado is null or new.aplicada_at is null) then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TERMINAL_INCOMPLETA';
    elsif new.estado='rechazada' and (new.resultado is null or new.aplicada_at is not null) then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TERMINAL_INCOMPLETA';
    end if;
    return new;
  elsif tg_op='DELETE' then
    if session_user='postgres'
       and to_regclass('pg_temp.alq_f1a_cleanup_allowlist') is not null
       and exists (select 1 from private.qa_marca_descartable
                   where singleton and project_ref='rsjwqmpseknvydistgfr') then
      execute 'select exists(select 1 from pg_temp.alq_f1a_cleanup_allowlist a
        where a.kind=''operacion'' and a.id=$1 and a.run_id=$2)'
        into v_allowed using old.id,alq_private.alq_f1a_qualification_run_id_v1();
    end if;
    if not v_allowed then
      raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_DELETE_PROHIBIDO';
    end if;
    return old;
  end if;

  if (new.id,new.request_id,new.operacion,new.payload_normalizado,new.firma_sha256,
      new.actor_parte_usuario_id,new.hecho_id,new.intento,new.preparada_at,new.expires_at)
     is distinct from
     (old.id,old.request_id,old.operacion,old.payload_normalizado,old.firma_sha256,
      old.actor_parte_usuario_id,old.hecho_id,old.intento,old.preparada_at,old.expires_at) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_IDENTIDAD_INMUTABLE';
  end if;
  if old.estado in ('aplicada','rechazada') and row(new.*) is distinct from row(old.*) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TERMINAL_INMUTABLE';
  end if;
  if old.estado='preparada' and new.estado='preparada'
     and row(new.*) is distinct from row(old.*) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_PREPARADA_INMUTABLE';
  end if;
  if old.estado<>new.estado and not
     (old.estado='preparada' and new.estado in ('aplicada','rechazada')) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TRANSICION_INVALIDA';
  end if;
  if old.estado='preparada' and new.estado='rechazada'
     and alq_private.alq_f1a_operacion_tiene_efectos_v1(old.id) then
    raise exception using errcode='P0001',message='ALQ_F1A_RECHAZO_CON_EFECTOS';
  end if;
  if old.estado='preparada' and new.estado='aplicada'
     and (new.resultado is null or new.aplicada_at is null) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TERMINAL_INCOMPLETA';
  elsif old.estado='preparada' and new.estado='rechazada'
     and (new.resultado is null or new.aplicada_at is not null) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_TERMINAL_INCOMPLETA';
  end if;
  return new;
end
$fn$;

create trigger alq_operacion_estado_guard_biud
before insert or update or delete on alq.alq_operacion for each row
execute function alq_private.alq_operacion_estado_guard_f1a_v2();

create function alq_private.alq_operacion_aplicada_gate_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_custodiada boolean:=false; v_evento_journal text;
begin
  if old.estado<>'preparada' or new.estado<>'aplicada' then return null; end if;

  -- El dispatcher histórico conserva este alias byte-semántico: la operación
  -- pública giro_registrar registra el evento canónico giro_a_propietario.
  v_evento_journal:=case new.operacion
    when 'giro_registrar' then 'giro_a_propietario'
    else new.operacion end;

  if new.operacion=any(alq_private.alq_f1a_operaciones_v2()) and not
     alq_private.alq_f1a_efecto_final_valido_v2(new.id,new.operacion) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_EFECTO_FINAL_INVALIDO';
  elsif not (new.operacion=any(alq_private.alq_f1a_operaciones_v2())) and not
      (select count(*)=1 and bool_and(
      j.entidad='operacion' and j.entidad_id=new.id and j.evento=v_evento_journal
      and j.actor=new.actor_parte_usuario_id and j.antes is null
      and j.despues=new.resultado)
    from alq.alq_journal j where j.operacion_id=new.id) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_V1_SIN_JOURNAL';
  end if;

  -- La contención se deriva de los efectos realmente creados por el dispatcher,
  -- nunca del nombre de operación ni de un campo del payload falsificable.
  select exists (
      select 1 from alq.alq_transaccion_caja t
      where t.operacion_id=new.id and t.ambito='custodiada'
      union all
      select 1 from alq.alq_cargo c
      where c.operacion_id=new.id and c.ambito='custodiada'
    ) into v_custodiada;
  if coalesce(v_custodiada,false) then
    raise exception using errcode='P0001',message='ALQ_CUSTODIADA_DESHABILITADA';
  end if;
  return null;
end
$fn$;

create constraint trigger alq_operacion_aplicada_gate_ct
after update on alq.alq_operacion
deferrable initially deferred for each row
execute function alq_private.alq_operacion_aplicada_gate_f1a_v2();

create function alq_private.alq_hecho_guard_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_allowed boolean:=false;
begin
  if tg_op='UPDATE' then
    if (new.id,new.namespace,new.clave_version,new.clave_evidencia,new.clave_sha256,
        new.payload_sha256,new.actor_parte_usuario_id,new.creado_at)
       is distinct from
       (old.id,old.namespace,old.clave_version,old.clave_evidencia,old.clave_sha256,
        old.payload_sha256,old.actor_parte_usuario_id,old.creado_at)
       or (old.aplicada_operacion_id is not null and
           new.aplicada_operacion_id is distinct from old.aplicada_operacion_id) then
      raise exception using errcode='P0001',message='ALQ_F1A_HECHO_INMUTABLE';
    end if;
    new.actualizado_at:=clock_timestamp();
    return new;
  end if;
  if session_user='postgres'
     and to_regclass('pg_temp.alq_f1a_cleanup_allowlist') is not null
     and exists (select 1 from private.qa_marca_descartable
                 where singleton and project_ref='rsjwqmpseknvydistgfr') then
    execute 'select exists(select 1 from pg_temp.alq_f1a_cleanup_allowlist a
      where a.kind=''hecho'' and a.id=$1 and a.run_id=$2)'
      into v_allowed using old.id,alq_private.alq_f1a_qualification_run_id_v1();
  end if;
  if not v_allowed then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_DELETE_PROHIBIDO';
  end if;
  return old;
end
$fn$;

create trigger alq_hecho_inmutable_bud
before update or delete on alq_private.alq_hecho_idempotente_v2 for each row
execute function alq_private.alq_hecho_guard_f1a_v2();

create function alq_private.alq_evento_guard_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_allowed boolean:=false; v_actor_original uuid; v_supervisor boolean:=false;
begin
  if tg_op='INSERT' then
    -- Campos de auditoría server-owned. Un INSERT privilegiado no puede fabricar
    -- tiempo, run_id o capacidad histórica.
    new.ocurrido_at:=clock_timestamp();
    new.latencia_ms:=greatest(0,pg_catalog.floor(extract(
      epoch from (clock_timestamp()-statement_timestamp()))*1000)::bigint);
    new.run_id:=alq_private.alq_f1a_qualification_run_id_v1();
    if new.hecho_id is not null then
      select h.actor_parte_usuario_id into v_actor_original
      from alq_private.alq_hecho_idempotente_v2 h where h.id=new.hecho_id;
    else
      v_actor_original:=new.actor_efectivo_parte_usuario_id;
    end if;
    if new.actor_efectivo_parte_usuario_id is not null then
      select exists (select 1 from alq.alq_capacidad_admin ca
        where ca.parte_usuario_id=new.actor_efectivo_parte_usuario_id
          and ca.capacidad='supervisor' and statement_timestamp()<@ca.vigencia)
      into v_supervisor;
    end if;
    new.capacidad_snapshot:=jsonb_build_object(
      'actor_original',new.actor_efectivo_parte_usuario_id is not distinct from v_actor_original,
      'supervisor',coalesce(v_supervisor,false),
      'automatico',new.actor_efectivo_parte_usuario_id is null);
    if new.codigo is distinct from new.envelope->>'codigo' then
      raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_ENVELOPE_INCONSISTENTE';
    end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_APPEND_ONLY';
  end if;
  if session_user='postgres'
     and to_regclass('pg_temp.alq_f1a_cleanup_allowlist') is not null
     and exists (select 1 from private.qa_marca_descartable
                 where singleton and project_ref='rsjwqmpseknvydistgfr') then
    execute 'select exists(select 1 from pg_temp.alq_f1a_cleanup_allowlist a
      where a.kind=''evento'' and a.id=$1 and a.run_id=$2)'
      into v_allowed using old.id,old.run_id;
  end if;
  if not v_allowed then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_APPEND_ONLY';
  end if;
  return old;
end
$fn$;

create trigger alq_evento_append_only_bud
before insert or update or delete on alq_private.alq_operacion_evento_v2 for each row
execute function alq_private.alq_evento_guard_f1a_v2();

create function alq_private.alq_hecho_consistencia_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_hecho uuid; v_aplicada uuid; v_h alq_private.alq_hecho_idempotente_v2%rowtype;
begin
  if tg_table_name='alq_operacion' then
    if tg_op='DELETE' then v_hecho:=old.hecho_id;
    else v_hecho:=new.hecho_id; end if;
  else
    if tg_op='DELETE' then v_hecho:=old.id;
    else v_hecho:=new.id; end if;
  end if;
  if v_hecho is null then return null; end if;
  select * into v_h from alq_private.alq_hecho_idempotente_v2 h
  where h.id=v_hecho for update;
  if not found then return null; end if;
  v_aplicada:=v_h.aplicada_operacion_id;
  if v_h.clave_sha256 is distinct from encode(extensions.digest(
       convert_to(v_h.clave_evidencia::text,'UTF8'),'sha256'),'hex') then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_CLAVE_HASH_INCONSISTENTE';
  end if;
  if not exists (select 1 from alq.alq_operacion o where o.hecho_id=v_hecho)
     or exists (
       select 1 from alq.alq_operacion o
       where o.hecho_id=v_hecho and (
         o.actor_parte_usuario_id is distinct from v_h.actor_parte_usuario_id
         or o.operacion<>all(alq_private.alq_f1a_operaciones_v2())
         or o.firma_sha256 is distinct from
              alq_private.alq_firma_v1(o.operacion,o.payload_normalizado)
         or (v_h.namespace,o.operacion) not in (
           ('alq.nota','nota_emitir'),
           ('alq.credito_consumo','credito_consumir'),
           ('alq.transferencia','transferencia_interna'),
           ('alq.deposito_evento','deposito_evento_registrar'),
           ('alq.deposito_liquidacion','deposito_liquidar_y_devolver'),
           ('alq.reversa','reversa_con_reapertura'),
           ('alq.cargo_manual','cargo_manual_emitir'),
           ('alq.pago','pago_multimoneda'))
         or encode(extensions.digest(convert_to(o.payload_normalizado::text,'UTF8'),'sha256'),'hex')
              is distinct from v_h.payload_sha256
         or o.intento is distinct from (
           select count(*) from alq.alq_operacion p
           where p.hecho_id=v_hecho and p.intento<=o.intento))) then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_INTENTOS_INCONSISTENTES';
  end if;
  if exists (
       select 1 from alq.alq_operacion o
       where o.hecho_id=v_hecho and (
         (o.estado='preparada' and o.intento is distinct from
           (select max(x.intento) from alq.alq_operacion x where x.hecho_id=v_hecho))
         or (o.estado='aplicada' and (
           o.intento is distinct from
             (select max(x.intento) from alq.alq_operacion x where x.hecho_id=v_hecho)
           or exists (select 1 from alq.alq_operacion p
                      where p.hecho_id=v_hecho and p.id<>o.id and p.estado='preparada')))))
     or exists (
       select 1 from alq.alq_operacion o
       where o.hecho_id=v_hecho and o.estado<>'rechazada'
         and o.intento < (select max(x.intento) from alq.alq_operacion x where x.hecho_id=v_hecho)) then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_CADENA_ESTADOS_INCONSISTENTE';
  end if;
  if exists (
    select 1 from alq.alq_operacion o
    where o.hecho_id=v_hecho and not exists (
      select 1 from alq_private.alq_operacion_evento_v2 e
      where e.operacion_id=o.id and e.hecho_id=v_hecho
        and e.accion=case when o.intento=1 then 'preparar' else 'reintentar' end
        and ((o.intento=1 and e.envelope->>'estado'='preparada')
          or (o.intento>1 and e.envelope->>'estado' in ('preparada','rechazada'))))) then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_INTENTO_SIN_RECIBO';
  end if;
  if exists (
    select 1 from alq.alq_operacion o
    where o.hecho_id=v_hecho and o.estado='aplicada' and not exists (
      select 1 from alq_private.alq_operacion_evento_v2 e
      where e.operacion_id=o.id and e.accion='aplicar'
        and e.envelope->>'estado'='aplicada'
        and e.envelope->'resultado'=o.resultado))
    or exists (
    select 1 from alq.alq_operacion o
    where o.hecho_id=v_hecho and o.estado='rechazada' and not exists (
      select 1 from alq_private.alq_operacion_evento_v2 e
      where e.operacion_id=o.id and e.accion in ('preparar','aplicar','cancelar','reintentar','sanear')
        and e.envelope->>'estado'='rechazada'
        and e.envelope=o.resultado)) then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_TERMINAL_SIN_RECIBO';
  end if;
  if exists (select 1 from alq.alq_operacion o
             where o.hecho_id=v_hecho and o.estado='aplicada'
               and o.id is distinct from v_aplicada)
     or (v_aplicada is not null and not exists
         (select 1 from alq.alq_operacion o
          where o.id=v_aplicada and o.hecho_id=v_hecho and o.estado='aplicada')) then
    raise exception using errcode='P0001',message='ALQ_F1A_HECHO_APLICADA_INCONSISTENTE';
  end if;
  return null;
end
$fn$;

create constraint trigger alq_operacion_hecho_consistencia_ct
after insert or update or delete on alq.alq_operacion
deferrable initially deferred for each row
execute function alq_private.alq_hecho_consistencia_f1a_v2();
create constraint trigger alq_hecho_aplicada_consistencia_ct
after insert or update or delete on alq_private.alq_hecho_idempotente_v2
deferrable initially deferred for each row
execute function alq_private.alq_hecho_consistencia_f1a_v2();

create function alq_private.alq_evento_consistencia_f1a_v2()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_h alq_private.alq_hecho_idempotente_v2%rowtype;
        v_o alq.alq_operacion%rowtype; v_sha_esperado text; v_estado text;
begin
  if new.hecho_id is null then
    if new.accion<>'preparar'
       or new.comando_request_id is null
       or new.actor_efectivo_parte_usuario_id is null
       or not (coalesce(new.envelope->>'estado','')=any(
         array['rechazada_sin_fila','conflicto']::text[]))
       or not (new.envelope?'ok') or jsonb_typeof(new.envelope->'ok')<>'boolean'
       or new.envelope->'ok'<>'false'::jsonb
       or new.envelope->>'operacion' is null
       or new.codigo is null then
      raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_SIN_INTENTO_INVALIDO';
    end if;
    v_sha_esperado:=alq_private.alq_f1a_comando_sha_v2('preparar',
      new.actor_efectivo_parte_usuario_id,null,null,new.envelope->>'operacion',null,
      new.payload_sha256,null);
    if new.comando_sha256 is distinct from v_sha_esperado then
      raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_COMANDO_HASH_INCONSISTENTE';
    end if;
    if (new.envelope->>'estado'='conflicto' and
          new.codigo is distinct from 'ALQ_F1A_CLAVE_PAYLOAD_CONFLICTO')
       or (new.envelope->>'estado'='rechazada_sin_fila' and
          not alq_private.alq_f1a_error_negocio_v2('P0001',new.codigo,null)) then
      raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_CODIGO_INCONSISTENTE';
    end if;
    return null;
  end if;
  select * into v_h from alq_private.alq_hecho_idempotente_v2
  where id=new.hecho_id for update;
  select * into v_o from alq.alq_operacion where id=new.operacion_id for share;
  if not found
     or new.namespace is distinct from v_h.namespace
     or new.clave_version is distinct from v_h.clave_version
     or new.clave_sha256 is distinct from v_h.clave_sha256
     or new.payload_sha256 is distinct from v_h.payload_sha256
     or new.operacion_request_id is distinct from v_o.request_id
     or v_o.hecho_id is distinct from v_h.id
     or new.envelope->>'hecho_id' is distinct from v_h.id::text
     or new.envelope->>'operacion_id' is distinct from v_o.id::text
     or new.envelope->>'operacion_request_id' is distinct from v_o.request_id::text then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_IDENTIDAD_INCONSISTENTE';
  end if;
  v_estado:=new.envelope->>'estado';
  if v_estado is null or not (new.envelope?'ok')
     or jsonb_typeof(new.envelope->'ok')<>'boolean' then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_ENVELOPE_INCONSISTENTE';
  end if;
  if (v_estado='aplicada' and new.envelope->'ok' is distinct from 'true'::jsonb)
     or (v_estado='preparada' and not (
          (new.envelope->'ok'='true'::jsonb and new.codigo is null)
          or (new.accion='reintentar'
            and new.codigo='ALQ_F1A_REINTENTO_YA_ACTIVO'
            and new.envelope->'ok'='false'::jsonb)))
     or (v_estado=any(array['rechazada','rechazada_sin_fila','conflicto']::text[])
        and new.envelope->'ok' is distinct from 'false'::jsonb) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_OK_ESTADO_INCONSISTENTE';
  end if;
  if v_estado='aplicada' and not (new.envelope?'resultado') then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_ENVELOPE_INCONSISTENTE';
  end if;
  if v_estado='aplicada' and (new.codigo is not null
       or (new.envelope?'codigo' and new.envelope->'codigo'<>'null'::jsonb)) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_CODIGO_INCONSISTENTE';
  end if;
  if v_estado=any(array['rechazada','rechazada_sin_fila','conflicto']::text[])
     and (not (new.envelope?'codigo') or new.envelope->>'codigo' is null) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_ENVELOPE_INCONSISTENTE';
  end if;
  if new.accion='aplicar' and not (
       (v_estado='aplicada' and v_o.estado='aplicada'
         and new.envelope->'resultado' is not distinct from v_o.resultado)
       or (v_estado='rechazada' and v_o.estado='rechazada'
         and new.envelope->>'codigo' is not distinct from v_o.resultado->>'codigo')) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_TRANSICION_INCONSISTENTE';
  elsif new.accion='cancelar' and not (
       (v_estado='aplicada' and v_o.estado='aplicada'
         and new.envelope->'resultado' is not distinct from v_o.resultado)
       or (v_estado='rechazada' and v_o.estado='rechazada'
         and new.envelope->>'codigo' is not distinct from v_o.resultado->>'codigo')) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_TRANSICION_INCONSISTENTE';
  elsif new.accion='reintentar' and not (
       (v_estado='aplicada' and v_o.estado='aplicada'
         and new.envelope->'resultado' is not distinct from v_o.resultado)
       or (v_estado='preparada' and v_o.estado='preparada')
       or (v_estado='rechazada' and v_o.estado='rechazada'
         and new.envelope->>'codigo' is not distinct from v_o.resultado->>'codigo')) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_TRANSICION_INCONSISTENTE';
  elsif new.accion='sanear' and not (
       v_estado='rechazada' and v_o.estado='rechazada'
       and new.envelope=v_o.resultado) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_TRANSICION_INCONSISTENTE';
  elsif new.accion='preparar' and not (
       (v_estado='preparada' and v_o.estado='preparada')
       or (v_estado='aplicada' and v_o.estado='aplicada'
         and new.envelope->'resultado' is not distinct from v_o.resultado)
       or (v_estado='rechazada' and v_o.estado='rechazada'
         and new.envelope->>'codigo' is not distinct from v_o.resultado->>'codigo')) then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_TRANSICION_INCONSISTENTE';
  end if;
  if new.comando_request_id is not null then
    v_sha_esperado:=case new.accion
      when 'preparar' then alq_private.alq_f1a_comando_sha_v2('preparar',
        new.actor_efectivo_parte_usuario_id,null,null,v_o.operacion,null,
        v_h.payload_sha256,null)
      when 'aplicar' then alq_private.alq_f1a_comando_sha_v2('aplicar',
        new.actor_efectivo_parte_usuario_id,v_o.request_id,v_h.id,v_o.operacion,
        v_o.firma_sha256,v_h.payload_sha256,null)
      when 'cancelar' then alq_private.alq_f1a_comando_sha_v2('cancelar',
        new.actor_efectivo_parte_usuario_id,v_o.request_id,v_h.id,v_o.operacion,
        v_o.firma_sha256,v_h.payload_sha256,new.envelope->>'motivo')
      when 'reintentar' then alq_private.alq_f1a_comando_sha_v2('reintentar',
        new.actor_efectivo_parte_usuario_id,null,v_h.id,v_o.operacion,
        v_o.firma_sha256,v_h.payload_sha256,new.envelope->>'motivo')
      else null end;
    if v_sha_esperado is null or new.comando_sha256 is distinct from v_sha_esperado then
      raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_COMANDO_HASH_INCONSISTENTE';
    end if;
  elsif new.accion<>'sanear' or new.actor_efectivo_parte_usuario_id is not null then
    raise exception using errcode='P0001',message='ALQ_F1A_EVENTO_AUTOMATICO_INVALIDO';
  end if;
  return null;
end
$fn$;

create constraint trigger alq_evento_consistencia_ct
after insert or update on alq_private.alq_operacion_evento_v2
deferrable initially deferred for each row
execute function alq_private.alq_evento_consistencia_f1a_v2();

-- Foto canónica de raíces para las ocho rutas F1-A. Esta función no bloquea:
-- descubre el conjunto completo que luego se bloquea por ranking y se vuelve a
-- calcular. El payload sólo aporta IDs candidatos; las relaciones económicas
-- (propiedad/contrato/garantía/destinos) se derivan de filas server-owned.
create function alq_private.alq_f1a_operaciones_lock_v1()
returns text[] language sql immutable security definer set search_path=''
as $fn$
  select array[
    'nota_emitir','credito_consumir','transferencia_interna',
    'deposito_evento_registrar','deposito_liquidar_y_devolver',
    'reversa_con_reapertura','cargo_manual_emitir','pago_multimoneda',
    'credito_devolver','giro_registrar','giro_a_propietario',
    'transaccion_registrar','aplicacion_asignar','deposito_liquidar',
    'rendicion_emitir','rendicion_corregir'
  ]::text[]
$fn$;

create function alq_private.alq_f1a_raices_payload_snapshot_v1(
  p_operacion text,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_props uuid[]:='{}'; v_cons uuid[]:='{}'; v_periodos uuid[]:='{}';
        v_garantias uuid[]:='{}'; v_cuentas uuid[]:='{}'; v_depositos uuid[]:='{}';
        v_txs uuid[]:='{}'; v_cargos uuid[]:='{}'; v_creditos uuid[]:='{}';
        v_apps uuid[]:='{}'; v_reaperturas uuid[]:='{}';
        v_conversiones uuid[]:='{}'; v_liquidaciones uuid[]:='{}';
        v_rendiciones uuid[]:='{}';
begin
  case p_operacion
    when 'nota_emitir' then
      v_cargos:=array_remove(array[nullif(p_payload->>'cargo_id','')::uuid],null);
    when 'credito_consumir' then
      v_cargos:=array_remove(array[nullif(p_payload->>'cargo_id','')::uuid],null);
      v_creditos:=array_remove(array[nullif(p_payload->>'credito_id','')::uuid],null);
    when 'transferencia_interna' then
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_origen_id','')::uuid,
        nullif(p_payload->>'cuenta_destino_id','')::uuid],null);
    when 'deposito_evento_registrar' then
      v_depositos:=array_remove(array[nullif(p_payload->>'deposito_id','')::uuid],null);
      v_cons:=array_remove(array[nullif(p_payload->>'contrato_sucesor_id','')::uuid],null);
      v_txs:=array_remove(array[nullif(p_payload->>'transaccion_id','')::uuid],null);
    when 'deposito_liquidar_y_devolver' then
      v_depositos:=array_remove(array[nullif(p_payload->>'deposito_id','')::uuid],null);
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
    when 'reversa_con_reapertura' then
      v_txs:=array_remove(array[nullif(p_payload->>'original_id','')::uuid],null);
      select coalesce(array_agg(distinct (i->>'aplicacion_original_id')::uuid
        order by (i->>'aplicacion_original_id')::uuid),'{}'::uuid[])
        into v_apps from jsonb_array_elements(coalesce(p_payload->'reaperturas','[]'::jsonb)) i;
      select coalesce(array_agg(distinct nullif(i->>'conversion_reversa_id','')::uuid
        order by nullif(i->>'conversion_reversa_id','')::uuid)
        filter(where nullif(i->>'conversion_reversa_id','') is not null),'{}'::uuid[])
        into v_conversiones
        from jsonb_array_elements(coalesce(p_payload->'reaperturas','[]'::jsonb)) i;
    when 'cargo_manual_emitir' then
      v_props:=array_remove(array[nullif(p_payload->>'propiedad_id','')::uuid],null);
      v_cons:=array_remove(array[nullif(p_payload->>'contrato_id','')::uuid],null);
      v_periodos:=array_remove(array[nullif(p_payload->>'periodo_id','')::uuid],null);
    when 'pago_multimoneda' then
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
      select coalesce(array_agg(distinct nullif(i->>'cargo_id','')::uuid
        order by nullif(i->>'cargo_id','')::uuid)
        filter(where nullif(i->>'cargo_id','') is not null),'{}'::uuid[]),
        coalesce(array_agg(distinct nullif(i->>'credito_id','')::uuid
        order by nullif(i->>'credito_id','')::uuid)
        filter(where nullif(i->>'credito_id','') is not null),'{}'::uuid[])
        into v_cargos,v_creditos
        from jsonb_array_elements(coalesce(p_payload->'aplicaciones','[]'::jsonb)) i;
    when 'credito_devolver' then
      v_creditos:=array_remove(array[nullif(p_payload->>'credito_id','')::uuid],null);
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
    when 'giro_registrar' then
      v_rendiciones:=array_remove(array[nullif(p_payload->>'rendicion_id','')::uuid],null);
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
    when 'giro_a_propietario' then
      v_rendiciones:=array_remove(array[nullif(p_payload->>'rendicion_id','')::uuid],null);
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
    when 'transaccion_registrar' then
      v_txs:=array_remove(array[nullif(p_payload->>'reversa_de','')::uuid],null);
      v_cuentas:=array_remove(array[nullif(p_payload->>'cuenta_custodia_id','')::uuid],null);
    when 'aplicacion_asignar' then
      v_txs:=array_remove(array[nullif(p_payload->>'transaccion_id','')::uuid],null);
      v_cargos:=array_remove(array[nullif(p_payload->>'cargo_id','')::uuid],null);
      v_creditos:=array_remove(array[nullif(p_payload->>'credito_id','')::uuid],null);
      v_apps:='{}'::uuid[];
      v_conversiones:=array_remove(array[nullif(p_payload->>'conversion_id','')::uuid],null);
      v_rendiciones:=array_remove(array[nullif(p_payload->>'rendicion_id','')::uuid],null);
      if nullif(p_payload->>'deposito_evento_id','') is not null then
        select coalesce(array_agg(e.deposito_id),'{}'::uuid[]) into v_depositos
        from alq.alq_deposito_evento e
        where e.id=(p_payload->>'deposito_evento_id')::uuid;
      end if;
    when 'deposito_liquidar' then
      v_depositos:=array_remove(array[nullif(p_payload->>'deposito_id','')::uuid],null);
    when 'rendicion_emitir' then
      v_props:=array_remove(array[nullif(p_payload->>'propiedad_id','')::uuid],null);
      select coalesce(array_agg(distinct nullif(i->>'cargo_id','')::uuid
          order by nullif(i->>'cargo_id','')::uuid)
          filter(where nullif(i->>'cargo_id','') is not null),'{}'::uuid[]),
        coalesce(array_agg(distinct nullif(i->>'transaccion_id','')::uuid
          order by nullif(i->>'transaccion_id','')::uuid)
          filter(where nullif(i->>'transaccion_id','') is not null),'{}'::uuid[])
        into v_cargos,v_txs
      from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb)) i;
    when 'rendicion_corregir' then
      v_rendiciones:=array_remove(array[
        nullif(p_payload->>'rendicion_original_id','')::uuid],null);
      select coalesce(array_agg(distinct nullif(i->>'cargo_id','')::uuid
          order by nullif(i->>'cargo_id','')::uuid)
          filter(where nullif(i->>'cargo_id','') is not null),'{}'::uuid[]),
        coalesce(array_agg(distinct nullif(i->>'transaccion_id','')::uuid
          order by nullif(i->>'transaccion_id','')::uuid)
          filter(where nullif(i->>'transaccion_id','') is not null),'{}'::uuid[])
        into v_cargos,v_txs
      from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb)) i;
    else
      return jsonb_build_object('operacion',p_operacion,'fuera_f1a',true);
  end case;

  if p_operacion='reversa_con_reapertura' then
    select coalesce(array_agg(distinct a.id order by a.id),'{}'::uuid[])
      into v_apps from alq.alq_aplicacion a
      where a.transaccion_id=(p_payload->>'original_id')::uuid;
    select coalesce(array_agg(distinct t.id order by t.id),'{}'::uuid[])
      into v_txs from alq.alq_transaccion_caja t
      where t.id=(p_payload->>'original_id')::uuid
         or t.reversa_de=(p_payload->>'original_id')::uuid;
    select coalesce(array_agg(distinct ar.id order by ar.id),'{}'::uuid[])
      into v_reaperturas
      from alq.alq_aplicacion_reversa ar
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where rv.reversa_de=(p_payload->>'original_id')::uuid
         or ar.aplicacion_original_id=any(v_apps);
  end if;

  -- El saldo y la sucesión de un depósito dependen también de sus hijos ya
  -- persistidos. Incluirlos impide bloquear primero el depósito y descubrir
  -- después contratos/transacciones/cargos de rango anterior o posterior.
  if cardinality(v_depositos)>0 then
    select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
      into v_txs from (
        select unnest(v_txs) id
        union select e.transaccion_id from alq.alq_deposito_evento e
          where e.deposito_id=any(v_depositos) and e.transaccion_id is not null) x;
    select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
      into v_cons from (
        select unnest(v_cons) id
        union select e.contrato_sucesor_id from alq.alq_deposito_evento e
          where e.deposito_id=any(v_depositos) and e.contrato_sucesor_id is not null) x;
    select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
      into v_cargos from (
        select unnest(v_cargos) id
        union select ll.cargo_residual_id
          from alq.alq_deposito_liquidacion_linea ll
          join alq.alq_deposito_liquidacion l on l.id=ll.liquidacion_id
          where l.deposito_id=any(v_depositos) and ll.cargo_residual_id is not null) x;
  end if;

  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_cargos from (
      select unnest(v_cargos) id
      union select a.cargo_id from alq.alq_aplicacion a
        where a.id=any(v_apps) and a.cargo_id is not null) x;
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_creditos from (
      select unnest(v_creditos) id
      union select a.credito_id from alq.alq_aplicacion a
        where a.id=any(v_apps) and a.credito_id is not null) x;
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_cons from (
      select unnest(v_cons) id
      union select c.contrato_id from alq.alq_cargo c
        where c.id=any(v_cargos) and c.contrato_id is not null
      union select cr.contrato_id from alq.alq_credito cr where cr.id=any(v_creditos)
      union select d.contrato_id from alq.alq_deposito d where d.id=any(v_depositos)) x;
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_periodos from (
      select unnest(v_periodos) id
      union select c.periodo_id from alq.alq_cargo c
        where c.id=any(v_cargos) and c.periodo_id is not null) x;
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_props from (
      select unnest(v_props) id
      union select c.propiedad_id from alq.alq_cargo c where c.id=any(v_cargos)
      union select c.propiedad_id from alq.alq_contrato c where c.id=any(v_cons)) x;
  select coalesce(array_agg(g.id order by g.id),'{}'::uuid[])
    into v_garantias from alq.alq_garantia g where g.contrato_id=any(v_cons);
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_cuentas from (
      select unnest(v_cuentas) id
      union select t.cuenta_custodia_id from alq.alq_transaccion_caja t
        where t.id=any(v_txs) and t.cuenta_custodia_id is not null) x;
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_conversiones from (
      select unnest(v_conversiones) id
      union select a.conversion_id from alq.alq_aplicacion a
        where a.id=any(v_apps) and a.conversion_id is not null) x;
  select coalesce(array_agg(l.id order by l.id),'{}'::uuid[])
    into v_liquidaciones from alq.alq_deposito_liquidacion l
    where l.deposito_id=any(v_depositos);
  select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[])
    into v_props from (
      select unnest(v_props) id
      union select r.propiedad_id from alq.alq_rendicion r
        where r.id=any(v_rendiciones)) x;

  return jsonb_build_object(
    'operacion',p_operacion,
    'propiedades',to_jsonb(v_props),'contratos',to_jsonb(v_cons),
    'periodos',to_jsonb(v_periodos),'garantias',to_jsonb(v_garantias),
    'cuentas',to_jsonb(v_cuentas),'depositos',to_jsonb(v_depositos),
    'transacciones',to_jsonb(v_txs),'cargos',to_jsonb(v_cargos),
    'creditos',to_jsonb(v_creditos),'aplicaciones',to_jsonb(v_apps),
    'reaperturas',to_jsonb(v_reaperturas),
    'conversiones',to_jsonb(v_conversiones),'liquidaciones',to_jsonb(v_liquidaciones),
    'rendiciones',to_jsonb(v_rendiciones),
    'filas',jsonb_build_object(
      'propiedades',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_propiedad x where x.id=any(v_props)),
      'contratos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_contrato x where x.id=any(v_cons)),
      'periodos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_periodo x where x.id=any(v_periodos)),
      'garantias',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_garantia x where x.id=any(v_garantias)),
      'cuentas',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_cuenta_custodia x where x.id=any(v_cuentas)),
      'depositos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_deposito x where x.id=any(v_depositos)),
      'transacciones',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_transaccion_caja x where x.id=any(v_txs)),
      'cargos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_cargo x where x.id=any(v_cargos)),
      'creditos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_credito x where x.id=any(v_creditos)),
      'aplicaciones',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_aplicacion x where x.id=any(v_apps)),
      'reaperturas',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_aplicacion_reversa x where x.id=any(v_reaperturas)),
      'conversiones',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_conversion_moneda x where x.id=any(v_conversiones)),
      'liquidaciones',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_deposito_liquidacion x where x.id=any(v_liquidaciones)),
      'rendiciones',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from alq.alq_rendicion x where x.id=any(v_rendiciones))));
end
$fn$;

-- Locks lógicos de agregados. Los toma todo writer de las ocho rutas y todo
-- INSERT alternativo antes de que la FK adquiera KEY SHARE; así dos sumas
-- concurrentes nunca intentan promover locks en orden opuesto.
create function alq_private.alq_f1a_lock_agregados_v1(
  p_depositos uuid[],p_transacciones uuid[],p_cargos uuid[],p_creditos uuid[],
  p_aplicaciones uuid[],p_reaperturas uuid[],p_conversiones uuid[],
  p_liquidaciones uuid[],p_rendiciones uuid[])
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare r record;
begin
  for r in
    select q.rank,q.kind,q.id from (
      select 5 rank,'deposito'::text kind,unnest(coalesce(p_depositos,'{}'::uuid[])) id
      union all select 6,'transaccion',unnest(coalesce(p_transacciones,'{}'::uuid[]))
      union all select 7,'cargo',unnest(coalesce(p_cargos,'{}'::uuid[]))
      union all select 8,'credito',unnest(coalesce(p_creditos,'{}'::uuid[]))
      union all select 9,'aplicacion',unnest(coalesce(p_aplicaciones,'{}'::uuid[]))
      union all select 9,'reapertura',unnest(coalesce(p_reaperturas,'{}'::uuid[]))
      union all select 10,'conversion',unnest(coalesce(p_conversiones,'{}'::uuid[]))
      union all select 10,'liquidacion',unnest(coalesce(p_liquidaciones,'{}'::uuid[]))
      union all select 10,'rendicion',unnest(coalesce(p_rendiciones,'{}'::uuid[]))
    ) q where q.id is not null group by q.rank,q.kind,q.id
    order by q.rank,q.id,q.kind
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      format('ALQ-F1A-R%02s:%s:%s',r.rank,r.kind,r.id),0)) then
      raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
    end if;
  end loop;
end
$fn$;

create function alq_private.alq_f1a_lock_revalidar_payload_v1(
  p_operacion text,p_payload jsonb)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_pre jsonb; v_post jsonb; v_ids uuid[];
begin
  if not (p_operacion=any(alq_private.alq_f1a_operaciones_lock_v1())) then return; end if;
  v_pre:=alq_private.alq_f1a_raices_payload_snapshot_v1(p_operacion,p_payload);

  -- Ranks 2..4: row locks primero. Así un UPDATE directo de una raíz nunca
  -- forma un ciclo tuple→advisor contra otra operación advisor→tuple.
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'propiedades');
  perform 1 from alq.alq_propiedad where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'contratos');
  perform 1 from alq.alq_contrato where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'periodos');
  perform 1 from alq.alq_periodo where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'garantias');
  perform 1 from alq.alq_garantia where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'cuentas');
  perform 1 from alq.alq_cuenta_custodia where id=any(v_ids) order by id for update nowait;

  -- Ranks 5..10: todos los advisory locks se toman en orden antes de sus row
  -- locks. Los writers alternativos usan exactamente las mismas claves.
  perform alq_private.alq_f1a_lock_agregados_v1(
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'depositos')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'transacciones')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'cargos')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'creditos')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'aplicaciones')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'reaperturas')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'conversiones')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'liquidaciones')),
    array(select value::text::uuid from jsonb_array_elements_text(v_pre->'rendiciones')));

  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'depositos');
  perform 1 from alq.alq_deposito where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'transacciones');
  perform 1 from alq.alq_transaccion_caja where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'cargos');
  perform 1 from alq.alq_cargo where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'creditos');
  perform 1 from alq.alq_credito where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'aplicaciones');
  perform 1 from alq.alq_aplicacion where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'reaperturas');
  perform 1 from alq.alq_aplicacion_reversa where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'conversiones');
  perform 1 from alq.alq_conversion_moneda where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'liquidaciones');
  perform 1 from alq.alq_deposito_liquidacion where id=any(v_ids) order by id for update nowait;
  select coalesce(array_agg(value::text::uuid),'{}') into v_ids
    from jsonb_array_elements_text(v_pre->'rendiciones');
  perform 1 from alq.alq_rendicion where id=any(v_ids) order by id for update nowait;

  v_post:=alq_private.alq_f1a_raices_payload_snapshot_v1(p_operacion,p_payload);
  if v_post is distinct from v_pre then
    raise exception using errcode='40001',message='ALQ_F1A_RAICES_DERIVARON';
  end if;
exception when lock_not_available then
  raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
end
$fn$;

-- Writers alternativos: serialización BEFORE INSERT, después del lock del
-- padre alq_operacion y antes de FK/constraint triggers. UPDATE/DELETE de
-- historia quedan bajo las guardas de inmutabilidad y no toman advisory tarde.
create function alq_private.alq_f1a_hijo_agregado_lock_bi_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_dep uuid[]:='{}'; v_tx uuid[]:='{}'; v_cargo uuid[]:='{}';
        v_credito uuid[]:='{}'; v_app uuid[]:='{}'; v_reap uuid[]:='{}';
        v_conv uuid[]:='{}';
        v_liq uuid[]:='{}'; v_rend uuid[]:='{}';
        v_dep_id uuid; v_tx_original uuid; v_transferencia uuid;
begin
  if tg_table_name='alq_nota' then
    v_cargo:=array_remove(array[new.cargo_id],null);
  elsif tg_table_name='alq_credito_consumo' then
    v_cargo:=array_remove(array[new.cargo_id],null);
    v_credito:=array_remove(array[new.credito_id],null);
  elsif tg_table_name='alq_aplicacion' then
    v_tx:=array_remove(array[new.transaccion_id],null);
    v_cargo:=array_remove(array[new.cargo_id],null);
    v_credito:=array_remove(array[new.credito_id],null);
    v_conv:=array_remove(array[new.conversion_id],null);
    v_rend:=array_remove(array[new.rendicion_id],null);
    if new.deposito_evento_id is not null then
      select e.deposito_id into v_dep_id from alq.alq_deposito_evento e
        where e.id=new.deposito_evento_id;
      v_dep:=array_remove(array[v_dep_id],null);
    end if;
  elsif tg_table_name='alq_aplicacion_reversa' then
    select rv.reversa_de into v_tx_original from alq.alq_transaccion_caja rv
      where rv.id=new.reversa_transaccion_id;
    v_tx:=array_remove(array[new.reversa_transaccion_id,v_tx_original],null);
    v_app:=array_remove(array[new.aplicacion_original_id],null);
    v_conv:=array_remove(array[new.conversion_reversa_id],null);
    select array_remove(array[a.cargo_id],null),array_remove(array[a.credito_id],null),
           array_remove(array[a.rendicion_id],null),e.deposito_id
      into v_cargo,v_credito,v_rend,v_dep_id
      from alq.alq_aplicacion a
      left join alq.alq_deposito_evento e on e.id=a.deposito_evento_id
      where a.id=new.aplicacion_original_id;
    v_dep:=array_remove(array[v_dep_id],null);
  elsif tg_table_name='alq_deposito_evento' then
    v_dep:=array_remove(array[new.deposito_id],null);
    v_tx:=array_remove(array[new.transaccion_id],null);
  elsif tg_table_name='alq_deposito_liquidacion' then
    v_dep:=array_remove(array[new.deposito_id],null);
    v_liq:=array_remove(array[new.id],null);
  elsif tg_table_name='alq_deposito_liquidacion_linea' then
    select l.deposito_id into v_dep_id from alq.alq_deposito_liquidacion l
      where l.id=new.liquidacion_id;
    v_dep:=array_remove(array[v_dep_id],null);
    v_cargo:=array_remove(array[new.cargo_residual_id],null);
    v_liq:=array_remove(array[new.liquidacion_id],null);
  elsif tg_table_name='alq_transaccion_caja' then
    v_tx:=array_remove(array[new.reversa_de],null);
    v_transferencia:=new.transferencia_id;
  end if;
  perform alq_private.alq_f1a_lock_agregados_v1(
    v_dep,v_tx,v_cargo,v_credito,v_app,v_reap,v_conv,v_liq,v_rend);
  if v_transferencia is not null then
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'ALQ-F1A-TRANSFERENCIA:'||v_transferencia::text,0)) then
      raise exception using errcode='40001',message='ALQ_F1A_CONFLICTO_CONCURRENCIA';
    end if;
  end if;
  return new;
end
$fn$;

create trigger alq_f1a_raices_nota_bi before insert on alq.alq_nota
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_credito_consumo_bi before insert on alq.alq_credito_consumo
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_aplicacion_bi before insert on alq.alq_aplicacion
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_aplicacion_reversa_bi before insert on alq.alq_aplicacion_reversa
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_deposito_evento_bi before insert on alq.alq_deposito_evento
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_deposito_liquidacion_bi before insert on alq.alq_deposito_liquidacion
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_deposito_linea_bi before insert on alq.alq_deposito_liquidacion_linea
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();
create trigger alq_f1a_raices_transaccion_bi before insert on alq.alq_transaccion_caja
for each row execute function alq_private.alq_f1a_hijo_agregado_lock_bi_v1();

-- El executor vigente está sellado por SHA en el PRE. Se agrega una única
-- llamada común antes del CASE; no se agrega una rama 46 ni se reinterpreta
-- ninguna de las otras 37 operaciones.
do $alq_f1a_patch_executor_lock$
declare v_def text; v_new text;
begin
  v_def:=pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_new:=regexp_replace(v_def,E'\nbegin\n',
    E'\nbegin\n  perform alq_private.alq_f1a_writer_context_v1(''enter'',p_operacion_id);\n  perform alq_private.alq_f1a_lock_revalidar_payload_v1(p_operacion,p_payload);\n');
  v_new:=regexp_replace(v_new,E'\n  return v_result;\nend\n',
    E'\n  perform alq_private.alq_f1a_writer_context_v1(''exit'',p_operacion_id);\n  return v_result;\nend\n');
  if v_new=v_def
     or position('alq_f1a_lock_revalidar_payload_v1' in v_new)=0
     or position('alq_f1a_writer_context_v1(''enter''' in v_new)=0
     or position('alq_f1a_writer_context_v1(''exit''' in v_new)=0 then
    raise exception using errcode='P0001',message='ALQ_F1A_EXECUTOR_PATCH_NO_UNICO';
  end if;
  execute v_new;
end
$alq_f1a_patch_executor_lock$;

-- --------------------------------------------------------------------------
-- Recalculadores: sólo reaperturas de reversas confirmadas afectan historia.
-- --------------------------------------------------------------------------

create or replace function alq_private.alq_recalcular_cargo_v1(p_cargo_id uuid)
returns numeric language plpgsql volatile security definer set search_path=''
as $fn$
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
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja r on r.id=ar.reversa_transaccion_id
      where a.cargo_id=c.id and r.estado='confirmada'),0)
    into v_saldo from alq.alq_cargo c where c.id=p_cargo_id;
  if v_saldo<0 then raise exception 'ALQ_CARGO_SALDO_NEGATIVO'; end if;
  update alq.alq_cargo set saldo_pendiente=v_saldo where id=p_cargo_id;
  update alq.alq_servicio_factura set saldada=(v_saldo=0) where cargo_id=p_cargo_id;
  return v_saldo;
end
$fn$;

create or replace function alq_private.alq_recalcular_credito_v1(p_credito_id uuid)
returns numeric language plpgsql volatile security definer set search_path=''
as $fn$
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
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja r on r.id=ar.reversa_transaccion_id
      where a.credito_id=cr.id and r.estado='confirmada'),0)
    into v_saldo from alq.alq_credito cr where cr.id=p_credito_id;
  if v_saldo<0 then raise exception 'ALQ_CREDITO_SALDO_NEGATIVO'; end if;
  update alq.alq_credito set saldo_pendiente=v_saldo where id=p_credito_id;
  return v_saldo;
end
$fn$;

-- --------------------------------------------------------------------------
-- Validadores nominales N/C/J/D.
-- --------------------------------------------------------------------------

create function alq_private.alq_validar_nota_f1a_v1(p_nota_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_n alq.alq_nota%rowtype; v_moneda text;
begin
  select * into v_n from alq.alq_nota where id=p_nota_id;
  if not found then return; end if;
  select moneda into v_moneda from alq.alq_cargo where id=v_n.cargo_id for update;
  select * into v_n from alq.alq_nota where id=p_nota_id for update;
  if v_n.moneda<>v_moneda then
    raise exception using errcode='P0001',message='ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE';
  end if;
end
$fn$;

create function alq_private.alq_validar_credito_consumo_f1a_v1(p_consumo_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_cc alq.alq_credito_consumo%rowtype; v_cr alq.alq_credito%rowtype;
        v_c alq.alq_cargo%rowtype; v_prop uuid; v_cargo_prop uuid;
begin
  select * into v_cc from alq.alq_credito_consumo where id=p_consumo_id;
  if not found then return; end if;
  select * into v_c from alq.alq_cargo where id=v_cc.cargo_id;
  select * into v_cr from alq.alq_credito where id=v_cc.credito_id;
  select propiedad_id into v_prop from alq.alq_contrato where id=v_cr.contrato_id;
  v_cargo_prop:=v_c.propiedad_id;
  perform 1 from alq.alq_propiedad
    where id=any(array[v_prop,v_cargo_prop]) order by id for share;
  perform 1 from alq.alq_contrato
    where id=any(array[v_cr.contrato_id,v_c.contrato_id]) order by id for share;
  select * into v_c from alq.alq_cargo where id=v_cc.cargo_id for update;
  select * into v_cr from alq.alq_credito where id=v_cc.credito_id for update;
  select * into v_cc from alq.alq_credito_consumo where id=p_consumo_id for update;
  if v_cc.moneda<>v_cr.moneda or v_cc.moneda<>v_c.moneda then
    raise exception using errcode='P0001',message='ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE';
  end if;
  select propiedad_id into v_prop from alq.alq_contrato where id=v_cr.contrato_id;
  if v_c.contrato_id is null or v_cr.contrato_id<>v_c.contrato_id
     or v_cr.parte_id<>v_c.deudor_parte_id or v_prop<>v_c.propiedad_id then
    raise exception using errcode='P0001',message='ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE';
  end if;
end
$fn$;

create function alq_private.alq_validar_cargo_f1a_v1(p_cargo_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_c alq.alq_cargo%rowtype; v_con alq.alq_contrato%rowtype; v_periodo_contrato uuid;
begin
  select * into v_c from alq.alq_cargo where id=p_cargo_id;
  if not found then return; end if;
  perform 1 from alq.alq_propiedad where id=v_c.propiedad_id for share;
  if v_c.contrato_id is not null then
    select * into v_con from alq.alq_contrato where id=v_c.contrato_id for share;
    if v_con.propiedad_id<>v_c.propiedad_id then
      raise exception using errcode='P0001',message='ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE';
    end if;
  end if;
  if v_c.periodo_id is not null then
    select contrato_id into v_periodo_contrato from alq.alq_periodo
    where id=v_c.periodo_id for share;
    if v_c.contrato_id is null or v_periodo_contrato<>v_c.contrato_id then
      raise exception using errcode='P0001',message='ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE';
    end if;
  end if;
  if v_c.concepto='alquiler_periodo'
     and (v_c.contrato_id is null or v_c.deudor_parte_id<>v_con.inquilino_parte_id) then
    raise exception using errcode='P0001',message='ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE';
  end if;
  perform 1 from alq.alq_cargo where id=p_cargo_id for update;
end
$fn$;

create function alq_private.alq_validar_deposito_f1a_v1(
  p_deposito_id uuid,p_contexto text default null)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_d alq.alq_deposito%rowtype; v_d0 alq.alq_deposito%rowtype;
        v_usado numeric; v_codigo text;
        v_compuesta boolean:=false;
begin
  select * into v_d0 from alq.alq_deposito where id=p_deposito_id;
  if not found then return; end if;
  perform 1 from alq.alq_propiedad p where p.id in (
    select c.propiedad_id from alq.alq_contrato c where c.id=v_d0.contrato_id
    union
    select s.propiedad_id from alq.alq_deposito_evento e
      join alq.alq_contrato s on s.id=e.contrato_sucesor_id
      where e.deposito_id=p_deposito_id)
    order by p.id for share;
  perform 1 from alq.alq_contrato c where c.id=v_d0.contrato_id
      or c.id in (select e.contrato_sucesor_id from alq.alq_deposito_evento e
                  where e.deposito_id=p_deposito_id)
    order by c.id for share;
  select * into v_d from alq.alq_deposito where id=p_deposito_id for update;
  if (v_d.contrato_id,v_d.moneda,v_d.monto_constituido)
     is distinct from (v_d0.contrato_id,v_d0.moneda,v_d0.monto_constituido) then
    raise exception using errcode='40001',message='ALQ_F1A_RAICES_DERIVARON';
  end if;
  perform 1 from alq.alq_transaccion_caja t where t.id in (
    select e.transaccion_id from alq.alq_deposito_evento e
    where e.deposito_id=p_deposito_id and e.transaccion_id is not null)
    order by t.id for update;
  perform 1 from alq.alq_cargo c where c.id in (
    select x.cargo_residual_id from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=p_deposito_id and x.cargo_residual_id is not null)
    order by c.id for update;
  perform 1 from alq.alq_deposito_liquidacion l
    where l.deposito_id=p_deposito_id order by l.id for update;

  if exists (select 1 from alq.alq_deposito_evento e
             where e.deposito_id=v_d.id and e.moneda<>v_d.moneda) then
    raise exception using errcode='P0001',message='ALQ_F1A_D_MONEDA_INCOMPATIBLE';
  end if;
  if exists (
    select 1 from alq.alq_deposito_evento e
    join alq.alq_contrato s on s.id=e.contrato_sucesor_id
    join alq.alq_contrato o on o.id=v_d.contrato_id
    where e.deposito_id=v_d.id and e.tipo='transferencia_a_sucesor'
      and (s.predecesor_id is distinct from v_d.contrato_id
        or s.propiedad_id is distinct from o.propiedad_id)) then
    raise exception using errcode='P0001',message='ALQ_F1A_D_SUCESOR_INVALIDO';
  end if;
  if exists (
    select 1 from alq.alq_deposito_liquidacion l
    join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
    where l.deposito_id=v_d.id and
      (x.moneda<>v_d.moneda or x.cargo_residual_id is not null)) then
    if exists (select 1 from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=v_d.id and x.cargo_residual_id is not null) then
      raise exception using errcode='P0001',message='ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO';
    end if;
    raise exception using errcode='P0001',message='ALQ_F1A_D_MONEDA_INCOMPATIBLE';
  end if;

  select
    coalesce((select sum(e.monto) from alq.alq_deposito_evento e
      where e.deposito_id=v_d.id and e.tipo in
        ('aplicacion','devolucion','transferencia_a_sucesor')),0)
    +coalesce((select sum(x.monto)
      from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=v_d.id and l.estado in ('aprobada','pagada')),0)
    into v_usado;
  if v_usado>v_d.monto_constituido then
    v_compuesta:=p_contexto='liquidacion';
    if v_compuesta then
      v_codigo:='ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO';
    else
      v_codigo:='ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE';
    end if;
    raise exception using errcode='P0001',message=v_codigo;
  end if;
end
$fn$;

-- Aplicaciones: preserva I1/I4 y agrega pagador/beneficiario del cargo histórico.
create or replace function alq_private.alq_validar_aplicacion_v1(p_aplicacion_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare a alq.alq_aplicacion%rowtype; t alq.alq_transaccion_caja%rowtype;
        c alq.alq_cargo%rowtype; cr alq.alq_credito%rowtype;
        rd alq.alq_rendicion%rowtype; de alq.alq_deposito_evento%rowtype;
        cv alq.alq_conversion_moneda%rowtype; v_deposito_id uuid;
begin
  select * into a from alq.alq_aplicacion where id=p_aplicacion_id;
  if not found then return; end if;
  select * into t from alq.alq_transaccion_caja where id=a.transaccion_id;
  if a.cargo_id is not null then select * into c from alq.alq_cargo where id=a.cargo_id; end if;
  if a.credito_id is not null then select * into cr from alq.alq_credito where id=a.credito_id; end if;
  if a.deposito_evento_id is not null then
    select * into de from alq.alq_deposito_evento where id=a.deposito_evento_id;
    select deposito_id into v_deposito_id from alq.alq_deposito_evento where id=a.deposito_evento_id;
  end if;
  if a.rendicion_id is not null then select * into rd from alq.alq_rendicion where id=a.rendicion_id; end if;
  if a.conversion_id is not null then select * into cv from alq.alq_conversion_moneda where id=a.conversion_id; end if;

  -- Ranking global: propiedad(2) -> contrato/garantía(3) -> depósito(5)
  -- -> transacción(6) -> cargo(7) -> crédito(8) -> aplicación(9)
  -- -> conversión/rendición(10). Cada conjunto se ordena por UUID.
  if c.id is not null then
    perform 1 from alq.alq_propiedad where id=c.propiedad_id for share;
    perform 1 from alq.alq_contrato where id=c.contrato_id for share;
    perform 1 from alq.alq_garantia g where g.contrato_id=c.contrato_id
      order by g.id for share;
  end if;
  if v_deposito_id is not null then
    perform 1 from alq.alq_deposito where id=v_deposito_id for update;
  end if;
  select * into t from alq.alq_transaccion_caja where id=a.transaccion_id for update;
  if c.id is not null then select * into c from alq.alq_cargo where id=c.id for update; end if;
  if cr.id is not null then select * into cr from alq.alq_credito where id=cr.id for update; end if;
  select * into a from alq.alq_aplicacion where id=p_aplicacion_id for update;
  if a.conversion_id is not null then
    select * into cv from alq.alq_conversion_moneda cm
      where cm.id=a.conversion_id for share;
  end if;
  if rd.id is not null then select * into rd from alq.alq_rendicion where id=rd.id for update; end if;

  if t.estado<>'confirmada' then raise exception 'ALQ_APLICACION_TRANSACCION_NO_CONFIRMADA'; end if;
  if a.moneda_origen<>t.moneda then raise exception 'ALQ_APLICACION_MONEDA_ORIGEN'; end if;
  if a.conversion_id is null and a.importe_origen<>a.importe_destino then
    raise exception 'ALQ_APLICACION_IMPORTE_SIN_CONVERSION';
  end if;
  if (select coalesce(sum(importe_origen),0) from alq.alq_aplicacion
      where transaccion_id=t.id)>t.monto then
    raise exception 'ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION';
  end if;
  if a.cargo_id is not null then
    if t.direccion<>'entrada' then raise exception 'ALQ_APLICACION_CARGO_REQUIERE_ENTRADA'; end if;
    if a.moneda_destino<>c.moneda then raise exception 'ALQ_APLICACION_MONEDA_CARGO'; end if;
    if t.contraparte_parte_id<>c.deudor_parte_id and not exists (
      select 1 from alq.alq_garantia g
      where g.contrato_id=c.contrato_id and g.garante_parte_id=t.contraparte_parte_id
        and t.fecha<@g.vigencia) then
      raise exception using errcode='P0001',message='ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE';
    end if;
    if t.beneficiario_parte_id<>c.acreedor_parte_id then
      raise exception using errcode='P0001',message='ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE';
    end if;
  end if;
  if a.credito_id is not null then
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_CREDITO_REQUIERE_SALIDA'; end if;
    if a.moneda_destino<>cr.moneda then raise exception 'ALQ_APLICACION_MONEDA_CREDITO'; end if;
  end if;
  if a.rendicion_id is not null then
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_RENDICION_REQUIERE_SALIDA'; end if;
    if rd.estado not in ('emitida','corregida') or a.moneda_destino<>rd.moneda then
      raise exception 'ALQ_APLICACION_RENDICION_INVALIDA';
    end if;
    if ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
          where ap.rendicion_id=rd.id)
        -(select coalesce(sum(ar.importe_destino_reabierto),0)
          from alq.alq_aplicacion_reversa ar
          join alq.alq_aplicacion ap on ap.id=ar.aplicacion_original_id
          join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
          where ap.rendicion_id=rd.id and rv.estado='confirmada'))
       >greatest(rd.saldo_final,0) then raise exception 'ALQ_GIROS_SUPERAN_SALDO_RENDICION'; end if;
  end if;
  if a.deposito_evento_id is not null then
    if a.moneda_destino<>de.moneda or
       ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
          where ap.deposito_evento_id=de.id)
        -(select coalesce(sum(ar.importe_destino_reabierto),0)
          from alq.alq_aplicacion_reversa ar
          join alq.alq_aplicacion ap on ap.id=ar.aplicacion_original_id
          join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
          where ap.deposito_evento_id=de.id and rv.estado='confirmada'))>de.monto then
      raise exception 'ALQ_APLICACION_DEPOSITO_INVALIDA';
    end if;
  end if;
  if a.conversion_id is not null then
    if cv.importe_origen<>a.importe_origen or cv.moneda_origen<>a.moneda_origen
       or cv.importe_destino<>a.importe_destino or cv.moneda_destino<>a.moneda_destino
       or cv.importe_destino<>alq_private.alq_redondear_v1(
          cv.importe_origen*cv.tasa,cv.regla_redondeo) then
      raise exception 'ALQ_I4_CONVERSION_NO_LIGADA';
    end if;
  end if;
  if a.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(a.cargo_id); end if;
  if a.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(a.credito_id); end if;
end
$fn$;

create or replace function alq_private.alq_validar_reversa_v1(p_reversa_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare r alq.alq_transaccion_caja%rowtype; o alq.alq_transaccion_caja%rowtype;
        x record; cv alq.alq_conversion_moneda%rowtype; cvr alq.alq_conversion_moneda%rowtype;
        v_aplicado numeric; v_reabierto numeric; v_reversado numeric;
begin
  select * into r from alq.alq_transaccion_caja where id=p_reversa_id;
  if not found then return; end if;
  if r.reversa_de is null then raise exception 'ALQ_REVERSA_SIN_ORIGINAL'; end if;
  perform 1 from alq.alq_transaccion_caja
    where id=any(array[p_reversa_id,r.reversa_de]) order by id for update;
  perform 1 from alq.alq_cargo c where c.id in (
    select a.cargo_id from alq.alq_aplicacion a
    where a.transaccion_id=r.reversa_de and a.cargo_id is not null)
    order by c.id for update;
  perform 1 from alq.alq_credito cr where cr.id in (
    select a.credito_id from alq.alq_aplicacion a
    where a.transaccion_id=r.reversa_de and a.credito_id is not null)
    order by cr.id for update;
  perform 1 from alq.alq_aplicacion a
    where a.transaccion_id=r.reversa_de order by a.id for update;
  perform 1 from alq.alq_aplicacion_reversa ar
    where ar.reversa_transaccion_id=p_reversa_id order by ar.id for update;
  perform 1 from alq.alq_conversion_moneda cm where cm.id in (
    select a.conversion_id from alq.alq_aplicacion a
      where a.transaccion_id=r.reversa_de and a.conversion_id is not null
    union select ar.conversion_reversa_id from alq.alq_aplicacion_reversa ar
      where ar.reversa_transaccion_id=p_reversa_id and ar.conversion_reversa_id is not null)
    order by cm.id for share;
  select * into r from alq.alq_transaccion_caja where id=p_reversa_id;
  select * into o from alq.alq_transaccion_caja where id=r.reversa_de;
  if o.estado<>'confirmada' or r.moneda<>o.moneda or r.ambito<>o.ambito
     or r.cuenta_custodia_id is distinct from o.cuenta_custodia_id
     or r.direccion=o.direccion then raise exception 'ALQ_I3_REVERSA_INCOMPATIBLE'; end if;
  if (select coalesce(sum(monto),0) from alq.alq_transaccion_caja
      where reversa_de=o.id and estado='confirmada')>o.monto then
    raise exception 'ALQ_I3_REVERSAS_SUPERAN_ORIGINAL';
  end if;
  -- El control histórico va primero y conserva mensaje exacto.
  if (select coalesce(sum(importe_origen_revertido),0)
      from alq.alq_aplicacion_reversa where reversa_transaccion_id=r.id)>r.monto then
    raise exception 'ALQ_T1_REAPERTURAS_SUPERAN_REVERSA';
  end if;
  if r.estado<>'confirmada' and exists (
      select 1 from alq.alq_aplicacion_reversa where reversa_transaccion_id=r.id) then
    raise exception using errcode='P0001',message='ALQ_F1A_R_REAPERTURA_REQUIERE_CONFIRMADA';
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
    if (select coalesce(sum(ar2.importe_destino_reabierto),0)
        from alq.alq_aplicacion_reversa ar2
        join alq.alq_transaccion_caja rv2 on rv2.id=ar2.reversa_transaccion_id
        where ar2.aplicacion_original_id=x.aplicacion_original_id
          and rv2.estado='confirmada')>x.original_destino then
      raise exception 'ALQ_T2_REAPERTURA_SUPERA_APLICACION';
    end if;
    if x.moneda_origen=x.moneda_destino then
      if x.importe_origen_revertido<>x.importe_destino_reabierto
         or x.conversion_reversa_id is not null then
        raise exception 'ALQ_T4_REAPERTURA_MISMA_MONEDA';
      end if;
    elsif x.conversion_reversa_id is not null then
      select * into cvr from alq.alq_conversion_moneda where id=x.conversion_reversa_id;
      if cvr.importe_origen<>x.importe_origen_revertido
         or cvr.moneda_origen<>x.moneda_origen
         or cvr.importe_destino<>x.importe_destino_reabierto
         or cvr.moneda_destino<>x.moneda_destino
         or cvr.importe_destino<>alq_private.alq_redondear_v1(
           cvr.importe_origen*cvr.tasa,cvr.regla_redondeo) then
        raise exception 'ALQ_T4_CONVERSION_REVERSA_NO_LIGADA';
      end if;
    else
      select * into cv from alq.alq_conversion_moneda where id=x.conversion_id;
      if not found or x.importe_destino_reabierto<>
        alq_private.alq_redondear_v1(x.importe_origen_revertido*cv.tasa,cv.regla_redondeo) then
        raise exception 'ALQ_T4_PROPORCION_ORIGINAL_INVALIDA';
      end if;
    end if;
  end loop;

  select coalesce(sum(a.importe_origen),0) into v_aplicado
  from alq.alq_aplicacion a where a.transaccion_id=o.id;
  select coalesce(sum(ar.importe_origen_revertido),0) into v_reabierto
  from alq.alq_aplicacion_reversa ar
  join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
  where rv.reversa_de=o.id and rv.estado='confirmada';
  select coalesce(sum(rv.monto),0) into v_reversado
  from alq.alq_transaccion_caja rv where rv.reversa_de=o.id and rv.estado='confirmada';
  if v_aplicado-v_reabierto>o.monto-v_reversado then
    raise exception using errcode='P0001',message='ALQ_F1A_R_REAPERTURA_INSUFICIENTE';
  end if;

  for x in select distinct a.cargo_id,a.credito_id
    from alq.alq_aplicacion a where a.transaccion_id=o.id
  loop
    if x.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(x.cargo_id); end if;
    if x.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(x.credito_id); end if;
  end loop;
end
$fn$;

create or replace function alq_private.alq_validar_transferencia_v1(p_transferencia_id uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_count int; v_dirs int; v_montos int; v_monedas int; v_cuentas int;
begin
  if p_transferencia_id is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ALQ-F1A-TRANSFERENCIA:'||p_transferencia_id::text,0));
  perform 1 from alq.alq_cuenta_custodia c where c.id in (
    select t.cuenta_custodia_id from alq.alq_transaccion_caja t
    where t.transferencia_id=p_transferencia_id and t.cuenta_custodia_id is not null)
    order by c.id for update;
  perform 1 from alq.alq_transaccion_caja
    where transferencia_id=p_transferencia_id order by id for update;
  select count(*),count(distinct direccion),count(distinct monto),count(distinct moneda),
         count(distinct cuenta_custodia_id)
    into v_count,v_dirs,v_montos,v_monedas,v_cuentas
  from alq.alq_transaccion_caja where transferencia_id=p_transferencia_id;
  if v_count<>2 or v_dirs<>2 or v_montos<>1 or v_monedas<>1 or v_cuentas<>2 then
    raise exception 'ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO';
  end if;
  if exists (
    select 1 from alq.alq_transaccion_caja t
    join alq.alq_cuenta_custodia c on c.id=t.cuenta_custodia_id
    where t.transferencia_id=p_transferencia_id
      and (t.moneda<>c.moneda or t.moneda<>(select min(t2.moneda)
           from alq.alq_transaccion_caja t2 where t2.transferencia_id=p_transferencia_id))) then
    raise exception using errcode='P0001',message='ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE';
  end if;
  if exists (select 1 from alq.alq_transaccion_caja t
             where t.transferencia_id=p_transferencia_id and
               (t.cuenta_validacion_version<>1 or t.cuenta_validada_activa_at is null)) then
    raise exception using errcode='P0001',message='ALQ_F1A_T02_CUENTA_INACTIVA';
  end if;
end
$fn$;

create function alq_private.alq_f1a_constraint_check_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_old uuid; v_new uuid; v_id uuid;
        v_context_old text:='evento'; v_context_new text:='evento';
begin
  if tg_table_name='alq_nota' then
    if tg_op='DELETE' then v_old:=old.cargo_id;
    elsif tg_op='INSERT' then v_new:=new.cargo_id;
    else v_old:=old.cargo_id; v_new:=new.cargo_id; end if;
    if tg_op<>'DELETE' then perform alq_private.alq_validar_nota_f1a_v1(new.id); end if;
    if v_old is not null and exists(select 1 from alq.alq_cargo where id=v_old) then
      perform alq_private.alq_recalcular_cargo_v1(v_old); end if;
    if v_new is not null and v_new is distinct from v_old
       and exists(select 1 from alq.alq_cargo where id=v_new) then
      perform alq_private.alq_recalcular_cargo_v1(v_new); end if;
  elsif tg_table_name='alq_credito_consumo' then
    if tg_op<>'DELETE' then perform alq_private.alq_validar_credito_consumo_f1a_v1(new.id); end if;
    if tg_op<>'INSERT' then
      if exists(select 1 from alq.alq_credito where id=old.credito_id) then
        perform alq_private.alq_recalcular_credito_v1(old.credito_id); end if;
      if exists(select 1 from alq.alq_cargo where id=old.cargo_id) then
        perform alq_private.alq_recalcular_cargo_v1(old.cargo_id); end if;
    end if;
    if tg_op<>'DELETE' then
      if (tg_op='INSERT' or new.credito_id is distinct from old.credito_id)
         and exists(select 1 from alq.alq_credito where id=new.credito_id) then
        perform alq_private.alq_recalcular_credito_v1(new.credito_id); end if;
      if (tg_op='INSERT' or new.cargo_id is distinct from old.cargo_id)
         and exists(select 1 from alq.alq_cargo where id=new.cargo_id) then
        perform alq_private.alq_recalcular_cargo_v1(new.cargo_id); end if;
    end if;
  elsif tg_table_name='alq_cargo' then
    if tg_op<>'DELETE' then
      perform alq_private.alq_validar_cargo_f1a_v1(new.id);
    end if;
  elsif tg_table_name='alq_deposito_evento' then
    if tg_op<>'INSERT' then
      v_old:=old.deposito_id;
      if exists (select 1 from alq.alq_operacion o
        where o.id=old.operacion_id and o.operacion='deposito_liquidar_y_devolver') then
        v_context_old:='liquidacion';
      end if;
    end if;
    if tg_op<>'DELETE' then
      v_new:=new.deposito_id;
      if exists (select 1 from alq.alq_operacion o
        where o.id=new.operacion_id and o.operacion='deposito_liquidar_y_devolver') then
        v_context_new:='liquidacion';
      end if;
    end if;
    if v_old is not null then
      perform alq_private.alq_validar_deposito_f1a_v1(v_old,v_context_old); end if;
    if v_new is not null and v_new is distinct from v_old then
      perform alq_private.alq_validar_deposito_f1a_v1(v_new,v_context_new); end if;
  elsif tg_table_name='alq_deposito_liquidacion' then
    if tg_op<>'INSERT' then v_old:=old.deposito_id; end if;
    if tg_op<>'DELETE' then v_new:=new.deposito_id; end if;
    if v_old is not null then perform alq_private.alq_validar_deposito_f1a_v1(v_old,'liquidacion'); end if;
    if v_new is not null and v_new is distinct from v_old then
      perform alq_private.alq_validar_deposito_f1a_v1(v_new,'liquidacion'); end if;
  elsif tg_table_name='alq_deposito_liquidacion_linea' then
    if tg_op<>'INSERT' then select l.deposito_id into v_old from alq.alq_deposito_liquidacion l
      where l.id=old.liquidacion_id; end if;
    if tg_op<>'DELETE' then select l.deposito_id into v_new from alq.alq_deposito_liquidacion l
      where l.id=new.liquidacion_id; end if;
    if v_old is not null then perform alq_private.alq_validar_deposito_f1a_v1(v_old,'liquidacion'); end if;
    if v_new is not null and v_new is distinct from v_old then
      perform alq_private.alq_validar_deposito_f1a_v1(v_new,'liquidacion'); end if;
  end if;
  return null;
end
$fn$;

-- Dispatcher histórico ampliado; conserva los tres triggers y controles nominales.
create or replace function alq_private.alq_constraint_check_v1()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare v_cargo uuid; v_credito uuid; v_id uuid; r record;
begin
  if tg_table_name='alq_transaccion_caja' then
    if tg_op<>'INSERT' and old.transferencia_id is not null then
      perform alq_private.alq_validar_transferencia_v1(old.transferencia_id);
    end if;
    if tg_op<>'DELETE' and new.transferencia_id is not null
       and (tg_op='INSERT' or new.transferencia_id is distinct from old.transferencia_id) then
      perform alq_private.alq_validar_transferencia_v1(new.transferencia_id);
    end if;
    if tg_op<>'INSERT' and old.reversa_de is not null then
      perform alq_private.alq_validar_reversa_v1(old.id);
    end if;
    if tg_op<>'DELETE' and new.reversa_de is not null
       and (tg_op='INSERT' or new.id is distinct from old.id
            or new.reversa_de is distinct from old.reversa_de) then
      perform alq_private.alq_validar_reversa_v1(new.id);
    end if;
    if tg_op<>'INSERT' then
      for r in select id from alq.alq_transaccion_caja
        where reversa_de=old.id order by id
      loop perform alq_private.alq_validar_reversa_v1(r.id); end loop;
    end if;
  elsif tg_table_name='alq_aplicacion' then
    if tg_op<>'DELETE' then perform alq_private.alq_validar_aplicacion_v1(new.id); end if;
    if tg_op<>'INSERT' and old.cargo_id is not null
       and exists(select 1 from alq.alq_cargo where id=old.cargo_id) then
      perform alq_private.alq_recalcular_cargo_v1(old.cargo_id); end if;
    if tg_op<>'INSERT' and old.credito_id is not null
       and exists(select 1 from alq.alq_credito where id=old.credito_id) then
      perform alq_private.alq_recalcular_credito_v1(old.credito_id); end if;
    if tg_op<>'DELETE' and new.cargo_id is not null
       and (tg_op='INSERT' or new.cargo_id is distinct from old.cargo_id)
       and exists(select 1 from alq.alq_cargo where id=new.cargo_id) then
      perform alq_private.alq_recalcular_cargo_v1(new.cargo_id); end if;
    if tg_op<>'DELETE' and new.credito_id is not null
       and (tg_op='INSERT' or new.credito_id is distinct from old.credito_id)
       and exists(select 1 from alq.alq_credito where id=new.credito_id) then
      perform alq_private.alq_recalcular_credito_v1(new.credito_id); end if;
    -- Una aplicación nueva o movida sobre una transacción ya revertida también
    -- debe respetar R01/R02. Revalidar todas las reversas confirmadas/no
    -- confirmadas de OLD y NEW cierra el escritor alternativo
    -- transaccion_registrar + aplicacion_asignar y el DML directo.
    if tg_op<>'INSERT' then
      for r in select id from alq.alq_transaccion_caja
        where reversa_de=old.transaccion_id order by id
      loop perform alq_private.alq_validar_reversa_v1(r.id); end loop;
    end if;
    if tg_op<>'DELETE' and (tg_op='INSERT'
       or new.transaccion_id is distinct from old.transaccion_id) then
      for r in select id from alq.alq_transaccion_caja
        where reversa_de=new.transaccion_id order by id
      loop perform alq_private.alq_validar_reversa_v1(r.id); end loop;
    end if;
  elsif tg_table_name='alq_aplicacion_reversa' then
    if tg_op<>'INSERT' then
      perform alq_private.alq_validar_reversa_v1(old.reversa_transaccion_id);
      select cargo_id,credito_id into v_cargo,v_credito from alq.alq_aplicacion
        where id=old.aplicacion_original_id;
      if v_cargo is not null then perform alq_private.alq_recalcular_cargo_v1(v_cargo); end if;
      if v_credito is not null then perform alq_private.alq_recalcular_credito_v1(v_credito); end if;
    end if;
    if tg_op<>'DELETE' then
      if tg_op='INSERT' or new.reversa_transaccion_id is distinct from old.reversa_transaccion_id then
        perform alq_private.alq_validar_reversa_v1(new.reversa_transaccion_id); end if;
      select cargo_id,credito_id into v_cargo,v_credito from alq.alq_aplicacion
        where id=new.aplicacion_original_id;
      if v_cargo is not null then perform alq_private.alq_recalcular_cargo_v1(v_cargo); end if;
      if v_credito is not null then perform alq_private.alq_recalcular_credito_v1(v_credito); end if;
    end if;
  end if;
  return null;
end
$fn$;

create constraint trigger alq_nota_financiera_ct
after insert or update or delete on alq.alq_nota
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();
create constraint trigger alq_credito_consumo_financiero_ct
after insert or update or delete on alq.alq_credito_consumo
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();
create constraint trigger alq_cargo_grafo_ct
after insert or update or delete on alq.alq_cargo
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();
create constraint trigger alq_deposito_evento_saldo_ct
after insert or update or delete on alq.alq_deposito_evento
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();
create constraint trigger alq_deposito_liquidacion_saldo_ct
after insert or update or delete on alq.alq_deposito_liquidacion
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();
create constraint trigger alq_deposito_linea_saldo_ct
after insert or update or delete on alq.alq_deposito_liquidacion_linea
deferrable initially deferred for each row execute function alq_private.alq_f1a_constraint_check_v1();

-- --------------------------------------------------------------------------
-- Inmutabilidad de raíces una vez que participan de hechos financieros.
-- --------------------------------------------------------------------------

create function alq_private.alq_f1a_raiz_inmutable_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
begin
  if tg_table_name='alq_cuenta_custodia' then
    if new.moneda<>old.moneda and exists (
       select 1 from alq.alq_transaccion_caja where cuenta_custodia_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_CUENTA_MONEDA_INMUTABLE';
    end if;
  elsif tg_table_name='alq_contrato' then
    if (new.propiedad_id,new.inquilino_parte_id,new.predecesor_id)
       is distinct from (old.propiedad_id,old.inquilino_parte_id,old.predecesor_id)
       and exists (select 1 from alq.alq_cargo c where c.contrato_id=old.id
                   union all select 1 from alq.alq_credito cr where cr.contrato_id=old.id
                   union all select 1 from alq.alq_deposito d where d.contrato_id=old.id
                   union all select 1 from alq.alq_deposito_evento e
                     where e.contrato_sucesor_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_CONTRATO_RAIZ_INMUTABLE';
    end if;
  elsif tg_table_name='alq_periodo' then
    if (new.contrato_id,new.contrato_version_id)
       is distinct from (old.contrato_id,old.contrato_version_id)
       and exists (select 1 from alq.alq_cargo where periodo_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_PERIODO_RAIZ_INMUTABLE';
    end if;
  elsif tg_table_name='alq_garantia' then
    if (new.contrato_id,new.garante_parte_id,new.vigencia)
       is distinct from (old.contrato_id,old.garante_parte_id,old.vigencia) then
      raise exception using errcode='P0001',message='ALQ_F1A_GARANTIA_RAIZ_INMUTABLE';
    end if;
  elsif tg_table_name='alq_deposito' then
    if (new.contrato_id,new.moneda,new.monto_constituido)
       is distinct from (old.contrato_id,old.moneda,old.monto_constituido)
       and exists (select 1 from alq.alq_deposito_evento where deposito_id=old.id
                   union all select 1 from alq.alq_deposito_liquidacion where deposito_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_DEPOSITO_RAIZ_INMUTABLE';
    end if;
  elsif tg_table_name='alq_credito' then
    if (new.parte_id,new.contrato_id,new.moneda,new.monto_original,new.transaccion_origen_id)
       is distinct from
       (old.parte_id,old.contrato_id,old.moneda,old.monto_original,old.transaccion_origen_id)
       and exists (select 1 from alq.alq_credito_consumo where credito_id=old.id
                   union all select 1 from alq.alq_aplicacion where credito_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_CREDITO_RAIZ_INMUTABLE';
    end if;
    if new.monto_original is distinct from old.monto_original
       and not exists (select 1 from alq.alq_credito_consumo where credito_id=old.id
                       union all select 1 from alq.alq_aplicacion where credito_id=old.id) then
      new.saldo_pendiente:=new.monto_original;
    end if;
  elsif tg_table_name='alq_conversion_moneda' then
    if row(new.*) is distinct from row(old.*) and exists (
       select 1 from alq.alq_aplicacion where conversion_id=old.id
       union all select 1 from alq.alq_aplicacion_reversa where conversion_reversa_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_CONVERSION_INMUTABLE';
    end if;
  elsif tg_table_name='alq_cargo' then
    if (new.propiedad_id,new.contrato_id,new.periodo_id,new.deudor_parte_id,
        new.acreedor_parte_id,new.moneda,new.monto)
       is distinct from
       (old.propiedad_id,old.contrato_id,old.periodo_id,old.deudor_parte_id,
        old.acreedor_parte_id,old.moneda,old.monto)
       and exists (select 1 from alq.alq_aplicacion where cargo_id=old.id
                   union all select 1 from alq.alq_nota where cargo_id=old.id
                   union all select 1 from alq.alq_credito_consumo where cargo_id=old.id
                   union all select 1 from alq.alq_servicio_factura where cargo_id=old.id
                   union all select 1 from alq.alq_rendicion_linea where cargo_id=old.id
                   union all select 1 from alq.alq_deposito_liquidacion_linea
                     where cargo_residual_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_CARGO_RAIZ_INMUTABLE';
    end if;
    if new.monto is distinct from old.monto
       and not exists (select 1 from alq.alq_aplicacion where cargo_id=old.id
                       union all select 1 from alq.alq_nota where cargo_id=old.id
                       union all select 1 from alq.alq_credito_consumo where cargo_id=old.id
                       union all select 1 from alq.alq_servicio_factura where cargo_id=old.id
                       union all select 1 from alq.alq_rendicion_linea where cargo_id=old.id
                       union all select 1 from alq.alq_deposito_liquidacion_linea
                         where cargo_residual_id=old.id) then
      new.saldo_pendiente:=new.monto;
    end if;
  elsif tg_table_name='alq_transaccion_caja' then
    if old.transferencia_id is not null and row(new.*) is distinct from row(old.*) then
      raise exception using errcode='P0001',message='ALQ_F1A_TRANSFERENCIA_HISTORICA_INMUTABLE';
    end if;
    if (new.operacion_id,new.transferencia_id)
       is distinct from (old.operacion_id,old.transferencia_id) then
      raise exception using errcode='P0001',message='ALQ_F1A_TRANSACCION_IDENTIDAD_INMUTABLE';
    end if;
    if (new.contraparte_parte_id,new.beneficiario_parte_id,new.fecha,new.direccion,
        new.monto,new.moneda,new.estado,new.reversa_de)
       is distinct from
       (old.contraparte_parte_id,old.beneficiario_parte_id,old.fecha,old.direccion,
        old.monto,old.moneda,old.estado,old.reversa_de)
       and exists (select 1 from alq.alq_aplicacion where transaccion_id=old.id
                   union all select 1 from alq.alq_transaccion_caja where reversa_de=old.id
                   union all select 1 from alq.alq_aplicacion_reversa
                     where reversa_transaccion_id=old.id
                   union all select 1 from alq.alq_credito where transaccion_origen_id=old.id
                   union all select 1 from alq.alq_deposito_evento where transaccion_id=old.id
                   union all select 1 from alq.alq_rendicion_linea where transaccion_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_TRANSACCION_RAIZ_INMUTABLE';
    end if;
  elsif tg_table_name='alq_aplicacion' then
    if new.operacion_id is distinct from old.operacion_id then
      raise exception using errcode='P0001',message='ALQ_F1A_APLICACION_IDENTIDAD_INMUTABLE';
    end if;
    if row(new.*) is distinct from row(old.*) and exists (
       select 1 from alq.alq_aplicacion_reversa where aplicacion_original_id=old.id) then
      raise exception using errcode='P0001',message='ALQ_F1A_APLICACION_RAIZ_INMUTABLE';
    end if;
  end if;
  return new;
end
$fn$;

create function alq_private.alq_f1a_garantia_delete_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
begin
  if exists (
    select 1
    from alq.alq_transaccion_caja t
    join alq.alq_aplicacion a on a.transaccion_id=t.id
    join alq.alq_cargo c on c.id=a.cargo_id
    where c.contrato_id=old.contrato_id
      and t.contraparte_parte_id=old.garante_parte_id
      and t.fecha<@old.vigencia
      and t.contraparte_parte_id<>c.deudor_parte_id
  ) then
    raise exception using errcode='P0001',message='ALQ_F1A_GARANTIA_HISTORICA_INMUTABLE';
  end if;
  return old;
end
$fn$;

create trigger alq_cuenta_raiz_inmutable_bu before update on alq.alq_cuenta_custodia
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_contrato_raiz_inmutable_bu before update on alq.alq_contrato
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_periodo_raiz_inmutable_bu before update on alq.alq_periodo
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_garantia_raiz_inmutable_bu before update on alq.alq_garantia
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_garantia_delete_guard_bd before delete on alq.alq_garantia
for each row execute function alq_private.alq_f1a_garantia_delete_guard_v1();
create trigger alq_deposito_raiz_inmutable_bu before update on alq.alq_deposito
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_credito_raiz_inmutable_bu before update on alq.alq_credito
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_conversion_raiz_inmutable_bu before update on alq.alq_conversion_moneda
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_cargo_raiz_inmutable_bu before update on alq.alq_cargo
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_transaccion_raiz_inmutable_bu before update on alq.alq_transaccion_caja
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();
create trigger alq_aplicacion_raiz_inmutable_bu before update on alq.alq_aplicacion
for each row execute function alq_private.alq_f1a_raiz_inmutable_v1();

-- --------------------------------------------------------------------------
-- Kernel v2: identidad por hecho, comando idempotente y prevalidación.
-- --------------------------------------------------------------------------

create function alq_private.alq_f1a_operaciones_v2()
returns text[] language sql immutable security definer set search_path=''
as $fn$
  select array['nota_emitir','credito_consumir','transferencia_interna',
    'deposito_evento_registrar','deposito_liquidar_y_devolver',
    'reversa_con_reapertura','cargo_manual_emitir','pago_multimoneda']::text[]
$fn$;

create function alq_private.alq_f1a_identidad_v2(
  p_operacion text,p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql immutable security definer set search_path=''
as $fn$
declare v_namespace text; v_campo text; v_ref text; v_uuid uuid; v_evidencia jsonb;
begin
  case p_operacion
    when 'nota_emitir' then v_namespace:='alq.nota'; v_campo:='nota_ref';
    when 'credito_consumir' then v_namespace:='alq.credito_consumo'; v_campo:='consumo_ref';
    when 'transferencia_interna' then v_namespace:='alq.transferencia'; v_campo:='transferencia_ref';
    when 'deposito_evento_registrar' then v_namespace:='alq.deposito_evento'; v_campo:='evento_ref';
    when 'deposito_liquidar_y_devolver' then v_namespace:='alq.deposito_liquidacion'; v_campo:='liquidacion_ref';
    when 'reversa_con_reapertura' then v_namespace:='alq.reversa'; v_campo:='reversa_ref';
    when 'cargo_manual_emitir' then v_namespace:='alq.cargo_manual'; v_campo:='cargo_fuente_ref';
    when 'pago_multimoneda' then v_namespace:='alq.pago'; v_campo:='pago_fuente_ref';
    else raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_V2_NO_PERMITIDA';
  end case;
  if p_payload ?| array['tipo_fuente','autoridad_fuente','cuenta_fuente','clave_sha256'] then
    raise exception using errcode='P0001',message='ALQ_F1A_AUTORIDAD_FUENTE_CLIENTE_PROHIBIDA';
  end if;
  v_ref:=p_payload->>v_campo;
  if v_ref is null or length(v_ref)>64 then
    raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_REQUERIDA';
  end if;
  begin v_uuid:=v_ref::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_MANUAL_NO_CANONICA';
  end;
  if lower(v_uuid::text)<>lower(v_ref) then
    raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_MANUAL_NO_CANONICA';
  end if;
  v_evidencia:=jsonb_build_object('v',1,'tipo_fuente','manual',
    'autoridad_fuente',p_actor::text,'cuenta_fuente',null,'id_inmutable',v_uuid::text);
  return jsonb_build_object(
    'namespace',v_namespace,'clave_version',1,'clave_evidencia',v_evidencia,
    'clave_sha256',encode(extensions.digest(convert_to(v_evidencia::text,'UTF8'),'sha256'),'hex'),
    'payload_sha256',encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex'));
end
$fn$;

create function alq_private.alq_f1a_comando_sha_v2(
  p_accion text,p_actor uuid,p_operacion_request_id uuid,p_hecho_id uuid,
  p_operacion text,p_firma text,p_payload_sha text,p_motivo text)
returns text language sql immutable security definer set search_path=''
as $fn$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'accion',p_accion,'actor',p_actor,'operacion_request_id',p_operacion_request_id,
    'hecho_id',p_hecho_id,'operacion',p_operacion,'firma',p_firma,
    'payload_sha256',p_payload_sha,'motivo',p_motivo)::text,'UTF8'),'sha256'),'hex')
$fn$;

create function alq_private.alq_f1a_evento_replay_v2(
  p_comando_request_id uuid,p_comando_sha text,p_accion text,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
-- VOLATILE es deliberado: el segundo lookup post-advisory debe tomar un
-- snapshot fresco y ver el recibo que otra transacción confirmó al liberar el lock.
as $fn$
declare v alq_private.alq_operacion_evento_v2%rowtype;
begin
  select * into v from alq_private.alq_operacion_evento_v2
    where comando_request_id=p_comando_request_id;
  if not found then return null; end if;
  if v.comando_sha256 is distinct from p_comando_sha
     or v.accion is distinct from p_accion
     or v.actor_efectivo_parte_usuario_id is distinct from p_actor then
    raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
  end if;
  return v.envelope;
end
$fn$;

create function alq_private.alq_f1a_qualification_run_id_v1()
returns uuid language plpgsql stable security definer set search_path=''
as $fn$
declare v_run uuid; v_ok boolean:=false; v_local_marker boolean:=false;
        v_local_reg regclass;
begin
  if to_regclass('pg_temp.alq_f1a_qualification_context') is null then return null; end if;
  v_local_reg:=to_regclass('alq_f1a_local.fixture_marca');
  if v_local_reg is not null then
    execute format('select exists(select 1 from %s where singleton '
      'and data_directory=current_setting(''data_directory''))',v_local_reg)
      into v_local_marker;
  end if;
  v_ok:=(current_database()='postgres' and session_user='postgres'
    and exists (select 1 from private.qa_marca_descartable
      where singleton and project_ref='rsjwqmpseknvydistgfr'))
    or (current_database()='alq_f1a_fixture' and session_user='postgres'
      and current_setting('server_version_num')='170006'
      and inet_server_addr() is null and current_setting('listen_addresses')=''
      and v_local_marker);
  if not v_ok then
    raise exception using errcode='P0001',message='ALQ_F1A_QUALIFICATION_CONTEXT_INVALIDO';
  end if;
  execute 'select run_id from pg_temp.alq_f1a_qualification_context
           where (select count(*) from pg_temp.alq_f1a_qualification_context)=1
           limit 1' into v_run;
  if v_run is null then
    raise exception using errcode='P0001',message='ALQ_F1A_QUALIFICATION_RUN_ID_INVALIDO';
  end if;
  return v_run;
end
$fn$;

create function alq_private.alq_f1a_registrar_evento_v2(
  p_identidad jsonb,p_run_id uuid,p_hecho_id uuid,p_operacion_id uuid,
  p_operacion_request_id uuid,p_accion text,p_actor uuid,p_codigo text,
  p_comando_request_id uuid,p_comando_sha text,p_envelope jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v alq_private.alq_operacion_evento_v2%rowtype;
        v_actor_original uuid; v_supervisor boolean;
begin
  p_run_id:=coalesce(p_run_id,alq_private.alq_f1a_qualification_run_id_v1());
  if p_hecho_id is not null then
    select actor_parte_usuario_id into v_actor_original
    from alq_private.alq_hecho_idempotente_v2 where id=p_hecho_id;
  else
    v_actor_original:=p_actor;
  end if;
  select exists (
    select 1 from alq.alq_capacidad_admin ca
    where ca.parte_usuario_id=p_actor and ca.capacidad='supervisor'
      and statement_timestamp()<@ca.vigencia
  ) into v_supervisor;
  insert into alq_private.alq_operacion_evento_v2(namespace,clave_version,clave_sha256,
    payload_sha256,run_id,hecho_id,operacion_id,operacion_request_id,accion,
    actor_efectivo_parte_usuario_id,capacidad_snapshot,codigo,comando_request_id,
    comando_sha256,envelope)
  values (p_identidad->>'namespace',(p_identidad->>'clave_version')::smallint,
    p_identidad->>'clave_sha256',p_identidad->>'payload_sha256',p_run_id,
    p_hecho_id,p_operacion_id,p_operacion_request_id,p_accion,p_actor,
    jsonb_build_object('actor_original',p_actor is not distinct from v_actor_original,
      'supervisor',v_supervisor),p_codigo,p_comando_request_id,p_comando_sha,p_envelope)
  on conflict (comando_request_id) where comando_request_id is not null do nothing
  returning * into v;
  if not found then
    select * into v from alq_private.alq_operacion_evento_v2
      where comando_request_id=p_comando_request_id;
    if v.comando_sha256 is distinct from p_comando_sha
       or v.accion is distinct from p_accion
       or v.actor_efectivo_parte_usuario_id is distinct from p_actor then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
  end if;
  return v.envelope;
end
$fn$;

create function alq_private.alq_f1a_actor_puede_operar_v2(
  p_actor_original uuid,p_actor_efectivo uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
  select p_actor_efectivo is not null and (
    p_actor_efectivo=p_actor_original or exists (
      select 1 from alq.alq_capacidad_admin ca
      where ca.parte_usuario_id=p_actor_efectivo
        and ca.capacidad='supervisor'
        and statement_timestamp()<@ca.vigencia))
$fn$;

create function alq_private.alq_f1a_prevalidar_v2(
  p_operacion text,p_payload jsonb,p_actor uuid)
returns void language plpgsql volatile security definer set search_path=''
as $fn$
declare v_c alq.alq_cargo%rowtype; v_cr alq.alq_credito%rowtype;
        v_con alq.alq_contrato%rowtype; v_p alq.alq_periodo%rowtype;
        v_s alq.alq_contrato%rowtype; v_app alq.alq_aplicacion%rowtype;
        v_d alq.alq_deposito%rowtype; v_o alq.alq_transaccion_caja%rowtype;
        v_a jsonb; v_total numeric:=0; v_reabrir numeric:=0; v_por_app numeric;
        v_cuenta1 alq.alq_cuenta_custodia%rowtype;
        v_cuenta2 alq.alq_cuenta_custodia%rowtype;
begin
  if p_operacion is null or not (p_operacion=any(alq_private.alq_f1a_operaciones_v2())) then
    raise exception using errcode='P0001',message='ALQ_F1A_OPERACION_V2_NO_PERMITIDA';
  end if;
  if jsonb_typeof(coalesce(p_payload,'null'::jsonb))<>'object' then
    raise exception using errcode='P0001',message='ALQ_PAYLOAD_NO_ES_OBJETO';
  end if;
  perform alq_private.alq_f1a_lock_revalidar_payload_v1(p_operacion,p_payload);

  if p_operacion='nota_emitir' then
    select * into v_c from alq.alq_cargo where id=(p_payload->>'cargo_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if p_payload->>'moneda'<>v_c.moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE';
    end if;
  elsif p_operacion='credito_consumir' then
    select * into v_c from alq.alq_cargo where id=(p_payload->>'cargo_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    select * into v_cr from alq.alq_credito where id=(p_payload->>'credito_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if p_payload->>'moneda'<>v_c.moneda or p_payload->>'moneda'<>v_cr.moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE';
    end if;
    select * into v_con from alq.alq_contrato where id=v_cr.contrato_id for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if v_c.contrato_id is null or v_c.contrato_id<>v_cr.contrato_id
       or v_c.deudor_parte_id<>v_cr.parte_id or v_c.propiedad_id<>v_con.propiedad_id then
      raise exception using errcode='P0001',message='ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE';
    end if;
  elsif p_operacion='transferencia_interna' then
    perform 1 from alq.alq_cuenta_custodia
      where id=any(array[(p_payload->>'cuenta_origen_id')::uuid,
                         (p_payload->>'cuenta_destino_id')::uuid])
      order by id for update;
    select * into v_cuenta1 from alq.alq_cuenta_custodia
      where id=(p_payload->>'cuenta_origen_id')::uuid;
    select * into v_cuenta2 from alq.alq_cuenta_custodia
      where id=(p_payload->>'cuenta_destino_id')::uuid;
    if v_cuenta1.id is null or v_cuenta2.id is null then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if v_cuenta1.id=v_cuenta2.id then raise exception 'ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO'; end if;
    if p_payload->>'moneda'<>v_cuenta1.moneda or p_payload->>'moneda'<>v_cuenta2.moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE';
    end if;
    if not v_cuenta1.activa or not v_cuenta2.activa then
      raise exception using errcode='P0001',message='ALQ_F1A_T02_CUENTA_INACTIVA';
    end if;
  elsif p_operacion='deposito_evento_registrar' then
    select * into v_d from alq.alq_deposito where id=(p_payload->>'deposito_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if p_payload->>'moneda'<>v_d.moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_D_MONEDA_INCOMPATIBLE';
    end if;
    if p_payload->>'tipo'='transferencia_a_sucesor' then
      select * into v_con from alq.alq_contrato where id=v_d.contrato_id for update;
      if not found then
        raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
      end if;
      select * into v_s from alq.alq_contrato
        where id=(p_payload->>'contrato_sucesor_id')::uuid for update;
      if not found then
        raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
      end if;
      if v_s.predecesor_id is distinct from v_d.contrato_id
         or v_s.propiedad_id is distinct from v_con.propiedad_id then
        raise exception using errcode='P0001',message='ALQ_F1A_D_SUCESOR_INVALIDO';
      end if;
    end if;
    select v_d.monto_constituido
      -coalesce((select sum(e.monto) from alq.alq_deposito_evento e
        where e.deposito_id=v_d.id and e.tipo in
          ('aplicacion','devolucion','transferencia_a_sucesor')),0)
      -coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
        join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
        where l.deposito_id=v_d.id and l.estado in ('aprobada','pagada')),0)
      into v_total;
    if p_payload->>'tipo' in ('aplicacion','devolucion','transferencia_a_sucesor')
       and (p_payload->>'monto')::numeric>v_total then
      raise exception using errcode='P0001',message='ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE';
    end if;
  elsif p_operacion='deposito_liquidar_y_devolver' then
    select * into v_d from alq.alq_deposito where id=(p_payload->>'deposito_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    for v_a in select value from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb)) loop
      if (v_a->>'cargo_residual_id') is not null then
        raise exception using errcode='P0001',message='ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO';
      end if;
      if v_a->>'moneda'<>v_d.moneda then
        raise exception using errcode='P0001',message='ALQ_F1A_D_MONEDA_INCOMPATIBLE';
      end if;
      v_total:=v_total+(v_a->>'monto')::numeric;
    end loop;
    v_total:=v_total+coalesce((p_payload->>'monto_devolver')::numeric,0);
    if p_payload->>'moneda'<>v_d.moneda then
      raise exception using errcode='P0001',message='ALQ_F1A_D_MONEDA_INCOMPATIBLE';
    end if;
    if v_total>v_d.monto_constituido
       -coalesce((select sum(e.monto) from alq.alq_deposito_evento e
        where e.deposito_id=v_d.id and e.tipo in
          ('aplicacion','devolucion','transferencia_a_sucesor')),0)
       -coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
        join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
        where l.deposito_id=v_d.id and l.estado in ('aprobada','pagada')),0) then
      raise exception using errcode='P0001',message='ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO';
    end if;
  elsif p_operacion='cargo_manual_emitir' then
    perform 1 from alq.alq_propiedad where id=(p_payload->>'propiedad_id')::uuid for update;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
    end if;
    if (p_payload->>'contrato_id') is not null then
      select * into v_con from alq.alq_contrato where id=(p_payload->>'contrato_id')::uuid for update;
      if not found then
        raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
      end if;
      if v_con.propiedad_id<>(p_payload->>'propiedad_id')::uuid then
        raise exception using errcode='P0001',message='ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE';
      end if;
    end if;
    if (p_payload->>'periodo_id') is not null then
      select * into v_p from alq.alq_periodo where id=(p_payload->>'periodo_id')::uuid for update;
      if not found then
        raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
      end if;
      if (p_payload->>'contrato_id') is null or v_p.contrato_id<>(p_payload->>'contrato_id')::uuid then
        raise exception using errcode='P0001',message='ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE';
      end if;
    end if;
    if p_payload->>'concepto'='alquiler_periodo'
       and ((p_payload->>'contrato_id') is null
         or (p_payload->>'deudor_parte_id')::uuid<>v_con.inquilino_parte_id) then
      raise exception using errcode='P0001',message='ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE';
    end if;
  elsif p_operacion='pago_multimoneda' then
    if (select coalesce(sum((x.value->>'importe_origen')::numeric),0)
        from jsonb_array_elements(coalesce(p_payload->'aplicaciones','[]'::jsonb)) x)
       >(p_payload->>'monto')::numeric then
      raise exception 'ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION';
    end if;
    for v_a in select value from jsonb_array_elements(coalesce(p_payload->'aplicaciones','[]'::jsonb)) loop
      if nullif(v_a->>'cargo_id','') is null
         or nullif(v_a->>'credito_id','') is not null
         or nullif(v_a->>'deposito_evento_id','') is not null
         or nullif(v_a->>'rendicion_id','') is not null then
        raise exception using errcode='P0001',message='ALQ_F1A_PAGO_DESTINO_INVALIDO';
      end if;
      select * into v_c from alq.alq_cargo where id=(v_a->>'cargo_id')::uuid for update;
      if not found then
        raise exception using errcode='P0001',message='ALQ_F1A_REFERENCIA_NO_EXISTE';
      end if;
      if (p_payload->>'contraparte_parte_id')::uuid<>v_c.deudor_parte_id and not exists (
        select 1 from alq.alq_garantia g where g.contrato_id=v_c.contrato_id
          and g.garante_parte_id=(p_payload->>'contraparte_parte_id')::uuid
          and (p_payload->>'fecha')::timestamptz<@g.vigencia) then
        raise exception using errcode='P0001',message='ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE';
      end if;
      if (p_payload->>'beneficiario_parte_id')::uuid<>v_c.acreedor_parte_id then
        raise exception using errcode='P0001',message='ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE';
      end if;
      if v_a->>'moneda_destino' is distinct from v_c.moneda then
        raise exception 'ALQ_APLICACION_MONEDA_CARGO';
      end if;
      if not (v_a ? 'conversion') then
        -- Monedas distintas sin conversión pertenecen al CHECK físico
        -- alq_aplicacion_moneda_ck (ACTRL 23514); no se falsifica su mensaje.
        if v_a->>'moneda_origen' is not distinct from v_a->>'moneda_destino'
           and (v_a->>'importe_origen')::numeric is distinct from
              (v_a->>'importe_destino')::numeric then
          raise exception 'ALQ_APLICACION_IMPORTE_SIN_CONVERSION';
        end if;
      elsif v_a->>'moneda_origen' is not distinct from v_a->>'moneda_destino'
         or v_a#>>'{conversion,moneda_origen}' is distinct from v_a->>'moneda_origen'
         or v_a#>>'{conversion,moneda_destino}' is distinct from v_a->>'moneda_destino'
         or (v_a#>>'{conversion,importe_origen}')::numeric is distinct from
            (v_a->>'importe_origen')::numeric
         or (v_a#>>'{conversion,importe_destino}')::numeric is distinct from
            (v_a->>'importe_destino')::numeric
         or (v_a#>>'{conversion,importe_destino}')::numeric is distinct from
            alq_private.alq_redondear_v1(
              (v_a#>>'{conversion,importe_origen}')::numeric
              *(v_a#>>'{conversion,tasa}')::numeric,
              v_a#>>'{conversion,regla_redondeo}') then
        raise exception 'ALQ_I4_CONVERSION_NO_LIGADA';
      end if;
    end loop;
  elsif p_operacion='reversa_con_reapertura' then
    select * into v_o from alq.alq_transaccion_caja
      where id=(p_payload->>'original_id')::uuid for update;
    if not found or v_o.estado<>'confirmada' then
      raise exception 'ALQ_I3_REVERSA_INCOMPATIBLE';
    end if;
    for v_a in select value from jsonb_array_elements(coalesce(p_payload->'reaperturas','[]'::jsonb)) loop
      v_reabrir:=v_reabrir+(v_a->>'importe_origen_revertido')::numeric;
      select * into v_app from alq.alq_aplicacion
        where id=(v_a->>'aplicacion_original_id')::uuid for update;
      if not found or v_app.transaccion_id<>v_o.id then
        raise exception 'ALQ_T3_APLICACION_NO_PERTENECE';
      end if;
      if v_a->>'moneda_origen' is distinct from v_app.moneda_origen
         or v_a->>'moneda_destino' is distinct from v_app.moneda_destino then
        raise exception 'ALQ_T4_MONEDAS_NO_COINCIDEN_CON_APLICACION';
      end if;
      select coalesce(sum(ar.importe_destino_reabierto),0)
        into v_por_app from alq.alq_aplicacion_reversa ar
        join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
        where ar.aplicacion_original_id=v_app.id and rv.estado='confirmada';
      if v_por_app+(v_a->>'importe_destino_reabierto')::numeric>v_app.importe_destino then
        raise exception 'ALQ_T2_REAPERTURA_SUPERA_APLICACION';
      end if;
    end loop;
    if v_reabrir>(p_payload->>'monto')::numeric then
      raise exception 'ALQ_T1_REAPERTURAS_SUPERAN_REVERSA';
    end if;
    select coalesce(sum(a.importe_origen),0)
      -coalesce((select sum(ar.importe_origen_revertido)
        from alq.alq_aplicacion_reversa ar
        join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
        where rv.reversa_de=v_o.id and rv.estado='confirmada'),0)
      into v_total from alq.alq_aplicacion a where a.transaccion_id=v_o.id;
    if v_total-v_reabrir>v_o.monto
       -coalesce((select sum(rv.monto) from alq.alq_transaccion_caja rv
         where rv.reversa_de=v_o.id and rv.estado='confirmada'),0)
       -(p_payload->>'monto')::numeric then
      raise exception using errcode='P0001',message='ALQ_F1A_R_REAPERTURA_INSUFICIENTE';
    end if;
  end if;

  -- La contención general se evalúa después de cada guarda nominal.
  if p_operacion in ('transferencia_interna','deposito_liquidar_y_devolver')
     or (p_payload->>'ambito')='custodiada'
     or (p_operacion='reversa_con_reapertura' and v_o.ambito='custodiada') then
    raise exception using errcode='P0001',message='ALQ_CUSTODIADA_DESHABILITADA';
  end if;
end
$fn$;

create function alq_private.alq_f1a_error_negocio_v2(
  p_sqlstate text,p_mensaje text,p_constraint text)
returns boolean language sql immutable security definer set search_path=''
as $fn$
  select case
    when p_sqlstate='P0001' and p_mensaje=any(array[
      'ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE',
      'ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE',
      'ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE',
      'ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE',
      'ALQ_F1A_T02_CUENTA_INACTIVA',
      'ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE',
      'ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO',
      'ALQ_F1A_D_MONEDA_INCOMPATIBLE',
      'ALQ_F1A_D_SUCESOR_INVALIDO',
      'ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO',
      'ALQ_F1A_R_REAPERTURA_INSUFICIENTE',
      'ALQ_F1A_R_REAPERTURA_REQUIERE_CONFIRMADA',
      'ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE',
      'ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE',
      'ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE',
      'ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE',
      'ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE',
      'ALQ_F1A_REFERENCIA_NO_EXISTE',
      'ALQ_F1A_PAGO_DESTINO_INVALIDO',
      'ALQ_CUSTODIADA_DESHABILITADA',
      'ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION',
      'ALQ_APLICACION_MONEDA_CARGO',
      'ALQ_APLICACION_IMPORTE_SIN_CONVERSION',
      'ALQ_I3_REVERSA_INCOMPATIBLE',
      'ALQ_I3_REVERSAS_SUPERAN_ORIGINAL',
      'ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO',
      'ALQ_T1_REAPERTURAS_SUPERAN_REVERSA',
      'ALQ_T2_REAPERTURA_SUPERA_APLICACION',
      'ALQ_T3_APLICACION_NO_PERTENECE',
      'ALQ_T4_MONEDAS_NO_COINCIDEN_CON_APLICACION'
    ]::text[]) then true
    when p_sqlstate='23514' and p_constraint='alq_aplicacion_moneda_ck' then true
    else false end
$fn$;

create function alq_private.alq_admin_preparar_core_v2(
  p_comando_request_id uuid,p_operacion text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_actor uuid; v_identidad jsonb; v_comando_sha text; v_replay jsonb;
        v_hecho alq_private.alq_hecho_idempotente_v2%rowtype;
        v_op alq.alq_operacion%rowtype; v_firma text; v_envelope jsonb;
        v_request uuid; v_codigo text; v_sqlstate text;
begin
  if p_comando_request_id is null then
    raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_REQUEST_REQUERIDO';
  end if;
  set constraints all deferred;
  v_actor:=alq_private.alq_actor_v1(true);
  v_identidad:=alq_private.alq_f1a_identidad_v2(p_operacion,coalesce(p_payload,'{}'::jsonb),v_actor);
  v_comando_sha:=alq_private.alq_f1a_comando_sha_v2('preparar',v_actor,null,null,
    p_operacion,null,v_identidad->>'payload_sha256',null);
  v_replay:=alq_private.alq_f1a_evento_replay_v2(
    p_comando_request_id,v_comando_sha,'preparar',v_actor);
  if v_replay is not null then return v_replay; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    (v_identidad->>'namespace')||':'||(v_identidad->>'clave_sha256'),0));
  -- Otro preparar con el mismo comando pudo haber ganado mientras esperábamos
  -- el lock de la clave. Repetir el lookup antes de crear hecho/intento evita
  -- persistir filas que luego quedarían ocultas por ON CONFLICT del recibo.
  v_replay:=alq_private.alq_f1a_evento_replay_v2(
    p_comando_request_id,v_comando_sha,'preparar',v_actor);
  if v_replay is not null then return v_replay; end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2 h
  where h.namespace=v_identidad->>'namespace'
    and h.clave_version=(v_identidad->>'clave_version')::smallint
    and h.clave_sha256=v_identidad->>'clave_sha256' for update;

  if found then
    if v_hecho.payload_sha256 is distinct from v_identidad->>'payload_sha256' then
      v_envelope:=jsonb_build_object('ok',false,'estado','conflicto','codigo',
        'ALQ_F1A_CLAVE_PAYLOAD_CONFLICTO','comando_request_id',p_comando_request_id,
        'hecho_id',v_hecho.id,'operacion',p_operacion,'reintentable',false);
      return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,null,null,null,
        'preparar',v_actor,'ALQ_F1A_CLAVE_PAYLOAD_CONFLICTO',p_comando_request_id,
        v_comando_sha,v_envelope);
    end if;
    select * into v_op from alq.alq_operacion o where o.hecho_id=v_hecho.id
      order by o.intento desc limit 1 for update;
    if v_hecho.aplicada_operacion_id is not null then
      select * into v_op from alq.alq_operacion where id=v_hecho.aplicada_operacion_id;
      v_envelope:=jsonb_build_object('ok',true,'estado','aplicada','hecho_id',v_hecho.id,
        'operacion_id',v_op.id,'operacion_request_id',v_op.request_id,
        'comando_request_id',p_comando_request_id,'operacion',v_op.operacion,
        'firma',v_op.firma_sha256,'resultado',v_op.resultado);
    elsif v_op.estado='preparada' and clock_timestamp()<v_op.expires_at then
      v_envelope:=jsonb_build_object('ok',true,'estado','preparada','hecho_id',v_hecho.id,
        'operacion_id',v_op.id,'operacion_request_id',v_op.request_id,
        'comando_request_id',p_comando_request_id,'operacion',v_op.operacion,
        'firma',v_op.firma_sha256,'intento',v_op.intento,'expires_at',v_op.expires_at);
    else
      if v_op.estado='preparada' then
        v_codigo:='ALQ_F1A_OPERACION_EXPIRADA';
      else
        v_codigo:=coalesce(v_op.resultado->>'codigo','ALQ_F1A_INTENTO_RECHAZADO');
      end if;
      v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','hecho_id',v_hecho.id,
        'operacion_id',v_op.id,'operacion_request_id',v_op.request_id,
        'comando_request_id',p_comando_request_id,'intento',v_op.intento,
        'codigo',v_codigo,
        'reintentable',true);
      if v_op.estado='preparada' then
        update alq.alq_operacion set estado='rechazada',resultado=v_envelope
          where id=v_op.id returning * into v_op;
      end if;
    end if;
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,
      case when v_op.id is null then null else v_hecho.id end,
      v_op.id,v_op.request_id,'preparar',v_actor,v_envelope->>'codigo',
      p_comando_request_id,v_comando_sha,v_envelope);
  end if;

  begin
    perform alq_private.alq_f1a_prevalidar_v2(p_operacion,p_payload,v_actor);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_codigo=message_text,v_sqlstate=returned_sqlstate;
    if not alq_private.alq_f1a_error_negocio_v2(v_sqlstate,v_codigo,null) then raise; end if;
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada_sin_fila',
      'comando_request_id',p_comando_request_id,'operacion',p_operacion,'codigo',v_codigo,
      'reintentable',false,'requiere_nueva_preparacion',true);
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,null,null,null,
      'preparar',v_actor,v_codigo,p_comando_request_id,v_comando_sha,v_envelope);
  end;

  v_firma:=alq_private.alq_firma_v1(p_operacion,p_payload);
  insert into alq_private.alq_hecho_idempotente_v2(namespace,clave_version,clave_evidencia,
    clave_sha256,payload_sha256,actor_parte_usuario_id)
  values (v_identidad->>'namespace',(v_identidad->>'clave_version')::smallint,
    v_identidad->'clave_evidencia',v_identidad->>'clave_sha256',
    v_identidad->>'payload_sha256',v_actor) returning * into v_hecho;
  v_request:=pg_catalog.gen_random_uuid();
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at,hecho_id,intento,expires_at)
  values (v_request,p_operacion,p_payload,v_firma,'preparada',v_actor,clock_timestamp(),
    v_hecho.id,1,clock_timestamp()+interval '15 minutes') returning * into v_op;
  v_envelope:=jsonb_build_object('ok',true,'estado','preparada',
    'comando_request_id',p_comando_request_id,'operacion_request_id',v_request,
    'operacion_id',v_op.id,'hecho_id',v_hecho.id,'operacion',p_operacion,
    'firma',v_firma,'intento',1,'expires_at',v_op.expires_at);
  return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
    v_request,'preparar',v_actor,null,p_comando_request_id,v_comando_sha,v_envelope);
end
$fn$;

create function alq_private.alq_admin_aplicar_core_v2(
  p_operacion_request_id uuid,p_comando_request_id uuid,p_operacion text,
  p_firma text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_actor uuid; v_op alq.alq_operacion%rowtype;
        v_hecho alq_private.alq_hecho_idempotente_v2%rowtype;
        v_evt alq_private.alq_operacion_evento_v2%rowtype;
        v_identidad jsonb; v_comando_sha text; v_replay jsonb; v_result jsonb;
        v_envelope jsonb; v_codigo text; v_sqlstate text; v_constraint text;
begin
  if p_comando_request_id is null then
    raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_REQUEST_REQUERIDO';
  end if;
  set constraints all deferred;
  if p_operacion is null or p_firma is null or p_payload is null then
    raise exception using errcode='P0001',message='ALQ_FIRMA_O_PAYLOAD_NO_COINCIDE';
  end if;
  v_actor:=alq_private.alq_actor_v1(true);
  select * into v_evt from alq_private.alq_operacion_evento_v2
    where comando_request_id=p_comando_request_id;
  if found then
    if v_evt.accion is distinct from 'aplicar'
       or v_evt.actor_efectivo_parte_usuario_id is distinct from v_actor
       or v_evt.operacion_request_id is distinct from p_operacion_request_id then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    v_comando_sha:=alq_private.alq_f1a_comando_sha_v2('aplicar',v_actor,
      p_operacion_request_id,v_evt.hecho_id,p_operacion,p_firma,
      encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex'),null);
    if v_evt.comando_sha256 is distinct from v_comando_sha then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    return v_evt.envelope;
  end if;
  select * into v_op from alq.alq_operacion where request_id=p_operacion_request_id;
  if not found or v_op.hecho_id is null then
    raise exception using errcode='P0001',message='ALQ_REQUEST_NO_PREPARADO';
  end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2
    where id=v_op.hecho_id;
  if not found then
    raise exception using errcode='P0001',message='ALQ_REQUEST_NO_PREPARADO';
  end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2
    where id=v_op.hecho_id for update;
  if not alq_private.alq_f1a_actor_puede_operar_v2(
      v_hecho.actor_parte_usuario_id,v_actor) then
    raise exception using errcode='42501',message='ALQ_F1A_ACTOR_NO_AUTORIZADO';
  end if;
  select * into v_op from alq.alq_operacion
    where request_id=p_operacion_request_id and hecho_id=v_hecho.id for update;
  if not found then raise exception using errcode='P0001',message='ALQ_REQUEST_NO_PREPARADO'; end if;
  v_identidad:=jsonb_build_object('namespace',v_hecho.namespace,'clave_version',v_hecho.clave_version,
    'clave_evidencia',v_hecho.clave_evidencia,'clave_sha256',v_hecho.clave_sha256,
    'payload_sha256',v_hecho.payload_sha256);
  v_comando_sha:=alq_private.alq_f1a_comando_sha_v2('aplicar',v_actor,
    p_operacion_request_id,v_hecho.id,p_operacion,p_firma,
    encode(extensions.digest(convert_to(coalesce(p_payload,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex'),null);
  v_replay:=alq_private.alq_f1a_evento_replay_v2(
    p_comando_request_id,v_comando_sha,'aplicar',v_actor);
  if v_replay is not null then return v_replay; end if;

  if v_op.operacion is distinct from p_operacion
     or v_op.payload_normalizado is distinct from coalesce(p_payload,'{}'::jsonb)
     or v_op.firma_sha256 is distinct from p_firma
     or p_firma is distinct from
       alq_private.alq_firma_v1(p_operacion,coalesce(p_payload,'{}'::jsonb)) then
    raise exception using errcode='P0001',message='ALQ_FIRMA_O_PAYLOAD_NO_COINCIDE';
  end if;
  if v_op.actor_parte_usuario_id is distinct from v_hecho.actor_parte_usuario_id then
    raise exception using errcode='P0001',message='ALQ_F1A_ACTOR_ECONOMICO_DERIVADO';
  end if;
  if v_op.estado='aplicada' then
    v_envelope:=jsonb_build_object('ok',true,'estado','aplicada','hecho_id',v_hecho.id,
      'operacion_id',v_op.id,'intento',v_op.intento,'operacion_request_id',v_op.request_id,
      'comando_request_id',p_comando_request_id,'operacion',v_op.operacion,
      'firma',v_op.firma_sha256,'resultado',v_op.resultado);
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
      v_op.request_id,'aplicar',v_actor,null,p_comando_request_id,v_comando_sha,v_envelope);
  end if;
  if v_op.estado<>'preparada' then
    v_envelope:=jsonb_build_object('ok',false,'estado',v_op.estado,'codigo',
      coalesce(v_op.resultado->>'codigo','ALQ_F1A_INTENTO_NO_APLICABLE'),
      'hecho_id',v_hecho.id,'operacion_id',v_op.id,
      'operacion_request_id',v_op.request_id,'comando_request_id',p_comando_request_id,
      'reintentable',v_op.estado='rechazada');
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
      v_op.request_id,'aplicar',v_actor,v_envelope->>'codigo',p_comando_request_id,
      v_comando_sha,v_envelope);
  end if;
  if clock_timestamp()>=v_op.expires_at then
    v_codigo:='ALQ_F1A_OPERACION_EXPIRADA';
  else
    begin
      perform alq_private.alq_f1a_prevalidar_v2(p_operacion,p_payload,v_actor);
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_codigo=message_text,v_sqlstate=returned_sqlstate;
      if not alq_private.alq_f1a_error_negocio_v2(v_sqlstate,v_codigo,null) then raise; end if;
    end;
  end if;
  if v_codigo is not null then
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','codigo',v_codigo,
      'hecho_id',v_hecho.id,'operacion_id',v_op.id,'intento',v_op.intento,
      'operacion_request_id',v_op.request_id,'comando_request_id',p_comando_request_id,
      'reintentable',true);
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope where id=v_op.id;
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
      v_op.request_id,'aplicar',v_actor,v_codigo,p_comando_request_id,v_comando_sha,v_envelope);
  end if;

  begin
    set constraints all deferred;
    v_result:=alq_private.alq_aplicar_operacion_v1(
      p_operacion,v_op.payload_normalizado,v_op.id,v_op.actor_parte_usuario_id);
    v_envelope:=jsonb_build_object('ok',true,'estado','aplicada','hecho_id',v_hecho.id,
      'operacion_id',v_op.id,'intento',v_op.intento,'operacion_request_id',v_op.request_id,
      'comando_request_id',p_comando_request_id,'operacion',p_operacion,'firma',p_firma,
      'resultado',v_result);
    update alq.alq_operacion set estado='aplicada',resultado=v_result,
      aplicada_at=clock_timestamp() where id=v_op.id;
    update alq_private.alq_hecho_idempotente_v2 set aplicada_operacion_id=v_op.id
      where id=v_hecho.id;
    v_envelope:=alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,
      v_hecho.id,v_op.id,v_op.request_id,'aplicar',v_actor,null,
      p_comando_request_id,v_comando_sha,v_envelope);
    -- Incluye guardas financieras, forma exacta de efectos, recibo terminal y
    -- consistencia hecho/intento. Si algo falla, este subbloque revierte todo.
    set constraints all immediate;
  exception when others then
    get stacked diagnostics v_codigo=message_text,v_sqlstate=returned_sqlstate,
      v_constraint=constraint_name;
    if not alq_private.alq_f1a_error_negocio_v2(v_sqlstate,v_codigo,v_constraint) then raise; end if;
  end;
  set constraints all deferred;
  if v_codigo is not null then
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','codigo',v_codigo,
      'hecho_id',v_hecho.id,'operacion_id',v_op.id,'intento',v_op.intento,
      'operacion_request_id',v_op.request_id,'comando_request_id',p_comando_request_id,
      'constraint',v_constraint,'reintentable',true);
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope where id=v_op.id;
    v_envelope:=alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,
      v_hecho.id,v_op.id,v_op.request_id,'aplicar',v_actor,v_codigo,
      p_comando_request_id,v_comando_sha,v_envelope);
    set constraints all immediate;
    set constraints all deferred;
  end if;
  return v_envelope;
end
$fn$;

create function alq_private.alq_admin_cancelar_core_v2(
  p_operacion_request_id uuid,p_comando_request_id uuid,p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_actor uuid; v_op alq.alq_operacion%rowtype;
        v_hecho alq_private.alq_hecho_idempotente_v2%rowtype;
        v_evt alq_private.alq_operacion_evento_v2%rowtype;
        v_identidad jsonb; v_sha text; v_replay jsonb; v_envelope jsonb;
begin
  if p_comando_request_id is null then
    raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_REQUEST_REQUERIDO';
  end if;
  set constraints all deferred;
  v_actor:=alq_private.alq_actor_v1(true);
  select * into v_evt from alq_private.alq_operacion_evento_v2
    where comando_request_id=p_comando_request_id;
  if found then
    if v_evt.accion is distinct from 'cancelar'
       or v_evt.actor_efectivo_parte_usuario_id is distinct from v_actor
       or v_evt.operacion_request_id is distinct from p_operacion_request_id then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    select * into v_op from alq.alq_operacion where id=v_evt.operacion_id;
    select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=v_evt.hecho_id;
    v_sha:=alq_private.alq_f1a_comando_sha_v2('cancelar',v_actor,
      p_operacion_request_id,v_evt.hecho_id,v_op.operacion,v_op.firma_sha256,
      v_hecho.payload_sha256,p_motivo);
    if v_evt.comando_sha256 is distinct from v_sha then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    return v_evt.envelope;
  end if;
  select * into v_op from alq.alq_operacion where request_id=p_operacion_request_id;
  if not found or v_op.hecho_id is null then raise exception 'ALQ_REQUEST_NO_PREPARADO'; end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=v_op.hecho_id;
  if not found then raise exception 'ALQ_REQUEST_NO_PREPARADO'; end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=v_op.hecho_id for update;
  if not alq_private.alq_f1a_actor_puede_operar_v2(
      v_hecho.actor_parte_usuario_id,v_actor) then
    raise exception using errcode='42501',message='ALQ_F1A_ACTOR_NO_AUTORIZADO';
  end if;
  select * into v_op from alq.alq_operacion
    where request_id=p_operacion_request_id and hecho_id=v_hecho.id for update;
  if not found then raise exception 'ALQ_REQUEST_NO_PREPARADO'; end if;
  v_identidad:=jsonb_build_object('namespace',v_hecho.namespace,'clave_version',v_hecho.clave_version,
    'clave_sha256',v_hecho.clave_sha256,'payload_sha256',v_hecho.payload_sha256);
  v_sha:=alq_private.alq_f1a_comando_sha_v2('cancelar',v_actor,v_op.request_id,
    v_hecho.id,v_op.operacion,v_op.firma_sha256,v_hecho.payload_sha256,p_motivo);
  v_replay:=alq_private.alq_f1a_evento_replay_v2(p_comando_request_id,v_sha,'cancelar',v_actor);
  if v_replay is not null then return v_replay; end if;
  if v_op.estado='preparada' then
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','codigo','ALQ_F1A_CANCELADA',
      'hecho_id',v_hecho.id,'operacion_id',v_op.id,'intento',v_op.intento,
      'operacion_request_id',v_op.request_id,'comando_request_id',p_comando_request_id,
      'motivo',p_motivo,'reintentable',true);
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope where id=v_op.id;
  elsif v_op.estado='aplicada' then
    v_envelope:=jsonb_build_object('ok',true,'estado','aplicada','hecho_id',v_hecho.id,
      'operacion_id',v_op.id,'operacion_request_id',v_op.request_id,
      'comando_request_id',p_comando_request_id,'motivo',p_motivo,
      'resultado',v_op.resultado);
  else
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','codigo',
      coalesce(v_op.resultado->>'codigo','ALQ_F1A_INTENTO_RECHAZADO'),
      'hecho_id',v_hecho.id,'operacion_id',v_op.id,'intento',v_op.intento,
      'operacion_request_id',v_op.request_id,'comando_request_id',p_comando_request_id,
      'motivo',p_motivo,'reintentable',true);
  end if;
  return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
    v_op.request_id,'cancelar',v_actor,v_envelope->>'codigo',p_comando_request_id,v_sha,v_envelope);
end
$fn$;

create function alq_private.alq_admin_reintentar_core_v2(
  p_hecho_id uuid,p_comando_request_id uuid,p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare v_actor uuid; v_hecho alq_private.alq_hecho_idempotente_v2%rowtype;
        v_anterior alq.alq_operacion%rowtype; v_op alq.alq_operacion%rowtype;
        v_evt alq_private.alq_operacion_evento_v2%rowtype;
        v_identidad jsonb; v_sha text; v_replay jsonb; v_envelope jsonb;
        v_codigo text; v_sqlstate text; v_request uuid; v_op_id uuid;
        v_intento int; v_preparada_at timestamptz;
begin
  if p_comando_request_id is null then
    raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_REQUEST_REQUERIDO';
  end if;
  set constraints all deferred;
  v_actor:=alq_private.alq_actor_v1(true);
  select * into v_evt from alq_private.alq_operacion_evento_v2
    where comando_request_id=p_comando_request_id;
  if found then
    if v_evt.accion is distinct from 'reintentar'
       or v_evt.actor_efectivo_parte_usuario_id is distinct from v_actor
       or v_evt.hecho_id is distinct from p_hecho_id then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    select * into v_op from alq.alq_operacion where id=v_evt.operacion_id;
    select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=v_evt.hecho_id;
    v_sha:=alq_private.alq_f1a_comando_sha_v2('reintentar',v_actor,null,
      p_hecho_id,v_op.operacion,v_op.firma_sha256,v_hecho.payload_sha256,p_motivo);
    if v_evt.comando_sha256 is distinct from v_sha then
      raise exception using errcode='P0001',message='ALQ_F1A_COMANDO_CONFLICTO';
    end if;
    return v_evt.envelope;
  end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=p_hecho_id;
  if not found then raise exception using errcode='P0001',message='ALQ_F1A_HECHO_NO_EXISTE'; end if;
  select * into v_hecho from alq_private.alq_hecho_idempotente_v2 where id=p_hecho_id for update;
  if not alq_private.alq_f1a_actor_puede_operar_v2(
      v_hecho.actor_parte_usuario_id,v_actor) then
    raise exception using errcode='42501',message='ALQ_F1A_ACTOR_NO_AUTORIZADO';
  end if;
  select * into v_anterior from alq.alq_operacion where hecho_id=v_hecho.id
    order by intento desc limit 1 for update;
  v_identidad:=jsonb_build_object('namespace',v_hecho.namespace,'clave_version',v_hecho.clave_version,
    'clave_sha256',v_hecho.clave_sha256,'payload_sha256',v_hecho.payload_sha256);
  v_sha:=alq_private.alq_f1a_comando_sha_v2('reintentar',v_actor,null,v_hecho.id,
    v_anterior.operacion,v_anterior.firma_sha256,v_hecho.payload_sha256,p_motivo);
  v_replay:=alq_private.alq_f1a_evento_replay_v2(
    p_comando_request_id,v_sha,'reintentar',v_actor);
  if v_replay is not null then return v_replay; end if;

  if v_hecho.aplicada_operacion_id is not null then
    select * into v_op from alq.alq_operacion where id=v_hecho.aplicada_operacion_id;
    v_envelope:=jsonb_build_object('ok',true,'estado','aplicada','hecho_id',v_hecho.id,
      'operacion_id',v_op.id,'operacion_request_id',v_op.request_id,
      'comando_request_id',p_comando_request_id,'motivo',p_motivo,
      'resultado',v_op.resultado);
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
      v_op.request_id,'reintentar',v_actor,null,p_comando_request_id,v_sha,v_envelope);
  end if;
  if v_anterior.estado='preparada' and clock_timestamp()>=v_anterior.expires_at then
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada',
      'codigo','ALQ_F1A_OPERACION_EXPIRADA','hecho_id',v_hecho.id,
      'operacion_id',v_anterior.id,'intento',v_anterior.intento,
      'operacion_request_id',v_anterior.request_id,'comando_request_id',null,
      'reintentable',true);
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope
      where id=v_anterior.id returning * into v_anterior;
    perform alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,
      v_hecho.id,v_anterior.id,v_anterior.request_id,'sanear',null,
      'ALQ_F1A_OPERACION_EXPIRADA',null,null,v_envelope);
  end if;
  if v_anterior.estado='preparada' then
    v_envelope:=jsonb_build_object('ok',false,'estado','preparada','codigo',
      'ALQ_F1A_REINTENTO_YA_ACTIVO','hecho_id',v_hecho.id,'operacion_id',v_anterior.id,
      'operacion_request_id',v_anterior.request_id,'comando_request_id',p_comando_request_id,
      'motivo',p_motivo,'reintentable',false);
    return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_anterior.id,
      v_anterior.request_id,'reintentar',v_actor,'ALQ_F1A_REINTENTO_YA_ACTIVO',
      p_comando_request_id,v_sha,v_envelope);
  end if;
  if v_anterior.estado<>'rechazada' then
    raise exception using errcode='P0001',message='ALQ_F1A_REINTENTO_ESTADO_INVALIDO';
  end if;
  v_intento:=v_anterior.intento+1;
  v_request:=pg_catalog.gen_random_uuid();
  begin
    perform alq_private.alq_f1a_prevalidar_v2(
      v_anterior.operacion,v_anterior.payload_normalizado,v_hecho.actor_parte_usuario_id);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_codigo=message_text,v_sqlstate=returned_sqlstate;
    if not alq_private.alq_f1a_error_negocio_v2(v_sqlstate,v_codigo,null) then raise; end if;
  end;
  v_op_id:=pg_catalog.gen_random_uuid();
  v_preparada_at:=clock_timestamp();
  if v_codigo is null then
    v_envelope:=jsonb_build_object('ok',true,'estado','preparada','hecho_id',v_hecho.id,
      'operacion_id',v_op_id,'operacion_request_id',v_request,
      'comando_request_id',p_comando_request_id,'operacion',v_anterior.operacion,
      'firma',v_anterior.firma_sha256,'intento',v_intento,
      'motivo',p_motivo,'expires_at',v_preparada_at+interval '15 minutes');
    insert into alq.alq_operacion(id,request_id,operacion,payload_normalizado,firma_sha256,
      estado,resultado,actor_parte_usuario_id,preparada_at,hecho_id,intento,expires_at)
    values (v_op_id,v_request,v_anterior.operacion,v_anterior.payload_normalizado,
      v_anterior.firma_sha256,'preparada',null,v_hecho.actor_parte_usuario_id,
      v_preparada_at,v_hecho.id,v_intento,v_preparada_at+interval '15 minutes')
    returning * into v_op;
  else
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada','codigo',v_codigo,
      'hecho_id',v_hecho.id,'operacion_id',v_op_id,'operacion_request_id',v_request,
      'comando_request_id',p_comando_request_id,'motivo',p_motivo,
      'intento',v_intento,'reintentable',true);
    insert into alq.alq_operacion(id,request_id,operacion,payload_normalizado,firma_sha256,
      estado,resultado,actor_parte_usuario_id,preparada_at,hecho_id,intento,expires_at)
    values (v_op_id,v_request,v_anterior.operacion,v_anterior.payload_normalizado,
      v_anterior.firma_sha256,'preparada',null,v_hecho.actor_parte_usuario_id,
      v_preparada_at,v_hecho.id,v_intento,v_preparada_at+interval '15 minutes')
      returning * into v_op;
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope
      where id=v_op.id returning * into v_op;
  end if;
  return alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_hecho.id,v_op.id,
    v_op.request_id,'reintentar',v_actor,v_codigo,p_comando_request_id,v_sha,v_envelope);
end
$fn$;

create function alq_private.alq_sanear_preparadas_v2()
returns integer language plpgsql volatile security definer set search_path=''
as $fn$
declare v_n integer:=0; v_op alq.alq_operacion%rowtype;
        v_h alq_private.alq_hecho_idempotente_v2%rowtype;
        v_identidad jsonb; v_envelope jsonb; v_local_reg regclass;
        v_local_ok boolean:=false; v_destino_ok boolean:=false;
begin
  set constraints all deferred;
  if session_user<>'postgres' then
    raise exception using errcode='42501',message='ALQ_F1A_SANEAMIENTO_SERVER_OWNED';
  end if;
  v_local_reg:=to_regclass('alq_f1a_local.fixture_marca');
  if v_local_reg is not null then
    execute format('select exists(select 1 from %s where singleton '
      'and data_directory=current_setting(''data_directory''))',v_local_reg)
      into v_local_ok;
  end if;
  v_destino_ok:=(current_database()='postgres' and exists (
      select 1 from private.qa_marca_descartable
      where singleton and project_ref='rsjwqmpseknvydistgfr'))
    or (current_database()='alq_f1a_fixture' and current_setting('server_version_num')='170006'
      and inet_server_addr() is null and current_setting('listen_addresses')=''
      and v_local_ok);
  if not v_destino_ok then
    raise exception using errcode='P0001',message='ALQ_F1A_SANEAMIENTO_DESTINO_INVALIDO';
  end if;

  -- V2 siempre bloquea hecho antes de intento; los candidatos se descubren sin
  -- lock y se releen bajo lock para no invertir el orden de aplicar/cancelar/retry.
  for v_h in select h.* from alq_private.alq_hecho_idempotente_v2 h
    where exists (select 1 from alq.alq_operacion o where o.hecho_id=h.id
      and o.estado='preparada' and o.expires_at<=clock_timestamp())
    order by h.id
  loop
    select * into v_h from alq_private.alq_hecho_idempotente_v2
      where id=v_h.id for update;
    select * into v_op from alq.alq_operacion
      where hecho_id=v_h.id and estado='preparada' and expires_at<=clock_timestamp()
      order by intento desc limit 1 for update;
    if not found then continue; end if;
    v_envelope:=jsonb_build_object('ok',false,'estado','rechazada',
      'codigo','ALQ_F1A_OPERACION_EXPIRADA','hecho_id',v_h.id,
      'operacion_id',v_op.id,'intento',v_op.intento,
      'operacion_request_id',v_op.request_id,'comando_request_id',null,
      'reintentable',true);
    update alq.alq_operacion set estado='rechazada',resultado=v_envelope
      where id=v_op.id;
    v_identidad:=jsonb_build_object('namespace',v_h.namespace,
      'clave_version',v_h.clave_version,'clave_sha256',v_h.clave_sha256,
      'payload_sha256',v_h.payload_sha256);
    perform alq_private.alq_f1a_registrar_evento_v2(v_identidad,null,v_h.id,v_op.id,
      v_op.request_id,'sanear',null,'ALQ_F1A_OPERACION_EXPIRADA',null,null,v_envelope);
    v_n:=v_n+1;
  end loop;

  -- Legado V1 no tiene hecho/evento. Se procesa aparte y sólo después de V2,
  -- siempre en orden UUID de operación.
  for v_op in select o.* from alq.alq_operacion o
    where o.hecho_id is null and o.estado='preparada'
      and o.expires_at<=clock_timestamp() order by o.id
  loop
    select * into v_op from alq.alq_operacion where id=v_op.id
      and hecho_id is null and estado='preparada'
      and expires_at<=clock_timestamp() for update;
    if not found then continue; end if;
    update alq.alq_operacion set estado='rechazada',
      resultado=jsonb_build_object('ok',false,'estado','rechazada',
        'codigo','ALQ_F1A_OPERACION_EXPIRADA','reintentable',false)
      where id=v_op.id;
    v_n:=v_n+1;
  end loop;
  return v_n;
end
$fn$;

create function alq_private.alq_preparadas_estado_v2()
returns jsonb language sql stable security definer set search_path=''
as $fn$
  select jsonb_build_object(
    'activas',count(*) filter(where expires_at>statement_timestamp()),
    'vencidas',count(*) filter(where expires_at<=statement_timestamp()),
    'v1_activas',count(*) filter(where hecho_id is null and expires_at>statement_timestamp()),
    'v1_vencidas',count(*) filter(where hecho_id is null and expires_at<=statement_timestamp()),
    'v2_activas',count(*) filter(where hecho_id is not null and expires_at>statement_timestamp()),
    'v2_vencidas',count(*) filter(where hecho_id is not null and expires_at<=statement_timestamp()),
    'conflictos_total',(select count(*)
      from alq_private.alq_operacion_evento_v2 e
      where e.envelope->>'estado'='conflicto'
        and e.codigo='ALQ_F1A_CLAVE_PAYLOAD_CONFLICTO'))
  from alq.alq_operacion where estado='preparada'
$fn$;

-- V1 conserva firma/excepciones; única guarda transversal nueva: expiración.
create or replace function alq_private.alq_admin_aplicar_core_v1(
  p_request_id uuid,p_operacion text,p_firma text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
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
  if v_op.expires_at is null or clock_timestamp()>=v_op.expires_at then
    raise exception 'ALQ_F1A_OPERACION_EXPIRADA';
  end if;
  v_result:=alq_private.alq_aplicar_operacion_v1(
    p_operacion,v_op.payload_normalizado,v_op.id,v_actor);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,aplicada_at=clock_timestamp()
    where id=v_op.id;
  return v_result;
end
$fn$;

create function public.alq_admin_preparar_v2(
  p_comando_request_id uuid,p_operacion text,p_payload jsonb)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select alq_private.alq_admin_preparar_core_v2(p_comando_request_id,p_operacion,p_payload)
$fn$;
create function public.alq_admin_aplicar_v2(
  p_operacion_request_id uuid,p_comando_request_id uuid,p_operacion text,
  p_firma text,p_payload jsonb)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select alq_private.alq_admin_aplicar_core_v2(p_operacion_request_id,
    p_comando_request_id,p_operacion,p_firma,p_payload)
$fn$;
create function public.alq_admin_cancelar_v2(
  p_operacion_request_id uuid,p_comando_request_id uuid,p_motivo text)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select alq_private.alq_admin_cancelar_core_v2(
    p_operacion_request_id,p_comando_request_id,p_motivo)
$fn$;
create function public.alq_admin_reintentar_v2(
  p_hecho_id uuid,p_comando_request_id uuid,p_motivo text)
returns jsonb language sql volatile security invoker set search_path=''
as $fn$
  select alq_private.alq_admin_reintentar_core_v2(p_hecho_id,p_comando_request_id,p_motivo)
$fn$;

create function alq_private.alq_assert_financiero_f1a_v1()
returns text language plpgsql stable security definer set search_path=''
as $fn$
begin
  if exists (select 1 from alq.alq_nota n join alq.alq_cargo c on c.id=n.cargo_id
             where n.moneda<>c.moneda) then raise exception 'ALQ_ASSERT_F1A_N01'; end if;
  if exists (select 1 from alq.alq_credito_consumo cc
    join alq.alq_credito cr on cr.id=cc.credito_id join alq.alq_cargo c on c.id=cc.cargo_id
    join alq.alq_contrato co on co.id=cr.contrato_id
    where cc.moneda<>cr.moneda or cc.moneda<>c.moneda or cr.contrato_id<>c.contrato_id
      or cr.parte_id<>c.deudor_parte_id or co.propiedad_id<>c.propiedad_id) then
    raise exception 'ALQ_ASSERT_F1A_C';
  end if;
  if exists (select 1 from alq.alq_transaccion_caja t
    join alq.alq_cuenta_custodia c on c.id=t.cuenta_custodia_id
    where t.cuenta_validacion_version=1 and
      (t.moneda<>c.moneda or t.cuenta_validada_activa_at is null)) then
    raise exception 'ALQ_ASSERT_F1A_T';
  end if;
  if exists (select 1 from alq.alq_cargo c join alq.alq_contrato co on co.id=c.contrato_id
    left join alq.alq_periodo p on p.id=c.periodo_id
    where c.propiedad_id<>co.propiedad_id
      or (c.periodo_id is not null and p.contrato_id<>c.contrato_id)
      or (c.concepto='alquiler_periodo' and c.deudor_parte_id<>co.inquilino_parte_id)) then
    raise exception 'ALQ_ASSERT_F1A_J';
  end if;
  if exists (select 1 from alq.alq_aplicacion a
    join alq.alq_transaccion_caja t on t.id=a.transaccion_id
    join alq.alq_cargo c on c.id=a.cargo_id
    where (t.contraparte_parte_id<>c.deudor_parte_id and not exists (
      select 1 from alq.alq_garantia g where g.contrato_id=c.contrato_id
        and g.garante_parte_id=t.contraparte_parte_id and t.fecha<@g.vigencia))
      or t.beneficiario_parte_id<>c.acreedor_parte_id) then
    raise exception 'ALQ_ASSERT_F1A_J45';
  end if;
  if exists (select 1 from alq.alq_deposito d where
    coalesce((select sum(e.monto) from alq.alq_deposito_evento e
      where e.deposito_id=d.id and e.tipo in
      ('aplicacion','devolucion','transferencia_a_sucesor')),0)
    +coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=d.id and l.estado in ('aprobada','pagada')),0)>d.monto_constituido)
    then raise exception 'ALQ_ASSERT_F1A_D'; end if;
  if exists (
    select 1 from alq.alq_deposito_evento e
    join alq.alq_deposito d on d.id=e.deposito_id
    join alq.alq_contrato origen on origen.id=d.contrato_id
    left join alq.alq_contrato sucesor on sucesor.id=e.contrato_sucesor_id
    where e.moneda is distinct from d.moneda
       or (e.tipo='transferencia_a_sucesor' and (
         sucesor.id is null
         or sucesor.predecesor_id is distinct from d.contrato_id
         or sucesor.propiedad_id is distinct from origen.propiedad_id))
       or (e.tipo<>'transferencia_a_sucesor' and e.contrato_sucesor_id is not null))
    or exists (
    select 1 from alq.alq_deposito_liquidacion_linea l
    join alq.alq_deposito_liquidacion dl on dl.id=l.liquidacion_id
    join alq.alq_deposito d on d.id=dl.deposito_id
    where l.moneda is distinct from d.moneda or l.cargo_residual_id is not null) then
    raise exception 'ALQ_ASSERT_F1A_D_GRAFO';
  end if;
  if exists (
    select 1 from alq.alq_aplicacion a
    left join alq.alq_conversion_moneda cv on cv.id=a.conversion_id
    where (a.conversion_id is not null and (
      cv.id is null
      or cv.importe_origen is distinct from a.importe_origen
      or cv.moneda_origen is distinct from a.moneda_origen
      or cv.importe_destino is distinct from a.importe_destino
      or cv.moneda_destino is distinct from a.moneda_destino
      or cv.importe_destino is distinct from alq_private.alq_redondear_v1(
        cv.importe_origen*cv.tasa,cv.regla_redondeo)))) then
    raise exception 'ALQ_ASSERT_F1A_T4_CONVERSION';
  end if;
  if exists (
    select 1 from alq.alq_aplicacion_reversa ar
    join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
    join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
    where rv.estado is distinct from 'confirmada'
       or rv.reversa_de is distinct from a.transaccion_id
       or ar.moneda_origen is distinct from a.moneda_origen
       or ar.moneda_destino is distinct from a.moneda_destino)
    or exists (
    select 1 from alq.alq_aplicacion a
    where (select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where ar.aplicacion_original_id=a.id and rv.estado='confirmada')>a.importe_destino)
    or exists (
    select 1 from alq.alq_transaccion_caja rv
    where rv.reversa_de is not null and (
      rv.estado='confirmada' and (
        select coalesce(sum(ar.importe_origen_revertido),0)
        from alq.alq_aplicacion_reversa ar
        where ar.reversa_transaccion_id=rv.id)>rv.monto)) then
    raise exception 'ALQ_ASSERT_F1A_R_GRAFO';
  end if;
  if exists (select 1 from alq.alq_transaccion_caja o where
    (select coalesce(sum(a.importe_origen),0) from alq.alq_aplicacion a
       where a.transaccion_id=o.id)
    -(select coalesce(sum(ar.importe_origen_revertido),0)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where rv.reversa_de=o.id and rv.estado='confirmada')
    >o.monto-(select coalesce(sum(rv.monto),0) from alq.alq_transaccion_caja rv
      where rv.reversa_de=o.id and rv.estado='confirmada')) then
    raise exception 'ALQ_ASSERT_F1A_R';
  end if;
  return 'ALQ_ASSERT_FINANCIERO_F1A_OK';
end
$fn$;

alter function alq_private.alq_assert_global_v1() rename to alq_assert_global_pre_f1a_v1;
-- La foto heredada contaba reaperturas de reversas pendientes/rechazadas.
-- Se conserva toda su superficie y se corrigen únicamente esos cuatro SUM
-- para usar la misma semántica confirmada que validadores y proyecciones F1-A.
create or replace function alq_private.alq_assert_global_pre_f1a_v1()
returns text language plpgsql stable security definer set search_path=''
as $fn$
begin
  if exists (select 1 from alq.alq_transaccion_caja t where
    (select coalesce(sum(a.importe_origen),0) from alq.alq_aplicacion a
      where a.transaccion_id=t.id)>t.monto)
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
    +coalesce((select sum(ar.importe_destino_reabierto)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where a.cargo_id=c.id and rv.estado='confirmada'),0))
  then raise exception 'ALQ_ASSERT_SALDO_CARGO'; end if;
  if exists (select 1 from alq.alq_credito cr where cr.saldo_pendiente<>
    cr.monto_original-coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc
      where cc.credito_id=cr.id),0)
    -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a
      join alq.alq_transaccion_caja t on t.id=a.transaccion_id
      where a.credito_id=cr.id and t.direccion='salida' and t.estado='confirmada'),0)
    +coalesce((select sum(ar.importe_destino_reabierto)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where a.credito_id=cr.id and rv.estado='confirmada'),0))
  then raise exception 'ALQ_ASSERT_SALDO_CREDITO'; end if;
  if exists (select 1 from alq.alq_transaccion_caja where transferencia_id is not null
    group by transferencia_id having count(*)<>2 or count(distinct direccion)<>2
      or count(distinct monto)<>1 or count(distinct moneda)<>1
      or count(distinct cuenta_custodia_id)<>2)
  then raise exception 'ALQ_ASSERT_I9'; end if;
  if exists (select 1 from alq.alq_rendicion r where r.estado in ('emitida','corregida') and
    (exists (select 1 from alq.alq_rendicion_linea l where l.rendicion_id=r.id and l.moneda<>r.moneda)
     or r.saldo_final<>r.saldo_inicial+coalesce((select sum(l.monto*l.signo)
        from alq.alq_rendicion_linea l where l.rendicion_id=r.id),0)))
  then raise exception 'ALQ_ASSERT_I10'; end if;
  if exists (select 1 from alq.alq_rendicion r where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a where a.rendicion_id=r.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where a.rendicion_id=r.id and rv.estado='confirmada')>greatest(r.saldo_final,0))
  then raise exception 'ALQ_ASSERT_GIROS_RENDICION'; end if;
  if exists (select 1 from alq.alq_deposito_evento de where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a
      where a.deposito_evento_id=de.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      join alq.alq_transaccion_caja rv on rv.id=ar.reversa_transaccion_id
      where a.deposito_evento_id=de.id and rv.estado='confirmada')>de.monto)
  then raise exception 'ALQ_ASSERT_APLICACION_DEPOSITO'; end if;
  if exists (select 1 from alq.alq_servicio_factura f
    join alq.alq_cargo c on c.id=f.cargo_id
    where f.saldada is distinct from (c.saldo_pendiente=0)
      or f.propiedad_id<>c.propiedad_id or f.moneda<>c.moneda or f.monto<>c.monto)
  then raise exception 'ALQ_ASSERT_SERVICIO_PROYECCION'; end if;
  return 'ALQ_ASSERT_GLOBAL_OK';
end
$fn$;
create function alq_private.alq_assert_global_v1()
returns text language plpgsql stable security definer set search_path=''
as $fn$
begin
  perform alq_private.alq_assert_global_pre_f1a_v1();
  perform alq_private.alq_assert_financiero_f1a_v1();
  return 'ALQ_ASSERT_GLOBAL_OK';
end
$fn$;

-- Propiedades de seguridad y privilegios explícitos. No se toca pg_default_acl.
do $alq_f1a_function_acl$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='alq_private' and
      (p.proname like 'alq\_f1a\_%' escape '\' or p.proname in (
        'alq_transaccion_cuenta_snapshot_f1a_v1','alq_operacion_estado_guard_f1a_v2',
        'alq_operacion_aplicada_gate_f1a_v2','alq_evento_consistencia_f1a_v2',
        'alq_hecho_guard_f1a_v2','alq_evento_guard_f1a_v2','alq_hecho_consistencia_f1a_v2',
        'alq_validar_nota_f1a_v1','alq_validar_credito_consumo_f1a_v1',
        'alq_validar_cargo_f1a_v1','alq_validar_deposito_f1a_v1',
        'alq_recalcular_cargo_v1','alq_recalcular_credito_v1',
        'alq_validar_aplicacion_v1','alq_validar_reversa_v1',
        'alq_validar_transferencia_v1','alq_constraint_check_v1',
        'alq_aplicar_operacion_v1','alq_admin_aplicar_core_v1',
        'alq_assert_global_pre_f1a_v1',
        'alq_admin_preparar_core_v2','alq_admin_aplicar_core_v2',
        'alq_admin_cancelar_core_v2','alq_admin_reintentar_core_v2',
        'alq_sanear_preparadas_v2','alq_preparadas_estado_v2',
        'alq_assert_financiero_f1a_v1','alq_assert_global_v1')))
      or (n.nspname='public' and p.proname in ('alq_admin_preparar_v2',
        'alq_admin_aplicar_v2','alq_admin_cancelar_v2','alq_admin_reintentar_v2'))
  loop
    execute format('alter function %s owner to postgres',r.firma);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.firma);
  end loop;
end
$alq_f1a_function_acl$;

grant execute on function alq_private.alq_admin_preparar_core_v2(uuid,text,jsonb) to authenticated;
grant execute on function alq_private.alq_admin_aplicar_core_v2(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function alq_private.alq_admin_cancelar_core_v2(uuid,uuid,text) to authenticated;
grant execute on function alq_private.alq_admin_reintentar_core_v2(uuid,uuid,text) to authenticated;
grant execute on function public.alq_admin_preparar_v2(uuid,text,jsonb) to authenticated;
grant execute on function public.alq_admin_aplicar_v2(uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.alq_admin_cancelar_v2(uuid,uuid,text) to authenticated;
grant execute on function public.alq_admin_reintentar_v2(uuid,uuid,text) to authenticated;
grant execute on function alq_private.alq_admin_aplicar_core_v1(uuid,text,text,jsonb) to authenticated;

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

-- Postcheck dentro de la transacción tool-owned.
do $alq_f1a_post$
declare v_count int;
begin
  if cardinality(alq_private.alq_operaciones_v1())<>45
     or cardinality(alq_private.alq_f1a_operaciones_v2())<>8
     or alq_private.alq_assert_financiero_f1a_v1()<>'ALQ_ASSERT_FINANCIERO_F1A_OK'
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_ASSERT';
  end if;
  select count(*) into v_count from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('alq_admin_preparar_v2','alq_admin_aplicar_v2','alq_admin_cancelar_v2','alq_admin_reintentar_v2')
    and not p.prosecdef and p.proconfig=array['search_path=""']::text[];
  if v_count<>4 then raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_WRAPPERS'; end if;
  if exists (select 1 from alq_private.alq_hecho_idempotente_v2)
     or exists (select 1 from alq_private.alq_operacion_evento_v2)
     or exists (select 1 from alq.alq_operacion where hecho_id is not null) then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_RESIDUO';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
    where schemaname='alq_private' and tablename in
      ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')) then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_RLS_POLICIES';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq_private'
      and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
      and (not c.relrowsecurity or not c.relforcerowsecurity or c.relowner<>to_regrole('postgres')))
    or exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where n.nspname='alq_private'
        and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
        and a.grantee<>c.relowner)
    or exists (
      select 1 from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(a.attacl) x
      where n.nspname='alq_private'
        and c.relname in ('alq_hecho_idempotente_v2','alq_operacion_evento_v2')
        and a.attnum>0 and not a.attisdropped and x.grantee<>c.relowner) then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_RLS_ACL';
  end if;
  if (select count(*) from pg_catalog.pg_constraint
      where conname in ('alq_hecho_idempotente_v2_clave_uq','alq_operacion_hecho_fk',
        'alq_operacion_hecho_intento_uq','alq_operacion_id_hecho_request_uq',
        'alq_operacion_evento_v2_ids_ck','alq_operacion_evento_v2_comando_ck',
        'alq_operacion_evento_v2_intento_fk','alq_transaccion_cuenta_validacion_ck'))<>8
     or (select count(*) from pg_catalog.pg_trigger where not tgisinternal and tgname in (
        'alq_operacion_estado_guard_biud','alq_operacion_aplicada_gate_ct',
        'alq_operacion_hecho_consistencia_ct','alq_hecho_aplicada_consistencia_ct',
        'alq_evento_consistencia_ct','alq_hecho_inmutable_bud','alq_evento_append_only_bud',
        'alq_transaccion_cuenta_snapshot_bi','alq_transaccion_cuenta_tupla_inmutable_bu'))<>9 then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_OBJETOS';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where ((n.nspname='public' and p.proname in ('alq_admin_preparar_v2',
             'alq_admin_aplicar_v2','alq_admin_cancelar_v2','alq_admin_reintentar_v2'))
        or (n.nspname='alq_private' and (p.proname like 'alq\_f1a\_%' escape '\'
             or p.proname like '%\_f1a\_v%' escape '\')))
      and a.grantee<>p.proowner
      and not (a.grantee=to_regrole('authenticated')::oid
               and a.privilege_type='EXECUTE'
               and p.proname in ('alq_admin_preparar_v2','alq_admin_aplicar_v2',
                 'alq_admin_cancelar_v2','alq_admin_reintentar_v2',
                 'alq_admin_preparar_core_v2','alq_admin_aplicar_core_v2',
                 'alq_admin_cancelar_core_v2','alq_admin_reintentar_core_v2'))) then
    raise exception using errcode='P0001',message='ALQ_F1A_POSTCHECK_FUNCION_ACL';
  end if;
end
$alq_f1a_post$;
