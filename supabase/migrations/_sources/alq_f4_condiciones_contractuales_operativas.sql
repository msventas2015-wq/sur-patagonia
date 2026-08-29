-- ALQ F4 · condiciones contractuales operativas
-- Corrige el motor ya instalado: prorrateo real de primer/ultimo mes,
-- calculo server-side de ajustes y bloqueo de generacion hasta aprobacion.
-- IPC: nivel general nacional (Datos Argentina / fuente primaria INDEC).
-- ICL: serie diaria 7988 de la API oficial BCRA v4.

begin;

do $$
begin
  if to_regprocedure('public.alq_admin_alta_integral(uuid,jsonb)') is null
     or to_regprocedure('alq_private.alq_f3_b1_mes_normal_aplicar_v1(jsonb,uuid,uuid)') is null
     or to_regprocedure('alq_private.alq_f3_b3_ajuste_aplicar_v1(jsonb,uuid,uuid)') is null
     or to_regclass('alq.alq_indice_observacion') is null then
    raise exception using errcode='P0001',message='ALQ_F4_CONDICIONES_BASE_INCOMPATIBLE';
  end if;
end
$$;

-- La importacion oficial es una operacion propia y trazable. No habilita
-- escrituras directas de clientes sobre el catalogo de observaciones.
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
    when 'alq_cargo' then p_operacion=any(array['cargo_manual_emitir','mes_normal_generar','mora_resolver']::text[])
    when 'alq_mora_propuesta' then p_operacion=any(array['mora_proponer','mora_resolver']::text[])
    when 'alq_contrato_version' then p_operacion=any(array['ajuste_contractual_aplicar','alta_integral']::text[])
    when 'alq_ajuste' then p_operacion='ajuste_contractual_aplicar'
    when 'alq_indice_observacion' then p_operacion='indice_observacion_importar'
    when 'alq_deposito' then p_operacion=any(array['deposito_registrar','alta_integral']::text[])
    when 'alq_contrato' then p_operacion=any(array['contrato_cerrar_deposito','alta_integral']::text[])
    when 'alq_conversion_moneda' then p_operacion=any(array['conversion_registrar','pago_multimoneda']::text[])
    when 'alq_rendicion' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    when 'alq_credito' then p_operacion='pago_comprobante_confirmar'
    when 'alq_deposito_liquidacion_linea' then p_operacion='deposito_liquidar_y_devolver'
    when 'alq_rendicion_linea' then p_operacion=any(array['rendicion_emitir','rendicion_corregir']::text[])
    else false end
$$;

revoke all on function alq_private.alq_f1a_tabla_permitida_operacion_v1(text,text)
  from public,anon,authenticated,service_role;

-- La mora usa exclusivamente la regla versionada del contrato. El operador
-- elige hasta que fecha calcular y luego decide aplicar o condonar, pero no
-- puede reemplazar desde el navegador ni el porcentaje ni la gracia pactados.
create or replace function alq_private.alq_f3_b3_mora_proponer_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_c alq.alq_cargo%rowtype;
  v_ct alq.alq_contrato%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_hasta date:=nullif(p_payload->>'calculada_hasta','')::date;
  v_pct_decimal numeric;
  v_pct_mostrado numeric;
  v_gracia integer;
  v_capital numeric;
  v_dias integer;
  v_monto numeric;
  v_id uuid;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k
       where k not in ('cargo_id','calculada_hasta'))
     or v_hasta is null then
    raise exception using errcode='P0001',message='ALQ_F4_MORA_PARAMETROS_INVALIDOS';
  end if;
  select * into v_c from alq.alq_cargo
  where id=nullif(p_payload->>'cargo_id','')::uuid for update;
  if not found or v_c.contrato_id is null then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_CARGO_INVALIDO';
  end if;
  select * into v_ct from alq.alq_contrato where id=v_c.contrato_id for update;
  if not found or v_c.deudor_parte_id<>v_ct.inquilino_parte_id then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_SOLO_INQUILINO';
  end if;
  if v_c.periodo_id is not null then
    select cv.* into v_cv
    from alq.alq_periodo p
    join alq.alq_contrato_version cv on cv.id=p.contrato_version_id
    where p.id=v_c.periodo_id and p.contrato_id=v_ct.id;
  else
    select * into v_cv from alq.alq_contrato_version
    where contrato_id=v_ct.id and vigencia @> v_c.vence_at
    order by lower(vigencia) desc,id desc limit 1;
  end if;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F4_MORA_VERSION_CONTRACTUAL_NO_EXISTE';
  end if;
  v_pct_decimal:=v_cv.punitorio_pct_dia;
  v_pct_mostrado:=v_pct_decimal*100;
  v_gracia:=v_cv.punitorio_desde_dia;
  if v_pct_decimal is null or v_pct_decimal<=0 or v_pct_mostrado>100
     or v_gracia is null or v_gracia<0
     or v_cv.formula_punitorio_version<>'simple_diaria_v1' then
    raise exception using errcode='P0001',message='ALQ_F4_MORA_NO_CONFIGURADA';
  end if;
  v_dias:=v_hasta-v_c.vence_at::date-v_gracia;
  if v_dias<=0 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_SIN_DIAS';
  end if;
  v_capital:=v_c.saldo_pendiente;
  if v_capital is null or v_capital<=0 then
    raise exception using errcode='P0001',message='ALQ_F4_MORA_CARGO_SIN_SALDO';
  end if;
  v_monto:=pg_catalog.round(v_capital*v_pct_decimal*v_dias,2);
  if v_monto<=0 then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_MONTO_CERO';
  end if;
  insert into alq.alq_mora_propuesta(propiedad_id,contrato_id,cargo_base_id,
    calculada_hasta,capital,porcentaje_diario,gracia_dias,dias_mora,monto_propuesto,
    formula_version,propuesta_por_parte_usuario_id,operacion_propuesta_id)
  values(v_c.propiedad_id,v_c.contrato_id,v_c.id,v_hasta,v_capital,v_pct_mostrado,
    v_gracia,v_dias,v_monto,v_cv.formula_punitorio_version,p_actor,p_operacion_id)
  returning id into v_id;
  return pg_catalog.jsonb_build_object(
    'propuesta_id',v_id,'cargo_id',v_c.id,'contrato_version_id',v_cv.id,
    'dias_mora',v_dias,'dias_gracia',v_gracia,'capital',v_capital,
    'porcentaje_diario',v_pct_mostrado,'monto_propuesto',v_monto,
    'formula_version',v_cv.formula_punitorio_version,'estado','propuesta');
end
$$;

revoke all on function alq_private.alq_f3_b3_mora_proponer_aplicar_v1(jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;

-- Resolver la mora aplica exactamente la decision humana. Si el mandato dice
-- que los punitorios integran la base del honorario, el mismo acto genera el
-- honorario porcentual correspondiente en la cuenta propietario ->
-- administracion. No se repiten aqui el minimo ni el fijo mensual.
create or replace function alq_private.alq_f3_b3_mora_resolver_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_p alq.alq_mora_propuesta%rowtype;
  v_c alq.alq_cargo%rowtype;
  v_mv alq.alq_mandato_version%rowtype;
  v_decision text:=coalesce(p_payload->>'decision','');
  v_motivo text:=pg_catalog.btrim(coalesce(p_payload->>'motivo',''));
  v_monto numeric;
  v_cargo uuid;
  v_vence date;
  v_admin uuid;
  v_honorario numeric:=0;
  v_honorario_cargo uuid;
  v_count integer;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k
       where k not in ('propuesta_id','decision','motivo','monto_final','vence')) then
    raise exception using errcode='P0001',message='ALQ_F4_MORA_RESOLUCION_PARAMETROS_INVALIDOS';
  end if;
  select * into v_p from alq.alq_mora_propuesta
  where id=nullif(p_payload->>'propuesta_id','')::uuid for update;
  if not found or v_p.estado<>'propuesta' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_PROPUESTA_NO_DISPONIBLE';
  end if;
  if v_decision not in ('aplicar','condonar') or v_motivo='' then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_DECISION_INVALIDA';
  end if;
  select * into v_c from alq.alq_cargo where id=v_p.cargo_base_id for update;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_CARGO_INVALIDO';
  end if;
  if v_decision='aplicar' then
    v_monto:=coalesce(nullif(p_payload->>'monto_final','')::numeric,v_p.monto_propuesto);
    v_vence:=coalesce(nullif(p_payload->>'vence','')::date,v_p.calculada_hasta);
    if v_monto<=0 then
      raise exception using errcode='P0001',message='ALQ_F3_B3_MORA_MONTO_INVALIDO';
    end if;
    insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
      acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
      snapshot_regla,saldo_pendiente)
    values(v_c.propiedad_id,v_c.contrato_id,v_c.periodo_id,v_c.deudor_parte_id,
      v_c.acreedor_parte_id,'externa','mora',v_c.moneda,v_monto,
      v_vence::timestamptz,'admin',p_operacion_id,
      pg_catalog.jsonb_build_object('version',2,'mora_propuesta_id',v_p.id,
        'cargo_base_id',v_c.id,'capital',v_p.capital,
        'porcentaje_diario',v_p.porcentaje_diario,'dias_mora',v_p.dias_mora,
        'formula_version',v_p.formula_version,'motivo',v_motivo),v_monto)
    returning id into v_cargo;

    select count(*),(array_agg(mv.id order by mv.id))[1]
      into v_count,v_mv.id
    from alq.alq_mandato m
    join alq.alq_mandato_version mv on mv.mandato_id=m.id
    where m.propiedad_id=v_c.propiedad_id and m.estado='activo'
      and v_p.calculada_hasta::timestamptz<@m.vigencia
      and v_p.calculada_hasta::timestamptz<@mv.vigencia;
    if v_count<>1 then
      raise exception using errcode='P0001',message='ALQ_F4_MORA_MANDATO_VERSION_AMBIGUA';
    end if;
    select * into v_mv from alq.alq_mandato_version where id=v_mv.id;
    if v_mv.incluye_punitorios then
      if v_mv.moneda<>v_c.moneda then
        raise exception using errcode='P0001',message='ALQ_F4_MORA_HONORARIO_MONEDA_INVALIDA';
      end if;
      select pu.parte_id into v_admin from alq.alq_parte_usuario pu where pu.id=p_actor;
      if v_admin is null then
        raise exception using errcode='P0001',message='ALQ_F3_B1_ADMIN_SIN_PARTE';
      end if;
      v_honorario:=pg_catalog.round(v_monto*v_mv.honorario_pct,2);
      if v_honorario>0 then
        insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,
          deudor_parte_id,acreedor_parte_id,ambito,concepto,moneda,monto,
          vence_at,origen,operacion_id,snapshot_regla,saldo_pendiente)
        values(v_c.propiedad_id,v_c.contrato_id,v_c.periodo_id,
          v_c.acreedor_parte_id,v_admin,'externa','honorario_administracion',
          v_mv.moneda,v_honorario,v_vence::timestamptz,'motor',p_operacion_id,
          pg_catalog.jsonb_build_object('version',2,'clase','honorario_punitorio',
            'mora_propuesta_id',v_p.id,'cargo_mora_id',v_cargo,
            'base_punitorio',v_monto,'honorario_pct',v_mv.honorario_pct,
            'incluye_punitorios',true),v_honorario)
        returning id into v_honorario_cargo;
      end if;
    end if;
  else
    v_monto:=0;
  end if;
  update alq.alq_mora_propuesta
  set estado=case v_decision when 'aplicar' then 'aplicada' else 'condonada' end,
    monto_resuelto=v_monto,motivo_resolucion=v_motivo,cargo_mora_id=v_cargo,
    resuelta_por_parte_usuario_id=p_actor,resuelta_at=pg_catalog.clock_timestamp(),
    operacion_resolucion_id=p_operacion_id
  where id=v_p.id;
  return pg_catalog.jsonb_build_object(
    'propuesta_id',v_p.id,
    'estado',case v_decision when 'aplicar' then 'aplicada' else 'condonada' end,
    'monto_resuelto',v_monto,'cargo_mora_id',v_cargo,
    'honorario_punitorio_monto',v_honorario,
    'honorario_punitorio_cargo_id',v_honorario_cargo);
end
$$;

revoke all on function alq_private.alq_f3_b3_mora_resolver_aplicar_v1(jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;

-- Una conversion ligada a un cargo sólo es válida si la versión contractual
-- vigente para la fecha del pago la permite y la fuente coincide exactamente
-- con la pactada. La pantalla no es la autoridad de esta decisión.
create function alq_private.alq_f4_conversion_contractual_check_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_regla text;
  v_fuente text;
  v_moneda text;
  v_count integer;
begin
  if new.cargo_id is null or new.conversion_id is null then return null; end if;
  select count(*),(array_agg(cv.regla_pago_otra_moneda order by cv.id))[1],
    (array_agg(cv.fuente_conversion order by cv.id))[1],
    (array_agg(cv.moneda order by cv.id))[1]
    into v_count,v_regla,v_fuente,v_moneda
  from alq.alq_cargo c
  join alq.alq_transaccion_caja t on t.id=new.transaccion_id
  join alq.alq_contrato_version cv on cv.contrato_id=c.contrato_id
    and t.fecha<@cv.vigencia
  where c.id=new.cargo_id;
  if v_count<>1 or v_regla<>'tasa_pactada' then
    raise exception using errcode='P0001',message='ALQ_F4_PAGO_OTRA_MONEDA_NO_PERMITIDO';
  end if;
  if v_moneda<>new.moneda_destino or v_fuente is null or v_fuente<>(
      select cv.fuente from alq.alq_conversion_moneda cv where cv.id=new.conversion_id) then
    raise exception using errcode='P0001',message='ALQ_F4_PAGO_OTRA_MONEDA_FUENTE_NO_COINCIDE';
  end if;
  return null;
end
$$;

revoke all on function alq_private.alq_f4_conversion_contractual_check_v1()
  from public,anon,authenticated,service_role;

create constraint trigger alq_aplicacion_conversion_contractual_f4_ct
after insert or update of cargo_id,conversion_id,transaccion_id,
  moneda_destino on alq.alq_aplicacion
deferrable initially deferred for each row
execute function alq_private.alq_f4_conversion_contractual_check_v1();

-- La pantalla no distribuye conversiones con aritmetica JavaScript. Esta
-- calculadora toma el importe realmente recibido, la tasa confirmada por la
-- administracion y los cargos elegidos, y devuelve aplicaciones que cierran
-- exactamente en seis decimales. Cada renglon conserva su conversion propia.
create or replace function alq_private.alq_f4_pago_otra_moneda_previsualizar_v1(
  p_cargo_ids uuid[],p_moneda_origen text,p_monto_origen numeric,
  p_tasa numeric,p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_primero alq.alq_cargo%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_c alq.alq_cargo%rowtype;
  v_total_saldo numeric:=0;
  v_origen_restante numeric;
  v_origen numeric;
  v_destino numeric;
  v_destino_total numeric:=0;
  v_n integer;
  v_i integer:=0;
  v_apps jsonb:='[]'::jsonb;
begin
  if p_cargo_ids is null or pg_catalog.cardinality(p_cargo_ids)=0
     or pg_catalog.cardinality(p_cargo_ids)>100
     or p_moneda_origen is null or p_moneda_origen!~'^[A-Z]{3}$'
     or p_monto_origen is null or p_monto_origen<=0
     or p_tasa is null or p_tasa<=0 or p_fecha is null
     or (select count(*) from pg_catalog.unnest(p_cargo_ids) x)
        is distinct from (select count(distinct x) from pg_catalog.unnest(p_cargo_ids) x) then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_PARAMETROS_INVALIDOS';
  end if;
  select * into v_primero from alq.alq_cargo where id=p_cargo_ids[1];
  if not found or v_primero.contrato_id is null or v_primero.saldo_pendiente<=0 then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_CARGO_INVALIDO';
  end if;
  if p_moneda_origen=v_primero.moneda then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_MONEDAS_IGUALES';
  end if;
  if exists(
      select 1 from pg_catalog.unnest(p_cargo_ids) with ordinality x(id,ord)
      left join alq.alq_cargo c on c.id=x.id
      where c.id is null or c.contrato_id is distinct from v_primero.contrato_id
        or c.deudor_parte_id is distinct from v_primero.deudor_parte_id
        or c.acreedor_parte_id is distinct from v_primero.acreedor_parte_id
        or c.moneda is distinct from v_primero.moneda or c.saldo_pendiente<=0) then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_CARGOS_INCOMPATIBLES';
  end if;
  select * into v_cv from alq.alq_contrato_version
  where contrato_id=v_primero.contrato_id and p_fecha::timestamptz<@vigencia
  order by lower(vigencia) desc,id desc limit 1;
  if not found or v_cv.regla_pago_otra_moneda<>'tasa_pactada'
     or pg_catalog.btrim(coalesce(v_cv.fuente_conversion,''))='' then
    raise exception using errcode='P0001',message='ALQ_F4_PAGO_OTRA_MONEDA_NO_PERMITIDO';
  end if;
  select count(*),sum(c.saldo_pendiente) into v_n,v_total_saldo
  from pg_catalog.unnest(p_cargo_ids) x(id)
  join alq.alq_cargo c on c.id=x.id;
  if alq_private.alq_redondear_v1(p_monto_origen*p_tasa,v_cv.regla_redondeo)>v_total_saldo then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_SUPERA_SALDO';
  end if;

  v_origen_restante:=pg_catalog.round(p_monto_origen,6);
  for v_c in
    select c.* from pg_catalog.unnest(p_cargo_ids) with ordinality x(id,ord)
    join alq.alq_cargo c on c.id=x.id order by x.ord
  loop
    v_i:=v_i+1;
    if v_i=v_n then
      v_origen:=v_origen_restante;
    else
      v_origen:=pg_catalog.round(
        p_monto_origen*v_c.saldo_pendiente/v_total_saldo,6);
      v_origen:=least(v_origen,v_origen_restante);
    end if;
    v_destino:=alq_private.alq_redondear_v1(
      v_origen*p_tasa,v_cv.regla_redondeo);
    if v_origen<=0 or v_destino<=0 or v_destino>v_c.saldo_pendiente then
      raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_DISTRIBUCION_INVALIDA';
    end if;
    v_apps:=v_apps||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'cargo_id',v_c.id,'importe_origen',v_origen,
      'moneda_origen',p_moneda_origen,'importe_destino',v_destino,
      'moneda_destino',v_c.moneda,'conversion',pg_catalog.jsonb_build_object(
        'importe_origen',v_origen,'moneda_origen',p_moneda_origen,
        'importe_destino',v_destino,'moneda_destino',v_c.moneda,
        'tasa',p_tasa,'fuente',v_cv.fuente_conversion,
        'fecha',(p_fecha::text||'T12:00:00Z')::timestamptz,
        'regla_redondeo',v_cv.regla_redondeo)));
    v_origen_restante:=v_origen_restante-v_origen;
    v_destino_total:=v_destino_total+v_destino;
  end loop;
  if v_origen_restante<>0 or v_destino_total<=0 or v_destino_total>v_total_saldo then
    raise exception using errcode='P0001',message='ALQ_F4_CONVERSION_DISTRIBUCION_INVALIDA';
  end if;
  return pg_catalog.jsonb_build_object(
    'estado','listo','contrato_id',v_primero.contrato_id,
    'moneda_origen',p_moneda_origen,'monto_origen',pg_catalog.round(p_monto_origen,6),
    'moneda_destino',v_primero.moneda,'monto_destino',v_destino_total,
    'tasa',p_tasa,'fuente',v_cv.fuente_conversion,
    'regla_redondeo',v_cv.regla_redondeo,'fecha',p_fecha,
    'aplicaciones',v_apps);
end
$$;

revoke all on function alq_private.alq_f4_pago_otra_moneda_previsualizar_v1(
  uuid[],text,numeric,numeric,date) from public,anon,authenticated,service_role;

create or replace function public.alq_admin_pago_otra_moneda_previsualizar(
  p_cargo_ids uuid[],p_moneda_origen text,p_monto_origen numeric,
  p_tasa numeric,p_fecha date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform alq_private.alq_actor_v1(true);
  return alq_private.alq_f4_pago_otra_moneda_previsualizar_v1(
    p_cargo_ids,p_moneda_origen,p_monto_origen,p_tasa,p_fecha);
end
$$;

revoke all on function public.alq_admin_pago_otra_moneda_previsualizar(
  uuid[],text,numeric,numeric,date) from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_pago_otra_moneda_previsualizar(
  uuid[],text,numeric,numeric,date) to authenticated;

create or replace function alq_private.alq_f4_ajuste_previsualizar_v1(
  p_contrato_id uuid,p_vigente_desde date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_ct alq.alq_contrato%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_serie alq.alq_indice_serie%rowtype;
  v_base alq.alq_indice_observacion%rowtype;
  v_final alq.alq_indice_observacion%rowtype;
  v_due date;
  v_months integer;
  v_base_desde date;
  v_base_hasta date;
  v_final_desde date;
  v_final_hasta date;
  v_raw numeric;
  v_resultado numeric;
  v_formula text;
  v_estado text;
  v_result jsonb;
begin
  select * into v_ct from alq.alq_contrato where id=p_contrato_id;
  if not found or v_ct.estado not in ('vigente','continuacion_legal') then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_CONTRATO_NO_VIGENTE';
  end if;
  select * into v_cv from alq.alq_contrato_version
  where contrato_id=v_ct.id order by lower(vigencia) desc,id desc limit 1;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_VERSION_NO_EXISTE';
  end if;
  if v_cv.frecuencia_ajuste is null
     or (v_cv.pct_fijo is null and v_cv.indice_serie_id is null) then
    v_result:=pg_catalog.jsonb_build_object(
      'estado','sin_ajuste','contrato_id',v_ct.id,'contrato_version_base_id',v_cv.id,
      'monto_anterior',v_cv.monto,'moneda',v_cv.moneda);
    return v_result||pg_catalog.jsonb_build_object('preview_sha256',
      pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_result::text,'UTF8'),'sha256'),'hex'));
  end if;
  if extract(day from v_cv.frecuencia_ajuste)<>0
     or extract(hour from v_cv.frecuencia_ajuste)<>0
     or extract(minute from v_cv.frecuencia_ajuste)<>0
     or extract(second from v_cv.frecuencia_ajuste)<>0 then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_FRECUENCIA_NO_MENSUAL';
  end if;
  v_months:=extract(year from v_cv.frecuencia_ajuste)::integer*12
    +extract(month from v_cv.frecuencia_ajuste)::integer;
  if v_months<=0 then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_FRECUENCIA_INVALIDA';
  end if;
  v_due:=pg_catalog.date_trunc('month',lower(v_cv.vigencia)+v_cv.frecuencia_ajuste)::date;
  if p_vigente_desde is not null and p_vigente_desde<>v_due then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_FECHA_NO_CONTRACTUAL';
  end if;
  if exists(select 1 from alq.alq_mes_generado where contrato_id=v_ct.id and mes>=v_due) then
    v_estado:='bloqueado_mes_generado';
  elsif v_cv.pct_fijo is not null then
    v_raw:=v_cv.monto*(1+v_cv.pct_fijo);
    v_resultado:=alq_private.alq_redondear_v1(v_raw,v_cv.regla_redondeo);
    v_formula:='pct_fijo_v1';
    v_estado:='listo';
  else
    select * into v_serie from alq.alq_indice_serie where id=v_cv.indice_serie_id;
    if not found then
      raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_SERIE_NO_EXISTE';
    end if;
    if v_serie.granularidad='diaria' then
      v_base_desde:=lower(v_cv.vigencia)::date;
      v_base_hasta:=v_base_desde+1;
      v_final_desde:=v_due;
      v_final_hasta:=v_due+1;
    elsif v_serie.granularidad='mensual' then
      -- Un ajuste trimestral compara el nivel del mes anterior al inicio con
      -- el nivel del mes anterior a la vigencia nueva. El cociente compone,
      -- no suma, las variaciones mensuales.
      v_base_desde:=pg_catalog.date_trunc('month',lower(v_cv.vigencia)-interval '1 month')::date;
      v_base_hasta:=(v_base_desde+interval '1 month')::date;
      v_final_desde:=pg_catalog.date_trunc('month',v_due-interval '1 month')::date;
      v_final_hasta:=(v_final_desde+interval '1 month')::date;
    else
      raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_GRANULARIDAD_NO_OPERATIVA';
    end if;
    select * into v_base from alq.alq_indice_observacion
    where serie_id=v_serie.id and periodo=pg_catalog.daterange(v_base_desde,v_base_hasta,'[)')
    order by fecha_descarga desc,id desc limit 1;
    select * into v_final from alq.alq_indice_observacion
    where serie_id=v_serie.id and periodo=pg_catalog.daterange(v_final_desde,v_final_hasta,'[)')
    order by fecha_descarga desc,id desc limit 1;
    if v_base.id is null or v_final.id is null then
      v_estado:='faltan_datos';
    elsif v_base.valor<=0 or v_final.valor<=0 then
      raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_INDICE_NO_POSITIVO';
    else
      v_raw:=v_cv.monto*v_final.valor/v_base.valor;
      v_resultado:=alq_private.alq_redondear_v1(v_raw,v_cv.regla_redondeo);
      v_formula:=case
        when pg_catalog.upper(v_serie.codigo)='IPC' then 'indice_ipc_nivel_general_v1'
        when pg_catalog.upper(v_serie.codigo)='ICL' then 'indice_icl_bcra_v1'
        else 'indice_personalizado_v1' end;
      v_estado:='listo';
    end if;
  end if;
  v_result:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'estado',v_estado,'contrato_id',v_ct.id,'contrato_version_base_id',v_cv.id,
    'vigente_desde',v_due,'frecuencia_meses',v_months,'monto_anterior',v_cv.monto,
    'moneda',v_cv.moneda,'regla_redondeo',v_cv.regla_redondeo,
    'pct_fijo',v_cv.pct_fijo,'indice_serie_id',v_cv.indice_serie_id,
    'indice_organismo',v_serie.organismo,'indice_codigo',v_serie.codigo,
    'indice_granularidad',v_serie.granularidad,
    'periodo_base_desde',v_base_desde,'periodo_base_hasta_exclusivo',v_base_hasta,
    'periodo_final_desde',v_final_desde,'periodo_final_hasta_exclusivo',v_final_hasta,
    'observacion_base_id',v_base.id,'observacion_base_valor',v_base.valor,
    'observacion_base_fuente',v_base.fuente_url,
    'observacion_final_id',v_final.id,'observacion_final_valor',v_final.valor,
    'observacion_final_fuente',v_final.fuente_url,
    'formula_version',v_formula,'resultado_sin_redondear',v_raw,
    'resultado_final',v_resultado));
  return v_result||pg_catalog.jsonb_build_object('preview_sha256',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_result::text,'UTF8'),'sha256'),'hex'));
end
$$;

revoke all on function alq_private.alq_f4_ajuste_previsualizar_v1(uuid,date)
  from public,anon,authenticated,service_role;

create or replace function public.alq_admin_ajuste_previsualizar(
  p_contrato_id uuid,p_vigente_desde date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform alq_private.alq_actor_v1(true);
  return alq_private.alq_f4_ajuste_previsualizar_v1(p_contrato_id,p_vigente_desde);
end
$$;

revoke all on function public.alq_admin_ajuste_previsualizar(uuid,date)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_ajuste_previsualizar(uuid,date) to authenticated;

-- Una sola calculadora pura alimenta tanto la proforma del alta (cuando el
-- contrato todavia no existe) como la generacion de meses ya persistidos.
-- Asi la pantalla no replica formulas financieras en JavaScript.
create or replace function alq_private.alq_f4_prorrateo_calcular_v1(
  p_monto numeric,p_inicio date,p_fin_inclusive date,p_mes date,
  p_metodo text,p_redondeo text,p_honorario_pct numeric,
  p_honorario_minimo numeric,p_honorario_fijo numeric
)
returns jsonb
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_mes_fin date;
  v_activo_desde date;
  v_activo_hasta date;
  v_dias_mes integer;
  v_numerador integer;
  v_denominador integer;
  v_raw numeric;
  v_alquiler numeric;
  v_honorario numeric;
begin
  if p_monto is null or p_monto<=0 or p_inicio is null
     or p_mes is null or extract(day from p_mes)::integer<>1
     or (p_fin_inclusive is not null and p_fin_inclusive<p_inicio)
     or p_metodo is null
     or p_metodo not in ('dias_reales','base_30','importe_pactado')
     or p_redondeo is null or p_redondeo not in ('centavos','entero')
     or p_honorario_pct is null or p_honorario_pct<0
     or p_honorario_minimo is null or p_honorario_minimo<0
     or p_honorario_fijo is null or p_honorario_fijo<0 then
    raise exception using errcode='P0001',message='ALQ_F4_PRORRATEO_PARAMETROS_INVALIDOS';
  end if;
  v_mes_fin:=(p_mes+interval '1 month')::date;
  v_activo_desde:=greatest(p_mes,p_inicio);
  v_activo_hasta:=least(v_mes_fin-1,coalesce(p_fin_inclusive,'infinity'::date));
  if v_activo_desde>v_activo_hasta then
    raise exception using errcode='P0001',message='ALQ_F4_MES_FUERA_DEL_CONTRATO';
  end if;
  v_dias_mes:=extract(day from v_mes_fin-1)::integer;
  if v_activo_desde=p_mes and v_activo_hasta=v_mes_fin-1 then
    v_numerador:=v_dias_mes;v_denominador:=v_dias_mes;v_raw:=p_monto;
  elsif p_metodo='dias_reales' then
    v_numerador:=v_activo_hasta-v_activo_desde+1;v_denominador:=v_dias_mes;
    v_raw:=p_monto*v_numerador/v_denominador;
  elsif p_metodo='base_30' then
    v_numerador:=(case when v_activo_hasta=v_mes_fin-1 then 30
      else least(extract(day from v_activo_hasta)::integer,30) end)
      -least(extract(day from v_activo_desde)::integer,30)+1;
    v_denominador:=30;v_raw:=p_monto*v_numerador/v_denominador;
  else
    v_numerador:=1;v_denominador:=1;v_raw:=p_monto;
  end if;
  v_alquiler:=alq_private.alq_redondear_v1(v_raw,p_redondeo);
  -- Regla comercial: el honorario se devenga sobre el alquiler mensual
  -- contractual completo, aun cuando el alquiler del primer/ultimo mes sea
  -- prorrateado o el inquilino todavia no haya pagado.
  v_honorario:=greatest(pg_catalog.round(p_monto*p_honorario_pct,2),
    p_honorario_minimo)+p_honorario_fijo;
  return pg_catalog.jsonb_build_object(
    'mes',p_mes,'activo_desde',v_activo_desde,
    'activo_hasta_inclusive',v_activo_hasta,'metodo_prorrateo',p_metodo,
    'regla_redondeo',p_redondeo,'numerador',v_numerador,
    'denominador',v_denominador,'alquiler_contractual',p_monto,
    'alquiler_sin_redondear',v_raw,'alquiler_monto',v_alquiler,
    'honorario_monto',v_honorario);
end
$$;

revoke all on function alq_private.alq_f4_prorrateo_calcular_v1(
  numeric,date,date,date,text,text,numeric,numeric,numeric)
  from public,anon,authenticated,service_role;

create or replace function public.alq_admin_alta_proforma(
  p_monto numeric,p_inicio date,p_fin_inclusive date,p_mes date,
  p_metodo text,p_redondeo text,p_honorario_pct numeric,
  p_honorario_minimo numeric default 0,p_honorario_fijo numeric default 0,
  p_expensas numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  perform alq_private.alq_actor_v1(true);
  if p_expensas is null or p_expensas<0 then
    raise exception using errcode='P0001',message='ALQ_F4_PROFORMA_EXPENSAS_INVALIDAS';
  end if;
  v_result:=alq_private.alq_f4_prorrateo_calcular_v1(
    p_monto,p_inicio,p_fin_inclusive,p_mes,p_metodo,p_redondeo,
    p_honorario_pct,p_honorario_minimo,p_honorario_fijo);
  return v_result||pg_catalog.jsonb_build_object(
    'estado','listo','expensas_monto',p_expensas,
    'obligaciones_inquilino',(v_result->>'alquiler_monto')::numeric+p_expensas);
end
$$;

revoke all on function public.alq_admin_alta_proforma(
  numeric,date,date,date,text,text,numeric,numeric,numeric,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_alta_proforma(
  numeric,date,date,date,text,text,numeric,numeric,numeric,numeric)
  to authenticated;

-- Permite resolver una respuesta de red ambigua del alta sin repetirla con
-- otro request_id ni guardar datos personales del formulario en el navegador.
create or replace function public.alq_admin_alta_estado(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=alq_private.alq_actor_v1(true);
  v_op alq.alq_operacion%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode='P0001',message='ALQ_F4_ALTA_REQUEST_REQUERIDO';
  end if;
  select * into v_op from alq.alq_operacion where request_id=p_request_id;
  if not found then return pg_catalog.jsonb_build_object('estado','ausente'); end if;
  if v_op.actor_parte_usuario_id<>v_actor or v_op.operacion<>'alta_integral' then
    raise exception using errcode='42501',message='ALQ_F4_ALTA_ESTADO_NO_AUTORIZADO';
  end if;
  return pg_catalog.jsonb_build_object('estado',v_op.estado,'resultado',v_op.resultado);
end
$$;

revoke all on function public.alq_admin_alta_estado(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_alta_estado(uuid) to authenticated;

create or replace function alq_private.alq_f4_mes_previsualizar_v1(
  p_propiedad_id uuid,p_contrato_id uuid,p_mes date,p_expensas numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_ct alq.alq_contrato%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_mv alq.alq_mandato_version%rowtype;
  v_mes_fin date;
  v_activo_desde date;
  v_activo_hasta date;
  v_fin_contrato date;
  v_numerador integer;
  v_denominador integer;
  v_vence date;
  v_raw numeric;
  v_alquiler numeric;
  v_honorario numeric;
  v_count integer;
  v_titular uuid;
  v_ajuste jsonb;
  v_calculo jsonb;
  v_requiere boolean:=false;
begin
  if p_mes is null or p_mes<>pg_catalog.date_trunc('month',p_mes)::date
     or p_expensas is null or p_expensas<0 then
    raise exception using errcode='P0001',message='ALQ_F4_MES_PREVIEW_PARAMETROS_INVALIDOS';
  end if;
  select * into v_ct from alq.alq_contrato where id=p_contrato_id;
  if not found or v_ct.propiedad_id<>p_propiedad_id
     or v_ct.estado not in ('vigente','continuacion_legal') then
    raise exception using errcode='P0001',message='ALQ_F4_MES_PREVIEW_CONTRATO_INVALIDO';
  end if;
  v_mes_fin:=(p_mes+interval '1 month')::date;
  v_fin_contrato:=least(coalesce(v_ct.fin_efectivo,'infinity'::date),
    coalesce(v_ct.fin_pactado,'infinity'::date));
  v_activo_desde:=greatest(p_mes,v_ct.inicio);
  v_activo_hasta:=least(v_mes_fin-1,v_fin_contrato);
  if v_activo_desde>v_activo_hasta then
    raise exception using errcode='P0001',message='ALQ_F4_MES_FUERA_DEL_CONTRATO';
  end if;
  select count(*),(array_agg(cv.id order by cv.id))[1] into v_count,v_cv.id
  from alq.alq_contrato_version cv
  where cv.contrato_id=v_ct.id and v_activo_desde::timestamptz<@cv.vigencia;
  if v_count<>1 then
    raise exception using errcode='P0001',message='ALQ_F4_MES_VERSION_AMBIGUA';
  end if;
  select * into v_cv from alq.alq_contrato_version where id=v_cv.id;
  v_ajuste:=alq_private.alq_f4_ajuste_previsualizar_v1(v_ct.id,null);
  if (v_ajuste->>'vigente_desde') is not null
     and p_mes>=(v_ajuste->>'vigente_desde')::date then
    v_requiere:=true;
  end if;
  select count(*),(array_agg(t.parte_id order by t.parte_id))[1] into v_count,v_titular
  from alq.alq_titularidad t
  where t.propiedad_id=p_propiedad_id and v_activo_desde::timestamptz<@t.vigencia;
  if v_count<>1 then
    raise exception using errcode='P0001',message='ALQ_F4_MES_TITULAR_AMBIGUO';
  end if;
  select count(*),(array_agg(mv.id order by mv.id))[1] into v_count,v_mv.id
  from alq.alq_mandato m join alq.alq_mandato_version mv on mv.mandato_id=m.id
  where m.propiedad_id=p_propiedad_id and m.estado='activo'
    and v_activo_desde::timestamptz<@m.vigencia
    and v_activo_desde::timestamptz<@mv.vigencia;
  if v_count<>1 then
    raise exception using errcode='P0001',message='ALQ_F4_MES_MANDATO_VERSION_AMBIGUA';
  end if;
  select * into v_mv from alq.alq_mandato_version where id=v_mv.id;
  if v_mv.honorario_base<>'devengado' or v_mv.moneda<>v_cv.moneda then
    raise exception using errcode='P0001',message='ALQ_F4_MES_HONORARIO_CONFIG_INVALIDA';
  end if;
  v_calculo:=alq_private.alq_f4_prorrateo_calcular_v1(
    v_cv.monto,v_ct.inicio,v_fin_contrato,p_mes,v_cv.metodo_prorrateo,
    v_cv.regla_redondeo,v_mv.honorario_pct,v_mv.honorario_minimo,
    v_mv.honorario_fijo);
  v_numerador:=(v_calculo->>'numerador')::integer;
  v_denominador:=(v_calculo->>'denominador')::integer;
  v_raw:=(v_calculo->>'alquiler_sin_redondear')::numeric;
  v_alquiler:=(v_calculo->>'alquiler_monto')::numeric;
  v_honorario:=(v_calculo->>'honorario_monto')::numeric;
  -- Si el contrato empieza despues del dia habitual de pago, el primer
  -- vencimiento no puede quedar antes de que el contrato exista.
  v_vence:=greatest(v_activo_desde,p_mes+least(v_cv.dia_pago_hasta,
    extract(day from (v_mes_fin-1))::integer)-1);
  return pg_catalog.jsonb_build_object(
    'estado',case when v_requiere then 'ajuste_requerido' else 'listo' end,
    'propiedad_id',p_propiedad_id,'contrato_id',v_ct.id,'contrato_version_id',v_cv.id,
    'mandato_version_id',v_mv.id,'titular_parte_id',v_titular,'mes',p_mes,
    'activo_desde',v_activo_desde,'activo_hasta_inclusive',v_activo_hasta,
    'metodo_prorrateo',v_cv.metodo_prorrateo,'regla_redondeo',v_cv.regla_redondeo,
    'numerador',v_numerador,'denominador',v_denominador,
    'alquiler_contractual',v_cv.monto,'alquiler_sin_redondear',v_raw,
    'alquiler_monto',v_alquiler,'expensas_monto',p_expensas,
    'honorario_monto',v_honorario,'vence_at',v_vence,'moneda',v_cv.moneda,
    'ajuste_requerido',v_requiere,'ajuste',v_ajuste);
end
$$;

revoke all on function alq_private.alq_f4_mes_previsualizar_v1(uuid,uuid,date,numeric)
  from public,anon,authenticated,service_role;

create or replace function public.alq_admin_mes_previsualizar(
  p_propiedad_id uuid,p_contrato_id uuid,p_mes date,p_expensas numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform alq_private.alq_actor_v1(true);
  return alq_private.alq_f4_mes_previsualizar_v1(
    p_propiedad_id,p_contrato_id,p_mes,p_expensas);
end
$$;

revoke all on function public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)
  to authenticated;

create or replace function alq_private.alq_admin_indice_observacion_importar_core_v1(
  p_request_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_firma text;
  v_op alq.alq_operacion%rowtype;
  v_serie alq.alq_indice_serie%rowtype;
  v_actual alq.alq_indice_observacion%rowtype;
  v_obs alq.alq_indice_observacion%rowtype;
  v_desde date;
  v_hasta date;
  v_valor numeric;
  v_publicada timestamptz;
  v_descarga timestamptz;
  v_url text;
  v_hash text;
  v_origen text;
  v_result jsonb;
begin
  if p_request_id is null or p_payload is null
     or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k
       where k not in ('schema_version','serie_id','periodo_desde',
         'periodo_hasta_exclusivo','valor','publicada_at','fuente_url',
         'hash_insumo','fecha_descarga','origen'))
     or coalesce((p_payload->>'schema_version')::integer,0)<>1 then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_PAYLOAD_INVALIDO';
  end if;
  select * into v_serie from alq.alq_indice_serie
  where id=nullif(p_payload->>'serie_id','')::uuid;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_SERIE_NO_EXISTE';
  end if;
  v_desde:=nullif(p_payload->>'periodo_desde','')::date;
  v_hasta:=nullif(p_payload->>'periodo_hasta_exclusivo','')::date;
  v_valor:=nullif(p_payload->>'valor','')::numeric;
  v_publicada:=nullif(p_payload->>'publicada_at','')::timestamptz;
  v_descarga:=nullif(p_payload->>'fecha_descarga','')::timestamptz;
  v_url:=nullif(pg_catalog.btrim(p_payload->>'fuente_url'),'');
  v_hash:=nullif(p_payload->>'hash_insumo','');
  v_origen:=p_payload->>'origen';
  if v_desde is null or v_hasta is null or v_hasta<=v_desde
     or v_valor is null or v_valor<=0 or v_publicada is null or v_descarga is null
     or v_url is null or v_hash!~'^[0-9a-f]{64}$'
     or v_origen not in ('oficial_automatico','oficial_manual') then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_FORMA_INVALIDA';
  end if;
  if v_serie.granularidad='diaria' and v_hasta<>v_desde+1 then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_PERIODO_DIARIO_INVALIDO';
  elsif v_serie.granularidad='mensual' and (
      v_desde<>pg_catalog.date_trunc('month',v_desde)::date
      or v_hasta<>(v_desde+interval '1 month')::date) then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_PERIODO_MENSUAL_INVALIDO';
  end if;
  if pg_catalog.upper(v_serie.codigo)='ICL' and
     (pg_catalog.upper(v_serie.organismo)<>'BCRA'
      or v_url not like 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/7988%') then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_FUENTE_ICL_INVALIDA';
  elsif pg_catalog.upper(v_serie.codigo)='IPC' and
     (pg_catalog.upper(v_serie.organismo)<>'INDEC'
      or v_url not like 'https://apis.datos.gob.ar/series/api/series/%') then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_FUENTE_IPC_INVALIDA';
  elsif pg_catalog.upper(v_serie.codigo) not in ('IPC','ICL')
     and v_url not like 'https://%' then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_FUENTE_PERSONALIZADA_INVALIDA';
  end if;

  v_actor:=alq_private.alq_actor_v1(true);
  v_firma:=alq_private.alq_firma_v1('indice_observacion_importar',p_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_op from alq.alq_operacion where request_id=p_request_id for update;
  if found then
    if v_op.operacion<>'indice_observacion_importar'
       or v_op.actor_parte_usuario_id<>v_actor
       or v_op.payload_normalizado<>p_payload or v_op.firma_sha256<>v_firma then
      raise exception using errcode='P0001',message='ALQ_F4_INDICE_REQUEST_CONFLICTO';
    end if;
    if v_op.estado='aplicada' then
      return v_op.resultado||pg_catalog.jsonb_build_object('replay',true);
    end if;
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_REQUEST_NO_TERMINAL';
  end if;
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at,expires_at)
  values(p_request_id,'indice_observacion_importar',p_payload,v_firma,'preparada',v_actor,
    pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()+interval '5 minutes')
  returning * into v_op;
  perform alq_private.alq_f1a_writer_context_v1('enter',v_op.id);

  select * into v_obs from alq.alq_indice_observacion
  where serie_id=v_serie.id and periodo=pg_catalog.daterange(v_desde,v_hasta,'[)')
    and hash_insumo=v_hash for update;
  if found then
    if v_obs.valor<>v_valor or v_obs.fuente_url<>v_url then
      raise exception using errcode='P0001',message='ALQ_F4_INDICE_HASH_CONFLICTO';
    end if;
  else
    select * into v_actual from alq.alq_indice_observacion
    where serie_id=v_serie.id and periodo=pg_catalog.daterange(v_desde,v_hasta,'[)')
    order by fecha_descarga desc,id desc limit 1 for update;
    insert into alq.alq_indice_observacion(serie_id,periodo,valor,publicada_at,
      fuente_url,hash_insumo,fecha_descarga,corrige_a_id,operacion_id)
    values(v_serie.id,pg_catalog.daterange(v_desde,v_hasta,'[)'),v_valor,v_publicada,
      v_url,v_hash,v_descarga,v_actual.id,v_op.id)
    returning * into v_obs;
  end if;
  v_result:=pg_catalog.jsonb_build_object(
    'operacion','indice_observacion_importar','request_id',p_request_id,
    'observacion_id',v_obs.id,'serie_id',v_serie.id,'codigo',v_serie.codigo,
    'periodo_desde',v_desde,'periodo_hasta_exclusivo',v_hasta,
    'valor',v_obs.valor,'fuente_url',v_obs.fuente_url,'hash_insumo',v_obs.hash_insumo,
    'replay',false);
  -- El gate F1-A de operaciones v1 exige una sola entrada canónica, ligada
  -- a la operación y con el mismo resultado que se vuelve terminal.
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values(v_op.id,'operacion',v_op.id,'indice_observacion_importar',v_result,v_actor);
  perform alq_private.alq_f1a_writer_context_v1('exit',v_op.id);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,
    aplicada_at=pg_catalog.clock_timestamp() where id=v_op.id;
  return v_result;
end
$$;

revoke all on function alq_private.alq_admin_indice_observacion_importar_core_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.alq_admin_indice_observacion_importar(
  p_request_id uuid,p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select alq_private.alq_admin_indice_observacion_importar_core_v1(p_request_id,p_payload)
$$;

revoke all on function public.alq_admin_indice_observacion_importar(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_indice_observacion_importar(uuid,jsonb)
  to authenticated;

-- Reemplaza el ajuste manual: el cliente ya no envia el alquiler nuevo.
-- La base recompone la misma propuesta y liga las observaciones utilizadas.
create or replace function alq_private.alq_f3_b3_ajuste_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_ct alq.alq_contrato%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_preview jsonb;
  v_desde date:=nullif(p_payload->>'vigente_desde','')::date;
  v_motivo text:=pg_catalog.btrim(coalesce(p_payload->>'motivo',''));
  v_sha text:=p_payload->>'preview_sha256';
  v_monto numeric;
  v_raw numeric;
  v_nueva uuid;
  v_ajuste uuid;
  v_upper timestamptz;
  v_obs uuid;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or exists(select 1 from pg_catalog.jsonb_object_keys(p_payload) k
       where k not in ('contrato_id','vigente_desde','motivo','preview_sha256'))
     or v_desde is null or v_desde<>pg_catalog.date_trunc('month',v_desde)::date
     or v_motivo='' or v_sha!~'^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_PARAMETROS_INVALIDOS';
  end if;
  select * into v_ct from alq.alq_contrato
  where id=nullif(p_payload->>'contrato_id','')::uuid for update;
  if not found or v_ct.estado not in ('vigente','continuacion_legal') then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_CONTRATO_NO_VIGENTE';
  end if;
  v_preview:=alq_private.alq_f4_ajuste_previsualizar_v1(v_ct.id,v_desde);
  if v_preview->>'estado'<>'listo' then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_PROPUESTA_NO_LISTA';
  end if;
  if v_preview->>'preview_sha256'<>v_sha then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_PROPUESTA_DERIVADA';
  end if;
  select * into v_cv from alq.alq_contrato_version
  where id=(v_preview->>'contrato_version_base_id')::uuid for update;
  if not found or v_desde::timestamptz<=lower(v_cv.vigencia) then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_VERSION_INVALIDA';
  end if;
  if exists(select 1 from alq.alq_mes_generado where contrato_id=v_ct.id and mes>=v_desde) then
    raise exception using errcode='P0001',message='ALQ_F3_B3_AJUSTE_MES_YA_GENERADO';
  end if;
  v_monto:=(v_preview->>'resultado_final')::numeric;
  v_raw:=(v_preview->>'resultado_sin_redondear')::numeric;
  if v_monto<=0 or v_monto=v_cv.monto then
    raise exception using errcode='P0001',message='ALQ_F4_AJUSTE_RESULTADO_INVALIDO';
  end if;
  v_upper:=upper(v_cv.vigencia);
  update alq.alq_contrato_version
    set vigencia=pg_catalog.tstzrange(lower(v_cv.vigencia),v_desde::timestamptz,'[)')
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
  values(v_cv.id,'aplicado',v_preview->>'formula_version',v_raw,v_monto,p_actor,
    pg_catalog.clock_timestamp(),p_operacion_id,pg_catalog.clock_timestamp(),
    v_nueva,v_desde,v_motivo) returning id into v_ajuste;
  foreach v_obs in array array_remove(array[
    nullif(v_preview->>'observacion_base_id','')::uuid,
    nullif(v_preview->>'observacion_final_id','')::uuid],null)
  loop
    insert into alq.alq_ajuste_observacion(ajuste_id,observacion_id)
    values(v_ajuste,v_obs);
  end loop;
  return pg_catalog.jsonb_build_object(
    'ajuste_id',v_ajuste,'contrato_id',v_ct.id,'version_anterior_id',v_cv.id,
    'version_nueva_id',v_nueva,'monto_anterior',v_cv.monto,'monto_nuevo',v_monto,
    'vigente_desde',v_desde,'formula_version',v_preview->>'formula_version',
    'preview_sha256',v_sha);
end
$$;

revoke all on function alq_private.alq_f3_b3_ajuste_aplicar_v1(jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function alq_private.alq_f3_b1_mes_normal_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_prop uuid:=nullif(p_payload->>'propiedad_id','')::uuid;
  v_con_id uuid:=nullif(p_payload->>'contrato_id','')::uuid;
  v_mes date:=nullif(p_payload->>'mes','')::date;
  v_expensas numeric:=coalesce(nullif(p_payload->>'expensas_monto','')::numeric,0);
  v_preview jsonb;
  v_con alq.alq_contrato%rowtype;
  v_cv alq.alq_contrato_version%rowtype;
  v_mv alq.alq_mandato_version%rowtype;
  v_existente alq.alq_mes_generado%rowtype;
  v_periodo alq.alq_periodo%rowtype;
  v_credito alq.alq_credito%rowtype;
  v_titular uuid;
  v_admin uuid;
  v_alquiler uuid;
  v_expensas_id uuid;
  v_honorario uuid;
  v_cargo uuid;
  v_vence date;
  v_fin date;
  v_activo_desde date;
  v_activo_hasta date;
  v_secuencia integer;
  v_alquiler_monto numeric;
  v_honorario_monto numeric;
  v_restante numeric;
  v_usar numeric;
  v_credito_aplicado numeric:=0;
begin
  if v_prop is null or v_con_id is null or v_mes is null
     or v_mes<>pg_catalog.date_trunc('month',v_mes)::date or v_expensas<0 then
    raise exception using errcode='P0001',message='ALQ_F3_B1_MES_PAYLOAD_INVALIDO';
  end if;
  select * into v_con from alq.alq_contrato where id=v_con_id for update;
  if not found or v_con.propiedad_id<>v_prop
     or v_con.estado not in ('vigente','continuacion_legal') then
    raise exception using errcode='P0001',message='ALQ_F3_B1_CONTRATO_MES_INVALIDO';
  end if;
  -- El lock del contrato impide que un ajuste concurrente cambie la version
  -- entre la previsualizacion y la emision.
  v_preview:=alq_private.alq_f4_mes_previsualizar_v1(v_prop,v_con_id,v_mes,v_expensas);
  if coalesce((v_preview->>'ajuste_requerido')::boolean,false) then
    raise exception using errcode='P0001',
      message='ALQ_F4_AJUSTE_PENDIENTE_ANTES_DE_GENERAR_MES';
  end if;
  v_alquiler_monto:=(v_preview->>'alquiler_monto')::numeric;
  v_honorario_monto:=(v_preview->>'honorario_monto')::numeric;
  v_vence:=(v_preview->>'vence_at')::date;
  v_activo_desde:=(v_preview->>'activo_desde')::date;
  v_activo_hasta:=(v_preview->>'activo_hasta_inclusive')::date;
  select * into v_cv from alq.alq_contrato_version
    where id=(v_preview->>'contrato_version_id')::uuid for update;
  select * into v_mv from alq.alq_mandato_version
    where id=(v_preview->>'mandato_version_id')::uuid for update;
  v_titular:=(v_preview->>'titular_parte_id')::uuid;
  select pu.parte_id into v_admin from alq.alq_parte_usuario pu where pu.id=p_actor;
  if v_admin is null then
    raise exception using errcode='P0001',message='ALQ_F3_B1_ADMIN_SIN_PARTE';
  end if;
  if v_alquiler_monto<=0 or v_honorario_monto<=0 then
    raise exception using errcode='P0001',message='ALQ_F4_MES_IMPORTES_NO_POSITIVOS';
  end if;

  select * into v_existente from alq.alq_mes_generado
    where contrato_id=v_con_id and mes=v_mes for update;
  if found then
    if v_existente.propiedad_id<>v_prop
       or v_existente.administracion_parte_id<>v_admin
       or v_existente.alquiler_monto<>v_alquiler_monto
       or v_existente.expensas_monto<>v_expensas
       or v_existente.honorario_monto<>v_honorario_monto then
      raise exception using errcode='P0001',message='ALQ_F3_B1_MES_YA_GENERADO_DERIVADO';
    end if;
    return pg_catalog.jsonb_build_object(
      'mes_generado_id',v_existente.id,'periodo_id',v_existente.periodo_id,
      'alquiler_cargo_id',v_existente.alquiler_cargo_id,
      'expensas_cargo_id',v_existente.expensas_cargo_id,
      'honorario_cargo_id',v_existente.honorario_cargo_id,
      'alquiler_monto',v_existente.alquiler_monto,
      'expensas_monto',v_existente.expensas_monto,
      'honorario_monto',v_existente.honorario_monto,
      'credito_aplicado',v_existente.credito_aplicado,
      'metodo_prorrateo',v_preview->>'metodo_prorrateo',
      'activo_desde',v_activo_desde,'activo_hasta_inclusive',v_activo_hasta,
      'replay',true);
  end if;

  v_fin:=(v_mes+interval '1 month')::date;
  v_secuencia:=((extract(year from v_mes)::integer-
                 extract(year from v_con.inicio)::integer)*12
                +extract(month from v_mes)::integer-
                 extract(month from v_con.inicio)::integer)+1;
  select * into v_periodo from alq.alq_periodo
    where contrato_id=v_con_id and rango=pg_catalog.daterange(v_mes,v_fin,'[)') for update;
  if not found then
    insert into alq.alq_periodo(contrato_id,contrato_version_id,secuencia,rango,
      vence_at,moneda,monto_emitido,snapshot_regla)
    values(v_con_id,v_cv.id,v_secuencia,pg_catalog.daterange(v_mes,v_fin,'[)'),
      v_vence::timestamptz,v_cv.moneda,v_alquiler_monto,
      pg_catalog.jsonb_build_object(
        'version',2,'origen','mes_normal_generar','alquiler_contractual',v_cv.monto,
        'alquiler_emitido',v_alquiler_monto,'honorario_base','devengado',
        'activo_desde',v_activo_desde,'activo_hasta_inclusive',v_activo_hasta,
        'metodo_prorrateo',v_preview->>'metodo_prorrateo',
        'regla_redondeo',v_preview->>'regla_redondeo',
        'numerador',(v_preview->>'numerador')::integer,
        'denominador',(v_preview->>'denominador')::integer))
    returning * into v_periodo;
  elsif v_periodo.contrato_version_id<>v_cv.id or v_periodo.moneda<>v_cv.moneda
     or v_periodo.monto_emitido<>v_alquiler_monto then
    raise exception using errcode='P0001',message='ALQ_F3_B1_PERIODO_DERIVADO';
  end if;

  insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
    acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
    snapshot_regla,saldo_pendiente)
  values(v_prop,v_con_id,v_periodo.id,v_con.inquilino_parte_id,v_titular,'externa',
    'alquiler_periodo',v_cv.moneda,v_alquiler_monto,v_vence::timestamptz,'motor',
    p_operacion_id,pg_catalog.jsonb_build_object(
      'version',2,'origen','mes_normal_generar','clase','alquiler',
      'semantica_real','alquiler_periodo','mes',v_mes,
      'alquiler_contractual',v_cv.monto,'activo_desde',v_activo_desde,
      'activo_hasta_inclusive',v_activo_hasta,
      'metodo_prorrateo',v_preview->>'metodo_prorrateo',
      'numerador',(v_preview->>'numerador')::integer,
      'denominador',(v_preview->>'denominador')::integer),v_alquiler_monto)
  returning id into v_alquiler;

  if v_expensas>0 then
    insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
      acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
      snapshot_regla,saldo_pendiente)
    values(v_prop,v_con_id,v_periodo.id,v_con.inquilino_parte_id,v_titular,'externa',
      'expensas',v_cv.moneda,v_expensas,v_vence::timestamptz,'motor',p_operacion_id,
      pg_catalog.jsonb_build_object('version',2,'origen','mes_normal_generar',
        'clase','expensas','mes',v_mes),v_expensas)
    returning id into v_expensas_id;
  end if;

  insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,
    acreedor_parte_id,ambito,concepto,moneda,monto,vence_at,origen,operacion_id,
    snapshot_regla,saldo_pendiente)
  values(v_prop,v_con_id,v_periodo.id,v_titular,v_admin,'externa',
    'honorario_administracion',v_mv.moneda,v_honorario_monto,(v_fin-1)::timestamptz,
    'motor',p_operacion_id,pg_catalog.jsonb_build_object(
      'version',2,'origen','mes_normal_generar','clase','honorario',
      'base','devengado','alquiler_contractual',v_cv.monto,
      'porcentaje',v_mv.honorario_pct,'mes',v_mes,
      'exigibilidad','a_requerimiento'),v_honorario_monto)
  returning id into v_honorario;

  foreach v_cargo in array pg_catalog.array_remove(array[v_alquiler,v_expensas_id],null)
  loop
    select saldo_pendiente into v_restante from alq.alq_cargo where id=v_cargo;
    for v_credito in select * from alq.alq_credito
      where contrato_id=v_con_id and parte_id=v_con.inquilino_parte_id
        and moneda=v_cv.moneda and saldo_pendiente>0
      order by creado_at,id for update
    loop
      exit when v_restante<=0;
      v_usar:=least(v_restante,v_credito.saldo_pendiente);
      insert into alq.alq_credito_consumo(credito_id,cargo_id,monto,moneda,operacion_id)
      values(v_credito.id,v_cargo,v_usar,v_cv.moneda,p_operacion_id);
      perform alq_private.alq_recalcular_credito_v1(v_credito.id);
      perform alq_private.alq_recalcular_cargo_v1(v_cargo);
      v_restante:=v_restante-v_usar;
      v_credito_aplicado:=v_credito_aplicado+v_usar;
    end loop;
  end loop;

  insert into alq.alq_mes_generado(propiedad_id,contrato_id,periodo_id,mes,
    alquiler_cargo_id,expensas_cargo_id,honorario_cargo_id,administracion_parte_id,
    alquiler_monto,expensas_monto,honorario_monto,credito_aplicado,operacion_id)
  values(v_prop,v_con_id,v_periodo.id,v_mes,v_alquiler,v_expensas_id,v_honorario,v_admin,
    v_alquiler_monto,v_expensas,v_honorario_monto,v_credito_aplicado,p_operacion_id)
  returning id into v_existente.id;
  return pg_catalog.jsonb_build_object(
    'mes_generado_id',v_existente.id,'periodo_id',v_periodo.id,
    'alquiler_cargo_id',v_alquiler,'expensas_cargo_id',v_expensas_id,
    'honorario_cargo_id',v_honorario,'alquiler_monto',v_alquiler_monto,
    'expensas_monto',v_expensas,'honorario_monto',v_honorario_monto,
    'credito_aplicado',v_credito_aplicado,
    'metodo_prorrateo',v_preview->>'metodo_prorrateo',
    'activo_desde',v_activo_desde,'activo_hasta_inclusive',v_activo_hasta,
    'replay',false);
end
$$;

revoke all on function alq_private.alq_f3_b1_mes_normal_aplicar_v1(jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.alq_admin_ajuste_previsualizar(uuid,date)') is null
     or to_regprocedure('public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)') is null
     or to_regprocedure('public.alq_admin_alta_proforma(numeric,date,date,date,text,text,numeric,numeric,numeric,numeric)') is null
     or to_regprocedure('public.alq_admin_alta_estado(uuid)') is null
     or to_regprocedure('public.alq_admin_indice_observacion_importar(uuid,jsonb)') is null
     or to_regprocedure('public.alq_admin_pago_otra_moneda_previsualizar(uuid[],text,numeric,numeric,date)') is null
     or to_regprocedure('alq_private.alq_f4_conversion_contractual_check_v1()') is null
     or not exists(select 1 from pg_catalog.pg_trigger t
       where t.tgrelid='alq.alq_aplicacion'::regclass
         and t.tgname='alq_aplicacion_conversion_contractual_f4_ct'
         and not t.tgisinternal) then
    raise exception using errcode='P0001',message='ALQ_F4_CONDICIONES_POSTCHECK_OBJETOS';
  end if;
  if has_function_privilege('anon','public.alq_admin_ajuste_previsualizar(uuid,date)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_alta_proforma(numeric,date,date,date,text,text,numeric,numeric,numeric,numeric)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_alta_estado(uuid)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_indice_observacion_importar(uuid,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.alq_admin_pago_otra_moneda_previsualizar(uuid[],text,numeric,numeric,date)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_ajuste_previsualizar(uuid,date)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_mes_previsualizar(uuid,uuid,date,numeric)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_alta_proforma(numeric,date,date,date,text,text,numeric,numeric,numeric,numeric)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_alta_estado(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_indice_observacion_importar(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_pago_otra_moneda_previsualizar(uuid[],text,numeric,numeric,date)','EXECUTE') then
    raise exception using errcode='P0001',message='ALQ_F4_CONDICIONES_POSTCHECK_ACL';
  end if;
end
$$;

commit;
