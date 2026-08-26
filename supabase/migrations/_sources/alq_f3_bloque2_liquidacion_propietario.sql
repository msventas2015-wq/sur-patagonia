-- ALQ F3 · Bloque 2 · liquidación mensual del propietario.
-- El borrador se deriva de hechos económicos existentes. La emisión sella un
-- snapshot inmutable; el envío por email se registra como un intento separado.
-- No contiene BEGIN/COMMIT: la herramienta de migraciones posee la transacción.

do $alq_f3_b2_guard$
begin
  if pg_catalog.to_regclass('alq.alq_mes_generado') is null
     or pg_catalog.to_regclass('alq.alq_pago_confirmado') is null then
    raise exception using errcode='P0001',message='ALQ_F3_B2_REQUIERE_BLOQUE1';
  end if;
  if pg_catalog.to_regclass('alq.alq_liquidacion_propietario') is not null
     or 'liquidacion_propietario_emitir'=any(alq_private.alq_operaciones_v1()) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_YA_INSTALADO';
  end if;
end
$alq_f3_b2_guard$;

create table alq.alq_liquidacion_propietario (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  propiedad_id uuid not null references alq.alq_propiedad(id) on delete restrict,
  propietario_parte_id uuid not null references alq.alq_parte(id) on delete restrict,
  mandato_version_id uuid not null references alq.alq_mandato_version(id) on delete restrict,
  periodo date not null,
  moneda text not null check(moneda~'^[A-Z]{3}$'),
  version_documento integer not null check(version_documento>0),
  estado text not null check(estado in ('emitida','corregida')),
  saldo_apertura_admin numeric(20,6) not null,
  saldo_cierre_admin numeric(20,6) not null,
  contenido jsonb not null,
  contenido_sha256 text not null check(contenido_sha256~'^[0-9a-f]{64}$'),
  sucesora_de uuid references alq.alq_liquidacion_propietario(id) on delete restrict,
  emitida_por_parte_usuario_id uuid not null references alq.alq_parte_usuario(id) on delete restrict,
  emitida_at timestamptz not null default pg_catalog.clock_timestamp(),
  operacion_id uuid not null unique references alq.alq_operacion(id) on delete restrict,
  constraint alq_liquidacion_propietario_mes_ck
    check(periodo=pg_catalog.date_trunc('month',periodo)::date),
  constraint alq_liquidacion_propietario_estado_ck check(
    (sucesora_de is null and estado='emitida' and version_documento=1)
    or (sucesora_de is not null and estado='corregida' and version_documento>1)),
  constraint alq_liquidacion_propietario_contenido_ck check(
    contenido->>'schema'='alq_f3_b2_liquidacion_v1'
    and contenido->>'tipo'='liquidacion_propietario'
    and contenido->>'marca'='Sur Patagonian Real Estate')
);
create unique index alq_liquidacion_propietario_raiz_uq
on alq.alq_liquidacion_propietario(propiedad_id,periodo,moneda)
where sucesora_de is null;
create unique index alq_liquidacion_propietario_sucesora_uq
on alq.alq_liquidacion_propietario(sucesora_de)
where sucesora_de is not null;
alter table alq.alq_liquidacion_propietario enable row level security;
alter table alq.alq_liquidacion_propietario force row level security;

create table alq.alq_liquidacion_envio (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  liquidacion_id uuid not null references alq.alq_liquidacion_propietario(id) on delete restrict,
  intento_n integer not null check(intento_n>0),
  canal text not null check(canal='email'),
  destinatario_email text not null check(pg_catalog.btrim(destinatario_email)<>''),
  estado text not null check(estado in ('enviado','fallido','rebotado')),
  detalle text,
  registrado_por_parte_usuario_id uuid not null references alq.alq_parte_usuario(id) on delete restrict,
  registrado_at timestamptz not null default pg_catalog.clock_timestamp(),
  operacion_id uuid not null unique references alq.alq_operacion(id) on delete restrict,
  constraint alq_liquidacion_envio_intento_uq unique(liquidacion_id,intento_n)
);
alter table alq.alq_liquidacion_envio enable row level security;
alter table alq.alq_liquidacion_envio force row level security;

create policy alq_admin_select_liquidacion_propietario
on alq.alq_liquidacion_propietario for select to authenticated
using(alq_private.alq_es_admin_v1());
create policy alq_owner_select_liquidacion_propietario
on alq.alq_liquidacion_propietario for select to authenticated
using(alq_private.alq_puede_ver_propiedad_v1(propiedad_id));
create policy alq_admin_select_liquidacion_envio
on alq.alq_liquidacion_envio for select to authenticated
using(alq_private.alq_es_admin_v1());
create policy alq_owner_select_liquidacion_envio
on alq.alq_liquidacion_envio for select to authenticated
using(exists(select 1 from alq.alq_liquidacion_propietario l
  where l.id=liquidacion_id and alq_private.alq_puede_ver_propiedad_v1(l.propiedad_id)));

grant select on alq.alq_liquidacion_propietario,alq.alq_liquidacion_envio to authenticated;

create view public.alq_v_liquidacion_propietario with(security_invoker='true') as
select id,propiedad_id,propietario_parte_id,mandato_version_id,periodo,moneda,
  version_documento,estado,saldo_apertura_admin,saldo_cierre_admin,contenido,
  contenido_sha256,sucesora_de,emitida_por_parte_usuario_id,emitida_at,operacion_id
from alq.alq_liquidacion_propietario;

create view public.alq_v_liquidacion_envio with(security_invoker='true') as
select id,liquidacion_id,intento_n,canal,destinatario_email,estado,detalle,
  registrado_por_parte_usuario_id,registrado_at,operacion_id
from alq.alq_liquidacion_envio;

grant select on public.alq_v_liquidacion_propietario,
  public.alq_v_liquidacion_envio to authenticated;

create function alq_private.alq_f3_b2_agregado_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_estado text; v_operacion text; v_actor uuid; v_esperada text;
begin
  if tg_op<>'INSERT' then
    raise exception using errcode='P0001',message='ALQ_F3_B2_HISTORIA_INMUTABLE';
  end if;
  v_esperada:=case tg_table_name
    when 'alq_liquidacion_propietario' then 'liquidacion_propietario_emitir'
    when 'alq_liquidacion_envio' then 'liquidacion_envio_registrar'
    else null end;
  select estado,operacion,actor_parte_usuario_id into v_estado,v_operacion,v_actor
  from alq.alq_operacion where id=new.operacion_id for update;
  if not found or v_estado<>'preparada' or v_operacion is distinct from v_esperada
     or not alq_private.alq_f1a_writer_context_v1('check',new.operacion_id) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_DML_DIRECTO_PROHIBIDO';
  end if;
  if tg_table_name='alq_liquidacion_propietario' then
    new.emitida_por_parte_usuario_id:=v_actor;
    new.emitida_at:=pg_catalog.clock_timestamp();
  else
    new.registrado_por_parte_usuario_id:=v_actor;
    new.registrado_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$fn$;

create trigger alq_liquidacion_propietario_guard_biud
before insert or update or delete on alq.alq_liquidacion_propietario
for each row execute function alq_private.alq_f3_b2_agregado_guard_v1();
create trigger alq_liquidacion_envio_guard_biud
before insert or update or delete on alq.alq_liquidacion_envio
for each row execute function alq_private.alq_f3_b2_agregado_guard_v1();

create function alq_private.alq_f3_b2_derivar_v1(
  p_propiedad uuid,p_periodo date,p_actor uuid,p_corregir_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
  v_prop alq.alq_propiedad%rowtype; v_mg alq.alq_mes_generado%rowtype;
  v_mv alq.alq_mandato_version%rowtype; v_previa alq.alq_liquidacion_propietario%rowtype;
  v_titular uuid; v_titular_nombre text; v_titular_email text; v_admin uuid;
  v_count integer; v_moneda text; v_fee alq.alq_cargo%rowtype;
  v_ids uuid[]; v_obligaciones jsonb:='[]'::jsonb; v_pagos jsonb:='[]'::jsonb;
  v_cuenta jsonb:='[]'::jsonb; v_movimientos jsonb:='[]'::jsonb;
  v_prior_actual numeric:=0; v_apertura numeric:=0; v_delta numeric:=0;
  v_fee_neto numeric:=0; v_fee_pagado numeric:=0; v_cierre numeric:=0;
  v_version integer:=1; v_content jsonb; v_sha text;
begin
  if p_propiedad is null or p_periodo is null
     or p_periodo<>pg_catalog.date_trunc('month',p_periodo)::date then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PERIODO_INVALIDO';
  end if;
  if not alq_private.alq_es_admin_v1() then
    raise exception using errcode='42501',message='ALQ_F3_B2_ADMIN_REQUERIDO';
  end if;
  select pu.parte_id into v_admin from alq.alq_parte_usuario pu where pu.id=p_actor;
  if v_admin is null then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ACTOR_SIN_PARTE';
  end if;
  select * into v_prop from alq.alq_propiedad where id=p_propiedad;
  if not found then raise exception using errcode='P0001',message='ALQ_F3_B2_PROPIEDAD_NO_EXISTE'; end if;
  select count(*),(array_agg(t.parte_id order by t.parte_id))[1]
    into v_count,v_titular from alq.alq_titularidad t
  where t.propiedad_id=p_propiedad and p_periodo::timestamptz<@t.vigencia;
  if v_count<>1 then raise exception using errcode='P0001',message='ALQ_F3_B2_TITULAR_AMBIGUO'; end if;
  select nombre,email into v_titular_nombre,v_titular_email from alq.alq_parte where id=v_titular;
  select count(*),(array_agg(mv.id order by mv.id))[1] into v_count,v_mv.id
  from alq.alq_mandato m join alq.alq_mandato_version mv on mv.mandato_id=m.id
  where m.propiedad_id=p_propiedad and m.estado='activo'
    and p_periodo::timestamptz<@m.vigencia and p_periodo::timestamptz<@mv.vigencia;
  if v_count<>1 then raise exception using errcode='P0001',message='ALQ_F3_B2_MANDATO_AMBIGUO'; end if;
  select * into v_mv from alq.alq_mandato_version where id=v_mv.id;
  select count(*),(array_agg(x.id order by x.id))[1] into v_count,v_mg.id
  from alq.alq_mes_generado x where x.propiedad_id=p_propiedad and x.mes=p_periodo;
  if v_count<>1 then raise exception using errcode='P0001',message='ALQ_F3_B2_MES_NO_GENERADO'; end if;
  select * into v_mg from alq.alq_mes_generado where id=v_mg.id;
  select * into v_fee from alq.alq_cargo where id=v_mg.honorario_cargo_id;
  v_moneda:=v_fee.moneda;
  v_ids:=array_remove(array[v_mg.alquiler_cargo_id,v_mg.expensas_cargo_id],null);

  if p_corregir_id is not null then
    select * into v_previa from alq.alq_liquidacion_propietario
      where id=p_corregir_id;
    if not found or v_previa.propiedad_id<>p_propiedad or v_previa.periodo<>p_periodo
       or v_previa.moneda<>v_moneda or exists(select 1 from alq.alq_liquidacion_propietario
         where sucesora_de=v_previa.id) then
      raise exception using errcode='P0001',message='ALQ_F3_B2_CORRECCION_INVALIDA';
    end if;
    v_version:=v_previa.version_documento+1;
  elsif exists(select 1 from alq.alq_liquidacion_propietario
      where propiedad_id=p_propiedad and periodo=p_periodo and moneda=v_moneda) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_REQUIERE_CORRECCION';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'cargo_id',c.id,'concepto',c.concepto,'detalle',case c.concepto
      when 'alquiler_periodo' then 'Alquiler contractual'
      when 'expensas' then 'Expensas' else c.concepto end,
    'deudor_parte_id',c.deudor_parte_id,'deudor',pd.nombre,
    'acreedor_parte_id',c.acreedor_parte_id,'acreedor',pa.nombre,
    'vence',c.vence_at::date,'monto',c.monto+
      coalesce((select sum(case n.tipo when 'debito' then n.monto else -n.monto end)
        from alq.alq_nota n where n.cargo_id=c.id),0),
    'pagado',greatest(0,c.monto+
      coalesce((select sum(case n.tipo when 'debito' then n.monto else -n.monto end)
        from alq.alq_nota n where n.cargo_id=c.id),0)-c.saldo_pendiente),
    'saldo',c.saldo_pendiente,'estado',case when c.saldo_pendiente=0 then 'pagado'
      when c.saldo_pendiente<c.monto then 'parcial' else 'impago' end)
    order by c.vence_at,c.id),'[]'::jsonb) into v_obligaciones
  from alq.alq_cargo c join alq.alq_parte pd on pd.id=c.deudor_parte_id
    join alq.alq_parte pa on pa.id=c.acreedor_parte_id where c.id=any(v_ids);

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'pago_confirmado_id',pc.id,'transaccion_id',t.id,'fecha',t.fecha,
    'pagador_parte_id',pc.pagador_parte_id,'pagador',pp.nombre,
    'beneficiario_parte_id',pc.beneficiario_parte_id,'beneficiario',pb.nombre,
    'monto',pc.monto,'medio',t.medio,'ambito',t.ambito)
    order by t.fecha,t.id),'[]'::jsonb) into v_pagos
  from alq.alq_pago_confirmado pc join alq.alq_transaccion_caja t on t.id=pc.transaccion_id
    join alq.alq_parte pp on pp.id=pc.pagador_parte_id
    join alq.alq_parte pb on pb.id=pc.beneficiario_parte_id
  where pc.propiedad_id=p_propiedad and pc.cargo_ids&&v_ids and t.estado='confirmada';

  select coalesce(sum(c.saldo_pendiente),0) into v_prior_actual
  from alq.alq_mes_generado x join alq.alq_cargo c on c.id=x.honorario_cargo_id
  where x.propiedad_id=p_propiedad and x.mes<p_periodo and c.moneda=v_moneda;
  select * into v_previa from alq.alq_liquidacion_propietario
  where propiedad_id=p_propiedad and periodo<p_periodo and moneda=v_moneda
  order by periodo desc,version_documento desc limit 1;
  v_apertura:=case when found then v_previa.saldo_cierre_admin else v_prior_actual end;
  v_delta:=v_prior_actual-v_apertura;
  v_fee_neto:=v_fee.monto+coalesce((select sum(case n.tipo when 'debito' then n.monto else -n.monto end)
    from alq.alq_nota n where n.cargo_id=v_fee.id),0);
  v_fee_pagado:=greatest(0,v_fee_neto-v_fee.saldo_pendiente);
  if v_delta<>0 then
    v_cuenta:=v_cuenta||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'tipo','ajuste_periodos_anteriores','detalle','Movimientos de períodos anteriores registrados después de la última liquidación',
      'mes_origen',null,'signo',case when v_delta>0 then 1 else -1 end,'monto',abs(v_delta)));
  end if;
  v_cuenta:=v_cuenta||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'tipo','honorario_devengado','detalle','Honorario de administración del mes',
    'cargo_id',v_fee.id,'mes_origen',p_periodo,'signo',1,'monto',v_fee_neto));
  if v_fee_pagado>0 then
    v_cuenta:=v_cuenta||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'tipo','pago_honorario','detalle','Pago del propietario a la administración',
      'cargo_id',v_fee.id,'mes_origen',p_periodo,'signo',-1,'monto',v_fee_pagado));
  end if;
  v_cierre:=v_apertura+v_delta+v_fee_neto-v_fee_pagado;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'transaccion_id',t.id,'fecha',t.fecha,'direccion',t.direccion,'ambito',t.ambito,
    'monto',t.monto,'moneda',t.moneda,'medio',t.medio,'estado',t.estado)
    order by t.fecha,t.id),'[]'::jsonb) into v_movimientos
  from alq.alq_transaccion_caja t where t.id in(
    select distinct a.transaccion_id from alq.alq_aplicacion a
    where a.cargo_id=any(array_append(v_ids,v_fee.id)));

  v_content:=pg_catalog.jsonb_build_object(
    'schema','alq_f3_b2_liquidacion_v1','tipo','liquidacion_propietario',
    'marca','Sur Patagonian Real Estate','documento_fiscal',false,
    'version_documento',v_version,'periodo',p_periodo,'moneda',v_moneda,
    'propiedad',pg_catalog.jsonb_build_object('id',v_prop.id,'direccion',v_prop.direccion,
      'ciudad',v_prop.ciudad,'provincia',v_prop.provincia),
    'propietario',pg_catalog.jsonb_build_object('id',v_titular,'nombre',v_titular_nombre,
      'email',v_titular_email),
    'mandato_version_id',v_mv.id,'tratamiento_impuestos',v_mv.tratamiento_impuestos,
    'saldo_apertura_admin',v_apertura,
    'obligaciones_inquilino',v_obligaciones,
    'pagos_informados_entre_partes',v_pagos,
    'cuenta_propietario_administracion',v_cuenta,
    'movimientos_reales',v_movimientos,
    'saldo_cierre_admin',v_cierre,
    'convencion_saldo','positivo: propietario debe a administración; negativo: administración debe al propietario',
    'leyenda_no_fiscal','Documento informativo de administración. No es factura, recibo fiscal ni comprobante AFIP.');
  v_sha:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_content::text,'UTF8'),'sha256'),'hex');
  return pg_catalog.jsonb_build_object('contenido',v_content,'contenido_sha256',v_sha,
    'saldo_apertura_admin',v_apertura,'saldo_cierre_admin',v_cierre,
    'propietario_email',v_titular_email,'version_documento',v_version,
    'correccion_de',p_corregir_id);
end
$fn$;

create function public.alq_admin_liquidacion_borrador(
  p_propiedad_id uuid,p_periodo date,p_corregir_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare v_actor uuid; v_count integer;
begin
  select count(*),(array_agg(pu.id order by pu.id))[1] into v_count,v_actor
  from alq.alq_parte_usuario pu where pu.auth_user_id=auth.uid()
    and pg_catalog.clock_timestamp()<@pu.vigencia;
  if v_count<>1 then raise exception using errcode='42501',message='ALQ_F3_B2_ACTOR_AMBIGUO'; end if;
  return alq_private.alq_f3_b2_derivar_v1(p_propiedad_id,p_periodo,v_actor,p_corregir_id);
end
$fn$;
revoke all on function public.alq_admin_liquidacion_borrador(uuid,date,uuid) from public;
grant execute on function public.alq_admin_liquidacion_borrador(uuid,date,uuid) to authenticated;

create function alq_private.alq_f3_b2_emitir_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_prop uuid:=nullif(p_payload->>'propiedad_id','')::uuid;
  v_periodo date:=nullif(p_payload->>'periodo','')::date;
  v_esperado text:=pg_catalog.btrim(coalesce(p_payload->>'contenido_sha256',''));
  v_corregir uuid:=nullif(p_payload->>'corregir_id','')::uuid;
  v_der jsonb; v_cont jsonb; v_sha text; v_id uuid;
begin
  if v_prop is null or v_periodo is null or v_esperado!~'^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='ALQ_F3_B2_EMISION_PAYLOAD_INVALIDO';
  end if;
  v_der:=alq_private.alq_f3_b2_derivar_v1(v_prop,v_periodo,p_actor,v_corregir);
  v_sha:=v_der->>'contenido_sha256'; v_cont:=v_der->'contenido';
  if v_sha<>v_esperado then
    raise exception using errcode='P0001',message='ALQ_F3_B2_BORRADOR_CAMBIO_REVISAR';
  end if;
  insert into alq.alq_liquidacion_propietario(propiedad_id,propietario_parte_id,
    mandato_version_id,periodo,moneda,version_documento,estado,saldo_apertura_admin,
    saldo_cierre_admin,contenido,contenido_sha256,sucesora_de,
    emitida_por_parte_usuario_id,emitida_at,operacion_id)
  values(v_prop,(v_cont#>>'{propietario,id}')::uuid,(v_cont->>'mandato_version_id')::uuid,
    v_periodo,v_cont->>'moneda',(v_cont->>'version_documento')::integer,
    case when v_corregir is null then 'emitida' else 'corregida' end,
    (v_der->>'saldo_apertura_admin')::numeric,(v_der->>'saldo_cierre_admin')::numeric,
    v_cont,v_sha,v_corregir,p_actor,pg_catalog.clock_timestamp(),p_operacion_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('liquidacion_id',v_id,'contenido_sha256',v_sha,
    'version_documento',v_der->'version_documento','estado',
    case when v_corregir is null then 'emitida' else 'corregida' end,
    'saldo_cierre_admin',v_der->'saldo_cierre_admin');
end
$fn$;

create function alq_private.alq_f3_b2_envio_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_liq uuid:=nullif(p_payload->>'liquidacion_id','')::uuid;
  v_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'destinatario_email','')));
  v_estado text:=coalesce(p_payload->>'estado','');
  v_detalle text:=nullif(pg_catalog.btrim(coalesce(p_payload->>'detalle','')), '');
  v_n integer; v_id uuid;
begin
  if v_liq is null or v_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_estado not in ('enviado','fallido','rebotado') then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ENVIO_PAYLOAD_INVALIDO';
  end if;
  perform 1 from alq.alq_liquidacion_propietario where id=v_liq for update;
  if not found then raise exception using errcode='P0001',message='ALQ_F3_B2_LIQUIDACION_NO_EXISTE'; end if;
  select coalesce(max(intento_n),0)+1 into v_n from alq.alq_liquidacion_envio where liquidacion_id=v_liq;
  insert into alq.alq_liquidacion_envio(liquidacion_id,intento_n,canal,
    destinatario_email,estado,detalle,registrado_por_parte_usuario_id,
    registrado_at,operacion_id)
  values(v_liq,v_n,'email',v_email,v_estado,v_detalle,p_actor,
    pg_catalog.clock_timestamp(),p_operacion_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('envio_id',v_id,'liquidacion_id',v_liq,
    'intento_n',v_n,'estado',v_estado,'destinatario_email',v_email);
end
$fn$;

create or replace function alq_private.alq_operaciones_v1()
returns text[] language sql immutable security definer set search_path=''
as $fn$
select array[
 'parte_alta','parte_editar','propiedad_alta','titularidad_asignar','mandato_alta','mandato_baja_avanzar',
 'contrato_alta','contrato_version_agregar','contrato_renovar','contrato_rescindir',
 'contrato_continuacion_marcar','garantia_alta','deposito_evento_registrar','deposito_liquidar',
 'cargo_manual_emitir','nota_emitir','transaccion_registrar','aplicacion_asignar','conversion_registrar',
 'ajuste_calcular','ajuste_aprobar','ajuste_aplicar','servicio_cuenta_alta',
 'servicio_factura_registrar','rendicion_emitir','giro_registrar','rendicion_corregir',
 'factura_externa_registrar','comunicado_abrir','comunicado_responder','comunicado_resolver',
 'documento_registrar','export_baja_generar','export_baja_entregar','acceso_revocar',
 'transferencia_interna','reversa_con_reapertura','pago_multimoneda','credito_devolver',
 'credito_consumir','deposito_liquidar_y_devolver','giro_a_propietario','parte_usuario_vincular',
 'acceso_otorgar','mandato_version_agregar','mes_normal_generar','pago_comprobante_confirmar',
 'liquidacion_propietario_emitir','liquidacion_envio_registrar'
]::text[]
$fn$;

create or replace function alq_private.alq_f1a_operaciones_lock_v1()
returns text[] language sql immutable security definer set search_path=''
as $fn$
  select array[
    'nota_emitir','credito_consumir','transferencia_interna',
    'deposito_evento_registrar','deposito_liquidar_y_devolver',
    'reversa_con_reapertura','cargo_manual_emitir','pago_multimoneda',
    'credito_devolver','giro_registrar','giro_a_propietario',
    'transaccion_registrar','aplicacion_asignar','deposito_liquidar',
    'rendicion_emitir','rendicion_corregir','mes_normal_generar',
    'pago_comprobante_confirmar','liquidacion_propietario_emitir',
    'liquidacion_envio_registrar'
  ]::text[]
$fn$;

do $alq_f3_b2_patch_roots$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_f1a_raices_payload_snapshot_v1(text,jsonb)'::regprocedure);
  v_needle:=E'    when ''mes_normal_generar'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ROOT_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'    when ''liquidacion_propietario_emitir'' then\n'
    '      v_props:=array_remove(array[nullif(p_payload->>''propiedad_id'','''')::uuid],null);\n'
    '    when ''liquidacion_envio_registrar'' then\n'
    '      select array_remove(array[l.propiedad_id],null) into v_props\n'
    '      from alq.alq_liquidacion_propietario l\n'
    '      where l.id=nullif(p_payload->>''liquidacion_id'','''')::uuid;\n'
    '    when ''mes_normal_generar'' then\n');
  execute v_new;
end
$alq_f3_b2_patch_roots$;

do $alq_f3_b2_patch_executor$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_needle:=E'  when ''mes_normal_generar'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B2_EXECUTOR_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'  when ''liquidacion_propietario_emitir'' then\n'
    '    v_result:=alq_private.alq_f3_b2_emitir_aplicar_v1(\n'
    '      p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''liquidacion_envio_registrar'' then\n'
    '    v_result:=alq_private.alq_f3_b2_envio_aplicar_v1(\n'
    '      p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''mes_normal_generar'' then\n');
  execute v_new;
end
$alq_f3_b2_patch_executor$;

revoke all on function alq_private.alq_f3_b2_agregado_guard_v1() from public;
revoke all on function alq_private.alq_f3_b2_derivar_v1(uuid,date,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b2_emitir_aplicar_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b2_envio_aplicar_v1(jsonb,uuid,uuid) from public;

do $alq_f3_b2_postcheck$
begin
  if pg_catalog.to_regclass('alq.alq_liquidacion_propietario') is null
     or pg_catalog.to_regclass('alq.alq_liquidacion_envio') is null
     or pg_catalog.to_regclass('public.alq_v_liquidacion_propietario') is null
     or (select count(*) from unnest(alq_private.alq_operaciones_v1()) x
       where x in ('liquidacion_propietario_emitir','liquidacion_envio_registrar'))<>2
     or position('alq_f3_b2_emitir_aplicar_v1' in pg_catalog.pg_get_functiondef(
       'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure))=0 then
    raise exception using errcode='P0001',message='ALQ_F3_B2_POSTCHECK_FALLO';
  end if;
end
$alq_f3_b2_postcheck$;
