import {TERRAZAS_QA_ID,terrazasTourQA} from './recorrido-terrazas-qa.mjs';
import {leerInventarioCompleto} from './lotes-inventario.mjs?v=20261117-publico';
import {isAlamosReferenceProject} from './recorrido-enlaces.mjs';
import {openMediaViewer} from './recorrido-visor-medios.mjs?v=20261114-media1';
import {cameraMetadata,gps} from './recorrido-geografia.mjs?v=20261114-media1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const isLocalMediaHost = () => ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
export const MEDIA_LIMITS = {foto: {count:20, bytes:256*1024*1024}, panorama: {count:10, bytes:256*1024*1024}};
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const MEDIA_FIELDS = new Set(['id','tipo','url','original','alta','miniatura','captura','titulo','descripcion','fecha','autor','vista','orientacion','ancho','alto','bytesOriginal','sha256Original']);
function validMedia(item, {local = false} = {}) {
  return !!item && Object.keys(item).every(k=>MEDIA_FIELDS.has(k)) && Object.hasOwn(MEDIA_LIMITS,item.tipo)
    && typeof item.id==='string' && !!item.id && item.id.length<=3100 && !!mediaURL(item.url,{local})
    && ['original','alta','miniatura'].every(k=>item[k]==null || !!mediaURL(item[k],{local}))
    && (item.captura==null || (typeof item.captura==='object' && !Array.isArray(item.captura) && (item.captura.point==null||gps(item.captura.point)) && (item.captura.height==null||Number.isFinite(item.captura.height)) && (item.captura.heading==null||Number.isFinite(item.captura.heading))))
    && ['titulo','descripcion','autor','fecha'].every(k=>item[k]==null || typeof item[k]==='string')
    && (!item.vista || ['referencia','aerea','desde-lote'].includes(item.vista))
    && (!item.sha256Original || /^[a-f0-9]{64}$/.test(item.sha256Original))
    && (item.orientacion==null || (Number.isFinite(item.orientacion) && item.orientacion>=0 && item.orientacion<360))
    && (item.tipo!=='panorama' || (item.ancho>0 && item.alto>0 && Math.abs(item.ancho/item.alto-2)<=.02));
}

export function mediaURL(value, {local = false, origin = globalThis.location?.origin || 'https://surpatagonian.com'} = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > 3000) return '';
  try {
    const url = new URL(value, origin);
    if (url.username || url.password) return '';
    if (local && url.protocol === 'blob:' && url.origin === origin) return url.href;
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === origin) ? url.href : '';
  } catch { return ''; }
}

export function mediaList(config, lotId = '', {local = false} = {}) {
  const lot = object(config?.lotes?.[lotId]);
  const record = lotId ? object(lot.recorrido) : object(config?.recorrido);
  if (record.version && record.version !== 1) return [];
  const seen = new Set(), result = [], counts={foto:0,panorama:0};
  for (const item of Array.isArray(record.medios) ? record.medios.slice(0,100) : []) {
    if (!validMedia(item,{local}) || counts[item.tipo]>=MEDIA_LIMITS[item.tipo].count) continue;
    const url = mediaURL(item?.url, {local});
    if (!url || !['foto','panorama'].includes(item.tipo) || seen.has(url)) continue;
    if (lotId && item.tipo === 'foto' && Array.isArray(lot.fotos) && !lot.fotos.includes(item.url)) continue;
    seen.add(url);counts[item.tipo]++; result.push({...item, url});
  }
  // Compatibilidad con las fotos que ya usa la ficha de miniweb; nunca con fotos generales.
  for (const raw of lotId && Array.isArray(lot.fotos) ? lot.fotos : []) {
    const url = mediaURL(raw, {local});
    if (url && !seen.has(url) && counts.foto<MEDIA_LIMITS.foto.count) { seen.add(url);counts.foto++;result.push({id:'legacy:'+url,tipo:'foto',url,titulo:'Foto del lote'}); }
  }
  const cover = result.findIndex(item => item.id === record.portada && item.tipo === 'foto');
  if (cover > 0) result.unshift(result.splice(cover,1)[0]);
  return result;
}

export function validateMediaBindings(config, {projectId, keys, planoVersion} = {}) {
  const bank = object(config?.recorrido);
  if (bank.version && bank.version !== 1) throw Error('Este banco de medios utiliza una versión posterior. Se conserva sin modificar.');
  if (bank.proyectoId && projectId && bank.proyectoId !== projectId) throw Error('Los medios pertenecen a otro proyecto. No se pueden reasignar automáticamente.');
  const used = new Set();
  for (const entry of Object.values(object(config?.lotes))) {
    const record = object(entry?.recorrido);
    if (record.version && record.version !== 1) throw Error('Un lote tiene una versión posterior de medios. Se conserva sin modificar.');
    const binding = record.plano;
    if (!binding) continue;
    if (binding.id !== 'alamos' || typeof binding.lote !== 'string' || !/^\d+-\d+$/.test(binding.lote)) throw Error('La asociación al plano no es válida.');
    if (!/^[a-f0-9]{64}$/.test(binding.version || '') || (planoVersion && binding.version !== planoVersion)) throw Error('La asociación corresponde a otra versión del plano. Revísela antes de guardar.');
    if (keys && !keys.has(binding.lote)) throw Error('El lote elegido no existe en el plano del recorrido.');
    const key = binding.id + ':' + binding.lote;
    if (used.has(key)) throw Error('Dos registros están asociados al mismo lote del plano. Revise la vinculación.');
    used.add(key);
  }
}

export function assertLotMediaIdentity(config, liveIds, removedIds = new Set()) {
  const orphan = Object.keys(object(config?.lotes)).filter(id => !liveIds.has(id) && !removedIds.has(id));
  if (orphan.length) throw Error(`Hay medios de ${orphan.length} lote(s) cuya identidad no está vinculada. Se conservaron íntegros; resuelva la vinculación antes de guardar. No se reasignan por número.`);
}

function recoverOrphanMedia(config, oldId, newId, liveIds, identity, local) {
  if (!identity?.id || identity.ready === false || Number(config.version) > 2) throw Error('El proyecto debe estar cargado y ser compatible para recuperar los medios.');
  if (!liveIds.has(newId)) throw Error('Seleccione un lote guardado para recuperar los medios.');
  if (liveIds.has(oldId) || !Object.hasOwn(config.lotes || {}, oldId)) throw Error('Ese registro ya no está pendiente de vincular.');
  const source = config.lotes[oldId], target = object(config.lotes[newId]);
  const media = object(source?.recorrido), targetBank = object(target.recorrido);
  if ((media.version && media.version !== 1) || (targetBank.version && targetBank.version !== 1)) throw Error('La versión de medios del lote todavía no es compatible.');
  for (const list of [source?.fotos, media.medios, target.fotos, targetBank.medios]) {
    if (list != null && !Array.isArray(list)) throw Error('El material guardado tiene un formato que debe revisarse antes de reasociarlo.');
  }
  if (target.fotos?.length || target.tour360 || targetBank.medios?.length || targetBank.portada) {
    throw Error('El lote elegido ya tiene material. Elija otro destino.');
  }

  const recovered = {...target};
  if (source?.fotos != null) recovered.fotos = source.fotos;
  else if (media.medios?.some(item => item?.tipo === 'foto')) recovered.fotos = media.medios.filter(item => item?.tipo === 'foto').map(item => item.url);
  if (source?.tour360) recovered.tour360 = source.tour360;
  if (media.medios?.length || media.portada) {
    recovered.recorrido = {...targetBank, version:1};
    if (media.medios?.length) recovered.recorrido.medios = media.medios;
    if (media.portada) recovered.recorrido.portada = media.portada;
  }
  // Validar antes de cambiar las dos entradas. El plano y la ficha son propios del receptor.
  validateMediaCatalog({recorrido:config.recorrido, lotes:{[newId]:recovered}}, {local, projectId:identity.id});
  config.lotes[newId] = recovered;
  delete config.lotes[oldId];
}

export function validateMediaCatalog(config, {local = false, projectId, keys, planoVersion} = {}) {
  validateMediaBindings(config,{projectId,keys,planoVersion});
  for (const record of [object(config?.recorrido), ...Object.values(object(config?.lotes)).map(v => object(v?.recorrido))]) {
    if (record.medios != null && !Array.isArray(record.medios)) throw Error('El banco de medios no tiene un formato válido.');
    const counts = {foto:0,panorama:0}, ids = new Set();
    for (const item of record.medios || []) {
      if (!validMedia(item,{local}) || ids.has(item.id)) throw Error('Hay un medio inválido o repetido en el banco. Revise los archivos antes de guardar.');
      ids.add(item.id);counts[item.tipo]++;
      if (counts[item.tipo] > MEDIA_LIMITS[item.tipo].count) throw Error('Se superó la cantidad admitida de medios por destino.');
      if ((item.titulo?.length || 0)>140 || (item.descripcion?.length || 0)>600 || (item.autor?.length || 0)>140) throw Error('El título, descripción o autor superan el largo permitido.');
      if (['titulo','descripcion','autor','fecha'].some(k=>item[k]!=null && typeof item[k]!=='string')) throw Error('Los textos del medio no tienen un formato válido.');
      if (item.vista && !['referencia','aerea','desde-lote'].includes(item.vista)) throw Error('El tipo de vista no es válido.');
      if (item.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(item.fecha)) throw Error('Hay una fecha de captura no válida.');
      if (item.orientacion != null && (!Number.isFinite(item.orientacion) || item.orientacion<0 || item.orientacion>=360)) throw Error('La orientación debe estar entre 0 y 359 grados.');
      if (item.tipo === 'panorama' && (!(item.ancho>0) || !(item.alto>0) || Math.abs(item.ancho/item.alto-2)>.02)) throw Error('Hay una panorámica que no tiene proporción esférica 2:1.');
    }
  }
  for (const lot of Object.values(object(config?.lotes))) {
    if (Array.isArray(lot?.fotos) && (lot.fotos.length>20 || lot.fotos.some(url=>!mediaURL(url,{local})))) throw Error('Hay fotos no válidas en un lote. Revise todas las asociaciones antes de guardar.');
    if (lot?.tour360 && !mediaURL(lot.tour360)) throw Error('Hay un enlace de recorrido externo no válido.');
  }
}

export async function prepareMediaDerivatives(file, type, info, {onProgress=()=>{}}={}) {
  info ||= await inspectMediaFile(file,type);
  const webWidth=type==='panorama'?4096:2560;
  async function resize(maxWidth,suffix,quality) {
    let image,bitmap,url,canvas;
    try {
      onProgress('Preparando '+maxWidth+' px · '+file.name);
      if(typeof createImageBitmap==='function') {
        // La decodificación redimensionada evita conservar varios panoramas completos en memoria.
        const resizeWidth=Math.min(maxWidth,info.ancho),resizeHeight=Math.round(info.alto*resizeWidth/info.ancho);
        bitmap=await createImageBitmap(file,{resizeWidth,resizeHeight,resizeQuality:'high'});image=bitmap;
      } else {if(info.ancho*info.alto>16000000)throw Error('Este navegador no permite reducir la foto del dron con seguridad. Abrí el cargador en un navegador actualizado.');url=URL.createObjectURL(file);image=new Image();image.src=url;await image.decode();}
      const width=Math.min(maxWidth,image.width),height=Math.max(1,Math.round(image.height*width/image.width));
      canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw Error('No se pudo preparar la imagen para la web.');
      context.drawImage(image,0,0,width,height);
      const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/webp',quality}):await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if(!blob || blob.type!=='image/webp')throw Error('Este navegador no pudo preparar la versión WebP. El original queda en tu computadora y no se sube.');
      return new File([blob],file.name.replace(/\.[^.]+$/,'')+'-'+suffix+'.webp',{type:'image/webp'});
    } finally {bitmap?.close();if(canvas)canvas.width=canvas.height=1;if(url)URL.revokeObjectURL(url);}
  }
  return {web:await resize(webWidth,'web',.85),...(type==='panorama'?{alta:await resize(8192,'8k',.85)}:{}),miniatura:await resize(512,'miniatura',.85),info};
}

export function mediaPreparationLabel(file,parts){
  const size=value=>(value/1024/1024).toLocaleString('es-AR',{maximumFractionDigits:2})+' MiB';
  return file.name+': '+size(file.size)+' local → '+(parts.alta?'4k '+size(parts.web.size)+' · 8k '+size(parts.alta.size):'Web '+size(parts.web.size))+' · miniatura '+size(parts.miniatura.size)+'. El original no se subió.';
}

// Read only bounded headers before decoding; never allocate a full 100 MP Image
// merely to validate its dimensions. The actual decoder runs resized below.
export function mediaDimensions(bytes,type){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,orientation=1;
 if(type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
  for(let p=2;p+9<bytes.length;){if(bytes[p]!==255)break;const marker=bytes[p+1];if(marker===255){p++;continue;}if(marker===218||marker===217)break;const size=v.getUint16(p+2);if(size<2||p+2+size>bytes.length)break;
   if(marker===225&&v.getUint32(p+4)===0x45786966)try{const t=p+10,le=v.getUint16(t)===0x4949,ifd=t+v.getUint32(t+4,le),count=v.getUint16(ifd,le);for(let i=0;i<count;i++){const a=ifd+2+i*12;if(v.getUint16(a,le)===0x112)orientation=v.getUint16(a+8,le);}}catch{}
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=v.getUint16(p+5);width=v.getUint16(p+7);break;}p+=size+2;
  }
 }else if(type==='image/png'&&bytes.length>=24&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){width=v.getUint32(16);height=v.getUint32(20);}
 else if(type==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){
  const u24=p=>bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16;
  for(let p=12;p+13<=bytes.length;){const tag=String.fromCharCode(...bytes.slice(p,p+4)),size=v.getUint32(p+4,true),d=p+8;
   if(tag==='VP8X'&&d+10<=bytes.length){width=1+u24(d+4);height=1+u24(d+7);break;}
   if(tag==='VP8L'&&bytes[d]===47){width=1+(bytes[d+1]|(bytes[d+2]&63)<<8);height=1+((bytes[d+2]>>6)|bytes[d+3]<<2|(bytes[d+4]&15)<<10);break;}
   if(tag==='VP8 '&&d+10<=bytes.length&&bytes[d+3]===157&&bytes[d+4]===1&&bytes[d+5]===42){width=v.getUint16(d+6,true)&16383;height=v.getUint16(d+8,true)&16383;break;}p+=8+size+(size%2);
  }
 }
 return orientation>=5&&orientation<=8?{ancho:height,alto:width}:{ancho:width,alto:height};
}

// Devuelve sólo una asociación explícita y única, respaldada por un lote del proyecto vivo.
export function mediaForPolygon(config, key, {projectId, lotIds, local = false, planoVersion} = {}) {
  if (!projectId || config?.recorrido?.proyectoId !== projectId) return [];
  const matches = Object.entries(object(config?.lotes)).filter(([id, entry]) =>
    lotIds?.has(id) && entry?.recorrido?.plano?.id === 'alamos' && entry.recorrido.plano.lote === key && entry.recorrido.plano.version === planoVersion);
  return matches.length === 1 ? mediaList(config, matches[0][0], {local}) : [];
}

export async function inspectMediaFile(file, type) {
  const limit = Object.hasOwn(MEDIA_LIMITS,type) ? MEDIA_LIMITS[type] : null;
  if (!limit || !/^image\/(jpeg|png|webp)$/.test(file.type) || !file.size || file.size > limit.bytes) {
    throw Error(`${file.name}: usá JPG, PNG o WebP de hasta 256 MiB. Se reduce en esta computadora antes de subir.`);
  }
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
    : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!valid) throw Error(`${file.name}: el contenido no coincide con el formato de imagen.`);
  try {
    const header=new Uint8Array(await file.slice(0,2*1024*1024).arrayBuffer()),{ancho:width,alto:height}=mediaDimensions(header,file.type);
    if (!width || !height || width > 32768 || height > 32768 || width*height > 128000000) throw Error('La imagen supera el tamaño admitido (128 megapíxeles).');
    if (type === 'panorama' && Math.abs(width / height - 2) > .02) throw Error(`${file.name}: la panorámica debe ser esférica completa, con proporción 2:1. No se recorta automáticamente.`);
    const captura=await cameraMetadata(file),digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return {ancho:width,alto:height,captura,bytesOriginal:file.size,sha256Original:[...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('')};
  } catch (error) { throw Error(error.message || `No se pudo abrir ${file.name}.`); }
}

export function mountMediaUploader({root, getConfig, getIdentity, getLots, upload, onChange = () => {}, onRecovery = () => {}, local = false, scope = "all", linkRoot = null, selectedLot = () => ""}) {
  root.classList.add('rm-editor');
  root.innerHTML = '<h3>Fotos y panorámicas del recorrido</h3><p>Organice el material del proyecto y el de cada lote. Las fotos generales no reemplazan las capturas propias de un lote.</p><fieldset style="border:0;padding:0;margin:0;min-width:0"><div class="rm-toolbar"><label>Asociar material a<select data-target aria-label="Destino del material"></select></label><label>Tipo de material<select data-type><option value="foto">Fotografías</option><option value="panorama">Panorámicas 360°</option></select></label></div><div class="rm-connection" hidden><label>Lote en el plano del recorrido<select data-binding><option value="">Sin vincular al plano</option></select></label><p class="rm-hint">Elija la ubicación correspondiente. Esta asociación no cambia el número, la geometría ni los datos comerciales del lote.</p></div><label>Agregar archivos<input data-upload type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="rm-hint" data-format></p><div class="rm-grid"></div><p class="rm-empty">Todavía no hay material en este destino.</p></fieldset><p role="status" aria-live="polite"></p><p class="rm-hint" data-save-hint></p>';
  const target = root.querySelector('[data-target]'), kind = root.querySelector('[data-type]'), input = root.querySelector('[data-upload]');
  const status = root.querySelector('[role=status]'), binding = root.querySelector('[data-binding]'), fieldset = root.querySelector('fieldset');
  if (scope !== 'all') {
    target.closest('label').hidden = true;
    target.closest('label').style.display = 'none';
    root.querySelector('h3').textContent = scope === 'lot' ? 'Fotos y panorámicas de este lote' : 'Fotos y panorámicas del proyecto';
    root.querySelector('p').textContent = scope === 'lot' ? 'Estas imágenes se usan en la ficha del lote y en el recorrido.' : 'Material general del desarrollo.';
  }
  let busy = false, polygons = [], planoVersion = '', mapProject = null, mapLoading = false, disposed = false;
  root.querySelector('[data-save-hint]').textContent = local ? 'Modo local: los archivos se guardan sólo en este navegador al pulsar Guardar borrador local. No se suben a QA ni a producción.' : 'Se suben sólo versiones WebP optimizadas. El original queda en tu computadora. Guardá el proyecto para conservar las asociaciones.';
  const orphanSection=document.createElement('section');orphanSection.className='rm-orphans';root.querySelector('fieldset').prepend(orphanSection);
  const confirmBinding=document.createElement('button');confirmBinding.type='button';confirmBinding.textContent='Confirmar ubicación con el plano actual';root.querySelector('.rm-connection').append(confirmBinding);
  let bindingDetails, lastLot;
  if(scope==='lot'){
    root.querySelector('h3').textContent='Fotos y panorámicas';root.querySelector('p').hidden=true;
    root.querySelector('.rm-empty').textContent='Sin archivos de este tipo.';
    root.querySelector('[data-save-hint]').textContent='El material y el crédito de autor son públicos.';
    const box=binding.closest('.rm-connection');bindingDetails=document.createElement('details');
    const label=document.createElement('summary');bindingDetails.append(label);box.before(bindingDetails);bindingDetails.append(box);if(linkRoot)linkRoot.append(bindingDetails);
    box.querySelector('.rm-hint').textContent='Elegí la parcela que corresponde a esta ficha.';
  }
  let preferredTarget=null;
  const record = (id = target.value) => id ? object(getConfig().lotes?.[id]?.recorrido) : object(getConfig().recorrido);
  const list = (id = target.value) => mediaList(getConfig(), id, {local});
  function updateRecord(next, id = target.value) {
    const config = getConfig(), identity = getIdentity();
    config.recorrido = {...object(config.recorrido),version:1,proyectoId:identity.id};
    if (id) {
      config.lotes ||= {};
      const lot = {...object(config.lotes[id])};
      lot.recorrido = {...object(lot.recorrido),...next,version:1};
      if (next.medios) {
        const photos=next.medios.filter(item=>item.tipo==='foto'),cover=photos.findIndex(item=>item.id===(next.portada ?? lot.recorrido.portada));
        if(cover>0)photos.unshift(photos.splice(cover,1)[0]);lot.fotos=photos.map(item=>item.url);
      }
      config.lotes[id] = lot;
    } else config.recorrido = {...config.recorrido,...next,version:1,proyectoId:identity.id};
    onChange();
  }
  function assertEditable() {
    if (Number(getConfig().version)>2) throw Error('La miniweb utiliza una versión posterior. Se conserva sin modificar.');
    if (!getIdentity()?.id || getIdentity().ready === false) throw Error('Guarde el proyecto y espere a que termine de cargar antes de asociar material.');
    if (scope === 'lot' && !target.value) throw Error('Seleccione un lote guardado.');
    if (target.value && !getLots().some(l => l.id === target.value)) throw Error('El lote ya no está en el proyecto. Vuelva a seleccionarlo.');
    validateMediaBindings(getConfig(), {projectId:getIdentity().id, keys:polygons.length ? new Set(polygons.map(l => l.key)) : undefined});
    if (target.value && record().version && record().version !== 1) throw Error('La versión de medios del lote todavía no es compatible.');
  }
  function render() {
    if (disposed) return;
    const items = list(), photos = items.filter(item => item.tipo === kind.value), bank = record();
    const alive=new Set(getLots().map(l=>l.id)),orphans=Object.keys(object(getConfig().lotes)).filter(id=>!alive.has(id));
    orphanSection.hidden=!orphans.length;
    orphanSection.innerHTML=orphans.length?'<h4>Medios pendientes de vincular</h4><p>Se conservaron los archivos de estos registros anteriores. Elija explícitamente a qué lote corresponde cada conjunto antes de guardar.</p>'+orphans.map(id=>`<div class="rm-connection" data-orphan="${esc(id)}"><strong>Registro anterior ${esc(id.slice(-8))} · ${mediaList(getConfig(),id,{local}).length} medios</strong><label>Vincular con<select><option value="">Seleccione un lote guardado</option>${getLots().map(l=>`<option value="${esc(l.id)}">${esc(l.label||'Lote '+l.numero)} · ${esc(l.id.slice(-6))}</option>`).join('')}</select></label><button type="button" data-reassign>Reasociar estos medios</button></div>`).join(''):'';
    root.querySelector('[data-format]').textContent = kind.value === 'panorama' ? 'Archivo del dron de hasta 256 MiB, esférico 2:1. Se prepara en WebP 4k y 8k más miniatura. El original no se sube.' : 'Archivo del dron de hasta 256 MiB. Se prepara en WebP de hasta 2560 px más miniatura. Máximo 20 fotos por destino.';
    binding.closest('.rm-connection').hidden = !target.value || !polygons.length;
    binding.value = bank.plano?.id === 'alamos' ? bank.plano.lote : '';
    if(bindingDetails){
      bindingDetails.inert=fieldset.disabled;bindingDetails.hidden=binding.closest('.rm-connection').hidden;
      const verified=binding.value && bank.plano?.version===planoVersion;
      if(lastLot!==target.value){lastLot=target.value;bindingDetails.open=!verified;}
      bindingDetails.querySelector('summary').textContent=verified?'Parcela vinculada · '+binding.selectedOptions[0].textContent:'Vincular con el plano';
    }
    confirmBinding.hidden=!(bank.plano && bank.plano.version!==planoVersion && polygons.some(p=>p.key===bank.plano.lote));
    root.querySelector('.rm-empty').hidden = photos.length > 0;
    root.querySelector('.rm-grid').innerHTML = photos.map(item => `<article class="rm-card" data-media="${esc(item.id)}"><img src="${esc(item.miniatura || item.url)}" alt="${esc(item.titulo || 'Material del recorrido')}" loading="lazy"><span class="rm-kind">${item.tipo === 'panorama' ? 'Panorámica 360°' : 'Fotografía'}${item.ancho ? ' · '+item.ancho+' × '+item.alto : ''}${bank.portada === item.id ? ' · Portada' : ''}</span><label>Título<input data-field="titulo" maxlength="140" value="${esc(item.titulo)}"></label><label>Descripción<textarea data-field="descripcion" maxlength="600">${esc(item.descripcion)}</textarea></label><div class="rm-row"><label>Fecha de captura<input data-field="fecha" type="date" value="${esc(item.fecha)}"></label><label>Crédito público<input data-field="autor" maxlength="140" value="${esc(item.autor)}"></label></div><label>Tipo de vista<select data-field="vista"><option value="referencia" ${!item.vista || item.vista === 'referencia' ? 'selected' : ''}>Referencia del lugar</option><option value="aerea" ${item.vista === 'aerea' ? 'selected' : ''}>Vista aérea orientada al lote</option><option value="desde-lote" ${item.vista === 'desde-lote' ? 'selected' : ''}>Captura tomada desde el lote</option></select></label>${item.tipo === 'panorama' ? `<label>Giro inicial de la imagen (0–359°)<input data-field="orientacion" type="number" min="0" max="359" step="1" value="${Number(item.orientacion)||0}"><span class="rm-hint">0° centra el archivo; el giro aumenta hacia la derecha. No es un rumbo geográfico.</span></label>` : ''}<div class="rm-actions"><button type="button" data-action="preview">Ver${item.tipo === 'panorama' ? ' 360°' : ' foto'}</button>${item.tipo === 'foto' ? `<button type="button" data-action="cover" ${bank.portada === item.id ? 'disabled' : ''}>Portada</button>` : ''}<button type="button" data-action="up" aria-label="Mover antes">↑</button><button type="button" data-action="down" aria-label="Mover después">↓</button><button type="button" data-action="remove">Quitar</button></div></article>`).join('');
  }
  async function refresh() {
    if (busy || disposed) return;
    const selected = scope === 'lot' ? selectedLot() : scope === 'project' ? '' : preferredTarget ?? target.value, lots = [...getLots()].sort((a,b)=>(a.label||a.numero||'').localeCompare(b.label||b.numero||'','es',{numeric:true})), identity = getIdentity();
    preferredTarget=null;
    target.innerHTML = `<option value="">Proyecto completo${identity?.nombre ? ' · '+esc(identity.nombre) : ''}</option>` + lots.map(l => `<option value="${esc(l.id)}">${esc(l.label || 'Lote '+l.numero)}${!l.label && l.id ? ' · '+esc(l.id.slice(-6)) : ''}</option>`).join('');
    target.value = lots.some(l => l.id === selected) ? selected : '';
    fieldset.disabled = (scope === 'lot' && !target.value) || !identity?.id || identity.ready === false || Number(getConfig().version)>2;
    if(!fieldset.disabled && status.textContent.startsWith('Guarde el proyecto primero.'))status.textContent='';
    if (fieldset.disabled) status.textContent = 'Guarde el proyecto primero. Los lotes nuevos también deben guardarse para obtener su identidad.';
    const referenceProject = isAlamosReferenceProject(identity) ? identity.id : '';
    if (referenceProject !== mapProject && !mapLoading) {
      mapProject = referenceProject; polygons = [];
      if (referenceProject && scope !== 'project') {
        mapLoading = true;
        try {
          const response = await fetch('/assets/recorridos/alamos/plano-sur.json');
          if (!response.ok) throw Error(); const bytes = await response.arrayBuffer(),data=JSON.parse(new TextDecoder().decode(bytes));
          planoVersion=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
          polygons = data.lots.map(l => ({key:l.m+'-'+l.n,label:`Manzana ${l.m} · Lote ${l.n} · ${l.a} m²`})).sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
          binding.innerHTML = '<option value="">Sin vincular al plano</option>' + polygons.map(p => `<option value="${p.key}">${esc(p.label)}</option>`).join('');
        } catch { status.textContent = 'No se pudo cargar el plano. Puede organizar material; la vinculación al recorrido queda pendiente.'; }
        finally { mapLoading = false; }
      }
    }
    render();
  }
  target.onchange = () => { status.textContent = ''; render(); };
  kind.onchange = render;
  binding.onchange = () => {
    try {
      assertEditable(); const config = getConfig(), key = binding.value;
      if (key && (!polygons.some(p => p.key === key) || Object.entries(config.lotes || {}).some(([id,v]) => id !== target.value && v?.recorrido?.plano?.id === 'alamos' && v.recorrido.plano.lote === key))) throw Error('Ese lote del plano ya está vinculado a otro registro o no existe.');
      updateRecord({plano:key ? {id:'alamos',lote:key,version:planoVersion} : null}); status.textContent = 'Vinculación preparada. Guarde para conservarla.';
    } catch (e) { status.textContent = e.message; render(); }
  };
  confirmBinding.onclick=()=>binding.onchange();
  input.onchange = async () => {
    const files = [...input.files], id = target.value, type = kind.value;
    if (!files.length) return;
    let completed = 0;const reports=[];
    try {
      assertEditable(); const count = list(id).filter(item => item.tipo === type).length;
      if (count + files.length > MEDIA_LIMITS[type].count) throw Error(`Máximo ${MEDIA_LIMITS[type].count} ${type === 'panorama' ? 'panorámicas' : 'fotos'} por destino.`);
      busy = true; fieldset.disabled = true;if(bindingDetails)bindingDetails.inert=true;
      const ready = [], fingerprints = new Set(list(id).map(item => item.sha256Original).filter(Boolean));
      // Validar toda la tanda antes de la primera subida; procesar secuencialmente limita memoria.
      for (const [i,file] of files.entries()) {
        status.textContent = `Validando ${i+1} de ${files.length}: ${file.name}`;
        const info = await inspectMediaFile(file,type);
        if (fingerprints.has(info.sha256Original)) throw Error(`${file.name} ya está agregado en este destino o repetido en la selección.`);
        fingerprints.add(info.sha256Original); ready.push({file,info});
      }
      for (const {file,info} of ready) {
        status.textContent = `${local ? 'Preparando' : 'Subiendo'} ${completed+1} de ${files.length}: ${file.name}`;
        const derivatives=await prepareMediaDerivatives(file,type,info,{onProgress:text=>status.textContent=text}),urls={};
        for(const [variant,part] of [['web',derivatives.web],...(derivatives.alta?[['alta',derivatives.alta]]:[]),['miniatura',derivatives.miniatura]]){
          const result=await upload(part,{lotId:id,tipo:type,variant,projectId:getIdentity().id});
          urls[variant]=mediaURL(typeof result==='string'?result:result?.url,{local});
          if(!urls[variant])throw Error('El banco no devolvió una URL de imagen válida. Las partes subidas se conservan sin asociar.');
        }
        const entry = {id:crypto.randomUUID(),tipo:type,url:urls.web,...(urls.alta?{alta:urls.alta}:{}),miniatura:urls.miniatura,titulo:file.name.replace(/\.[^.]+$/,''),descripcion:'',fecha:'',autor:'',vista:'referencia',orientacion:0,...info};
        reports.push(mediaPreparationLabel(file,derivatives));
        updateRecord({medios:[...list(id),entry]},id); completed++;
      }
      render(); status.textContent = `${completed} archivo${completed === 1 ? '' : 's'} preparado${completed === 1 ? '' : 's'}. ${local ? 'Guarde el borrador local.' : 'Guarde el proyecto para conservar la asociación.'}`+'\n'+reports.join('\n');
    } catch (e) {
      render(); status.textContent = e.message + (completed ? `\nSe conservaron ${completed} archivos completados. Guarde antes de reintentar los restantes.` : '');
    } finally { busy = false; fieldset.disabled = !getIdentity()?.id; input.value = ''; refresh(); }
  };
  root.addEventListener('input', event => {
    const field = event.target.dataset.field, card = event.target.closest('[data-media]');
    if (!field || !card || busy) return;
    try {
      assertEditable(); if (!event.target.validity.valid) { status.textContent = 'Revise el valor ingresado antes de guardar.'; return; }
      updateRecord({medios:list().map(item => item.id === card.dataset.media ? {...item,[field]:field === 'orientacion' ? Number(event.target.value) : event.target.value} : item)});
      status.textContent = 'Cambios preparados; guarde para conservarlos.';
    } catch (e) { status.textContent = e.message; }
  });
  root.addEventListener('click', event => {
    const recovery=event.target.closest('[data-reassign]');
    if(recovery&&!busy){
      try{
        const row=recovery.closest('[data-orphan]'),oldId=row.dataset.orphan,newId=row.querySelector('select').value,config=getConfig();
        const liveIds=new Set(getLots().map(lot=>lot.id));
        recoverOrphanMedia(config,oldId,newId,liveIds,getIdentity(),local);
        if(Object.keys(config.lotes).every(id=>liveIds.has(id)))onRecovery();
        onChange();render();status.textContent='Medios recuperados por selección explícita. Revise el lote y guarde el proyecto.';
      }catch(e){status.textContent=e.message;}
      return;
    }
    const button = event.target.closest('[data-action]'), card = button?.closest('[data-media]');
    if (!card || busy) return;
    try {
      assertEditable(); let items = list(), index = items.findIndex(item => item.id === card.dataset.media); if (index < 0) return;
      const action = button.dataset.action;
      if (action === 'preview') { openMediaViewer([items[index]],{title:target.selectedOptions[0].textContent}); return; }
      if (action === 'remove') items.splice(index,1);
      else if (action === 'cover') { updateRecord({portada:items[index].id,medios:items}); render(); return; }
      else if (action === 'up' || action === 'down') {
        const direction=action==='up'?-1:1;let next=index+direction;
        while(next>=0&&next<items.length&&items[next].tipo!==items[index].tipo)next+=direction;
        if (next < 0 || next >= items.length) return;
        [items[index],items[next]] = [items[next],items[index]];
      }
      updateRecord({medios:items,portada:items.some(item => item.id === record().portada) ? record().portada : null});
      render(); status.textContent = 'Cambios preparados. Los archivos ya subidos se conservan en el banco.';
    } catch (e) { status.textContent = e.message; }
  });
  refresh();
  return {
    refresh,
    rebind(oldIds,newIds){const index=oldIds.indexOf(target.value);if(index>=0)preferredTarget=newIds[index];},
    isBusy:()=>busy,
    assertReady() {
      if (busy) throw Error('Espere a que termine la carga de fotos y panorámicas.');
      const invalid = root.querySelector('input:invalid,textarea:invalid');
      if (invalid) { invalid.focus(); throw Error('Revise los datos del material antes de guardar.'); }
      validateMediaCatalog(getConfig(),{local,projectId:getIdentity()?.id,keys:polygons.length ? new Set(polygons.map(p => p.key)) : undefined,planoVersion:planoVersion || undefined});
      if (!local && JSON.stringify(getConfig()).match(/"(?:blob:|data:|local:)/)) throw Error('No se pueden guardar archivos temporales. Complete la subida al banco.');
    },
    dispose() { disposed = true; }
  };
}

export async function readPublishedMedia(slug,{visitorTour=false}={}) {
  // La vista local nunca importa config.js ni consulta una base remota.
  if (isLocalMediaHost()) return null;
  const {supabase, SUPABASE_URL} = await import('./config.js');
  if (location.hostname === 'staging.surpatagonian.com' && !SUPABASE_URL.includes('rsjwqmpseknvydistgfr.')) throw Error('La configuración de medios no corresponde a QA.');
  const draftReview = visitorTour && terrazasTourQA(slug);
  const withFinancing = visitorTour && slug === 'terrazas-del-piltri';
  const project = supabase.from(draftReview ? 'proyectos' : 'proyectos_publicos_v1')
    .select(withFinancing ? 'id,tema,financiacion' : 'id,tema').eq('slug',slug);
  const result = await (draftReview ? project.eq('id',TERRAZAS_QA_ID).in('estado',['activo','borrador']) : project.eq('estado','activo')).maybeSingle();
  if (result.error) throw Error('No se pudieron consultar los medios del proyecto.');
  if (!result.data) return null;
  const {id,tema} = result.data; let theme;
  try { theme = typeof tema === 'string' ? JSON.parse(tema) : tema; } catch { return null; }
  const config = theme?.miniweb;
  if (config?.recorrido?.proyectoId !== id || (draftReview && (id !== TERRAZAS_QA_ID || !config.recorrido.escena?.enabled))) return null;
  // Lectura tolerante por elemento en mediaList: un archivo roto no oculta otros lotes.
  const {data:lots,error} = await leerInventarioCompleto(supabase,id,'id,numero,superficie_m2,precio_usd,estado,tipo_lote,frente_agua,notas');
  if (error) throw Error('No se pudieron leer las fichas públicas de los lotes.');
  return {config,financing:result.data.financiacion,projectId:id,lots,lotIds:new Set(lots.map(l => l.id))};
}

function localDB() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('sur-recorrido-medios-local',1);
    request.onupgradeneeded = () => request.result.createObjectStore('borradores');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function localMediaDraft(slug) {
  if (!isLocalMediaHost()) throw Error('El borrador local sólo está disponible en esta computadora.');
  const db = await localDB();
  const saved = await new Promise((resolve,reject) => { const tx=db.transaction('borradores'),r=tx.objectStore('borradores').get(slug);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
  db.close();
  let revision=saved?.revision || 0;
  const files = new Map(), replacements = new Map();
  for (const [old,blob] of saved?.files || []) { const url=URL.createObjectURL(blob); files.set(url,blob); replacements.set(old,url); }
  const config = saved?.config ? JSON.parse(JSON.stringify(saved.config),(key,value) => replacements.get(value) || value) : {recorrido:{version:1,proyectoId:'local:'+slug,medios:[]},lotes:{}};
  return {
    config, projectId:'local:'+slug,
    async upload(file) { const url=URL.createObjectURL(file); files.set(url,file); return url; },
    async save(nextConfig=config) {
      const text = JSON.stringify(nextConfig), used=[...files].filter(([url]) => text.includes(url));
      const db = await localDB();
      try { await new Promise((resolve,reject) => { const tx=db.transaction('borradores','readwrite'),store=tx.objectStore('borradores'),prior=store.get(slug);prior.onsuccess=()=>{if((prior.result?.revision||0)!==revision){tx.abort();return;}store.put({config:structuredClone(nextConfig),files:used,revision:revision+1},slug);};tx.oncomplete=()=>{revision++;resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('El borrador cambió en otra pestaña. Reabrilo antes de guardar.')); }); }
      finally { db.close(); }
    },
    dispose() { files.forEach((_,url) => URL.revokeObjectURL(url)); }
  };
}

export function openLocalUploader({draft,slug,lots,onApply}) {
  const dialog = document.createElement('dialog'); dialog.className='rm-viewer rm-workspace';
  dialog.setAttribute('aria-label','Cargador de fotos y panorámicas · borrador local');
  dialog.innerHTML='<header><div><small>Álamos · Vista de trabajo local</small><h2>Materiales del recorrido</h2></div><button type="button" data-close>Cerrar ×</button></header><div data-editor></div><div class="rm-footer"><span role="status">Borrador de este navegador. Sin publicación.</span><button type="button" data-save>Guardar borrador local y ver en el recorrido</button></div>';
  document.body.append(dialog); dialog.showModal();
  const identity={id:draft.projectId,nombre:slug==='alamos'?'Álamos Productivo':slug,slug,ready:true};
  const controller=mountMediaUploader({root:dialog.querySelector('[data-editor]'),getConfig:()=>draft.config,getIdentity:()=>identity,getLots:()=>lots,upload:draft.upload,local:true});
  const save = dialog.querySelector('[data-save]'), close = dialog.querySelector('[data-close]'), status=dialog.querySelector('.rm-footer [role=status]');
  dialog.addEventListener('cancel',event => {if(controller.isBusy()){event.preventDefault();status.textContent='Espere a que termine la carga antes de cerrar.';}});
  close.onclick=()=>{if(controller.isBusy())status.textContent='Espere a que termine la carga antes de cerrar.';else dialog.close();};
  save.onclick=async()=>{
    try { controller.assertReady();save.disabled=true;close.disabled=true;await draft.save();onApply?.();dialog.close(); }
    catch(e){status.textContent='No se pudo guardar el borrador: '+e.message;}
    finally{save.disabled=false;close.disabled=false;}
  };
  dialog.addEventListener('close',()=>{controller.dispose();dialog.remove();},{once:true});
  return dialog;
}
