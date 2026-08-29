\set ON_ERROR_STOP on
set application_name='alq-f4-condiciones-regression';
set timezone='UTC';
begin;

-- Prueba focalizada: usa el actor sintético del fixture local y revierte todo.
select set_config('request.jwt.claim.sub','f3b10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b10000-0000-4000-8000-000000000001','role','authenticated',
  'app_metadata',jsonb_build_object('rol','admin'))::text,true);

create function pg_temp.alq_f4_rpc(p_operacion text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare v_p jsonb;
begin
  v_p:=public.alq_admin_preparar(p_operacion,p_payload);
  return public.alq_admin_aplicar((v_p->>'request_id')::uuid,p_operacion,
    v_p->>'firma',p_payload);
end
$fn$;

set local role authenticated;

do $all_proration_modes$
declare d jsonb; b jsonb; i jsonb;
begin
  d:=public.alq_admin_alta_proforma(450000,'2026-10-16','2026-10-31',
    '2026-10-01','dias_reales','centavos',0.08,0,0,0);
  b:=public.alq_admin_alta_proforma(450000,'2026-10-16','2026-10-31',
    '2026-10-01','base_30','centavos',0.08,0,0,0);
  i:=public.alq_admin_alta_proforma(450000,'2026-10-16','2026-10-31',
    '2026-10-01','importe_pactado','centavos',0.08,0,0,0);
  if (d->>'alquiler_monto')::numeric<>232258.06
     or (b->>'alquiler_monto')::numeric<>225000
     or (i->>'alquiler_monto')::numeric<>450000
     or (d->>'honorario_monto')::numeric<>36000
     or (b->>'honorario_monto')::numeric<>36000
     or (i->>'honorario_monto')::numeric<>36000 then
    raise exception 'ALQ_F4_TRES_PRORRATEOS_FALLO:%/%/%',d,b,i;
  end if;
end
$all_proration_modes$;

-- Contrato de porcentaje fijo, alta a mitad de mes y fin a mitad de mes.
select set_config('alq_f4.fixed',public.alq_admin_alta_integral(
  'f4000000-0000-4000-8000-000000001001',jsonb_build_object(
    'schema_version',1,
    'propietario',jsonb_build_object('tipo_persona','fisica','nombre','Propietaria F4 fija','documento_tipo','DNI','documento_numero','F4-FIX-OWNER'),
    'inquilino',jsonb_build_object('tipo_persona','fisica','nombre','Inquilino F4 fijo','documento_tipo','DNI','documento_numero','F4-FIX-TENANT'),
    'propiedad',jsonb_build_object('direccion','F4 fija 100','ciudad','Local','provincia','Río Negro'),
    'mandato',jsonb_build_object('inicio','2026-09-11','fin','2027-08-20',
      'honorario_base','devengado','honorario_pct','0.08','honorario_minimo','0',
      'honorario_fijo','0','incluye_punitorios',true,'moneda','ARS','tratamiento_impuestos',jsonb_build_object()),
    'contrato',jsonb_build_object('inicio','2026-09-11','fin_pactado','2027-08-20',
      'monto','450000','moneda','ARS','dia_pago_desde','1','dia_pago_hasta','10',
      'ajuste_tipo','porcentaje_fijo','pct_fijo','0.10','frecuencia_ajuste_meses','3',
      'punitorio_pct_dia','0.001','punitorio_desde_dia','2','formula_punitorio_version','simple_diaria_v1',
      'metodo_prorrateo','dias_reales','regla_redondeo','centavos',
      'regla_pago_otra_moneda','tasa_pactada','fuente_conversion','Banco Nación · divisa vendedor',
      'fallback_indice',jsonb_build_object()),
    'garantia',null,'deposito',null,'servicios',jsonb_build_array(),'documentos',jsonb_build_object()
  ))::text,true);

do $fixed_preview$
declare r jsonb:=current_setting('alq_f4.fixed')::jsonb; p jsonb;
begin
  p:=public.alq_admin_mes_previsualizar((r->>'propiedad_id')::uuid,
    (r->>'contrato_id')::uuid,'2026-09-01',0);
  if p->>'estado'<>'listo' or (p->>'alquiler_monto')::numeric<>300000
     or (p->>'honorario_monto')::numeric<>36000
     or (p->>'numerador')::integer<>20 or (p->>'denominador')::integer<>30 then
    raise exception 'ALQ_F4_PRIMER_MES_PRORRATEO_FALLO:%',p;
  end if;
end
$fixed_preview$;

select set_config('alq_f4.sep',pg_temp.alq_f4_rpc('mes_normal_generar',
  jsonb_build_object('propiedad_id',current_setting('alq_f4.fixed')::jsonb->>'propiedad_id',
    'contrato_id',current_setting('alq_f4.fixed')::jsonb->>'contrato_id',
    'mes','2026-09-01','expensas_monto','60000'))::text,true);

do $contractual_mora$
declare s jsonb:=current_setting('alq_f4.sep')::jsonb; p jsonb; c jsonb;
begin
  begin
    perform pg_temp.alq_f4_rpc('mora_proponer',jsonb_build_object(
      'cargo_id',s->>'alquiler_cargo_id','calculada_hasta','2026-09-22',
      'porcentaje_diario','9.9'));
    raise exception 'ALQ_F4_MORA_CLIENTE_PUDO_CAMBIAR_REGLA';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F4_MORA_PARAMETROS_INVALIDOS' then raise; end if;
  end;
  p:=pg_temp.alq_f4_rpc('mora_proponer',jsonb_build_object(
    'cargo_id',s->>'alquiler_cargo_id','calculada_hasta','2026-09-22'));
  if (p->>'capital')::numeric<>300000 or (p->>'porcentaje_diario')::numeric<>0.1
     or (p->>'dias_gracia')::integer<>2 or (p->>'dias_mora')::integer<>9
     or (p->>'monto_propuesto')::numeric<>2700
     or p->>'formula_version'<>'simple_diaria_v1'
     or exists(select 1 from alq.alq_cargo where concepto='mora'
       and operacion_id=(select operacion_propuesta_id from alq.alq_mora_propuesta
         where id=(p->>'propuesta_id')::uuid)) then
    raise exception 'ALQ_F4_MORA_CONTRACTUAL_FALLO:%',p;
  end if;
  c:=pg_temp.alq_f4_rpc('mora_resolver',jsonb_build_object(
    'propuesta_id',p->>'propuesta_id','decision','condonar',
    'motivo','Decisión humana focalizada'));
  if c->>'estado'<>'condonada' or (c->>'monto_resuelto')::numeric<>0
     or exists(select 1 from alq.alq_cargo where concepto='mora'
       and snapshot_regla->>'mora_propuesta_id'=p->>'propuesta_id') then
    raise exception 'ALQ_F4_MORA_CONDONACION_FALLO:%',c;
  end if;

  p:=pg_temp.alq_f4_rpc('mora_proponer',jsonb_build_object(
    'cargo_id',s->>'alquiler_cargo_id','calculada_hasta','2026-09-23'));
  c:=pg_temp.alq_f4_rpc('mora_resolver',jsonb_build_object(
    'propuesta_id',p->>'propuesta_id','decision','aplicar',
    'motivo','Aplicación humana focalizada'));
  if c->>'estado'<>'aplicada' or (c->>'monto_resuelto')::numeric<>3000
     or (c->>'honorario_punitorio_monto')::numeric<>240
     or (select count(*) from alq.alq_cargo
         where operacion_id=(select operacion_resolucion_id
           from alq.alq_mora_propuesta where id=(p->>'propuesta_id')::uuid)
           and concepto='mora' and monto=3000)<>1
     or (select count(*) from alq.alq_cargo
         where operacion_id=(select operacion_resolucion_id
           from alq.alq_mora_propuesta where id=(p->>'propuesta_id')::uuid)
           and concepto='honorario_administracion' and monto=240
           and snapshot_regla->>'clase'='honorario_punitorio')<>1 then
    raise exception 'ALQ_F4_MORA_HONORARIO_PUNITORIO_FALLO:%',c;
  end if;
end
$contractual_mora$;

do $fixed_block_adjust$
declare r jsonb:=current_setting('alq_f4.fixed')::jsonb; p jsonb; a jsonb;
begin
  begin
    perform pg_temp.alq_f4_rpc('mes_normal_generar',jsonb_build_object(
      'propiedad_id',r->>'propiedad_id','contrato_id',r->>'contrato_id',
      'mes','2026-12-01','expensas_monto','0'));
    raise exception 'ALQ_F4_MES_SIN_AJUSTE_ACEPTADO';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'ALQ_F4_AJUSTE_PENDIENTE_ANTES_DE_GENERAR_MES' then raise; end if;
  end;
  p:=public.alq_admin_ajuste_previsualizar((r->>'contrato_id')::uuid,null);
  if p->>'estado'<>'listo' or p->>'formula_version'<>'pct_fijo_v1'
     or (p->>'resultado_final')::numeric<>495000 then
    raise exception 'ALQ_F4_AJUSTE_FIJO_PREVIEW_FALLO:%',p;
  end if;
  a:=pg_temp.alq_f4_rpc('ajuste_contractual_aplicar',jsonb_build_object(
    'contrato_id',r->>'contrato_id','vigente_desde',p->>'vigente_desde',
    'motivo','Porcentaje fijo revisado','preview_sha256',p->>'preview_sha256'));
  if (a->>'monto_nuevo')::numeric<>495000 or a->>'formula_version'<>'pct_fijo_v1' then
    raise exception 'ALQ_F4_AJUSTE_FIJO_APLICAR_FALLO:%',a;
  end if;
end
$fixed_block_adjust$;

-- El pago en otra moneda se previsualiza en la base, reparte el importe entre
-- varios cargos y la escritura vuelve a validar la fuente pactada.
select set_config('alq_f4.conversion_doc',pg_temp.alq_f4_rpc('documento_registrar',
  jsonb_build_object('tipo','comprobante_pago','path','f4/conversion-usd.pdf',
    'sha256',repeat('e',64),'mime','application/pdf','bytes','10','version','1',
    'propiedad_id',current_setting('alq_f4.fixed')::jsonb->>'propiedad_id',
    'audiencia','admin','retencion',jsonb_build_object()))::text,true);

do $multi_currency$
declare s jsonb:=current_setting('alq_f4.sep')::jsonb;
  r jsonb:=current_setting('alq_f4.fixed')::jsonb;
  d jsonb:=current_setting('alq_f4.conversion_doc')::jsonb;
  p jsonb; x jsonb; aplicaciones jsonb;
begin
  p:=public.alq_admin_pago_otra_moneda_previsualizar(
    array[(s->>'alquiler_cargo_id')::uuid,(s->>'expensas_cargo_id')::uuid],
    'USD',300,1000,'2026-09-24');
  if p->>'estado'<>'listo' or p->>'fuente'<>'Banco Nación · divisa vendedor'
     or (p->>'monto_origen')::numeric<>300
     or (p->>'monto_destino')::numeric<>300000
     or pg_catalog.jsonb_array_length(p->'aplicaciones')<>2
     or (select sum((a->>'importe_origen')::numeric)
         from pg_catalog.jsonb_array_elements(p->'aplicaciones') a)<>300
     or (select sum((a->>'importe_destino')::numeric)
         from pg_catalog.jsonb_array_elements(p->'aplicaciones') a)<>300000 then
    raise exception 'ALQ_F4_CONVERSION_PREVIEW_FALLO:%',p;
  end if;
  select pg_catalog.jsonb_agg(a||pg_catalog.jsonb_build_object('conversion',
      (a->'conversion')||pg_catalog.jsonb_build_object('evidencia_documento_id',d->>'id')))
    into aplicaciones from pg_catalog.jsonb_array_elements(p->'aplicaciones') a;
  x:=pg_temp.alq_f4_rpc('pago_multimoneda',pg_catalog.jsonb_build_object(
    'pago_fuente_ref',d->>'id','ambito','externa_informativa',
    'contraparte_parte_id',(select inquilino_parte_id from alq.alq_contrato
      where id=(r->>'contrato_id')::uuid),
    'beneficiario_parte_id',(select acreedor_parte_id from alq.alq_cargo
      where id=(s->>'alquiler_cargo_id')::uuid),
    'moneda','USD','monto','300','fecha','2026-09-24T12:00:00Z',
    'medio','transferencia_directa_al_propietario',
    'comprobante_documento_id',d->>'id','aplicaciones',aplicaciones));
  if x->>'operacion'<>'pago_multimoneda'
     or (select count(*) from alq.alq_aplicacion a
         join alq.alq_conversion_moneda c on c.id=a.conversion_id
         where a.transaccion_id=(x->>'id')::uuid and c.fuente='Banco Nación · divisa vendedor')<>2
     or (select sum(importe_origen) from alq.alq_aplicacion
         where transaccion_id=(x->>'id')::uuid)<>300
     or (select sum(importe_destino) from alq.alq_aplicacion
         where transaccion_id=(x->>'id')::uuid)<>300000 then
    raise exception 'ALQ_F4_CONVERSION_APLICAR_FALLO:%',x;
  end if;
end
$multi_currency$;

select set_config('alq_f4.dec',pg_temp.alq_f4_rpc('mes_normal_generar',
  jsonb_build_object('propiedad_id',current_setting('alq_f4.fixed')::jsonb->>'propiedad_id',
    'contrato_id',current_setting('alq_f4.fixed')::jsonb->>'contrato_id',
    'mes','2026-12-01','expensas_monto','0'))::text,true);

-- Segundo contrato: índice mensual con observaciones trazables.
select set_config('alq_f4.indexed',public.alq_admin_alta_integral(
  'f4000000-0000-4000-8000-000000002001',jsonb_build_object(
    'schema_version',1,
    'propietario',jsonb_build_object('tipo_persona','fisica','nombre','Propietaria F4 índice','documento_tipo','DNI','documento_numero','F4-IDX-OWNER'),
    'inquilino',jsonb_build_object('tipo_persona','fisica','nombre','Inquilino F4 índice','documento_tipo','DNI','documento_numero','F4-IDX-TENANT'),
    'propiedad',jsonb_build_object('direccion','F4 índice 200','ciudad','Local','provincia','Río Negro'),
    'mandato',jsonb_build_object('inicio','2026-09-01','fin','2027-08-31',
      'honorario_base','devengado','honorario_pct','0.08','honorario_minimo','0',
      'honorario_fijo','0','incluye_punitorios',false,'moneda','ARS','tratamiento_impuestos',jsonb_build_object()),
    'contrato',jsonb_build_object('inicio','2026-09-01','fin_pactado','2027-08-31',
      'monto','450000','moneda','ARS','dia_pago_desde','1','dia_pago_hasta','10',
      'ajuste_tipo','indice','indice_organismo','INDEC','indice_codigo','IPC',
      'indice_base','Nivel general nacional · serie 148.3_INIVELNAL_DICI_M_26',
      'indice_version','datos_argentina_v1','indice_granularidad','mensual','frecuencia_ajuste_meses','3',
      'punitorio_pct_dia','0','punitorio_desde_dia','0','formula_punitorio_version','sin_mora_automatica',
      'metodo_prorrateo','importe_pactado','regla_redondeo','centavos',
      'regla_pago_otra_moneda','prohibido','fallback_indice',jsonb_build_object()),
    'garantia',null,'deposito',null,'servicios',jsonb_build_array(),'documentos',jsonb_build_object()
  ))::text,true);

select public.alq_admin_indice_observacion_importar(
  'f4000000-0000-4000-8000-000000002101',jsonb_build_object(
    'schema_version',1,'serie_id',(select indice_serie_id from alq_v_contrato_version
      where contrato_id=(current_setting('alq_f4.indexed')::jsonb->>'contrato_id')::uuid),
    'periodo_desde','2026-08-01','periodo_hasta_exclusivo','2026-09-01','valor','100',
    'publicada_at','2026-09-10T12:00:00Z','fuente_url','https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&start_date=2026-08-01',
    'hash_insumo',repeat('a',64),'fecha_descarga','2026-09-10T12:00:00Z','origen','oficial_automatico'));
select public.alq_admin_indice_observacion_importar(
  'f4000000-0000-4000-8000-000000002102',jsonb_build_object(
    'schema_version',1,'serie_id',(select indice_serie_id from alq_v_contrato_version
      where contrato_id=(current_setting('alq_f4.indexed')::jsonb->>'contrato_id')::uuid),
    'periodo_desde','2026-11-01','periodo_hasta_exclusivo','2026-12-01','valor','110',
    'publicada_at','2026-12-10T12:00:00Z','fuente_url','https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&start_date=2026-11-01',
    'hash_insumo',repeat('b',64),'fecha_descarga','2026-12-10T12:00:00Z','origen','oficial_automatico'));

do $index_adjust$
declare r jsonb:=current_setting('alq_f4.indexed')::jsonb; p jsonb; a jsonb;
begin
  p:=public.alq_admin_ajuste_previsualizar((r->>'contrato_id')::uuid,null);
  if p->>'estado'<>'listo' or p->>'formula_version'<>'indice_ipc_nivel_general_v1'
     or (p->>'resultado_final')::numeric<>495000
     or (p->>'observacion_base_valor')::numeric<>100
     or (p->>'observacion_final_valor')::numeric<>110 then
    raise exception 'ALQ_F4_AJUSTE_INDICE_PREVIEW_FALLO:%',p;
  end if;
  a:=pg_temp.alq_f4_rpc('ajuste_contractual_aplicar',jsonb_build_object(
    'contrato_id',r->>'contrato_id','vigente_desde',p->>'vigente_desde',
    'motivo','IPC oficial revisado','preview_sha256',p->>'preview_sha256'));
  if (a->>'monto_nuevo')::numeric<>495000 or a->>'formula_version'<>'indice_ipc_nivel_general_v1'
     or (select count(*) from alq.alq_ajuste_observacion ao where ao.ajuste_id=(a->>'ajuste_id')::uuid)<>2 then
    raise exception 'ALQ_F4_AJUSTE_INDICE_APLICAR_FALLO:%',a;
  end if;
end
$index_adjust$;

-- ICL usa niveles diarios oficiales en la fecha inicial y la fecha de ajuste.
select set_config('alq_f4.icl',public.alq_admin_alta_integral(
  'f4000000-0000-4000-8000-000000003001',jsonb_build_object(
    'schema_version',1,
    'propietario',jsonb_build_object('tipo_persona','fisica','nombre','Propietaria F4 ICL','documento_tipo','DNI','documento_numero','F4-ICL-OWNER'),
    'inquilino',jsonb_build_object('tipo_persona','fisica','nombre','Inquilino F4 ICL','documento_tipo','DNI','documento_numero','F4-ICL-TENANT'),
    'propiedad',jsonb_build_object('direccion','F4 ICL 300','ciudad','Local','provincia','Río Negro'),
    'mandato',jsonb_build_object('inicio','2026-09-01','fin','2027-08-31',
      'honorario_base','devengado','honorario_pct','0.08','honorario_minimo','0',
      'honorario_fijo','0','incluye_punitorios',false,'moneda','ARS','tratamiento_impuestos',jsonb_build_object()),
    'contrato',jsonb_build_object('inicio','2026-09-01','fin_pactado','2027-08-31',
      'monto','450000','moneda','ARS','dia_pago_desde','1','dia_pago_hasta','10',
      'ajuste_tipo','indice','indice_organismo','BCRA','indice_codigo','ICL',
      'indice_base','Ley 27.551 · variable BCRA 7988','indice_version','bcra_v4',
      'indice_granularidad','diaria','frecuencia_ajuste_meses','3',
      'punitorio_pct_dia','0','punitorio_desde_dia','0','formula_punitorio_version','sin_mora_automatica',
      'metodo_prorrateo','importe_pactado','regla_redondeo','centavos',
      'regla_pago_otra_moneda','prohibido','fallback_indice',jsonb_build_object()),
    'garantia',null,'deposito',null,'servicios',jsonb_build_array(),'documentos',jsonb_build_object()
  ))::text,true);

select public.alq_admin_indice_observacion_importar(
  'f4000000-0000-4000-8000-000000003101',jsonb_build_object(
    'schema_version',1,'serie_id',(select indice_serie_id from alq_v_contrato_version
      where contrato_id=(current_setting('alq_f4.icl')::jsonb->>'contrato_id')::uuid),
    'periodo_desde','2026-09-01','periodo_hasta_exclusivo','2026-09-02','valor','1.5',
    'publicada_at','2026-09-01T12:00:00Z','fuente_url','https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/7988?desde=2026-09-01&hasta=2026-09-01',
    'hash_insumo',repeat('c',64),'fecha_descarga','2026-09-01T12:00:00Z','origen','oficial_automatico'));
select public.alq_admin_indice_observacion_importar(
  'f4000000-0000-4000-8000-000000003102',jsonb_build_object(
    'schema_version',1,'serie_id',(select indice_serie_id from alq_v_contrato_version
      where contrato_id=(current_setting('alq_f4.icl')::jsonb->>'contrato_id')::uuid),
    'periodo_desde','2026-12-01','periodo_hasta_exclusivo','2026-12-02','valor','1.65',
    'publicada_at','2026-12-01T12:00:00Z','fuente_url','https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/7988?desde=2026-12-01&hasta=2026-12-01',
    'hash_insumo',repeat('d',64),'fecha_descarga','2026-12-01T12:00:00Z','origen','oficial_automatico'));

do $icl_preview$
declare r jsonb:=current_setting('alq_f4.icl')::jsonb; p jsonb;
begin
  p:=public.alq_admin_ajuste_previsualizar((r->>'contrato_id')::uuid,null);
  if p->>'estado'<>'listo' or p->>'formula_version'<>'indice_icl_bcra_v1'
     or (p->>'resultado_final')::numeric<>495000 then
    raise exception 'ALQ_F4_AJUSTE_ICL_PREVIEW_FALLO:%',p;
  end if;
end
$icl_preview$;

-- Una factura compartida queda registrada una sola vez, con dos cargos cuya
-- suma coincide exactamente con el documento original.
select set_config('alq_f4.shared_account',pg_temp.alq_f4_rpc('servicio_cuenta_alta',
  jsonb_build_object('propiedad_id',current_setting('alq_f4.fixed')::jsonb->>'propiedad_id',
    'tipo','gas','responsable_parte_id',(select inquilino_parte_id from alq.alq_contrato
      where id=(current_setting('alq_f4.fixed')::jsonb->>'contrato_id')::uuid),
    'nro_cliente','F4-COMPARTIDA-001'))::text,true);
select set_config('alq_f4.shared_doc',pg_temp.alq_f4_rpc('documento_registrar',
  jsonb_build_object('tipo','factura_servicio','path','f4/factura-compartida.pdf',
    'sha256',repeat('f',64),'mime','application/pdf','bytes','20','version','1',
    'propiedad_id',current_setting('alq_f4.fixed')::jsonb->>'propiedad_id',
    'audiencia','admin','retencion',jsonb_build_object()))::text,true);

do $shared_invoice$
declare c uuid[]:=array[
    (current_setting('alq_f4.fixed')::jsonb->>'contrato_id')::uuid,
    (current_setting('alq_f4.indexed')::jsonb->>'contrato_id')::uuid];
  p jsonb; x jsonb; y jsonb;
begin
  p:=public.alq_admin_factura_reparto_previsualizar(
    (current_setting('alq_f4.shared_account')::jsonb->>'id')::uuid,c,'porcentaje',
    array[40,60]::numeric[],100000,'ARS','2026-10-25','propietario');
  if p->>'estado'<>'listo' or jsonb_array_length(p->'lineas')<>2
     or (select sum((l->>'monto')::numeric) from jsonb_array_elements(p->'lineas') l)<>100000
     or (p#>>'{lineas,0,monto}')::numeric<>40000
     or (p#>>'{lineas,1,monto}')::numeric<>60000 then
    raise exception 'ALQ_F4_FACTURA_COMPARTIDA_PREVIEW_FALLO:%',p;
  end if;
  x:=public.alq_admin_factura_repartida_registrar(
    'f4000000-0000-4000-8000-000000004001',jsonb_build_object(
      'schema_version',1,'cuenta_id',current_setting('alq_f4.shared_account')::jsonb->>'id',
      'desde','2026-10-01','hasta','2026-11-01','moneda','ARS','monto','100000',
      'vence_at','2026-10-25','comprobante_documento_id',
        current_setting('alq_f4.shared_doc')::jsonb->>'id','modo','porcentaje',
      'contrato_ids',to_jsonb(c),'valores',jsonb_build_array(40,60),
      'acreedor_tipo','propietario','preview_sha256',p->>'preview_sha256'));
  y:=public.alq_admin_factura_repartida_registrar(
    'f4000000-0000-4000-8000-000000004001',jsonb_build_object(
      'schema_version',1,'cuenta_id',current_setting('alq_f4.shared_account')::jsonb->>'id',
      'desde','2026-10-01','hasta','2026-11-01','moneda','ARS','monto','100000',
      'vence_at','2026-10-25','comprobante_documento_id',
        current_setting('alq_f4.shared_doc')::jsonb->>'id','modo','porcentaje',
      'contrato_ids',to_jsonb(c),'valores',jsonb_build_array(40,60),
      'acreedor_tipo','propietario','preview_sha256',p->>'preview_sha256'));
  if (x->>'cantidad_cargos')::integer<>2
     or (select count(*) from alq.alq_servicio_factura_reparto
         where factura_id=(x->>'factura_id')::uuid)<>2
     or (select sum(monto) from alq.alq_servicio_factura_reparto
         where factura_id=(x->>'factura_id')::uuid)<>100000
     or y->>'replay'<>'true' then
    raise exception 'ALQ_F4_FACTURA_COMPARTIDA_APLICAR_FALLO:%',x;
  end if;
end
$shared_invoice$;

-- Renovar permite redefinir las condiciones y extender el mandato en el
-- mismo acto; rescindir sigue siendo una acción humana separada y trazable.
select pg_temp.alq_f4_rpc('contrato_continuacion_marcar',jsonb_build_object(
  'contrato_id',current_setting('alq_f4.fixed')::jsonb->>'contrato_id',
  'continuacion_desde','2027-09-01'));

do $continuation$
begin
  if (select estado from alq.alq_contrato
      where id=(current_setting('alq_f4.fixed')::jsonb->>'contrato_id')::uuid)<>'continuacion_legal'
     or (select continuacion_desde from alq.alq_contrato
         where id=(current_setting('alq_f4.fixed')::jsonb->>'contrato_id')::uuid)<>date '2027-09-01' then
    raise exception 'ALQ_F4_CONTINUACION_LEGAL_FALLO';
  end if;
end
$continuation$;

select set_config('alq_f4.renewed',public.alq_admin_contrato_renovar_integral(
  'f4000000-0000-4000-8000-000000005001',jsonb_build_object(
    'schema_version',1,'predecesor_id',current_setting('alq_f4.fixed')::jsonb->>'contrato_id',
    'contrato',jsonb_build_object('inicio','2027-09-01','fin_pactado','2028-08-31',
      'monto','550000','moneda','ARS','dia_pago_desde','1','dia_pago_hasta','10',
      'ajuste_tipo','porcentaje_fijo','pct_fijo','0.12','frecuencia_ajuste_meses','3',
      'punitorio_pct_dia','0.001','punitorio_desde_dia','2',
      'formula_punitorio_version','simple_diaria_v1','metodo_prorrateo','dias_reales',
      'regla_redondeo','centavos','regla_pago_otra_moneda','prohibido',
      'fallback_indice',jsonb_build_object()),
    'mandato',jsonb_build_object('honorario_base','devengado','honorario_pct','0.09',
      'honorario_minimo','0','honorario_fijo','0','incluye_punitorios',true,
      'moneda','ARS','tratamiento_impuestos',jsonb_build_object('nota','renovado'),
      'extender_hasta','2028-08-31'),'copiar_garantia',false))::text,true);

do $renew_and_rescind$
declare r jsonb:=current_setting('alq_f4.renewed')::jsonb; x jsonb;
begin
  if (select estado from alq.alq_contrato
      where id=(r->>'predecesor_id')::uuid)<>'cerrado'
     or (select fin_efectivo from alq.alq_contrato
         where id=(r->>'predecesor_id')::uuid)<>date '2027-08-31'
     or (select monto from alq.alq_contrato_version
         where id=(r->>'contrato_version_id')::uuid)<>550000
     or (select honorario_pct from alq.alq_mandato_version
         where id=(r->>'mandato_version_id')::uuid)<>0.09 then
    raise exception 'ALQ_F4_RENOVACION_INTEGRAL_FALLO:%',r;
  end if;
  x:=pg_temp.alq_f4_rpc('contrato_rescindir',jsonb_build_object(
    'contrato_id',r->>'contrato_id','notificada_at','2027-09-15T12:00:00Z',
    'efectiva_at','2027-10-01T12:00:00Z','causal','Acuerdo de partes',
    'preaviso_dias','16','entrega_llaves_at','2027-10-01T12:00:00Z'));
  if (select estado from alq.alq_contrato where id=(r->>'contrato_id')::uuid)<>'rescindido'
     or (select count(*) from alq.alq_rescision where contrato_id=(r->>'contrato_id')::uuid)<>1 then
    raise exception 'ALQ_F4_RESCISION_VISIBLE_FALLO:%',x;
  end if;
end
$renew_and_rescind$;

reset role;

do $final$
declare r jsonb:=current_setting('alq_f4.fixed')::jsonb;
begin
  if (current_setting('alq_f4.sep')::jsonb->>'alquiler_monto')::numeric<>300000
     or (current_setting('alq_f4.sep')::jsonb->>'honorario_monto')::numeric<>36000
     or (current_setting('alq_f4.dec')::jsonb->>'alquiler_monto')::numeric<>495000
     or (current_setting('alq_f4.dec')::jsonb->>'honorario_monto')::numeric<>39600
     or public.alq_admin_alta_estado('f4000000-0000-4000-8000-000000001001')->>'estado'<>'aplicada'
     or alq_private.alq_assert_global_v1()<>'ALQ_ASSERT_GLOBAL_OK' then
    raise exception 'ALQ_F4_CONDICIONES_FINAL_FALLO';
  end if;
end
$final$;

select 'ALQ_F4_CONDICIONES_LOCAL_PASS|TRES_PRORRATEOS|HONORARIO_CONTRACTUAL_COMPLETO|MORA_CONTRACTUAL_HUMANA|AJUSTE_FIJO|AJUSTE_IPC|AJUSTE_ICL|PAGO_OTRA_MONEDA|FACTURA_COMPARTIDA|CONTINUACION_LEGAL|RENOVACION|RESCISION|BLOQUEO_PRE_MES|IDEMPOTENCIA_ALTA' receipt;
rollback;
