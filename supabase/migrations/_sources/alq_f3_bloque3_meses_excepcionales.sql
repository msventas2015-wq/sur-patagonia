-- ALQ F3 · Bloque 3 · seis meses excepcionales del piloto Ñancos.
-- La mora se propone y sólo una decisión humana puede convertirla en cargo.
-- El ajuste crea una nueva versión contractual. El depósito nunca entra en la
-- caja real de la administración. No contiene BEGIN/COMMIT.

do $alq_f3_b3_guard$
begin
  if pg_catalog.to_regclass('alq.alq_mes_generado') is null
     or pg_catalog.to_regclass('alq.alq_liquidacion_documento') is null then
    raise exception using errcode='P0001',message='ALQ_F3_B3_REQUIERE_BLOQUES_1_Y_2';
  end if;
  if pg_catalog.to_regclass('alq.alq_mora_propuesta') is not null
     or 'mora_proponer'=any(alq_private.alq_operaciones_v1()) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_YA_INSTALADO';
  end if;
end
$alq_f3_b3_guard$;

create table alq.alq_mora_propuesta (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  propiedad_id uuid not null references alq.alq_propiedad(id) on delete restrict,
  contrato_id uuid not null references alq.alq_contrato(id) on delete restrict,
  cargo_base_id uuid not null references alq.alq_cargo(id) on delete restrict,
  calculada_hasta date not null,
  capital numeric(20,6) not null check(capital>0),
  porcentaje_diario numeric(12,6) not null check(porcentaje_diario>0 and porcentaje_diario<=100),
  gracia_dias smallint not null check(gracia_dias>=0),
  dias_mora integer not null check(dias_mora>0),
  monto_propuesto numeric(20,6) not null check(monto_propuesto>0),
  formula_version text not null default 'interes_simple_diario_v1',
  estado text not null default 'propuesta' check(estado in ('propuesta','aplicada','condonada')),
  monto_resuelto numeric(20,6),
  motivo_resolucion text,
  cargo_mora_id uuid unique references alq.alq_cargo(id) on delete restrict,
  propuesta_por_parte_usuario_id uuid not null references alq.alq_parte_usuario(id) on delete restrict,
  propuesta_at timestamptz not null default pg_catalog.clock_timestamp(),
  resuelta_por_parte_usuario_id uuid references alq.alq_parte_usuario(id) on delete restrict,
  resuelta_at timestamptz,
  operacion_propuesta_id uuid not null unique references alq.alq_operacion(id) on delete restrict,
  operacion_resolucion_id uuid unique references alq.alq_operacion(id) on delete restrict,
  constraint alq_mora_propuesta_calculo_uq unique(cargo_base_id,calculada_hasta,porcentaje_diario,gracia_dias),
  constraint alq_mora_propuesta_estado_ck check(
    (estado='propuesta' and monto_resuelto is null and motivo_resolucion is null
      and cargo_mora_id is null and resuelta_por_parte_usuario_id is null
      and resuelta_at is null and operacion_resolucion_id is null)
    or (estado='condonada' and monto_resuelto=0 and motivo_resolucion is not null
      and cargo_mora_id is null and resuelta_por_parte_usuario_id is not null
      and resuelta_at is not null and operacion_resolucion_id is not null)
    or (estado='aplicada' and monto_resuelto>0 and motivo_resolucion is not null
      and cargo_mora_id is not null and resuelta_por_parte_usuario_id is not null
      and resuelta_at is not null and operacion_resolucion_id is not null))
);
create unique index alq_mora_propuesta_abierta_uq on alq.alq_mora_propuesta(cargo_base_id)
where estado='propuesta';
alter table alq.alq_mora_propuesta enable row level security;
alter table alq.alq_mora_propuesta force row level security;
create policy alq_admin_select_mora_propuesta on alq.alq_mora_propuesta
for select to authenticated using(alq_private.alq_es_admin_v1());
create policy alq_owner_select_mora_propuesta on alq.alq_mora_propuesta
for select to authenticated using(alq_private.alq_puede_ver_propiedad_v1(propiedad_id));
grant select on alq.alq_mora_propuesta to authenticated;

alter table alq.alq_ajuste
  add column contrato_version_resultado_id uuid references alq.alq_contrato_version(id) on delete restrict,
  add column vigente_desde date,
  add column motivo text;
create unique index alq_ajuste_version_resultado_uq
on alq.alq_ajuste(contrato_version_resultado_id)
where contrato_version_resultado_id is not null;

create view public.alq_v_mora_propuesta with(security_invoker='true') as
select id,propiedad_id,contrato_id,cargo_base_id,calculada_hasta,capital,
  porcentaje_diario,gracia_dias,dias_mora,monto_propuesto,formula_version,
  estado,monto_resuelto,motivo_resolucion,cargo_mora_id,
  propuesta_por_parte_usuario_id,propuesta_at,resuelta_por_parte_usuario_id,
  resuelta_at,operacion_propuesta_id,operacion_resolucion_id
from alq.alq_mora_propuesta;

create view public.alq_v_ajuste with(security_invoker='true') as
select a.id,cv.contrato_id,a.contrato_version_base_id,a.contrato_version_resultado_id,
  a.estado,a.formula_version,a.resultado_sin_redondear,a.resultado_final,
  a.vigente_desde,a.motivo,a.aprobador_parte_usuario_id,a.aplicado_at,
  a.operacion_id,a.creado_at
from alq.alq_ajuste a
join alq.alq_contrato_version cv on cv.id=a.contrato_version_base_id;

create view public.alq_v_deposito with(security_invoker='true') as
select d.id,d.contrato_id,c.propiedad_id,d.moneda,d.monto_constituido,
  d.custodia_parte_id,d.creado_at,
  d.monto_constituido-coalesce((select sum(e.monto) from alq.alq_deposito_evento e
    where e.deposito_id=d.id and e.tipo in ('aplicacion','devolucion','transferencia_a_sucesor')),0)
    -coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=d.id and l.estado in ('aprobada','pagada')),0) as saldo_disponible
from alq.alq_deposito d join alq.alq_contrato c on c.id=d.contrato_id;

create view public.alq_v_deposito_evento with(security_invoker='true') as
select e.id,e.deposito_id,d.contrato_id,c.propiedad_id,e.tipo,e.monto,e.moneda,
  e.transaccion_id,e.contrato_sucesor_id,e.evidencia_documento_id,e.operacion_id,e.creado_at
from alq.alq_deposito_evento e join alq.alq_deposito d on d.id=e.deposito_id
join alq.alq_contrato c on c.id=d.contrato_id;

create view public.alq_v_deposito_liquidacion with(security_invoker='true') as
select l.id,l.deposito_id,d.contrato_id,c.propiedad_id,l.fecha,l.estado,
  l.documento_id,l.operacion_id
from alq.alq_deposito_liquidacion l join alq.alq_deposito d on d.id=l.deposito_id
join alq.alq_contrato c on c.id=d.contrato_id;

grant select on public.alq_v_mora_propuesta,public.alq_v_ajuste,
  public.alq_v_deposito,public.alq_v_deposito_evento,
  public.alq_v_deposito_liquidacion to authenticated;

create function alq_private.alq_f3_b3_mora_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_estado text; v_operacion text; v_actor uuid;
begin
  if tg_op='DELETE' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_HISTORIA_INMUTABLE';
  end if;
  select estado,operacion,actor_parte_usuario_id into v_estado,v_operacion,v_actor
  from alq.alq_operacion where id=case when tg_op='INSERT' then new.operacion_propuesta_id
    else new.operacion_resolucion_id end for update;
  if not found or v_estado<>'preparada'
     or v_operacion<>(case when tg_op='INSERT' then 'mora_proponer' else 'mora_resolver' end)
     or not alq_private.alq_f1a_writer_context_v1('check',case when tg_op='INSERT'
       then new.operacion_propuesta_id else new.operacion_resolucion_id end) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_DML_DIRECTO_PROHIBIDO';
  end if;
  if tg_op='INSERT' then
    new.propuesta_por_parte_usuario_id:=v_actor;
    new.propuesta_at:=pg_catalog.clock_timestamp();
  else
    if old.estado<>'propuesta' or old.operacion_resolucion_id is not null then
      raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_YA_RESUELTA';
    end if;
    new.resuelta_por_parte_usuario_id:=v_actor;
    new.resuelta_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$fn$;
create trigger alq_mora_propuesta_guard_biud before insert or update or delete
on alq.alq_mora_propuesta for each row execute function alq_private.alq_f3_b3_mora_guard_v1();

create function alq_private.alq_f3_b3_mora_proponer_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_c alq.alq_cargo%rowtype; v_ct alq.alq_contrato%rowtype;
  v_hasta date:=nullif(p_payload->>'calculada_hasta','')::date;
  v_pct numeric:=nullif(p_payload->>'porcentaje_diario','')::numeric;
  v_gracia integer:=coalesce(nullif(p_payload->>'gracia_dias','')::integer,0);
  v_capital numeric; v_dias integer; v_monto numeric; v_id uuid;
begin
  if v_hasta is null or v_pct is null or v_pct<=0 or v_pct>100 or v_gracia<0 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_PARAMETROS_INVALIDOS';
  end if;
  select * into v_c from alq.alq_cargo where id=nullif(p_payload->>'cargo_id','')::uuid for update;
  if not found or v_c.contrato_id is null then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_CARGO_INVALIDO';
  end if;
  select * into v_ct from alq.alq_contrato where id=v_c.contrato_id for update;
  if not found or v_c.deudor_parte_id<>v_ct.inquilino_parte_id then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_SOLO_INQUILINO';
  end if;
  v_dias:=v_hasta-v_c.vence_at::date-v_gracia;
  if v_dias<=0 then raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_SIN_DIAS'; end if;
  select v_c.monto+coalesce(sum(case n.tipo when 'debito' then n.monto else -n.monto end),0)
    into v_capital from alq.alq_nota n where n.cargo_id=v_c.id;
  v_monto:=pg_catalog.round(v_capital*(v_pct/100)*v_dias,2);
  if v_monto<=0 then raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_MONTO_CERO'; end if;
  insert into alq.alq_mora_propuesta(propiedad_id,contrato_id,cargo_base_id,
    calculada_hasta,capital,porcentaje_diario,gracia_dias,dias_mora,monto_propuesto,
    propuesta_por_parte_usuario_id,operacion_propuesta_id)
  values(v_c.propiedad_id,v_c.contrato_id,v_c.id,v_hasta,v_capital,v_pct,v_gracia,
    v_dias,v_monto,p_actor,p_operacion_id) returning id into v_id;
  return pg_catalog.jsonb_build_object('propuesta_id',v_id,'dias_mora',v_dias,
    'capital',v_capital,'porcentaje_diario',v_pct,'monto_propuesto',v_monto,
    'estado','propuesta');
end
$fn$;

create function alq_private.alq_f3_b3_mora_resolver_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_p alq.alq_mora_propuesta%rowtype; v_c alq.alq_cargo%rowtype;
  v_decision text:=coalesce(p_payload->>'decision','');
  v_motivo text:=pg_catalog.btrim(coalesce(p_payload->>'motivo',''));
  v_monto numeric; v_cargo uuid; v_vence date;
begin
  select * into v_p from alq.alq_mora_propuesta
    where id=nullif(p_payload->>'propuesta_id','')::uuid for update;
  if not found or v_p.estado<>'propuesta' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_PROPUESTA_NO_DISPONIBLE';
  end if;
  if v_decision not in ('aplicar','condonar') or v_motivo='' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_DECISION_INVALIDA';
  end if;
  select * into v_c from alq.alq_cargo where id=v_p.cargo_base_id for update;
  if v_decision='aplicar' then
    v_monto:=coalesce(nullif(p_payload->>'monto_final','')::numeric,v_p.monto_propuesto);
    v_vence:=coalesce(nullif(p_payload->>'vence','')::date,v_p.calculada_hasta);
    if v_monto<=0 then raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_MONTO_INVALIDO'; end if;
    insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
      acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
      snapshot_regla,saldo_pendiente)
    values(v_c.propiedad_id,v_c.contrato_id,v_c.periodo_id,v_c.deudor_parte_id,
      v_c.acreedor_parte_id,'externa','mora',v_c.moneda,v_monto,
      v_vence::timestamptz,'admin',p_operacion_id,
      pg_catalog.jsonb_build_object('mora_propuesta_id',v_p.id,'cargo_base_id',v_c.id,
        'capital',v_p.capital,'porcentaje_diario',v_p.porcentaje_diario,
        'dias_mora',v_p.dias_mora,'motivo',v_motivo),v_monto)
    returning id into v_cargo;
  else v_monto:=0; end if;
  update alq.alq_mora_propuesta set estado=case v_decision when 'aplicar' then 'aplicada' else 'condonada' end,
    monto_resuelto=v_monto,motivo_resolucion=v_motivo,cargo_mora_id=v_cargo,
    resuelta_por_parte_usuario_id=p_actor,resuelta_at=pg_catalog.clock_timestamp(),
    operacion_resolucion_id=p_operacion_id where id=v_p.id;
  return pg_catalog.jsonb_build_object('propuesta_id',v_p.id,'estado',
    case v_decision when 'aplicar' then 'aplicada' else 'condonada' end,
    'monto_resuelto',v_monto,'cargo_mora_id',v_cargo);
end
$fn$;

create function alq_private.alq_f3_b3_ajuste_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_ct alq.alq_contrato%rowtype; v_cv alq.alq_contrato_version%rowtype;
  v_desde date:=nullif(p_payload->>'vigente_desde','')::date;
  v_monto numeric:=nullif(p_payload->>'monto_nuevo','')::numeric;
  v_motivo text:=pg_catalog.btrim(coalesce(p_payload->>'motivo',''));
  v_nueva uuid; v_ajuste uuid; v_upper timestamptz;
begin
  if v_desde is null or v_desde<>pg_catalog.date_trunc('month',v_desde)::date
     or v_monto is null or v_monto<=0 or v_motivo='' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_AJUSTE_PARAMETROS_INVALIDOS';
  end if;
  select * into v_ct from alq.alq_contrato
    where id=nullif(p_payload->>'contrato_id','')::uuid for update;
  if not found or v_ct.estado not in ('vigente','continuacion_legal') then
    raise exception using errcode='P0001',message='ALQ_F3_B3_AJUSTE_CONTRATO_NO_VIGENTE';
  end if;
  select * into v_cv from alq.alq_contrato_version
    where contrato_id=v_ct.id and v_desde::timestamptz<@vigencia for update;
  if not found or v_desde::timestamptz<=lower(v_cv.vigencia) or v_monto=v_cv.monto then
    raise exception using errcode='P0001',message='ALQ_F3_B3_AJUSTE_VERSION_INVALIDA';
  end if;
  if exists(select 1 from alq.alq_mes_generado where contrato_id=v_ct.id and mes>=v_desde) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_AJUSTE_MES_YA_GENERADO';
  end if;
  v_upper:=upper(v_cv.vigencia);
  update alq.alq_contrato_version set vigencia=pg_catalog.tstzrange(lower(v_cv.vigencia),v_desde::timestamptz,'[)')
    where id=v_cv.id;
  insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,
    dia_pago_desde,dia_pago_hasta,indice_serie_id,pct_fijo,frecuencia_ajuste,
    punitorio_pct_dia,punitorio_desde_dia,formula_punitorio_version,
    metodo_prorrateo,regla_redondeo,regla_pago_otra_moneda,fuente_conversion,
    fallback_indice,creada_at)
  values(v_cv.contrato_id,pg_catalog.tstzrange(v_desde::timestamptz,v_upper,'[)'),
    v_monto,v_cv.moneda,v_cv.dia_pago_desde,v_cv.dia_pago_hasta,v_cv.indice_serie_id,
    v_cv.pct_fijo,v_cv.frecuencia_ajuste,v_cv.punitorio_pct_dia,
    v_cv.punitorio_desde_dia,v_cv.formula_punitorio_version,v_cv.metodo_prorrateo,
    v_cv.regla_redondeo,v_cv.regla_pago_otra_moneda,v_cv.fuente_conversion,
    v_cv.fallback_indice,pg_catalog.clock_timestamp()) returning id into v_nueva;
  insert into alq.alq_ajuste(contrato_version_base_id,estado,formula_version,
    resultado_sin_redondear,resultado_final,aprobador_parte_usuario_id,aplicado_at,
    operacion_id,creado_at,contrato_version_resultado_id,vigente_desde,motivo)
  values(v_cv.id,'aplicado','monto_confirmado_por_administracion_v1',v_monto,v_monto,
    p_actor,pg_catalog.clock_timestamp(),p_operacion_id,pg_catalog.clock_timestamp(),
    v_nueva,v_desde,v_motivo) returning id into v_ajuste;
  return pg_catalog.jsonb_build_object('ajuste_id',v_ajuste,'contrato_id',v_ct.id,
    'version_anterior_id',v_cv.id,'version_nueva_id',v_nueva,'monto_anterior',v_cv.monto,
    'monto_nuevo',v_monto,'vigente_desde',v_desde);
end
$fn$;

create function alq_private.alq_f3_b3_deposito_registrar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_ct alq.alq_contrato%rowtype; v_owner uuid; v_count integer; v_doc uuid;
  v_monto numeric:=nullif(p_payload->>'monto','')::numeric; v_moneda text;
  v_id uuid; v_evento uuid;
begin
  v_doc:=nullif(p_payload->>'evidencia_documento_id','')::uuid;
  if v_monto is null or v_monto<=0 or v_doc is null then
    raise exception using errcode='P0001',message='ALQ_F3_B3_DEPOSITO_PARAMETROS_INVALIDOS';
  end if;
  select * into v_ct from alq.alq_contrato where id=nullif(p_payload->>'contrato_id','')::uuid for update;
  if not found then raise exception using errcode='P0001',message='ALQ_F3_B3_DEPOSITO_CONTRATO_NO_EXISTE'; end if;
  select count(*),(array_agg(t.parte_id order by t.parte_id))[1] into v_count,v_owner
  from alq.alq_titularidad t where t.propiedad_id=v_ct.propiedad_id and v_ct.inicio::timestamptz<@t.vigencia;
  if v_count<>1 then raise exception using errcode='P0001',message='ALQ_F3_B3_DEPOSITO_TITULAR_AMBIGUO'; end if;
  select moneda into v_moneda from alq.alq_contrato_version
    where contrato_id=v_ct.id and v_ct.inicio::timestamptz<@vigencia;
  if v_moneda is null or not exists(select 1 from alq.alq_documento d
      where d.id=v_doc and d.propiedad_id=v_ct.propiedad_id) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_DEPOSITO_EVIDENCIA_INVALIDA';
  end if;
  insert into alq.alq_deposito(contrato_id,moneda,monto_constituido,custodia_parte_id)
    values(v_ct.id,v_moneda,v_monto,v_owner) returning id into v_id;
  insert into alq.alq_deposito_evento(deposito_id,tipo,monto,moneda,
    evidencia_documento_id,operacion_id)
  values(v_id,'constitucion',v_monto,v_moneda,v_doc,p_operacion_id) returning id into v_evento;
  return pg_catalog.jsonb_build_object('deposito_id',v_id,'evento_id',v_evento,
    'monto',v_monto,'moneda',v_moneda,'custodia_parte_id',v_owner);
end
$fn$;

create function alq_private.alq_f3_b3_contrato_cerrar_deposito_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_ct alq.alq_contrato%rowtype; v_d alq.alq_deposito%rowtype;
  v_doc uuid:=nullif(p_payload->>'evidencia_documento_id','')::uuid;
  v_fecha date:=nullif(p_payload->>'fecha','')::date;
  v_monto numeric:=nullif(p_payload->>'monto_devuelto','')::numeric;
  v_saldo numeric; v_liq uuid; v_evento uuid;
begin
  if v_doc is null or v_fecha is null or v_monto is null or v_monto<=0 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_CIERRE_PARAMETROS_INVALIDOS';
  end if;
  select * into v_ct from alq.alq_contrato where id=nullif(p_payload->>'contrato_id','')::uuid for update;
  if not found or v_ct.estado not in ('vigente','continuacion_legal')
     or v_fecha<v_ct.inicio or (v_ct.fin_pactado is not null and v_fecha>v_ct.fin_pactado) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_CIERRE_CONTRATO_INVALIDO';
  end if;
  select * into v_d from alq.alq_deposito where contrato_id=v_ct.id for update;
  if not found or not exists(select 1 from alq.alq_documento d
      where d.id=v_doc and d.propiedad_id=v_ct.propiedad_id) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_CIERRE_DEPOSITO_O_EVIDENCIA_INVALIDA';
  end if;
  select v_d.monto_constituido
    -coalesce((select sum(e.monto) from alq.alq_deposito_evento e where e.deposito_id=v_d.id
      and e.tipo in ('aplicacion','devolucion','transferencia_a_sucesor')),0)
    -coalesce((select sum(x.monto) from alq.alq_deposito_liquidacion l
      join alq.alq_deposito_liquidacion_linea x on x.liquidacion_id=l.id
      where l.deposito_id=v_d.id and l.estado in ('aprobada','pagada')),0) into v_saldo;
  if v_monto<>v_saldo then
    raise exception using errcode='P0001',message='ALQ_F3_B3_CIERRE_REQUIERE_DEVOLUCION_TOTAL';
  end if;
  if exists(select 1 from alq.alq_cargo c where c.contrato_id=v_ct.id
      and c.deudor_parte_id=v_ct.inquilino_parte_id and c.saldo_pendiente>0) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_CIERRE_OBLIGACIONES_PENDIENTES';
  end if;
  insert into alq.alq_deposito_liquidacion(deposito_id,fecha,estado,documento_id,operacion_id)
    values(v_d.id,v_fecha::timestamptz,'pagada',v_doc,p_operacion_id) returning id into v_liq;
  insert into alq.alq_deposito_evento(deposito_id,tipo,monto,moneda,
    evidencia_documento_id,operacion_id)
    values(v_d.id,'devolucion',v_monto,v_d.moneda,v_doc,p_operacion_id) returning id into v_evento;
  update alq.alq_contrato set estado='cerrado',fin_efectivo=v_fecha,actualizado_at=pg_catalog.clock_timestamp()
    where id=v_ct.id;
  return pg_catalog.jsonb_build_object('contrato_id',v_ct.id,'estado','cerrado',
    'fin_efectivo',v_fecha,'deposito_id',v_d.id,'monto_devuelto',v_monto,
    'liquidacion_id',v_liq,'evento_id',v_evento);
end
$fn$;

-- El Bloque 2 ya derivaba honorarios. Este envoltorio suma, en la misma cuenta
-- separada, otros cargos del propietario hacia la administración (por ejemplo,
-- el reintegro del termo) sin mezclarlos con las obligaciones del inquilino.
alter function alq_private.alq_f3_b2_derivar_v1(uuid,date,uuid,uuid)
  rename to alq_f3_b2_derivar_base_v1;

create function alq_private.alq_f3_b2_derivar_v1(
  p_propiedad uuid,p_periodo date,p_actor uuid,p_corregir_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
  v_r jsonb; v_c jsonb; v_admin uuid; v_owner uuid; v_moneda text;
  v_apertura numeric; v_previa numeric; v_anterior_real numeric;
  v_fee_mes numeric; v_otros_mes numeric; v_cierre numeric; v_delta numeric;
  v_cuenta jsonb; v_otros jsonb; v_movs jsonb; v_sha text;
begin
  v_r:=alq_private.alq_f3_b2_derivar_base_v1(p_propiedad,p_periodo,p_actor,p_corregir_id);
  v_c:=v_r->'contenido'; v_moneda:=v_c->>'moneda';
  select parte_id into v_admin from alq.alq_parte_usuario where id=p_actor;
  v_owner:=(v_c#>>'{propietario,id}')::uuid;
  select l.saldo_cierre_admin into v_previa from alq.alq_liquidacion_propietario l
    where l.propiedad_id=p_propiedad and l.periodo<p_periodo and l.moneda=v_moneda
    order by l.periodo desc,l.version_documento desc limit 1;
  select coalesce(sum(c.saldo_pendiente),0) into v_anterior_real from alq.alq_cargo c
    where c.propiedad_id=p_propiedad and c.deudor_parte_id=v_owner
      and c.acreedor_parte_id=v_admin and c.moneda=v_moneda
      and c.vence_at::date<p_periodo;
  v_apertura:=coalesce(v_previa,v_anterior_real); v_delta:=v_anterior_real-v_apertura;
  select coalesce(sum(c.saldo_pendiente),0) into v_fee_mes
  from alq.alq_mes_generado x join alq.alq_cargo c on c.id=x.honorario_cargo_id
  where x.propiedad_id=p_propiedad and x.mes=p_periodo and c.moneda=v_moneda;
  select coalesce(sum(c.saldo_pendiente),0) into v_otros_mes from alq.alq_cargo c
  where c.propiedad_id=p_propiedad and c.deudor_parte_id=v_owner
    and c.acreedor_parte_id=v_admin and c.moneda=v_moneda
    and c.concepto<>'honorario_administracion'
    and c.vence_at::date>=p_periodo and c.vence_at::date<(p_periodo+interval '1 month')::date;
  select coalesce(pg_catalog.jsonb_agg(z.item order by z.vence,z.ord),'[]'::jsonb) into v_otros
  from (
    select c.vence_at as vence,1 as ord,pg_catalog.jsonb_build_object(
      'tipo','otro_cargo_propietario_administracion','detalle',
      coalesce(c.snapshot_regla->>'detalle',c.concepto),'cargo_id',c.id,
      'mes_origen',p_periodo,'signo',1,'monto',c.monto+
        coalesce((select sum(case n.tipo when 'debito' then n.monto else -n.monto end)
          from alq.alq_nota n where n.cargo_id=c.id),0)) item
    from alq.alq_cargo c where c.propiedad_id=p_propiedad
      and c.deudor_parte_id=v_owner and c.acreedor_parte_id=v_admin
      and c.moneda=v_moneda and c.concepto<>'honorario_administracion'
      and c.vence_at::date>=p_periodo and c.vence_at::date<(p_periodo+interval '1 month')::date
    union all
    select c.vence_at,2,pg_catalog.jsonb_build_object(
      'tipo','pago_otro_cargo_propietario_administracion','detalle','Pago del propietario a la administración',
      'cargo_id',c.id,'mes_origen',p_periodo,'signo',-1,'monto',greatest(0,c.monto+
        coalesce((select sum(case n.tipo when 'debito' then n.monto else -n.monto end)
          from alq.alq_nota n where n.cargo_id=c.id),0)-c.saldo_pendiente))
    from alq.alq_cargo c where c.propiedad_id=p_propiedad
      and c.deudor_parte_id=v_owner and c.acreedor_parte_id=v_admin
      and c.moneda=v_moneda and c.concepto<>'honorario_administracion'
      and c.vence_at::date>=p_periodo and c.vence_at::date<(p_periodo+interval '1 month')::date
      and c.saldo_pendiente<c.monto
  ) z;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'transaccion_id',t.id,'fecha',t.fecha,'direccion',t.direccion,'ambito',t.ambito,
    'monto',t.monto,'moneda',t.moneda,'medio',t.medio,'estado',t.estado)
    order by t.fecha,t.id),'[]'::jsonb) into v_movs
  from alq.alq_transaccion_caja t where t.id in(
    select distinct a.transaccion_id from alq.alq_aplicacion a join alq.alq_cargo c on c.id=a.cargo_id
    where c.propiedad_id=p_propiedad and c.deudor_parte_id=v_owner
      and c.acreedor_parte_id=v_admin and c.concepto<>'honorario_administracion'
      and c.vence_at::date>=p_periodo and c.vence_at::date<(p_periodo+interval '1 month')::date);
  v_cuenta:=coalesce((select pg_catalog.jsonb_agg(e.value order by e.ordinality)
    from pg_catalog.jsonb_array_elements(coalesce(v_c->'cuenta_propietario_administracion','[]'::jsonb))
      with ordinality e(value,ordinality)
    where e.value->>'tipo'<>'ajuste_periodos_anteriores'),'[]'::jsonb);
  if v_delta<>0 then v_cuenta:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'tipo','ajuste_periodos_anteriores','detalle','Movimientos de períodos anteriores registrados después de la última liquidación',
    'mes_origen',null,'signo',case when v_delta>0 then 1 else -1 end,'monto',abs(v_delta)))||v_cuenta; end if;
  v_cuenta:=v_cuenta||v_otros; v_cierre:=v_anterior_real+v_fee_mes+v_otros_mes;
  v_c:=pg_catalog.jsonb_set(v_c,'{saldo_apertura_admin}',pg_catalog.to_jsonb(v_apertura));
  v_c:=pg_catalog.jsonb_set(v_c,'{cuenta_propietario_administracion}',v_cuenta);
  v_c:=pg_catalog.jsonb_set(v_c,'{movimientos_reales}',coalesce(v_c->'movimientos_reales','[]'::jsonb)||v_movs);
  v_c:=pg_catalog.jsonb_set(v_c,'{saldo_cierre_admin}',pg_catalog.to_jsonb(v_cierre));
  v_sha:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_c::text,'UTF8'),'sha256'),'hex');
  return pg_catalog.jsonb_build_object('contenido',v_c,'contenido_sha256',v_sha,
    'saldo_apertura_admin',v_apertura,'saldo_cierre_admin',v_cierre,
    'propietario_email',v_r->>'propietario_email','version_documento',v_r->'version_documento',
    'correccion_de',p_corregir_id);
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
 'liquidacion_propietario_emitir','liquidacion_pdf_vincular','liquidacion_envio_registrar',
 'mora_proponer','mora_resolver','ajuste_contractual_aplicar','deposito_registrar',
 'contrato_cerrar_deposito'
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
    'liquidacion_pdf_vincular','liquidacion_envio_registrar',
    'mora_proponer','mora_resolver','ajuste_contractual_aplicar',
    'deposito_registrar','contrato_cerrar_deposito'
  ]::text[]
$fn$;

create or replace function alq_private.alq_f1a_tabla_permitida_operacion_v1(
  p_operacion text,p_tabla text)
returns boolean language sql immutable security definer set search_path=''
as $fn$
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
      'contrato_cerrar_deposito']::text[])
    when 'alq_deposito_liquidacion' then p_operacion=any(array[
      'deposito_liquidar','deposito_liquidar_y_devolver','contrato_cerrar_deposito']::text[])
    when 'alq_aplicacion_reversa' then p_operacion='reversa_con_reapertura'
    when 'alq_cargo' then p_operacion=any(array['cargo_manual_emitir','mes_normal_generar','mora_resolver']::text[])
    when 'alq_mora_propuesta' then p_operacion=any(array['mora_proponer','mora_resolver']::text[])
    when 'alq_contrato_version' then p_operacion='ajuste_contractual_aplicar'
    when 'alq_ajuste' then p_operacion='ajuste_contractual_aplicar'
    when 'alq_deposito' then p_operacion='deposito_registrar'
    when 'alq_contrato' then p_operacion='contrato_cerrar_deposito'
    when 'alq_conversion_moneda' then p_operacion=any(array['conversion_registrar','pago_multimoneda']::text[])
    when 'alq_rendicion' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    when 'alq_credito' then p_operacion='pago_comprobante_confirmar'
    when 'alq_deposito_liquidacion_linea' then p_operacion='deposito_liquidar_y_devolver'
    when 'alq_rendicion_linea' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    else false end
$fn$;

do $alq_f3_b3_patch_roots$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_f1a_raices_payload_snapshot_v1(text,jsonb)'::regprocedure);
  v_needle:=E'    when ''liquidacion_pdf_vincular'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_ROOT_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'    when ''mora_proponer'' then\n'
    '      select array_remove(array[c.propiedad_id],null),array_remove(array[c.contrato_id],null) into v_props,v_cons\n'
    '      from alq.alq_cargo c where c.id=nullif(p_payload->>''cargo_id'','''')::uuid;\n'
    '    when ''mora_resolver'' then\n'
    '      select array_remove(array[m.propiedad_id],null),array_remove(array[m.contrato_id],null) into v_props,v_cons\n'
    '      from alq.alq_mora_propuesta m where m.id=nullif(p_payload->>''propuesta_id'','''')::uuid;\n'
    '    when ''ajuste_contractual_aplicar'',''deposito_registrar'',''contrato_cerrar_deposito'' then\n'
    '      v_cons:=array_remove(array[nullif(p_payload->>''contrato_id'','''')::uuid],null);\n'
    '      select array_remove(array[c.propiedad_id],null) into v_props from alq.alq_contrato c\n'
    '      where c.id=nullif(p_payload->>''contrato_id'','''')::uuid;\n'
    '    when ''liquidacion_pdf_vincular'' then\n');
  execute v_new;
end
$alq_f3_b3_patch_roots$;

do $alq_f3_b3_patch_executor$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_needle:=E'  when ''liquidacion_pdf_vincular'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_EXECUTOR_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'  when ''mora_proponer'' then\n'
    '    v_result:=alq_private.alq_f3_b3_mora_proponer_aplicar_v1(p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''mora_resolver'' then\n'
    '    v_result:=alq_private.alq_f3_b3_mora_resolver_aplicar_v1(p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''ajuste_contractual_aplicar'' then\n'
    '    v_result:=alq_private.alq_f3_b3_ajuste_aplicar_v1(p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''deposito_registrar'' then\n'
    '    v_result:=alq_private.alq_f3_b3_deposito_registrar_v1(p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''contrato_cerrar_deposito'' then\n'
    '    v_result:=alq_private.alq_f3_b3_contrato_cerrar_deposito_v1(p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''liquidacion_pdf_vincular'' then\n');
  execute v_new;
end
$alq_f3_b3_patch_executor$;

revoke all on function alq_private.alq_f3_b3_mora_guard_v1() from public;
revoke all on function alq_private.alq_f3_b3_mora_proponer_aplicar_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b3_mora_resolver_aplicar_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b3_ajuste_aplicar_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b3_deposito_registrar_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b3_contrato_cerrar_deposito_v1(jsonb,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b2_derivar_base_v1(uuid,date,uuid,uuid) from public;
revoke all on function alq_private.alq_f3_b2_derivar_v1(uuid,date,uuid,uuid) from public;

do $alq_f3_b3_postcheck$
begin
  if pg_catalog.to_regclass('alq.alq_mora_propuesta') is null
     or pg_catalog.to_regclass('public.alq_v_deposito') is null
     or (select count(*) from unnest(alq_private.alq_operaciones_v1()) x where x in(
       'mora_proponer','mora_resolver','ajuste_contractual_aplicar','deposito_registrar',
       'contrato_cerrar_deposito'))<>5
     or position('alq_f3_b3_mora_proponer_aplicar_v1' in pg_catalog.pg_get_functiondef(
       'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure))=0
     or pg_catalog.to_regprocedure('alq_private.alq_f3_b2_derivar_base_v1(uuid,date,uuid,uuid)') is null then
    raise exception using errcode='P0001',message='ALQ_F3_B3_POSTCHECK_FALLO';
  end if;
end
$alq_f3_b3_postcheck$;
