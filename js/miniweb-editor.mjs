import {mountSalesZones} from './zonas-venta-editor.mjs?v=20261117-cierre-venta1';
import {salesZones} from './zonas-venta.mjs?v=20261114-anillo7b';
import {imageLots} from './recorrido-grilla.mjs?v=20261116-plano6';
import {isAlamosReferenceProject} from './recorrido-enlaces.mjs';
import {inventarioLotes,proyectarParcelas,dibujarPlano} from './lotes-inventario.mjs?v=20261110-plano2';
import {DESIGN_STYLES,renderDesignChoices,previewStyleChange} from './miniweb-design.mjs?v=20261117-cierre-venta1';
import {MINIWEB_PALETTES} from './miniweb-palettes.mjs';
import {ALAMOS_RENDERS,REGIONAL_PHOTOS} from './miniweb-media.mjs';
import {STYLES,parseTheme,normalizeMiniweb,safeUrl,mountMiniweb,tourMapGeometry} from './miniweb.mjs?v=20261117-cierre-venta1';
import {mountMediaUploader,assertLotMediaIdentity,prepareMediaDerivatives} from './recorrido-medios.mjs?v=20261116-reasociar';
// The existing project RPC persists tema. Only presentation/media URLs live here;
// lot prices, state, geometry and attribution continue in their existing model.
let inventory,zonesEditor;
let originalTheme={},config=normalizeMiniweb(),editor,mediaEditor,legacyPanel,recorridoUploader,lotUploader,mediaDrafts=new Map();
let hasAppliedComposition=false,resetEditorSession;
let mediaRebindPending=false,removedLotIds=()=>new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys={estilo:DESIGN_STYLES.map(s=>[s.id,s.name]),paleta:MINIWEB_PALETTES.map(p=>[p.id,p.nombre])};
const labels={estilo:'Estilo visual',paleta:'Paleta de colores'};
export function setupMiniwebEditor({uploadImage,uploadRecorrido,getIdentity,getProject,saveProject,getRemovedLotIds,isReady=()=>true}={}){
 if(getRemovedLotIds)removedLotIds=getRemovedLotIds;
 editor=document.createElement('div');editor.className='form-bloque';editor.id='miniweb-config';
 editor.innerHTML=`<h4 class="form-bloque-titulo">Diseño de la miniweb</h4><p class="mw-help">Elija una base y una paleta. Organice el contenido desde el editor: cada sección tiene su orden, visibilidad y formato.</p><label class="mw-enable"><input type="checkbox" id="miniweb-enabled" checked> Usar el creador por bloques</label><div class="form-grid-2" hidden>${Object.entries(keys).map(([k,options])=>`<div class="form-grupo"><label for="mw-${k}">${labels[k]}</label><select id="mw-${k}">${options.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></div>`).join('')}</div><div data-visual-choices></div><p id="mw-style-desc" class="mw-help" hidden></p><div class="mw-composition-summary" aria-label="Composición de la página"></div>`;
 legacyPanel=document.querySelector('#panel-media .form-bloque');
 document.querySelector('#panel-miniweb').append(editor);
 const blocksButton=document.createElement('button');blocksButton.type='button';blocksButton.className='btn-secundario';blocksButton.textContent='Organizar secciones y ver la miniweb';editor.append(blocksButton);
 const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.style='margin-top:12px;font-size:.85rem';editor.append(feedback);
 const styleHistory=[];const undoStyle=document.createElement('button');undoStyle.type='button';undoStyle.className='btn-secundario';undoStyle.textContent='Deshacer cambio de plantilla';undoStyle.hidden=true;editor.append(undoStyle);undoStyle.onclick=()=>{if(!styleHistory.length)return;config=styleHistory.pop();sync();undoStyle.hidden=!styleHistory.length;document.dispatchEvent(new Event('miniweb-change'));feedback.textContent='Cambio de plantilla deshecho. Guarde el proyecto para conservarlo.'};
 let closeCreator;
 resetEditorSession=()=>{
  document.dispatchEvent(new Event('miniweb-close-style-preview'));
  closeCreator?.();
  styleHistory.length=0;
  undoStyle.hidden=true;
 };
 const openBlocks=async(proposedStyle)=>{
  const existing=document.querySelector('dialog[data-miniweb-creator][open]');
  if(existing){existing.querySelector('iframe')?.focus();return}
  if(!isReady()){feedback.textContent='Espere a que termine de cargar el proyecto.';return}
  if(Number(originalTheme.miniweb?.version)>2){feedback.textContent='Esta miniweb utiliza una versión posterior. Se conserva sin modificar.';return}
  capture();captureMedia();
  let data;try{data=getProject?.()}catch(error){feedback.textContent=error.message||'Revise los datos del proyecto antes de abrir la miniweb.';return}if(data){data.proyecto.banco_regional=REGIONAL_PHOTOS;data.proyecto.media_bank=isAlamosReferenceProject(data.proyecto)?ALAMOS_RENDERS:[]}if(!data){feedback.textContent='No se pudo leer el proyecto.';return}
  if(proposedStyle){
   previewStyleChange({config,style:proposedStyle,project:data.proyecto,lots:data.lotes,onConfirm:next=>{
    styleHistory.push(structuredClone(config));undoStyle.hidden=false;config=next;sync();document.dispatchEvent(new Event('miniweb-change'));
    feedback.textContent='Estilo cambiado. Sus secciones se conservan. Guarde el proyecto para conservar el cambio.';
   }});return;
  }
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Editor de bloques');dialog.dataset.miniwebCreator='';dialog.style='width:100vw;max-width:none;height:100svh;max-height:none;margin:0;padding:0;border:0;background:#0d1014;color:#fff';
  dialog.innerHTML='<iframe title="Editor visual de miniwebs" src="/admin/miniweb-editor.html?v=20261117-cierre-venta1" style="width:100%;height:100%;border:0;display:block"></iframe>';
  document.body.append(dialog);dialog.showModal();const frame=dialog.querySelector('iframe');let closed=false;
  const ownerId=getIdentity?.()?.id;
  const close=()=>{closed=true;closeCreator=null;window.removeEventListener('message',receive);dialog.close();dialog.remove()};
  closeCreator=close;
  const receive=async e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||closed)return;const msg=e.data;
   if(msg.type==='mw-ready')frame.contentWindow.postMessage({type:'mw-init',tourEditor:!!(uploadRecorrido&&getIdentity),project:data.proyecto,lots:data.lotes,config:structuredClone(config),proposedStyle},location.origin);
   if(msg.type==='mw-open-tour'&&uploadRecorrido&&getIdentity){
    try{const {openCreatorTour}=await import('./recorrido-constructor.mjs?v=20261124-paseo');if(!closed)openCreatorTour({frame,config:msg.config,identity:getIdentity(),lots:data.lotes.filter(l=>l.origen_id),upload:uploadRecorrido,mapImage:data.proyecto.mapa_imagen_url});}
    catch{frame.contentWindow?.postMessage({type:'mw-tour-result',error:'No se pudo abrir el editor de recorridos.'},location.origin);}
   }
   if(msg.type==='mw-cancel')close();
   if(msg.type==='mw-upload'){
    const reply=result=>{if(!closed)frame.contentWindow?.postMessage({type:'mw-upload-result',id:msg.id,...result},location.origin)};
    try{
     if(!uploadImage||!(msg.file instanceof File)||!/^image\/(jpeg|png|webp)$/.test(msg.file.type))throw Error('Seleccioná una imagen JPG, PNG o WebP.');
     if(msg.tipo==='panorama'){
      const parts=await prepareMediaDerivatives(msg.file,'panorama'),panorama={};
      for(const variant of ['web','alta','miniatura']){
       if(closed||getIdentity?.()?.id!==ownerId)throw Error('El proyecto cambió durante la carga.');
       const url=safeUrl(await uploadImage(parts[variant],'miniweb/'+variant,{conservarOriginal:true,marcarCambio:false}));
       if(!url)throw Error('La subida no devolvió una dirección válida. La panorámica anterior se conserva.');
       panorama[variant]=url;
      }
      reply({panorama});
     }else reply({url:await uploadImage(msg.file,'miniweb')});
    }catch(error){reply({error:error.message||'No se pudo subir la imagen.'})}
   }
   if(msg.type==='mw-apply'){const next=msg.config;if(!next||JSON.stringify(next).match(/"(?:blob:|local:)/)){feedback.textContent='Espere a que termine la subida de imágenes.';return}styleHistory.push(structuredClone(config));undoStyle.hidden=false;config=normalizeMiniweb(next);hasAppliedComposition=true;sync();document.dispatchEvent(new Event('miniweb-change'));close();if(['panel-media','panel-lotes','panel-mapa'].includes(msg.panel))document.querySelector('[data-panel="'+msg.panel+'"]')?.click();feedback.textContent='Cambios aplicados. Guarde el proyecto para conservarlos.'}
  };
  window.addEventListener('message',receive);dialog.addEventListener('cancel',e=>{e.preventDefault();frame.contentWindow.postMessage({type:'mw-request-cancel'},location.origin)});

 };

 blocksButton.onclick=()=>openBlocks();
 editor.addEventListener('click',event=>{const b=event.target.closest('[data-visual-style],[data-visual-palette]');if(!b||Number(originalTheme.miniweb?.version)>2)return;if(b.dataset.visualStyle){openBlocks(b.dataset.visualStyle);return}if(b.dataset.visualPalette)config.paleta=b.dataset.visualPalette;sync();document.dispatchEvent(new Event('miniweb-change'));editor.querySelector(b.dataset.visualStyle?`[data-visual-style="${b.dataset.visualStyle}"]`:`[data-visual-palette="${b.dataset.visualPalette}"]`)?.focus({preventScroll:true})});
 editor.querySelectorAll('select,input').forEach(el=>el.addEventListener('change',()=>{capture();sync();document.dispatchEvent(new Event('miniweb-change'))}));
 mediaEditor=document.createElement('div');mediaEditor.className='form-bloque';mediaEditor.hidden=true;mediaEditor.id='inv-media';mediaEditor.innerHTML=`<input type="hidden" id="mw-lot"><p id="inv-unsaved" hidden>Guardá el proyecto para agregar fotos a este lote.</p>
 <div id="mw-media-fields" hidden><label class="inv-visible"><input type="checkbox" id="mw-lot-visible"> Mostrar la ficha en el recorrido 360°</label>
 <div data-lot-uploader></div><details><summary>Enlaces de fotos o de un recorrido externo</summary>
 <label for="mw-lot-photos">Fotos del lote, una URL por línea</label><textarea id="mw-lot-photos" rows="3"></textarea>
 <label for="mw-lot-tour">Enlace a la vista 360</label><input id="mw-lot-tour" type="url"></details>
 <p id="mw-media-feedback" role="status"></p></div>`;

 document.querySelector('#panel-lotes .form-bloque').after(mediaEditor);
 const visibility=mediaEditor.querySelector('.inv-visible');document.querySelector('#inv-fields').append(visibility);mediaEditor.after(document.getElementById('inv-remove'));

 document.addEventListener('proyecto-cargado',async()=>{
   if(!isAlamosReferenceProject(getIdentity?.())||document.querySelector('#alamos-parcelas-lotes'))return;
   const section=document.createElement('section');section.className='form-bloque';section.id='alamos-parcelas-lotes';document.querySelector('#inv-tools').before(section);
   try {
     const {mountAlamosDirectory}=await import('./recorrido-alamos-fichas.mjs?v=20261117-cierre-venta1');
     await mountAlamosDirectory(section,{getConfig:()=>config,onEdit(row){
       inventory.open(row);
     },onPlan:()=>window._usarPlanoParcelasAlamos(),onAdd(parcel,estado,version,enBloque){
       window.agregarLote({numero:parcel.name,superficie_m2:parcel.area,estado},enBloque);
       const row=document.getElementById('lotesBody').lastElementChild;
       row.dataset.planoX=parcel.x;row.dataset.planoY=parcel.y;
       row.dataset.parcelaPendiente=parcel.key;row.dataset.planoVersion=version;
       config.recorrido={...config.recorrido,version:1,proyectoId:getIdentity().id};
       if(!enBloque)inventory.open(row);
     }});
   } catch{section.textContent='No se pudo abrir el catálogo del plano de Álamos.';}
 });

 mediaEditor.querySelector('#mw-lot').onchange=()=>{showLot();lotUploader?.refresh();};
 document.getElementById('mw-lot-visible').onchange=e=>{
   const id=mediaEditor.querySelector('#mw-lot').value;
   if (!id) return;
   config.lotes[id]={...config.lotes[id],fichaEnRecorrido:e.target.checked};
   document.dispatchEvent(new Event('miniweb-change'));
 };
 inventory=inventarioLotes({media:mediaEditor,getMedia:id=>config.lotes?.[id],canLeave:()=>{if(!lotUploader?.isBusy()&&!mediaEditor.querySelector('#mw-lot-upload')?.disabled)return true;mediaEditor.querySelector('#mw-media-feedback').textContent='Esperá a que termine la carga.';return false;},onSelect:row=>{
   mediaEditor.querySelector('#mw-lot').value=row?.dataset.origenId||'';showLot();lotUploader?.refresh();
   document.getElementById('inv-orphan-shape')?.remove();const id=row?.dataset.origenId,key=row?.dataset.elementoPendiente||config.lotes[id]?.elementoRecorrido;
   if(key&&!config.recorrido?.escena?.features?.some(f=>f.kind==='lot'&&f.id===key)){
     const repair=document.createElement('button');repair.id='inv-orphan-shape';repair.type='button';repair.className='btn-secundario';repair.textContent='Quitar vínculo con el contorno que ya no está';document.getElementById('inv-connection').append(repair);
     repair.onclick=()=>{delete row.dataset.elementoPendiente;if(config.lotes[id])delete config.lotes[id].elementoRecorrido;repair.remove();document.dispatchEvent(new Event('miniweb-change'));};
   }

 }});
 zonesEditor=mountSalesZones({host:document.getElementById('inv-tools').parentElement,getConfig:()=>config,setSettings:value=>{config.recursos={...config.recursos,zonasVenta:value};document.dispatchEvent(new Event('miniweb-change'));},getRows:()=>[...document.querySelectorAll('#lotesBody tr')],getZone:getLotSalesZone,setZone:setLotSalesZone,safeUrl,isReady:()=>isReady()});
 if(uploadImage&&!uploadRecorrido){const upload=document.createElement('input');upload.type='file';upload.accept='image/*';upload.multiple=true;upload.id='mw-lot-upload';const label=document.createElement('label');label.className='btn-upload';label.htmlFor=upload.id;label.textContent='Subir fotos de este lote';label.style='display:inline-flex;margin:16px 0;cursor:pointer';upload.style='display:none';mediaEditor.querySelector('#mw-media-fields').prepend(label,upload);upload.onchange=async()=>{const id=mediaEditor.querySelector('#mw-lot').value;if(!id)return;const existing=config.lotes[id]?.fotos||[],files=[...upload.files];if(files.length+existing.length>20){mediaEditor.querySelector('#mw-media-feedback').textContent='Máximo 20 fotos por lote.';return}upload.disabled=true;mediaEditor.querySelectorAll('select,textarea,input[type=url]').forEach(el=>el.disabled=true);label.textContent='Subiendo fotos…';try{const uploaded=[];for(const file of files){uploaded.push(await uploadImage(file,id));config.lotes[id]={...config.lotes[id],fotos:[...existing,...uploaded]}}showLot();mediaEditor.querySelector('#mw-media-feedback').textContent='Fotos subidas. Guarde el proyecto para asociarlas al lote.'}catch{showLot();mediaEditor.querySelector('#mw-media-feedback').textContent='No se pudieron subir todas las fotos. Las completadas se conservaron; guarde el proyecto antes de reintentar las restantes.'}finally{upload.disabled=false;mediaEditor.querySelectorAll('select,textarea,input[type=url]').forEach(el=>el.disabled=false);document.dispatchEvent(new Event('miniweb-change'));label.textContent='Subir fotos de este lote';upload.value=''}}}
 for(const id of ['mw-lot-photos','mw-lot-tour'])mediaEditor.querySelector('#'+id).addEventListener('input',captureMedia);
 new MutationObserver(refreshLots).observe(document.getElementById('lotesBody'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-origen-id']});
 document.addEventListener('proyecto-cargado',()=>{refreshLots();try{assertLotMediaIdentity(config,new Set(liveLots().map(l=>l.id)),removedLotIds())}catch(error){editor.querySelector('[role=status]').textContent=error.message}});
 if(uploadRecorrido&&getIdentity){
  const entry=document.createElement('section');entry.className='form-bloque';
  entry.innerHTML='<h4 class="form-bloque-titulo">Cargar el loteo</h4><p>Prepará los lotes y la foto desde arriba. Las fotos 360 son opcionales; podés guardar y seguir después.</p><div class="inv-actions"><button type="button" class="btn-secundario">Cargar el loteo</button><button type="button" data-inventario class="btn-secundario">Ver inventario</button></div><p role="status"></p>';
  const make=document.createElement('button');make.type='button';make.className='btn-secundario';make.textContent='Crear mapa de la miniweb con estas parcelas';make.hidden=true;entry.querySelector('.inv-actions').append(make);
  const mapInputs=()=>{const rows=[...document.querySelectorAll('#lotesBody tr')];return {scene:config.recorrido?.escena,links:rows.map(r=>({id:r.dataset.origenId,key:config.lotes[r.dataset.origenId]?.elementoRecorrido}))};};
  const canMap=()=>{const {scene,links}=mapInputs();return !isAlamosReferenceProject(getIdentity())&&window._isMlCargado?.()&&!window._getMlProject?.().mapa_imagen_url&&!Object.keys(window._getMlPos?.()||{}).length&&!!scene?.features?.length&&links.length&&links.every(l=>l.id&&l.key);};
  const info=document.createElement('p');info.hidden=true;entry.append(info);
  const mapButton=()=>{make.hidden=!canMap();const u=window._getMlProject?.()?.mapa_imagen_url||'';const scene=config.recorrido?.escena,vector=scene?.planoActivo==='vectorial'&&!isAlamosReferenceProject(getIdentity())&&getIdentity().slug!=='aldea-los-huemules',photo=vector&&tourMapGeometry(scene)?.hasPhoto;info.hidden=!vector&&(!/plano-parcelas(?:\.|_)/.test(u)||isAlamosReferenceProject(getIdentity()));info.textContent=vector?[!photo?'Este plano no tiene foto ubicada. Cargá la foto desde arriba en el paso 2 para verla de fondo.':'',scene.imagePlan?'Está activo el plano DXF. Los lotes que sólo tienen calco se conservan en la lista, sin dibujarlos sobre este plano. Para volver al calco, abrí Cargar el loteo, elegí No tengo plano y guardá.':''].filter(Boolean).join(' '):info.hidden?'':'Planta generada desde el plano. Si cambiás los contornos, revisá la imagen y la ubicación de los lotes.';};document.addEventListener('mapa-listo',mapButton);document.addEventListener('miniweb-change',mapButton);new MutationObserver(mapButton).observe(document.getElementById('lotesBody'),{subtree:true,attributes:true,attributeFilter:['data-origen-id'],childList:true});
  make.onclick=async()=>{const status=entry.querySelector('[role=status]');make.disabled=true;try{
    if(!canMap())throw Error('Guardá primero los lotes y vinculá sus contornos.');const {scene,links}=mapInputs(),sig=JSON.stringify([scene.features,links]);
    const plan=proyectarParcelas(scene.features,links),file=await dibujarPlano(plan);
    await window._crearMapaDeParcelas(file,plan.pins,()=>{const now=mapInputs();return canMap()&&JSON.stringify([now.scene?.features,now.links])===sig;});
    status.textContent=plan.pins.length+' lotes ubicados. Guardá los cambios.';mapButton();
   }catch(e){status.textContent=e.message;}finally{make.disabled=false;}};
  entry.querySelector('[data-inventario]').onclick=()=>document.querySelector('[data-panel=panel-lotes]').click();
  document.querySelector('#panel-mapa').prepend(entry);
  import('./recorrido-constructor.mjs?v=20261124-paseo').then(({materialsGuide})=>{const g=materialsGuide();g.open=false;entry.append(g);}).catch(()=>{});
  entry.querySelector('button').onclick=async()=>{
   const feedback=entry.querySelector('[role=status]');try{
    const {editScene}=await import('./recorrido-constructor.mjs?v=20261124-paseo');
    const id=getIdentity();
    if(!id.ready)throw Error('Esperá a que termine de cargar el proyecto.');
    const data=getProject();
    if(data.lotes.some(l=>!l.origen_id))throw Error('Hay lotes nuevos pendientes de guardar. Guardá el proyecto antes de abrir el cargador.');
    editScene({config,identity:id,upload:uploadRecorrido,lots:data.lotes.filter(l=>l.origen_id),mapImage:data.proyecto.mapa_imagen_url,persist:!!saveProject,onApply:async(next,{inventory:parcels=[],persist=false,retired=[],lotUpdates=[]}={})=>{
     if(getIdentity().id!==id.id)throw Error('Cambió el proyecto activo. Volvé a abrir el recorrido.');
     const fields={superficie_m2:'.l-sup',precio_usd:'.l-precio',estado:'.l-estado',notas:'.l-notas',tipo_lote:'.l-tipo',frente_agua:'.l-agua'};
     const updates=lotUpdates.map(update=>{const row=[...document.querySelectorAll('#lotesBody tr')].find(r=>r.dataset.origenId===update.id);if(!row)throw Error('Falta una ficha de la planilla. Volvé a cargar el proyecto antes de guardar.');return {...update,row};});
     // El cargador trabaja sobre una copia. Sólo confirmar Guardar pasa las
     // parcelas revisadas al mismo inventario y a su RPC habitual.
     // Retired faces were explicitly reviewed in the loader. Use the panel's
     // reversible removal, so its ordinary orphan guard and rebind stay in charge.
     const retiredIds=new Set(retired.map(f=>f.id));
     if(retiredIds.size&&imageLots(next.recorrido?.escena?.imagePlan).some(f=>retiredIds.has(f.id)))throw Error('La unión todavía conserva un lote que iba a retirarse. Revisala antes de guardar.');
     for(const row of [...document.querySelectorAll('#lotesBody tr')]){
       const key=row.dataset.imagenPendiente||next.lotes[row.dataset.origenId]?.elementoImagen;
       if(!retiredIds.has(key))continue;
       window.eliminarLote(row.querySelector('.btn-del-lote'));
       delete next.lotes[row.dataset.origenId];
     }
     for(const f of parcels){
       const rows=[...document.querySelectorAll('#lotesBody tr')];
       const image=f.source==='image',pendingKey=image?'imagenPendiente':'elementoPendiente',bindingKey=image?'elementoImagen':'elementoRecorrido';
       if(rows.some(row=>(row.dataset[pendingKey]||next.lotes[row.dataset.origenId]?.[bindingKey])===f.id))continue;
       const row=window.agregarLote({numero:f.name,estado:'',...Object.fromEntries(Object.entries(f.lotData||{}).filter(([key])=>Object.hasOwn(fields,key)))},true);row.dataset[pendingKey]=f.id;
       if(f.lotData?.zonaVenta)row.dataset.zonaVentaPendiente=f.lotData.zonaVenta;
     }
     for(const {row,patch}of updates){for(const [key,selector]of Object.entries(fields))if(Object.hasOwn(patch,key)){const field=row.querySelector(selector);if(key==='frente_agua')field.checked=patch[key];else field.value=patch[key];}if(Object.hasOwn(patch,'zonaVenta'))row.dataset.zonaVentaPendiente=patch.zonaVenta;row.dispatchEvent(new Event('input',{bubbles:true}));}
     if(parcels.length){document.getElementById('cantidad_lotes').value=document.getElementById('lotesBody').rows.length;document.getElementById('lotesBody').dispatchEvent(new Event('input',{bubbles:true}));}
     for(const row of document.querySelectorAll('#lotesBody tr')){const key=row.dataset.imagenPendiente||next.lotes[row.dataset.origenId]?.elementoImagen;const f=imageLots(next.recorrido?.escena?.imagePlan).find(f=>f.id===key);if(f&&row.querySelector('.l-numero').value!==f.name){row.querySelector('.l-numero').value=f.name;row.dispatchEvent(new Event('input',{bubbles:true}));}}
     config.recorrido=structuredClone(next.recorrido);config.lotes=structuredClone(next.lotes);document.dispatchEvent(new Event('miniweb-change'));
     if(persist){
       const result=await saveProject();
       if(!result?.ok){feedback.textContent='Los cambios siguen en el panel; el guardado no se completó.';throw Error('No se completó el guardado. Tus cambios siguen en el panel del proyecto. Podés seguir revisando o volver al proyecto para ver el aviso.');}
       feedback.textContent='Preparación guardada. Podés volver al cargador para continuar.';
     }else feedback.textContent='Recorrido preparado. Guardá los cambios del proyecto.';
    }});
   }catch(error){feedback.textContent=error.message;}
  };
  const mediaRoot=document.createElement('section');mediaRoot.className='form-bloque';mediaRoot.id='recorrido-media-editor';document.querySelector('#panel-media').append(mediaRoot);
  const uploaderOptions = {getConfig:()=>config,getIdentity,getLots:liveLots,upload:uploadRecorrido,
    onRecovery:()=>{mediaRebindPending=false;globalThis.localStorage.removeItem(rebindKey(getIdentity().id));showMediaRetry(null);},
    onChange:()=>{showLot();document.dispatchEvent(new Event('miniweb-change'))}};
  recorridoUploader=mountMediaUploader({...uploaderOptions,root:mediaRoot,scope:'project'});
  lotUploader=mountMediaUploader({...uploaderOptions,root:mediaEditor.querySelector('[data-lot-uploader]'),scope:'lot',linkRoot:document.getElementById('inv-connection'),selectedLot:()=>mediaEditor.querySelector('#mw-lot').value});
 }
 const intro=document.querySelector('#panel-mapa #mapa_activo + p');if(intro)intro.textContent='Mapa de la miniweb: ubicá los lotes sobre una imagen. Si la cambiás, vas a tener que reubicarlos.';
 const box=document.getElementById('inv-plan-import');
 function importState(){
   const rows=[...document.querySelectorAll('#lotesBody tr')];
   const ids=new Set(rows.map(r=>r.dataset.elementoPendiente||config.lotes[r.dataset.origenId]?.elementoRecorrido));
   const missing=(config.recorrido?.escena?.features||[]).filter(f=>f.kind==='lot'&&!ids.has(f.id));
   const key=n=>n.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
   const names=missing.map(f=>key(f.name));
   const existingNames=new Set(rows.map(r=>key(r.querySelector('.l-numero').value)));
   const ready=!names.some(n=>existingNames.has(n))&&!ids.has(undefined)&&!ids.has('')&&new Set(names).size===names.length&&missing.every(f=>/^manzana\s+\S+(?:\s+\S+)*?\s*[·,–-]?\s+lote\s+\S+(?:\s+\S+)*$/i.test(f.name.trim()));
   return {rows,missing,ready,duplicado:names.some(n=>existingNames.has(n))||new Set(names).size!==names.length};
 }
 function importBox(){
   const {rows,missing,ready,duplicado}=importState();box.replaceChildren();box.hidden=isAlamosReferenceProject(getIdentity?.())||(!missing.length&&!!rows.length);if(box.hidden)return;
   const note=document.createElement('p'),b=document.createElement('button');b.type='button';b.className='btn-secundario';
   if(missing.length&&ready){note.textContent=missing.length+' parcelas identificadas en el plano.';b.textContent='Incorporar al inventario';b.onclick=()=>{
     const fresh=importState();if(!fresh.ready||!fresh.missing.length){importBox();return;}
     for(const f of fresh.missing){const r=window.agregarLote({numero:f.name,estado:''},true);r.dataset.elementoPendiente=f.id;}
     document.getElementById('cantidad_lotes').value=document.getElementById('lotesBody').rows.length;document.getElementById('lotesBody').dispatchEvent(new Event('input',{bubbles:true}));importBox();
   };}else{note.textContent=missing.length?(duplicado?'Hay nombres repetidos. Revisá el plano antes de incorporar parcelas.':'Usá «Manzana 1 · Lote 2» para identificar cada parcela y vinculá los lotes ya cargados.'):'¿Tenés el plano del loteo? Podés empezar por sus parcelas.';b.textContent='Ir al plano';b.onclick=()=>document.getElementById('tabMapa').click();}
   box.append(note,b);
 }
 document.addEventListener('proyecto-cargado',importBox);document.addEventListener('miniweb-change',importBox);new MutationObserver(importBox).observe(document.getElementById('lotesBody'),{childList:true});document.querySelector('[data-panel=panel-lotes]').addEventListener('click',importBox);
 importBox();sync();refreshLots();
}
function capture(){if(Number(originalTheme.miniweb?.version)>2)return;for(const k of Object.keys(keys))config[k]=editor.querySelector('#mw-'+k).value}
function sync(){editor.querySelector('[data-visual-choices]').innerHTML=renderDesignChoices(config,{nombre:document.getElementById('nombre')?.value,foto_portada:document.getElementById('foto_portada')?.value});const styleSelect=editor.querySelector('#mw-estilo');if(![...styleSelect.options].some(o=>o.value===config.estilo)){const legacy=document.createElement('option');legacy.value=config.estilo;legacy.textContent=(STYLES.find(s=>s.id===config.estilo)?.name||config.estilo)+' (versión anterior)';styleSelect.append(legacy)}for(const k of Object.keys(keys))editor.querySelector('#mw-'+k).value=config[k];editor.querySelector('#mw-style-desc').textContent=STYLES.find(s=>s.id===config.estilo)?.description||'';legacyPanel.hidden=editor.querySelector('#miniweb-enabled').checked;editor.querySelector('.mw-composition-summary').textContent='Portada → '+config.bloques.filter(b=>b.activo&&!['portada','comercializacion'].includes(b.tipo)).length+' secciones activas → Inmobiliarias y profesional'}
function liveLots(){return [...document.querySelectorAll('#lotesBody tr')].filter(tr=>tr.dataset.origenId).map(tr=>({id:tr.dataset.origenId,numero:tr.querySelector('.l-numero').value,superficie_m2:tr.querySelector('.l-sup').value,
 precio_usd:tr.querySelector('.l-precio').value, estado:tr.querySelector('.l-estado').value,
 frente_agua:tr.querySelector('.l-agua').checked, notas:tr.querySelector('.l-notas').value}))}
function refreshLots(){if(!mediaEditor)return;mediaEditor.querySelector('#mw-lot').value=inventory?.active()?.dataset.origenId||'';inventory?.refresh();showLot();recorridoUploader?.refresh();lotUploader?.refresh()}
function showLot(){const id=mediaEditor.querySelector('#mw-lot').value;mediaEditor.querySelector('#inv-unsaved').hidden=!!id;mediaEditor.querySelector('#mw-media-fields').hidden=!id;const value=config.lotes[id]||{},draft=mediaDrafts.get(id);document.getElementById('mw-lot-visible').closest('label').hidden=!id;document.getElementById('mw-lot-visible').checked=value.fichaEnRecorrido!==false;mediaEditor.querySelector('#mw-lot-photos').value=draft?.photos??(value.fotos||[]).join('\n');mediaEditor.querySelector('#mw-lot-tour').value=draft?.tour??value.tour360??'';mediaEditor.querySelector('#mw-media-feedback').textContent=draft?'Hay cambios de medios pendientes de corregir.':''}
function captureMedia(){
 const id=mediaEditor.querySelector('#mw-lot').value;if(!id||Number(originalTheme.miniweb?.version)>2)return;
 const urls=mediaEditor.querySelector('#mw-lot-photos').value.split('\n').map(s=>s.trim()).filter(Boolean),tour=mediaEditor.querySelector('#mw-lot-tour').value.trim();
 const invalid=urls.some(u=>!safeUrl(u))||(tour&&!safeUrl(tour))||urls.length>20;
 mediaEditor.querySelector('#mw-media-feedback').textContent=invalid?'Hay una URL no válida o más de 20 fotos. Corrija antes de guardar.':'Cambios preparados; guarde el proyecto para conservarlos.';
 if(invalid){mediaDrafts.set(id,{photos:mediaEditor.querySelector('#mw-lot-photos').value,tour});return;}
 mediaDrafts.delete(id);const lot={...config.lotes[id],fotos:urls.map(safeUrl),tour360:safeUrl(tour)};
 if(lot.recorrido?.medios){const photos=new Set(lot.fotos);const medios=lot.recorrido.medios.filter(item=>item.tipo!=='foto'||photos.has(safeUrl(item.url)));lot.recorrido={...lot.recorrido,medios,portada:medios.some(item=>item.id===lot.recorrido.portada)?lot.recorrido.portada:null};}
 config.lotes[id]=lot;lotUploader?.refresh();
}
export const getSalesZoneState=()=>salesZones(config);
export function getLotSalesZone(row){return Object.hasOwn(row.dataset,'zonaVentaPendiente')?row.dataset.zonaVentaPendiente:config.lotes?.[row.dataset.origenId]?.zonaVenta||'';}
export function setLotSalesZone(row,id){
 if(id&&!salesZones(config).zonas.some(z=>z.id===id))throw Error('La zona elegida ya no existe.');
 row.dataset.zonaVentaPendiente=id;
 const uuid=row.dataset.origenId;
 if(uuid){const card={...config.lotes[uuid]};if(id)card.zonaVenta=id;else delete card.zonaVenta;config.lotes[uuid]=card;}
 document.dispatchEvent(new Event('miniweb-change'));
}
export function loadMiniwebTheme(tema,{duplicar=false,rebind}={}){resetEditorSession?.();if(rebind)recorridoUploader?.rebind(rebind.oldIds,rebind.newIds);originalTheme=parseTheme(tema);hasAppliedComposition=false;mediaDrafts.clear();config=normalizeMiniweb(originalTheme.miniweb);zonesEditor?.clearPending();if(duplicar){config.lotes={};delete config.recorrido}if(editor){editor.querySelector('[role=status]').textContent='';editor.querySelector('#miniweb-enabled').checked=!!originalTheme.miniweb&&originalTheme.miniweb.activa!==false;sync();refreshLots()}}
export function mergeMiniwebTheme(visual){
 if(mediaRebindPending)throw Error('Hay una vinculación de medios pendiente. Use Reintentar vinculación antes de volver a guardar.');
 recorridoUploader?.assertReady();lotUploader?.assertReady();
 if(mediaEditor?.querySelector('#mw-lot-upload')?.disabled)throw Error('Espere a que termine la subida de fotos del lote antes de guardar.');
 if(Number(originalTheme.miniweb?.version)>2)return {...originalTheme,...visual,miniweb:originalTheme.miniweb};
 capture();
 const existing=new Set(liveLots().map(l=>l.id));
 assertLotMediaIdentity(config,existing,removedLotIds());
 const parcelKeys=new Set();
 for(const row of document.querySelectorAll('#lotesBody tr')){
   const key=row.dataset.parcelaPendiente || config.lotes[row.dataset.origenId]?.recorrido?.plano?.lote;
   if(key && parcelKeys.has(key))throw Error('Dos filas apuntan a la misma parcela del plano. Revisá la vinculación en Lotes.');
   if(key)parcelKeys.add(key);
   const image=row.dataset.imagenPendiente||config.lotes[row.dataset.origenId]?.elementoImagen;
   if(image){if(parcelKeys.has('imagen:'+image)||!imageLots(config.recorrido?.escena?.imagePlan).some(f=>f.id===image))throw Error('Revisá los vínculos de los lotes del calco antes de guardar.');parcelKeys.add('imagen:'+image);}
   const elem=row.dataset.elementoPendiente||config.lotes[row.dataset.origenId]?.elementoRecorrido;
   if(elem){if(parcelKeys.has('escena:'+elem)||!config.recorrido?.escena?.features?.some(f=>f.kind==='lot'&&f.id===elem))throw Error('Revisá los vínculos de las parcelas antes de guardar.');parcelKeys.add('escena:'+elem);}
 }
 if([...mediaDrafts.keys()].some(id=>existing.has(id)))throw Error('Hay URLs de fotos o 360 sin corregir en un lote. Revise sus medios antes de guardar.');
 const urls=mediaEditor.querySelector('#mw-lot-photos').value.split('\n').map(s=>s.trim()).filter(Boolean),tour=mediaEditor.querySelector('#mw-lot-tour').value.trim();
 if(urls.some(u=>!safeUrl(u))||(tour&&!safeUrl(tour))||urls.length>20)throw Error('Corrija las URLs de fotos o de la vista 360 del lote antes de guardar.');
 captureMedia();
 // Sólo retirar medios de lotes quitados expresamente en esta edición; los huérfanos bloquean arriba.
 const activeMedia=Object.fromEntries(Object.entries(config.lotes).filter(([id])=>existing.has(id)).map(([id,card])=>{
   // Conservar el primer enlace público de fichas creadas antes del guardado con UUID estable.
   if(!card.idEnlace && (card.elementoRecorrido || card.elementoImagen || card.recorrido?.plano))return [id,{...card,idEnlace:id}];
   return [id,card];
 }));
 return {...originalTheme,...visual,miniweb:editor.querySelector('#miniweb-enabled').checked||hasAppliedComposition||originalTheme.miniweb||config.recorrido||Object.keys(activeMedia).length?{...normalizeMiniweb(config),lotes:activeMedia,activa:editor.querySelector('#miniweb-enabled').checked}:undefined};
}

export function reboundMiniwebTheme(tema,oldIds,newIds,parcelas=[]){
 if(!Array.isArray(oldIds)||!Array.isArray(newIds)||oldIds.length!==newIds.length||new Set(newIds).size!==newIds.length||newIds.some(id=>typeof id!=='string'||!id))throw Error('Respuesta de identidad de lotes no válida');
 const previous=oldIds.filter(Boolean);if(new Set(previous).size!==previous.length)throw Error('Identidad de origen repetida');
 const theme=parseTheme(tema);if(!theme.miniweb?.lotes&&!parcelas.some(Boolean))return tema;
 const source=theme.miniweb?.lotes||{};
 const rebound={};oldIds.forEach((old,i)=>{if(old&&Object.hasOwn(source,old))rebound[newIds[i]]=source[old]});
 parcelas.forEach((plano,i)=>{
   if(!plano || !newIds[i])return;
   let prev=rebound[newIds[i]]||{};
   if(Object.hasOwn(plano,'zonaVenta')){prev={...prev};if(plano.zonaVenta)prev.zonaVenta=plano.zonaVenta;else delete prev.zonaVenta;rebound[newIds[i]]=prev;}
   if(!plano.elementoImagen&&!plano.elementoRecorrido&&!plano.lote)return;
   if(plano.elementoImagen){rebound[newIds[i]]={...prev,elementoImagen:plano.elementoImagen};return;}
   if(plano.elementoRecorrido){rebound[newIds[i]]={...prev,elementoRecorrido:plano.elementoRecorrido};return;}
   if (prev.recorrido?.plano) return;
   rebound[newIds[i]]={...prev,recorrido:{...prev.recorrido,version:1,plano}};
 });
 return JSON.stringify({...theme,miniweb:{...theme.miniweb,lotes:rebound}});
}
export async function persistReboundMedia(client,projectId,before,after,lotIds,expectedRevision){
 if(before===after)return;
 // Un guardado concurrente puede conservar todos los UUID. Comparar también su revisión.
 const snapshot=await client.from('proyectos').select('tema,updated_at').eq('id',projectId).single();
 if(snapshot.error||![before,after].includes(snapshot.data?.tema)||!snapshot.data?.updated_at)throw Error('El proyecto cambió durante la vinculación de medios');
 const current=await client.from('lotes').select('id').eq('proyecto_id',projectId);
 const expected=new Set(lotIds);
 if(current.error||current.data?.length!==expected.size||current.data.some(l=>!expected.has(l.id)))throw Error('Los lotes cambiaron durante la vinculación de medios');
 if(snapshot.data.tema===after)return; // Ya vinculado. No adoptar una revisión que pudo guardar otra pestaña.
 if(expectedRevision && snapshot.data.updated_at!==expectedRevision)throw Error('El proyecto cambió durante la vinculación de medios');
 const result=await client.from('proyectos').update({tema:after,updated_at:new Date().toISOString()}).eq('id',projectId).eq('updated_at',snapshot.data.updated_at).select('updated_at');
 if(result.error||result.data?.length!==1||!result.data[0].updated_at)throw Error('No se pudo vincular los medios sin sobrescribir otra edición');
 return result.data[0].updated_at;
}

const rebindKey=id=>'sp-recorrido-vinculacion:'+id;
export function saveMediaRebindJournal(projectId,before,after,oldIds,newIds,storage=globalThis.localStorage,parcelas=[]){
 if(before===after)return;
 if(reboundMiniwebTheme(before,oldIds,newIds,parcelas)!==after)throw Error('El registro de recuperación no coincide con el remapeo.');
 const record={version:1,projectId,before,after,oldIds,newIds,parcelas};
 try{
  // El llamador ya pasó mergeMiniwebTheme (sin pendientes/huérfanos) y G4.
  // Un registro anterior es obsoleto: conservarlo aquí impediría guardar después de resolver desde otro navegador.
  storage.setItem(rebindKey(projectId),JSON.stringify(record));
 }catch(error){throw Error('No se pudo conservar la recuperación de medios en este navegador: '+error.message);}
}
export function clearMediaRebindJournal(projectId,after,storage=globalThis.localStorage){
 const key=rebindKey(projectId),raw=storage.getItem(key);if(!raw)return;
 const record=JSON.parse(raw);if(record.projectId===projectId&&record.after===after)storage.removeItem(key);
}
export function recoverMediaRebindRecord(projectId,tema,lotIds,storage=globalThis.localStorage){
 const raw=storage.getItem(rebindKey(projectId));if(!raw)return null;
 const record=JSON.parse(raw),live=new Set(lotIds);
 if(record.version!==1||record.projectId!==projectId||!Array.isArray(record.newIds)||record.newIds.length!==live.size||record.newIds.some(id=>!live.has(id))||reboundMiniwebTheme(record.before,record.oldIds,record.newIds,record.parcelas||[])!==record.after||![record.before,record.after].includes(tema))throw Error('La recuperación pendiente no coincide con el proyecto actual. Se conserva; use la reasociación explícita de medios sin vincular.');
 return {...record,completed:tema===record.after};
}
export function restoreMediaRebind(client,projectId,tema,lotIds,expectedRevision,onRevision){
 try{
  const record=recoverMediaRebindRecord(projectId,tema,lotIds);if(!record)return;
  if(record.completed){clearMediaRebindJournal(projectId,record.after);return;}
  loadMiniwebTheme(record.after);showMediaRetry(async()=>{
   const revision=await persistReboundMedia(client,projectId,record.before,record.after,record.newIds,expectedRevision);
   if(revision)onRevision?.(revision);
   clearMediaRebindJournal(projectId,record.after);
  });
  const message='Se recuperó una vinculación pendiente de este navegador. Use Reintentar vinculación de fotos y 360 antes de guardar.';
  editor.querySelector('[role=status]').textContent=message;return {pending:true,message};
 }catch(error){if(editor)editor.querySelector('[role=status]').textContent=error.message;return {pending:false,message:error.message};}
}
export function showMediaRetry(retry){
 mediaRebindPending=!!retry;
 let button=document.getElementById('mw-media-retry');
 if(!button){button=document.createElement('button');button.id='mw-media-retry';button.type='button';button.className='btn-secundario';mediaEditor.after(button)}
 button.hidden=!retry;if(!retry)return;button.textContent='Reintentar vinculación de fotos y 360';
 button.onclick=async()=>{button.disabled=true;try{await retry();mediaRebindPending=false;button.hidden=true;mediaEditor.querySelector('#mw-media-feedback').textContent='Medios vinculados correctamente.'}catch{mediaEditor.querySelector('#mw-media-feedback').textContent='Los medios siguen pendientes. Otra edición puede haber cambiado los lotes; no se reasignó ninguna foto.'}finally{button.disabled=false}};
}
