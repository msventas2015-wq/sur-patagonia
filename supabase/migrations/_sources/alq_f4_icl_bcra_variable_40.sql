-- ALQ F4 · corrección acumulativa de la fuente oficial ICL.
-- El catálogo BCRA v4 vigente identifica ICL como idVariable 40.

begin;

set local lock_timeout='10s';
set local statement_timeout='120s';

do $precheck$
declare v_def text;
begin
  if pg_catalog.to_regprocedure(
       'alq_private.alq_admin_indice_observacion_importar_core_v1(uuid,jsonb)') is null
     or pg_catalog.to_regprocedure(
       'public.alq_admin_indice_observacion_importar(uuid,jsonb)') is null then
    raise exception using errcode='P0001',message='ALQ_F4_ICL_BASE_INCOMPATIBLE';
  end if;
  select pg_catalog.pg_get_functiondef(
    'alq_private.alq_admin_indice_observacion_importar_core_v1(uuid,jsonb)'::regprocedure)
    into v_def;
  if pg_catalog.strpos(v_def,'/monetarias/7988%')=0
     and pg_catalog.strpos(v_def,'/monetarias/40')=0 then
    raise exception using errcode='P0001',message='ALQ_F4_ICL_GUARDA_INESPERADA';
  end if;
end
$precheck$;

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
      or v_url !~ '^https://api\.bcra\.gob\.ar/estadisticas/v4\.0/monetarias/40(\?|$)') then
    raise exception using errcode='P0001',message='ALQ_F4_INDICE_FUENTE_ICL_INVALIDA';
  elsif pg_catalog.upper(v_serie.codigo)='IPC' and
     (pg_catalog.upper(v_serie.organismo)<>'INDEC'
      or v_url !~ '^https://apis\.datos\.gob\.ar/series/api/series/\?ids=148\.3_INIVELNAL_DICI_M_26(&|$)') then
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

do $postcheck$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'alq_private.alq_admin_indice_observacion_importar_core_v1(uuid,jsonb)'::regprocedure)
    into v_def;
  if pg_catalog.strpos(v_def,'/monetarias/40')=0
     or pg_catalog.strpos(v_def,'/monetarias/7988%')>0
     or pg_catalog.strpos(v_def,'148\.3_INIVELNAL_DICI_M_26')=0
     or pg_catalog.has_function_privilege('anon',
       'public.alq_admin_indice_observacion_importar(uuid,jsonb)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.alq_admin_indice_observacion_importar(uuid,jsonb)','EXECUTE') then
    raise exception using errcode='P0001',message='ALQ_F4_ICL_POSTCHECK_FALLO';
  end if;
end
$postcheck$;

commit;

select 'ALQ_F4_ICL_BCRA_40_OK' as receipt;
