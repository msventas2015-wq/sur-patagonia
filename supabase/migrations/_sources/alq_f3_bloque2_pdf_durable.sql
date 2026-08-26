-- ALQ F3 · Bloque 2 · corrección: PDF emitido durable y byte-exacto.
-- Cada versión queda ligada a un único alq_documento. Las descargas posteriores
-- usan ese objeto; una corrección crea otro documento y nunca pisa el anterior.
-- No contiene BEGIN/COMMIT: la herramienta de migraciones posee la transacción.

do $alq_f3_b2_pdf_guard$
begin
  if pg_catalog.to_regclass('alq.alq_liquidacion_propietario') is null
     or pg_catalog.to_regclass('alq.alq_documento') is null then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_REQUIERE_BLOQUE2';
  end if;
  if pg_catalog.to_regclass('alq.alq_liquidacion_documento') is not null
     or 'liquidacion_pdf_vincular'=any(alq_private.alq_operaciones_v1()) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_YA_INSTALADO';
  end if;
end
$alq_f3_b2_pdf_guard$;

alter table alq.alq_liquidacion_propietario
  add constraint alq_liquidacion_propietario_version_uq
  unique(propiedad_id,periodo,moneda,version_documento);

create table alq.alq_liquidacion_documento (
  liquidacion_id uuid primary key references alq.alq_liquidacion_propietario(id) on delete restrict,
  documento_id uuid not null unique references alq.alq_documento(id) on delete restrict,
  contenido_sha256 text not null check(contenido_sha256~'^[0-9a-f]{64}$'),
  pdf_sha256 text not null check(pdf_sha256~'^[0-9a-f]{64}$'),
  origen text not null check(origen in ('emitido_con_pdf','reconstruido_antes_primer_envio')),
  registrado_por_parte_usuario_id uuid not null references alq.alq_parte_usuario(id) on delete restrict,
  registrado_at timestamptz not null default pg_catalog.clock_timestamp(),
  operacion_id uuid not null unique references alq.alq_operacion(id) on delete restrict
);
alter table alq.alq_liquidacion_documento enable row level security;
alter table alq.alq_liquidacion_documento force row level security;

create policy alq_admin_select_liquidacion_documento
on alq.alq_liquidacion_documento for select to authenticated
using(alq_private.alq_es_admin_v1());
create policy alq_owner_select_liquidacion_documento
on alq.alq_liquidacion_documento for select to authenticated
using(exists(select 1 from alq.alq_liquidacion_propietario l
  where l.id=liquidacion_id and alq_private.alq_puede_ver_propiedad_v1(l.propiedad_id)));
grant select on alq.alq_liquidacion_documento to authenticated;

create function alq_private.alq_f3_b2_pdf_agregado_guard_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $fn$
declare v_estado text; v_operacion text; v_actor uuid;
begin
  if tg_op<>'INSERT' then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_HISTORIA_INMUTABLE';
  end if;
  select estado,operacion,actor_parte_usuario_id into v_estado,v_operacion,v_actor
  from alq.alq_operacion where id=new.operacion_id for update;
  if not found or v_estado<>'preparada'
     or v_operacion not in ('liquidacion_propietario_emitir','liquidacion_pdf_vincular')
     or not alq_private.alq_f1a_writer_context_v1('check',new.operacion_id) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_DML_DIRECTO_PROHIBIDO';
  end if;
  new.registrado_por_parte_usuario_id:=v_actor;
  new.registrado_at:=pg_catalog.clock_timestamp();
  return new;
end
$fn$;

create trigger alq_liquidacion_documento_guard_biud
before insert or update or delete on alq.alq_liquidacion_documento
for each row execute function alq_private.alq_f3_b2_pdf_agregado_guard_v1();

create function alq_private.alq_f3_b2_pdf_documento_validar_v1(
  p_documento uuid,p_propiedad uuid,p_periodo date,p_pdf_sha text,
  p_contenido_sha text,p_version integer)
returns alq.alq_documento language plpgsql stable security definer set search_path=''
as $fn$
declare v_doc alq.alq_documento%rowtype;
begin
  select * into v_doc from alq.alq_documento where id=p_documento;
  if not found or v_doc.propiedad_id is distinct from p_propiedad
     or v_doc.tipo<>'liquidacion_propietario_pdf'
     or v_doc.bucket<>'alq-docs' or v_doc.audiencia<>'propietario'
     or v_doc.mime<>'application/pdf' or v_doc.sha256 is distinct from p_pdf_sha
     or v_doc.version is distinct from p_version
     or v_doc.path is distinct from
       ('liquidaciones/'||p_propiedad::text||'/'||pg_catalog.to_char(p_periodo,'YYYY-MM')||
        '/v'||p_version::text||'-'||p_pdf_sha||'.pdf')
     or v_doc.retencion->>'contenido_sha256' is distinct from p_contenido_sha
     or v_doc.retencion->>'version_documento' is distinct from p_version::text
     or v_doc.retencion->>'periodo' is distinct from pg_catalog.to_char(p_periodo,'YYYY-MM')
     or not exists(select 1 from storage.objects o
       where o.bucket_id=v_doc.bucket and o.name=v_doc.path) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_DOCUMENTO_INVALIDO';
  end if;
  return v_doc;
end
$fn$;

create function alq_private.alq_f3_b2_pdf_vincular_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_liq uuid:=nullif(p_payload->>'liquidacion_id','')::uuid;
  v_doc uuid:=nullif(p_payload->>'documento_id','')::uuid;
  v_pdf_sha text:=pg_catalog.btrim(coalesce(p_payload->>'pdf_sha256',''));
  v_l alq.alq_liquidacion_propietario%rowtype;
  v_d alq.alq_documento%rowtype;
begin
  if v_liq is null or v_doc is null or v_pdf_sha!~'^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_VINCULO_PAYLOAD_INVALIDO';
  end if;
  select * into v_l from alq.alq_liquidacion_propietario where id=v_liq for update;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F3_B2_LIQUIDACION_NO_EXISTE';
  end if;
  if exists(select 1 from alq.alq_liquidacion_documento where liquidacion_id=v_liq) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_YA_VINCULADO';
  end if;
  if exists(select 1 from alq.alq_liquidacion_envio where liquidacion_id=v_liq) then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_RECONSTRUCCION_POST_ENVIO_PROHIBIDA';
  end if;
  v_d:=alq_private.alq_f3_b2_pdf_documento_validar_v1(
    v_doc,v_l.propiedad_id,v_l.periodo,v_pdf_sha,v_l.contenido_sha256,v_l.version_documento);
  insert into alq.alq_liquidacion_documento(liquidacion_id,documento_id,
    contenido_sha256,pdf_sha256,origen,registrado_por_parte_usuario_id,registrado_at,operacion_id)
  values(v_l.id,v_d.id,v_l.contenido_sha256,v_d.sha256,'reconstruido_antes_primer_envio',p_actor,
    pg_catalog.clock_timestamp(),p_operacion_id);
  return pg_catalog.jsonb_build_object('liquidacion_id',v_l.id,'documento_id',v_d.id,
    'contenido_sha256',v_l.contenido_sha256,'pdf_sha256',v_d.sha256,
    'pdf_bytes',v_d.bytes,'pdf_path',v_d.path);
end
$fn$;

create or replace function alq_private.alq_f3_b2_emitir_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_prop uuid:=nullif(p_payload->>'propiedad_id','')::uuid;
  v_periodo date:=nullif(p_payload->>'periodo','')::date;
  v_esperado text:=pg_catalog.btrim(coalesce(p_payload->>'contenido_sha256',''));
  v_doc uuid:=nullif(p_payload->>'documento_id','')::uuid;
  v_pdf_sha text:=pg_catalog.btrim(coalesce(p_payload->>'pdf_sha256',''));
  v_corregir uuid:=nullif(p_payload->>'corregir_id','')::uuid;
  v_der jsonb; v_cont jsonb; v_sha text; v_id uuid; v_d alq.alq_documento%rowtype;
begin
  if v_prop is null or v_periodo is null or v_doc is null
     or v_esperado!~'^[0-9a-f]{64}$' or v_pdf_sha!~'^[0-9a-f]{64}$' then
    raise exception using errcode='P0001',message='ALQ_F3_B2_EMISION_PAYLOAD_INVALIDO';
  end if;
  v_der:=alq_private.alq_f3_b2_derivar_v1(v_prop,v_periodo,p_actor,v_corregir);
  v_sha:=v_der->>'contenido_sha256'; v_cont:=v_der->'contenido';
  if v_sha<>v_esperado then
    raise exception using errcode='P0001',message='ALQ_F3_B2_BORRADOR_CAMBIO_REVISAR';
  end if;
  v_d:=alq_private.alq_f3_b2_pdf_documento_validar_v1(v_doc,v_prop,v_periodo,v_pdf_sha,v_sha,
    (v_cont->>'version_documento')::integer);
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
  insert into alq.alq_liquidacion_documento(liquidacion_id,documento_id,
    contenido_sha256,pdf_sha256,origen,registrado_por_parte_usuario_id,registrado_at,operacion_id)
  values(v_id,v_d.id,v_sha,v_d.sha256,'emitido_con_pdf',p_actor,
    pg_catalog.clock_timestamp(),p_operacion_id);
  return pg_catalog.jsonb_build_object('liquidacion_id',v_id,'contenido_sha256',v_sha,
    'documento_id',v_d.id,'pdf_sha256',v_d.sha256,'pdf_bytes',v_d.bytes,
    'version_documento',v_der->'version_documento','estado',
    case when v_corregir is null then 'emitida' else 'corregida' end,
    'saldo_cierre_admin',v_der->'saldo_cierre_admin');
end
$fn$;

create or replace function alq_private.alq_f3_b2_envio_aplicar_v1(
  p_payload jsonb,p_operacion_id uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $fn$
declare
  v_liq uuid:=nullif(p_payload->>'liquidacion_id','')::uuid;
  v_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'destinatario_email','')));
  v_estado text:=coalesce(p_payload->>'estado','');
  v_detalle text:=nullif(pg_catalog.btrim(coalesce(p_payload->>'detalle','')), '');
  v_n integer; v_id uuid;
  v_l alq.alq_liquidacion_propietario%rowtype;
  v_ld alq.alq_liquidacion_documento%rowtype;
begin
  if v_liq is null or v_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_estado not in ('enviado','fallido','rebotado') then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ENVIO_PAYLOAD_INVALIDO';
  end if;
  select * into v_l from alq.alq_liquidacion_propietario where id=v_liq for update;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ENVIO_REQUIERE_PDF_GUARDADO';
  end if;
  select * into v_ld from alq.alq_liquidacion_documento where liquidacion_id=v_liq;
  if not found then
    raise exception using errcode='P0001',message='ALQ_F3_B2_ENVIO_REQUIERE_PDF_GUARDADO';
  end if;
  perform alq_private.alq_f3_b2_pdf_documento_validar_v1(v_ld.documento_id,
    v_l.propiedad_id,v_l.periodo,v_ld.pdf_sha256,v_l.contenido_sha256,v_l.version_documento);
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

create or replace view public.alq_v_liquidacion_propietario
with(security_invoker='true') as
select l.id,l.propiedad_id,l.propietario_parte_id,l.mandato_version_id,l.periodo,l.moneda,
  l.version_documento,l.estado,l.saldo_apertura_admin,l.saldo_cierre_admin,l.contenido,
  l.contenido_sha256,l.sucesora_de,l.emitida_por_parte_usuario_id,l.emitida_at,l.operacion_id,
  ld.documento_id,ld.pdf_sha256,ld.origen as pdf_origen,
  d.bytes as pdf_bytes,d.path as pdf_path,d.mime as pdf_mime
from alq.alq_liquidacion_propietario l
left join alq.alq_liquidacion_documento ld on ld.liquidacion_id=l.id
left join alq.alq_documento d on d.id=ld.documento_id;
grant select on public.alq_v_liquidacion_propietario to authenticated;

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
 'liquidacion_propietario_emitir','liquidacion_pdf_vincular','liquidacion_envio_registrar'
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
    'liquidacion_pdf_vincular','liquidacion_envio_registrar'
  ]::text[]
$fn$;

do $alq_f3_b2_pdf_patch_roots$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_f1a_raices_payload_snapshot_v1(text,jsonb)'::regprocedure);
  v_needle:=E'    when ''liquidacion_propietario_emitir'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_ROOT_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'    when ''liquidacion_pdf_vincular'' then\n'
    '      select array_remove(array[l.propiedad_id],null) into v_props\n'
    '      from alq.alq_liquidacion_propietario l\n'
    '      where l.id=nullif(p_payload->>''liquidacion_id'','''')::uuid;\n'
    '    when ''liquidacion_propietario_emitir'' then\n');
  execute v_new;
end
$alq_f3_b2_pdf_patch_roots$;

do $alq_f3_b2_pdf_patch_executor$
declare v_def text; v_new text; v_needle text;
begin
  v_def:=pg_catalog.pg_get_functiondef(
    'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure);
  v_needle:=E'  when ''liquidacion_propietario_emitir'' then\n';
  if (length(v_def)-length(replace(v_def,v_needle,'')))/length(v_needle)<>1 then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_EXECUTOR_PATCH_NO_UNICO';
  end if;
  v_new:=replace(v_def,v_needle,E'  when ''liquidacion_pdf_vincular'' then\n'
    '    v_result:=alq_private.alq_f3_b2_pdf_vincular_aplicar_v1(\n'
    '      p_payload,p_operacion_id,p_actor);\n\n'
    '  when ''liquidacion_propietario_emitir'' then\n');
  execute v_new;
end
$alq_f3_b2_pdf_patch_executor$;

revoke all on function alq_private.alq_f3_b2_pdf_agregado_guard_v1() from public;
revoke all on function alq_private.alq_f3_b2_pdf_documento_validar_v1(uuid,uuid,date,text,text,integer) from public;
revoke all on function alq_private.alq_f3_b2_pdf_vincular_aplicar_v1(jsonb,uuid,uuid) from public;

do $alq_f3_b2_pdf_postcheck$
begin
  if pg_catalog.to_regclass('alq.alq_liquidacion_documento') is null
     or not exists(select 1 from pg_catalog.pg_constraint
       where conrelid='alq.alq_liquidacion_propietario'::regclass
         and conname='alq_liquidacion_propietario_version_uq' and contype='u')
     or (select count(*) from unnest(alq_private.alq_operaciones_v1()) x
       where x in ('liquidacion_propietario_emitir','liquidacion_pdf_vincular',
         'liquidacion_envio_registrar'))<>3
     or position('alq_f3_b2_pdf_vincular_aplicar_v1' in pg_catalog.pg_get_functiondef(
       'alq_private.alq_aplicar_operacion_v1(text,jsonb,uuid,uuid)'::regprocedure))=0
     or not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='alq_v_liquidacion_propietario'
         and column_name='documento_id')
     or not exists(select 1 from information_schema.columns
       where table_schema='public' and table_name='alq_v_liquidacion_propietario'
         and column_name='pdf_origen') then
    raise exception using errcode='P0001',message='ALQ_F3_B2_PDF_POSTCHECK_FALLO';
  end if;
end
$alq_f3_b2_pdf_postcheck$;
