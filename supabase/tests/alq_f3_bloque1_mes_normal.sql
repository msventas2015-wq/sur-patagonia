\set ON_ERROR_STOP on
begin;
set application_name='alq-f3-b1-regression';
set timezone='UTC';

-- Fixture puramente local. No usa nombres, correos ni datos reales.
insert into auth.users(id,email) values
  ('f3b10000-0000-4000-8000-000000000001','f3-b1-admin.invalid');
insert into alq.alq_parte(id,tipo_persona,nombre) values
  ('f3b10000-0000-4000-8000-000000000002','juridica','Administración piloto'),
  ('f3b10000-0000-4000-8000-000000000010','fisica','Propietaria piloto'),
  ('f3b10000-0000-4000-8000-000000000020','fisica','Inquilino piloto');
insert into alq.alq_parte_usuario(id,parte_id,auth_user_id,vigencia) values
  ('f3b10000-0000-4000-8000-000000000003',
   'f3b10000-0000-4000-8000-000000000002',
   'f3b10000-0000-4000-8000-000000000001',
   tstzrange('2025-01-01 00:00:00+00',null,'[)'));
insert into alq.alq_capacidad_admin(parte_usuario_id,capacidad,vigencia) values
  ('f3b10000-0000-4000-8000-000000000003','supervisor',
   tstzrange('2025-01-01 00:00:00+00',null,'[)'));
insert into alq.alq_propiedad(id,direccion,direccion_norm,ciudad,ciudad_norm,provincia) values
  ('f3b10000-0000-4000-8000-000000000030','Unidad piloto','unidad piloto',
   'Local','local','Río Negro');
insert into alq.alq_titularidad(id,propiedad_id,parte_id,vigencia) values
  ('f3b10000-0000-4000-8000-000000000031',
   'f3b10000-0000-4000-8000-000000000030',
   'f3b10000-0000-4000-8000-000000000010',
   tstzrange('2025-01-01 00:00:00+00',null,'[)'));
insert into alq.alq_contrato(id,propiedad_id,inquilino_parte_id,inicio,fin_pactado,estado) values
  ('f3b10000-0000-4000-8000-000000000040',
   'f3b10000-0000-4000-8000-000000000030',
   'f3b10000-0000-4000-8000-000000000020','2025-09-01','2026-08-31','vigente');
insert into alq.alq_contrato_version(id,contrato_id,vigencia,monto,moneda,
  dia_pago_desde,dia_pago_hasta,punitorio_pct_dia,punitorio_desde_dia,
  formula_punitorio_version,metodo_prorrateo,regla_redondeo,regla_pago_otra_moneda)
values('f3b10000-0000-4000-8000-000000000041',
  'f3b10000-0000-4000-8000-000000000040',
  tstzrange('2025-09-01 00:00:00+00','2026-09-01 00:00:00+00','[)'),
  450000,'ARS',1,10,0,0,'sin_mora_automatica','importe_pactado','centavos','prohibido');
insert into alq.alq_mandato(id,propiedad_id,titularidad_id,vigencia,estado) values
  ('f3b10000-0000-4000-8000-000000000050',
   'f3b10000-0000-4000-8000-000000000030',
   'f3b10000-0000-4000-8000-000000000031',
   tstzrange('2025-09-01 00:00:00+00',null,'[)'),'activo');
insert into alq.alq_mandato_version(id,mandato_id,vigencia,honorario_base,
  honorario_pct,honorario_minimo,honorario_fijo,incluye_punitorios,moneda)
values('f3b10000-0000-4000-8000-000000000051',
  'f3b10000-0000-4000-8000-000000000050',
  tstzrange('2025-09-01 00:00:00+00',null,'[)'),
  'devengado',0.08,0,0,false,'ARS');

insert into alq.alq_documento(id,tipo,path,sha256,mime,bytes,propiedad_id,audiencia) values
  ('f3b10000-0000-4000-8000-000000000101','comprobante_pago','local/pago-1.pdf',repeat('1',64),'application/pdf',10,'f3b10000-0000-4000-8000-000000000030','admin'),
  ('f3b10000-0000-4000-8000-000000000102','comprobante_pago','local/pago-2.pdf',repeat('2',64),'application/pdf',10,'f3b10000-0000-4000-8000-000000000030','admin'),
  ('f3b10000-0000-4000-8000-000000000103','comprobante_pago','local/pago-3.pdf',repeat('3',64),'application/pdf',10,'f3b10000-0000-4000-8000-000000000030','admin'),
  ('f3b10000-0000-4000-8000-000000000104','comprobante_pago','local/pago-4.pdf',repeat('4',64),'application/pdf',10,'f3b10000-0000-4000-8000-000000000030','admin');

select set_config('request.jwt.claim.sub','f3b10000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b10000-0000-4000-8000-000000000001','role','authenticated',
  'app_metadata',jsonb_build_object('rol','admin'))::text,false);

create or replace function pg_temp.alq_f3_b1_rpc(p_operacion text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_p jsonb; v_r jsonb;
begin
  v_p:=public.alq_admin_preparar(p_operacion,p_payload);
  v_r:=public.alq_admin_aplicar((v_p->>'request_id')::uuid,p_operacion,v_p->>'firma',p_payload);
  return v_r;
end
$fn$;

select pg_temp.alq_f3_b1_rpc('mes_normal_generar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'mes','2025-09-01','expensas_monto',60000));

do $checks_sep$
declare v_renta numeric; v_exp numeric; v_hon numeric;
begin
  select alquiler_monto,expensas_monto,honorario_monto into v_renta,v_exp,v_hon
  from alq.alq_mes_generado where contrato_id='f3b10000-0000-4000-8000-000000000040'
    and mes='2025-09-01';
  if (v_renta,v_exp,v_hon) is distinct from (450000::numeric,60000::numeric,36000::numeric)
     or (select count(*) from alq.alq_cargo where contrato_id='f3b10000-0000-4000-8000-000000000040')<>3 then
    raise exception 'ALQ_F3_B1_GENERACION_SEP_FALLO';
  end if;
end
$checks_sep$;

select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000101',
  'cargo_ids',(select jsonb_agg(id order by vence_at,id) from alq.alq_cargo
    where periodo_id=(select periodo_id from alq.alq_mes_generado
      where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-09-01')
      and deudor_parte_id='f3b10000-0000-4000-8000-000000000020'),
  'monto',510000,'fecha','2025-09-08 12:00:00+00','medio','transferencia_directa_al_propietario'));

-- El pago del inquilino no salda el honorario: el propietario todavía debe los 36.000.
-- Tampoco se acepta una confirmación sin un documento real de esa propiedad.
do $checks_fee_open_and_proof$
begin
  if (select saldo_pendiente from alq.alq_cargo
      where id=(select honorario_cargo_id from alq.alq_mes_generado
        where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-09-01'))<>36000 then
    raise exception 'ALQ_F3_B1_HONORARIO_NO_QUEDO_ABIERTO';
  end if;
  begin
    perform pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
      'propiedad_id','f3b10000-0000-4000-8000-000000000030',
      'contrato_id','f3b10000-0000-4000-8000-000000000040',
      'documento_id','f3b10000-0000-4000-8000-000000000199',
      'cargo_ids',(select jsonb_build_array(honorario_cargo_id) from alq.alq_mes_generado
        where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-09-01'),
      'monto',36000,'fecha','2025-09-30 12:00:00+00',
      'medio','transferencia_directa_al_propietario'));
    raise exception 'ALQ_F3_B1_PAGO_SIN_COMPROBANTE_ACEPTADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F3_B1_COMPROBANTE_REQUERIDO' then raise; end if;
  end;
  if (select count(*) from alq.alq_transaccion_caja)<>1 then
    raise exception 'ALQ_F3_B1_PAGO_SIN_COMPROBANTE_DEJO_EFECTO';
  end if;
end
$checks_fee_open_and_proof$;

select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000102',
  'cargo_ids',(select jsonb_build_array(honorario_cargo_id) from alq.alq_mes_generado
    where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-09-01'),
  'monto',36000,'fecha','2025-09-30 12:00:00+00','medio','transferencia_directa_al_propietario'));

do $checks_full$
begin
  if exists(select 1 from alq.alq_cargo
      where periodo_id=(select periodo_id from alq.alq_mes_generado
        where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-09-01')
        and saldo_pendiente<>0)
     or (select count(*) from alq.alq_pago_confirmado)<>2
     or exists(select 1 from alq.alq_pago_confirmado where documento_id is null) then
    raise exception 'ALQ_F3_B1_PAGO_TOTAL_FALLO';
  end if;
end
$checks_full$;

select pg_temp.alq_f3_b1_rpc('mes_normal_generar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'mes','2025-10-01','expensas_monto',60000));

select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000103',
  'cargo_ids',(select jsonb_agg(id order by vence_at,id) from alq.alq_cargo
    where periodo_id=(select periodo_id from alq.alq_mes_generado
      where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-10-01')
      and deudor_parte_id='f3b10000-0000-4000-8000-000000000020'),
  'monto',300000,'fecha','2025-10-08 12:00:00+00','medio','transferencia_directa_al_propietario'));

do $checks_partial$
begin
  if (select sum(saldo_pendiente) from alq.alq_cargo
      where periodo_id=(select periodo_id from alq.alq_mes_generado
        where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-10-01')
        and deudor_parte_id='f3b10000-0000-4000-8000-000000000020')<>210000
     or exists(select 1 from alq.alq_pago_confirmado
       where documento_id='f3b10000-0000-4000-8000-000000000103' and monto_credito<>0) then
    raise exception 'ALQ_F3_B1_PAGO_PARCIAL_FALLO';
  end if;
end
$checks_partial$;

select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000104',
  'cargo_ids',(select jsonb_agg(id order by vence_at,id) from alq.alq_cargo
    where periodo_id=(select periodo_id from alq.alq_mes_generado
      where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-10-01')
      and deudor_parte_id='f3b10000-0000-4000-8000-000000000020'
      and saldo_pendiente>0),
  'monto',400000,'fecha','2025-10-20 12:00:00+00','medio','transferencia_directa_al_propietario'));

select pg_temp.alq_f3_b1_rpc('mes_normal_generar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'mes','2025-11-01','expensas_monto',60000));

do $checks_credit$
declare v_credito numeric; v_aplicado numeric; v_deuda numeric; v_tx integer;
begin
  select coalesce(sum(saldo_pendiente),0) into v_credito from alq.alq_credito
    where contrato_id='f3b10000-0000-4000-8000-000000000040'
      and parte_id='f3b10000-0000-4000-8000-000000000020';
  select credito_aplicado into v_aplicado from alq.alq_mes_generado
    where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-11-01';
  select sum(saldo_pendiente) into v_deuda from alq.alq_cargo
    where periodo_id=(select periodo_id from alq.alq_mes_generado
      where contrato_id='f3b10000-0000-4000-8000-000000000040' and mes='2025-11-01')
      and deudor_parte_id='f3b10000-0000-4000-8000-000000000020';
  select count(*) into v_tx from alq.alq_transaccion_caja;
  if (v_credito,v_aplicado,v_deuda) is distinct from
     (0::numeric,190000::numeric,320000::numeric)
     or v_tx<>4 or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F3_B1_CREDITO_ARRASTRE_FALLO:%/%/%/%',v_credito,v_aplicado,v_deuda,v_tx;
  end if;
end
$checks_credit$;

-- El mismo comprobante y el mismo payload son replay: no crean otra transacción.
select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000104',
  'cargo_ids',(select to_jsonb(cargo_ids) from alq.alq_pago_confirmado
    where documento_id='f3b10000-0000-4000-8000-000000000104'),
  'monto',400000,'fecha','2025-10-20 12:00:00+00','medio','transferencia_directa_al_propietario'));

-- La misma lectura y el replay funcionan con el rol real de la pantalla (authenticated),
-- no solamente como dueño del fixture.
set role authenticated;
do $checks_authenticated_surface$
begin
  if (select count(*) from public.alq_v_mes_generado)<>3
     or (select count(*) from public.alq_v_pago_confirmado)<>4
     or (select count(*) from public.alq_v_credito)<>1
     or (select count(*) from public.alq_v_periodo)<>3 then
    raise exception 'ALQ_F3_B1_VISTAS_AUTHENTICATED_FALLO';
  end if;
end
$checks_authenticated_surface$;
select pg_temp.alq_f3_b1_rpc('pago_comprobante_confirmar',jsonb_build_object(
  'propiedad_id','f3b10000-0000-4000-8000-000000000030',
  'contrato_id','f3b10000-0000-4000-8000-000000000040',
  'documento_id','f3b10000-0000-4000-8000-000000000104',
  'cargo_ids',(select to_jsonb(cargo_ids) from public.alq_v_pago_confirmado
    where documento_id='f3b10000-0000-4000-8000-000000000104'),
  'monto',400000,'fecha','2025-10-20 12:00:00+00',
  'medio','transferencia_directa_al_propietario'));
reset role;

do $checks_replay_and_direct$
declare v_op uuid;
begin
  if (select count(*) from alq.alq_transaccion_caja)<>4 then
    raise exception 'ALQ_F3_B1_REPLAY_DUPLICO';
  end if;
  select operacion_id into v_op from alq.alq_mes_generado limit 1;
  begin
    insert into alq.alq_mes_generado(propiedad_id,contrato_id,periodo_id,mes,
      alquiler_cargo_id,honorario_cargo_id,administracion_parte_id,
      alquiler_monto,expensas_monto,honorario_monto,operacion_id)
    select propiedad_id,contrato_id,periodo_id,'2026-01-01',alquiler_cargo_id,
      honorario_cargo_id,administracion_parte_id,alquiler_monto,0,honorario_monto,v_op
    from alq.alq_mes_generado limit 1;
    raise exception 'ALQ_F3_B1_DML_DIRECTO_ACEPTADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F3_B1_DML_DIRECTO_PROHIBIDO' then raise; end if;
  end;
end
$checks_replay_and_direct$;

select 'ALQ_F3_B1_LOCAL_PASS|MES_NORMAL|PAGO_TOTAL|PAGO_PARCIAL|CREDITO_ARRASTRADO|HONORARIO_8_PCT|HONORARIO_ABIERTO|COMPROBANTE_OBLIGATORIO|SIN_COMPROBANTE_RECHAZADO' as receipt;

rollback;
