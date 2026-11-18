// Operación explícita de traspaso. Importar este módulo no lee ni escribe la base.
// El cliente se recibe desde config.js con la sesión real del administrador.
const SOURCE='29f8203d-fbd2-4bbb-8187-62464333a0b3';
const QA='rsjwqmpseknvydistgfr';
const DESTINATION='https://wajkfydxutptcvvfwrvq.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectFields=new Set(('nombre slug tagline descripcion categoria estado destacado provincia ciudad distancia_km tipo_acceso acceso_desc latitud longitud hectareas_total cantidad_lotes sup_min_m2 sup_max_m2 zonificacion expediente altura_max fos reglamento_obs servicios fecha_entrega cronograma tipo_propiedad financiacion precio_desde precio_hasta monto_reserva comision_pct condiciones_venta financiacion_banco ajuste_precios tema foto_portada fotos foto_atmosfera foto_fondo opacidad_fondo video_url masterplan_url brochure_url plano_activo mapa_activo rep_activo').split(' '));
const lotFields=['numero','superficie_m2','precio_usd','estado','frente_agua','notas','mapa_x','mapa_y','tipo_lote'];
const clone=value=>JSON.parse(JSON.stringify(value));
function check(condition,message){if(!condition)throw new Error(message);}
function versionKey(value){
  const match=typeof value==='string'&&value.match(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/);
  const millis=Date.parse(value);
  check(match&&Number.isFinite(millis),'TRASPASO_VERSION_INVALIDA');
  return BigInt(millis)*1000n+BigInt((match[1]||'').padEnd(6,'0').slice(3));
}
function sameIds(actual,expected){return Array.isArray(actual)&&actual.length===80&&new Set(actual).size===80&&JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());}
function lotData(lot){return Object.fromEntries(lotFields.filter(k=>Object.hasOwn(lot,k)).map(k=>[k,clone(lot[k])]));}
function receiptOK(receipt,ids,created,projectId){
  check(receipt&&UUID.test(receipt.proyecto_id)&&receipt.proyecto_id!==SOURCE&&(!projectId||receipt.proyecto_id===projectId),'TRASPASO_IDENTIDAD_INVALIDA');
  check(receipt.creado===created&&receipt.lotes===80&&sameIds(receipt.lote_ids,ids),'TRASPASO_UUID_NO_CONSERVADOS');
  versionKey(receipt.updated_at);
  return receipt;
}

export function prepareTerrazasTransfer(backup,mediaManifest){
  check(backup?.fuente===QA&&backup.proyecto?.id===SOURCE&&backup.proyecto.slug==='terrazas-del-piltri','TRASPASO_FUENTE_INVALIDA');
  const lots=backup.lotes;
  check(Array.isArray(lots)&&lots.length===80&&new Set(lots.map(l=>l.id)).size===80&&lots.every(l=>UUID.test(l.id)&&l.proyecto_id===SOURCE),'TRASPASO_REQUIERE_80_UUID');
  const media=new Map();
  for(const item of mediaManifest?.medios||[]){
    check(item.origen.startsWith(`https://${QA}.supabase.co/storage/v1/object/public/imagenes/`)&&/^\/assets\/recorridos\/terrazas-revision\/tp-[a-z0-9-]+\.webp$/i.test(item.destino),'TRASPASO_MEDIO_INVALIDO');
    check(!media.has(item.origen),'TRASPASO_MEDIO_REPETIDO');media.set(item.origen,item.destino);
  }
  function rewrite(value){
    if(Array.isArray(value))return value.map(rewrite);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
    if(typeof value==='string'){
      if(media.has(value))return media.get(value);
      check(!value.includes(QA),'TRASPASO_MEDIO_QA_SIN_COPIA');
    }
    return value;
  }
  const project=Object.fromEntries(Object.entries(backup.proyecto).filter(([k])=>projectFields.has(k)&&k!=='tema'));
  const originalTheme=typeof backup.proyecto.tema==='string'?JSON.parse(backup.proyecto.tema):clone(backup.proyecto.tema);
  const miniweb=originalTheme?.miniweb;
  check(miniweb?.recorrido?.proyectoId===SOURCE&&sameIds(Object.keys(miniweb.lotes||{}),lots.map(l=>l.id)),'TRASPASO_IDENTIDAD_VINCULOS_INVALIDA');
  const featureIds=new Set(miniweb.recorrido.escena?.features?.filter(f=>f.kind==='lot').map(f=>f.id));
  check(lots.every(l=>featureIds.has(miniweb.lotes[l.id]?.elementoRecorrido)),'TRASPASO_VINCULO_SIN_GEOMETRIA');
  const finalProject=rewrite({...project,estado:'borrador',cantidad_lotes:80});
  const finalTheme=rewrite(originalTheme);
  finalTheme.miniweb.recorrido.proyectoId='__DESTINO_PROYECTO_ID__';
  finalProject.tema=JSON.stringify(finalTheme);
  const firstProject={...clone(finalProject),tema:JSON.stringify({miniweb:{version:1,activa:false}}),fotos:[]};
  for(const key of ['foto_portada','foto_atmosfera','foto_fondo','video_url','masterplan_url','brochure_url'])firstProject[key]=null;
  const lotIds=lots.map(l=>l.id);
  const completeLots=lots.map(l=>({origen_id:l.id,...lotData(l)}));
  const create={p_proyecto_id:null,p_proyecto:firstProject,p_lotes:lots.map(l=>({origen_id:null,id_nuevo:l.id,...lotData(l)})),p_updated_at_esperado:null,p_lotes_eliminados:[]};
  return {version:1,sourceId:SOURCE,slug:'terrazas-del-piltri',lotIds,create,finalProject,completeLots};
}

export function completeTerrazasRequest(plan,receipt){
  check(plan?.version===1&&plan.sourceId===SOURCE&&plan.slug==='terrazas-del-piltri','TRASPASO_PLAN_INVALIDO');
  receiptOK(receipt,plan.lotIds,true);
  check(sameIds(plan.completeLots?.map(l=>l.origen_id),plan.lotIds),'TRASPASO_UUID_NO_CONSERVADOS');
  const project=clone(plan.finalProject);
  const theme=JSON.parse(project.tema);
  check(theme.miniweb?.recorrido?.proyectoId==='__DESTINO_PROYECTO_ID__','TRASPASO_IDENTIDAD_INVALIDA');
  theme.miniweb.recorrido.proyectoId=receipt.proyecto_id;project.tema=JSON.stringify(theme);
  check(project.estado==='borrador'&&!JSON.stringify(project).includes(QA)&&!JSON.stringify(project).includes(SOURCE),'TRASPASO_IDENTIDAD_O_MEDIOS_INVALIDOS');
  return {p_proyecto_id:receipt.proyecto_id,p_proyecto:project,p_lotes:clone(plan.completeLots),p_updated_at_esperado:receipt.updated_at,p_lotes_eliminados:[]};
}

// Una llamada por paso; nunca reintenta ni activa un proyecto automáticamente.
// Guardar el recibo de crear antes de llamar completar. Si se pierde, inspeccionar
// el borrador por slug: no repetir crear ni usar inserciones directas.
export async function runTerrazasStep(client,plan,{step,receipt,origin,authorization}={}){
  check(client?.supabaseUrl?.replace(/\/$/,'')===DESTINATION&&origin==='https://surpatagonian.com','TRASPASO_DESTINO_INVALIDO');
  check(['crear','completar'].includes(step)&&authorization===(step==='crear'?'CREAR_TERRAZAS_PRODUCCION':'COMPLETAR_TERRAZAS_PRODUCCION'),'TRASPASO_AUTORIZACION_REQUERIDA');
  check(plan?.version===1&&plan.sourceId===SOURCE&&plan.slug==='terrazas-del-piltri'&&sameIds(plan.lotIds,plan.lotIds),'TRASPASO_PLAN_INVALIDO');
  const {data:auth,error:authError}=await client.auth.getUser();
  check(!authError&&auth?.user?.app_metadata?.rol==='admin','TRASPASO_ADMIN_REQUERIDO');
  let request;
  if(step==='crear'){
    check(sameIds(plan.create?.p_lotes?.map(l=>l.id_nuevo),plan.lotIds)&&plan.create.p_proyecto_id===null&&plan.create.p_proyecto.estado==='borrador','TRASPASO_PLAN_INVALIDO');
    const existing=await client.from('proyectos').select('id').eq('slug',plan.slug);
    check(!existing.error&&Array.isArray(existing.data),'TRASPASO_PREFLIGHT_NO_DISPONIBLE');
    check(existing.data.length===0,'TRASPASO_PROYECTO_EXISTENTE_NO_REINTENTAR');
    const collision=await client.from('lotes').select('id').in('id',plan.lotIds);
    check(!collision.error&&Array.isArray(collision.data),'TRASPASO_PREFLIGHT_NO_DISPONIBLE');
    check(collision.data.length===0,'TRASPASO_COLISION_UUID');
    request=clone(plan.create);
  }else{
    request=completeTerrazasRequest(plan,receipt);
    const current=await client.from('proyectos').select('id,slug,estado,updated_at').eq('id',receipt.proyecto_id).maybeSingle();
    check(!current.error&&current.data?.id===receipt.proyecto_id&&current.data.slug===plan.slug&&current.data.estado==='borrador'&&versionKey(current.data.updated_at)===versionKey(receipt.updated_at),'TRASPASO_BORRADOR_DESACTUALIZADO');
    const inventory=await client.from('lotes').select('id').eq('proyecto_id',receipt.proyecto_id);
    check(!inventory.error&&sameIds(inventory.data?.map(l=>l.id),plan.lotIds),'TRASPASO_UUID_NO_CONSERVADOS');
  }
  let response;
  try{response=await client.rpc('admin_guardar_proyecto_lotes_v2',request);}
  catch{throw new Error('TRASPASO_RESULTADO_INCIERTO_NO_REINTENTAR');}
  if(response.error||!response.data)throw new Error('TRASPASO_RESULTADO_INCIERTO_NO_REINTENTAR');
  try{
    const result=receiptOK(response.data,plan.lotIds,step==='crear',request.p_proyecto_id);
    if(step==='completar')check(versionKey(result.updated_at)>versionKey(receipt.updated_at),'TRASPASO_VERSION_NO_AVANZO');
    return result;
  }
  catch{throw new Error('TRASPASO_RESULTADO_INCIERTO_NO_REINTENTAR');}
}
