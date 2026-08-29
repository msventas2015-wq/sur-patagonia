-- ALQ F4 · alta integral operable desde el panel
-- Una sola llamada crea personas, propiedad administrada, titularidad, mandato,
-- contrato, condiciones económicas, garantía, depósito y cuentas de servicios.
-- p_request_id hace la llamada idempotente ante pérdida de respuesta.

begin;

do $$
begin
  if to_regclass('alq.alq_operacion') is null
     or to_regclass('alq.alq_contrato_version') is null
     or to_regprocedure('alq_private.alq_actor_v1(boolean)') is null
     or to_regprocedure('alq_private.alq_firma_v1(text,jsonb)') is null then
    raise exception using errcode='P0001',message='ALQ_F4_BASE_INCOMPATIBLE';
  end if;
end
$$;

create or replace function alq_private.alq_alta_integral_parte_v1(p_persona jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_tipo text;
  v_nombre text;
  v_doc_tipo text;
  v_doc_numero text;
begin
  if p_persona is null or pg_catalog.jsonb_typeof(p_persona)<>'object' then
    raise exception using errcode='P0001',message='ALQ_ALTA_PERSONA_INVALIDA';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_persona) k
    where k not in ('parte_id','tipo_persona','nombre','documento_tipo','documento_numero',
                    'tel_whatsapp','email','notas')
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_PERSONA_CAMPO_DESCONOCIDO';
  end if;
  v_id:=nullif(pg_catalog.btrim(p_persona->>'parte_id'),'')::uuid;
  if v_id is not null then
    perform 1 from alq.alq_parte where id=v_id;
    if not found then
      raise exception using errcode='P0001',message='ALQ_ALTA_PERSONA_NO_EXISTE';
    end if;
    return v_id;
  end if;

  v_tipo:=coalesce(nullif(pg_catalog.btrim(p_persona->>'tipo_persona'),''),'fisica');
  v_nombre:=nullif(pg_catalog.btrim(p_persona->>'nombre'),'');
  v_doc_tipo:=nullif(pg_catalog.btrim(p_persona->>'documento_tipo'),'');
  v_doc_numero:=nullif(pg_catalog.btrim(p_persona->>'documento_numero'),'');
  if v_tipo not in ('fisica','juridica') or v_nombre is null
     or ((v_doc_tipo is null)<>(v_doc_numero is null)) then
    raise exception using errcode='P0001',message='ALQ_ALTA_PERSONA_DATOS_INCOMPLETOS';
  end if;
  if v_doc_tipo is not null and exists (
    select 1 from alq.alq_parte
    where documento_tipo=v_doc_tipo and documento_numero=v_doc_numero
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_PERSONA_DOCUMENTO_EXISTENTE';
  end if;
  insert into alq.alq_parte(tipo_persona,nombre,documento_tipo,documento_numero,
    tel_whatsapp,email,notas)
  values (v_tipo,v_nombre,v_doc_tipo,v_doc_numero,
    nullif(pg_catalog.btrim(p_persona->>'tel_whatsapp'),''),
    nullif(pg_catalog.btrim(p_persona->>'email'),''),
    nullif(pg_catalog.btrim(p_persona->>'notas'),''))
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function alq_private.alq_alta_integral_parte_v1(jsonb)
  from public,anon,authenticated,service_role;

create or replace function alq_private.alq_alta_integral_documento_v1(
  p_request_id uuid,p_propiedad_id uuid,p_documento jsonb,p_tipo text,p_audiencia text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_path text;
  v_sha text;
  v_mime text;
  v_bytes bigint;
  v_prefijo text:='altas/'||p_request_id::text||'/';
begin
  if p_documento is null or p_documento='null'::jsonb then return null; end if;
  if pg_catalog.jsonb_typeof(p_documento)<>'object' or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_documento) k
    where k not in ('path','sha256','mime','bytes')
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_DOCUMENTO_INVALIDO';
  end if;
  v_path:=nullif(pg_catalog.btrim(p_documento->>'path'),'');
  v_sha:=nullif(pg_catalog.btrim(p_documento->>'sha256'),'');
  v_mime:=nullif(pg_catalog.btrim(p_documento->>'mime'),'');
  v_bytes:=nullif(p_documento->>'bytes','')::bigint;
  if v_path is null or pg_catalog.left(v_path,pg_catalog.length(v_prefijo))<>v_prefijo
     or v_sha is null or v_sha!~'^[0-9a-f]{64}$'
     or v_mime is null or v_bytes is null or v_bytes<=0 then
    raise exception using errcode='P0001',message='ALQ_ALTA_DOCUMENTO_FORMA_INVALIDA';
  end if;
  select id into v_id from alq.alq_documento where path=v_path;
  if found then
    perform 1 from alq.alq_documento
    where id=v_id and sha256=v_sha and mime=v_mime and bytes=v_bytes
      and tipo=p_tipo and propiedad_id=p_propiedad_id;
    if not found then
      raise exception using errcode='P0001',message='ALQ_ALTA_DOCUMENTO_CONFLICTO';
    end if;
    return v_id;
  end if;
  insert into alq.alq_documento(tipo,path,sha256,mime,bytes,version,propiedad_id,
    audiencia,retencion)
  values (p_tipo,v_path,v_sha,v_mime,v_bytes,1,p_propiedad_id,p_audiencia,
    pg_catalog.jsonb_build_object('origen','alta_integral','request_id',p_request_id))
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function alq_private.alq_alta_integral_documento_v1(uuid,uuid,jsonb,text,text)
  from public,anon,authenticated,service_role;

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

create or replace function alq_private.alq_admin_alta_integral_core_v1(
  p_request_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_admin_parte uuid;
  v_firma text;
  v_op alq.alq_operacion%rowtype;
  v_result jsonb;
  v_propietario uuid;
  v_inquilino uuid;
  v_garante uuid;
  v_propiedad uuid;
  v_titularidad uuid;
  v_mandato uuid;
  v_mandato_version uuid;
  v_contrato uuid;
  v_contrato_version uuid;
  v_garantia uuid;
  v_deposito uuid;
  v_indice uuid;
  v_contrato_doc uuid;
  v_garantia_doc uuid;
  v_deposito_doc uuid;
  v_servicios uuid[]:='{}'::uuid[];
  v_servicio uuid;
  v_item jsonb;
  v_prop jsonb;
  v_man jsonb;
  v_con jsonb;
  v_gar jsonb;
  v_dep jsonb;
  v_docs jsonb;
  v_inicio date;
  v_fin date;
  v_mandato_inicio date;
  v_mandato_fin date;
  v_direccion text;
  v_ciudad text;
  v_provincia text;
  v_publicacion uuid;
  v_ajuste text;
  v_pct_fijo numeric;
  v_frecuencia integer;
  v_custodia uuid;
  v_responsable uuid;
  v_servicios_payload jsonb;
  v_honorario_pct numeric;
  v_honorario_minimo numeric;
  v_honorario_fijo numeric;
  v_punitorio_pct numeric;
  v_punitorio_gracia smallint;
  v_punitorio_formula text;
begin
  if p_request_id is null or p_payload is null
     or pg_catalog.jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='P0001',message='ALQ_ALTA_PAYLOAD_INVALIDO';
  end if;
  if coalesce((p_payload->>'schema_version')::integer,0)<>1 or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_payload) k
    where k not in ('schema_version','propietario','inquilino','propiedad','mandato',
                    'contrato','garantia','deposito','servicios','documentos')
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_PAYLOAD_VERSION_O_CAMPO_INVALIDO';
  end if;

  v_actor:=alq_private.alq_actor_v1(true);
  select parte_id into v_admin_parte from alq.alq_parte_usuario where id=v_actor;
  if v_admin_parte is null then
    raise exception using errcode='P0001',message='ALQ_ALTA_ADMIN_SIN_PARTE';
  end if;
  v_firma:=alq_private.alq_firma_v1('alta_integral',p_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));

  select * into v_op from alq.alq_operacion where request_id=p_request_id for update;
  if found then
    if v_op.operacion<>'alta_integral' or v_op.actor_parte_usuario_id<>v_actor
       or v_op.payload_normalizado<>p_payload or v_op.firma_sha256<>v_firma then
      raise exception using errcode='P0001',message='ALQ_ALTA_REQUEST_CONFLICTO';
    end if;
    if v_op.estado='aplicada' then
      return v_op.resultado||pg_catalog.jsonb_build_object('replay',true);
    end if;
    raise exception using errcode='P0001',message='ALQ_ALTA_REQUEST_NO_TERMINAL';
  end if;

  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at,expires_at)
  values (p_request_id,'alta_integral',p_payload,v_firma,'preparada',v_actor,
    clock_timestamp(),clock_timestamp()+interval '5 minutes')
  returning * into v_op;
  perform alq_private.alq_f1a_writer_context_v1('enter',v_op.id);

  v_propietario:=alq_private.alq_alta_integral_parte_v1(p_payload->'propietario');
  v_inquilino:=alq_private.alq_alta_integral_parte_v1(p_payload->'inquilino');
  if v_propietario=v_inquilino then
    raise exception using errcode='P0001',message='ALQ_ALTA_PROPIETARIO_IGUAL_INQUILINO';
  end if;

  v_prop:=coalesce(p_payload->'propiedad','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_prop)<>'object' or exists (
    select 1 from pg_catalog.jsonb_object_keys(v_prop) k
    where k not in ('publicacion_propiedad_id','direccion','ciudad','provincia')
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_PROPIEDAD_INVALIDA';
  end if;
  v_publicacion:=nullif(pg_catalog.btrim(v_prop->>'publicacion_propiedad_id'),'')::uuid;
  if v_publicacion is not null then
    select coalesce(nullif(pg_catalog.btrim(p.ubicacion),''),nullif(pg_catalog.btrim(v_prop->>'direccion'),'')),
           coalesce(nullif(pg_catalog.btrim(p.ciudad),''),nullif(pg_catalog.btrim(v_prop->>'ciudad'),'')),
           coalesce(nullif(pg_catalog.btrim(p.provincia),''),nullif(pg_catalog.btrim(v_prop->>'provincia'),''))
      into v_direccion,v_ciudad,v_provincia
    from public.propiedades p where p.id=v_publicacion;
    if not found then
      raise exception using errcode='P0001',message='ALQ_ALTA_PUBLICACION_NO_EXISTE';
    end if;
    if exists(select 1 from alq.alq_propiedad where publicacion_propiedad_id=v_publicacion) then
      raise exception using errcode='P0001',message='ALQ_ALTA_PUBLICACION_YA_ADMINISTRADA';
    end if;
  else
    v_direccion:=nullif(pg_catalog.btrim(v_prop->>'direccion'),'');
    v_ciudad:=nullif(pg_catalog.btrim(v_prop->>'ciudad'),'');
    v_provincia:=nullif(pg_catalog.btrim(v_prop->>'provincia'),'');
  end if;
  if v_direccion is null or v_ciudad is null or v_provincia is null then
    raise exception using errcode='P0001',message='ALQ_ALTA_PROPIEDAD_DATOS_INCOMPLETOS';
  end if;
  insert into alq.alq_propiedad(direccion,direccion_norm,ciudad,ciudad_norm,provincia,
    publicacion_propiedad_id)
  values (v_direccion,pg_catalog.lower(v_direccion),v_ciudad,pg_catalog.lower(v_ciudad),
    v_provincia,v_publicacion) returning id into v_propiedad;

  v_man:=coalesce(p_payload->'mandato','{}'::jsonb);
  v_con:=coalesce(p_payload->'contrato','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_man)<>'object' or pg_catalog.jsonb_typeof(v_con)<>'object'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(v_man) k
       where k not in ('inicio','fin','honorario_base','honorario_pct','honorario_minimo',
                       'honorario_fijo','incluye_punitorios','moneda','tratamiento_impuestos')
     ) or exists (
       select 1 from pg_catalog.jsonb_object_keys(v_con) k
       where k not in ('inicio','fin_pactado','monto','moneda','dia_pago_desde',
                       'dia_pago_hasta','ajuste_tipo','pct_fijo','frecuencia_ajuste_meses',
                       'indice_organismo','indice_codigo','indice_base','indice_version',
                       'indice_granularidad',
                       'punitorio_pct_dia','punitorio_desde_dia','formula_punitorio_version',
                       'metodo_prorrateo','regla_redondeo','regla_pago_otra_moneda',
                       'fuente_conversion','fallback_indice')
     ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_CONDICIONES_INVALIDAS';
  end if;
  v_inicio:=nullif(v_con->>'inicio','')::date;
  v_fin:=nullif(v_con->>'fin_pactado','')::date;
  v_mandato_inicio:=coalesce(nullif(v_man->>'inicio','')::date,v_inicio);
  v_mandato_fin:=nullif(v_man->>'fin','')::date;
  if v_inicio is null or v_mandato_inicio is null or v_mandato_inicio>v_inicio
     or (v_fin is not null and v_fin<v_inicio)
     or (v_mandato_fin is not null and v_mandato_fin<v_mandato_inicio)
     or (v_mandato_fin is not null and v_fin is not null and v_mandato_fin<v_fin) then
    raise exception using errcode='P0001',message='ALQ_ALTA_FECHAS_INVALIDAS';
  end if;
  -- La regla porcentual/minima/fija no tiene una tasa propia para convertir
  -- honorarios. Por eso la moneda del mandato debe coincidir con la del
  -- alquiler: aceptar otra dejaría un selector visible sin semántica real.
  if nullif(v_man->>'moneda','') is distinct from nullif(v_con->>'moneda','') then
    raise exception using errcode='P0001',message='ALQ_ALTA_HONORARIO_MONEDA_DEBE_COINCIDIR';
  end if;

  insert into alq.alq_titularidad(propiedad_id,parte_id,vigencia)
  values (v_propiedad,v_propietario,pg_catalog.tstzrange(v_mandato_inicio::timestamptz,
    case when v_mandato_fin is null then null else (v_mandato_fin+1)::timestamptz end,'[)'))
  returning id into v_titularidad;
  insert into alq.alq_mandato(propiedad_id,titularidad_id,vigencia,estado)
  values (v_propiedad,v_titularidad,pg_catalog.tstzrange(v_mandato_inicio::timestamptz,
    case when v_mandato_fin is null then null else (v_mandato_fin+1)::timestamptz end,'[)'),'activo')
  returning id into v_mandato;

  if coalesce(nullif(v_man->>'honorario_base',''),'devengado')<>'devengado' then
    raise exception using errcode='P0001',message='ALQ_ALTA_HONORARIO_COBRADO_NO_IMPLEMENTADO';
  end if;
  v_honorario_pct:=coalesce(nullif(v_man->>'honorario_pct','')::numeric,0);
  v_honorario_minimo:=coalesce(nullif(v_man->>'honorario_minimo','')::numeric,0);
  v_honorario_fijo:=coalesce(nullif(v_man->>'honorario_fijo','')::numeric,0);
  if v_honorario_pct<0 or v_honorario_minimo<0 or v_honorario_fijo<0
     or (v_honorario_pct=0 and v_honorario_minimo=0 and v_honorario_fijo=0)
     or nullif(v_man->>'moneda','') is null then
    raise exception using errcode='P0001',message='ALQ_ALTA_HONORARIO_INVALIDO';
  end if;
  insert into alq.alq_mandato_version(mandato_id,vigencia,honorario_base,honorario_pct,
    honorario_minimo,honorario_fijo,incluye_punitorios,moneda,tratamiento_impuestos)
  values (v_mandato,pg_catalog.tstzrange(v_mandato_inicio::timestamptz,
    case when v_mandato_fin is null then null::timestamptz
      else (v_mandato_fin+1)::timestamptz end,'[)'),
    'devengado',v_honorario_pct,v_honorario_minimo,v_honorario_fijo,
    coalesce((v_man->>'incluye_punitorios')::boolean,false),v_man->>'moneda',
    coalesce(v_man->'tratamiento_impuestos','{}'::jsonb))
  returning id into v_mandato_version;

  v_docs:=coalesce(p_payload->'documentos','{}'::jsonb);
  if pg_catalog.jsonb_typeof(v_docs)<>'object' or exists (
    select 1 from pg_catalog.jsonb_object_keys(v_docs) k
    where k not in ('contrato','garantia','deposito')
  ) then
    raise exception using errcode='P0001',message='ALQ_ALTA_DOCUMENTOS_INVALIDOS';
  end if;
  v_contrato_doc:=alq_private.alq_alta_integral_documento_v1(
    p_request_id,v_propiedad,v_docs->'contrato','contrato','admin');
  insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,inicio,fin_pactado,estado,pdf_documento_id)
  values (v_propiedad,v_inquilino,v_inicio,v_fin,'vigente',v_contrato_doc)
  returning id into v_contrato;

  v_ajuste:=coalesce(nullif(v_con->>'ajuste_tipo',''),'sin_ajuste');
  v_frecuencia:=nullif(v_con->>'frecuencia_ajuste_meses','')::integer;
  if v_ajuste='porcentaje_fijo' then
    v_pct_fijo:=nullif(v_con->>'pct_fijo','')::numeric;
    if v_pct_fijo is null or v_pct_fijo<0 or v_frecuencia is null or v_frecuencia<=0 then
      raise exception using errcode='P0001',message='ALQ_ALTA_AJUSTE_FIJO_INVALIDO';
    end if;
  elsif v_ajuste='indice' then
    if v_frecuencia is null or v_frecuencia<=0
       or nullif(pg_catalog.btrim(v_con->>'indice_organismo'),'') is null
       or nullif(pg_catalog.btrim(v_con->>'indice_codigo'),'') is null then
      raise exception using errcode='P0001',message='ALQ_ALTA_AJUSTE_INDICE_INVALIDO';
    end if;
    if coalesce(nullif(v_con->>'indice_granularidad',''),'mensual') not in ('diaria','mensual') then
      raise exception using errcode='P0001',message='ALQ_ALTA_AJUSTE_GRANULARIDAD_INVALIDA';
    end if;
    insert into alq.alq_indice_serie(organismo,codigo,granularidad,base,version)
    values (pg_catalog.btrim(v_con->>'indice_organismo'),pg_catalog.btrim(v_con->>'indice_codigo'),
      coalesce(nullif(v_con->>'indice_granularidad',''),'mensual'),
      coalesce(nullif(pg_catalog.btrim(v_con->>'indice_base'),''),'general'),
      coalesce(nullif(pg_catalog.btrim(v_con->>'indice_version'),''),'vigente'))
    on conflict (organismo,codigo,base,version) do update set codigo=excluded.codigo
    returning id into v_indice;
  elsif v_ajuste<>'sin_ajuste' then
    raise exception using errcode='P0001',message='ALQ_ALTA_AJUSTE_TIPO_INVALIDO';
  end if;

  v_punitorio_pct:=coalesce(nullif(v_con->>'punitorio_pct_dia','')::numeric,0);
  v_punitorio_gracia:=coalesce(nullif(v_con->>'punitorio_desde_dia','')::smallint,0);
  v_punitorio_formula:=coalesce(nullif(v_con->>'formula_punitorio_version',''),
    case when v_punitorio_pct=0 then 'sin_mora_automatica' else 'simple_diaria_v1' end);
  if v_punitorio_pct<0 or v_punitorio_pct>1
     or v_punitorio_gracia<0 or v_punitorio_gracia>31
     or (v_punitorio_pct=0 and
       (v_punitorio_gracia<>0 or v_punitorio_formula<>'sin_mora_automatica'))
     or (v_punitorio_pct>0 and v_punitorio_formula<>'simple_diaria_v1') then
    raise exception using errcode='P0001',message='ALQ_ALTA_PUNITORIO_INVALIDO';
  end if;

  insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,dia_pago_desde,
    dia_pago_hasta,indice_serie_id,pct_fijo,frecuencia_ajuste,punitorio_pct_dia,
    punitorio_desde_dia,formula_punitorio_version,metodo_prorrateo,regla_redondeo,
    regla_pago_otra_moneda,fuente_conversion,fallback_indice)
  values (v_contrato,pg_catalog.tstzrange(v_inicio::timestamptz,
    case when v_fin is null then null::timestamptz else (v_fin+1)::timestamptz end,'[)'),
    (v_con->>'monto')::numeric,v_con->>'moneda',(v_con->>'dia_pago_desde')::smallint,
    (v_con->>'dia_pago_hasta')::smallint,v_indice,
    case when v_pct_fijo is null then null else v_pct_fijo end,
    case when v_frecuencia is null then null else pg_catalog.make_interval(months=>v_frecuencia) end,
    v_punitorio_pct,v_punitorio_gracia,v_punitorio_formula,
    coalesce(nullif(v_con->>'metodo_prorrateo',''),'dias_reales'),
    coalesce(nullif(v_con->>'regla_redondeo',''),'centavos'),
    coalesce(nullif(v_con->>'regla_pago_otra_moneda',''),'prohibido'),
    nullif(pg_catalog.btrim(v_con->>'fuente_conversion'),''),
    coalesce(v_con->'fallback_indice','{}'::jsonb))
  returning id into v_contrato_version;

  v_gar:=coalesce(p_payload->'garantia','null'::jsonb);
  if v_gar<>'null'::jsonb then
    if pg_catalog.jsonb_typeof(v_gar)<>'object'
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(v_gar) k
         where k not in ('habilitada','garante','tipo','poliza','emisor','cobertura',
                         'moneda','regla_notificacion_mora')
       ) or coalesce((v_gar->>'habilitada')::boolean,false) is false then
      raise exception using errcode='P0001',message='ALQ_ALTA_GARANTIA_INVALIDA';
    end if;
    v_garante:=alq_private.alq_alta_integral_parte_v1(v_gar->'garante');
    if v_garante=v_inquilino then
      raise exception using errcode='P0001',message='ALQ_ALTA_GARANTE_IGUAL_INQUILINO';
    end if;
    v_garantia_doc:=alq_private.alq_alta_integral_documento_v1(
      p_request_id,v_propiedad,v_docs->'garantia','garantia','admin');
    insert into alq.alq_garantia(contrato_id,garante_parte_id,tipo,poliza,emisor,
      cobertura,moneda,vigencia,documento_id,regla_notificacion_mora)
    values (v_contrato,v_garante,v_gar->>'tipo',nullif(v_gar->>'poliza',''),
      nullif(v_gar->>'emisor',''),nullif(v_gar->>'cobertura','')::numeric,
      nullif(v_gar->>'moneda',''),pg_catalog.tstzrange(v_inicio::timestamptz,
        case when v_fin is null then null else (v_fin+1)::timestamptz end,'[)'),
      v_garantia_doc,coalesce(v_gar->'regla_notificacion_mora','{}'::jsonb))
    returning id into v_garantia;
  end if;

  v_dep:=coalesce(p_payload->'deposito','null'::jsonb);
  if v_dep<>'null'::jsonb and (
      pg_catalog.jsonb_typeof(v_dep)<>'object' or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_dep) k
        where k not in ('registrar_ahora','moneda','monto','custodia')
      )) then
    raise exception using errcode='P0001',message='ALQ_ALTA_DEPOSITO_INVALIDO';
  end if;
  if v_dep<>'null'::jsonb and coalesce((v_dep->>'registrar_ahora')::boolean,false) then
    v_deposito_doc:=alq_private.alq_alta_integral_documento_v1(
      p_request_id,v_propiedad,v_docs->'deposito','deposito_comprobante','admin');
    if v_deposito_doc is null then
      raise exception using errcode='P0001',message='ALQ_ALTA_DEPOSITO_COMPROBANTE_REQUERIDO';
    end if;
    v_custodia:=case v_dep->>'custodia'
      when 'propietario' then v_propietario
      when 'inquilino' then v_inquilino
      when 'administracion' then v_admin_parte
      else null end;
    if v_custodia is null then
      raise exception using errcode='P0001',message='ALQ_ALTA_DEPOSITO_CUSTODIA_INVALIDA';
    end if;
    insert into alq.alq_deposito(contrato_id,moneda,monto_constituido,custodia_parte_id)
    values (v_contrato,v_dep->>'moneda',(v_dep->>'monto')::numeric,v_custodia)
    returning id into v_deposito;
    insert into alq.alq_deposito_evento(deposito_id,tipo,monto,moneda,evidencia_documento_id,operacion_id)
    values (v_deposito,'constitucion',(v_dep->>'monto')::numeric,v_dep->>'moneda',
      v_deposito_doc,v_op.id);
  end if;

  v_servicios_payload:=case
    when p_payload->'servicios' is null or p_payload->'servicios'='null'::jsonb
      then '[]'::jsonb
    else p_payload->'servicios' end;
  if pg_catalog.jsonb_typeof(v_servicios_payload)<>'array'
     or pg_catalog.jsonb_array_length(v_servicios_payload)>20 then
    raise exception using errcode='P0001',message='ALQ_ALTA_SERVICIOS_INVALIDOS';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_servicios_payload)
  loop
    if pg_catalog.jsonb_typeof(v_item)<>'object' or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_item) k
      where k not in ('tipo','nro_cliente','responsable')
    ) then
      raise exception using errcode='P0001',message='ALQ_ALTA_SERVICIO_INVALIDO';
    end if;
    v_responsable:=case v_item->>'responsable'
      when 'propietario' then v_propietario
      when 'inquilino' then v_inquilino
      when 'garante' then v_garante
      when 'administracion' then v_admin_parte
      else null end;
    if v_responsable is null or nullif(pg_catalog.btrim(v_item->>'tipo'),'') is null
       or nullif(pg_catalog.btrim(v_item->>'nro_cliente'),'') is null then
      raise exception using errcode='P0001',message='ALQ_ALTA_SERVICIO_INCOMPLETO';
    end if;
    insert into alq.alq_servicio_cuenta(propiedad_id,tipo,responsable_parte_id,nro_cliente,
      activa,operacion_id)
    values (v_propiedad,pg_catalog.btrim(v_item->>'tipo'),v_responsable,
      pg_catalog.btrim(v_item->>'nro_cliente'),true,v_op.id)
    returning id into v_servicio;
    v_servicios:=pg_catalog.array_append(v_servicios,v_servicio);
  end loop;

  v_result:=pg_catalog.jsonb_build_object(
    'operacion','alta_integral','request_id',p_request_id,'replay',false,
    'propiedad_id',v_propiedad,'propietario_parte_id',v_propietario,
    'inquilino_parte_id',v_inquilino,'garante_parte_id',v_garante,
    'titularidad_id',v_titularidad,'mandato_id',v_mandato,
    'mandato_version_id',v_mandato_version,'contrato_id',v_contrato,
    'contrato_version_id',v_contrato_version,'garantia_id',v_garantia,
    'deposito_id',v_deposito,'servicio_ids',pg_catalog.to_jsonb(v_servicios),
    'documento_contrato_id',v_contrato_doc,'documento_garantia_id',v_garantia_doc,
    'documento_deposito_id',v_deposito_doc);
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values (v_op.id,'operacion',v_op.id,'alta_integral',v_result,v_actor);
  perform alq_private.alq_f1a_writer_context_v1('exit',v_op.id);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,aplicada_at=clock_timestamp()
  where id=v_op.id;
  return v_result;
end
$$;

revoke all on function alq_private.alq_admin_alta_integral_core_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function alq_private.alq_admin_alta_integral_core_v1(uuid,jsonb)
  to authenticated;

create or replace function public.alq_admin_alta_integral(p_request_id uuid,p_payload jsonb)
returns jsonb
language sql
set search_path=''
as $$
  select alq_private.alq_admin_alta_integral_core_v1(p_request_id,p_payload)
$$;

revoke all on function public.alq_admin_alta_integral(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.alq_admin_alta_integral(uuid,jsonb) to authenticated;

create or replace view public.alq_v_indice_serie
with (security_invoker=true)
as
select id,organismo,codigo,granularidad,base,version,creada_at
from alq.alq_indice_serie;

revoke all on public.alq_v_indice_serie from public,anon,authenticated,service_role;
grant select on public.alq_v_indice_serie to authenticated;
grant select on public.alq_v_indice_serie to service_role;

do $$
begin
  if to_regprocedure('public.alq_admin_alta_integral(uuid,jsonb)') is null
     or to_regclass('public.alq_v_indice_serie') is null then
    raise exception using errcode='P0001',message='ALQ_F4_POSTCHECK_OBJETOS';
  end if;
  if has_function_privilege('anon','public.alq_admin_alta_integral(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.alq_admin_alta_integral(uuid,jsonb)','EXECUTE') then
    raise exception using errcode='P0001',message='ALQ_F4_POSTCHECK_ACL';
  end if;
end
$$;

commit;
