-- ALQ F4 · facturas compartidas y ciclo contractual visible
-- Completa las dos operaciones que no pueden quedar escondidas del panel:
-- reparto exacto de una factura y renovación integral del contrato.

begin;

do $$
begin
  if to_regprocedure('public.alq_admin_alta_integral(uuid,jsonb)') is null
     or to_regprocedure('public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)') is null
     or to_regclass('alq.alq_servicio_factura') is null
     or to_regclass('alq.alq_contrato_version') is null then
    raise exception using errcode='P0001',message='ALQ_F4_CICLO_BASE_INCOMPATIBLE';
  end if;
end
$$;

alter table alq.alq_servicio_factura
  add column if not exists distribucion_modo text not null default 'unico';

do $$
begin
  if not exists(select 1 from pg_catalog.pg_constraint
    where conrelid='alq.alq_servicio_factura'::regclass
      and conname='alq_servicio_factura_distribucion_modo_ck') then
    alter table alq.alq_servicio_factura add constraint
      alq_servicio_factura_distribucion_modo_ck
      check(distribucion_modo in ('unico','partes_iguales','porcentaje','monto_fijo'));
  end if;
end
$$;

-- El mismo comprobante no puede originar dos facturas de la misma cuenta.
create unique index if not exists alq_servicio_factura_documento_cuenta_uq
  on alq.alq_servicio_factura(cuenta_id,comprobante_documento_id)
  where comprobante_documento_id is not null;

create table if not exists alq.alq_servicio_factura_reparto (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  factura_id uuid not null references alq.alq_servicio_factura(id) on delete restrict,
  propiedad_id uuid not null references alq.alq_propiedad(id) on delete restrict,
  contrato_id uuid not null references alq.alq_contrato(id) on delete restrict,
  deudor_parte_id uuid not null references alq.alq_parte(id) on delete restrict,
  acreedor_parte_id uuid not null references alq.alq_parte(id) on delete restrict,
  modo text not null check(modo in ('partes_iguales','porcentaje','monto_fijo')),
  valor_configurado numeric(20,6) not null check(valor_configurado>0),
  porcentaje numeric(20,8) not null check(porcentaje>0 and porcentaje<=100),
  monto numeric(20,6) not null check(monto>0),
  moneda text not null check(moneda~'^[A-Z]{3}$'),
  cargo_id uuid not null unique references alq.alq_cargo(id) on delete restrict,
  operacion_id uuid not null references alq.alq_operacion(id) on delete restrict,
  creado_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(factura_id,contrato_id)
);

alter table alq.alq_servicio_factura_reparto enable row level security;
alter table alq.alq_servicio_factura_reparto force row level security;
drop policy if exists alq_admin_select_alq_servicio_factura_reparto
  on alq.alq_servicio_factura_reparto;
create policy alq_admin_select_alq_servicio_factura_reparto
  on alq.alq_servicio_factura_reparto for select to authenticated
  using (alq_private.alq_es_admin_v1());
revoke all on alq.alq_servicio_factura_reparto from public,anon,authenticated,service_role;
grant select on alq.alq_servicio_factura_reparto to authenticated;

create or replace view public.alq_v_servicio_factura_reparto
with (security_invoker='true') as
select id,factura_id,propiedad_id,contrato_id,deudor_parte_id,acreedor_parte_id,
  modo,valor_configurado,porcentaje,monto,moneda,cargo_id,operacion_id,creado_at
from alq.alq_servicio_factura_reparto;
revoke all on public.alq_v_servicio_factura_reparto from public,anon,authenticated,service_role;
grant select on public.alq_v_servicio_factura_reparto to authenticated;

drop trigger if exists alq_f1a_operacion_hijo_alq_servicio_factura_reparto_biu
  on alq.alq_servicio_factura_reparto;
create trigger alq_f1a_operacion_hijo_alq_servicio_factura_reparto_biu
before insert or update or delete on alq.alq_servicio_factura_reparto
for each row execute function alq_private.alq_f1a_operacion_hijo_guard_v1();

-- servicio_factura_registrar puede crear los cargos que corresponden al
-- reparto. Ninguna otra operación recibe este permiso.
create or replace function alq_private.alq_f1a_tabla_permitida_operacion_v1(
  p_operacion text,p_tabla text
)
returns boolean
language sql
immutable
security definer
set search_path=''
as $$
  select case p_tabla
    when 'alq_nota' then p_operacion='nota_emitir'
    when 'alq_credito_consumo' then p_operacion=any(array['credito_consumir','mes_normal_generar']::text[])
    when 'alq_transaccion_caja' then p_operacion=any(array[
      'transaccion_registrar','giro_registrar','transferencia_interna','reversa_con_reapertura',
      'pago_multimoneda','credito_devolver','deposito_liquidar_y_devolver',
      'giro_a_propietario','pago_comprobante_confirmar']::text[])
    when 'alq_aplicacion' then p_operacion=any(array[
      'aplicacion_asignar','giro_registrar','pago_multimoneda','credito_devolver',
      'giro_a_propietario','pago_comprobante_confirmar']::text[])
    when 'alq_deposito_evento' then p_operacion=any(array[
      'deposito_evento_registrar','deposito_liquidar_y_devolver','deposito_registrar',
      'contrato_cerrar_deposito','alta_integral']::text[])
    when 'alq_deposito_liquidacion' then p_operacion=any(array[
      'deposito_liquidar','deposito_liquidar_y_devolver','contrato_cerrar_deposito']::text[])
    when 'alq_aplicacion_reversa' then p_operacion='reversa_con_reapertura'
    when 'alq_cargo' then p_operacion=any(array[
      'cargo_manual_emitir','mes_normal_generar','mora_resolver','servicio_factura_registrar']::text[])
    when 'alq_mora_propuesta' then p_operacion=any(array['mora_proponer','mora_resolver']::text[])
    when 'alq_contrato_version' then p_operacion=any(array[
      'ajuste_contractual_aplicar','alta_integral','contrato_renovar']::text[])
    when 'alq_ajuste' then p_operacion='ajuste_contractual_aplicar'
    when 'alq_indice_observacion' then p_operacion='indice_observacion_importar'
    when 'alq_deposito' then p_operacion=any(array['deposito_registrar','alta_integral']::text[])
    when 'alq_contrato' then p_operacion=any(array[
      'contrato_cerrar_deposito','alta_integral','contrato_renovar']::text[])
    when 'alq_conversion_moneda' then p_operacion=any(array['conversion_registrar','pago_multimoneda']::text[])
    when 'alq_rendicion' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    when 'alq_credito' then p_operacion='pago_comprobante_confirmar'
    when 'alq_deposito_liquidacion_linea' then p_operacion='deposito_liquidar_y_devolver'
    when 'alq_rendicion_linea' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    when 'alq_servicio_factura_reparto' then p_operacion='servicio_factura_registrar'
    else false end
$$;
revoke all on function alq_private.alq_f1a_tabla_permitida_operacion_v1(text,text)
  from public,anon,authenticated,service_role;

create or replace function alq_private.alq_f4_factura_reparto_previsualizar_v1(
  p_cuenta_id uuid,p_contrato_ids uuid[],p_modo text,p_valores numeric[],
  p_total numeric,p_moneda text,p_vence date,p_acreedor_tipo text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_cuenta alq.alq_servicio_cuenta%rowtype;
  v_n integer:=coalesce(pg_catalog.cardinality(p_contrato_ids),0);
  v_i integer;
  v_ct alq.alq_contrato%rowtype;
  v_propietario uuid;
  v_admin uuid;
  v_acreedor uuid;
  v_monto numeric;
  v_pct numeric;
  v_acumulado numeric:=0;
  v_lineas jsonb:='[]'::jsonb;
  v_base jsonb;
  v_sha text;
begin
  perform alq_private.alq_actor_v1(true);
  if p_cuenta_id is null or v_n<1 or v_n>100 or p_modo not in
       ('partes_iguales','porcentaje','monto_fijo')
     or p_total is null or p_total<=0 or p_moneda!~'^[A-Z]{3}$'
     or p_vence is null or p_acreedor_tipo not in ('propietario','administracion')
     or (select count(distinct x) from pg_catalog.unnest(p_contrato_ids) x)<>v_n
     or (p_modo<>'partes_iguales' and pg_catalog.cardinality(p_valores)<>v_n) then
    raise exception using errcode='P0001',message='ALQ_F4_REPARTO_PARAMETROS_INVALIDOS';
  end if;
  select * into v_cuenta from alq.alq_servicio_cuenta
  where id=p_cuenta_id and activa;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F4_REPARTO_CUENTA_NO_EXISTE';
  end if;
  if p_acreedor_tipo='administracion' then
    select pu.parte_id into v_admin from alq.alq_parte_usuario pu
    where pu.id=alq_private.alq_actor_v1(true);
    if v_admin is null then
      raise exception using errcode='P0001',message='ALQ_F4_REPARTO_ADMIN_SIN_PARTE';
    end if;
  end if;
  if p_modo='porcentaje' and abs((select sum(x) from pg_catalog.unnest(p_valores) x)-100)>0.000001 then
    raise exception using errcode='P0001',message='ALQ_F4_REPARTO_PORCENTAJE_NO_CIERRA';
  elsif p_modo='monto_fijo' and abs((select sum(x) from pg_catalog.unnest(p_valores) x)-p_total)>0.000001 then
    raise exception using errcode='P0001',message='ALQ_F4_REPARTO_MONTO_NO_CIERRA';
  end if;
  for v_i in 1..v_n loop
    select * into v_ct from alq.alq_contrato where id=p_contrato_ids[v_i];
    if not found or v_ct.estado not in ('vigente','continuacion_legal')
       or p_vence<v_ct.inicio
       or p_vence>coalesce(v_ct.fin_efectivo,v_ct.fin_pactado,'infinity'::date) then
      raise exception using errcode='P0001',message='ALQ_F4_REPARTO_CONTRATO_NO_VIGENTE';
    end if;
    select t.parte_id into v_propietario from alq.alq_titularidad t
    where t.propiedad_id=v_ct.propiedad_id and p_vence::timestamptz<@t.vigencia
    order by lower(t.vigencia) desc,t.id desc limit 1;
    if v_propietario is null then
      raise exception using errcode='P0001',message='ALQ_F4_REPARTO_SIN_PROPIETARIO';
    end if;
    v_acreedor:=case when p_acreedor_tipo='administracion' then v_admin else v_propietario end;
    if v_ct.inquilino_parte_id=v_acreedor then
      raise exception using errcode='P0001',message='ALQ_F4_REPARTO_PARTES_IGUALES_INVALIDAS';
    end if;
    if p_modo='partes_iguales' then
      v_pct:=100::numeric/v_n;
      v_monto:=case when v_i=v_n then p_total-v_acumulado else round(p_total/v_n,2) end;
    elsif p_modo='porcentaje' then
      if p_valores[v_i] is null or p_valores[v_i]<=0 then
        raise exception using errcode='P0001',message='ALQ_F4_REPARTO_VALOR_INVALIDO';
      end if;
      v_pct:=p_valores[v_i];
      v_monto:=case when v_i=v_n then p_total-v_acumulado
        else round(p_total*v_pct/100,2) end;
    else
      if p_valores[v_i] is null or p_valores[v_i]<=0 then
        raise exception using errcode='P0001',message='ALQ_F4_REPARTO_VALOR_INVALIDO';
      end if;
      v_monto:=p_valores[v_i];
      v_pct:=v_monto*100/p_total;
    end if;
    if v_monto<=0 then
      raise exception using errcode='P0001',message='ALQ_F4_REPARTO_RESULTADO_INVALIDO';
    end if;
    v_acumulado:=v_acumulado+v_monto;
    v_lineas:=v_lineas||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'ordinal',v_i,'contrato_id',v_ct.id,'propiedad_id',v_ct.propiedad_id,
      'deudor_parte_id',v_ct.inquilino_parte_id,'acreedor_parte_id',v_acreedor,
      'valor_configurado',case when p_modo='partes_iguales' then 1 else p_valores[v_i] end,
      'porcentaje',v_pct,'monto',v_monto,'moneda',p_moneda));
  end loop;
  if v_acumulado<>p_total then
    raise exception using errcode='P0001',message='ALQ_F4_REPARTO_TOTAL_DERIVADO';
  end if;
  v_base:=pg_catalog.jsonb_build_object(
    'cuenta_id',v_cuenta.id,'modo',p_modo,'total',p_total,'moneda',p_moneda,
    'vence',p_vence,'acreedor_tipo',p_acreedor_tipo,'lineas',v_lineas);
  v_sha:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_base::text,'UTF8'),'sha256'),'hex');
  return v_base||pg_catalog.jsonb_build_object('estado','listo','preview_sha256',v_sha);
end
$$;

revoke all on function alq_private.alq_f4_factura_reparto_previsualizar_v1(
  uuid,uuid[],text,numeric[],numeric,text,date,text) from public,anon,authenticated,service_role;

create or replace function public.alq_admin_factura_reparto_previsualizar(
  p_cuenta_id uuid,p_contrato_ids uuid[],p_modo text,p_valores numeric[],
  p_total numeric,p_moneda text,p_vence date,p_acreedor_tipo text
)
returns jsonb language sql stable security definer set search_path='' as $$
  select alq_private.alq_f4_factura_reparto_previsualizar_v1(
    p_cuenta_id,p_contrato_ids,p_modo,p_valores,p_total,p_moneda,p_vence,p_acreedor_tipo)
$$;
revoke all on function public.alq_admin_factura_reparto_previsualizar(
  uuid,uuid[],text,numeric[],numeric,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_factura_reparto_previsualizar(
  uuid,uuid[],text,numeric[],numeric,text,date,text) to authenticated;

create or replace function alq_private.alq_f4_factura_repartida_registrar_v1(
  p_request_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_firma text;
  v_op alq.alq_operacion%rowtype;
  v_preview jsonb;
  v_factura uuid;
  v_linea jsonb;
  v_cargo uuid;
  v_documento uuid:=nullif(p_payload->>'comprobante_documento_id','')::uuid;
  v_contratos uuid[];
  v_valores numeric[];
  v_result jsonb;
begin
  if p_request_id is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k where k not in
       ('schema_version','cuenta_id','desde','hasta','moneda','monto','vence_at',
        'comprobante_documento_id','modo','contrato_ids','valores','acreedor_tipo','preview_sha256'))
     or coalesce((p_payload->>'schema_version')::integer,0)<>1
     or pg_catalog.jsonb_typeof(p_payload->'contrato_ids')<>'array'
     or pg_catalog.jsonb_typeof(coalesce(p_payload->'valores','[]'::jsonb))<>'array'
     or nullif(p_payload->>'desde','')::date is null
     or nullif(p_payload->>'hasta','')::date<=nullif(p_payload->>'desde','')::date
     or v_documento is null or p_payload->>'preview_sha256'!~'^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_PAYLOAD_INVALIDO';
  end if;
  select pg_catalog.array_agg((x#>>'{}')::uuid order by n) into v_contratos
  from pg_catalog.jsonb_array_elements(p_payload->'contrato_ids') with ordinality q(x,n);
  select coalesce(pg_catalog.array_agg((x#>>'{}')::numeric order by n),array[]::numeric[])
    into v_valores
  from pg_catalog.jsonb_array_elements(coalesce(p_payload->'valores','[]'::jsonb)) with ordinality q(x,n);
  v_preview:=alq_private.alq_f4_factura_reparto_previsualizar_v1(
    nullif(p_payload->>'cuenta_id','')::uuid,v_contratos,p_payload->>'modo',v_valores,
    (p_payload->>'monto')::numeric,p_payload->>'moneda',
    nullif(p_payload->>'vence_at','')::date,p_payload->>'acreedor_tipo');
  if v_preview->>'preview_sha256'<>p_payload->>'preview_sha256' then
    raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_PREVIEW_DERIVADA';
  end if;
  if not exists(select 1 from alq.alq_documento d
    join alq.alq_servicio_cuenta s on s.id=(p_payload->>'cuenta_id')::uuid
    where d.id=v_documento and d.propiedad_id=s.propiedad_id
      and d.tipo='factura_servicio') then
    raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_DOCUMENTO_NO_EXISTE';
  end if;

  v_actor:=alq_private.alq_actor_v1(true);
  v_firma:=alq_private.alq_firma_v1('servicio_factura_registrar',p_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_op from alq.alq_operacion where request_id=p_request_id for update;
  if found then
    if v_op.operacion<>'servicio_factura_registrar' or v_op.actor_parte_usuario_id<>v_actor
       or v_op.payload_normalizado<>p_payload or v_op.firma_sha256<>v_firma then
      raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_REQUEST_CONFLICTO';
    end if;
    if v_op.estado='aplicada' then return v_op.resultado||pg_catalog.jsonb_build_object('replay',true); end if;
    raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_REQUEST_NO_TERMINAL';
  end if;
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at,expires_at)
  values(p_request_id,'servicio_factura_registrar',p_payload,v_firma,'preparada',v_actor,
    pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()+interval '5 minutes')
  returning * into v_op;
  perform alq_private.alq_f1a_writer_context_v1('enter',v_op.id);
  insert into alq.alq_servicio_factura(cuenta_id,propiedad_id,periodo,moneda,monto,
    vence_at,comprobante_documento_id,cargo_id,saldada,operacion_id,distribucion_modo)
  select s.id,s.propiedad_id,pg_catalog.daterange((p_payload->>'desde')::date,
    (p_payload->>'hasta')::date,'[)'),p_payload->>'moneda',(p_payload->>'monto')::numeric,
    (p_payload->>'vence_at')::date::timestamptz,v_documento,null,false,v_op.id,p_payload->>'modo'
  from alq.alq_servicio_cuenta s where s.id=(p_payload->>'cuenta_id')::uuid and s.activa
  returning id into v_factura;
  if v_factura is null then
    raise exception using errcode='P0001',message='ALQ_F4_FACTURA_REPARTIDA_CUENTA_NO_EXISTE';
  end if;
  for v_linea in select value from pg_catalog.jsonb_array_elements(v_preview->'lineas') loop
    insert into alq.alq_cargo(propiedad_id,contrato_id,deudor_parte_id,acreedor_parte_id,
      ambito,concepto,moneda,monto,vence_at,origen,operacion_id,snapshot_regla,saldo_pendiente)
    values((v_linea->>'propiedad_id')::uuid,(v_linea->>'contrato_id')::uuid,
      (v_linea->>'deudor_parte_id')::uuid,(v_linea->>'acreedor_parte_id')::uuid,
      case when p_payload->>'acreedor_tipo'='administracion' then 'custodiada' else 'externa' end,
      'servicio',v_linea->>'moneda',(v_linea->>'monto')::numeric,
      (p_payload->>'vence_at')::date::timestamptz,'motor',v_op.id,
      pg_catalog.jsonb_build_object('version',1,'origen','factura_compartida',
        'factura_id',v_factura,'cuenta_id',p_payload->>'cuenta_id','modo',p_payload->>'modo',
        'porcentaje',(v_linea->>'porcentaje')::numeric,'preview_sha256',p_payload->>'preview_sha256'),
      (v_linea->>'monto')::numeric) returning id into v_cargo;
    insert into alq.alq_servicio_factura_reparto(factura_id,propiedad_id,contrato_id,
      deudor_parte_id,acreedor_parte_id,modo,valor_configurado,porcentaje,monto,
      moneda,cargo_id,operacion_id)
    values(v_factura,(v_linea->>'propiedad_id')::uuid,(v_linea->>'contrato_id')::uuid,
      (v_linea->>'deudor_parte_id')::uuid,(v_linea->>'acreedor_parte_id')::uuid,
      p_payload->>'modo',(v_linea->>'valor_configurado')::numeric,
      (v_linea->>'porcentaje')::numeric,(v_linea->>'monto')::numeric,
      v_linea->>'moneda',v_cargo,v_op.id);
  end loop;
  v_result:=pg_catalog.jsonb_build_object('operacion','servicio_factura_registrar',
    'request_id',p_request_id,'factura_id',v_factura,'modo',p_payload->>'modo',
    'monto',(p_payload->>'monto')::numeric,'moneda',p_payload->>'moneda',
    'cantidad_cargos',pg_catalog.jsonb_array_length(v_preview->'lineas'),
    'preview_sha256',p_payload->>'preview_sha256','replay',false);
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values(v_op.id,'operacion',v_op.id,'servicio_factura_registrar',v_result,v_actor);
  perform alq_private.alq_f1a_writer_context_v1('exit',v_op.id);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,
    aplicada_at=pg_catalog.clock_timestamp() where id=v_op.id;
  return v_result;
end
$$;

revoke all on function alq_private.alq_f4_factura_repartida_registrar_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
create or replace function public.alq_admin_factura_repartida_registrar(
  p_request_id uuid,p_payload jsonb
)
returns jsonb language sql volatile security definer set search_path='' as $$
  select alq_private.alq_f4_factura_repartida_registrar_v1(p_request_id,p_payload)
$$;
revoke all on function public.alq_admin_factura_repartida_registrar(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_factura_repartida_registrar(uuid,jsonb)
  to authenticated;

-- Renovación: conserva la relación con el contrato anterior, permite redefinir
-- todas las condiciones económicas y actualiza el mandato sólo si el operador
-- lo confirma en el mismo acto.
create or replace function alq_private.alq_f4_contrato_renovar_integral_v1(
  p_request_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_firma text;
  v_op alq.alq_operacion%rowtype;
  v_old alq.alq_contrato%rowtype;
  v_old_cv alq.alq_contrato_version%rowtype;
  v_m alq.alq_mandato%rowtype;
  v_mv alq.alq_mandato_version%rowtype;
  v_t alq.alq_titularidad%rowtype;
  v_con jsonb:=coalesce(p_payload->'contrato','{}'::jsonb);
  v_man jsonb:=coalesce(p_payload->'mandato','{}'::jsonb);
  v_inicio date;
  v_fin date;
  v_indice uuid;
  v_pct numeric;
  v_frec integer;
  v_pun numeric;
  v_gracia integer;
  v_new uuid;
  v_new_cv uuid;
  v_new_mv uuid;
  v_garantia uuid;
  v_result jsonb;
begin
  if p_request_id is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k where k not in
       ('schema_version','predecesor_id','contrato','mandato','pdf_documento_id','copiar_garantia'))
     or coalesce((p_payload->>'schema_version')::integer,0)<>1
     or pg_catalog.jsonb_typeof(v_con)<>'object' or pg_catalog.jsonb_typeof(v_man)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(v_con) k where k not in
       ('inicio','fin_pactado','monto','moneda','dia_pago_desde','dia_pago_hasta',
        'ajuste_tipo','pct_fijo','frecuencia_ajuste_meses','indice_organismo','indice_codigo',
        'indice_base','indice_version','indice_granularidad','punitorio_pct_dia',
        'punitorio_desde_dia','formula_punitorio_version','metodo_prorrateo','regla_redondeo',
        'regla_pago_otra_moneda','fuente_conversion','fallback_indice'))
     or exists(select 1 from pg_catalog.jsonb_object_keys(v_man) k where k not in
       ('honorario_base','honorario_pct','honorario_minimo','honorario_fijo',
        'incluye_punitorios','moneda','tratamiento_impuestos','extender_hasta')) then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_PAYLOAD_INVALIDO';
  end if;
  v_inicio:=nullif(v_con->>'inicio','')::date;
  v_fin:=nullif(v_con->>'fin_pactado','')::date;
  if v_inicio is null or v_fin is null or v_fin<v_inicio
     or nullif(v_con->>'monto','')::numeric<=0
     or (v_con->>'dia_pago_desde')::integer<1
     or (v_con->>'dia_pago_hasta')::integer<(v_con->>'dia_pago_desde')::integer
     or (v_con->>'dia_pago_hasta')::integer>31
     or v_con->>'moneda'!~'^[A-Z]{3}$'
     or v_man->>'honorario_base'<>'devengado'
     or v_man->>'moneda'<>v_con->>'moneda'
     or ((v_man->>'honorario_pct')::numeric=0 and (v_man->>'honorario_minimo')::numeric=0
       and (v_man->>'honorario_fijo')::numeric=0) then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_CONDICIONES_INVALIDAS';
  end if;
  select * into v_old from alq.alq_contrato
  where id=nullif(p_payload->>'predecesor_id','')::uuid for update;
  if not found or v_old.estado not in ('vigente','continuacion_legal')
     or v_inicio<=v_old.inicio then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_PREDECESOR_INVALIDO';
  end if;
  if nullif(p_payload->>'pdf_documento_id','') is not null
     and not exists(select 1 from alq.alq_documento d
       where d.id=(p_payload->>'pdf_documento_id')::uuid
         and d.propiedad_id=v_old.propiedad_id and d.tipo='contrato') then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_DOCUMENTO_INVALIDO';
  end if;
  if exists(select 1 from alq.alq_contrato where predecesor_id=v_old.id) then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_YA_EXISTE';
  end if;
  select * into v_old_cv from alq.alq_contrato_version
  where contrato_id=v_old.id order by lower(vigencia) desc,id desc limit 1 for update;
  select m.* into v_m from alq.alq_mandato m
  where m.propiedad_id=v_old.propiedad_id and m.estado='activo'
  order by lower(m.vigencia) desc,m.id desc limit 1 for update;
  select * into v_mv from alq.alq_mandato_version where mandato_id=v_m.id
  order by lower(vigencia) desc,id desc limit 1 for update;
  select * into v_t from alq.alq_titularidad where id=v_m.titularidad_id for update;
  if v_m.id is null or v_mv.id is null or v_t.id is null
     or nullif(v_man->>'extender_hasta','')::date is distinct from v_fin then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_MANDATO_NO_CONFIRMADO';
  end if;
  if exists(select 1 from alq.alq_mes_generado where contrato_id=v_old.id and mes>=pg_catalog.date_trunc('month',v_inicio)::date) then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_MES_POSTERIOR_EXISTE';
  end if;
  v_frec:=nullif(v_con->>'frecuencia_ajuste_meses','')::integer;
  if v_con->>'ajuste_tipo'='porcentaje_fijo' then
    v_pct:=nullif(v_con->>'pct_fijo','')::numeric;
    if v_pct is null or v_pct<=0 or v_frec is null or v_frec<=0 then
      raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_AJUSTE_FIJO_INVALIDO';
    end if;
  elsif v_con->>'ajuste_tipo'='indice' then
    if v_frec is null or v_frec<=0 or nullif(v_con->>'indice_organismo','') is null
       or nullif(v_con->>'indice_codigo','') is null
       or coalesce(nullif(v_con->>'indice_granularidad',''),'mensual') not in ('diaria','mensual') then
      raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_AJUSTE_INDICE_INVALIDO';
    end if;
    insert into alq.alq_indice_serie(organismo,codigo,granularidad,base,version)
    values(pg_catalog.btrim(v_con->>'indice_organismo'),pg_catalog.btrim(v_con->>'indice_codigo'),
      coalesce(nullif(v_con->>'indice_granularidad',''),'mensual'),
      coalesce(nullif(pg_catalog.btrim(v_con->>'indice_base'),''),'general'),
      coalesce(nullif(pg_catalog.btrim(v_con->>'indice_version'),''),'vigente'))
    on conflict(organismo,codigo,base,version) do update set codigo=excluded.codigo
    returning id into v_indice;
  elsif v_con->>'ajuste_tipo'<>'sin_ajuste' then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_AJUSTE_TIPO_INVALIDO';
  end if;
  v_pun:=coalesce(nullif(v_con->>'punitorio_pct_dia','')::numeric,0);
  v_gracia:=coalesce(nullif(v_con->>'punitorio_desde_dia','')::integer,0);
  if v_pun<0 or v_pun>1 or v_gracia<0 or v_gracia>31
     or (v_pun=0 and (v_gracia<>0 or v_con->>'formula_punitorio_version'<>'sin_mora_automatica'))
     or (v_pun>0 and v_con->>'formula_punitorio_version'<>'simple_diaria_v1')
     or coalesce(v_con->>'metodo_prorrateo','') not in ('dias_reales','base_30','importe_pactado')
     or coalesce(v_con->>'regla_redondeo','') not in ('centavos','entero')
     or coalesce(v_con->>'regla_pago_otra_moneda','') not in ('prohibido','tasa_pactada')
     or (v_con->>'regla_pago_otra_moneda'='tasa_pactada' and nullif(v_con->>'fuente_conversion','') is null) then
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_REGLAS_INVALIDAS';
  end if;

  v_actor:=alq_private.alq_actor_v1(true);
  v_firma:=alq_private.alq_firma_v1('contrato_renovar',p_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_op from alq.alq_operacion where request_id=p_request_id for update;
  if found then
    if v_op.operacion<>'contrato_renovar' or v_op.actor_parte_usuario_id<>v_actor
       or v_op.payload_normalizado<>p_payload or v_op.firma_sha256<>v_firma then
      raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_REQUEST_CONFLICTO';
    end if;
    if v_op.estado='aplicada' then return v_op.resultado||pg_catalog.jsonb_build_object('replay',true); end if;
    raise exception using errcode='P0001',message='ALQ_F4_RENOVACION_REQUEST_NO_TERMINAL';
  end if;
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at,expires_at)
  values(p_request_id,'contrato_renovar',p_payload,v_firma,'preparada',v_actor,
    pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()+interval '5 minutes')
  returning * into v_op;
  perform alq_private.alq_f1a_writer_context_v1('enter',v_op.id);
  -- fin_efectivo es una fecha inclusiva en el cálculo mensual: el contrato
  -- anterior termina el día previo y nunca se solapa con el renovado.
  update alq.alq_contrato set estado='cerrado',fin_efectivo=v_inicio-1,
    actualizado_at=pg_catalog.clock_timestamp() where id=v_old.id;
  update alq.alq_titularidad set vigencia=pg_catalog.tstzrange(lower(v_t.vigencia),(v_fin+1)::timestamptz,'[)')
    where id=v_t.id;
  update alq.alq_mandato set vigencia=pg_catalog.tstzrange(lower(v_m.vigencia),(v_fin+1)::timestamptz,'[)'),
    actualizada_at=pg_catalog.clock_timestamp() where id=v_m.id;
  update alq.alq_mandato_version set vigencia=pg_catalog.tstzrange(lower(v_mv.vigencia),v_inicio::timestamptz,'[)')
    where id=v_mv.id;
  insert into alq.alq_mandato_version(mandato_id,vigencia,honorario_base,honorario_pct,
    honorario_minimo,honorario_fijo,incluye_punitorios,moneda,tratamiento_impuestos)
  values(v_m.id,pg_catalog.tstzrange(v_inicio::timestamptz,(v_fin+1)::timestamptz,'[)'),
    'devengado',(v_man->>'honorario_pct')::numeric,(v_man->>'honorario_minimo')::numeric,
    (v_man->>'honorario_fijo')::numeric,coalesce((v_man->>'incluye_punitorios')::boolean,false),
    v_man->>'moneda',coalesce(v_man->'tratamiento_impuestos','{}'::jsonb))
  returning id into v_new_mv;
  insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,predecesor_id,inicio,
    fin_pactado,estado,pdf_documento_id)
  values(v_old.propiedad_id,v_old.inquilino_parte_id,v_old.id,v_inicio,v_fin,'vigente',
    nullif(p_payload->>'pdf_documento_id','')::uuid) returning id into v_new;
  insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,dia_pago_desde,
    dia_pago_hasta,indice_serie_id,pct_fijo,frecuencia_ajuste,punitorio_pct_dia,
    punitorio_desde_dia,formula_punitorio_version,metodo_prorrateo,regla_redondeo,
    regla_pago_otra_moneda,fuente_conversion,fallback_indice)
  values(v_new,pg_catalog.tstzrange(v_inicio::timestamptz,(v_fin+1)::timestamptz,'[)'),
    (v_con->>'monto')::numeric,v_con->>'moneda',(v_con->>'dia_pago_desde')::smallint,
    (v_con->>'dia_pago_hasta')::smallint,v_indice,v_pct,
    case when v_frec is null then null else pg_catalog.make_interval(months=>v_frec) end,
    v_pun,v_gracia,v_con->>'formula_punitorio_version',v_con->>'metodo_prorrateo',
    v_con->>'regla_redondeo',v_con->>'regla_pago_otra_moneda',
    nullif(v_con->>'fuente_conversion',''),coalesce(v_con->'fallback_indice','{}'::jsonb))
  returning id into v_new_cv;
  if coalesce((p_payload->>'copiar_garantia')::boolean,false) then
    insert into alq.alq_garantia(contrato_id,garante_parte_id,tipo,poliza,emisor,cobertura,
      moneda,vigencia,documento_id,regla_notificacion_mora)
    select v_new,g.garante_parte_id,g.tipo,g.poliza,g.emisor,g.cobertura,g.moneda,
      pg_catalog.tstzrange(v_inicio::timestamptz,(v_fin+1)::timestamptz,'[)'),
      g.documento_id,g.regla_notificacion_mora from alq.alq_garantia g
    where g.contrato_id=v_old.id order by lower(g.vigencia) desc,g.id desc limit 1
    returning id into v_garantia;
  end if;
  v_result:=pg_catalog.jsonb_build_object('operacion','contrato_renovar',
    'request_id',p_request_id,'predecesor_id',v_old.id,'contrato_id',v_new,
    'contrato_version_id',v_new_cv,'mandato_version_id',v_new_mv,
    'garantia_id',v_garantia,'inicio',v_inicio,'fin_pactado',v_fin,'replay',false);
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values(v_op.id,'operacion',v_op.id,'contrato_renovar',v_result,v_actor);
  perform alq_private.alq_f1a_writer_context_v1('exit',v_op.id);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,
    aplicada_at=pg_catalog.clock_timestamp() where id=v_op.id;
  return v_result;
end
$$;

revoke all on function alq_private.alq_f4_contrato_renovar_integral_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
create or replace function public.alq_admin_contrato_renovar_integral(
  p_request_id uuid,p_payload jsonb
)
returns jsonb language sql volatile security definer set search_path='' as $$
  select alq_private.alq_f4_contrato_renovar_integral_v1(p_request_id,p_payload)
$$;
revoke all on function public.alq_admin_contrato_renovar_integral(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_contrato_renovar_integral(uuid,jsonb)
  to authenticated;

do $$
begin
  if to_regclass('alq.alq_servicio_factura_reparto') is null
     or to_regprocedure('public.alq_admin_factura_reparto_previsualizar(uuid,uuid[],text,numeric[],numeric,text,date,text)') is null
     or to_regprocedure('public.alq_admin_factura_repartida_registrar(uuid,jsonb)') is null
     or to_regprocedure('public.alq_admin_contrato_renovar_integral(uuid,jsonb)') is null
     or has_function_privilege('anon','public.alq_admin_factura_repartida_registrar(uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_contrato_renovar_integral(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_factura_repartida_registrar(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_contrato_renovar_integral(uuid,jsonb)','EXECUTE') then
    raise exception using errcode='P0001',message='ALQ_F4_CICLO_POSTCHECK_FALLO';
  end if;
end
$$;

commit;
