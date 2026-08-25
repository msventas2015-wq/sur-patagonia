-- ALQ F1-A · baseline V1 schema-only materializado para PostgreSQL 17.6 local.
-- ALQ_F1A_BASELINE_CONTRACT: MATERIALIZED_LOCAL_PG17_V1
-- NO es migración. Destino único: fixture socket-only creado por el setup sellado.
-- No contiene datos de negocio ni includes históricos. Conserva literalmente las
-- constraints de identidad técnica del corte QA adoptado; la guarda física de
-- ejecución, en cambio, acepta sólo el fixture local sellado.

\set ON_ERROR_STOP on

do $alq_f1a_baseline_guard$
declare v_marker boolean;
begin
  if current_user<>'postgres'
     or current_database()<>'alq_f1a_fixture'
     or current_setting('server_version_num')<>'170006'
     or current_setting('listen_addresses')<>''
     or inet_server_addr() is not null
     or to_regclass('alq_f1a_local.fixture_marca') is null
     or to_regnamespace('alq') is not null
     or to_regnamespace('alq_private') is not null then
    raise exception using errcode='P0001',
      message='ALQ_F1A_BASELINE_DESTINO_O_CORTE_INVALIDO';
  end if;
  select exists(
    select 1 from alq_f1a_local.fixture_marca
    where singleton and data_directory=current_setting('data_directory')
      and socket_directory=current_setting('unix_socket_directories')
  ) into v_marker;
  if not v_marker then
    raise exception using errcode='P0001',
      message='ALQ_F1A_BASELINE_MARCA_FISICA_INVALIDA';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_roles
    where rolname='anon' and not rolcanlogin and not rolinherit and not rolbypassrls
  ) or not exists(
    select 1 from pg_catalog.pg_roles
    where rolname='authenticated' and not rolcanlogin and not rolinherit and not rolbypassrls
  ) or not exists(
    select 1 from pg_catalog.pg_roles
    where rolname='service_role' and not rolcanlogin and not rolinherit and not rolbypassrls
  ) then
    raise exception using errcode='P0001',
      message='ALQ_F1A_BASELINE_ROLES_LOCALES_INVALIDOS';
  end if;
end
$alq_f1a_baseline_guard$;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6 (Postgres.app)
-- Dumped by pg_dump version 17.6 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: alq; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA alq;


--
-- Name: alq_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA alq_private;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: alq_actor_v1(boolean); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_actor_v1(p_requiere_admin boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid;
begin
  select pu.id into v_actor
  from alq.alq_parte_usuario pu
  where pu.auth_user_id=(select auth.uid()) and statement_timestamp()<@pu.vigencia
    and (not p_requiere_admin or exists (
      select 1 from alq.alq_capacidad_admin ca
      where ca.parte_usuario_id=pu.id and statement_timestamp()<@ca.vigencia))
  order by lower(pu.vigencia) desc,pu.id limit 1;
  if v_actor is null then raise exception 'ALQ_ACTOR_SIN_VINCULO'; end if;
  return v_actor;
end
$$;


--
-- Name: alq_admin_aplicar_core_v1(uuid, text, text, jsonb); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_admin_aplicar_core_v1(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  v_result:=alq_private.alq_aplicar_operacion_v1(p_operacion,v_op.payload_normalizado,v_op.id,v_actor);
  set constraints all immediate;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,aplicada_at=clock_timestamp()
    where id=v_op.id;
  return v_result;
end
$$;


--
-- Name: alq_admin_preparar_core_v1(text, jsonb); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_admin_preparar_core_v1(p_operacion text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid; v_request uuid:=pg_catalog.gen_random_uuid();
        v_payload jsonb:=coalesce(p_payload,'{}'::jsonb); v_firma text; v_id uuid;
begin
  v_actor:=alq_private.alq_actor_v1(true);
  if p_operacion is null or not (p_operacion=any(alq_private.alq_operaciones_v1())) then
    raise exception 'ALQ_OPERACION_NO_PERMITIDA:%',coalesce(p_operacion,'NULL');
  end if;
  if jsonb_typeof(v_payload)<>'object' then raise exception 'ALQ_PAYLOAD_NO_ES_OBJETO'; end if;
  v_firma:=alq_private.alq_firma_v1(p_operacion,v_payload);
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,
    estado,actor_parte_usuario_id,preparada_at)
  values (v_request,p_operacion,v_payload,v_firma,'preparada',v_actor,clock_timestamp()) returning id into v_id;
  return jsonb_build_object('request_id',v_request,'operacion_id',v_id,'operacion',p_operacion,'firma',v_firma);
end
$$;


--
-- Name: alq_aplicar_operacion_v1(text, jsonb, uuid, uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_aplicar_operacion_v1(p_operacion text, p_payload jsonb, p_operacion_id uuid, p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid; v_id2 uuid; v_id3 uuid; v_estado text; v_actual text;
        v_uuid uuid; v_total numeric; v_moneda text; v_transferencia uuid;
        v_item jsonb; v_arr jsonb; v_result jsonb; v_rendicion alq.alq_rendicion%rowtype;
begin
  -- I11: cada rama bloquea sus raíces en orden; las compuestas ordenan UUID antes de mutar.
  case p_operacion
  when 'parte_alta' then
    insert into alq.alq_parte(tipo_persona,nombre,documento_tipo,documento_numero,tel_whatsapp,email,notas)
    values (p_payload->>'tipo_persona',p_payload->>'nombre',p_payload->>'documento_tipo',
      p_payload->>'documento_numero',p_payload->>'tel_whatsapp',p_payload->>'email',p_payload->>'notas')
    returning id into v_id;

  when 'parte_editar' then
    v_id:=(p_payload->>'parte_id')::uuid;
    perform 1 from alq.alq_parte where id=v_id for update;
    update alq.alq_parte set
      nombre=coalesce(p_payload->>'nombre',nombre),
      tel_whatsapp=case when p_payload?'tel_whatsapp' then p_payload->>'tel_whatsapp' else tel_whatsapp end,
      email=case when p_payload?'email' then p_payload->>'email' else email end,
      notas=case when p_payload?'notas' then p_payload->>'notas' else notas end,
      actualizada_at=clock_timestamp() where id=v_id;

  when 'propiedad_alta' then
    insert into alq.alq_propiedad(direccion,direccion_norm,ciudad,ciudad_norm,provincia,geo,publicacion_propiedad_id)
    values (p_payload->>'direccion',p_payload->>'direccion_norm',p_payload->>'ciudad',
      p_payload->>'ciudad_norm',p_payload->>'provincia',p_payload->'geo',
      nullif(p_payload->>'publicacion_propiedad_id','')::uuid) returning id into v_id;

  when 'titularidad_asignar' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    insert into alq.alq_titularidad(propiedad_id,parte_id,vigencia)
    values (v_uuid,(p_payload->>'parte_id')::uuid,
      tstzrange((p_payload->>'desde')::timestamptz,nullif(p_payload->>'hasta','')::timestamptz,'[)'))
    returning id into v_id;

  when 'mandato_alta' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    perform 1 from alq.alq_titularidad where id=(p_payload->>'titularidad_id')::uuid
      and propiedad_id=v_uuid for update;
    if not found then raise exception 'ALQ_MANDATO_TITULARIDAD_NO_COINCIDE'; end if;
    insert into alq.alq_mandato(propiedad_id,titularidad_id,vigencia,estado)
    values (v_uuid,(p_payload->>'titularidad_id')::uuid,
      tstzrange((p_payload->>'desde')::timestamptz,nullif(p_payload->>'hasta','')::timestamptz,'[)'),
      'activo') returning id into v_id;

  when 'mandato_baja_avanzar' then
    v_id:=(p_payload->>'mandato_id')::uuid; v_estado:=p_payload->>'estado_destino';
    select estado into v_actual from alq.alq_mandato where id=v_id for update;
    if (v_actual,v_estado) not in (('activo','en_cierre'),('en_cierre','saldo_final'),
      ('saldo_final','export_generado'),('export_generado','export_entregado'),
      ('export_entregado','capacidad_revocada'),('capacidad_revocada','cerrado')) then
      raise exception 'ALQ_MANDATO_TRANSICION_INVALIDA:%->%',v_actual,v_estado;
    end if;
    if v_estado='export_entregado' and not exists (select 1 from alq.alq_export_baja e
      where e.mandato_id=v_id and e.entregado_at is not null) then
      raise exception 'ALQ_MANDATO_EXPORT_NO_ENTREGADO';
    end if;
    update alq.alq_mandato set estado=v_estado,actualizada_at=clock_timestamp(),
      vigencia=case when v_estado='cerrado' then tstzrange(lower(vigencia),clock_timestamp(),'[)') else vigencia end
    where id=v_id;

  when 'contrato_alta' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,predecesor_id,inicio,fin_pactado,
      estado,pdf_documento_id)
    values (v_uuid,(p_payload->>'inquilino_parte_id')::uuid,
      nullif(p_payload->>'predecesor_id','')::uuid,(p_payload->>'inicio')::date,
      nullif(p_payload->>'fin_pactado','')::date,'vigente',nullif(p_payload->>'pdf_documento_id','')::uuid)
    returning id into v_id;

  when 'contrato_version_agregar' then
    v_uuid:=(p_payload->>'contrato_id')::uuid;
    perform 1 from alq.alq_contrato where id=v_uuid for update;
    insert into alq.alq_contrato_version(contrato_id,vigencia,monto,moneda,dia_pago_desde,
      dia_pago_hasta,indice_serie_id,pct_fijo,frecuencia_ajuste,punitorio_pct_dia,
      punitorio_desde_dia,formula_punitorio_version,metodo_prorrateo,regla_redondeo,
      regla_pago_otra_moneda,fuente_conversion,fallback_indice)
    values (v_uuid,tstzrange((p_payload->>'desde')::timestamptz,
      nullif(p_payload->>'hasta','')::timestamptz,'[)'),(p_payload->>'monto')::numeric,
      p_payload->>'moneda',(p_payload->>'dia_pago_desde')::smallint,(p_payload->>'dia_pago_hasta')::smallint,
      nullif(p_payload->>'indice_serie_id','')::uuid,nullif(p_payload->>'pct_fijo','')::numeric,
      nullif(p_payload->>'frecuencia_ajuste','')::interval,coalesce((p_payload->>'punitorio_pct_dia')::numeric,0),
      coalesce((p_payload->>'punitorio_desde_dia')::smallint,0),p_payload->>'formula_punitorio_version',
      p_payload->>'metodo_prorrateo',p_payload->>'regla_redondeo',p_payload->>'regla_pago_otra_moneda',
      p_payload->>'fuente_conversion',p_payload->'fallback_indice') returning id into v_id;

  when 'contrato_renovar' then
    v_uuid:=(p_payload->>'predecesor_id')::uuid;
    perform 1 from alq.alq_contrato where id=v_uuid for update;
    update alq.alq_contrato set estado='cerrado',fin_efectivo=coalesce(fin_efectivo,(p_payload->>'inicio')::date)
      where id=v_uuid;
    insert into alq.alq_contrato(propiedad_id,inquilino_parte_id,predecesor_id,inicio,fin_pactado,estado,pdf_documento_id)
    select propiedad_id,(p_payload->>'inquilino_parte_id')::uuid,v_uuid,(p_payload->>'inicio')::date,
      nullif(p_payload->>'fin_pactado','')::date,'vigente',nullif(p_payload->>'pdf_documento_id','')::uuid
    from alq.alq_contrato where id=v_uuid returning id into v_id;

  when 'contrato_rescindir' then
    v_uuid:=(p_payload->>'contrato_id')::uuid;
    perform 1 from alq.alq_contrato where id=v_uuid for update;
    insert into alq.alq_rescision(contrato_id,notificada_at,efectiva_at,causal,preaviso_dias,
      cargo_penalidad_id,condonacion_nota_id,entrega_llaves_at,documento_id,operacion_id)
    values (v_uuid,(p_payload->>'notificada_at')::timestamptz,(p_payload->>'efectiva_at')::timestamptz,
      p_payload->>'causal',(p_payload->>'preaviso_dias')::int,nullif(p_payload->>'cargo_penalidad_id','')::uuid,
      nullif(p_payload->>'condonacion_nota_id','')::uuid,nullif(p_payload->>'entrega_llaves_at','')::timestamptz,
      nullif(p_payload->>'documento_id','')::uuid,p_operacion_id) returning id into v_id;
    update alq.alq_contrato set estado='rescindido',fin_efectivo=(p_payload->>'efectiva_at')::date,
      actualizado_at=clock_timestamp() where id=v_uuid;

  when 'contrato_continuacion_marcar' then
    v_id:=(p_payload->>'contrato_id')::uuid;
    perform 1 from alq.alq_contrato where id=v_id for update;
    update alq.alq_contrato set estado='continuacion_legal',
      continuacion_desde=(p_payload->>'continuacion_desde')::date,actualizado_at=clock_timestamp()
    where id=v_id and estado='vigente';
    if not found then raise exception 'ALQ_CONTRATO_NO_VIGENTE'; end if;

  when 'garantia_alta' then
    insert into alq.alq_garantia(contrato_id,garante_parte_id,tipo,poliza,emisor,cobertura,
      moneda,vigencia,documento_id,regla_notificacion_mora)
    values ((p_payload->>'contrato_id')::uuid,(p_payload->>'garante_parte_id')::uuid,p_payload->>'tipo',
      p_payload->>'poliza',p_payload->>'emisor',nullif(p_payload->>'cobertura','')::numeric,
      p_payload->>'moneda',tstzrange((p_payload->>'desde')::timestamptz,
      nullif(p_payload->>'hasta','')::timestamptz,'[)'),nullif(p_payload->>'documento_id','')::uuid,
      coalesce(p_payload->'regla_notificacion_mora','{}'::jsonb)) returning id into v_id;

  when 'deposito_evento_registrar' then
    insert into alq.alq_deposito_evento(deposito_id,tipo,monto,moneda,transaccion_id,
      contrato_sucesor_id,evidencia_documento_id,operacion_id)
    values ((p_payload->>'deposito_id')::uuid,p_payload->>'tipo',(p_payload->>'monto')::numeric,
      p_payload->>'moneda',nullif(p_payload->>'transaccion_id','')::uuid,
      nullif(p_payload->>'contrato_sucesor_id','')::uuid,nullif(p_payload->>'evidencia_documento_id','')::uuid,
      p_operacion_id) returning id into v_id;

  when 'deposito_liquidar' then
    insert into alq.alq_deposito_liquidacion(deposito_id,fecha,estado,documento_id,operacion_id)
    values ((p_payload->>'deposito_id')::uuid,(p_payload->>'fecha')::timestamptz,'aprobada',
      nullif(p_payload->>'documento_id','')::uuid,p_operacion_id) returning id into v_id;

  when 'cargo_manual_emitir' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    insert into alq.alq_cargo(propiedad_id,contrato_id,periodo_id,deudor_parte_id,acreedor_parte_id,
      ambito,concepto,moneda,monto,vence_at,origen,operacion_id,snapshot_regla,saldo_pendiente)
    values (v_uuid,nullif(p_payload->>'contrato_id','')::uuid,nullif(p_payload->>'periodo_id','')::uuid,
      (p_payload->>'deudor_parte_id')::uuid,(p_payload->>'acreedor_parte_id')::uuid,p_payload->>'ambito',
      p_payload->>'concepto',p_payload->>'moneda',(p_payload->>'monto')::numeric,
      (p_payload->>'vence_at')::timestamptz,'admin',p_operacion_id,
      coalesce(p_payload->'snapshot_regla','{}'::jsonb),(p_payload->>'monto')::numeric) returning id into v_id;

  when 'nota_emitir' then
    v_uuid:=(p_payload->>'cargo_id')::uuid;
    perform 1 from alq.alq_cargo where id=v_uuid for update;
    insert into alq.alq_nota(tipo,cargo_id,monto,moneda,motivo,aprobador_parte_usuario_id,fecha,operacion_id)
    values (p_payload->>'tipo',v_uuid,(p_payload->>'monto')::numeric,p_payload->>'moneda',p_payload->>'motivo',
      p_actor,coalesce((p_payload->>'fecha')::timestamptz,clock_timestamp()),p_operacion_id) returning id into v_id;
    perform alq_private.alq_recalcular_cargo_v1(v_uuid);

  when 'transaccion_registrar' then
    if nullif(p_payload->>'reversa_de','') is not null
       and exists (select 1 from alq.alq_aplicacion
         where transaccion_id=(p_payload->>'reversa_de')::uuid) then
      raise exception 'ALQ_REVERSA_CON_APLICACIONES_REQUIERE_OPERACION_COMPUESTA';
    end if;
    if (p_payload->>'cuenta_custodia_id') is not null then
      perform 1 from alq.alq_cuenta_custodia where id=(p_payload->>'cuenta_custodia_id')::uuid for update;
    end if;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,reversa_de,operacion_id)
    values (p_payload->>'direccion',p_payload->>'ambito',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,nullif(p_payload->>'cuenta_custodia_id','')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,
      p_payload->>'estado',nullif(p_payload->>'reversa_de','')::uuid,p_operacion_id) returning id into v_id;
    if (p_payload->>'reversa_de') is not null then perform alq_private.alq_validar_reversa_v1(v_id); end if;

  when 'conversion_registrar' then
    insert into alq.alq_conversion_moneda(importe_origen,moneda_origen,importe_destino,moneda_destino,
      tasa,fuente,fecha,regla_redondeo,evidencia_documento_id,aprobador_parte_usuario_id,operacion_id)
    values ((p_payload->>'importe_origen')::numeric,p_payload->>'moneda_origen',
      (p_payload->>'importe_destino')::numeric,p_payload->>'moneda_destino',(p_payload->>'tasa')::numeric,
      p_payload->>'fuente',(p_payload->>'fecha')::timestamptz,p_payload->>'regla_redondeo',
      nullif(p_payload->>'evidencia_documento_id','')::uuid,p_actor,p_operacion_id) returning id into v_id;
    perform 1 from alq.alq_conversion_moneda cv where cv.id=v_id and
      cv.importe_destino=alq_private.alq_redondear_v1(cv.importe_origen*cv.tasa,cv.regla_redondeo);
    if not found then raise exception 'ALQ_CONVERSION_ARITMETICA_INVALIDA'; end if;

  when 'aplicacion_asignar' then
    insert into alq.alq_aplicacion(transaccion_id,cargo_id,deposito_evento_id,rendicion_id,credito_id,
      importe_origen,moneda_origen,importe_destino,moneda_destino,conversion_id,operacion_id)
    values ((p_payload->>'transaccion_id')::uuid,nullif(p_payload->>'cargo_id','')::uuid,
      nullif(p_payload->>'deposito_evento_id','')::uuid,nullif(p_payload->>'rendicion_id','')::uuid,
      nullif(p_payload->>'credito_id','')::uuid,(p_payload->>'importe_origen')::numeric,
      p_payload->>'moneda_origen',(p_payload->>'importe_destino')::numeric,p_payload->>'moneda_destino',
      nullif(p_payload->>'conversion_id','')::uuid,p_operacion_id) returning id into v_id;
    perform alq_private.alq_validar_aplicacion_v1(v_id);

  when 'ajuste_calcular' then
    v_uuid:=(p_payload->>'contrato_version_base_id')::uuid;
    perform 1 from alq.alq_contrato_version where id=v_uuid for update;
    insert into alq.alq_ajuste(contrato_version_base_id,estado,formula_version,
      resultado_sin_redondear,resultado_final,operacion_id)
    values (v_uuid,coalesce(p_payload->>'estado','calculado'),p_payload->>'formula_version',
      nullif(p_payload->>'resultado_sin_redondear','')::numeric,
      nullif(p_payload->>'resultado_final','')::numeric,p_operacion_id) returning id into v_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'observacion_ids','[]'::jsonb))
    loop insert into alq.alq_ajuste_observacion(ajuste_id,observacion_id)
      values (v_id,(v_item#>>'{}')::uuid); end loop;

  when 'ajuste_aprobar' then
    v_id:=(p_payload->>'ajuste_id')::uuid;
    perform 1 from alq.alq_ajuste where id=v_id for update;
    update alq.alq_ajuste set estado='aprobado',aprobador_parte_usuario_id=p_actor where id=v_id
      and estado='calculado';
    if not found then raise exception 'ALQ_AJUSTE_NO_CALCULADO'; end if;

  when 'ajuste_aplicar' then
    v_id:=(p_payload->>'ajuste_id')::uuid;
    perform 1 from alq.alq_ajuste where id=v_id for update;
    update alq.alq_ajuste set estado='aplicado',aplicado_at=clock_timestamp() where id=v_id
      and estado='aprobado' and resultado_final is not null;
    if not found then raise exception 'ALQ_AJUSTE_NO_APROBADO'; end if;

  when 'servicio_cuenta_alta' then
    insert into alq.alq_servicio_cuenta(propiedad_id,tipo,responsable_parte_id,nro_cliente,activa,operacion_id)
    values ((p_payload->>'propiedad_id')::uuid,p_payload->>'tipo',
      (p_payload->>'responsable_parte_id')::uuid,p_payload->>'nro_cliente',true,p_operacion_id)
    returning id into v_id;

  when 'servicio_factura_registrar' then
    v_uuid:=(p_payload->>'cuenta_id')::uuid;
    perform 1 from alq.alq_servicio_cuenta where id=v_uuid for update;
    insert into alq.alq_servicio_factura(cuenta_id,propiedad_id,periodo,moneda,monto,vence_at,
      comprobante_documento_id,cargo_id,saldada,operacion_id)
    select v_uuid,s.propiedad_id,daterange((p_payload->>'desde')::date,(p_payload->>'hasta')::date,'[)'),
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'vence_at')::timestamptz,
      nullif(p_payload->>'comprobante_documento_id','')::uuid,nullif(p_payload->>'cargo_id','')::uuid,
      false,p_operacion_id from alq.alq_servicio_cuenta s where s.id=v_uuid returning id into v_id;
    if (p_payload->>'cargo_id') is not null then
      if not exists (select 1 from alq.alq_servicio_factura f join alq.alq_cargo c on c.id=f.cargo_id
        where f.id=v_id and c.propiedad_id=f.propiedad_id and c.moneda=f.moneda and c.monto=f.monto) then
        raise exception 'ALQ_SERVICIO_CARGO_NO_COINCIDE';
      end if;
      update alq.alq_servicio_factura f set saldada=(select c.saldo_pendiente=0 from alq.alq_cargo c where c.id=f.cargo_id)
      where f.id=v_id;
    end if;

  when 'rendicion_emitir' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    perform 1 from alq.alq_mandato_version mv join alq.alq_mandato m on m.id=mv.mandato_id
      where mv.id=(p_payload->>'mandato_version_id')::uuid and m.propiedad_id=v_uuid
      for update of m,mv;
    if not found then raise exception 'ALQ_RENDICION_MANDATO_NO_COINCIDE'; end if;
    insert into alq.alq_rendicion(propiedad_id,mandato_version_id,periodo,moneda,saldo_inicial,
      saldo_final,estado,documento_id,sucesora_de,operacion_id,emitida_at)
    values (v_uuid,(p_payload->>'mandato_version_id')::uuid,(p_payload->>'periodo')::date,
      p_payload->>'moneda',(p_payload->>'saldo_inicial')::numeric,null,'borrador',
      nullif(p_payload->>'documento_id','')::uuid,null,p_operacion_id,null) returning id into v_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb))
    loop
      insert into alq.alq_rendicion_linea(rendicion_id,cargo_id,transaccion_id,nota_id,monto,moneda,signo,categoria,snapshot)
      values (v_id,nullif(v_item->>'cargo_id','')::uuid,nullif(v_item->>'transaccion_id','')::uuid,
        nullif(v_item->>'nota_id','')::uuid,(v_item->>'monto')::numeric,v_item->>'moneda',
        (v_item->>'signo')::smallint,v_item->>'categoria',coalesce(v_item->'snapshot','{}'::jsonb));
    end loop;
    select saldo_inicial+coalesce(sum(l.monto*l.signo),0) into v_total
    from alq.alq_rendicion r left join alq.alq_rendicion_linea l on l.rendicion_id=r.id
    where r.id=v_id group by r.saldo_inicial;
    if exists (select 1 from alq.alq_rendicion_linea where rendicion_id=v_id and moneda<>(select moneda from alq.alq_rendicion where id=v_id)) then
      raise exception 'ALQ_I10_RENDICION_MEZCLA_MONEDA';
    end if;
    update alq.alq_rendicion set saldo_final=v_total,estado='emitida',emitida_at=clock_timestamp() where id=v_id;

  when 'giro_registrar' then
    -- Alias V1 conservado: misma operación atómica que giro_a_propietario.
    p_operacion:='giro_a_propietario';
    v_rendicion.id:=(p_payload->>'rendicion_id')::uuid;
    perform 1 from alq.alq_rendicion where id=v_rendicion.id for update;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,operacion_id)
    values ('salida','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_custodia_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',p_operacion_id)
    returning id into v_id2;
    insert into alq.alq_aplicacion(transaccion_id,rendicion_id,importe_origen,moneda_origen,
      importe_destino,moneda_destino,operacion_id)
    values (v_id2,v_rendicion.id,(p_payload->>'monto')::numeric,p_payload->>'moneda',
      (p_payload->>'monto')::numeric,p_payload->>'moneda',p_operacion_id) returning id into v_id;

  when 'rendicion_corregir' then
    v_uuid:=(p_payload->>'rendicion_original_id')::uuid;
    select * into v_rendicion from alq.alq_rendicion where id=v_uuid for update;
    if v_rendicion.estado not in ('emitida','corregida') then raise exception 'ALQ_RENDICION_NO_EMITIDA'; end if;
    insert into alq.alq_rendicion(propiedad_id,mandato_version_id,periodo,moneda,saldo_inicial,
      estado,documento_id,sucesora_de,operacion_id)
    values (v_rendicion.propiedad_id,v_rendicion.mandato_version_id,v_rendicion.periodo,
      v_rendicion.moneda,v_rendicion.saldo_inicial,'borrador',(p_payload->>'documento_id')::uuid,
      v_uuid,p_operacion_id) returning id into v_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb))
    loop
      insert into alq.alq_rendicion_linea(rendicion_id,cargo_id,transaccion_id,nota_id,monto,moneda,signo,categoria,snapshot)
      values (v_id,nullif(v_item->>'cargo_id','')::uuid,nullif(v_item->>'transaccion_id','')::uuid,
        nullif(v_item->>'nota_id','')::uuid,(v_item->>'monto')::numeric,v_item->>'moneda',
        (v_item->>'signo')::smallint,v_item->>'categoria',coalesce(v_item->'snapshot','{}'::jsonb));
    end loop;
    select saldo_inicial+coalesce(sum(l.monto*l.signo),0) into v_total
    from alq.alq_rendicion r left join alq.alq_rendicion_linea l on l.rendicion_id=r.id
    where r.id=v_id group by r.saldo_inicial;
    if exists (select 1 from alq.alq_rendicion_linea where rendicion_id=v_id
      and moneda<>v_rendicion.moneda) then raise exception 'ALQ_I10_CORRECCION_MEZCLA_MONEDA'; end if;
    update alq.alq_rendicion set saldo_final=v_total,estado='corregida',emitida_at=clock_timestamp()
    where id=v_id;

  when 'factura_externa_registrar' then
    insert into alq.alq_factura_externa(fecha_emision,emisor_cuit,emisor_condicion_fiscal,
      receptor_cuit,receptor_condicion_fiscal,tipo,punto_numero,moneda,neto,impuestos,total,
      cae,vto_cae,estado,documento_id,operacion_id)
    values ((p_payload->>'fecha_emision')::date,p_payload->>'emisor_cuit',p_payload->'emisor_condicion_fiscal',
      p_payload->>'receptor_cuit',p_payload->'receptor_condicion_fiscal',p_payload->>'tipo',
      p_payload->>'punto_numero',p_payload->>'moneda',(p_payload->>'neto')::numeric,
      (p_payload->>'impuestos')::numeric,(p_payload->>'total')::numeric,p_payload->>'cae',
      nullif(p_payload->>'vto_cae','')::date,p_payload->>'estado',(p_payload->>'documento_id')::uuid,
      p_operacion_id) returning id into v_id;

  when 'comunicado_abrir' then
    insert into alq.alq_comunicado(propiedad_id,abierto_por_tipo,abierto_por_parte_id,estado,operacion_id)
    values ((p_payload->>'propiedad_id')::uuid,p_payload->>'abierto_por_tipo',
      nullif(p_payload->>'abierto_por_parte_id','')::uuid,'abierto',p_operacion_id) returning id into v_id;
    insert into alq.alq_comunicado_mensaje(comunicado_id,autor_tipo,autor_parte_usuario_id,texto,operacion_id)
    values (v_id,p_payload->>'autor_tipo',nullif(p_payload->>'autor_parte_usuario_id','')::uuid,
      p_payload->>'texto',p_operacion_id);

  when 'comunicado_responder' then
    v_uuid:=(p_payload->>'comunicado_id')::uuid;
    perform 1 from alq.alq_comunicado where id=v_uuid and estado='abierto' for update;
    if not found then raise exception 'ALQ_COMUNICADO_NO_ABIERTO'; end if;
    insert into alq.alq_comunicado_mensaje(comunicado_id,autor_tipo,autor_parte_usuario_id,texto,operacion_id)
    values (v_uuid,'admin',p_actor,p_payload->>'texto',p_operacion_id) returning id into v_id;

  when 'comunicado_resolver' then
    v_id:=(p_payload->>'comunicado_id')::uuid;
    perform 1 from alq.alq_comunicado where id=v_id for update;
    update alq.alq_comunicado set estado='resuelto',resuelto_at=clock_timestamp() where id=v_id and estado='abierto';
    if not found then raise exception 'ALQ_COMUNICADO_NO_ABIERTO'; end if;

  when 'documento_registrar' then
    insert into alq.alq_documento(tipo,path,sha256,mime,bytes,version,propiedad_id,mandato_id,audiencia,retencion)
    values (p_payload->>'tipo',p_payload->>'path',p_payload->>'sha256',p_payload->>'mime',
      (p_payload->>'bytes')::bigint,coalesce((p_payload->>'version')::int,1),
      nullif(p_payload->>'propiedad_id','')::uuid,nullif(p_payload->>'mandato_id','')::uuid,
      p_payload->>'audiencia',coalesce(p_payload->'retencion','{}'::jsonb)) returning id into v_id;

  when 'export_baja_generar' then
    v_uuid:=(p_payload->>'mandato_id')::uuid;
    perform 1 from alq.alq_mandato where id=v_uuid and estado='saldo_final' for update;
    if not found then raise exception 'ALQ_MANDATO_NO_ESTA_EN_SALDO_FINAL'; end if;
    insert into alq.alq_export_baja(mandato_id,corte_temporal,manifiesto,documento_id,generado_at,operacion_id)
    values (v_uuid,(p_payload->>'corte_temporal')::timestamptz,p_payload->'manifiesto',
      (p_payload->>'documento_id')::uuid,clock_timestamp(),p_operacion_id) returning id into v_id;
    update alq.alq_mandato set estado='export_generado',actualizada_at=clock_timestamp() where id=v_uuid;

  when 'export_baja_entregar' then
    v_id:=(p_payload->>'export_id')::uuid;
    perform 1 from alq.alq_export_baja where id=v_id and entregado_at is null for update;
    update alq.alq_export_baja set entregado_at=clock_timestamp(),
      constancia_recibo=p_payload->>'constancia_recibo' where id=v_id;
    update alq.alq_mandato set estado='export_entregado',actualizada_at=clock_timestamp()
      where id=(select mandato_id from alq.alq_export_baja where id=v_id) and estado='export_generado';

  when 'acceso_revocar' then
    v_id:=(p_payload->>'acceso_id')::uuid;
    perform 1 from alq.alq_acceso_propiedad where id=v_id for update;
    update alq.alq_acceso_propiedad set vigencia=tstzrange(lower(vigencia),clock_timestamp(),'[)')
      where id=v_id and upper_inf(vigencia);
    if not found then raise exception 'ALQ_ACCESO_NO_ACTIVO'; end if;

  when 'parte_usuario_vincular' then
    v_uuid:=(p_payload->>'parte_id')::uuid;
    perform 1 from alq.alq_parte where id=v_uuid for update;
    if not found then raise exception 'ALQ_PARTE_INEXISTENTE'; end if;
    if not exists (select 1 from auth.users u where u.id=(p_payload->>'auth_user_id')::uuid) then
      raise exception 'ALQ_AUTH_USER_INEXISTENTE';
    end if;
    insert into alq.alq_parte_usuario(parte_id,auth_user_id,vigencia)
    values (v_uuid,(p_payload->>'auth_user_id')::uuid,
      tstzrange((p_payload->>'desde')::timestamptz,nullif(p_payload->>'hasta','')::timestamptz,'[)'))
    returning id into v_id;

  when 'acceso_otorgar' then
    v_uuid:=(p_payload->>'propiedad_id')::uuid;
    perform 1 from alq.alq_propiedad where id=v_uuid for update;
    if not found then raise exception 'ALQ_PROPIEDAD_INEXISTENTE'; end if;
    if not exists (select 1 from alq.alq_parte_usuario pu
        where pu.id=(p_payload->>'parte_usuario_id')::uuid
          and statement_timestamp()<@pu.vigencia) then
      raise exception 'ALQ_ACCESO_PARTE_USUARIO_NO_VIGENTE';
    end if;
    if not exists (select 1 from alq.alq_titularidad t
        join alq.alq_parte_usuario pu on pu.id=(p_payload->>'parte_usuario_id')::uuid
        where t.propiedad_id=v_uuid and t.parte_id=pu.parte_id
          and statement_timestamp()<@t.vigencia) then
      raise exception 'ALQ_ACCESO_REQUIERE_TITULARIDAD_VIGENTE';
    end if;
    insert into alq.alq_acceso_propiedad(parte_usuario_id,propiedad_id,vigencia)
    values ((p_payload->>'parte_usuario_id')::uuid,v_uuid,
      tstzrange((p_payload->>'desde')::timestamptz,nullif(p_payload->>'hasta','')::timestamptz,'[)'))
    returning id into v_id;

  when 'mandato_version_agregar' then
    v_uuid:=(p_payload->>'mandato_id')::uuid;
    select estado into v_actual from alq.alq_mandato where id=v_uuid for update;
    if not found then raise exception 'ALQ_MANDATO_INEXISTENTE'; end if;
    if v_actual<>'activo' then raise exception 'ALQ_MANDATO_NO_ACTIVO:%',v_actual; end if;
    insert into alq.alq_mandato_version(mandato_id,vigencia,honorario_base,honorario_pct,
      honorario_minimo,honorario_fijo,incluye_punitorios,moneda,tratamiento_impuestos)
    values (v_uuid,
      tstzrange((p_payload->>'desde')::timestamptz,nullif(p_payload->>'hasta','')::timestamptz,'[)'),
      p_payload->>'honorario_base',(p_payload->>'honorario_pct')::numeric,
      coalesce(nullif(p_payload->>'honorario_minimo','')::numeric,0),
      coalesce(nullif(p_payload->>'honorario_fijo','')::numeric,0),
      coalesce((p_payload->>'incluye_punitorios')::boolean,false),
      p_payload->>'moneda',
      coalesce(p_payload->'tratamiento_impuestos','{}'::jsonb)) returning id into v_id;

  when 'transferencia_interna' then
    v_transferencia:=pg_catalog.gen_random_uuid();
    for v_uuid in select x from unnest(array[(p_payload->>'cuenta_origen_id')::uuid,
      (p_payload->>'cuenta_destino_id')::uuid]) x order by x
    loop perform 1 from alq.alq_cuenta_custodia where id=v_uuid and activa for update; end loop;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,estado,transferencia_id,operacion_id)
    values ('salida','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_origen_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio','confirmada',v_transferencia,p_operacion_id) returning id into v_id;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,estado,transferencia_id,operacion_id)
    values ('entrada','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_destino_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio','confirmada',v_transferencia,p_operacion_id) returning id into v_id2;
    perform alq_private.alq_validar_transferencia_v1(v_transferencia);
    v_result:=jsonb_build_object('transferencia_id',v_transferencia,'salida_id',v_id,'entrada_id',v_id2);
    v_id:=null;

  when 'reversa_con_reapertura' then
    v_uuid:=(p_payload->>'original_id')::uuid;
    perform 1 from alq.alq_transaccion_caja where id=v_uuid for update;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,reversa_de,operacion_id)
    select case direccion when 'entrada' then 'salida' else 'entrada' end,ambito,
      (p_payload->>'contraparte_parte_id')::uuid,(p_payload->>'beneficiario_parte_id')::uuid,
      cuenta_custodia_id,moneda,(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',id,p_operacion_id
    from alq.alq_transaccion_caja where id=v_uuid returning id into v_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'reaperturas','[]'::jsonb))
    loop
      insert into alq.alq_aplicacion_reversa(reversa_transaccion_id,aplicacion_original_id,
        importe_origen_revertido,moneda_origen,importe_destino_reabierto,moneda_destino,
        conversion_reversa_id,operacion_id)
      values (v_id,(v_item->>'aplicacion_original_id')::uuid,(v_item->>'importe_origen_revertido')::numeric,
        v_item->>'moneda_origen',(v_item->>'importe_destino_reabierto')::numeric,v_item->>'moneda_destino',
        nullif(v_item->>'conversion_reversa_id','')::uuid,p_operacion_id);
    end loop;
    perform alq_private.alq_validar_reversa_v1(v_id);

  when 'pago_multimoneda' then
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,operacion_id)
    values ('entrada',p_payload->>'ambito',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,nullif(p_payload->>'cuenta_custodia_id','')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',p_operacion_id)
    returning id into v_id;
    for v_item in select value from jsonb_array_elements(p_payload->'aplicaciones')
    loop
      v_id2:=null;
      if v_item?'conversion' then
        insert into alq.alq_conversion_moneda(importe_origen,moneda_origen,importe_destino,moneda_destino,
          tasa,fuente,fecha,regla_redondeo,evidencia_documento_id,aprobador_parte_usuario_id,operacion_id)
        values ((v_item#>>'{conversion,importe_origen}')::numeric,v_item#>>'{conversion,moneda_origen}',
          (v_item#>>'{conversion,importe_destino}')::numeric,v_item#>>'{conversion,moneda_destino}',
          (v_item#>>'{conversion,tasa}')::numeric,v_item#>>'{conversion,fuente}',
          (v_item#>>'{conversion,fecha}')::timestamptz,v_item#>>'{conversion,regla_redondeo}',
          nullif(v_item#>>'{conversion,evidencia_documento_id}','')::uuid,p_actor,p_operacion_id)
        returning id into v_id2;
      end if;
      insert into alq.alq_aplicacion(transaccion_id,cargo_id,credito_id,importe_origen,moneda_origen,
        importe_destino,moneda_destino,conversion_id,operacion_id)
      values (v_id,nullif(v_item->>'cargo_id','')::uuid,nullif(v_item->>'credito_id','')::uuid,
        (v_item->>'importe_origen')::numeric,v_item->>'moneda_origen',(v_item->>'importe_destino')::numeric,
        v_item->>'moneda_destino',v_id2,p_operacion_id) returning id into v_id3;
      perform alq_private.alq_validar_aplicacion_v1(v_id3);
    end loop;

  when 'credito_consumir' then
    for v_uuid in select x from unnest(array[(p_payload->>'cargo_id')::uuid,
      (p_payload->>'credito_id')::uuid]) x order by x loop perform pg_advisory_xact_lock(hashtextextended(v_uuid::text,0)); end loop;
    insert into alq.alq_credito_consumo(credito_id,cargo_id,monto,moneda,operacion_id)
    values ((p_payload->>'credito_id')::uuid,(p_payload->>'cargo_id')::uuid,
      (p_payload->>'monto')::numeric,p_payload->>'moneda',p_operacion_id) returning id into v_id;
    perform alq_private.alq_recalcular_credito_v1((p_payload->>'credito_id')::uuid);
    perform alq_private.alq_recalcular_cargo_v1((p_payload->>'cargo_id')::uuid);

  when 'credito_devolver' then
    v_uuid:=(p_payload->>'credito_id')::uuid;
    perform 1 from alq.alq_credito where id=v_uuid for update;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,operacion_id)
    values ('salida','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_custodia_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',p_operacion_id)
    returning id into v_id2;
    insert into alq.alq_aplicacion(transaccion_id,credito_id,importe_origen,moneda_origen,
      importe_destino,moneda_destino,operacion_id)
    values (v_id2,v_uuid,(p_payload->>'monto')::numeric,p_payload->>'moneda',
      (p_payload->>'monto')::numeric,p_payload->>'moneda',p_operacion_id) returning id into v_id;
    perform alq_private.alq_validar_aplicacion_v1(v_id);

  when 'deposito_liquidar_y_devolver' then
    v_uuid:=(p_payload->>'deposito_id')::uuid;
    perform 1 from alq.alq_deposito where id=v_uuid for update;
    insert into alq.alq_deposito_liquidacion(deposito_id,fecha,estado,documento_id,operacion_id)
    values (v_uuid,(p_payload->>'fecha')::timestamptz,'aprobada',
      nullif(p_payload->>'documento_id','')::uuid,p_operacion_id) returning id into v_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'lineas','[]'::jsonb))
    loop insert into alq.alq_deposito_liquidacion_linea(liquidacion_id,concepto,monto,moneda,
      evidencia_documento_id,cargo_residual_id) values (v_id,v_item->>'concepto',
      (v_item->>'monto')::numeric,v_item->>'moneda',nullif(v_item->>'evidencia_documento_id','')::uuid,
      nullif(v_item->>'cargo_residual_id','')::uuid); end loop;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,operacion_id)
    values ('salida','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_custodia_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto_devolver')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',p_operacion_id)
    returning id into v_id2;
    insert into alq.alq_deposito_evento(deposito_id,tipo,monto,moneda,transaccion_id,
      evidencia_documento_id,operacion_id)
    values (v_uuid,'devolucion',(p_payload->>'monto_devolver')::numeric,p_payload->>'moneda',v_id2,
      nullif(p_payload->>'comprobante_documento_id','')::uuid,p_operacion_id);
    update alq.alq_deposito_liquidacion set estado='pagada' where id=v_id;

  when 'giro_a_propietario' then
    v_rendicion.id:=(p_payload->>'rendicion_id')::uuid;
    perform 1 from alq.alq_rendicion where id=v_rendicion.id for update;
    insert into alq.alq_transaccion_caja(direccion,ambito,contraparte_parte_id,beneficiario_parte_id,
      cuenta_custodia_id,moneda,monto,fecha,medio,comprobante_documento_id,estado,operacion_id)
    values ('salida','custodiada',(p_payload->>'contraparte_parte_id')::uuid,
      (p_payload->>'beneficiario_parte_id')::uuid,(p_payload->>'cuenta_custodia_id')::uuid,
      p_payload->>'moneda',(p_payload->>'monto')::numeric,(p_payload->>'fecha')::timestamptz,
      p_payload->>'medio',nullif(p_payload->>'comprobante_documento_id','')::uuid,'confirmada',p_operacion_id)
    returning id into v_id2;
    insert into alq.alq_aplicacion(transaccion_id,rendicion_id,importe_origen,moneda_origen,
      importe_destino,moneda_destino,operacion_id)
    values (v_id2,v_rendicion.id,(p_payload->>'monto')::numeric,p_payload->>'moneda',
      (p_payload->>'monto')::numeric,p_payload->>'moneda',p_operacion_id) returning id into v_id;

  else
    raise exception 'ALQ_OPERACION_SIN_IMPLEMENTACION:%',p_operacion;
  end case;
  if v_id is not null then
    v_result:=jsonb_build_object('id',v_id,'operacion',p_operacion);
  end if;
  v_result:=coalesce(v_result,jsonb_build_object('operacion',p_operacion));
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values (p_operacion_id,'operacion',p_operacion_id,p_operacion,v_result,p_actor);
  return v_result;
end
$$;


--
-- Name: alq_assert_global_v1(); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_assert_global_v1() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from alq.alq_transaccion_caja t where
    (select coalesce(sum(a.importe_origen),0) from alq.alq_aplicacion a where a.transaccion_id=t.id)>t.monto)
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
    +coalesce((select sum(ar.importe_destino_reabierto) from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id where a.cargo_id=c.id),0))
  then raise exception 'ALQ_ASSERT_SALDO_CARGO'; end if;
  if exists (select 1 from alq.alq_credito cr where cr.saldo_pendiente<>
    cr.monto_original-coalesce((select sum(cc.monto) from alq.alq_credito_consumo cc where cc.credito_id=cr.id),0)
    -coalesce((select sum(a.importe_destino) from alq.alq_aplicacion a join alq.alq_transaccion_caja t on t.id=a.transaccion_id
      where a.credito_id=cr.id and t.direccion='salida' and t.estado='confirmada'),0)
    +coalesce((select sum(ar.importe_destino_reabierto) from alq.alq_aplicacion_reversa ar
      join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id where a.credito_id=cr.id),0))
  then raise exception 'ALQ_ASSERT_SALDO_CREDITO'; end if;
  if exists (select 1 from alq.alq_transaccion_caja where transferencia_id is not null group by transferencia_id
    having count(*)<>2 or count(distinct direccion)<>2 or count(distinct monto)<>1
      or count(distinct moneda)<>1 or count(distinct cuenta_custodia_id)<>2)
  then raise exception 'ALQ_ASSERT_I9'; end if;
  if exists (select 1 from alq.alq_rendicion r where r.estado in ('emitida','corregida') and
    (exists (select 1 from alq.alq_rendicion_linea l where l.rendicion_id=r.id and l.moneda<>r.moneda)
     or r.saldo_final<>r.saldo_inicial+coalesce((select sum(l.monto*l.signo)
        from alq.alq_rendicion_linea l where l.rendicion_id=r.id),0)))
  then raise exception 'ALQ_ASSERT_I10'; end if;
  if exists (select 1 from alq.alq_rendicion r where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a where a.rendicion_id=r.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.rendicion_id=r.id)>greatest(r.saldo_final,0))
  then raise exception 'ALQ_ASSERT_GIROS_RENDICION'; end if;
  if exists (select 1 from alq.alq_deposito_evento de where
    (select coalesce(sum(a.importe_destino),0) from alq.alq_aplicacion a
      where a.deposito_evento_id=de.id)
    -(select coalesce(sum(ar.importe_destino_reabierto),0)
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.deposito_evento_id=de.id)>de.monto)
  then raise exception 'ALQ_ASSERT_APLICACION_DEPOSITO'; end if;
  if exists (select 1 from alq.alq_servicio_factura f join alq.alq_cargo c on c.id=f.cargo_id
    where f.saldada is distinct from (c.saldo_pendiente=0)
      or f.propiedad_id<>c.propiedad_id or f.moneda<>c.moneda or f.monto<>c.monto)
  then raise exception 'ALQ_ASSERT_SERVICIO_PROYECCION'; end if;
  return 'ALQ_ASSERT_GLOBAL_OK';
end
$$;


--
-- Name: alq_constraint_check_v1(); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_constraint_check_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_table_name='alq_transaccion_caja' then
    if coalesce(new.transferencia_id,old.transferencia_id) is not null then
      perform alq_private.alq_validar_transferencia_v1(coalesce(new.transferencia_id,old.transferencia_id));
    end if;
    if coalesce(new.reversa_de,old.reversa_de) is not null then
      perform alq_private.alq_validar_reversa_v1(coalesce(new.id,old.id));
    end if;
  elsif tg_table_name='alq_aplicacion' then
    perform alq_private.alq_validar_aplicacion_v1(coalesce(new.id,old.id));
  elsif tg_table_name='alq_aplicacion_reversa' then
    perform alq_private.alq_validar_reversa_v1(coalesce(new.reversa_transaccion_id,old.reversa_transaccion_id));
  end if;
  return null;
end
$$;


--
-- Name: alq_es_admin_v1(); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_es_admin_v1() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from alq.alq_parte_usuario pu
    join alq.alq_capacidad_admin ca on ca.parte_usuario_id=pu.id
    where pu.auth_user_id=(select auth.uid())
      and statement_timestamp()<@pu.vigencia
      and statement_timestamp()<@ca.vigencia
  )
$$;


--
-- Name: alq_firma_v1(text, jsonb); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_firma_v1(p_operacion text, p_payload jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select encode(extensions.digest(convert_to(p_operacion||E'\n'||p_payload::text,'UTF8'),'sha256'),'hex')
$$;


--
-- Name: alq_journal_inmutable_v1(); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_journal_inmutable_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin raise exception 'ALQ_JOURNAL_APPEND_ONLY'; end $$;


--
-- Name: alq_operaciones_v1(); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_operaciones_v1() RETURNS text[]
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
 'credito_consumir','deposito_liquidar_y_devolver','giro_a_propietario','parte_usuario_vincular','acceso_otorgar','mandato_version_agregar'
]::text[]
$$;


--
-- Name: alq_prop_operar_v1(text, jsonb); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_prop_operar_v1(p_operacion text, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid; v_request uuid:=pg_catalog.gen_random_uuid(); v_firma text;
        v_operacion_id uuid; v_result jsonb; v_propiedad uuid; v_comunicado uuid; v_mensaje uuid;
begin
  if p_operacion not in ('comunicado_abrir','comunicado_responder') then
    raise exception 'ALQ_OPERACION_PROPIETARIO_NO_PERMITIDA';
  end if;
  if p_operacion='comunicado_abrir' then v_propiedad:=(p_payload->>'propiedad_id')::uuid;
  else
    v_comunicado:=(p_payload->>'comunicado_id')::uuid;
    select propiedad_id into v_propiedad from alq.alq_comunicado where id=v_comunicado;
  end if;
  select pu.id into v_actor
  from alq.alq_parte_usuario pu
  join alq.alq_acceso_propiedad ap on ap.parte_usuario_id=pu.id
  where pu.auth_user_id=(select auth.uid()) and ap.propiedad_id=v_propiedad
    and statement_timestamp()<@pu.vigencia and statement_timestamp()<@ap.vigencia
  order by lower(ap.vigencia) desc,pu.id limit 1;
  if v_actor is null then raise exception 'ALQ_PROPIETARIO_SIN_ACCESO'; end if;
  v_firma:=alq_private.alq_firma_v1(p_operacion,p_payload);
  insert into alq.alq_operacion(request_id,operacion,payload_normalizado,firma_sha256,estado,
    actor_parte_usuario_id,preparada_at)
  values (v_request,p_operacion,p_payload,v_firma,'preparada',v_actor,clock_timestamp()) returning id into v_operacion_id;
  if p_operacion='comunicado_abrir' then
    insert into alq.alq_comunicado(propiedad_id,abierto_por_tipo,abierto_por_parte_id,estado,operacion_id)
    select v_propiedad,'propietario',pu.parte_id,'abierto',v_operacion_id from alq.alq_parte_usuario pu
    where pu.id=v_actor returning id into v_comunicado;
    insert into alq.alq_comunicado_mensaje(comunicado_id,autor_tipo,autor_parte_usuario_id,texto,operacion_id)
    values (v_comunicado,'propietario',v_actor,p_payload->>'texto',v_operacion_id) returning id into v_mensaje;
    if (p_payload->>'adjunto_documento_id') is not null then
      insert into alq.alq_comunicado_adjunto(mensaje_id,documento_id)
      values (v_mensaje,(p_payload->>'adjunto_documento_id')::uuid);
    end if;
    v_result:=jsonb_build_object('comunicado_id',v_comunicado,'mensaje_id',v_mensaje);
  else
    perform 1 from alq.alq_comunicado where id=v_comunicado and estado='abierto' for update;
    if not found then raise exception 'ALQ_COMUNICADO_NO_ABIERTO'; end if;
    insert into alq.alq_comunicado_mensaje(comunicado_id,autor_tipo,autor_parte_usuario_id,texto,operacion_id)
    values (v_comunicado,'propietario',v_actor,p_payload->>'texto',v_operacion_id) returning id into v_mensaje;
    v_result:=jsonb_build_object('mensaje_id',v_mensaje,'comunicado_id',v_comunicado);
  end if;
  update alq.alq_operacion set estado='aplicada',resultado=v_result,aplicada_at=clock_timestamp()
    where id=v_operacion_id;
  insert into alq.alq_journal(operacion_id,entidad,entidad_id,evento,despues,actor)
  values (v_operacion_id,'operacion',v_operacion_id,p_operacion,v_result,v_actor);
  return v_result;
end
$$;


--
-- Name: alq_puede_ver_propiedad_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_puede_ver_propiedad_v1(p_propiedad_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select alq_private.alq_es_admin_v1() or exists (
    select 1
    from alq.alq_parte_usuario pu
    join alq.alq_acceso_propiedad ap on ap.parte_usuario_id=pu.id
    where pu.auth_user_id=(select auth.uid())
      and ap.propiedad_id=p_propiedad_id
      and statement_timestamp()<@pu.vigencia
      and statement_timestamp()<@ap.vigencia
  )
$$;


--
-- Name: alq_recalcular_cargo_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_recalcular_cargo_v1(p_cargo_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.cargo_id=c.id),0)
    into v_saldo from alq.alq_cargo c where c.id=p_cargo_id;
  if v_saldo<0 then raise exception 'ALQ_CARGO_SALDO_NEGATIVO'; end if;
  update alq.alq_cargo set saldo_pendiente=v_saldo where id=p_cargo_id;
  update alq.alq_servicio_factura set saldada=(v_saldo=0) where cargo_id=p_cargo_id;
  return v_saldo;
end
$$;


--
-- Name: alq_recalcular_credito_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_recalcular_credito_v1(p_credito_id uuid) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion a on a.id=ar.aplicacion_original_id
      where a.credito_id=cr.id),0)
    into v_saldo from alq.alq_credito cr where cr.id=p_credito_id;
  if v_saldo<0 then raise exception 'ALQ_CREDITO_SALDO_NEGATIVO'; end if;
  update alq.alq_credito set saldo_pendiente=v_saldo where id=p_credito_id;
  return v_saldo;
end
$$;


--
-- Name: alq_redondear_v1(numeric, text); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_redondear_v1(p_valor numeric, p_regla text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  case p_regla
    when 'entero' then return round(p_valor,0);
    when 'centavos' then return round(p_valor,2);
    when '6_decimales' then return round(p_valor,6);
    else raise exception 'ALQ_REGLA_REDONDEO_NO_SOPORTADA:%',p_regla;
  end case;
end
$$;


--
-- Name: alq_validar_aplicacion_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_validar_aplicacion_v1(p_aplicacion_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a alq.alq_aplicacion%rowtype; t alq.alq_transaccion_caja%rowtype;
        c alq.alq_cargo%rowtype; cr alq.alq_credito%rowtype;
        rd alq.alq_rendicion%rowtype; de alq.alq_deposito_evento%rowtype;
        cv alq.alq_conversion_moneda%rowtype;
begin
  select * into a from alq.alq_aplicacion where id=p_aplicacion_id for update;
  select * into t from alq.alq_transaccion_caja where id=a.transaccion_id for update;
  if t.estado<>'confirmada' then raise exception 'ALQ_APLICACION_TRANSACCION_NO_CONFIRMADA'; end if;
  if a.moneda_origen<>t.moneda then raise exception 'ALQ_APLICACION_MONEDA_ORIGEN'; end if;
  if a.conversion_id is null and a.importe_origen<>a.importe_destino then
    raise exception 'ALQ_APLICACION_IMPORTE_SIN_CONVERSION';
  end if;
  if (select coalesce(sum(importe_origen),0) from alq.alq_aplicacion where transaccion_id=t.id)>t.monto then
    raise exception 'ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION';
  end if;
  if a.cargo_id is not null then
    select * into c from alq.alq_cargo where id=a.cargo_id for update;
    if t.direccion<>'entrada' then raise exception 'ALQ_APLICACION_CARGO_REQUIERE_ENTRADA'; end if;
    if a.moneda_destino<>c.moneda then raise exception 'ALQ_APLICACION_MONEDA_CARGO'; end if;
  end if;
  if a.credito_id is not null then
    select * into cr from alq.alq_credito where id=a.credito_id for update;
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_CREDITO_REQUIERE_SALIDA'; end if;
    if a.moneda_destino<>cr.moneda then raise exception 'ALQ_APLICACION_MONEDA_CREDITO'; end if;
  end if;
  if a.rendicion_id is not null then
    select * into rd from alq.alq_rendicion where id=a.rendicion_id for update;
    if t.direccion<>'salida' then raise exception 'ALQ_APLICACION_RENDICION_REQUIERE_SALIDA'; end if;
    if rd.estado not in ('emitida','corregida') or a.moneda_destino<>rd.moneda then
      raise exception 'ALQ_APLICACION_RENDICION_INVALIDA';
    end if;
    if ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
          where ap.rendicion_id=rd.id)
        -(select coalesce(sum(ar.importe_destino_reabierto),0)
          from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion ap
            on ap.id=ar.aplicacion_original_id where ap.rendicion_id=rd.id))
       >greatest(rd.saldo_final,0) then
      raise exception 'ALQ_GIROS_SUPERAN_SALDO_RENDICION';
    end if;
  end if;
  if a.deposito_evento_id is not null then
    select * into de from alq.alq_deposito_evento where id=a.deposito_evento_id for update;
    if a.moneda_destino<>de.moneda
       or ((select coalesce(sum(ap.importe_destino),0) from alq.alq_aplicacion ap
             where ap.deposito_evento_id=de.id)
           -(select coalesce(sum(ar.importe_destino_reabierto),0)
             from alq.alq_aplicacion_reversa ar join alq.alq_aplicacion ap
               on ap.id=ar.aplicacion_original_id where ap.deposito_evento_id=de.id))>de.monto then
      raise exception 'ALQ_APLICACION_DEPOSITO_INVALIDA';
    end if;
  end if;
  if a.conversion_id is not null then
    select * into cv from alq.alq_conversion_moneda where id=a.conversion_id for update;
    if cv.importe_origen<>a.importe_origen or cv.moneda_origen<>a.moneda_origen
       or cv.importe_destino<>a.importe_destino or cv.moneda_destino<>a.moneda_destino
       or cv.importe_destino<>alq_private.alq_redondear_v1(cv.importe_origen*cv.tasa,cv.regla_redondeo) then
      raise exception 'ALQ_I4_CONVERSION_NO_LIGADA';
    end if;
  end if;
  if a.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(a.cargo_id); end if;
  if a.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(a.credito_id); end if;
end
$$;


--
-- Name: alq_validar_reversa_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_validar_reversa_v1(p_reversa_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r alq.alq_transaccion_caja%rowtype; o alq.alq_transaccion_caja%rowtype;
        x record; cv alq.alq_conversion_moneda%rowtype; cvr alq.alq_conversion_moneda%rowtype;
begin
  select * into r from alq.alq_transaccion_caja where id=p_reversa_id for update;
  if r.reversa_de is null then raise exception 'ALQ_REVERSA_SIN_ORIGINAL'; end if;
  select * into o from alq.alq_transaccion_caja where id=r.reversa_de for update;
  if o.estado<>'confirmada' or r.moneda<>o.moneda or r.ambito<>o.ambito
     or r.cuenta_custodia_id is distinct from o.cuenta_custodia_id
     or r.direccion=o.direccion then raise exception 'ALQ_I3_REVERSA_INCOMPATIBLE'; end if;
  if (select coalesce(sum(monto),0) from alq.alq_transaccion_caja
      where reversa_de=o.id and estado='confirmada')>o.monto then
    raise exception 'ALQ_I3_REVERSAS_SUPERAN_ORIGINAL';
  end if;
  if (select coalesce(sum(importe_origen_revertido),0) from alq.alq_aplicacion_reversa
      where reversa_transaccion_id=r.id)>r.monto then
    raise exception 'ALQ_T1_REAPERTURAS_SUPERAN_REVERSA';
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
    if (select coalesce(sum(importe_destino_reabierto),0) from alq.alq_aplicacion_reversa
        where aplicacion_original_id=x.aplicacion_original_id)>x.original_destino then
      raise exception 'ALQ_T2_REAPERTURA_SUPERA_APLICACION';
    end if;
    if x.moneda_origen=x.moneda_destino then
      if x.importe_origen_revertido<>x.importe_destino_reabierto or x.conversion_reversa_id is not null then
        raise exception 'ALQ_T4_REAPERTURA_MISMA_MONEDA';
      end if;
    elsif x.conversion_reversa_id is not null then
      select * into cvr from alq.alq_conversion_moneda where id=x.conversion_reversa_id;
      if cvr.importe_origen<>x.importe_origen_revertido or cvr.moneda_origen<>x.moneda_origen
         or cvr.importe_destino<>x.importe_destino_reabierto or cvr.moneda_destino<>x.moneda_destino
         or cvr.importe_destino<>alq_private.alq_redondear_v1(cvr.importe_origen*cvr.tasa,cvr.regla_redondeo) then
        raise exception 'ALQ_T4_CONVERSION_REVERSA_NO_LIGADA';
      end if;
    else
      select * into cv from alq.alq_conversion_moneda where id=x.conversion_id;
      if not found or x.importe_destino_reabierto<>
        alq_private.alq_redondear_v1(x.importe_origen_revertido*cv.tasa,cv.regla_redondeo) then
        raise exception 'ALQ_T4_PROPORCION_ORIGINAL_INVALIDA';
      end if;
    end if;
    if x.cargo_id is not null then perform alq_private.alq_recalcular_cargo_v1(x.cargo_id); end if;
    if x.credito_id is not null then perform alq_private.alq_recalcular_credito_v1(x.credito_id); end if;
  end loop;
end
$$;


--
-- Name: alq_validar_transferencia_v1(uuid); Type: FUNCTION; Schema: alq_private; Owner: -
--

CREATE FUNCTION alq_private.alq_validar_transferencia_v1(p_transferencia_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_count int; v_dirs int; v_montos int; v_monedas int; v_cuentas int;
begin
  if p_transferencia_id is null then return; end if;
  perform 1 from alq.alq_transaccion_caja where transferencia_id=p_transferencia_id order by id for update;
  select count(*),count(distinct direccion),count(distinct monto),count(distinct moneda),
         count(distinct cuenta_custodia_id)
    into v_count,v_dirs,v_montos,v_monedas,v_cuentas
  from alq.alq_transaccion_caja where transferencia_id=p_transferencia_id;
  if v_count<>2 or v_dirs<>2 or v_montos<>1 or v_monedas<>1 or v_cuentas<>2 then
    raise exception 'ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO';
  end if;
end
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;


--
-- Name: alq_admin_aplicar(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alq_admin_aplicar(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select alq_private.alq_admin_aplicar_core_v1(p_request_id,p_operacion,p_firma,p_payload) $$;


--
-- Name: alq_admin_preparar(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alq_admin_preparar(p_operacion text, p_payload jsonb) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select alq_private.alq_admin_preparar_core_v1(p_operacion,p_payload) $$;


--
-- Name: alq_prop_abrir_consulta(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alq_prop_abrir_consulta(p_propiedad uuid, p_texto text, p_adjunto uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select (alq_private.alq_prop_operar_v1('comunicado_abrir',jsonb_build_object(
  'propiedad_id',p_propiedad,'texto',p_texto,'adjunto_documento_id',p_adjunto))->>'comunicado_id')::uuid $$;


--
-- Name: alq_prop_responder_consulta(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alq_prop_responder_consulta(p_comunicado uuid, p_texto text) RETURNS uuid
    LANGUAGE sql
    SET search_path TO ''
    AS $$ select (alq_private.alq_prop_operar_v1('comunicado_responder',jsonb_build_object(
  'comunicado_id',p_comunicado,'texto',p_texto))->>'mensaje_id')::uuid $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alq_acceso_propiedad; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_acceso_propiedad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parte_usuario_id uuid NOT NULL,
    propiedad_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_acceso_propiedad_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_acceso_propiedad FORCE ROW LEVEL SECURITY;


--
-- Name: alq_agenda_ocurrencia; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_agenda_ocurrencia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    regla_id uuid NOT NULL,
    propiedad_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    estado text NOT NULL,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_agenda_ocurrencia_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'hecha'::text, 'cancelada'::text, 'supersedida'::text])))
);

ALTER TABLE ONLY alq.alq_agenda_ocurrencia FORCE ROW LEVEL SECURITY;


--
-- Name: alq_agenda_regla; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_agenda_regla (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    contrato_id uuid,
    contrato_version_id uuid,
    mandato_id uuid,
    servicio_cuenta_id uuid,
    periodo_id uuid,
    parametros jsonb NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_agenda_regla_fuente_ck CHECK ((((((((contrato_id IS NOT NULL))::integer + ((contrato_version_id IS NOT NULL))::integer) + ((mandato_id IS NOT NULL))::integer) + ((servicio_cuenta_id IS NOT NULL))::integer) + ((periodo_id IS NOT NULL))::integer) = 1))
);

ALTER TABLE ONLY alq.alq_agenda_regla FORCE ROW LEVEL SECURITY;


--
-- Name: alq_ajuste; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_ajuste (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_version_base_id uuid NOT NULL,
    estado text NOT NULL,
    formula_version text NOT NULL,
    resultado_sin_redondear numeric(30,12),
    resultado_final numeric(20,6),
    aprobador_parte_usuario_id uuid,
    aplicado_at timestamp with time zone,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_ajuste_estado_check CHECK ((estado = ANY (ARRAY['pendiente_dato'::text, 'estimado'::text, 'calculado'::text, 'aprobado'::text, 'aplicado'::text, 'anulado'::text]))),
    CONSTRAINT alq_ajuste_estado_ck CHECK ((((estado = ANY (ARRAY['pendiente_dato'::text, 'estimado'::text])) AND (aplicado_at IS NULL)) OR ((estado = ANY (ARRAY['calculado'::text, 'aprobado'::text, 'anulado'::text])) AND (resultado_final IS NOT NULL) AND (aplicado_at IS NULL)) OR ((estado = 'aplicado'::text) AND (resultado_final IS NOT NULL) AND (aprobador_parte_usuario_id IS NOT NULL) AND (aplicado_at IS NOT NULL))))
);

ALTER TABLE ONLY alq.alq_ajuste FORCE ROW LEVEL SECURITY;


--
-- Name: alq_ajuste_observacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_ajuste_observacion (
    ajuste_id uuid NOT NULL,
    observacion_id uuid NOT NULL
);

ALTER TABLE ONLY alq.alq_ajuste_observacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_aplicacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_aplicacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaccion_id uuid NOT NULL,
    cargo_id uuid,
    deposito_evento_id uuid,
    rendicion_id uuid,
    credito_id uuid,
    importe_origen numeric(20,6) NOT NULL,
    moneda_origen text NOT NULL,
    importe_destino numeric(20,6) NOT NULL,
    moneda_destino text NOT NULL,
    conversion_id uuid,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_aplicacion_destino_ck CHECK (((((((cargo_id IS NOT NULL))::integer + ((deposito_evento_id IS NOT NULL))::integer) + ((rendicion_id IS NOT NULL))::integer) + ((credito_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT alq_aplicacion_importe_destino_check CHECK ((importe_destino > (0)::numeric)),
    CONSTRAINT alq_aplicacion_importe_origen_check CHECK ((importe_origen > (0)::numeric)),
    CONSTRAINT alq_aplicacion_moneda_ck CHECK ((((moneda_origen = moneda_destino) AND (conversion_id IS NULL)) OR ((moneda_origen <> moneda_destino) AND (conversion_id IS NOT NULL)))),
    CONSTRAINT alq_aplicacion_moneda_destino_check CHECK ((moneda_destino ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_aplicacion_moneda_origen_check CHECK ((moneda_origen ~ '^[A-Z]{3}$'::text))
);

ALTER TABLE ONLY alq.alq_aplicacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_aplicacion_reversa; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_aplicacion_reversa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reversa_transaccion_id uuid NOT NULL,
    aplicacion_original_id uuid NOT NULL,
    importe_origen_revertido numeric(20,6) NOT NULL,
    moneda_origen text NOT NULL,
    importe_destino_reabierto numeric(20,6) NOT NULL,
    moneda_destino text NOT NULL,
    conversion_reversa_id uuid,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_aplicacion_reversa_importe_destino_reabierto_check CHECK ((importe_destino_reabierto > (0)::numeric)),
    CONSTRAINT alq_aplicacion_reversa_importe_origen_revertido_check CHECK ((importe_origen_revertido > (0)::numeric)),
    CONSTRAINT alq_aplicacion_reversa_moneda_ck CHECK ((((moneda_origen = moneda_destino) AND (conversion_reversa_id IS NULL) AND (importe_origen_revertido = importe_destino_reabierto)) OR (moneda_origen <> moneda_destino))),
    CONSTRAINT alq_aplicacion_reversa_moneda_destino_check CHECK ((moneda_destino ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_aplicacion_reversa_moneda_origen_check CHECK ((moneda_origen ~ '^[A-Z]{3}$'::text))
);

ALTER TABLE ONLY alq.alq_aplicacion_reversa FORCE ROW LEVEL SECURITY;


--
-- Name: alq_capacidad_admin; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_capacidad_admin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parte_usuario_id uuid NOT NULL,
    capacidad text NOT NULL,
    vigencia tstzrange NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_capacidad_admin_capacidad_check CHECK ((capacidad = ANY (ARRAY['operador'::text, 'supervisor'::text]))),
    CONSTRAINT alq_capacidad_admin_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_capacidad_admin FORCE ROW LEVEL SECURITY;


--
-- Name: alq_cargo; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_cargo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    contrato_id uuid,
    periodo_id uuid,
    deudor_parte_id uuid NOT NULL,
    acreedor_parte_id uuid NOT NULL,
    ambito text NOT NULL,
    concepto text NOT NULL,
    moneda text NOT NULL,
    monto numeric(20,6) NOT NULL,
    vence_at timestamp with time zone NOT NULL,
    origen text NOT NULL,
    operacion_id uuid NOT NULL,
    snapshot_regla jsonb DEFAULT '{}'::jsonb NOT NULL,
    saldo_pendiente numeric(20,6) NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_cargo_ambito_check CHECK ((ambito = ANY (ARRAY['custodiada'::text, 'externa'::text]))),
    CONSTRAINT alq_cargo_concepto_fk_ck CHECK (((concepto <> 'alquiler_periodo'::text) OR ((contrato_id IS NOT NULL) AND (periodo_id IS NOT NULL)))),
    CONSTRAINT alq_cargo_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_cargo_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_cargo_origen_check CHECK ((origen = ANY (ARRAY['motor'::text, 'admin'::text, 'subrogacion'::text]))),
    CONSTRAINT alq_cargo_saldo_pendiente_check CHECK ((saldo_pendiente >= (0)::numeric))
);

ALTER TABLE ONLY alq.alq_cargo FORCE ROW LEVEL SECURITY;


--
-- Name: alq_comunicado; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_comunicado (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    abierto_por_tipo text NOT NULL,
    abierto_por_parte_id uuid,
    estado text NOT NULL,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    resuelto_at timestamp with time zone,
    CONSTRAINT alq_comunicado_abierto_por_tipo_check CHECK ((abierto_por_tipo = ANY (ARRAY['inquilino_whatsapp'::text, 'admin'::text, 'propietario'::text]))),
    CONSTRAINT alq_comunicado_autor_ck CHECK (((abierto_por_tipo = 'inquilino_whatsapp'::text) OR (abierto_por_parte_id IS NOT NULL))),
    CONSTRAINT alq_comunicado_estado_check CHECK ((estado = ANY (ARRAY['abierto'::text, 'resuelto'::text, 'cerrado'::text])))
);

ALTER TABLE ONLY alq.alq_comunicado FORCE ROW LEVEL SECURITY;


--
-- Name: alq_comunicado_adjunto; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_comunicado_adjunto (
    mensaje_id uuid NOT NULL,
    documento_id uuid NOT NULL
);

ALTER TABLE ONLY alq.alq_comunicado_adjunto FORCE ROW LEVEL SECURITY;


--
-- Name: alq_comunicado_mensaje; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_comunicado_mensaje (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comunicado_id uuid NOT NULL,
    autor_tipo text NOT NULL,
    autor_parte_usuario_id uuid,
    texto text NOT NULL,
    leido_por_propietario_at timestamp with time zone,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_comunicado_mensaje_autor_ck CHECK ((((autor_tipo = 'inquilino_whatsapp'::text) AND (autor_parte_usuario_id IS NULL)) OR ((autor_tipo <> 'inquilino_whatsapp'::text) AND (autor_parte_usuario_id IS NOT NULL)))),
    CONSTRAINT alq_comunicado_mensaje_autor_tipo_check CHECK ((autor_tipo = ANY (ARRAY['inquilino_whatsapp'::text, 'admin'::text, 'propietario'::text]))),
    CONSTRAINT alq_comunicado_mensaje_texto_check CHECK ((btrim(texto) <> ''::text))
);

ALTER TABLE ONLY alq.alq_comunicado_mensaje FORCE ROW LEVEL SECURITY;


--
-- Name: alq_contrato; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_contrato (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    inquilino_parte_id uuid NOT NULL,
    predecesor_id uuid,
    inicio date NOT NULL,
    fin_pactado date,
    fin_efectivo date,
    continuacion_desde date,
    estado text NOT NULL,
    pdf_documento_id uuid,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_contrato_estado_check CHECK ((estado = ANY (ARRAY['vigente'::text, 'continuacion_legal'::text, 'rescindido'::text, 'cerrado'::text]))),
    CONSTRAINT alq_contrato_fechas_ck CHECK ((((fin_pactado IS NULL) OR (fin_pactado >= inicio)) AND ((fin_efectivo IS NULL) OR (fin_efectivo >= inicio)) AND ((continuacion_desde IS NULL) OR (continuacion_desde >= inicio))))
);

ALTER TABLE ONLY alq.alq_contrato FORCE ROW LEVEL SECURITY;


--
-- Name: alq_contrato_version; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_contrato_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    dia_pago_desde smallint NOT NULL,
    dia_pago_hasta smallint NOT NULL,
    indice_serie_id uuid,
    pct_fijo numeric(12,8),
    frecuencia_ajuste interval,
    punitorio_pct_dia numeric(12,8) DEFAULT 0 NOT NULL,
    punitorio_desde_dia smallint DEFAULT 0 NOT NULL,
    formula_punitorio_version text NOT NULL,
    metodo_prorrateo text NOT NULL,
    regla_redondeo text NOT NULL,
    regla_pago_otra_moneda text NOT NULL,
    fuente_conversion text,
    fallback_indice jsonb,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_contrato_version_ajuste_ck CHECK ((((((indice_serie_id IS NOT NULL))::integer + ((pct_fijo IS NOT NULL))::integer) <= 1) AND ((pct_fijo IS NULL) OR (pct_fijo >= (0)::numeric)) AND ((frecuencia_ajuste IS NULL) OR (frecuencia_ajuste > '00:00:00'::interval)) AND (((regla_pago_otra_moneda = 'prohibido'::text) AND (fuente_conversion IS NULL)) OR ((regla_pago_otra_moneda = 'tasa_pactada'::text) AND (fuente_conversion IS NOT NULL))))),
    CONSTRAINT alq_contrato_version_check CHECK (((dia_pago_hasta >= dia_pago_desde) AND (dia_pago_hasta <= 31))),
    CONSTRAINT alq_contrato_version_dia_pago_desde_check CHECK (((dia_pago_desde >= 1) AND (dia_pago_desde <= 31))),
    CONSTRAINT alq_contrato_version_metodo_prorrateo_check CHECK ((metodo_prorrateo = ANY (ARRAY['dias_reales'::text, 'base_30'::text, 'importe_pactado'::text]))),
    CONSTRAINT alq_contrato_version_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_contrato_version_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_contrato_version_punitorio_desde_dia_check CHECK ((punitorio_desde_dia >= 0)),
    CONSTRAINT alq_contrato_version_punitorio_pct_dia_check CHECK ((punitorio_pct_dia >= (0)::numeric)),
    CONSTRAINT alq_contrato_version_regla_pago_otra_moneda_check CHECK ((regla_pago_otra_moneda = ANY (ARRAY['prohibido'::text, 'tasa_pactada'::text]))),
    CONSTRAINT alq_contrato_version_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_contrato_version FORCE ROW LEVEL SECURITY;


--
-- Name: alq_conversion_moneda; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_conversion_moneda (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    importe_origen numeric(20,6) NOT NULL,
    moneda_origen text NOT NULL,
    importe_destino numeric(20,6) NOT NULL,
    moneda_destino text NOT NULL,
    tasa numeric(30,12) NOT NULL,
    fuente text NOT NULL,
    fecha timestamp with time zone NOT NULL,
    regla_redondeo text NOT NULL,
    evidencia_documento_id uuid,
    aprobador_parte_usuario_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_conversion_moneda_importe_destino_check CHECK ((importe_destino > (0)::numeric)),
    CONSTRAINT alq_conversion_moneda_importe_origen_check CHECK ((importe_origen > (0)::numeric)),
    CONSTRAINT alq_conversion_moneda_moneda_destino_check CHECK ((moneda_destino ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_conversion_moneda_moneda_origen_check CHECK ((moneda_origen ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_conversion_moneda_tasa_check CHECK ((tasa > (0)::numeric)),
    CONSTRAINT alq_conversion_monedas_ck CHECK ((moneda_origen <> moneda_destino))
);

ALTER TABLE ONLY alq.alq_conversion_moneda FORCE ROW LEVEL SECURITY;


--
-- Name: alq_credito; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_credito (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parte_id uuid NOT NULL,
    contrato_id uuid NOT NULL,
    moneda text NOT NULL,
    monto_original numeric(20,6) NOT NULL,
    saldo_pendiente numeric(20,6) NOT NULL,
    transaccion_origen_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_credito_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_credito_monto_original_check CHECK ((monto_original > (0)::numeric)),
    CONSTRAINT alq_credito_saldo_pendiente_check CHECK ((saldo_pendiente >= (0)::numeric))
);

ALTER TABLE ONLY alq.alq_credito FORCE ROW LEVEL SECURITY;


--
-- Name: alq_credito_consumo; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_credito_consumo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credito_id uuid NOT NULL,
    cargo_id uuid NOT NULL,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_credito_consumo_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_credito_consumo_monto_check CHECK ((monto > (0)::numeric))
);

ALTER TABLE ONLY alq.alq_credito_consumo FORCE ROW LEVEL SECURITY;


--
-- Name: alq_cuenta_custodia; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_cuenta_custodia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    banco_billetera text NOT NULL,
    identificador text NOT NULL,
    moneda text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_cuenta_custodia_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text))
);

ALTER TABLE ONLY alq.alq_cuenta_custodia FORCE ROW LEVEL SECURITY;


--
-- Name: alq_deposito; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_deposito (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_id uuid NOT NULL,
    moneda text NOT NULL,
    monto_constituido numeric(20,6) NOT NULL,
    custodia_parte_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_deposito_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_deposito_monto_constituido_check CHECK ((monto_constituido > (0)::numeric))
);

ALTER TABLE ONLY alq.alq_deposito FORCE ROW LEVEL SECURITY;


--
-- Name: alq_deposito_evento; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_deposito_evento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deposito_id uuid NOT NULL,
    tipo text NOT NULL,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    transaccion_id uuid,
    contrato_sucesor_id uuid,
    evidencia_documento_id uuid,
    operacion_id uuid NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_deposito_evento_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_deposito_evento_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_deposito_evento_sucesor_ck CHECK (((tipo = 'transferencia_a_sucesor'::text) = (contrato_sucesor_id IS NOT NULL))),
    CONSTRAINT alq_deposito_evento_tipo_check CHECK ((tipo = ANY (ARRAY['constitucion'::text, 'actualizacion'::text, 'aplicacion'::text, 'devolucion'::text, 'transferencia_a_sucesor'::text])))
);

ALTER TABLE ONLY alq.alq_deposito_evento FORCE ROW LEVEL SECURITY;


--
-- Name: alq_deposito_liquidacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_deposito_liquidacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deposito_id uuid NOT NULL,
    fecha timestamp with time zone NOT NULL,
    estado text NOT NULL,
    documento_id uuid,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_deposito_liquidacion_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'aprobada'::text, 'pagada'::text, 'anulada'::text])))
);

ALTER TABLE ONLY alq.alq_deposito_liquidacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_deposito_liquidacion_linea; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_deposito_liquidacion_linea (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    liquidacion_id uuid NOT NULL,
    concepto text NOT NULL,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    evidencia_documento_id uuid,
    cargo_residual_id uuid,
    CONSTRAINT alq_deposito_liquidacion_linea_concepto_check CHECK ((concepto = ANY (ARRAY['danio'::text, 'deuda'::text, 'reserva_factura_pendiente'::text, 'otro'::text]))),
    CONSTRAINT alq_deposito_liquidacion_linea_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_deposito_liquidacion_linea_monto_check CHECK ((monto > (0)::numeric))
);

ALTER TABLE ONLY alq.alq_deposito_liquidacion_linea FORCE ROW LEVEL SECURITY;


--
-- Name: alq_documento; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_documento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    bucket text DEFAULT 'alq-docs'::text NOT NULL,
    path text NOT NULL,
    sha256 text NOT NULL,
    mime text NOT NULL,
    bytes bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    propiedad_id uuid,
    mandato_id uuid,
    audiencia text NOT NULL,
    retencion jsonb DEFAULT '{}'::jsonb NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_documento_alcance_ck CHECK (((propiedad_id IS NOT NULL) OR (mandato_id IS NOT NULL))),
    CONSTRAINT alq_documento_audiencia_check CHECK ((audiencia = ANY (ARRAY['admin'::text, 'propietario'::text]))),
    CONSTRAINT alq_documento_bucket_check CHECK ((bucket = 'alq-docs'::text)),
    CONSTRAINT alq_documento_bytes_check CHECK ((bytes > 0)),
    CONSTRAINT alq_documento_mime_check CHECK ((btrim(mime) <> ''::text)),
    CONSTRAINT alq_documento_path_check CHECK (((btrim(path) <> ''::text) AND (path !~ '(^|/)\.\.(/|$)'::text))),
    CONSTRAINT alq_documento_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT alq_documento_tipo_check CHECK ((btrim(tipo) <> ''::text)),
    CONSTRAINT alq_documento_version_check CHECK ((version > 0))
);

ALTER TABLE ONLY alq.alq_documento FORCE ROW LEVEL SECURITY;


--
-- Name: alq_export_baja; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_export_baja (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mandato_id uuid NOT NULL,
    corte_temporal timestamp with time zone NOT NULL,
    manifiesto jsonb NOT NULL,
    documento_id uuid NOT NULL,
    generado_at timestamp with time zone NOT NULL,
    entregado_at timestamp with time zone,
    constancia_recibo text,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_export_baja_entrega_ck CHECK ((((entregado_at IS NULL) AND (constancia_recibo IS NULL)) OR ((entregado_at IS NOT NULL) AND (constancia_recibo IS NOT NULL))))
);

ALTER TABLE ONLY alq.alq_export_baja FORCE ROW LEVEL SECURITY;


--
-- Name: alq_factura_externa; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_factura_externa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha_emision date NOT NULL,
    emisor_cuit text NOT NULL,
    emisor_condicion_fiscal jsonb NOT NULL,
    receptor_cuit text NOT NULL,
    receptor_condicion_fiscal jsonb NOT NULL,
    tipo text NOT NULL,
    punto_numero text NOT NULL,
    moneda text NOT NULL,
    neto numeric(20,6) NOT NULL,
    impuestos numeric(20,6) NOT NULL,
    total numeric(20,6) NOT NULL,
    cae text,
    vto_cae date,
    estado text NOT NULL,
    documento_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_factura_externa_check CHECK (((total >= (0)::numeric) AND (total = (neto + impuestos)))),
    CONSTRAINT alq_factura_externa_impuestos_check CHECK ((impuestos >= (0)::numeric)),
    CONSTRAINT alq_factura_externa_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_factura_externa_neto_check CHECK ((neto >= (0)::numeric))
);

ALTER TABLE ONLY alq.alq_factura_externa FORCE ROW LEVEL SECURITY;


--
-- Name: alq_garantia; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_garantia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_id uuid NOT NULL,
    garante_parte_id uuid NOT NULL,
    tipo text NOT NULL,
    poliza text,
    emisor text,
    cobertura numeric(20,6),
    moneda text,
    vigencia tstzrange NOT NULL,
    documento_id uuid,
    regla_notificacion_mora jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT alq_garantia_cobertura_check CHECK (((cobertura IS NULL) OR (cobertura > (0)::numeric))),
    CONSTRAINT alq_garantia_moneda_check CHECK (((moneda IS NULL) OR (moneda ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT alq_garantia_tipo_check CHECK ((tipo = ANY (ARRAY['fiador'::text, 'caucion'::text, 'aval'::text, 'otra'::text]))),
    CONSTRAINT alq_garantia_vigencia_ck CHECK ((NOT isempty(vigencia)))
);

ALTER TABLE ONLY alq.alq_garantia FORCE ROW LEVEL SECURITY;


--
-- Name: alq_indice_observacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_indice_observacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    serie_id uuid NOT NULL,
    periodo daterange NOT NULL,
    valor numeric(30,12) NOT NULL,
    publicada_at timestamp with time zone NOT NULL,
    fuente_url text NOT NULL,
    hash_insumo text NOT NULL,
    fecha_descarga timestamp with time zone NOT NULL,
    corrige_a_id uuid,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_indice_observacion_hash_insumo_check CHECK ((hash_insumo ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT alq_indice_observacion_periodo_ck CHECK ((NOT isempty(periodo)))
);

ALTER TABLE ONLY alq.alq_indice_observacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_indice_serie; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_indice_serie (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organismo text NOT NULL,
    codigo text NOT NULL,
    granularidad text NOT NULL,
    base text NOT NULL,
    version text NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_indice_serie_granularidad_check CHECK ((granularidad = ANY (ARRAY['diaria'::text, 'mensual'::text, 'otra'::text])))
);

ALTER TABLE ONLY alq.alq_indice_serie FORCE ROW LEVEL SECURITY;


--
-- Name: alq_journal; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_journal (
    id bigint NOT NULL,
    operacion_id uuid NOT NULL,
    entidad text NOT NULL,
    entidad_id uuid NOT NULL,
    evento text NOT NULL,
    antes jsonb,
    despues jsonb,
    actor uuid,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

ALTER TABLE ONLY alq.alq_journal FORCE ROW LEVEL SECURITY;


--
-- Name: alq_journal_id_seq; Type: SEQUENCE; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_journal ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME alq.alq_journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: alq_mandato; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_mandato (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    titularidad_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    estado text NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_mandato_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'en_cierre'::text, 'saldo_final'::text, 'export_generado'::text, 'export_entregado'::text, 'capacidad_revocada'::text, 'cerrado'::text]))),
    CONSTRAINT alq_mandato_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_mandato FORCE ROW LEVEL SECURITY;


--
-- Name: alq_mandato_version; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_mandato_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mandato_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    honorario_base text NOT NULL,
    honorario_pct numeric(9,6) DEFAULT 0 NOT NULL,
    honorario_minimo numeric(20,6) DEFAULT 0 NOT NULL,
    honorario_fijo numeric(20,6) DEFAULT 0 NOT NULL,
    incluye_punitorios boolean DEFAULT false NOT NULL,
    moneda text NOT NULL,
    tratamiento_impuestos jsonb DEFAULT '{}'::jsonb NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_mandato_version_honorario_base_check CHECK ((honorario_base = ANY (ARRAY['cobrado'::text, 'devengado'::text]))),
    CONSTRAINT alq_mandato_version_honorario_fijo_check CHECK ((honorario_fijo >= (0)::numeric)),
    CONSTRAINT alq_mandato_version_honorario_minimo_check CHECK ((honorario_minimo >= (0)::numeric)),
    CONSTRAINT alq_mandato_version_honorario_pct_check CHECK ((honorario_pct >= (0)::numeric)),
    CONSTRAINT alq_mandato_version_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_mandato_version_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_mandato_version FORCE ROW LEVEL SECURITY;


--
-- Name: alq_nota; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_nota (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    cargo_id uuid NOT NULL,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    motivo text NOT NULL,
    aprobador_parte_usuario_id uuid NOT NULL,
    fecha timestamp with time zone NOT NULL,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_nota_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_nota_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_nota_motivo_check CHECK ((btrim(motivo) <> ''::text)),
    CONSTRAINT alq_nota_tipo_check CHECK ((tipo = ANY (ARRAY['credito'::text, 'debito'::text])))
);

ALTER TABLE ONLY alq.alq_nota FORCE ROW LEVEL SECURITY;


--
-- Name: alq_notificacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_notificacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ocurrencia_id uuid NOT NULL,
    destinatario_parte_id uuid NOT NULL,
    canal text NOT NULL,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_notificacion_canal_check CHECK ((canal = ANY (ARRAY['email'::text, 'whatsapp'::text, 'interno'::text])))
);

ALTER TABLE ONLY alq.alq_notificacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_notificacion_intento; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_notificacion_intento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notificacion_id uuid NOT NULL,
    intento_n integer NOT NULL,
    proveedor text NOT NULL,
    resultado jsonb,
    error_sanitizado text,
    ocurrido_at timestamp with time zone NOT NULL,
    estado text NOT NULL,
    CONSTRAINT alq_notificacion_intento_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'entregado'::text, 'fallido'::text, 'dead_letter'::text]))),
    CONSTRAINT alq_notificacion_intento_intento_n_check CHECK ((intento_n > 0))
);

ALTER TABLE ONLY alq.alq_notificacion_intento FORCE ROW LEVEL SECURITY;


--
-- Name: alq_operacion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_operacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    operacion text NOT NULL,
    payload_normalizado jsonb NOT NULL,
    firma_sha256 text NOT NULL,
    estado text NOT NULL,
    resultado jsonb,
    actor_parte_usuario_id uuid NOT NULL,
    preparada_at timestamp with time zone NOT NULL,
    aplicada_at timestamp with time zone,
    CONSTRAINT alq_operacion_estado_check CHECK ((estado = ANY (ARRAY['preparada'::text, 'aplicada'::text, 'rechazada'::text]))),
    CONSTRAINT alq_operacion_estado_ck CHECK ((((estado = 'preparada'::text) AND (aplicada_at IS NULL) AND (resultado IS NULL)) OR ((estado = 'aplicada'::text) AND (aplicada_at IS NOT NULL) AND (resultado IS NOT NULL)) OR (estado = 'rechazada'::text))),
    CONSTRAINT alq_operacion_firma_sha256_check CHECK ((firma_sha256 ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY alq.alq_operacion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_parte; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_parte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_persona text NOT NULL,
    nombre text NOT NULL,
    documento_tipo text,
    documento_numero text,
    tel_whatsapp text,
    email text,
    notas text,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_parte_documento_par_ck CHECK (((documento_tipo IS NULL) = (documento_numero IS NULL))),
    CONSTRAINT alq_parte_nombre_check CHECK ((btrim(nombre) <> ''::text)),
    CONSTRAINT alq_parte_tipo_persona_check CHECK ((tipo_persona = ANY (ARRAY['fisica'::text, 'juridica'::text])))
);

ALTER TABLE ONLY alq.alq_parte FORCE ROW LEVEL SECURITY;


--
-- Name: alq_parte_usuario; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_parte_usuario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parte_id uuid NOT NULL,
    auth_user_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_parte_usuario_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_parte_usuario FORCE ROW LEVEL SECURITY;


--
-- Name: alq_periodo; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_periodo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_id uuid NOT NULL,
    contrato_version_id uuid NOT NULL,
    secuencia integer NOT NULL,
    rango daterange NOT NULL,
    vence_at timestamp with time zone NOT NULL,
    moneda text NOT NULL,
    monto_emitido numeric(20,6) NOT NULL,
    snapshot_regla jsonb NOT NULL,
    creado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_periodo_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_periodo_monto_emitido_check CHECK ((monto_emitido > (0)::numeric)),
    CONSTRAINT alq_periodo_rango_ck CHECK (((NOT isempty(rango)) AND (lower(rango) IS NOT NULL) AND lower_inc(rango) AND (upper(rango) IS NOT NULL) AND (NOT upper_inc(rango)))),
    CONSTRAINT alq_periodo_secuencia_check CHECK ((secuencia > 0))
);

ALTER TABLE ONLY alq.alq_periodo FORCE ROW LEVEL SECURITY;


--
-- Name: alq_propiedad; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_propiedad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    direccion text NOT NULL,
    direccion_norm text NOT NULL,
    ciudad text NOT NULL,
    ciudad_norm text NOT NULL,
    provincia text NOT NULL,
    geo jsonb,
    publicacion_propiedad_id uuid,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actualizada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_propiedad_ciudad_check CHECK ((btrim(ciudad) <> ''::text)),
    CONSTRAINT alq_propiedad_ciudad_norm_check CHECK ((btrim(ciudad_norm) <> ''::text)),
    CONSTRAINT alq_propiedad_direccion_check CHECK ((btrim(direccion) <> ''::text)),
    CONSTRAINT alq_propiedad_direccion_norm_check CHECK ((btrim(direccion_norm) <> ''::text)),
    CONSTRAINT alq_propiedad_geo_ck CHECK (((geo IS NULL) OR (jsonb_typeof(geo) = 'object'::text))),
    CONSTRAINT alq_propiedad_provincia_check CHECK ((btrim(provincia) <> ''::text))
);

ALTER TABLE ONLY alq.alq_propiedad FORCE ROW LEVEL SECURITY;


--
-- Name: alq_rendicion; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_rendicion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    mandato_version_id uuid NOT NULL,
    periodo date NOT NULL,
    moneda text NOT NULL,
    saldo_inicial numeric(20,6) NOT NULL,
    saldo_final numeric(20,6),
    estado text NOT NULL,
    documento_id uuid,
    sucesora_de uuid,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    emitida_at timestamp with time zone,
    CONSTRAINT alq_rendicion_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'emitida'::text, 'corregida'::text]))),
    CONSTRAINT alq_rendicion_estado_ck CHECK ((((estado = 'borrador'::text) AND (saldo_final IS NULL) AND (emitida_at IS NULL)) OR ((estado = ANY (ARRAY['emitida'::text, 'corregida'::text])) AND (saldo_final IS NOT NULL) AND (emitida_at IS NOT NULL)))),
    CONSTRAINT alq_rendicion_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text))
);

ALTER TABLE ONLY alq.alq_rendicion FORCE ROW LEVEL SECURITY;


--
-- Name: alq_rendicion_linea; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_rendicion_linea (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rendicion_id uuid NOT NULL,
    cargo_id uuid,
    transaccion_id uuid,
    nota_id uuid,
    monto numeric(20,6) NOT NULL,
    moneda text NOT NULL,
    signo smallint NOT NULL,
    categoria text NOT NULL,
    snapshot jsonb NOT NULL,
    CONSTRAINT alq_rendicion_linea_categoria_check CHECK ((categoria = ANY (ARRAY['cobro'::text, 'honorario'::text, 'gasto_duenio'::text, 'retencion'::text, 'aporte'::text, 'credito'::text]))),
    CONSTRAINT alq_rendicion_linea_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_rendicion_linea_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_rendicion_linea_origen_ck CHECK ((((((cargo_id IS NOT NULL))::integer + ((transaccion_id IS NOT NULL))::integer) + ((nota_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT alq_rendicion_linea_signo_check CHECK ((signo = ANY (ARRAY['-1'::integer, 1])))
);

ALTER TABLE ONLY alq.alq_rendicion_linea FORCE ROW LEVEL SECURITY;


--
-- Name: alq_rescision; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_rescision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contrato_id uuid NOT NULL,
    notificada_at timestamp with time zone NOT NULL,
    efectiva_at timestamp with time zone NOT NULL,
    causal text NOT NULL,
    preaviso_dias integer NOT NULL,
    cargo_penalidad_id uuid,
    condonacion_nota_id uuid,
    entrega_llaves_at timestamp with time zone,
    documento_id uuid,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_rescision_fechas_ck CHECK ((efectiva_at >= notificada_at)),
    CONSTRAINT alq_rescision_preaviso_dias_check CHECK ((preaviso_dias >= 0))
);

ALTER TABLE ONLY alq.alq_rescision FORCE ROW LEVEL SECURITY;


--
-- Name: alq_servicio_cuenta; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_servicio_cuenta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    tipo text NOT NULL,
    responsable_parte_id uuid NOT NULL,
    nro_cliente text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    operacion_id uuid NOT NULL
);

ALTER TABLE ONLY alq.alq_servicio_cuenta FORCE ROW LEVEL SECURITY;


--
-- Name: alq_servicio_factura; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_servicio_factura (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cuenta_id uuid NOT NULL,
    propiedad_id uuid NOT NULL,
    periodo daterange NOT NULL,
    moneda text NOT NULL,
    monto numeric(20,6) NOT NULL,
    vence_at timestamp with time zone NOT NULL,
    comprobante_documento_id uuid,
    cargo_id uuid,
    saldada boolean DEFAULT false NOT NULL,
    operacion_id uuid NOT NULL,
    CONSTRAINT alq_servicio_factura_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_servicio_factura_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_servicio_factura_periodo_ck CHECK ((NOT isempty(periodo)))
);

ALTER TABLE ONLY alq.alq_servicio_factura FORCE ROW LEVEL SECURITY;


--
-- Name: alq_titularidad; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_titularidad (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propiedad_id uuid NOT NULL,
    parte_id uuid NOT NULL,
    vigencia tstzrange NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_titularidad_vigencia_ck CHECK (((NOT isempty(vigencia)) AND (lower(vigencia) IS NOT NULL) AND lower_inc(vigencia) AND (NOT upper_inc(vigencia))))
);

ALTER TABLE ONLY alq.alq_titularidad FORCE ROW LEVEL SECURITY;


--
-- Name: alq_transaccion_caja; Type: TABLE; Schema: alq; Owner: -
--

CREATE TABLE alq.alq_transaccion_caja (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    direccion text NOT NULL,
    ambito text NOT NULL,
    contraparte_parte_id uuid NOT NULL,
    beneficiario_parte_id uuid NOT NULL,
    cuenta_custodia_id uuid,
    moneda text NOT NULL,
    monto numeric(20,6) NOT NULL,
    fecha timestamp with time zone NOT NULL,
    medio text NOT NULL,
    comprobante_documento_id uuid,
    estado text NOT NULL,
    transferencia_id uuid,
    reversa_de uuid,
    operacion_id uuid NOT NULL,
    creada_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_transaccion_ambito_ck CHECK ((((ambito = 'externa_informativa'::text) AND (cuenta_custodia_id IS NULL)) OR ((ambito = 'custodiada'::text) AND (cuenta_custodia_id IS NOT NULL)))),
    CONSTRAINT alq_transaccion_caja_ambito_check CHECK ((ambito = ANY (ARRAY['custodiada'::text, 'externa_informativa'::text]))),
    CONSTRAINT alq_transaccion_caja_direccion_check CHECK ((direccion = ANY (ARRAY['entrada'::text, 'salida'::text]))),
    CONSTRAINT alq_transaccion_caja_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'confirmada'::text, 'rechazada'::text, 'revertida'::text]))),
    CONSTRAINT alq_transaccion_caja_moneda_check CHECK ((moneda ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT alq_transaccion_caja_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT alq_transaccion_reversa_propia_ck CHECK (((reversa_de IS NULL) OR (reversa_de <> id)))
);

ALTER TABLE ONLY alq.alq_transaccion_caja FORCE ROW LEVEL SECURITY;


--
-- Name: alq_v_comunicados_propietario; Type: VIEW; Schema: alq; Owner: -
--

CREATE VIEW alq.alq_v_comunicados_propietario WITH (security_invoker='true') AS
 SELECT c.id,
    c.propiedad_id,
    c.estado,
    c.creado_at,
    count(m.id) AS mensajes,
    count(m.id) FILTER (WHERE ((m.autor_tipo <> 'propietario'::text) AND (m.leido_por_propietario_at IS NULL))) AS no_leidos
   FROM (alq.alq_comunicado c
     LEFT JOIN alq.alq_comunicado_mensaje m ON ((m.comunicado_id = c.id)))
  GROUP BY c.id, c.propiedad_id, c.estado, c.creado_at;


--
-- Name: alq_v_estado_cartera; Type: VIEW; Schema: alq; Owner: -
--

CREATE VIEW alq.alq_v_estado_cartera WITH (security_invoker='true') AS
 SELECT p.id AS propiedad_id,
    p.direccion,
    p.ciudad,
    count(c.id) FILTER (WHERE (c.saldo_pendiente > (0)::numeric)) AS cargos_abiertos,
    COALESCE(sum(c.saldo_pendiente) FILTER (WHERE (c.saldo_pendiente > (0)::numeric)), (0)::numeric) AS saldo_abierto,
    min(c.vence_at) FILTER (WHERE (c.saldo_pendiente > (0)::numeric)) AS proximo_vencimiento
   FROM (alq.alq_propiedad p
     LEFT JOIN alq.alq_cargo c ON ((c.propiedad_id = p.id)))
  GROUP BY p.id, p.direccion, p.ciudad;


--
-- Name: alq_v_propiedades_propietario; Type: VIEW; Schema: alq; Owner: -
--

CREATE VIEW alq.alq_v_propiedades_propietario WITH (security_invoker='true') AS
 SELECT p.id,
    p.direccion,
    p.ciudad,
    p.provincia,
    p.publicacion_propiedad_id,
    m.id AS mandato_id,
    m.estado AS mandato_estado,
    t.parte_id AS titular_parte_id
   FROM ((alq.alq_propiedad p
     LEFT JOIN alq.alq_mandato m ON (((m.propiedad_id = p.id) AND (m.estado <> 'cerrado'::text))))
     LEFT JOIN alq.alq_titularidad t ON ((t.id = m.titularidad_id)));


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid NOT NULL,
    email text
);


--
-- Name: alq_f0_acl_previa_v1; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.alq_f0_acl_previa_v1 (
    vista name NOT NULL,
    vista_oid oid NOT NULL,
    vista_definicion text NOT NULL,
    vista_reloptions text[] NOT NULL,
    vista_columnas_sha256 text NOT NULL,
    owner_name name NOT NULL,
    authenticated_grantor name NOT NULL,
    authenticated_privilegios text[] NOT NULL,
    service_role_grantor name,
    service_role_privilegios text[] NOT NULL,
    base_oid oid NOT NULL,
    base_sha256 text NOT NULL,
    capturado_at timestamp with time zone NOT NULL,
    project_ref text NOT NULL,
    fila_sha256 text NOT NULL,
    CONSTRAINT alq_f0_acl_previa_v1_authenticated_grantor_check CHECK ((authenticated_grantor = 'postgres'::name)),
    CONSTRAINT alq_f0_acl_previa_v1_authenticated_privilegios_check CHECK ((cardinality(authenticated_privilegios) = ANY (ARRAY[7, 8]))),
    CONSTRAINT alq_f0_acl_previa_v1_authenticated_privilegios_check1 CHECK ((authenticated_privilegios @> ARRAY['SELECT'::text])),
    CONSTRAINT alq_f0_acl_previa_v1_base_sha256_check CHECK ((base_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT alq_f0_acl_previa_v1_check CHECK ((((cardinality(service_role_privilegios) = 0) AND (service_role_grantor IS NULL)) OR ((cardinality(service_role_privilegios) = ANY (ARRAY[7, 8])) AND (service_role_grantor = 'postgres'::name)))),
    CONSTRAINT alq_f0_acl_previa_v1_fila_sha256_check CHECK ((fila_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT alq_f0_acl_previa_v1_owner_name_check CHECK ((owner_name = 'postgres'::name)),
    CONSTRAINT alq_f0_acl_previa_v1_project_ref_check CHECK ((project_ref = 'rsjwqmpseknvydistgfr'::text)),
    CONSTRAINT alq_f0_acl_previa_v1_service_role_privilegios_check CHECK ((cardinality(service_role_privilegios) = ANY (ARRAY[0, 7, 8]))),
    CONSTRAINT alq_f0_acl_previa_v1_vista_columnas_sha256_check CHECK ((vista_columnas_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: alq_instalacion_control_v1; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.alq_instalacion_control_v1 (
    singleton boolean DEFAULT true NOT NULL,
    project_ref text NOT NULL,
    especificacion jsonb NOT NULL,
    bridge_pre_count bigint NOT NULL,
    bridge_pre_exact boolean NOT NULL,
    capturado_at timestamp with time zone NOT NULL,
    CONSTRAINT alq_instalacion_control_v1_bridge_pre_count_check CHECK ((bridge_pre_count = 0)),
    CONSTRAINT alq_instalacion_control_v1_bridge_pre_exact_check CHECK ((bridge_pre_exact = false)),
    CONSTRAINT alq_instalacion_control_v1_project_ref_check CHECK ((project_ref = 'rsjwqmpseknvydistgfr'::text)),
    CONSTRAINT alq_instalacion_control_v1_singleton_check CHECK (singleton)
);


--
-- Name: alq_instalacion_etapas_v1; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.alq_instalacion_etapas_v1 (
    etapa text NOT NULL,
    completada_at timestamp with time zone NOT NULL,
    CONSTRAINT alq_instalacion_etapas_v1_etapa_check CHECK ((etapa = ANY (ARRAY['PRE'::text, 'A'::text, 'B'::text, 'C'::text, 'D'::text])))
);


--
-- Name: alq_snapshot_aislamiento_v1; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.alq_snapshot_aislamiento_v1 (
    clave text NOT NULL,
    payload jsonb NOT NULL,
    sha256 text NOT NULL,
    capturado_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT alq_snapshot_aislamiento_v1_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: qa_marca_descartable; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private."qa_marca_descartable" (
    singleton boolean NOT NULL,
    project_ref text NOT NULL,
    CONSTRAINT qa_marca_descartable_singleton_check CHECK (singleton)
);


--
-- Name: alq_mail_entrante; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alq_mail_entrante (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text NOT NULL,
    remitente text,
    asunto text,
    recibido_at timestamp with time zone,
    adjunto_nombre text NOT NULL,
    storage_path text NOT NULL,
    bytes bigint NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    creado_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alq_mail_entrante_bytes_check CHECK ((bytes > 0)),
    CONSTRAINT alq_mail_entrante_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'confirmada'::text, 'descartada'::text])))
);

ALTER TABLE ONLY public.alq_mail_entrante FORCE ROW LEVEL SECURITY;


--
-- Name: alq_v_acceso_propiedad; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_acceso_propiedad WITH (security_invoker='true') AS
 SELECT id,
    parte_usuario_id,
    propiedad_id,
    vigencia,
    creada_at
   FROM alq.alq_acceso_propiedad;


--
-- Name: alq_v_aplicacion; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_aplicacion WITH (security_invoker='true') AS
 SELECT id,
    transaccion_id,
    cargo_id,
    deposito_evento_id,
    rendicion_id,
    credito_id,
    importe_origen,
    moneda_origen,
    importe_destino,
    moneda_destino,
    conversion_id,
    operacion_id,
    creada_at
   FROM alq.alq_aplicacion;


--
-- Name: alq_v_cargo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_cargo WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    contrato_id,
    periodo_id,
    deudor_parte_id,
    acreedor_parte_id,
    ambito,
    concepto,
    moneda,
    monto,
    vence_at,
    origen,
    operacion_id,
    snapshot_regla,
    saldo_pendiente,
    creado_at
   FROM alq.alq_cargo;


--
-- Name: alq_v_comunicado; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_comunicado WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    abierto_por_tipo,
    abierto_por_parte_id,
    estado,
    operacion_id,
    creado_at,
    resuelto_at
   FROM alq.alq_comunicado;


--
-- Name: alq_v_comunicado_mensaje; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_comunicado_mensaje WITH (security_invoker='true') AS
 SELECT id,
    comunicado_id,
    autor_tipo,
    autor_parte_usuario_id,
    texto,
    leido_por_propietario_at,
    operacion_id,
    creado_at
   FROM alq.alq_comunicado_mensaje;


--
-- Name: alq_v_contrato; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_contrato WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    inquilino_parte_id,
    predecesor_id,
    inicio,
    fin_pactado,
    fin_efectivo,
    continuacion_desde,
    estado,
    pdf_documento_id,
    creado_at,
    actualizado_at
   FROM alq.alq_contrato;


--
-- Name: alq_v_contrato_version; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_contrato_version WITH (security_invoker='true') AS
 SELECT id,
    contrato_id,
    vigencia,
    monto,
    moneda,
    dia_pago_desde,
    dia_pago_hasta,
    indice_serie_id,
    pct_fijo,
    frecuencia_ajuste,
    punitorio_pct_dia,
    punitorio_desde_dia,
    formula_punitorio_version,
    metodo_prorrateo,
    regla_redondeo,
    regla_pago_otra_moneda,
    fuente_conversion,
    fallback_indice,
    creada_at
   FROM alq.alq_contrato_version;


--
-- Name: alq_v_cuenta_custodia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_cuenta_custodia WITH (security_invoker='true') AS
 SELECT id,
    banco_billetera,
    identificador,
    moneda,
    activa,
    creada_at
   FROM alq.alq_cuenta_custodia;


--
-- Name: alq_v_documento; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_documento WITH (security_invoker='true') AS
 SELECT id,
    tipo,
    bucket,
    path,
    sha256,
    mime,
    bytes,
    version,
    propiedad_id,
    mandato_id,
    audiencia,
    retencion,
    creada_at
   FROM alq.alq_documento;


--
-- Name: alq_v_factura_externa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_factura_externa WITH (security_invoker='true') AS
 SELECT id,
    fecha_emision,
    emisor_cuit,
    emisor_condicion_fiscal,
    receptor_cuit,
    receptor_condicion_fiscal,
    tipo,
    punto_numero,
    moneda,
    neto,
    impuestos,
    total,
    cae,
    vto_cae,
    estado,
    documento_id,
    operacion_id
   FROM alq.alq_factura_externa;


--
-- Name: alq_v_garantia; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_garantia WITH (security_invoker='true') AS
 SELECT id,
    contrato_id,
    garante_parte_id,
    tipo,
    poliza,
    emisor,
    cobertura,
    moneda,
    vigencia,
    documento_id,
    regla_notificacion_mora
   FROM alq.alq_garantia;


--
-- Name: alq_v_mandato; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_mandato WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    titularidad_id,
    vigencia,
    estado,
    creada_at,
    actualizada_at
   FROM alq.alq_mandato;


--
-- Name: alq_v_mandato_version; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_mandato_version WITH (security_invoker='true') AS
 SELECT id,
    mandato_id,
    vigencia,
    honorario_base,
    honorario_pct,
    honorario_minimo,
    honorario_fijo,
    incluye_punitorios,
    moneda,
    tratamiento_impuestos,
    creada_at
   FROM alq.alq_mandato_version;


--
-- Name: alq_v_nota; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_nota WITH (security_invoker='true') AS
 SELECT id,
    tipo,
    cargo_id,
    monto,
    moneda,
    motivo,
    aprobador_parte_usuario_id,
    fecha,
    operacion_id
   FROM alq.alq_nota;


--
-- Name: alq_v_operacion; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_operacion WITH (security_invoker='true') AS
 SELECT id,
    request_id,
    operacion,
    payload_normalizado,
    firma_sha256,
    estado,
    resultado,
    actor_parte_usuario_id,
    preparada_at,
    aplicada_at
   FROM alq.alq_operacion;


--
-- Name: alq_v_parte; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_parte WITH (security_invoker='true') AS
 SELECT id,
    tipo_persona,
    nombre,
    documento_tipo,
    documento_numero,
    tel_whatsapp,
    email,
    notas,
    creada_at,
    actualizada_at
   FROM alq.alq_parte;


--
-- Name: alq_v_parte_usuario; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_parte_usuario WITH (security_invoker='true') AS
 SELECT id,
    parte_id,
    auth_user_id,
    vigencia,
    creada_at
   FROM alq.alq_parte_usuario;


--
-- Name: alq_v_propiedad; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_propiedad WITH (security_invoker='true') AS
 SELECT id,
    direccion,
    direccion_norm,
    ciudad,
    ciudad_norm,
    provincia,
    geo,
    publicacion_propiedad_id,
    creada_at,
    actualizada_at
   FROM alq.alq_propiedad;


--
-- Name: alq_v_rendicion; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_rendicion WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    mandato_version_id,
    periodo,
    moneda,
    saldo_inicial,
    saldo_final,
    estado,
    documento_id,
    sucesora_de,
    operacion_id,
    creada_at,
    emitida_at
   FROM alq.alq_rendicion;


--
-- Name: alq_v_rendicion_linea; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_rendicion_linea WITH (security_invoker='true') AS
 SELECT id,
    rendicion_id,
    cargo_id,
    transaccion_id,
    nota_id,
    monto,
    moneda,
    signo,
    categoria,
    snapshot
   FROM alq.alq_rendicion_linea;


--
-- Name: alq_v_servicio_cuenta; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_servicio_cuenta WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    tipo,
    responsable_parte_id,
    nro_cliente,
    activa,
    operacion_id
   FROM alq.alq_servicio_cuenta;


--
-- Name: alq_v_servicio_factura; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_servicio_factura WITH (security_invoker='true') AS
 SELECT id,
    cuenta_id,
    propiedad_id,
    periodo,
    moneda,
    monto,
    vence_at,
    comprobante_documento_id,
    cargo_id,
    saldada,
    operacion_id
   FROM alq.alq_servicio_factura;


--
-- Name: alq_v_titularidad; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_titularidad WITH (security_invoker='true') AS
 SELECT id,
    propiedad_id,
    parte_id,
    vigencia,
    creada_at
   FROM alq.alq_titularidad;


--
-- Name: alq_v_transaccion_caja; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.alq_v_transaccion_caja WITH (security_invoker='true') AS
 SELECT id,
    direccion,
    ambito,
    contraparte_parte_id,
    beneficiario_parte_id,
    cuenta_custodia_id,
    moneda,
    monto,
    fecha,
    medio,
    comprobante_documento_id,
    estado,
    transferencia_id,
    reversa_de,
    operacion_id,
    creada_at
   FROM alq.alq_transaccion_caja;


--
-- Name: canales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canales (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: destino_asignaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.destino_asignaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: propiedades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.propiedades (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proyectos (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: referencia_propiedad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referencia_propiedad (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: referencia_proyecto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referencia_proyecto (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: referencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referencias (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitas (
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text,
    public boolean DEFAULT false
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    metadata jsonb
);


--
-- Name: alq_acceso_propiedad alq_acceso_propiedad_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_acceso_propiedad
    ADD CONSTRAINT alq_acceso_propiedad_pkey PRIMARY KEY (id);


--
-- Name: alq_acceso_propiedad alq_acceso_propiedad_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_acceso_propiedad
    ADD CONSTRAINT alq_acceso_propiedad_vigencia_ex EXCLUDE USING gist (parte_usuario_id WITH =, propiedad_id WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_agenda_ocurrencia alq_agenda_ocurrencia_dedupe_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_ocurrencia
    ADD CONSTRAINT alq_agenda_ocurrencia_dedupe_uq UNIQUE (regla_id, due_at);


--
-- Name: alq_agenda_ocurrencia alq_agenda_ocurrencia_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_ocurrencia
    ADD CONSTRAINT alq_agenda_ocurrencia_pkey PRIMARY KEY (id);


--
-- Name: alq_agenda_regla alq_agenda_regla_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_pkey PRIMARY KEY (id);


--
-- Name: alq_ajuste_observacion alq_ajuste_observacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste_observacion
    ADD CONSTRAINT alq_ajuste_observacion_pkey PRIMARY KEY (ajuste_id, observacion_id);


--
-- Name: alq_ajuste alq_ajuste_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste
    ADD CONSTRAINT alq_ajuste_pkey PRIMARY KEY (id);


--
-- Name: alq_aplicacion alq_aplicacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_pkey PRIMARY KEY (id);


--
-- Name: alq_aplicacion_reversa alq_aplicacion_reversa_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion_reversa
    ADD CONSTRAINT alq_aplicacion_reversa_pkey PRIMARY KEY (id);


--
-- Name: alq_capacidad_admin alq_capacidad_admin_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_capacidad_admin
    ADD CONSTRAINT alq_capacidad_admin_pkey PRIMARY KEY (id);


--
-- Name: alq_capacidad_admin alq_capacidad_admin_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_capacidad_admin
    ADD CONSTRAINT alq_capacidad_admin_vigencia_ex EXCLUDE USING gist (parte_usuario_id WITH =, capacidad WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_cargo alq_cargo_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_pkey PRIMARY KEY (id);


--
-- Name: alq_comunicado_adjunto alq_comunicado_adjunto_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_adjunto
    ADD CONSTRAINT alq_comunicado_adjunto_pkey PRIMARY KEY (mensaje_id, documento_id);


--
-- Name: alq_comunicado_mensaje alq_comunicado_mensaje_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_mensaje
    ADD CONSTRAINT alq_comunicado_mensaje_pkey PRIMARY KEY (id);


--
-- Name: alq_comunicado alq_comunicado_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado
    ADD CONSTRAINT alq_comunicado_pkey PRIMARY KEY (id);


--
-- Name: alq_contrato alq_contrato_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato
    ADD CONSTRAINT alq_contrato_pkey PRIMARY KEY (id);


--
-- Name: alq_contrato_version alq_contrato_version_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato_version
    ADD CONSTRAINT alq_contrato_version_pkey PRIMARY KEY (id);


--
-- Name: alq_contrato_version alq_contrato_version_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato_version
    ADD CONSTRAINT alq_contrato_version_vigencia_ex EXCLUDE USING gist (contrato_id WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_conversion_moneda alq_conversion_moneda_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_conversion_moneda
    ADD CONSTRAINT alq_conversion_moneda_pkey PRIMARY KEY (id);


--
-- Name: alq_credito_consumo alq_credito_consumo_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito_consumo
    ADD CONSTRAINT alq_credito_consumo_pkey PRIMARY KEY (id);


--
-- Name: alq_credito alq_credito_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito
    ADD CONSTRAINT alq_credito_pkey PRIMARY KEY (id);


--
-- Name: alq_cuenta_custodia alq_cuenta_custodia_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cuenta_custodia
    ADD CONSTRAINT alq_cuenta_custodia_pkey PRIMARY KEY (id);


--
-- Name: alq_cuenta_custodia alq_cuenta_custodia_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cuenta_custodia
    ADD CONSTRAINT alq_cuenta_custodia_uq UNIQUE (banco_billetera, identificador, moneda);


--
-- Name: alq_deposito alq_deposito_contrato_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito
    ADD CONSTRAINT alq_deposito_contrato_uq UNIQUE (contrato_id);


--
-- Name: alq_deposito_evento alq_deposito_evento_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_pkey PRIMARY KEY (id);


--
-- Name: alq_deposito_liquidacion_linea alq_deposito_liquidacion_linea_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion_linea
    ADD CONSTRAINT alq_deposito_liquidacion_linea_pkey PRIMARY KEY (id);


--
-- Name: alq_deposito_liquidacion alq_deposito_liquidacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion
    ADD CONSTRAINT alq_deposito_liquidacion_pkey PRIMARY KEY (id);


--
-- Name: alq_deposito alq_deposito_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito
    ADD CONSTRAINT alq_deposito_pkey PRIMARY KEY (id);


--
-- Name: alq_documento alq_documento_path_key; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_documento
    ADD CONSTRAINT alq_documento_path_key UNIQUE (path);


--
-- Name: alq_documento alq_documento_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_documento
    ADD CONSTRAINT alq_documento_pkey PRIMARY KEY (id);


--
-- Name: alq_export_baja alq_export_baja_mandato_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_export_baja
    ADD CONSTRAINT alq_export_baja_mandato_uq UNIQUE (mandato_id);


--
-- Name: alq_export_baja alq_export_baja_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_export_baja
    ADD CONSTRAINT alq_export_baja_pkey PRIMARY KEY (id);


--
-- Name: alq_factura_externa alq_factura_externa_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_factura_externa
    ADD CONSTRAINT alq_factura_externa_pkey PRIMARY KEY (id);


--
-- Name: alq_factura_externa alq_factura_externa_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_factura_externa
    ADD CONSTRAINT alq_factura_externa_uq UNIQUE (emisor_cuit, tipo, punto_numero);


--
-- Name: alq_garantia alq_garantia_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_garantia
    ADD CONSTRAINT alq_garantia_pkey PRIMARY KEY (id);


--
-- Name: alq_indice_observacion alq_indice_observacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_observacion
    ADD CONSTRAINT alq_indice_observacion_pkey PRIMARY KEY (id);


--
-- Name: alq_indice_observacion alq_indice_observacion_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_observacion
    ADD CONSTRAINT alq_indice_observacion_uq UNIQUE (serie_id, periodo, hash_insumo);


--
-- Name: alq_indice_serie alq_indice_serie_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_serie
    ADD CONSTRAINT alq_indice_serie_pkey PRIMARY KEY (id);


--
-- Name: alq_indice_serie alq_indice_serie_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_serie
    ADD CONSTRAINT alq_indice_serie_uq UNIQUE (organismo, codigo, base, version);


--
-- Name: alq_journal alq_journal_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_journal
    ADD CONSTRAINT alq_journal_pkey PRIMARY KEY (id);


--
-- Name: alq_mandato alq_mandato_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato
    ADD CONSTRAINT alq_mandato_pkey PRIMARY KEY (id);


--
-- Name: alq_mandato_version alq_mandato_version_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato_version
    ADD CONSTRAINT alq_mandato_version_pkey PRIMARY KEY (id);


--
-- Name: alq_mandato_version alq_mandato_version_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato_version
    ADD CONSTRAINT alq_mandato_version_vigencia_ex EXCLUDE USING gist (mandato_id WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_nota alq_nota_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_nota
    ADD CONSTRAINT alq_nota_pkey PRIMARY KEY (id);


--
-- Name: alq_notificacion alq_notificacion_dedupe_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion
    ADD CONSTRAINT alq_notificacion_dedupe_uq UNIQUE (ocurrencia_id, destinatario_parte_id, canal);


--
-- Name: alq_notificacion_intento alq_notificacion_intento_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion_intento
    ADD CONSTRAINT alq_notificacion_intento_pkey PRIMARY KEY (id);


--
-- Name: alq_notificacion_intento alq_notificacion_intento_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion_intento
    ADD CONSTRAINT alq_notificacion_intento_uq UNIQUE (notificacion_id, intento_n);


--
-- Name: alq_notificacion alq_notificacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion
    ADD CONSTRAINT alq_notificacion_pkey PRIMARY KEY (id);


--
-- Name: alq_operacion alq_operacion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_operacion
    ADD CONSTRAINT alq_operacion_pkey PRIMARY KEY (id);


--
-- Name: alq_operacion alq_operacion_request_id_key; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_operacion
    ADD CONSTRAINT alq_operacion_request_id_key UNIQUE (request_id);


--
-- Name: alq_parte alq_parte_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_parte
    ADD CONSTRAINT alq_parte_pkey PRIMARY KEY (id);


--
-- Name: alq_parte_usuario alq_parte_usuario_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_parte_usuario
    ADD CONSTRAINT alq_parte_usuario_pkey PRIMARY KEY (id);


--
-- Name: alq_parte_usuario alq_parte_usuario_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_parte_usuario
    ADD CONSTRAINT alq_parte_usuario_vigencia_ex EXCLUDE USING gist (auth_user_id WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_periodo alq_periodo_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_periodo
    ADD CONSTRAINT alq_periodo_pkey PRIMARY KEY (id);


--
-- Name: alq_periodo alq_periodo_rango_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_periodo
    ADD CONSTRAINT alq_periodo_rango_ex EXCLUDE USING gist (contrato_id WITH =, rango WITH &&) DEFERRABLE;


--
-- Name: alq_periodo alq_periodo_secuencia_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_periodo
    ADD CONSTRAINT alq_periodo_secuencia_uq UNIQUE (contrato_id, secuencia);


--
-- Name: alq_propiedad alq_propiedad_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_propiedad
    ADD CONSTRAINT alq_propiedad_pkey PRIMARY KEY (id);


--
-- Name: alq_rendicion_linea alq_rendicion_linea_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion_linea
    ADD CONSTRAINT alq_rendicion_linea_pkey PRIMARY KEY (id);


--
-- Name: alq_rendicion alq_rendicion_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_pkey PRIMARY KEY (id);


--
-- Name: alq_rendicion alq_rendicion_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_uq UNIQUE (propiedad_id, periodo, moneda, sucesora_de);


--
-- Name: alq_rescision alq_rescision_contrato_id_key; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_contrato_id_key UNIQUE (contrato_id);


--
-- Name: alq_rescision alq_rescision_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_pkey PRIMARY KEY (id);


--
-- Name: alq_servicio_cuenta alq_servicio_cuenta_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_cuenta
    ADD CONSTRAINT alq_servicio_cuenta_pkey PRIMARY KEY (id);


--
-- Name: alq_servicio_cuenta alq_servicio_cuenta_uq; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_cuenta
    ADD CONSTRAINT alq_servicio_cuenta_uq UNIQUE (propiedad_id, tipo, nro_cliente);


--
-- Name: alq_servicio_factura alq_servicio_factura_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_pkey PRIMARY KEY (id);


--
-- Name: alq_titularidad alq_titularidad_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_titularidad
    ADD CONSTRAINT alq_titularidad_pkey PRIMARY KEY (id);


--
-- Name: alq_titularidad alq_titularidad_vigencia_ex; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_titularidad
    ADD CONSTRAINT alq_titularidad_vigencia_ex EXCLUDE USING gist (propiedad_id WITH =, vigencia WITH &&) DEFERRABLE;


--
-- Name: alq_transaccion_caja alq_transaccion_caja_pkey; Type: CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_caja_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: alq_f0_acl_previa_v1 alq_f0_acl_previa_v1_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.alq_f0_acl_previa_v1
    ADD CONSTRAINT alq_f0_acl_previa_v1_pkey PRIMARY KEY (vista);


--
-- Name: alq_instalacion_control_v1 alq_instalacion_control_v1_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.alq_instalacion_control_v1
    ADD CONSTRAINT alq_instalacion_control_v1_pkey PRIMARY KEY (singleton);


--
-- Name: alq_instalacion_etapas_v1 alq_instalacion_etapas_v1_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.alq_instalacion_etapas_v1
    ADD CONSTRAINT alq_instalacion_etapas_v1_pkey PRIMARY KEY (etapa);


--
-- Name: alq_snapshot_aislamiento_v1 alq_snapshot_aislamiento_v1_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.alq_snapshot_aislamiento_v1
    ADD CONSTRAINT alq_snapshot_aislamiento_v1_pkey PRIMARY KEY (clave);


--
-- Name: qa_marca_descartable qa_marca_descartable_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private."qa_marca_descartable"
    ADD CONSTRAINT qa_marca_descartable_pkey PRIMARY KEY (singleton);


--
-- Name: alq_mail_entrante alq_mail_entrante_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alq_mail_entrante
    ADD CONSTRAINT alq_mail_entrante_message_id_key UNIQUE (message_id);


--
-- Name: alq_mail_entrante alq_mail_entrante_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alq_mail_entrante
    ADD CONSTRAINT alq_mail_entrante_pkey PRIMARY KEY (id);


--
-- Name: canales canales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canales
    ADD CONSTRAINT canales_pkey PRIMARY KEY (id);


--
-- Name: destino_asignaciones destino_asignaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.destino_asignaciones
    ADD CONSTRAINT destino_asignaciones_pkey PRIMARY KEY (id);


--
-- Name: propiedades propiedades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.propiedades
    ADD CONSTRAINT propiedades_pkey PRIMARY KEY (id);


--
-- Name: proyectos proyectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proyectos
    ADD CONSTRAINT proyectos_pkey PRIMARY KEY (id);


--
-- Name: referencia_propiedad referencia_propiedad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencia_propiedad
    ADD CONSTRAINT referencia_propiedad_pkey PRIMARY KEY (id);


--
-- Name: referencia_proyecto referencia_proyecto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencia_proyecto
    ADD CONSTRAINT referencia_proyecto_pkey PRIMARY KEY (id);


--
-- Name: referencias referencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referencias
    ADD CONSTRAINT referencias_pkey PRIMARY KEY (id);


--
-- Name: visitas visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: alq_acceso_propiedad_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_acceso_propiedad_propiedad_ix ON alq.alq_acceso_propiedad USING btree (propiedad_id);


--
-- Name: alq_acceso_propiedad_usuario_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_acceso_propiedad_usuario_ix ON alq.alq_acceso_propiedad USING btree (parte_usuario_id);


--
-- Name: alq_agenda_ocurrencia_pendiente_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_ocurrencia_pendiente_ix ON alq.alq_agenda_ocurrencia USING btree (due_at, propiedad_id) WHERE (estado = 'pendiente'::text);


--
-- Name: alq_agenda_regla_contrato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_regla_contrato_ix ON alq.alq_agenda_regla USING btree (contrato_id);


--
-- Name: alq_agenda_regla_mandato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_regla_mandato_ix ON alq.alq_agenda_regla USING btree (mandato_id);


--
-- Name: alq_agenda_regla_periodo_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_regla_periodo_ix ON alq.alq_agenda_regla USING btree (periodo_id);


--
-- Name: alq_agenda_regla_servicio_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_regla_servicio_ix ON alq.alq_agenda_regla USING btree (servicio_cuenta_id);


--
-- Name: alq_agenda_regla_version_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_agenda_regla_version_ix ON alq.alq_agenda_regla USING btree (contrato_version_id);


--
-- Name: alq_ajuste_estado_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_ajuste_estado_ix ON alq.alq_ajuste USING btree (estado, contrato_version_base_id);


--
-- Name: alq_ajuste_observacion_observacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_ajuste_observacion_observacion_ix ON alq.alq_ajuste_observacion USING btree (observacion_id);


--
-- Name: alq_aplicacion_cargo_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_cargo_ix ON alq.alq_aplicacion USING btree (cargo_id);


--
-- Name: alq_aplicacion_conversion_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_aplicacion_conversion_uq ON alq.alq_aplicacion USING btree (conversion_id) WHERE (conversion_id IS NOT NULL);


--
-- Name: alq_aplicacion_credito_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_credito_ix ON alq.alq_aplicacion USING btree (credito_id);


--
-- Name: alq_aplicacion_deposito_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_deposito_ix ON alq.alq_aplicacion USING btree (deposito_evento_id);


--
-- Name: alq_aplicacion_rendicion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_rendicion_ix ON alq.alq_aplicacion USING btree (rendicion_id);


--
-- Name: alq_aplicacion_reversa_conversion_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_aplicacion_reversa_conversion_uq ON alq.alq_aplicacion_reversa USING btree (conversion_reversa_id) WHERE (conversion_reversa_id IS NOT NULL);


--
-- Name: alq_aplicacion_reversa_original_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_reversa_original_ix ON alq.alq_aplicacion_reversa USING btree (aplicacion_original_id);


--
-- Name: alq_aplicacion_reversa_transaccion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_reversa_transaccion_ix ON alq.alq_aplicacion_reversa USING btree (reversa_transaccion_id);


--
-- Name: alq_aplicacion_transaccion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_aplicacion_transaccion_ix ON alq.alq_aplicacion USING btree (transaccion_id);


--
-- Name: alq_capacidad_admin_usuario_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_capacidad_admin_usuario_ix ON alq.alq_capacidad_admin USING btree (parte_usuario_id);


--
-- Name: alq_cargo_contrato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_cargo_contrato_ix ON alq.alq_cargo USING btree (contrato_id);


--
-- Name: alq_cargo_deudor_abierto_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_cargo_deudor_abierto_ix ON alq.alq_cargo USING btree (deudor_parte_id, vence_at) WHERE (saldo_pendiente > (0)::numeric);


--
-- Name: alq_cargo_periodo_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_cargo_periodo_ix ON alq.alq_cargo USING btree (periodo_id);


--
-- Name: alq_cargo_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_cargo_propiedad_ix ON alq.alq_cargo USING btree (propiedad_id);


--
-- Name: alq_comunicado_mensaje_comunicado_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_comunicado_mensaje_comunicado_ix ON alq.alq_comunicado_mensaje USING btree (comunicado_id, creado_at);


--
-- Name: alq_comunicado_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_comunicado_propiedad_ix ON alq.alq_comunicado USING btree (propiedad_id, estado);


--
-- Name: alq_contrato_activo_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_contrato_activo_uq ON alq.alq_contrato USING btree (propiedad_id) WHERE (estado = ANY (ARRAY['vigente'::text, 'continuacion_legal'::text]));


--
-- Name: alq_contrato_inquilino_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_contrato_inquilino_ix ON alq.alq_contrato USING btree (inquilino_parte_id);


--
-- Name: alq_contrato_predecesor_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_contrato_predecesor_ix ON alq.alq_contrato USING btree (predecesor_id);


--
-- Name: alq_contrato_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_contrato_propiedad_ix ON alq.alq_contrato USING btree (propiedad_id);


--
-- Name: alq_contrato_version_contrato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_contrato_version_contrato_ix ON alq.alq_contrato_version USING btree (contrato_id);


--
-- Name: alq_contrato_version_indice_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_contrato_version_indice_ix ON alq.alq_contrato_version USING btree (indice_serie_id, lower(vigencia));


--
-- Name: alq_conversion_operacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_conversion_operacion_ix ON alq.alq_conversion_moneda USING btree (operacion_id);


--
-- Name: alq_credito_consumo_cargo_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_credito_consumo_cargo_ix ON alq.alq_credito_consumo USING btree (cargo_id);


--
-- Name: alq_credito_consumo_credito_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_credito_consumo_credito_ix ON alq.alq_credito_consumo USING btree (credito_id);


--
-- Name: alq_credito_contrato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_credito_contrato_ix ON alq.alq_credito USING btree (contrato_id);


--
-- Name: alq_credito_operacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_credito_operacion_ix ON alq.alq_credito USING btree (operacion_id);


--
-- Name: alq_credito_parte_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_credito_parte_ix ON alq.alq_credito USING btree (parte_id);


--
-- Name: alq_deposito_custodia_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_deposito_custodia_ix ON alq.alq_deposito USING btree (custodia_parte_id);


--
-- Name: alq_deposito_evento_deposito_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_deposito_evento_deposito_ix ON alq.alq_deposito_evento USING btree (deposito_id);


--
-- Name: alq_deposito_evento_transaccion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_deposito_evento_transaccion_ix ON alq.alq_deposito_evento USING btree (transaccion_id);


--
-- Name: alq_deposito_linea_liquidacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_deposito_linea_liquidacion_ix ON alq.alq_deposito_liquidacion_linea USING btree (liquidacion_id);


--
-- Name: alq_deposito_liquidacion_deposito_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_deposito_liquidacion_deposito_ix ON alq.alq_deposito_liquidacion USING btree (deposito_id);


--
-- Name: alq_documento_mandato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_documento_mandato_ix ON alq.alq_documento USING btree (mandato_id);


--
-- Name: alq_documento_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_documento_propiedad_ix ON alq.alq_documento USING btree (propiedad_id);


--
-- Name: alq_garantia_contrato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_garantia_contrato_ix ON alq.alq_garantia USING btree (contrato_id);


--
-- Name: alq_garantia_garante_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_garantia_garante_ix ON alq.alq_garantia USING btree (garante_parte_id);


--
-- Name: alq_indice_observacion_serie_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_indice_observacion_serie_ix ON alq.alq_indice_observacion USING btree (serie_id, lower(periodo));


--
-- Name: alq_journal_entidad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_journal_entidad_ix ON alq.alq_journal USING btree (entidad, entidad_id, id);


--
-- Name: alq_journal_operacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_journal_operacion_ix ON alq.alq_journal USING btree (operacion_id, id);


--
-- Name: alq_mandato_estado_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_mandato_estado_ix ON alq.alq_mandato USING btree (estado, propiedad_id);


--
-- Name: alq_mandato_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_mandato_propiedad_ix ON alq.alq_mandato USING btree (propiedad_id);


--
-- Name: alq_mandato_titularidad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_mandato_titularidad_ix ON alq.alq_mandato USING btree (titularidad_id);


--
-- Name: alq_mandato_version_mandato_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_mandato_version_mandato_ix ON alq.alq_mandato_version USING btree (mandato_id);


--
-- Name: alq_nota_cargo_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_nota_cargo_ix ON alq.alq_nota USING btree (cargo_id);


--
-- Name: alq_notificacion_destinatario_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_notificacion_destinatario_ix ON alq.alq_notificacion USING btree (destinatario_parte_id);


--
-- Name: alq_parte_documento_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_parte_documento_uq ON alq.alq_parte USING btree (documento_tipo, documento_numero) WHERE ((documento_tipo IS NOT NULL) AND (documento_numero IS NOT NULL));


--
-- Name: alq_parte_usuario_auth_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_parte_usuario_auth_ix ON alq.alq_parte_usuario USING btree (auth_user_id);


--
-- Name: alq_parte_usuario_parte_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_parte_usuario_parte_ix ON alq.alq_parte_usuario USING btree (parte_id);


--
-- Name: alq_periodo_contrato_vence_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_periodo_contrato_vence_ix ON alq.alq_periodo USING btree (contrato_id, vence_at);


--
-- Name: alq_periodo_version_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_periodo_version_ix ON alq.alq_periodo USING btree (contrato_version_id);


--
-- Name: alq_propiedad_ciudad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_propiedad_ciudad_ix ON alq.alq_propiedad USING btree (ciudad_norm, id);


--
-- Name: alq_propiedad_direccion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_propiedad_direccion_ix ON alq.alq_propiedad USING btree (direccion_norm, id);


--
-- Name: alq_propiedad_publicacion_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_propiedad_publicacion_uq ON alq.alq_propiedad USING btree (publicacion_propiedad_id) WHERE (publicacion_propiedad_id IS NOT NULL);


--
-- Name: alq_rendicion_linea_rendicion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_rendicion_linea_rendicion_ix ON alq.alq_rendicion_linea USING btree (rendicion_id);


--
-- Name: alq_rendicion_mandato_version_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_rendicion_mandato_version_ix ON alq.alq_rendicion USING btree (mandato_version_id);


--
-- Name: alq_rendicion_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_rendicion_propiedad_ix ON alq.alq_rendicion USING btree (propiedad_id, periodo);


--
-- Name: alq_servicio_cuenta_propiedad_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_servicio_cuenta_propiedad_ix ON alq.alq_servicio_cuenta USING btree (propiedad_id);


--
-- Name: alq_servicio_factura_abierta_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_servicio_factura_abierta_ix ON alq.alq_servicio_factura USING btree (propiedad_id, vence_at) WHERE (NOT saldada);


--
-- Name: alq_servicio_factura_cuenta_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_servicio_factura_cuenta_ix ON alq.alq_servicio_factura USING btree (cuenta_id);


--
-- Name: alq_titularidad_activa_uq; Type: INDEX; Schema: alq; Owner: -
--

CREATE UNIQUE INDEX alq_titularidad_activa_uq ON alq.alq_titularidad USING btree (propiedad_id) WHERE upper_inf(vigencia);


--
-- Name: alq_titularidad_parte_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_titularidad_parte_ix ON alq.alq_titularidad USING btree (parte_id);


--
-- Name: alq_transaccion_cuenta_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_transaccion_cuenta_ix ON alq.alq_transaccion_caja USING btree (cuenta_custodia_id, fecha);


--
-- Name: alq_transaccion_operacion_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_transaccion_operacion_ix ON alq.alq_transaccion_caja USING btree (operacion_id);


--
-- Name: alq_transaccion_reversa_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_transaccion_reversa_ix ON alq.alq_transaccion_caja USING btree (reversa_de);


--
-- Name: alq_transaccion_transferencia_ix; Type: INDEX; Schema: alq; Owner: -
--

CREATE INDEX alq_transaccion_transferencia_ix ON alq.alq_transaccion_caja USING btree (transferencia_id);


--
-- Name: alq_aplicacion alq_aplicacion_limites_ct; Type: TRIGGER; Schema: alq; Owner: -
--

CREATE CONSTRAINT TRIGGER alq_aplicacion_limites_ct AFTER INSERT OR DELETE OR UPDATE ON alq.alq_aplicacion DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION alq_private.alq_constraint_check_v1();


--
-- Name: alq_journal alq_journal_inmutable_trg; Type: TRIGGER; Schema: alq; Owner: -
--

CREATE TRIGGER alq_journal_inmutable_trg BEFORE DELETE OR UPDATE ON alq.alq_journal FOR EACH ROW EXECUTE FUNCTION alq_private.alq_journal_inmutable_v1();


--
-- Name: alq_aplicacion_reversa alq_reapertura_limites_ct; Type: TRIGGER; Schema: alq; Owner: -
--

CREATE CONSTRAINT TRIGGER alq_reapertura_limites_ct AFTER INSERT OR DELETE OR UPDATE ON alq.alq_aplicacion_reversa DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION alq_private.alq_constraint_check_v1();


--
-- Name: alq_transaccion_caja alq_transferencia_par_ct; Type: TRIGGER; Schema: alq; Owner: -
--

CREATE CONSTRAINT TRIGGER alq_transferencia_par_ct AFTER INSERT OR DELETE OR UPDATE ON alq.alq_transaccion_caja DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION alq_private.alq_constraint_check_v1();


--
-- Name: alq_acceso_propiedad alq_acceso_propiedad_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_acceso_propiedad
    ADD CONSTRAINT alq_acceso_propiedad_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_acceso_propiedad alq_acceso_propiedad_usuario_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_acceso_propiedad
    ADD CONSTRAINT alq_acceso_propiedad_usuario_fk FOREIGN KEY (parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_ocurrencia alq_agenda_ocurrencia_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_ocurrencia
    ADD CONSTRAINT alq_agenda_ocurrencia_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_ocurrencia alq_agenda_ocurrencia_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_ocurrencia
    ADD CONSTRAINT alq_agenda_ocurrencia_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_ocurrencia alq_agenda_ocurrencia_regla_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_ocurrencia
    ADD CONSTRAINT alq_agenda_ocurrencia_regla_fk FOREIGN KEY (regla_id) REFERENCES alq.alq_agenda_regla(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_mandato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_mandato_fk FOREIGN KEY (mandato_id) REFERENCES alq.alq_mandato(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_periodo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_periodo_fk FOREIGN KEY (periodo_id) REFERENCES alq.alq_periodo(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_servicio_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_servicio_fk FOREIGN KEY (servicio_cuenta_id) REFERENCES alq.alq_servicio_cuenta(id) ON DELETE RESTRICT;


--
-- Name: alq_agenda_regla alq_agenda_regla_version_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_agenda_regla
    ADD CONSTRAINT alq_agenda_regla_version_fk FOREIGN KEY (contrato_version_id) REFERENCES alq.alq_contrato_version(id) ON DELETE RESTRICT;


--
-- Name: alq_ajuste alq_ajuste_aprobador_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste
    ADD CONSTRAINT alq_ajuste_aprobador_fk FOREIGN KEY (aprobador_parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_ajuste_observacion alq_ajuste_observacion_ajuste_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste_observacion
    ADD CONSTRAINT alq_ajuste_observacion_ajuste_fk FOREIGN KEY (ajuste_id) REFERENCES alq.alq_ajuste(id) ON DELETE RESTRICT;


--
-- Name: alq_ajuste_observacion alq_ajuste_observacion_observacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste_observacion
    ADD CONSTRAINT alq_ajuste_observacion_observacion_fk FOREIGN KEY (observacion_id) REFERENCES alq.alq_indice_observacion(id) ON DELETE RESTRICT;


--
-- Name: alq_ajuste alq_ajuste_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste
    ADD CONSTRAINT alq_ajuste_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_ajuste alq_ajuste_version_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_ajuste
    ADD CONSTRAINT alq_ajuste_version_fk FOREIGN KEY (contrato_version_base_id) REFERENCES alq.alq_contrato_version(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_cargo_fk FOREIGN KEY (cargo_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_conversion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_conversion_fk FOREIGN KEY (conversion_id) REFERENCES alq.alq_conversion_moneda(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_credito_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_credito_fk FOREIGN KEY (credito_id) REFERENCES alq.alq_credito(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_deposito_evento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_deposito_evento_fk FOREIGN KEY (deposito_evento_id) REFERENCES alq.alq_deposito_evento(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_rendicion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_rendicion_fk FOREIGN KEY (rendicion_id) REFERENCES alq.alq_rendicion(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion_reversa alq_aplicacion_reversa_conversion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion_reversa
    ADD CONSTRAINT alq_aplicacion_reversa_conversion_fk FOREIGN KEY (conversion_reversa_id) REFERENCES alq.alq_conversion_moneda(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion_reversa alq_aplicacion_reversa_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion_reversa
    ADD CONSTRAINT alq_aplicacion_reversa_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion_reversa alq_aplicacion_reversa_original_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion_reversa
    ADD CONSTRAINT alq_aplicacion_reversa_original_fk FOREIGN KEY (aplicacion_original_id) REFERENCES alq.alq_aplicacion(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion_reversa alq_aplicacion_reversa_transaccion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion_reversa
    ADD CONSTRAINT alq_aplicacion_reversa_transaccion_fk FOREIGN KEY (reversa_transaccion_id) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_aplicacion alq_aplicacion_transaccion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_aplicacion
    ADD CONSTRAINT alq_aplicacion_transaccion_fk FOREIGN KEY (transaccion_id) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_capacidad_admin alq_capacidad_admin_usuario_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_capacidad_admin
    ADD CONSTRAINT alq_capacidad_admin_usuario_fk FOREIGN KEY (parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_acreedor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_acreedor_fk FOREIGN KEY (acreedor_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_deudor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_deudor_fk FOREIGN KEY (deudor_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_periodo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_periodo_fk FOREIGN KEY (periodo_id) REFERENCES alq.alq_periodo(id) ON DELETE RESTRICT;


--
-- Name: alq_cargo alq_cargo_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_cargo
    ADD CONSTRAINT alq_cargo_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado_adjunto alq_comunicado_adjunto_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_adjunto
    ADD CONSTRAINT alq_comunicado_adjunto_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado_adjunto alq_comunicado_adjunto_mensaje_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_adjunto
    ADD CONSTRAINT alq_comunicado_adjunto_mensaje_fk FOREIGN KEY (mensaje_id) REFERENCES alq.alq_comunicado_mensaje(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado_mensaje alq_comunicado_mensaje_autor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_mensaje
    ADD CONSTRAINT alq_comunicado_mensaje_autor_fk FOREIGN KEY (autor_parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado_mensaje alq_comunicado_mensaje_comunicado_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_mensaje
    ADD CONSTRAINT alq_comunicado_mensaje_comunicado_fk FOREIGN KEY (comunicado_id) REFERENCES alq.alq_comunicado(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado_mensaje alq_comunicado_mensaje_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado_mensaje
    ADD CONSTRAINT alq_comunicado_mensaje_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado alq_comunicado_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado
    ADD CONSTRAINT alq_comunicado_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado alq_comunicado_parte_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado
    ADD CONSTRAINT alq_comunicado_parte_fk FOREIGN KEY (abierto_por_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_comunicado alq_comunicado_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_comunicado
    ADD CONSTRAINT alq_comunicado_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato alq_contrato_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato
    ADD CONSTRAINT alq_contrato_documento_fk FOREIGN KEY (pdf_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato alq_contrato_inquilino_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato
    ADD CONSTRAINT alq_contrato_inquilino_fk FOREIGN KEY (inquilino_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato alq_contrato_predecesor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato
    ADD CONSTRAINT alq_contrato_predecesor_fk FOREIGN KEY (predecesor_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato alq_contrato_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato
    ADD CONSTRAINT alq_contrato_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato_version alq_contrato_version_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato_version
    ADD CONSTRAINT alq_contrato_version_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_contrato_version alq_contrato_version_indice_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_contrato_version
    ADD CONSTRAINT alq_contrato_version_indice_fk FOREIGN KEY (indice_serie_id) REFERENCES alq.alq_indice_serie(id) ON DELETE RESTRICT;


--
-- Name: alq_conversion_moneda alq_conversion_aprobador_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_conversion_moneda
    ADD CONSTRAINT alq_conversion_aprobador_fk FOREIGN KEY (aprobador_parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_conversion_moneda alq_conversion_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_conversion_moneda
    ADD CONSTRAINT alq_conversion_documento_fk FOREIGN KEY (evidencia_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_conversion_moneda alq_conversion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_conversion_moneda
    ADD CONSTRAINT alq_conversion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_credito_consumo alq_credito_consumo_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito_consumo
    ADD CONSTRAINT alq_credito_consumo_cargo_fk FOREIGN KEY (cargo_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_credito_consumo alq_credito_consumo_credito_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito_consumo
    ADD CONSTRAINT alq_credito_consumo_credito_fk FOREIGN KEY (credito_id) REFERENCES alq.alq_credito(id) ON DELETE RESTRICT;


--
-- Name: alq_credito_consumo alq_credito_consumo_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito_consumo
    ADD CONSTRAINT alq_credito_consumo_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_credito alq_credito_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito
    ADD CONSTRAINT alq_credito_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_credito alq_credito_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito
    ADD CONSTRAINT alq_credito_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_credito alq_credito_parte_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito
    ADD CONSTRAINT alq_credito_parte_fk FOREIGN KEY (parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_credito alq_credito_transaccion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_credito
    ADD CONSTRAINT alq_credito_transaccion_fk FOREIGN KEY (transaccion_origen_id) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito alq_deposito_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito
    ADD CONSTRAINT alq_deposito_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito alq_deposito_custodia_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito
    ADD CONSTRAINT alq_deposito_custodia_fk FOREIGN KEY (custodia_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_evento alq_deposito_evento_deposito_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_deposito_fk FOREIGN KEY (deposito_id) REFERENCES alq.alq_deposito(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_evento alq_deposito_evento_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_documento_fk FOREIGN KEY (evidencia_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_evento alq_deposito_evento_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_evento alq_deposito_evento_sucesor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_sucesor_fk FOREIGN KEY (contrato_sucesor_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_evento alq_deposito_evento_transaccion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_evento
    ADD CONSTRAINT alq_deposito_evento_transaccion_fk FOREIGN KEY (transaccion_id) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion_linea alq_deposito_linea_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion_linea
    ADD CONSTRAINT alq_deposito_linea_cargo_fk FOREIGN KEY (cargo_residual_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion_linea alq_deposito_linea_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion_linea
    ADD CONSTRAINT alq_deposito_linea_documento_fk FOREIGN KEY (evidencia_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion_linea alq_deposito_linea_liquidacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion_linea
    ADD CONSTRAINT alq_deposito_linea_liquidacion_fk FOREIGN KEY (liquidacion_id) REFERENCES alq.alq_deposito_liquidacion(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion alq_deposito_liquidacion_deposito_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion
    ADD CONSTRAINT alq_deposito_liquidacion_deposito_fk FOREIGN KEY (deposito_id) REFERENCES alq.alq_deposito(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion alq_deposito_liquidacion_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion
    ADD CONSTRAINT alq_deposito_liquidacion_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_deposito_liquidacion alq_deposito_liquidacion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_deposito_liquidacion
    ADD CONSTRAINT alq_deposito_liquidacion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_documento alq_documento_mandato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_documento
    ADD CONSTRAINT alq_documento_mandato_fk FOREIGN KEY (mandato_id) REFERENCES alq.alq_mandato(id) ON DELETE RESTRICT;


--
-- Name: alq_documento alq_documento_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_documento
    ADD CONSTRAINT alq_documento_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_export_baja alq_export_baja_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_export_baja
    ADD CONSTRAINT alq_export_baja_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_export_baja alq_export_baja_mandato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_export_baja
    ADD CONSTRAINT alq_export_baja_mandato_fk FOREIGN KEY (mandato_id) REFERENCES alq.alq_mandato(id) ON DELETE RESTRICT;


--
-- Name: alq_export_baja alq_export_baja_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_export_baja
    ADD CONSTRAINT alq_export_baja_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_factura_externa alq_factura_externa_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_factura_externa
    ADD CONSTRAINT alq_factura_externa_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_factura_externa alq_factura_externa_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_factura_externa
    ADD CONSTRAINT alq_factura_externa_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_garantia alq_garantia_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_garantia
    ADD CONSTRAINT alq_garantia_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_garantia alq_garantia_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_garantia
    ADD CONSTRAINT alq_garantia_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_garantia alq_garantia_garante_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_garantia
    ADD CONSTRAINT alq_garantia_garante_fk FOREIGN KEY (garante_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_indice_observacion alq_indice_observacion_corrige_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_observacion
    ADD CONSTRAINT alq_indice_observacion_corrige_fk FOREIGN KEY (corrige_a_id) REFERENCES alq.alq_indice_observacion(id) ON DELETE RESTRICT;


--
-- Name: alq_indice_observacion alq_indice_observacion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_observacion
    ADD CONSTRAINT alq_indice_observacion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_indice_observacion alq_indice_observacion_serie_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_indice_observacion
    ADD CONSTRAINT alq_indice_observacion_serie_fk FOREIGN KEY (serie_id) REFERENCES alq.alq_indice_serie(id) ON DELETE RESTRICT;


--
-- Name: alq_journal alq_journal_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_journal
    ADD CONSTRAINT alq_journal_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_mandato alq_mandato_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato
    ADD CONSTRAINT alq_mandato_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_mandato alq_mandato_titularidad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato
    ADD CONSTRAINT alq_mandato_titularidad_fk FOREIGN KEY (titularidad_id) REFERENCES alq.alq_titularidad(id) ON DELETE RESTRICT;


--
-- Name: alq_mandato_version alq_mandato_version_mandato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_mandato_version
    ADD CONSTRAINT alq_mandato_version_mandato_fk FOREIGN KEY (mandato_id) REFERENCES alq.alq_mandato(id) ON DELETE RESTRICT;


--
-- Name: alq_nota alq_nota_aprobador_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_nota
    ADD CONSTRAINT alq_nota_aprobador_fk FOREIGN KEY (aprobador_parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_nota alq_nota_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_nota
    ADD CONSTRAINT alq_nota_cargo_fk FOREIGN KEY (cargo_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_nota alq_nota_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_nota
    ADD CONSTRAINT alq_nota_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_notificacion alq_notificacion_destinatario_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion
    ADD CONSTRAINT alq_notificacion_destinatario_fk FOREIGN KEY (destinatario_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_notificacion_intento alq_notificacion_intento_notificacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion_intento
    ADD CONSTRAINT alq_notificacion_intento_notificacion_fk FOREIGN KEY (notificacion_id) REFERENCES alq.alq_notificacion(id) ON DELETE RESTRICT;


--
-- Name: alq_notificacion alq_notificacion_ocurrencia_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion
    ADD CONSTRAINT alq_notificacion_ocurrencia_fk FOREIGN KEY (ocurrencia_id) REFERENCES alq.alq_agenda_ocurrencia(id) ON DELETE RESTRICT;


--
-- Name: alq_notificacion alq_notificacion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_notificacion
    ADD CONSTRAINT alq_notificacion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_operacion alq_operacion_actor_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_operacion
    ADD CONSTRAINT alq_operacion_actor_fk FOREIGN KEY (actor_parte_usuario_id) REFERENCES alq.alq_parte_usuario(id) ON DELETE RESTRICT;


--
-- Name: alq_parte_usuario alq_parte_usuario_auth_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_parte_usuario
    ADD CONSTRAINT alq_parte_usuario_auth_fk FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: alq_parte_usuario alq_parte_usuario_parte_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_parte_usuario
    ADD CONSTRAINT alq_parte_usuario_parte_fk FOREIGN KEY (parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_periodo alq_periodo_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_periodo
    ADD CONSTRAINT alq_periodo_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_periodo alq_periodo_version_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_periodo
    ADD CONSTRAINT alq_periodo_version_fk FOREIGN KEY (contrato_version_id) REFERENCES alq.alq_contrato_version(id) ON DELETE RESTRICT;


--
-- Name: alq_propiedad alq_propiedad_publicacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_propiedad
    ADD CONSTRAINT alq_propiedad_publicacion_fk FOREIGN KEY (publicacion_propiedad_id) REFERENCES public.propiedades(id) ON DELETE SET NULL;


--
-- Name: alq_rendicion alq_rendicion_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion_linea alq_rendicion_linea_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion_linea
    ADD CONSTRAINT alq_rendicion_linea_cargo_fk FOREIGN KEY (cargo_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion_linea alq_rendicion_linea_nota_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion_linea
    ADD CONSTRAINT alq_rendicion_linea_nota_fk FOREIGN KEY (nota_id) REFERENCES alq.alq_nota(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion_linea alq_rendicion_linea_rendicion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion_linea
    ADD CONSTRAINT alq_rendicion_linea_rendicion_fk FOREIGN KEY (rendicion_id) REFERENCES alq.alq_rendicion(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion_linea alq_rendicion_linea_transaccion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion_linea
    ADD CONSTRAINT alq_rendicion_linea_transaccion_fk FOREIGN KEY (transaccion_id) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion alq_rendicion_mandato_version_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_mandato_version_fk FOREIGN KEY (mandato_version_id) REFERENCES alq.alq_mandato_version(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion alq_rendicion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion alq_rendicion_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_rendicion alq_rendicion_sucesora_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rendicion
    ADD CONSTRAINT alq_rendicion_sucesora_fk FOREIGN KEY (sucesora_de) REFERENCES alq.alq_rendicion(id) ON DELETE RESTRICT;


--
-- Name: alq_rescision alq_rescision_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_cargo_fk FOREIGN KEY (cargo_penalidad_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_rescision alq_rescision_contrato_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_contrato_fk FOREIGN KEY (contrato_id) REFERENCES alq.alq_contrato(id) ON DELETE RESTRICT;


--
-- Name: alq_rescision alq_rescision_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_documento_fk FOREIGN KEY (documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_rescision alq_rescision_nota_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_nota_fk FOREIGN KEY (condonacion_nota_id) REFERENCES alq.alq_nota(id) ON DELETE RESTRICT;


--
-- Name: alq_rescision alq_rescision_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_rescision
    ADD CONSTRAINT alq_rescision_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_cuenta alq_servicio_cuenta_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_cuenta
    ADD CONSTRAINT alq_servicio_cuenta_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_cuenta alq_servicio_cuenta_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_cuenta
    ADD CONSTRAINT alq_servicio_cuenta_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_cuenta alq_servicio_cuenta_responsable_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_cuenta
    ADD CONSTRAINT alq_servicio_cuenta_responsable_fk FOREIGN KEY (responsable_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_factura alq_servicio_factura_cargo_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_cargo_fk FOREIGN KEY (cargo_id) REFERENCES alq.alq_cargo(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_factura alq_servicio_factura_cuenta_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_cuenta_fk FOREIGN KEY (cuenta_id) REFERENCES alq.alq_servicio_cuenta(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_factura alq_servicio_factura_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_documento_fk FOREIGN KEY (comprobante_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_factura alq_servicio_factura_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_servicio_factura alq_servicio_factura_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_servicio_factura
    ADD CONSTRAINT alq_servicio_factura_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_titularidad alq_titularidad_parte_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_titularidad
    ADD CONSTRAINT alq_titularidad_parte_fk FOREIGN KEY (parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_titularidad alq_titularidad_propiedad_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_titularidad
    ADD CONSTRAINT alq_titularidad_propiedad_fk FOREIGN KEY (propiedad_id) REFERENCES alq.alq_propiedad(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_beneficiario_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_beneficiario_fk FOREIGN KEY (beneficiario_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_contraparte_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_contraparte_fk FOREIGN KEY (contraparte_parte_id) REFERENCES alq.alq_parte(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_cuenta_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_cuenta_fk FOREIGN KEY (cuenta_custodia_id) REFERENCES alq.alq_cuenta_custodia(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_documento_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_documento_fk FOREIGN KEY (comprobante_documento_id) REFERENCES alq.alq_documento(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_operacion_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_operacion_fk FOREIGN KEY (operacion_id) REFERENCES alq.alq_operacion(id) ON DELETE RESTRICT;


--
-- Name: alq_transaccion_caja alq_transaccion_reversa_fk; Type: FK CONSTRAINT; Schema: alq; Owner: -
--

ALTER TABLE ONLY alq.alq_transaccion_caja
    ADD CONSTRAINT alq_transaccion_reversa_fk FOREIGN KEY (reversa_de) REFERENCES alq.alq_transaccion_caja(id) ON DELETE RESTRICT;


--
-- Name: alq_acceso_propiedad; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_acceso_propiedad ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_acceso_propiedad alq_admin_select_alq_alq_acceso_propiedad; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_acceso_propiedad ON alq.alq_acceso_propiedad FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_agenda_ocurrencia alq_admin_select_alq_alq_agenda_ocurrencia; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_agenda_ocurrencia ON alq.alq_agenda_ocurrencia FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_agenda_regla alq_admin_select_alq_alq_agenda_regla; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_agenda_regla ON alq.alq_agenda_regla FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_ajuste alq_admin_select_alq_alq_ajuste; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_ajuste ON alq.alq_ajuste FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_ajuste_observacion alq_admin_select_alq_alq_ajuste_observacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_ajuste_observacion ON alq.alq_ajuste_observacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_aplicacion alq_admin_select_alq_alq_aplicacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_aplicacion ON alq.alq_aplicacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_aplicacion_reversa alq_admin_select_alq_alq_aplicacion_reversa; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_aplicacion_reversa ON alq.alq_aplicacion_reversa FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_capacidad_admin alq_admin_select_alq_alq_capacidad_admin; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_capacidad_admin ON alq.alq_capacidad_admin FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_cargo alq_admin_select_alq_alq_cargo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_cargo ON alq.alq_cargo FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_comunicado alq_admin_select_alq_alq_comunicado; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_comunicado ON alq.alq_comunicado FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_comunicado_adjunto alq_admin_select_alq_alq_comunicado_adjunto; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_comunicado_adjunto ON alq.alq_comunicado_adjunto FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_comunicado_mensaje alq_admin_select_alq_alq_comunicado_mensaje; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_comunicado_mensaje ON alq.alq_comunicado_mensaje FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_contrato alq_admin_select_alq_alq_contrato; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_contrato ON alq.alq_contrato FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_contrato_version alq_admin_select_alq_alq_contrato_version; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_contrato_version ON alq.alq_contrato_version FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_conversion_moneda alq_admin_select_alq_alq_conversion_moneda; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_conversion_moneda ON alq.alq_conversion_moneda FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_credito alq_admin_select_alq_alq_credito; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_credito ON alq.alq_credito FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_credito_consumo alq_admin_select_alq_alq_credito_consumo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_credito_consumo ON alq.alq_credito_consumo FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_cuenta_custodia alq_admin_select_alq_alq_cuenta_custodia; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_cuenta_custodia ON alq.alq_cuenta_custodia FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_deposito alq_admin_select_alq_alq_deposito; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_deposito ON alq.alq_deposito FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_deposito_evento alq_admin_select_alq_alq_deposito_evento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_deposito_evento ON alq.alq_deposito_evento FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_deposito_liquidacion alq_admin_select_alq_alq_deposito_liquidacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_deposito_liquidacion ON alq.alq_deposito_liquidacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_deposito_liquidacion_linea alq_admin_select_alq_alq_deposito_liquidacion_linea; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_deposito_liquidacion_linea ON alq.alq_deposito_liquidacion_linea FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_documento alq_admin_select_alq_alq_documento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_documento ON alq.alq_documento FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_export_baja alq_admin_select_alq_alq_export_baja; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_export_baja ON alq.alq_export_baja FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_factura_externa alq_admin_select_alq_alq_factura_externa; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_factura_externa ON alq.alq_factura_externa FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_garantia alq_admin_select_alq_alq_garantia; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_garantia ON alq.alq_garantia FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_indice_observacion alq_admin_select_alq_alq_indice_observacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_indice_observacion ON alq.alq_indice_observacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_indice_serie alq_admin_select_alq_alq_indice_serie; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_indice_serie ON alq.alq_indice_serie FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_journal alq_admin_select_alq_alq_journal; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_journal ON alq.alq_journal FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_mandato alq_admin_select_alq_alq_mandato; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_mandato ON alq.alq_mandato FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_mandato_version alq_admin_select_alq_alq_mandato_version; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_mandato_version ON alq.alq_mandato_version FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_nota alq_admin_select_alq_alq_nota; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_nota ON alq.alq_nota FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_notificacion alq_admin_select_alq_alq_notificacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_notificacion ON alq.alq_notificacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_notificacion_intento alq_admin_select_alq_alq_notificacion_intento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_notificacion_intento ON alq.alq_notificacion_intento FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_operacion alq_admin_select_alq_alq_operacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_operacion ON alq.alq_operacion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_parte alq_admin_select_alq_alq_parte; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_parte ON alq.alq_parte FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_parte_usuario alq_admin_select_alq_alq_parte_usuario; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_parte_usuario ON alq.alq_parte_usuario FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_periodo alq_admin_select_alq_alq_periodo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_periodo ON alq.alq_periodo FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_propiedad alq_admin_select_alq_alq_propiedad; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_propiedad ON alq.alq_propiedad FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_rendicion alq_admin_select_alq_alq_rendicion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_rendicion ON alq.alq_rendicion FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_rendicion_linea alq_admin_select_alq_alq_rendicion_linea; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_rendicion_linea ON alq.alq_rendicion_linea FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_rescision alq_admin_select_alq_alq_rescision; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_rescision ON alq.alq_rescision FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_servicio_cuenta alq_admin_select_alq_alq_servicio_cuenta; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_servicio_cuenta ON alq.alq_servicio_cuenta FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_servicio_factura alq_admin_select_alq_alq_servicio_factura; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_servicio_factura ON alq.alq_servicio_factura FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_titularidad alq_admin_select_alq_alq_titularidad; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_titularidad ON alq.alq_titularidad FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_transaccion_caja alq_admin_select_alq_alq_transaccion_caja; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_admin_select_alq_alq_transaccion_caja ON alq.alq_transaccion_caja FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_agenda_ocurrencia; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_agenda_ocurrencia ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_agenda_regla; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_agenda_regla ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_ajuste; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_ajuste ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_ajuste_observacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_ajuste_observacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_aplicacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_aplicacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_aplicacion_reversa; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_aplicacion_reversa ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_capacidad_admin; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_capacidad_admin ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_cargo; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_cargo ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_comunicado; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_comunicado ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_comunicado_adjunto; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_comunicado_adjunto ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_comunicado_mensaje; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_comunicado_mensaje ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_contrato; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_contrato ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_contrato_version; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_contrato_version ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_conversion_moneda; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_conversion_moneda ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_credito; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_credito ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_credito_consumo; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_credito_consumo ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_cuenta_custodia; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_cuenta_custodia ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_deposito; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_deposito ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_deposito_evento; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_deposito_evento ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_deposito_liquidacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_deposito_liquidacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_deposito_liquidacion_linea; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_deposito_liquidacion_linea ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_documento; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_documento ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_export_baja; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_export_baja ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_factura_externa; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_factura_externa ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_garantia; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_garantia ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_indice_observacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_indice_observacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_indice_serie; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_indice_serie ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_journal; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_journal ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_mandato; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_mandato ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_mandato_version; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_mandato_version ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_nota; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_nota ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_notificacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_notificacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_notificacion_intento; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_notificacion_intento ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_operacion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_operacion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_acceso_propiedad alq_owner_select_acceso; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_acceso ON alq.alq_acceso_propiedad FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_comunicado_adjunto alq_owner_select_adjunto; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_adjunto ON alq.alq_comunicado_adjunto FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (alq.alq_comunicado_mensaje m
     JOIN alq.alq_comunicado c ON ((c.id = m.comunicado_id)))
  WHERE ((m.id = alq_comunicado_adjunto.mensaje_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_agenda_regla alq_owner_select_agenda_regla; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_agenda_regla ON alq.alq_agenda_regla FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_agenda_regla.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM (alq.alq_contrato_version cv
     JOIN alq.alq_contrato c ON ((c.id = cv.contrato_id)))
  WHERE ((cv.id = alq_agenda_regla.contrato_version_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM alq.alq_mandato m
  WHERE ((m.id = alq_agenda_regla.mandato_id) AND alq_private.alq_puede_ver_propiedad_v1(m.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM alq.alq_servicio_cuenta s
  WHERE ((s.id = alq_agenda_regla.servicio_cuenta_id) AND alq_private.alq_puede_ver_propiedad_v1(s.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM (alq.alq_periodo p
     JOIN alq.alq_contrato c ON ((c.id = p.contrato_id)))
  WHERE ((p.id = alq_agenda_regla.periodo_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id))))));


--
-- Name: alq_ajuste alq_owner_select_ajuste; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_ajuste ON alq.alq_ajuste FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (alq.alq_contrato_version cv
     JOIN alq.alq_contrato c ON ((c.id = cv.contrato_id)))
  WHERE ((cv.id = alq_ajuste.contrato_version_base_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_ajuste_observacion alq_owner_select_ajuste_observacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_ajuste_observacion ON alq.alq_ajuste_observacion FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((alq.alq_ajuste aj
     JOIN alq.alq_contrato_version cv ON ((cv.id = aj.contrato_version_base_id)))
     JOIN alq.alq_contrato c ON ((c.id = cv.contrato_id)))
  WHERE ((aj.id = alq_ajuste_observacion.ajuste_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_aplicacion alq_owner_select_aplicacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_aplicacion ON alq.alq_aplicacion FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM alq.alq_cargo c
  WHERE ((c.id = alq_aplicacion.cargo_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM alq.alq_rendicion r
  WHERE ((r.id = alq_aplicacion.rendicion_id) AND alq_private.alq_puede_ver_propiedad_v1(r.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM ((alq.alq_deposito_evento e
     JOIN alq.alq_deposito d ON ((d.id = e.deposito_id)))
     JOIN alq.alq_contrato c ON ((c.id = d.contrato_id)))
  WHERE ((e.id = alq_aplicacion.deposito_evento_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))) OR (EXISTS ( SELECT 1
   FROM (alq.alq_credito cr
     JOIN alq.alq_contrato c ON ((c.id = cr.contrato_id)))
  WHERE ((cr.id = alq_aplicacion.credito_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id))))));


--
-- Name: alq_aplicacion_reversa alq_owner_select_aplicacion_reversa; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_aplicacion_reversa ON alq.alq_aplicacion_reversa FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_aplicacion a
  WHERE (a.id = alq_aplicacion_reversa.aplicacion_original_id))));


--
-- Name: alq_cargo alq_owner_select_cargo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_cargo ON alq.alq_cargo FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_comunicado alq_owner_select_comunicado; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_comunicado ON alq.alq_comunicado FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_contrato alq_owner_select_contrato; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_contrato ON alq.alq_contrato FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_contrato_version alq_owner_select_contrato_version; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_contrato_version ON alq.alq_contrato_version FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_contrato_version.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_conversion_moneda alq_owner_select_conversion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_conversion ON alq.alq_conversion_moneda FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_aplicacion a
  WHERE (a.conversion_id = alq_conversion_moneda.id))));


--
-- Name: alq_credito alq_owner_select_credito; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_credito ON alq.alq_credito FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_credito.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_credito_consumo alq_owner_select_credito_consumo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_credito_consumo ON alq.alq_credito_consumo FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_cargo c
  WHERE ((c.id = alq_credito_consumo.cargo_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_deposito alq_owner_select_deposito; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_deposito ON alq.alq_deposito FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_deposito.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_deposito_evento alq_owner_select_deposito_evento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_deposito_evento ON alq.alq_deposito_evento FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (alq.alq_deposito d
     JOIN alq.alq_contrato c ON ((c.id = d.contrato_id)))
  WHERE ((d.id = alq_deposito_evento.deposito_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_deposito_liquidacion_linea alq_owner_select_deposito_linea; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_deposito_linea ON alq.alq_deposito_liquidacion_linea FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((alq.alq_deposito_liquidacion l
     JOIN alq.alq_deposito d ON ((d.id = l.deposito_id)))
     JOIN alq.alq_contrato c ON ((c.id = d.contrato_id)))
  WHERE ((l.id = alq_deposito_liquidacion_linea.liquidacion_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_deposito_liquidacion alq_owner_select_deposito_liquidacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_deposito_liquidacion ON alq.alq_deposito_liquidacion FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (alq.alq_deposito d
     JOIN alq.alq_contrato c ON ((c.id = d.contrato_id)))
  WHERE ((d.id = alq_deposito_liquidacion.deposito_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_documento alq_owner_select_documento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_documento ON alq.alq_documento FOR SELECT TO authenticated USING (((audiencia = 'propietario'::text) AND (((propiedad_id IS NOT NULL) AND alq_private.alq_puede_ver_propiedad_v1(propiedad_id)) OR (EXISTS ( SELECT 1
   FROM alq.alq_mandato m
  WHERE ((m.id = alq_documento.mandato_id) AND alq_private.alq_puede_ver_propiedad_v1(m.propiedad_id)))))));


--
-- Name: alq_export_baja alq_owner_select_export; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_export ON alq.alq_export_baja FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_mandato m
  WHERE ((m.id = alq_export_baja.mandato_id) AND alq_private.alq_puede_ver_propiedad_v1(m.propiedad_id)))));


--
-- Name: alq_garantia alq_owner_select_garantia; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_garantia ON alq.alq_garantia FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_garantia.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_mandato alq_owner_select_mandato; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_mandato ON alq.alq_mandato FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_mandato_version alq_owner_select_mandato_version; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_mandato_version ON alq.alq_mandato_version FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_mandato m
  WHERE ((m.id = alq_mandato_version.mandato_id) AND alq_private.alq_puede_ver_propiedad_v1(m.propiedad_id)))));


--
-- Name: alq_comunicado_mensaje alq_owner_select_mensaje; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_mensaje ON alq.alq_comunicado_mensaje FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_comunicado c
  WHERE ((c.id = alq_comunicado_mensaje.comunicado_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_nota alq_owner_select_nota; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_nota ON alq.alq_nota FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_cargo c
  WHERE ((c.id = alq_nota.cargo_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_notificacion alq_owner_select_notificacion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_notificacion ON alq.alq_notificacion FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_agenda_ocurrencia o
  WHERE ((o.id = alq_notificacion.ocurrencia_id) AND alq_private.alq_puede_ver_propiedad_v1(o.propiedad_id)))));


--
-- Name: alq_notificacion_intento alq_owner_select_notificacion_intento; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_notificacion_intento ON alq.alq_notificacion_intento FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (alq.alq_notificacion n
     JOIN alq.alq_agenda_ocurrencia o ON ((o.id = n.ocurrencia_id)))
  WHERE ((n.id = alq_notificacion_intento.notificacion_id) AND alq_private.alq_puede_ver_propiedad_v1(o.propiedad_id)))));


--
-- Name: alq_agenda_ocurrencia alq_owner_select_ocurrencia; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_ocurrencia ON alq.alq_agenda_ocurrencia FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_parte alq_owner_select_parte; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_parte ON alq.alq_parte FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_parte_usuario pu
  WHERE ((pu.parte_id = alq_parte.id) AND (pu.auth_user_id = ( SELECT auth.uid() AS uid)) AND (statement_timestamp() <@ pu.vigencia)))));


--
-- Name: alq_parte_usuario alq_owner_select_parte_usuario; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_parte_usuario ON alq.alq_parte_usuario FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) AND (statement_timestamp() <@ vigencia)));


--
-- Name: alq_periodo alq_owner_select_periodo; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_periodo ON alq.alq_periodo FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_periodo.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_propiedad alq_owner_select_propiedad; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_propiedad ON alq.alq_propiedad FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(id));


--
-- Name: alq_rendicion alq_owner_select_rendicion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_rendicion ON alq.alq_rendicion FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_rendicion_linea alq_owner_select_rendicion_linea; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_rendicion_linea ON alq.alq_rendicion_linea FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_rendicion r
  WHERE ((r.id = alq_rendicion_linea.rendicion_id) AND alq_private.alq_puede_ver_propiedad_v1(r.propiedad_id)))));


--
-- Name: alq_rescision alq_owner_select_rescision; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_rescision ON alq.alq_rescision FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_contrato c
  WHERE ((c.id = alq_rescision.contrato_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))));


--
-- Name: alq_servicio_cuenta alq_owner_select_servicio_cuenta; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_servicio_cuenta ON alq.alq_servicio_cuenta FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_servicio_factura alq_owner_select_servicio_factura; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_servicio_factura ON alq.alq_servicio_factura FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_titularidad alq_owner_select_titularidad; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_titularidad ON alq.alq_titularidad FOR SELECT TO authenticated USING (alq_private.alq_puede_ver_propiedad_v1(propiedad_id));


--
-- Name: alq_transaccion_caja alq_owner_select_transaccion; Type: POLICY; Schema: alq; Owner: -
--

CREATE POLICY alq_owner_select_transaccion ON alq.alq_transaccion_caja FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM alq.alq_aplicacion a
  WHERE ((a.transaccion_id = alq_transaccion_caja.id) AND ((EXISTS ( SELECT 1
           FROM alq.alq_cargo c
          WHERE ((c.id = a.cargo_id) AND alq_private.alq_puede_ver_propiedad_v1(c.propiedad_id)))) OR (EXISTS ( SELECT 1
           FROM alq.alq_rendicion r
          WHERE ((r.id = a.rendicion_id) AND alq_private.alq_puede_ver_propiedad_v1(r.propiedad_id)))))))));


--
-- Name: alq_parte; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_parte ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_parte_usuario; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_parte_usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_periodo; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_periodo ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_propiedad; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_propiedad ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_rendicion; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_rendicion ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_rendicion_linea; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_rendicion_linea ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_rescision; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_rescision ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_servicio_cuenta; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_servicio_cuenta ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_servicio_factura; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_servicio_factura ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_titularidad; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_titularidad ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_transaccion_caja; Type: ROW SECURITY; Schema: alq; Owner: -
--

ALTER TABLE alq.alq_transaccion_caja ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_mail_entrante; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alq_mail_entrante ENABLE ROW LEVEL SECURITY;

--
-- Name: alq_mail_entrante alq_mail_entrante_admin_sel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alq_mail_entrante_admin_sel ON public.alq_mail_entrante FOR SELECT TO authenticated USING (alq_private.alq_es_admin_v1());


--
-- Name: alq_mail_entrante alq_mail_entrante_admin_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alq_mail_entrante_admin_upd ON public.alq_mail_entrante FOR UPDATE TO authenticated USING (alq_private.alq_es_admin_v1()) WITH CHECK (alq_private.alq_es_admin_v1());


--
-- Name: objects alq_docs_insert_admin; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY alq_docs_insert_admin ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'alq-docs'::text) AND alq_private.alq_es_admin_v1()));


--
-- Name: objects alq_docs_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY alq_docs_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'alq-docs'::text) AND (EXISTS ( SELECT 1
   FROM alq.alq_documento d
  WHERE ((d.bucket = 'alq-docs'::text) AND (d.path = objects.name) AND (alq_private.alq_es_admin_v1() OR ((d.audiencia = 'propietario'::text) AND (((d.propiedad_id IS NOT NULL) AND alq_private.alq_puede_ver_propiedad_v1(d.propiedad_id)) OR (EXISTS ( SELECT 1
           FROM alq.alq_mandato m
          WHERE ((m.id = d.mandato_id) AND alq_private.alq_puede_ver_propiedad_v1(m.propiedad_id))))))))))));


--
-- Name: SCHEMA alq; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA alq TO authenticated;


--
-- Name: SCHEMA alq_private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA alq_private TO authenticated;


--
-- Name: FUNCTION alq_actor_v1(p_requiere_admin boolean); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_actor_v1(p_requiere_admin boolean) FROM PUBLIC;


--
-- Name: FUNCTION alq_admin_aplicar_core_v1(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_admin_aplicar_core_v1(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION alq_private.alq_admin_aplicar_core_v1(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION alq_admin_preparar_core_v1(p_operacion text, p_payload jsonb); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_admin_preparar_core_v1(p_operacion text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION alq_private.alq_admin_preparar_core_v1(p_operacion text, p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION alq_aplicar_operacion_v1(p_operacion text, p_payload jsonb, p_operacion_id uuid, p_actor uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_aplicar_operacion_v1(p_operacion text, p_payload jsonb, p_operacion_id uuid, p_actor uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_assert_global_v1(); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_assert_global_v1() FROM PUBLIC;


--
-- Name: FUNCTION alq_constraint_check_v1(); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_constraint_check_v1() FROM PUBLIC;


--
-- Name: FUNCTION alq_es_admin_v1(); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_es_admin_v1() FROM PUBLIC;
GRANT ALL ON FUNCTION alq_private.alq_es_admin_v1() TO authenticated;


--
-- Name: FUNCTION alq_firma_v1(p_operacion text, p_payload jsonb); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_firma_v1(p_operacion text, p_payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION alq_journal_inmutable_v1(); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_journal_inmutable_v1() FROM PUBLIC;


--
-- Name: FUNCTION alq_operaciones_v1(); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_operaciones_v1() FROM PUBLIC;


--
-- Name: FUNCTION alq_prop_operar_v1(p_operacion text, p_payload jsonb); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_prop_operar_v1(p_operacion text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION alq_private.alq_prop_operar_v1(p_operacion text, p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION alq_puede_ver_propiedad_v1(p_propiedad_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_puede_ver_propiedad_v1(p_propiedad_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION alq_private.alq_puede_ver_propiedad_v1(p_propiedad_id uuid) TO authenticated;


--
-- Name: FUNCTION alq_recalcular_cargo_v1(p_cargo_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_recalcular_cargo_v1(p_cargo_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_recalcular_credito_v1(p_credito_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_recalcular_credito_v1(p_credito_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_redondear_v1(p_valor numeric, p_regla text); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_redondear_v1(p_valor numeric, p_regla text) FROM PUBLIC;


--
-- Name: FUNCTION alq_validar_aplicacion_v1(p_aplicacion_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_validar_aplicacion_v1(p_aplicacion_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_validar_reversa_v1(p_reversa_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_validar_reversa_v1(p_reversa_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_validar_transferencia_v1(p_transferencia_id uuid); Type: ACL; Schema: alq_private; Owner: -
--

REVOKE ALL ON FUNCTION alq_private.alq_validar_transferencia_v1(p_transferencia_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION alq_admin_aplicar(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alq_admin_aplicar(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alq_admin_aplicar(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.alq_admin_aplicar(p_request_id uuid, p_operacion text, p_firma text, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION alq_admin_preparar(p_operacion text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alq_admin_preparar(p_operacion text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alq_admin_preparar(p_operacion text, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.alq_admin_preparar(p_operacion text, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION alq_prop_abrir_consulta(p_propiedad uuid, p_texto text, p_adjunto uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alq_prop_abrir_consulta(p_propiedad uuid, p_texto text, p_adjunto uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alq_prop_abrir_consulta(p_propiedad uuid, p_texto text, p_adjunto uuid) TO authenticated;
GRANT ALL ON FUNCTION public.alq_prop_abrir_consulta(p_propiedad uuid, p_texto text, p_adjunto uuid) TO service_role;


--
-- Name: FUNCTION alq_prop_responder_consulta(p_comunicado uuid, p_texto text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alq_prop_responder_consulta(p_comunicado uuid, p_texto text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alq_prop_responder_consulta(p_comunicado uuid, p_texto text) TO authenticated;
GRANT ALL ON FUNCTION public.alq_prop_responder_consulta(p_comunicado uuid, p_texto text) TO service_role;


--
-- Name: TABLE alq_acceso_propiedad; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_acceso_propiedad TO authenticated;


--
-- Name: TABLE alq_agenda_ocurrencia; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_agenda_ocurrencia TO authenticated;


--
-- Name: TABLE alq_agenda_regla; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_agenda_regla TO authenticated;


--
-- Name: TABLE alq_ajuste; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_ajuste TO authenticated;


--
-- Name: TABLE alq_ajuste_observacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_ajuste_observacion TO authenticated;


--
-- Name: TABLE alq_aplicacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_aplicacion TO authenticated;


--
-- Name: TABLE alq_aplicacion_reversa; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_aplicacion_reversa TO authenticated;


--
-- Name: TABLE alq_capacidad_admin; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_capacidad_admin TO authenticated;


--
-- Name: TABLE alq_cargo; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_cargo TO authenticated;


--
-- Name: TABLE alq_comunicado; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_comunicado TO authenticated;


--
-- Name: TABLE alq_comunicado_adjunto; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_comunicado_adjunto TO authenticated;


--
-- Name: TABLE alq_comunicado_mensaje; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_comunicado_mensaje TO authenticated;


--
-- Name: TABLE alq_contrato; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_contrato TO authenticated;


--
-- Name: TABLE alq_contrato_version; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_contrato_version TO authenticated;


--
-- Name: TABLE alq_conversion_moneda; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_conversion_moneda TO authenticated;


--
-- Name: TABLE alq_credito; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_credito TO authenticated;


--
-- Name: TABLE alq_credito_consumo; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_credito_consumo TO authenticated;


--
-- Name: TABLE alq_cuenta_custodia; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_cuenta_custodia TO authenticated;


--
-- Name: TABLE alq_deposito; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_deposito TO authenticated;


--
-- Name: TABLE alq_deposito_evento; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_deposito_evento TO authenticated;


--
-- Name: TABLE alq_deposito_liquidacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_deposito_liquidacion TO authenticated;


--
-- Name: TABLE alq_deposito_liquidacion_linea; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_deposito_liquidacion_linea TO authenticated;


--
-- Name: TABLE alq_documento; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_documento TO authenticated;


--
-- Name: TABLE alq_export_baja; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_export_baja TO authenticated;


--
-- Name: TABLE alq_factura_externa; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_factura_externa TO authenticated;


--
-- Name: TABLE alq_garantia; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_garantia TO authenticated;


--
-- Name: TABLE alq_indice_observacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_indice_observacion TO authenticated;


--
-- Name: TABLE alq_indice_serie; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_indice_serie TO authenticated;


--
-- Name: TABLE alq_journal; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_journal TO authenticated;


--
-- Name: TABLE alq_mandato; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_mandato TO authenticated;


--
-- Name: TABLE alq_mandato_version; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_mandato_version TO authenticated;


--
-- Name: TABLE alq_nota; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_nota TO authenticated;


--
-- Name: TABLE alq_notificacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_notificacion TO authenticated;


--
-- Name: TABLE alq_notificacion_intento; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_notificacion_intento TO authenticated;


--
-- Name: TABLE alq_operacion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_operacion TO authenticated;


--
-- Name: TABLE alq_parte; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_parte TO authenticated;


--
-- Name: TABLE alq_parte_usuario; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_parte_usuario TO authenticated;


--
-- Name: TABLE alq_periodo; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_periodo TO authenticated;


--
-- Name: TABLE alq_propiedad; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_propiedad TO authenticated;


--
-- Name: TABLE alq_rendicion; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_rendicion TO authenticated;


--
-- Name: TABLE alq_rendicion_linea; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_rendicion_linea TO authenticated;


--
-- Name: TABLE alq_rescision; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_rescision TO authenticated;


--
-- Name: TABLE alq_servicio_cuenta; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_servicio_cuenta TO authenticated;


--
-- Name: TABLE alq_servicio_factura; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_servicio_factura TO authenticated;


--
-- Name: TABLE alq_titularidad; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_titularidad TO authenticated;


--
-- Name: TABLE alq_transaccion_caja; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_transaccion_caja TO authenticated;


--
-- Name: TABLE alq_v_comunicados_propietario; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_v_comunicados_propietario TO authenticated;


--
-- Name: TABLE alq_v_estado_cartera; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_v_estado_cartera TO authenticated;


--
-- Name: TABLE alq_v_propiedades_propietario; Type: ACL; Schema: alq; Owner: -
--

GRANT SELECT ON TABLE alq.alq_v_propiedades_propietario TO authenticated;


--
-- Name: TABLE alq_mail_entrante; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.alq_mail_entrante TO service_role;
GRANT SELECT ON TABLE public.alq_mail_entrante TO authenticated;


--
-- Name: COLUMN alq_mail_entrante.estado; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(estado) ON TABLE public.alq_mail_entrante TO authenticated;


--
-- Name: TABLE alq_v_acceso_propiedad; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_acceso_propiedad TO authenticated;


--
-- Name: TABLE alq_v_aplicacion; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_aplicacion TO authenticated;


--
-- Name: TABLE alq_v_cargo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_cargo TO authenticated;


--
-- Name: TABLE alq_v_comunicado; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_comunicado TO authenticated;


--
-- Name: TABLE alq_v_comunicado_mensaje; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_comunicado_mensaje TO authenticated;


--
-- Name: TABLE alq_v_contrato; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_contrato TO authenticated;


--
-- Name: TABLE alq_v_contrato_version; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_contrato_version TO authenticated;


--
-- Name: TABLE alq_v_cuenta_custodia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_cuenta_custodia TO authenticated;


--
-- Name: TABLE alq_v_documento; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_documento TO authenticated;


--
-- Name: TABLE alq_v_factura_externa; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_factura_externa TO authenticated;


--
-- Name: TABLE alq_v_garantia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_garantia TO authenticated;


--
-- Name: TABLE alq_v_mandato; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_mandato TO authenticated;


--
-- Name: TABLE alq_v_mandato_version; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_mandato_version TO authenticated;


--
-- Name: TABLE alq_v_nota; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_nota TO authenticated;


--
-- Name: TABLE alq_v_operacion; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_operacion TO authenticated;


--
-- Name: TABLE alq_v_parte; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_parte TO authenticated;


--
-- Name: TABLE alq_v_parte_usuario; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_parte_usuario TO authenticated;


--
-- Name: TABLE alq_v_propiedad; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_propiedad TO authenticated;


--
-- Name: TABLE alq_v_rendicion; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_rendicion TO authenticated;


--
-- Name: TABLE alq_v_rendicion_linea; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_rendicion_linea TO authenticated;


--
-- Name: TABLE alq_v_servicio_cuenta; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_servicio_cuenta TO authenticated;


--
-- Name: TABLE alq_v_servicio_factura; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_servicio_factura TO authenticated;


--
-- Name: TABLE alq_v_titularidad; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_titularidad TO authenticated;


--
-- Name: TABLE alq_v_transaccion_caja; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.alq_v_transaccion_caja TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- Únicos datos del baseline: corte técnico A/B/C/D/PRE, con tiempo fijo reproducible.
insert into private.alq_instalacion_etapas_v1(etapa,completada_at)
select e,'2026-08-21 00:00:00+00'::timestamptz
from unnest(array['A','B','C','D','PRE']::text[]) e;

do $alq_f1a_baseline_postcheck$
declare
  v_rel record;
  v_rows bigint;
begin
  if (select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='alq' and c.relkind in ('r','p'))<>46
     or (select count(*) from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='alq' and c.relkind='v')<>3
     or (select count(*) from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='v'
           and c.relname like 'alq\_v\_%' escape '\')<>24
     or cardinality(alq_private.alq_operaciones_v1())<>45
     or to_regprocedure(
          'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)') is null
     or (select coalesce(array_agg(etapa order by etapa),array[]::text[])
         from private.alq_instalacion_etapas_v1)
        <>array['A','B','C','D','PRE']::text[]
     or exists(select 1 from private."qa_marca_descartable") then
    raise exception using errcode='P0001',
      message='ALQ_F1A_BASELINE_POSTCHECK_CATALOGO_INVALIDO';
  end if;

  for v_rel in
    select format('%I.%I',n.nspname,c.relname) as rel
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alq' and c.relkind in ('r','p')
    order by c.oid
  loop
    execute format('select count(*) from %s',v_rel.rel) into v_rows;
    if v_rows<>0 then
      raise exception using errcode='P0001',
        message='ALQ_F1A_BASELINE_CONTIENE_DATOS_DE_NEGOCIO',
        detail=v_rel.rel;
    end if;
  end loop;
end
$alq_f1a_baseline_postcheck$;

select 'ALQ_F1A_BASELINE_READY|PG17.6|46_TABLES|27_VIEWS|45_OPERATIONS|NO_BUSINESS_DATA'
  as alq_f1a_baseline_receipt;
