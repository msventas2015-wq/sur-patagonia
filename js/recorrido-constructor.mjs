import {photoNeedsReview} from './recorrido-foto.mjs?v=20261114-anillo7c';
import {classifyDXFCandidates,mountDXFReview,mountDXFSpreadsheet} from './recorrido-dxf-revision.mjs?v=20261117-integridad';
import {zoneCountText,salesZones} from './zonas-venta.mjs?v=20261114-anillo7b';
import {mountImageTracer,imagePlanIssue,imageLots,imagePlanV2} from './recorrido-calco.mjs?v=20261116-plano6';
import {mountLotStyle,tourZones} from './recorrido-estilo.mjs?v=20261114-anillo7b';
import {affine,gps,meters,parcelNames,readDXF,convertDXF,dxfProjection,importKML,importGeoJSON,cameraMetadata} from './recorrido-geografia.mjs?v=20261116-bordes';
import {reconstructDXFLots} from './recorrido-dxf-caras.mjs?v=20261116-plano6';
import {sceneIssue,mapView,openScene,node,numberIn,cameraParameters,cameraNeedsAdjustment} from './recorrido-escena.mjs?v=20261124-paseo';
import {inspectMediaFile,prepareMediaDerivatives,mediaPreparationLabel,mediaList,mediaURL} from './recorrido-medios.mjs?v=20261114-media1';
import {walkAssets} from './recorrido-paseo.mjs?v=20261124-paseo';

const requirements=[
 ['Plano del loteo · enviar una de estas dos opciones', 'Preferimos un KML en WGS84. Dibujá cada lote como un polígono simple y cerrado, con el nombre “Manzana 2 · Lote 12”. Podés incluir las calles como líneas y los lugares como puntos.'],
 ['Si trabajás en AutoCAD', 'Enviá un DXF ASCII en metros, en espacio modelo, con una polilínea cerrada por lote. Indicá la capa de lotes, qué eje es Este, el sistema y la faja (POSGAR 2007) o zona (UTM WGS84 Sur). Convertí curvas a segmentos y explotá los bloques. Para identificar los lotes, adjuntá una planilla con manzana, lote, longitud y latitud de un punto interior por lote. Si tenés DWG, exportalo a DXF o KML.'],
 ['Si el dibujo o croquis tiene coordenadas locales', 'Enviá tres referencias separadas que formen un triángulo: X/Y del dibujo y longitud/latitud WGS84 del mismo punto. Sumá un cuarto punto para comprobar el calce. Si es un croquis JPG, PNG o WebP, identificá esos puntos sobre la imagen.'],
 ['Foto cenital', 'Una foto vertical limpia del predio completo, con tres puntos identificables y sus coordenadas WGS84 para alinearla con los lotes.'],
 ['Panorámicas 360°', 'Enviá el JPG original del dron, esférico completo 2:1, hasta 256 MiB y 128 megapíxeles. El cargador lee sus datos locales y prepara WebP 4k/8k sin subir el original. Si falta algún dato, completá ubicación, altura respecto del terreno y rumbo en el editor.'],
 ['Cielo de hora azul (opcional)', 'Podés marcar el horizonte de cada estación en el creador o pedir una máscara PNG 2:1, con cielo blanco y terreno negro, alineada con su panorámica.'],
 ['Lugares que deben tener ficha', 'Por cada ingreso, mirador o espacio común, enviá el nombre, una descripción corta, una foto autorizada y su ubicación (coordenadas o marca en el plano).']
];
function guide(){
 const el=node('details',null,'rg-guide');el.open=true;el.append(node('summary','Qué pedirle al cliente'));
 const dl=node('dl');for(const [title,body] of requirements)dl.append(node('dt',title),node('dd',body));el.append(dl);
 const b=node('button','Copiar pedido para el cliente');b.type='button';dl.before(b);
 b.onclick=async()=>{const t=requirements.map(([a,b])=>a+'\n'+b).join('\n\n');try{await navigator.clipboard.writeText(t);b.textContent='Pedido copiado';}catch{const area=node('textarea');area.value=t;el.append(area);area.select();}};
 return el;
}
export {guide as materialsGuide};
const cleanScene=name=>({version:1,name,features:[],cameras:[],enabled:false,authoredStations:true});
export function applyCameraTable(text,cameras){
 const rows=text.trim().split(/\r?\n/).filter(row=>row.trim());
 if(rows.length<2)throw Error('Pegá la cabecera y al menos una fila de datos.');
 const sep=rows[0].includes('\t')?'\t':rows[0].includes(';')?';':',';
 if(rows.shift().toLowerCase().split(sep).map(v=>v.trim()).join(',')!=='archivo,longitud,latitud,altura,rumbo')throw Error('Usá las cinco columnas en el orden indicado.');
 const updated=[],seen=new Set();
 for(const [i,row] of rows.entries()){
   const [file,...cols]=row.split(sep).map(v=>v.trim()),numbers=cols.map(v=>v===''?NaN:Number(sep===','?v:v.replace(',','.')));
   const matches=cameras.filter(c=>c.filename===file || c.name===file || c.name===file.replace(/\.(?:jpe?g|webp|png)$/i,''));
   if(matches.length!==1 || seen.has(matches[0].id))throw Error('Fila '+(i+2)+': el nombre debe identificar una única estación cargada y sin repetir.');
   const [lon,lat,height,heading]=numbers;if(numbers.length!==4||!gps([lon,lat])||!numberIn(height,.1,10000)||!numberIn(heading,0,360))throw Error('Revisá coordenadas, altura y rumbo en la fila '+(i+2)+'.');
   const c=matches[0];seen.add(c.id);updated.push({...c,point:[lon,lat],height,heading,heightEstimated:false,headingEstimated:false,heightReference:'ground'});
 }
 return [...updated,...cameras.filter(c=>!seen.has(c.id))];
}
const selectOptions=(sel,options,value)=>{sel.replaceChildren(...options.map(([v,l])=>new Option(l,v)));sel.value=value;};
function refs(text){
 const pairs=text.trim().split('\n').filter(v=>v.trim()).map(line=>line.trim().split(/[\s;]+/).map(Number));
 if(pairs.length<3||pairs.length>4||pairs.some(a=>a.length!==4||!a.every(Number.isFinite)||!gps(a.slice(2))))throw Error('Ingresá tres referencias y, si lo tenés, el cuarto control. Cada fila lleva X Y longitud latitud en grados decimales.');
 const from=pairs.slice(0,3).map(a=>a.slice(0,2)),to=pairs.slice(0,3).map(a=>a.slice(2));affine(to,from);
 const transform=affine(from,to);
 return {transform,error:pairs[3]?Math.hypot(...meters(transform(pairs[3]),pairs[3].slice(2))):null};
}
export function editScene({config,identity,upload,local=false,lots=[],mapImage,onApply,inCreator=false,persist=false}) {
 if(!identity?.id||!identity.ready)throw Error('Guardá el proyecto y abrilo para armar su recorrido.');
 if(persist&&matchMedia('(max-width:760px)').matches)return desktopOnlyNotice();
 if(Number(config.version)>2 || (config.recorrido?.version && config.recorrido.version!==1) || (config.recorrido?.proyectoId && config.recorrido.proyectoId!==identity.id))throw Error('El banco no corresponde a este proyecto o versión.');
 const saved=config.recorrido?.escena;if(saved&&saved.version!==1)throw Error('Esta versión del recorrido requiere otro editor.');
 const scene=saved?structuredClone(saved):cleanScene(identity.nombre||identity.slug);
 if(!scene.cameras.length)scene.authoredStations=true;
 lots=structuredClone(lots);
 const lotPatches=new Map(),sheetCreates=new Map();let sheetCross;
 scene.name=identity.nombre||scene.name;
 const bindings=new Map(lots.map(l=>[l.id,config.lotes?.[l.id]?.elementoRecorrido||'']));
 const dialog=node('dialog',null,'rg-editor');dialog.setAttribute('aria-label',persist?'Cargar el loteo':'Constructor de recorridos');
 dialog.innerHTML='<header><div><small>Editor de recorridos 360°</small><h2></h2></div><button type="button" data-close>Cerrar ×</button></header><nav class="rg-mobile-nav" aria-label="Vista del editor"><button type="button" data-screen="map" aria-pressed="true">Mapa</button><button type="button" data-screen="fields" aria-pressed="false">Herramientas</button></nav><div class="rg-main"><aside class="rg-fields"></aside><section class="rg-board"><div class="rg-tools"><h3>Mapa del loteo</h3><div class="rg-map-tools"><button data-zoomout aria-label="Alejar mapa">−</button><button data-zoomin aria-label="Acercar mapa">+</button><button data-land>Loteo</button><button data-fit>Ver todo</button></div></div><div class="rg-map"></div><div class="rg-map-pick" hidden><button type="button" data-board-finish>Cerrar contorno</button><button type="button" data-board-cancel>Cancelar marcado</button></div><p data-summary></p><p data-mode></p><p role="status" aria-live="polite"></p></section></div><footer><label><input type="checkbox" data-enable> Habilitar recorrido para visitantes al guardar</label><button type="button" data-preview>Ver como visitante</button><button type="button" data-save></button></footer>';
 const q=s=>dialog.querySelector(s),fields=q('.rg-fields'),status=q('[role=status]');
 function screen(name){
   dialog.dataset.screen=name;
   for(const button of dialog.querySelectorAll('[data-screen]'))button.setAttribute('aria-pressed',String(button.dataset.screen===name));
 }
 for(const button of dialog.querySelectorAll('[data-screen]'))button.onclick=()=>screen(button.dataset.screen);
 screen(saved?'map':'fields');
 q('h2').textContent=scene.name;q('[data-save]').textContent=inCreator?'Aplicar y volver al creador':local?'Guardar borrador local':'Aplicar al proyecto';
 q('[data-enable]').checked=!!scene.enabled;
 const help=guide();help.open=false;
 if(inCreator)q('[data-close]').textContent='Volver al creador';
 if(local)q('[data-enable]').parentElement.hidden=true;
 function section(title,html){
   const d=node('details',null,'rg-section');d.open=fields.childElementCount===0;d.name='rg-editor-panel';d.append(node('summary',title));const box=node('div');box.innerHTML=html;d.append(box);fields.append(d);return box;
 }
 const presentation=section('Presentación',`<label>Nombre del proyecto
   <select data-title-placement>
     <option value="both">Arriba a la izquierda y al centro</option>
     <option value="corner">Sólo arriba a la izquierda</option>
     <option value="center">Sólo al centro</option>
   </select></label><label>Título sobre el paisaje<textarea data-tour-title rows="2" maxlength="100"></textarea></label><label>Vista del sector para las fichas<input data-sector-file type="file" accept="image/jpeg,image/png,image/webp"></label><p>Se usa cuando el lote no tiene foto propia.</p><img data-sector-preview alt="Vista del sector cargada" hidden><button type="button" data-sector-remove hidden>Quitar vista del sector</button>`);
 const placement=presentation.querySelector('[data-title-placement]');
 if (Array.from(placement.options).some(option=>option.value===scene.titlePlacement)) placement.value=scene.titlePlacement;
 presentation.querySelector('textarea').value=scene.title || scene.name;
 const plan=section('Plano del loteo','<label>Cargar plano de lotes<input data-plan type="file" accept=".kml,.dxf,.geojson,.json"></label><p>El selector cenital y el recorrido 360° usan estos mismos lotes.</p><label>Cargar foto cenital<input data-cenital type="file" accept="image/jpeg,image/png,image/webp"></label><details><summary>Usar una foto aérea del sitio</summary><label>Dirección de la foto aérea<input type="url" data-site-photo></label><button type="button" data-use-site-photo>Ubicar foto en el plano</button></details><details><summary>Pegar KML o GeoJSON</summary><label>Contenido del plano<textarea data-vector rows="4"></textarea></label><button type="button" data-vectoradd>Importar geometría</button></details><p data-source></p><div data-cal hidden><label data-sys>Sistema del DXF<select data-crs><option value="">Elegí el indicado por el agrimensor</option><option value="posgar">POSGAR 2007 · Argentina</option><option value="utm">WGS84 · UTM Sur</option><option value="local">Coordenadas locales</option></select></label><label data-zone>Faja o zona<input data-zone-value type="number" min="1" max="60"></label><label data-axes><input data-swap type="checkbox"> Intercambiar X e Y (X es Norte)</label><label data-layer>Capa que querés importar<select data-layers></select></label><div data-refbox hidden><p data-refhint></p><textarea data-refs rows="5" aria-label="Referencias del plano" placeholder="X Y longitud latitud"></textarea><div data-rasterpick hidden><label>Longitud del punto<input data-r-lon type="number" step="any"></label><label>Latitud del punto<input data-r-lat type="number" step="any"></label><p>Ingresá las coordenadas y tocá el punto correspondiente en la imagen.</p><img data-calimg alt="Croquis para marcar referencias"></div></div><button type="button" data-import>Incorporar al plano</button><button type="button" data-cancelimport>Cancelar importación</button></div>');
 plan.closest('details').open=true;
 const panoramas=section('Fotos 360°','<label>Agregar panorámicas 2:1<input data-panos type="file" multiple accept="image/jpeg,image/png,image/webp"></label><div data-bank></div><details><summary>Pegar planilla de estaciones</summary><p>Pegá las cinco columnas desde una planilla, con sus títulos. También se admite texto separado por punto y coma. Las filas fijan el orden del recorrido.</p><label>Datos de las tomas<textarea data-table rows="5" placeholder="archivo;longitud;latitud;altura;rumbo"></textarea></label><button data-applytable>Aplicar coordenadas y orden</button></details><label>Estación<select data-cameras></select></label><div data-camform hidden><label>Mostrar en el paisaje<select data-cam-marker><option value="route">Sólo en la navegación del recorrido</option><option value="context">Tarjeta 360° · Explorar</option></select></label><label>Nombre de la estación<input data-cname maxlength="140"></label><div class="rg-pair"><label>Longitud<input data-lon type="number" step="any" min="-180" max="180"></label><label>Latitud<input data-lat type="number" step="any" min="-89" max="89"></label></div><button data-locate>Ubicar estación en el plano</button><p data-adjust-state role="status" aria-live="polite"></p><button type="button" data-adjust-camera>Ajustar mirando</button><div class="rg-pair"><label>Rumbo del centro (°)<input data-heading type="number" step="any" min="0" max="360"></label><label>Altura sobre el plano (m)<input data-height type="number" step="any" min="0.1" max="10000"></label></div><details><summary>Ajustar el horizonte de la foto</summary><label>Inclinación del centro (°)<input data-tilt type="number" min="-45" max="45" step="any"></label><label>Rotación del horizonte (°)<input data-roll type="number" min="-45" max="45" step="any"></label></details><p>0° apunta al norte verdadero. Confirmá la altura respecto del terreno del plano.</p><details data-sky-author><summary>Cielo de esta estación</summary><p data-sky-state></p><button type="button" data-draw-ridge>Marcar horizonte</button><label>O cargar máscara PNG 2:1<input data-mask type="file" accept="image/png"></label><button type="button" data-unmask>Quitar hora azul</button></details><button data-earlier>Subir en el orden</button><button data-later>Bajar en el orden</button><button data-delcam>Quitar estación</button></div>');
 const parcelTools=section('Lotes y puntos de interés','<details><summary>Identificar lotes con planilla</summary><label>Manzana, lote y punto interior<textarea data-lot-table rows="4" placeholder="manzana;lote;longitud;latitud"></textarea></label><button data-lot-apply>Asignar nombres a los contornos</button></details><button data-newpoi>Marcar lugar</button><button data-newlot>Dibujar lote</button><button data-finish hidden>Cerrar contorno</button><button data-cancelpick hidden>Cancelar marcado</button><label>Elemento del plano<select data-features></select></label><div data-featureform hidden><div data-poicard><label>Marcador del lugar<select data-poi-kind><option value="place">Lugar</option><option value="office-bolson">Oficina Sur Patagonian · El Bolsón</option></select></label><label>Nombre del lugar<input data-fname maxlength="140"></label><label>Descripción<textarea data-desc maxlength="1500"></textarea></label><label>Foto de la ficha<input data-photo type="file" accept="image/jpeg,image/png,image/webp"></label><span data-photoname></span></div><p data-lot-help hidden>Vinculá este contorno a la ficha que cargaste en Lotes. Sus datos y fotos se actualizan desde allí.</p><div class="rg-pair" data-poigeo><label>Longitud del lugar<input data-plon type="number" step="any"></label><label>Latitud del lugar<input data-plat type="number" step="any"></label></div><button data-movepoi>Reubicar lugar</button><label>Altura respecto del plano (m)<input data-fheight type="number" step="any"></label><label data-lotbind>Lote del proyecto<select data-bind></select></label><button data-delf>Quitar elemento</button></div>');
 const styleBox=section('Diseño del plano','<p>Las líneas, el sombreado y los colores se usan en el selector cenital y en el recorrido 360°.</p>');
 const selectStyle=mountLotStyle(styleBox,scene,()=>{changed();draw();});
 fields.append(help);
 let blockedSceneIssue='',loaderRefresh=()=>{},inventoryConfirmed=false,reviewSignature='',loaderStep=1;
 let imageMode=!!scene.imagePlan&&scene.planoActivo!=='vectorial',tracer=null,dxfReview=null;
 let landOnly=true;
 let camId=scene.cameras[0]?.id,featureId,mode='',drawing=[],pending,dirty=false,busy=false,zoom=1,center;
 const cam=()=>scene.cameras.find(c=>c.id===camId),feature=()=>scene.features.find(f=>f.id===featureId);
 const walkPanel=node('details');
 walkPanel.innerHTML='<summary>Paseo y encuadre de esta estación</summary><label>Tipo de estación<select data-station-type><option value="aerial">Vista aérea</option><option value="ground">A nivel del terreno</option></select></label><div data-walk-ground><button type="button" data-prepare-walk>Preparar avance desde esta panorámica</button><p data-walk-state></p><button type="button" data-draw-terrain>Marcar objetos delante de los lotes</button></div><label>Encuadre al entrar<select data-frame-mode><option value="auto">Hacia los lotes</option><option value="manual">Elegir dirección</option></select></label><div class="rg-pair" data-frame-fields><label>Dirección en la foto (°)<input data-frame-yaw type="number" min="-180" max="180" step="any"></label><label>Inclinación de la mirada (°)<input data-frame-pitch type="number" min="-85" max="85" step="any"></label></div>';
 q('[data-sky-author]').before(walkPanel);
 const returnLabel=node('label','Estación de regreso a la vista aérea');
 returnLabel.append(node('select'));panoramas.append(returnLabel);
 const returnSelect=returnLabel.querySelector('select');
 const hasLegacyReturn=identity.slug==='terrazas-del-piltri' && !scene.authoredStations;
 returnSelect.onchange=()=>{
   if(returnSelect.value==='original')delete scene.aerialReturnId;
   else scene.aerialReturnId=returnSelect.value;
   changed();refresh();
 };
 const note=text=>{status.textContent=text;loaderRefresh();if(persist&&text&&dialog.isConnected)status.scrollIntoView({block:'nearest'});};
 function changed(){dirty=true;loaderRefresh();if(blockedSceneIssue&&status.textContent===blockedSceneIssue){blockedSceneIssue=sceneIssue(scene,{local});status.textContent=blockedSceneIssue||'La estación está preparada para revisar.';}refreshCameraStatus();}
 function safe(fn){return async e=>{try{await fn(e);}catch(error){note(error.message||'No se pudo completar.');}};}
 const click=(sel,fn)=>{const b=q(sel);b.type='button';b.onclick=safe(fn);};
 function release(){if(pending?.blob)URL.revokeObjectURL(pending.blob);pending=null;q('[data-cal]').hidden=true;loaderRefresh();}
 function setBusy(v){busy=v;for(const block of [fields,q('footer')])block.inert=v;q('[data-close]').disabled=v;loaderRefresh();}
 async function exclusive(fn){if(busy)return;setBusy(true);try{return await fn();}finally{setBusy(false);}}
 async function store(file,variant){const res=await upload(file,{projectId:identity.id,variant,lotId:'',tipo:'recorrido'});const url=mediaURL(typeof res==='string'?res:res?.url,{local});if(!url)throw Error('No se recibió una imagen válida.');return url;}
 function mapSales(){
   const current=draftConfig(),zones=tourZones(current,identity.slug,lots);
   const linked=new Map(lots.map(l=>[bindings.get(l.id),l]));
   return {zones,linked};
 }
 const imageLinks=new Map(lots.map(l=>[config.lotes?.[l.id]?.elementoImagen,l]));
 let imageZones;
 function draw(){
   if(imageMode&&!scene.imagePlan){q('.rg-map').replaceChildren(node('p','Subí una imagen para empezar el calco.'));q('[data-summary]').textContent='Calco sin coordenadas GPS';loaderRefresh();return;}
   if(imageMode&&scene.imagePlan&&tracer){imageZones=mapSales().zones;tracer.render();q('[data-summary]').textContent=imageZones?zoneCountText(imageZones.counts):imageLots(scene.imagePlan).filter(f=>!f.hidden).length+' '+(imageLots(scene.imagePlan).filter(f=>!f.hidden).length===1?'lote':'lotes')+' sobre imagen · sin GPS';q('[data-mode]').textContent='';q('.rg-map-pick').hidden=true;loaderRefresh();return;}
   const {zones,linked}=mapSales();
   if(!mode&&persist&&dxfReview?.drawMap(q('.rg-map'),{zoom,center,zones,linked,activeStation:camId,onStationMove:moveStation,onStationSelect:selectStation})){q('[data-summary]').textContent=scene.features.filter(f=>f.kind==='lot').length+' cierres en revisión'+(zones?' · '+zoneCountText(zones.counts):'');q('[data-mode]').textContent='Elegí una manzana para numerar o Elegir varios para revisar en grupo.';q('.rg-map-pick').hidden=true;loaderRefresh();return;}
   mapView(q('.rg-map'),scene,{local,linked,zones,landOnly,active:featureId||camId,extra:drawing,zoom,center,onPick:mode?pick:undefined,onStationMove:mode?undefined:moveStation,onSelect:id=>{
     const item=scene.features.find(f=>f.id===id);
     if(styleBox.closest('details').open && item?.kind==='lot'){featureId=id;selectStyle(item,linked.get(id));screen('fields');draw();return;}
     if(scene.cameras.some(c=>c.id===id)){selectStation(id);return;}else{featureId=id;const panel=q('[data-features]').closest('.rg-section')||q('[data-features]').closest('.rg-load-advanced');if(panel)panel.open=true;}screen('fields');refresh();
   }});
   q('[data-summary]').textContent=zones?zoneCountText(zones.counts):[['lote','lotes',scene.features.filter(f=>f.kind==='lot').length],['toma 360°','tomas 360°',scene.cameras.length],['lugar','lugares',scene.features.filter(f=>f.kind==='poi').length]].map(([one,many,n])=>n+' '+(n===1?one:many)).join('  ·  ');
   loaderRefresh();
   q('[data-mode]').textContent=({cam:'Tocá el punto de captura en el plano.',poi:'Tocá el plano para agregar el lugar.',move:'Tocá la nueva ubicación.',lot:'Marcá los vértices en orden y pulsá Cerrar contorno.'})[mode]||'';
   q('.rg-map-pick').hidden=!mode;q('[data-board-finish]').hidden=mode!=='lot';q('[data-finish]').hidden=mode!=='lot';q('[data-cancelpick]').hidden=!mode;
 }
 function refresh(){
   const sectorImage=q('[data-sector-preview]');
   const sectorUrl=mediaURL(scene.sectorPhoto,{local});
   sectorImage.hidden=q('[data-sector-remove]').hidden=!sectorUrl;
   if(sectorUrl)sectorImage.src=sectorUrl;else sectorImage.removeAttribute('src');
   if(persist&&q('[data-lot-name]')){q('[data-lot-name]').hidden=feature()?.kind!=='lot';q('[data-lot-name] input').value=feature()?.name||'';q('[data-delf]').textContent=feature()?.dxfReconstructed?'Descartar este cierre':'Quitar elemento';}
   selectOptions(q('[data-cameras]'),scene.cameras.map((c,i)=>[c.id,(i+1)+' · '+c.name+(!gps(c.point)?' · Sin ubicación':cameraNeedsAdjustment(c)?' · Sin ajustar':'')]),camId);
   selectOptions(q('[data-features]'),[['','Elegí un elemento'],...scene.features.map(f=>[f.id,f.name])],featureId||'');
   const c=cam(),f=feature();q('[data-camform]').hidden=!c;q('[data-featureform]').hidden=!f;
   const returnOptions=hasLegacyReturn?[['original','Regreso original del recorrido']]:[];
   selectOptions(returnSelect,[...returnOptions,['','Sin estación de regreso'],...scene.cameras.filter(s=>s.stationType!=='ground').map(s=>[s.id,s.name])],scene.aerialReturnId??(hasLegacyReturn?'original':''));
   if(c){
    q('[data-station-type]').value=c.stationType||'aerial';
    q('[data-walk-ground]').hidden=c.stationType!=='ground';
    const prepared=walkAssets(c.paseo,{projectId:identity.id,local});
    const count=c.terrainContours?.length||0;
    const walkStatus=prepared?'Avance preparado. ':c.paseo?'Revisá las imágenes del avance. ':'Avance pendiente. ';
    q('[data-walk-state]').textContent=walkStatus+count+(count===1?' contorno de terreno.':' contornos de terreno.');
    q('[data-frame-mode]').value=c.start==null?'auto':'manual';
    q('[data-frame-fields]').hidden=c.start==null;
    q('[data-frame-yaw]').value=c.start??0;q('[data-frame-pitch]').value=c.startPitch??-20;
    q('[data-sky-state]').textContent=c.skyMask?'Hora azul disponible para esta toma.':'Esta toma usa el cielo original.';
    q('[data-unmask]').hidden=!c.skyMask;
    for(const [k,v] of Object.entries({cname:c.name,lon:c.point?.[0],lat:c.point?.[1],...cameraParameters(c),tilt:c.tilt||0,roll:c.roll||0}))q('[data-'+k+']').value=v??'';
    q('[data-earlier]').disabled=scene.cameras.indexOf(c)===0;q('[data-later]').disabled=scene.cameras.at(-1)===c;}
   if(c)q('[data-cam-marker]').value=c.marker || (/^panor[aá]mica\b/i.test(c.name)?'context':'route');
   if(f){q('[data-poi-kind]').value=f.marker || 'place';q('[data-poicard]').hidden=f.kind!=='poi';q('[data-lot-help]').hidden=f.kind!=='lot';q('[data-fname]').value=f.name;q('[data-desc]').value=f.description||'';q('[data-fheight]').value=f.height||0;q('[data-movepoi]').hidden=q('[data-poigeo]').hidden=f.kind!=='poi';if(f.kind==='poi'){q('[data-plon]').value=f.points[0][0];q('[data-plat]').value=f.points[0][1];}q('[data-photoname]').textContent=f.photo?'Foto asociada':'';q('[data-lotbind]').hidden=f.kind!=='lot'||!lots.length;
    selectOptions(q('[data-bind]'),[['','Sin asociación'],...lots.map(l=>[l.id,'Lote '+l.numero])],[...bindings].find(([,v])=>v===f.id)?.[0]||'');}
   q('[data-source]').textContent=[...(scene.sources||[]),scene.raster?.name].filter(Boolean).join(' · ')||'Sin plano cargado';
   if(scene.features.length){
     const count=(kind,one,many)=>{const n=scene.features.filter(f=>f.kind===kind).length;return n+' '+(n===1?one:many);};
     q('[data-source]').textContent+=' · '+[count('lot','lote cerrado','lotes cerrados'),count('line','trazo','trazos'),count('poi','lugar','lugares')].join(' · ');
   }
   if(scene.checks?.length)q('[data-source]').textContent+=' · '+scene.checks.map(c=>c.name+': control '+c.meters.toFixed(1)+' m').join(' · ');
   refreshCameraStatus();
   const missing=unlinked();
   if(missing.length) q('[data-source]').textContent+=' · '+missing.length+' sin vincular a Lotes';
   draw();
 }
 function refreshCameraStatus(){const c=cam(),label=q('[data-adjust-state]'),button=q('[data-adjust-camera]');if(!c||!label||!button)return;button.disabled=!gps(c.point);const settings=cameraParameters(c);label.textContent=!gps(c.point)?'Ubicá esta estación en el plano.':cameraNeedsAdjustment(c)?'Sin ajustar · '+(c.heightReference==='takeoff'?'Altura del archivo estimada, relativa al despegue: ':c.heightEstimated||c.height==null?'Altura estimada: ':'Altura: ')+settings.height.toLocaleString('es-AR')+' m'+(c.headingEstimated||c.heading==null?' · Rumbo estimado':'')+'. Podés abrir el recorrido y ajustar mirando.':'Estación ajustada · '+settings.height.toLocaleString('es-AR')+' m sobre el plano.';}
 function unlinked(){
   const counts=new Map();
   for(const key of bindings.values()) if(key) counts.set(key,(counts.get(key)||0)+1);
   return scene.features.filter(f=>f.kind==='lot' && counts.get(f.id)!==1);
 }
 function selectStation(id){if(!scene.cameras.some(c=>c.id===id))return;camId=id;featureId='';const section=q('[data-cameras]').closest('.rg-section');if(section)section.open=true;else q('.rg-load-step[data-step="3"] .rg-step-toggle')?.click();screen('fields');refresh();}
 function moveStation(id,point){const c=scene.cameras.find(c=>c.id===id);if(!c||!gps(point))return;c.point=point;camId=id;featureId='';changed();refresh();}
 function cancelPick(){mode='';drawing=[];draw();}
 function pick(point){
   if(mode==='lot'){drawing.push(point);draw();return;}
   if(mode==='cam'&&cam())cam().point=point;
   else if(mode==='move'&&feature())feature().points=[point];
   else if(mode==='poi'){const f={id:crypto.randomUUID(),kind:'poi',name:'Nuevo lugar',points:[point],description:''};scene.features.push(f);featureId=f.id;}
   changed();cancelPick();screen('fields');refresh();
 }
 function start(m){if(!scene.features.length&&!scene.raster&&!scene.cameras.some(c=>gps(c.point)))throw Error('Cargá el plano o las coordenadas de una estación primero.');mode=m;drawing=[];screen('map');draw();q('.rg-board').scrollIntoView({block:'nearest'});}
 click('[data-newpoi]',()=>start('poi'));click('[data-newlot]',()=>start('lot'));click('[data-movepoi]',()=>start('move'));click('[data-locate]',()=>start('cam'));click('[data-cancelpick]',cancelPick);
 click('[data-finish]',()=>{if(drawing.length<3)throw Error('Marcá al menos tres vértices.');const f={id:crypto.randomUUID(),kind:'lot',name:'Nuevo lote',points:drawing,description:''};scene.features.push(f);featureId=f.id;changed();cancelPick();refresh();});
 for(const [sel,factor] of [['[data-zoomout]',1/1.6],['[data-zoomin]',1.6]])click(sel,()=>{if(imageMode&&tracer){tracer.zoom(factor);return;}center=feature()?.points[0]||cam()?.point||center;zoom=Math.max(.5,Math.min(32,zoom*factor));draw();});
 click('[data-board-finish]',()=>{q('[data-finish]').click();if(!mode)screen('fields');});
 click('[data-board-cancel]',()=>{cancelPick();screen('fields');});
 click('[data-fit]',()=>{if(imageMode&&tracer){tracer.fit();return;}landOnly=false;center=null;zoom=1;draw();});
 click('[data-land]',()=>{if(imageMode&&tracer){tracer.fit();return;}landOnly=true;center=null;zoom=1;draw();});
 q('[data-cameras]').onchange=e=>{camId=e.target.value;featureId='';cancelPick();refresh();};
 q('[data-features]').onchange=e=>{featureId=e.target.value;cancelPick();refresh();};
 function edit(sel,fn){
   const field=q(sel);
   if(field.tagName!=='SELECT')field.oninput=safe(e=>{fn(e.target);changed();});
   field.onchange=safe(e=>{fn(e.target);changed();refresh();});
 }
 edit('[data-cam-marker]',e=>cam().marker=e.value);
 edit('[data-station-type]',e=>{
   const c=cam();c.stationType=e.value;
   if(e.value==='ground' && scene.aerialReturnId===c.id)delete scene.aerialReturnId;
 });
 edit('[data-frame-mode]',e=>{
   const c=cam();
   if(e.value==='manual'){c.start??=0;c.startPitch??=-20;}
   else {delete c.start;delete c.startPitch;}
 });
 for(const [sel,key,min,max] of [['[data-frame-yaw]','start',-180,180],['[data-frame-pitch]','startPitch',-85,85]]) {
   q(sel).onchange=safe(e=>{
     if(!numberIn(e.target.valueAsNumber,min,max)){refresh();throw Error('Elegí un ángulo entre '+min+' y '+max+' grados.');}
     cam()[key]=e.target.valueAsNumber;changed();refresh();
   });
 }
 click('[data-prepare-walk]',()=>exclusive(async()=>{
   const c=cam();
   if(c.heightEstimated || !numberIn(c.height,.1,10000))throw Error('Confirmá la altura sobre el plano antes de preparar el avance.');
   if(c.skyMask)throw Error('Esta estación usa hora azul. Quitá su máscara de cielo para preparar el avance.');
   const {prepareWalkImages,storeWalkFiles}=await import('./recorrido-paseo-editor.mjs?v=20261124-paseo');
   note('Preparando la panorámica para el avance…');
   try {
     const files=await storeWalkFiles(prepareWalkImages(c,note),store);
     if(!walkAssets(files,{projectId:identity.id,local}))throw Error('El banco devolvió medios que no corresponden a este proyecto.');
     c.paseo=files;changed();refresh();note('Avance preparado. Aplicá los cambios y guardá el proyecto.');
   } catch(error){throw Error('No se completó el avance. Podés reintentar. '+error.message);}
 }));
 click('[data-draw-terrain]',async()=>{
   const c=cam(),{editTerrainContours}=await import('./recorrido-paseo-editor.mjs?v=20261124-paseo');
   editTerrainContours(c,contours=>{c.terrainContours=contours;changed();refresh();});
 });
 edit('[data-poi-kind]',e=>{feature().marker=e.value;if(e.value==='office-bolson')feature().name='Oficina Sur Patagonian';});
 click('[data-adjust-camera]',()=>{const current=cam();if(!current||!gps(current.point))throw Error('Ubicá la estación en el plano antes de ajustarla.');openScene({...scene,cameras:[{...current,...cameraParameters(current)}]},{local,projectSlug:identity.slug,config:draftConfig(),lots,preview:true,calibration:{cameraId:current.id,onApply:values=>{Object.assign(current,values);changed();refresh();note('Ajuste confirmado en el borrador. Guardá el proyecto para conservarlo.');}}});});
 click('[data-sector-remove]',()=>{delete scene.sectorPhoto;changed();refresh();});
 q('[data-sector-file]').onchange=safe(async e=>{
   const file=e.target.files[0];e.target.value='';if(!file)return;
   await exclusive(async()=>{
     const parts=await prepareMediaDerivatives(file,'foto');
     scene.sectorPhoto=await store(parts.web,'web');changed();refresh();note('Vista del sector cargada.');
   });
 });
 edit('[data-title-placement]',field=>{scene.titlePlacement=field.value;});
 edit('[data-tour-title]',e=>scene.title=e.value.trim());
 click('[data-unmask]',()=>{delete cam().skyMask;changed();refresh();});
 async function saveMask(camera,file) {
   if(file.type!=='image/png') throw Error('Elegí una máscara PNG.');
   const info=await inspectMediaFile(file,'panorama');
   if(info.ancho>8192 || info.alto>4096) throw Error('Usá una máscara de hasta 8192 × 4096.');
   camera.skyMask=await store(file,'web');changed();refresh();note('Horizonte guardado para '+camera.name+'.');
 }
 q('[data-mask]').onchange=safe(e=>{
   const file=e.target.files[0],camera=cam();e.target.value='';
   if(file && camera) return exclusive(()=>saveMask(camera,file));
 });
 click('[data-draw-ridge]',()=>markHorizon(cam(),file=>exclusive(()=>saveMask(cam(),file))));
 edit('[data-cname]',e=>cam().name=e.value.trim()||'Estación');
 for(const [key,i] of [['lon',0],['lat',1]])edit('[data-'+key+']',e=>{const c=cam();c.point||=[null,null];c.point[i]=e.value===''?null:e.valueAsNumber;});
 for(const key of ['heading','height','tilt','roll'])edit('[data-'+key+']',e=>{
   const c=cam();c[key]=e.value===''?null:e.valueAsNumber;
   if(key==='height' && numberIn(c.height,.1,10000)){c.heightEstimated=false;c.heightReference='ground';}
   if(key==='heading' && numberIn(c.heading,0,360))c.headingEstimated=false;
 });
 edit('[data-fname]',e=>feature().name=e.value.trim()||'Lugar');edit('[data-desc]',e=>feature().description=e.value.trim());edit('[data-fheight]',e=>feature().height=Number(e.value)||0);
 for(const [key,i] of [['plon',0],['plat',1]])q('[data-'+key+']').onchange=safe(e=>{const f=feature(),point=[...f.points[0]];point[i]=e.target.valueAsNumber;if(!gps(point)){refresh();throw Error('Revisá las coordenadas del lugar.');}f.points=[point];changed();refresh();});
 edit('[data-bind]',e=>{if(e.value && bindings.get(e.value)&&bindings.get(e.value)!==featureId){refresh();throw Error('El lote ya está vinculado a otro contorno.');}for(const [id,v] of bindings)if(v===featureId)bindings.set(id,'');if(e.value)bindings.set(e.value,featureId);});
 for(const [sel,delta] of [['[data-earlier]',-1],['[data-later]',1]])click(sel,()=>{const i=scene.cameras.indexOf(cam()),j=i+delta;if(j<0||j>=scene.cameras.length)return;[scene.cameras[i],scene.cameras[j]]=[scene.cameras[j],scene.cameras[i]];changed();refresh();});
 click('[data-delcam]',()=>{if(scene.aerialReturnId===camId)delete scene.aerialReturnId;scene.cameras=scene.cameras.filter(c=>c.id!==camId);camId=scene.cameras[0]?.id;changed();cancelPick();refresh();});
 click('[data-delf]',()=>{if(persist&&feature()?.dxfReconstructed){if([...bindings.values()].includes(featureId))throw Error('Este lote tiene ficha. Revisá su vínculo desde Lotes antes de apartarlo.');scene.dxfDiscarded||=[];scene.dxfDiscarded.push({...feature(),dxfDiscardReason:'Apartado durante la revisión'});}scene.features=scene.features.filter(f=>f.id!==featureId);for(const [k,v] of bindings)if(v===featureId)bindings.set(k,'');featureId='';changed();cancelPick();refresh();});
 click('[data-lot-apply]',()=>{
   const changes=parcelNames(q('[data-lot-table]').value,scene.features);
   for(const f of scene.features)if(changes.has(f.id)){f.name=changes.get(f.id);if(f.dxfReconstructed){delete f.block;delete f.number;}}
   changed();refresh();note(changes.size+' nombres de lote aplicados.');
 });
 click('[data-applytable]',()=>{scene.cameras=applyCameraTable(q('[data-table]').value,scene.cameras);camId=scene.cameras[0].id;changed();refresh();note('Coordenadas y orden aplicados.');});
 function recordImport(name,features){
   if(scene.features.length+features.length>5000)throw Error('El plano supera 5000 elementos. Importá sólo la capa necesaria.');
   scene.features.push(...features);scene.sources||=[];scene.sources.push(name);featureId=features.find(f=>f.kind==='lot')?.id||features[0]?.id;changed();refresh();
 }
 function calibrate(){
   const raster=pending?.type==='raster',localCRS=q('[data-crs]').value==='local';
   q('[data-cal]').hidden=!pending;
   for(const key of ['sys','layer','axes'])q('[data-'+key+']').hidden=raster;
   q('[data-zone]').hidden=raster||localCRS;q('[data-refbox]').hidden=!raster&&!localCRS;q('[data-rasterpick]').hidden=!raster;
   q('[data-refhint]').textContent=raster?'X e Y van de 0 a 1 sobre la imagen, medidos desde arriba a la izquierda.':'Usá los ejes del archivo tras el intercambio indicado. Una fila por punto: X Y longitud latitud.';
 }
 const referencePicker=node('select');
 const referenceLabel=node('label','Usar una esquina del plano');
 referenceLabel.append(referencePicker);q('[data-calimg]').before(referenceLabel);
 referencePicker.onchange=()=>{
   if(!referencePicker.value)return;
   const [lon,lat]=referencePicker.value.split(',');
   q('[data-r-lon]').value=lon;q('[data-r-lat]').value=lat;
 };
 function showPhotoReferences(){
   referencePicker.replaceChildren(new Option('Elegí una esquina o ingresá las coordenadas',''));
   for(const feature of scene.features.filter(f=>f.kind==='lot')){
     const group=document.createElement('optgroup');group.label=feature.name;
     const points=new Map(feature.points.map(p=>[p.slice(0,2).join(','),p]));
     for(const [key,point] of points){
       const label='Vértice '+(group.children.length+1)+' · '+point.slice(0,2).map(n=>n.toFixed(6)).join(', ');
       group.append(new Option(label,key));
     }
     referencePicker.append(group);
   }
   referenceLabel.hidden=referencePicker.options.length===1;
 }
 async function rasterPending(file,url,name){
  let info,report='';if(file){const source=file;info=await inspectMediaFile(source,'foto');const parts=await prepareMediaDerivatives(source,'foto',info,{onProgress:note});file=parts.web;report=mediaPreparationLabel(source,parts);}
  release();showPhotoReferences();pending={type:'raster',file,url,name,...(info?{captura:info.captura}:{}),blob:file?URL.createObjectURL(file):null};q('[data-calimg]').src=pending.blob||url;q('[data-refs]').value='';calibrate();loaderRefresh();return report;
 }
 if(mapImage&&mediaURL(mapImage,{local})){const b=node('button','Usar imagen del mapa del proyecto');b.type='button';b.onclick=safe(()=>rasterPending(null,mapImage,'Mapa del proyecto'));plan.prepend(b);}
 click('[data-use-site-photo]',async()=>{
  const href=mediaURL(q('[data-site-photo]').value);
  if(!href || new URL(href).origin!==location.origin)throw Error('Elegí una imagen publicada en este sitio.');
  const image=new Image();image.src=href;
  try{await image.decode()}catch{throw Error('No se pudo abrir esa foto. Revisá la dirección.')}
  await rasterPending(null,new URL(href).pathname+new URL(href).search,'Foto aérea');
 });
 q('[data-crs]').onchange=calibrate;
 q('[data-calimg]').onclick=safe(e=>{
   const lon=q('[data-r-lon]').valueAsNumber,lat=q('[data-r-lat]').valueAsNumber;if(!gps([lon,lat]))throw Error('Ingresá longitud y latitud del punto antes de marcarlo.');
   const rect=e.target.getBoundingClientRect(),arr=q('[data-refs]');arr.value+=(arr.value.trim()?'\n':'')+[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height,lon,lat].map(n=>n.toFixed(8)).join(' ');q('[data-r-lon]').value=q('[data-r-lat]').value='';
 });
 q('[data-cenital]').onchange=safe(async e=>{
   const file=e.target.files[0];e.target.value='';if(!file)return;
   await exclusive(async()=>{const report=await rasterPending(file,null,file.name);note(report+'\nMarcá tres referencias para alinear la foto con el plano.');});
 });
 async function loadPlanFile(file){if(!file)return;
   await exclusive(async()=>{if(file.size>30*1024*1024)throw Error('Máximo 30 MB por plano.');const ext=file.name.split('.').at(-1).toLowerCase();release();
    const text=await file.text();
    if(ext==='dxf'){const dxf=readDXF(text);pending={type:'dxf',name:file.name,...dxf};const layers=[...new Set(dxf.features.map(f=>f.layer))];selectOptions(q('[data-layers]'),layers.map(l=>[l,l]),layers[0]);q('[data-crs]').value='';q('[data-zone-value]').value='';q('[data-refs]').value='';calibrate();if(persist)q('[data-import-details]').textContent=dxf.skipped?'Elementos no importados: '+dxf.skipped+'.':'';note(persist?'Archivo leído. Falta confirmar dónde se ubica el plano. Podés resolverlo en Datos del plano o cancelar esta carga.':'Elegí la capa y el sistema de coordenadas.'+(dxf.skipped?' Entidades omitidas: '+dxf.skipped+'.':''));return;}
    if(!['kml','json','geojson'].includes(ext))throw Error('Elegí KML, DXF ASCII, GeoJSON o una imagen.');
    const imported=ext==='kml'?importKML(text):importGeoJSON(text);recordImport(file.name,imported);note('Plano incorporado: '+imported.length+' elementos.');
   });
 }
 q('[data-plan]').onchange=safe(async e=>{const file=e.target.files[0];e.target.value='';await loadPlanFile(file);});
 click('[data-vectoradd]',()=>{const input=q('[data-vector]'),text=input.value.trim();if(!text||text.length>30*1024*1024)throw Error('Pegá el contenido de un KML o GeoJSON de hasta 30 MB.');const kml=text.startsWith('<');recordImport(persist?'Plano pegado':kml?'KML':'GeoJSON',kml?importKML(text):importGeoJSON(text));input.value='';note('Lotes y líneas incorporadas al plano.');});
 click('[data-cancelimport]',release);
 click('[data-import]',()=>exclusive(async()=>{
   let check=null,reconstruction=null;
   if(pending.type==='dxf'){
     const crs=q('[data-crs]').value,ref=crs==='local'?refs(q('[data-refs]').value):null;check=ref?.error;
     const convert=ref?.transform||dxfProjection(crs,q('[data-zone-value]').valueAsNumber),layer=q('[data-layers]').value,swap=q('[data-swap]').checked;
     const rebuilt=reconstructDXFLots(pending.features.filter(f=>f.layer===layer),{labels:pending.labels||[],tolerance:.02,includeNested:persist});
     const proposed=persist?classifyDXFCandidates(rebuilt.features):null,project=p=>convert(swap?[p[1],p[0]]:p);
     const result=convertDXF(proposed?.features||rebuilt.features,project);
     const discarded=proposed?.discarded.length?convertDXF(proposed.discarded,project):[];
     recordImport(pending.name+' · '+layer,result);
     if(proposed){scene.dxfBlocks=[...(scene.dxfBlocks||[]),...proposed.blocks];scene.dxfDiscarded=[...(scene.dxfDiscarded||[]),...discarded];}
     if(proposed||!rebuilt.report.alreadyClosed){reconstruction={...rebuilt.report,classification:proposed?.report,source:pending.name,layer,texts:pending.labels?.length||0};scene.dxfReviews||=[];scene.dxfReviews.push(reconstruction);refresh();}
   }else{
     const r=refs(q('[data-refs]').value);check=r.error;const corners=[[0,0],[1,0],[0,1]].map(r.transform);
     if(corners.some(p=>!gps(p)))throw Error('Las referencias ubican el croquis fuera del mapa.');
     scene.raster={name:pending.name,url:pending.url||await store(pending.file,'web'),corners,...(pending.captura?{captura:pending.captura}:{}),...(check==null?{}:{checkMeters:check})};changed();refresh();
   }
   if(check!=null){scene.checks||=[];scene.checks.push({name:pending.name,meters:check});refresh();}
   note(reconstruction?.classification?reconstruction.classification.total+' cierres leídos: '+reconstruction.classification.kept+' candidatos agrupados y '+reconstruction.classification.discarded+' apartados para revisar. Podés recuperar los descartados, corregir las manzanas y numerar tocando. No se completaron líneas ausentes.':reconstruction?reconstruction.reconstructed+' cierres encontrados para revisar. '+reconstruction.identified+' tienen manzana y número reconocidos. No se completaron líneas ausentes. Identificá o descartá cada cierre antes de confirmar qué fichas incorporar.'+(check!=null?' Diferencia del cuarto punto: '+check.toFixed(1)+' m.':''):check!=null?'Diferencia en el cuarto punto: '+check.toFixed(1)+' m. Revisá el calce en el plano.':'Plano incorporado. Contrastá el resultado con un punto conocido.');release();
 }));
 function addCam(item,metadata={}){
   if(scene.cameras.some(c=>c.url===item.url||(item.hash&&c.hash===item.hash)))throw Error('Esta panorámica ya es una estación.');
   const c={...item,id:crypto.randomUUID(),point:metadata.point||null,heading:metadata.heading??0,height:metadata.height??60,headingEstimated:metadata.heading==null,heightEstimated:true,heightReference:metadata.heightReference||'estimated',adjustment:'pending'};scene.cameras.push(c);camId=c.id;featureId='';changed();refresh();
 }
 const bank=mediaList(config,'',{local}).filter(m=>m.tipo==='panorama');
 if(bank.length){const sel=node('select');sel.setAttribute('aria-label','Panorámica del banco');bank.forEach(m=>sel.add(new Option(m.titulo,m.id)));const b=node('button','Usar panorámica del proyecto');b.type='button';b.onclick=safe(()=>{const m=bank.find(m=>m.id===sel.value);addCam({name:m.titulo,url:m.url,...(m.alta?{alta:m.alta,miniatura:m.miniatura}:{}),...(m.original?{original:m.original}:{}),hash:m.sha256Original},m.captura||{});});q('[data-bank]').append(sel,b);}
 q('[data-panos]').onchange=safe(async e=>{const files=[...e.target.files];e.target.value='';await exclusive(async()=>{
    const hashes=new Set(scene.cameras.map(c=>c.hash)),reports=[];
    for(const [i,file] of files.entries()){note('Preparando '+(i+1)+' de '+files.length+' · '+file.name);
      const info=await inspectMediaFile(file,'panorama');if(hashes.has(info.sha256Original))throw Error('Ya se agregó '+file.name+'. Las estaciones anteriores quedaron disponibles.');
      const meta=info.captura,parts=await prepareMediaDerivatives(file,'panorama',info,{onProgress:note});
      const url=await store(parts.web,'web'),alta=await store(parts.alta,'alta'),miniatura=await store(parts.miniatura,'miniatura');addCam({filename:file.name,name:file.name.replace(/\.[^.]+$/,''),url,alta,miniatura,hash:info.sha256Original},meta);hashes.add(info.sha256Original);reports.push(mediaPreparationLabel(file,parts));
    }
    note('Estaciones cargadas. Ubicalas en el plano y usá Ajustar mirando para alinear cada foto.\n'+reports.join('\n'));
 });});
 q('[data-photo]').onchange=safe(async e=>{const file=e.target.files[0],f=feature();e.target.value='';if(!file||f?.kind!=='poi')return;await exclusive(async()=>{const parts=await prepareMediaDerivatives(file,'foto');f.photo=await store(parts.web,'web');changed();refresh();});});
 function draftConfig(){const lotData={...config.lotes};for(const [id,key] of bindings){if(!key&&!lotData[id]?.elementoRecorrido)continue;const next={...lotData[id]};if(key)next.elementoRecorrido=key;else delete next.elementoRecorrido;lotData[id]=next;}for(const [id,patch]of lotPatches)if(Object.hasOwn(patch,'zonaVenta'))lotData[id]={...lotData[id],zonaVenta:patch.zonaVenta};return {...config,lotes:lotData,recorrido:{...config.recorrido,version:1,proyectoId:identity.id,escena:scene}};}
 click('[data-preview]',()=>{const issue=sceneIssue(scene,{local});if(issue){blockedSceneIssue=issue;note(issue);return;}blockedSceneIssue='';openScene(scene,{local,projectSlug:identity.slug,config:draftConfig(),lots,preview:true});});
 q('[data-enable]').onchange=()=>{scene.enabled=q('[data-enable]').checked;changed();};
 function inventoryPlan(){
   const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
   const identified=f=>/^manzana\s+\S+(?:\s+\S+)*?\s*[·,–-]?\s+lote\s+\S+(?:\s+\S+)*$/i.test(f.name.trim());
   const allMissing=unlinked().filter(f=>!sheetCreates.has(f.id)),unreviewed=allMissing.filter(f=>f.dxfReconstructed&&!identified(f)),missing=allMissing.filter(f=>!unreviewed.includes(f)),names=missing.map(f=>normalize(f.name));
   const existing=new Set(lots.map(l=>normalize(l.numero)));
   const valid=missing.every(f=>![...bindings.values()].includes(f.id)&&identified(f))&&new Set(names).size===names.length&&!names.some(n=>existing.has(n));
   return {missing,unreviewed,valid};
 }
 function imageInventory(){const linked=new Set(Object.values(config.lotes||{}).map(l=>l.elementoImagen).filter(Boolean));return imageLots(scene.imagePlan).filter(f=>!f.hidden&&!linked.has(f.id)).map(f=>({...f,source:'image'}));}
 function preparationIssue(){
   if(scene.imagePlan){const error=imagePlanIssue(scene.imagePlan)||tracer?.issue();if(error)return error;const existing=new Set(lots.map(l=>String(l.numero).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()));if(imageInventory().some(f=>existing.has(f.name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim())))return 'Hay una manzana y número que ya existen en Lotes. Revisá la identificación del calco antes de guardar.';} 
   if(!scene.features.length&&!scene.raster&&!scene.cameras.length&&!scene.imagePlan)return 'Todavía no cargaste material. Elegí un plano o una foto para empezar; también podés volver al proyecto.';
   if(scene.features.length>5000)return 'El plano supera los 5000 elementos. Elegí una capa más acotada o cancelá la importación.';
   const ids=new Set();
   for(const f of scene.features){
     if(!f.id||ids.has(f.id)||!['lot','line','poi'].includes(f.kind)||!Array.isArray(f.points)||f.points.length<({lot:3,line:2,poi:1})[f.kind]||!f.points.every(gps))return 'Hay un elemento incompleto o repetido. Revisalo en el plano o cancelá esta preparación.';
     ids.add(f.id);
   }
   if(scene.raster&&(!mediaURL(scene.raster.url,{local})||scene.raster.corners?.length!==3||!scene.raster.corners.every(gps)))return 'Falta alinear la foto. Completá sus tres referencias o cancelá esa importación.';
   if(inventoryConfirmed&&!inventoryPlan().valid)return 'Las identificaciones cambiaron. Revisá los lotes antes de incorporarlos al inventario.';
   return '';
 }
 function mountLoader(){
   dialog.classList.add('rg-loader');
   q('header small').textContent=scene.name;q('header h2').textContent='Cargar el loteo';
   q('[data-close]').textContent='Cancelar';q('[data-save]').textContent='Guardar y seguir después';
   const tag=node('span','Paso 1 de 3','rg-load-tag');q('header').append(tag);
   q('.rg-mobile-nav').remove();
   const stepNames=[['Los lotes','De dónde salen los lotes'],['La foto desde arriba','Fondo del selector de lotes'],['Las fotos 360','Para el recorrido · opcional']];
   const steps=stepNames.map(([title,description],i)=>{
     const article=node('section',null,'rg-load-step');article.dataset.step=i+1;
     article.innerHTML='<button type="button" class="rg-step-toggle"><span class="rg-step-number"></span><span><b></b><span class="rg-step-description"></span></span><span class="rg-step-state"></span></button><div class="rg-step-body"></div>';
     article.querySelector('.rg-step-number').textContent=i+1;article.querySelector('b').textContent=title;article.querySelector('.rg-step-description').textContent=description;
     article.querySelector('button').onclick=()=>setStep(i+1);return article;
   });
   function advanced(title,content){const d=node('details',null,'rg-load-advanced');d.append(node('summary',title));d.append(content);return d;}
   const body=steps.map(s=>s.querySelector('.rg-step-body'));fields.prepend(...steps);
   const entrances=node('div',null,'rg-load-entrances');entrances.setAttribute('role','group');entrances.setAttribute('aria-label','Cómo cargar los lotes');
   entrances.innerHTML='<button type="button" data-entry="plan" aria-pressed="true"><b>Tengo el plano</b><span>Archivo del agrimensor</span></button><button type="button" data-entry="photo" aria-pressed="false"><b>No tengo plano</b><span>Los marco sobre una foto</span></button>';
   const photoStart=node('div',null,'rg-load-notice');photoStart.hidden=true;
   photoStart.innerHTML='<h3>Calcar sobre una imagen</h3><p>Subí una foto desde arriba o una imagen del plano. No necesitás coordenadas GPS.</p><label class="rg-image-upload"><input type="file" data-image-file aria-label="Subir imagen para calcar" accept="image/jpeg,image/png,image/webp"><span class="rg-image-button">Subir imagen</span><span>Foto desde arriba o imagen del plano</span></label><p data-image-file-name></p><div data-image-feedback></div><div data-image-controls hidden></div><button type="button" data-back-plan>Volver al plano</button>';
   body[0].append(entrances,photoStart);
   const planEntry=node('div',null,'rg-load-plan');body[0].append(planEntry);
   const cenital=q('[data-cenital]').closest('label');
   const sitePhoto=q('[data-site-photo]').closest('details');
   const calibration=q('[data-cal]');const importDetails=node('p',null,'rg-load-note');importDetails.dataset.importDetails='';calibration.prepend(importDetails);const technical=advanced('Datos del plano',calibration);
   const source=q('[data-source]');
   const paste=q('[data-vector]').closest('details');paste.querySelector('summary').textContent='Pegar un plano';
   const vectorFile=q('[data-plan]').closest('label');vectorFile.classList.add('rg-load-drop');
   const planInput=q('[data-plan]');planInput.setAttribute('aria-label','Archivo del plano');
   vectorFile.replaceChildren(planInput,node('b','Subí o arrastrá el plano'),node('span','Archivo del agrimensor'),node('span','Elegir archivo','rg-load-file-action'));
   vectorFile.ondragover=e=>{e.preventDefault();vectorFile.classList.add('rg-dragover');};vectorFile.ondragleave=()=>vectorFile.classList.remove('rg-dragover');
   vectorFile.ondrop=safe(async e=>{e.preventDefault();vectorFile.classList.remove('rg-dragover');const files=[...e.dataTransfer.files];if(files.length!==1)throw Error('Elegí un solo archivo de plano. Podés volver a elegirlo o cancelar la carga.');await loadPlanFile(files[0]);});
   const formats=advanced('Formatos admitidos',node('p','DXF ASCII, KML o GeoJSON. Revisá el resultado antes de guardar.','rg-load-note'));
   const planName=node('p',scene.sources?.at(-1)||'','rg-load-file-name');planName.dataset.planName='';
   const feedback=node('div',null,'rg-load-feedback');feedback.append(status);
   const feedbackSlots=[node('div'),node('div'),node('div')];feedbackSlots[0].append(feedback);
   planEntry.append(vectorFile,planName,feedbackSlots[0],formats,paste,source);
   const counters=node('div',null,'rg-load-counts');
   counters.innerHTML='<div><b data-count="lot">0</b><span>lotes listos</span></div><div><b data-count="line">0</b><span>sin número</span></div><div><b data-count="named">0</b><span>descartados</span></div>';
   planEntry.append(counters);
   const dxfReport=node('p',null,'rg-load-note');dxfReport.dataset.dxfReport='';dxfReport.hidden=true;planEntry.append(dxfReport);
   const review=node('div',null,'rg-load-review');
   review.innerHTML='<h3>Revisá los lotes</h3><p data-review-note></p><label><input type="checkbox" data-confirm-inventory> <span data-inventory-label></span></label><p class="rg-load-note">Cada contorno se vincula a una sola ficha. Precio, superficie y disponibilidad se completan desde Lotes.</p><button type="button" data-review-parcels>Revisar identificaciones y vínculos</button>';
   planEntry.append(review,technical);
   const lotName=node('label','Identificación del lote');lotName.dataset.lotName='';lotName.hidden=true;
   const nameField=node('input');nameField.maxLength=140;nameField.placeholder='Manzana 1 · Lote 2';lotName.append(nameField);
   nameField.oninput=()=>{if(feature()?.kind==='lot'){feature().name=nameField.value;if(feature().dxfReconstructed){delete feature().block;delete feature().number;}changed();}};
   nameField.onchange=refresh;
   q('[data-featureform]').prepend(lotName);
   const parcelReview=advanced('Identificaciones y vínculos de los lotes',parcelTools);planEntry.append(parcelReview);
   q('[data-review-parcels]').onclick=()=>{parcelReview.open=true;parcelReview.scrollIntoView({block:'nearest'});q('[data-features]').focus();};
   q('[data-confirm-inventory]').onchange=e=>{inventoryConfirmed=e.target.checked;loaderRefresh();};
   const alignPhoto=node('button','Alinear la foto con tres puntos','rg-photo-launch');alignPhoto.type='button';alignPhoto.hidden=true;
   alignPhoto.onclick=safe(async()=>{
     if(busy)return;if(pending&&pending.type!=='raster')throw Error('Terminá de incorporar el plano antes de alinear la foto.');
     if(!scene.features.some(f=>f.kind==='lot'))throw Error('Cargá primero el plano para poder marcar los mismos lugares en las dos vistas.');
     if(!pending){if(!scene.raster?.url)throw Error('Subí una foto desde arriba para alinearla.');await rasterPending(null,scene.raster.url,scene.raster.name||'Foto aérea');}
     const source=pending,{openPhotoRegistration}=await import('./recorrido-foto.mjs?v=20261114-anillo7c');
     if(pending!==source||!dialog.open)return;
     openPhotoRegistration({url:source.blob||source.url,scene,mapSales:mapSales(),onApply:async result=>{
       if(pending!==source)throw Error('Cambió la foto que estabas alineando. Volvé a abrir el calce.');
       q('[data-refs]').value=result.pairs.map(pair=>[...pair.photo,...pair.plan].map(n=>n.toFixed(10)).join(' ')).join('\n');
       await q('[data-import]').onclick();
       if(pending===source)throw Error(status.textContent||'No se pudo preparar la foto. El calce anterior se conserva.');
       note('Foto alineada en el borrador. '+result.assessment+(result.error==null?'':'. Punto de control: '+result.error.toLocaleString('es-AR',{maximumFractionDigits:1})+' m de desvío')+'. Guardá para conservar los cambios.');
     }});
   });
   const photoEntryIssue=node('p',null,'rg-load-note');photoEntryIssue.setAttribute('role','status');photoEntryIssue.hidden=true;
   body[1].append(cenital,feedbackSlots[1],node('p','Marcá tres lugares en la foto y los mismos en el plano. No necesitás escribir coordenadas.','rg-load-note'),sitePhoto,alignPhoto,photoEntryIssue);
   const photoReferences=node('div');body[1].append(photoReferences);
   body[1].append(advanced('Presentación y diseño del plano',presentation.closest('details')),styleBox.closest('details'));
   body[2].append(node('p','Este paso es opcional. El plano y el inventario se pueden guardar sin fotos 360.','rg-load-note'),panoramas);
   q('[data-panos]').closest('label').after(feedbackSlots[2]);
   const enable=q('[data-enable]').closest('label');body[2].append(enable,q('[data-preview]'));
   const helpDetails=advanced('Qué pedirle al cliente',help);fields.replaceChildren(...steps,helpDetails,node('p','Podés guardar después de cada paso. El selector muestra los lotes vinculados sobre el plano o la imagen de calco. Podés sumar una foto de fondo al plano y panorámicas al recorrido.','rg-load-note'));
   const outputs=node('div',null,'rg-load-outputs');
   outputs.innerHTML='<section><h3>Selector de lotes</h3><p>Plano con cada lote tocable, lista, ficha y consulta.</p><p data-selector-state></p></section><section><h3>Recorrido 360</h3><p>Los mismos lotes, vistos desde las panorámicas.</p><p data-tour-state></p></section>';
   q('.rg-board').append(outputs,node('p','Una sola disponibilidad. El estado y el precio de Lotes se comparten con el plano, la lista, la ficha y el recorrido.','rg-load-sync'));
   const recovery=node('div',null,'rg-load-recovery');recovery.hidden=true;
   recovery.innerHTML='<button type="button" data-keep-review>Seguir revisando</button><button type="button" data-return-project>Volver al proyecto</button>';
   status.after(recovery);q('[data-keep-review]').onclick=()=>{if(pending?.type==='raster'){alignPhoto.click();return;}if(pending){setStep(pending.type==='dxf'?1:2);technical.open=true;calibration.scrollIntoView({block:'start'});q(pending.type==='dxf'?'[data-crs]':'[data-refs]').focus();}else{recovery.hidden=true;setStep(loaderStep);}};q('[data-return-project]').onclick=()=>{if(pending){release();note('Carga cancelada. El plano anterior se conserva.');}else close();};
   const continueButton=node('button','Continuar');continueButton.type='button';continueButton.dataset.continue='';
   const savingNote=node('span','Guardás la preparación; el estado del proyecto se conserva.','rg-load-save-note');q('footer').prepend(savingNote);q('footer').append(continueButton);
   continueButton.onclick=()=>setStep(loaderStep===3?1:loaderStep+1);
   function entry(mode){imageMode=mode==='photo';entrances.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.entry===mode)));photoStart.hidden=!imageMode;planEntry.hidden=imageMode;if(imageMode)q('[data-image-feedback]').append(feedbackSlots[0]);else vectorFile.after(planName,feedbackSlots[0]);draw();}
   entrances.querySelectorAll('button').forEach(b=>b.onclick=()=>entry(b.dataset.entry));q('[data-back-plan]').onclick=()=>entry('plan');
   function setStep(n){loaderStep=n;steps.forEach((s,i)=>{s.querySelector('.rg-step-body').hidden=i+1!==n;s.querySelector('button').setAttribute('aria-expanded',String(i+1===n));s.dataset.active=String(i+1===n);});feedbackSlots[n-1].append(feedback);tag.textContent='Paso '+n+' de 3';continueButton.textContent=n===3?'Volver a los lotes':'Continuar';if(pending?.type==='raster')photoReferences.append(technical);else planEntry.append(technical);}
   loaderRefresh=()=>{
     planName.textContent=pending?.type==='dxf'?pending.name:scene.sources?.at(-1)||'';
     sheetCross?.refresh();
     const parcels=scene.features.filter(f=>f.kind==='lot'),draft=inventoryPlan();
     const signature=JSON.stringify(draft.missing.map(f=>[f.id,f.name]));
     if(reviewSignature!==signature){inventoryConfirmed=false;reviewSignature=signature;}
     const named=parcels.filter(f=>/^manzana\s+.+?\s+lote\s+\S+/i.test(f.name.replace(/[·,–-]/g,' '))).length;
     q('[data-count=lot]').textContent=named;q('[data-count=line]').textContent=parcels.length-named;q('[data-count=named]').textContent=scene.dxfDiscarded?.length||0;
     const latestDXF=scene.dxfReviews?.at(-1);dxfReport.hidden=!latestDXF;if(latestDXF)dxfReport.textContent='Revisá los grupos y los cierres apartados antes de crear fichas. Los contadores muestran el plano actual: lotes listos, cierres sin número y descartados. No se completaron divisiones ausentes. Los trazos originales se conservan y podés guardar la preparación.';
     const checkbox=q('[data-confirm-inventory]');checkbox.disabled=!draft.missing.length||!draft.valid;checkbox.checked=inventoryConfirmed;checkbox.closest('label').hidden=!draft.missing.length;
     q('[data-inventory-label]').textContent=draft.missing.length?'Incorporar '+draft.missing.length+' lotes revisados al inventario al guardar':draft.unreviewed.length?'Identificá los cierres que sean lotes para poder incorporarlos.':'Los lotes ya están vinculados al inventario';
     q('[data-review-note]').textContent=!parcels.length?(scene.features.length?'El archivo contiene líneas, pero todavía no hay lotes cerrados. Podés guardar el plano en preparación o cargar otro archivo con lotes cerrados.':'Cargá el plano para revisar sus lotes.'):draft.missing.length?(draft.valid?'Revisá nombres y contornos. Confirmá abajo si querés crear sus fichas al guardar.':'Hay lotes sin identificación única o con un nombre ya usado. Corregí sus nombres o vinculalos a las fichas existentes. Podés guardar el plano sin incorporarlos todavía.'):'Los '+parcels.length+' lotes tienen su ficha vinculada en Lotes.';
     if(draft.unreviewed.length)q('[data-review-note]').textContent=draft.unreviewed.length+' cierres todavía sin número. Usá Revisar el plano por manzanas para numerarlos tocando, numerar desde una esquina o descartarlos en grupo. Sólo se incorporan las fichas identificadas que confirmes.';
     const allLinked=parcels.length>0&&!draft.missing.length&&!draft.unreviewed.length;review.dataset.state=allLinked?'ready':'review';review.querySelector('h3').textContent=allLinked?'Lotes vinculados':'Revisá los lotes';q('[data-review-parcels]').textContent=allLinked?'Ver identificaciones y vínculos':'Revisar identificaciones y vínculos';q('[data-review-parcels]').hidden=!parcels.length;
     source.textContent=source.textContent.replace(/\btrazos\b/g,'líneas').replace(/\btrazo\b/g,'línea').replace(/^GeoJSON\b|^KML\b/,'Plano pegado');
     const linked=parcels.length>0&&!draft.unreviewed.length&&(!draft.missing.length||inventoryConfirmed),photo=!!scene.raster,photoReview=photoNeedsReview(scene.raster);
     const readyLots=parcels.length-draft.unreviewed.length-(inventoryConfirmed&&draft.valid?0:draft.missing.length);
     const lotCount=readyLots+' '+(readyLots===1?'lote vinculado':'lotes vinculados');
     q('[data-selector-state]').textContent=!parcels.length?'Faltan lotes cerrados':!readyLots?'Falta revisar y vincular los lotes':!photo?lotCount+' sobre el plano sin foto.':photoReview?lotCount+'. Revisá el calce de la foto.':lotCount+' sobre la foto.';
     const tourProblem=sceneIssue(scene,{local});q('[data-tour-state]').textContent=!scene.cameras.length?'Faltan fotos 360 · opcional':tourProblem||(!linked?'Falta vincular los lotes':scene.enabled?'Recorrido habilitado':'Preparado · recorrido deshabilitado');
     q('[data-selector-state]').dataset.ready=String(readyLots>0);q('[data-tour-state]').dataset.ready=String(!tourProblem&&linked&&scene.enabled);
     const planPending=!!pending&&pending.type!=='raster';
     steps.forEach((s,i)=>{const done=[linked&&!planPending,photo&&pending?.type!=='raster',scene.cameras.length>0&&!tourProblem][i];s.querySelector('.rg-step-state').textContent=i===0&&planPending?'Carga pendiente':i===1&&pending?.type==='raster'?'Foto por ubicar':done?'Preparado':i===2?'Opcional':i+1===loaderStep?'En curso':'Pendiente';s.dataset.ready=String(!!done);});
     if(photoReview){steps[1].querySelector('.rg-step-state').textContent='Revisar';steps[1].dataset.ready='false';steps[1].dataset.warning='true';}else delete steps[1].dataset.warning;
     alignPhoto.hidden=pending?.type!=='raster'&&!scene.raster;
     const photoIssue=busy?'Preparando la foto. Esperá a que termine.':!scene.features.some(f=>f.kind==='lot')?'Cargá primero el plano con lotes en el paso 1.':planPending?'Terminá de incorporar el plano o cancelá esa carga en el paso 1.':'';
     alignPhoto.disabled=!!photoIssue;alignPhoto.title=photoIssue;photoEntryIssue.textContent=photoIssue;photoEntryIssue.hidden=alignPhoto.hidden||!photoIssue;
     if(pending){technical.open=pending.type!=='raster';if(pending.type==='raster'){photoReferences.append(technical);if(loaderStep!==2)setStep(2);}else planEntry.append(technical);}
     if(imageMode){
       const n=imageLots(scene.imagePlan).filter(f=>!f.hidden).length,issue=tracer?.issue();
       q('[data-image-controls]').hidden=!scene.imagePlan;
       q('[data-image-file-name]').textContent=scene.imagePlan?.name||'';
       q('[data-selector-state]').textContent=issue||(!n?'Falta calcar los lotes':n+' '+(n===1?'lote':'lotes')+' sobre la imagen al guardar.');
       q('[data-selector-state]').dataset.ready=String(n>0&&!issue);
       if(!parcels.length){
         q('[data-tour-state]').textContent='Para ver los lotes en el recorrido 360, hace falta ubicarlos sobre el terreno.';
         q('[data-tour-state]').dataset.ready='false';
       }
       steps[0].querySelector('.rg-step-state').textContent=issue?'Dibujo pendiente':n?(imageInventory().length?'Listo para guardar':'Preparado'):'En curso';
       steps[0].dataset.ready=String(n>0&&!issue);
     }
     recovery.hidden=!status.textContent;q('[data-keep-review]').textContent=pending?.type==='raster'?'Alinear la foto con tres puntos':pending?'Ubicar el plano':'Seguir revisando';q('[data-return-project]').textContent=pending?'Cancelar carga':'Volver al proyecto';
   };
   const dxfHost=node('div');planEntry.append(dxfHost);
   dxfReview=mountDXFReview({host:dxfHost,getScene:()=>scene,getLinked:()=>new Set([...bindings.values(),...sheetCreates.keys()].filter(Boolean)),onStatus:text=>{status.textContent=text;loaderRefresh();},onChange:(mark=true)=>{if(mark!==false)changed();refresh();},onFocus:points=>{if(!points.length)return;const all=scene.features.flatMap(f=>f.points),span=list=>Math.max(.0008,Math.max(...list.map(p=>p[0]))-Math.min(...list.map(p=>p[0])),(Math.max(...list.map(p=>p[1]))-Math.min(...list.map(p=>p[1])))*1.5);center=[(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2];zoom=Math.max(1,Math.min(12,span(all)/span(points)/1.4));draw();}});
   sheetCross=mountDXFSpreadsheet({host:planEntry,getState:()=>({features:scene.features,zones:salesZones(config).zonas,bindings:new Map([...bindings,...[...sheetCreates.keys()].map(id=>['draft:'+id,id])]),lots:[...lots.map(l=>({...l,zonaVenta:lotPatches.get(l.id)?.zonaVenta??config.lotes?.[l.id]?.zonaVenta??''})),...[...sheetCreates].map(([id,patch])=>({id:'draft:'+id,numero:scene.features.find(f=>f.id===id)?.name,...patch,draftFeature:id}))]}),onFocus:id=>dxfReview.focusFeature(id),onStatus:text=>note(text),onApply:rows=>{
    for(const row of rows){if(row.target&&!row.target.draftFeature&&!lots.some(l=>l.id===row.target.id))throw Error('Cambió una ficha. Volvé a revisar la planilla.');if(row.feature&&!scene.features.some(f=>f.id===row.feature.id))throw Error('Cambió un contorno. Volvé a revisar la planilla.');}
    for(const row of rows){
     const draft=row.target?.draftFeature;
     if(draft||!row.target){const id=draft||row.feature.id;sheetCreates.set(id,{...sheetCreates.get(id),...row.patch});continue;}
     const lot=lots.find(l=>l.id===row.target.id);Object.assign(lot,row.patch);lotPatches.set(lot.id,{...lotPatches.get(lot.id),...row.patch});
     if(row.needsLink&&row.linkConfirmed)bindings.set(lot.id,row.feature.id);
    }
    changed();refresh();
   }});
   tracer=mountImageTracer({root:q('.rg-map'),controls:q('[data-image-controls]'),getPlan:()=>scene.imagePlan,appearance:id=>imageZones?.get(imageLinks.get(id)),paintZone:(shape,id,layer)=>imageZones?.paint(shape,imageLinks.get(id),layer),markZone:(parent,id,points)=>imageZones?.mark(parent,imageLinks.get(id),points),onChange:()=>{changed();draw();},onState:()=>loaderRefresh(),isLinked:id=>Object.values(config.lotes||{}).some(l=>l.elementoImagen===id)});
   q('[data-image-file]').onchange=safe(async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;await exclusive(async()=>{const info=await inspectMediaFile(file,'foto');const parts=await prepareMediaDerivatives(file,'foto',info);const url=await store(parts.web,'web');const image=new Image();image.src=url;await image.decode();scene.imagePlan={...imagePlanV2(scene.imagePlan||{version:1,features:[]}),name:file.name,url,width:image.naturalWidth,height:image.naturalHeight};tracer.reset();changed();draw();note('Imagen cargada. Elegí Lote suelto o Manzana con divisiones para empezar.');});});
   const mobile=node('section',null,'rg-desktop-only');mobile.innerHTML='<h2>Abrí esta herramienta desde una computadora</h2><p>El cargador de loteos necesita una pantalla de computadora para trabajar sobre el plano.</p><button type="button">Volver al proyecto</button>';mobile.querySelector('button').onclick=close;dialog.append(mobile);
   setStep(1);entry(imageMode?'photo':'plan');
 }
 click('[data-save]',()=>exclusive(async()=>{
   if(sheetCross?.issue())throw Error(sheetCross.issue());
   if(pending||mode)throw Error('Terminá la importación o el marcado pendiente, o cancelalo antes de guardar.');
   if(persist){if(imageMode&&!scene.imagePlan)throw Error('Subí una imagen para calcar o volvé a Tengo el plano.');if(!imageMode&&scene.imagePlan&&!scene.features.some(f=>f.kind==='lot'))throw Error('Cargá el plano con sus lotes o volvé a No tengo plano para conservar el calco.');scene.planoActivo=imageMode?'imagen':'vectorial';}
   scene.enabled=q('[data-enable]').checked;if(scene.enabled){const error=sceneIssue(scene,{local});if(error){blockedSceneIssue=error;throw Error(error);}
   }
   if(persist){const error=preparationIssue();if(error)throw Error(error);}
   const inventory=[...(persist&&inventoryConfirmed?inventoryPlan().missing:[]),...(persist?[...sheetCreates].map(([id,lotData])=>{const f=scene.features.find(f=>f.id===id);if(!f)throw Error('Falta un contorno de la planilla. Revisalo antes de guardar.');return {...f,lotData};}):[]),...(persist?imageInventory():[])];
   const retired=tracer?.inventoryChanges()||[];
   await onApply(draftConfig(),{inventory,persist,retired,lotUpdates:[...lotPatches].map(([id,patch])=>({id,patch}))});dirty=false;dialog.close();
 }));
 let exitConfirmation=null;
 function close(){
   if(busy)return;if(!dirty&&!pending){dialog.close();return;}if(exitConfirmation)return;
   const prompt=node('dialog',null,'rg-exit-confirm'),title=node('h2','¿Salir sin guardar?'),actions=node('div'),keep=node('button','Seguir editando'),discard=node('button','Descartar cambios');
   title.id='rg-exit-'+crypto.randomUUID();prompt.setAttribute('aria-labelledby',title.id);prompt.setAttribute('aria-describedby',title.id+'-help');const help=node('p','Los cambios de esta edición todavía no están guardados. Podés seguir editando o descartarlos para volver al proyecto.');help.id=title.id+'-help';
   keep.type=discard.type='button';keep.className='rg-exit-keep';discard.className='rg-exit-discard';keep.onclick=()=>prompt.close();discard.onclick=()=>{prompt.close();dialog.close();};
   actions.append(keep,discard);prompt.append(title,help,actions);exitConfirmation=prompt;document.body.append(prompt);
   prompt.addEventListener('cancel',event=>{event.preventDefault();prompt.close();});prompt.addEventListener('close',()=>{exitConfirmation=null;prompt.remove();if(dialog.open)q('[data-close]').focus();},{once:true});prompt.showModal();keep.focus();
 }
 click('[data-close]',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{sheetCross?.destroy();tracer?.destroy();release();dialog.remove();},{once:true});
 if(persist)mountLoader();
 document.body.append(dialog);dialog.showModal();refresh();return dialog;
}

// El creador conserva su composición abierta mientras el recorrido se edita por encima.
export function openCreatorTour({frame,config,identity,lots,upload,mapImage,local=false}){
 const reply=payload=>frame.contentWindow?.postMessage({type:'mw-tour-result',...payload},location.origin);
 try{
   let applied=false;
   const dialog=editScene({config,identity,lots,upload,mapImage,local,inCreator:true,onApply:next=>{
     reply({recorrido:next.recorrido,lotes:next.lotes});applied=true;
   }});
   dialog.addEventListener('close',()=>{if(!applied)reply({});},{once:true});
 }catch(error){reply({error:error.message});}
}


function markHorizon(camera,save) {
  const dialog=node('dialog',null,'rg-horizon');
  dialog.setAttribute('aria-label','Marcar horizonte');
  dialog.innerHTML='<h2>Marcar horizonte</h2><p>Marcá la silueta de izquierda a derecha sobre la panorámica. Los extremos se unen al girar los 360°.</p><div class="rg-horizon-photo"><img alt="Panorámica completa de la estación"><svg viewBox="0 0 1000 500" preserveAspectRatio="none"><polygon></polygon><polyline></polyline></svg></div><p role="status"></p><footer><button data-back>Deshacer punto</button><button data-cancel>Cancelar</button><button data-ok>Usar horizonte</button></footer>';
  const q=s=>dialog.querySelector(s),img=q('img'),points=[];
  const ordered=()=>points.slice().sort((a,b)=>a[0]-b[0]);
  function ridge() {
    const list=ordered();if(!list.length)return [];
    const [x1,y1]=list[0],[x2,y2]=list.at(-1);
    const seam=y2+(y1-y2)*(1-x2)/(1-x2+x1||1);
    return [[0,seam],...list,[1,seam]];
  }
  function draw() {
    const line=ridge().map(([x,y])=>[1000*x,500*y].join(',')).join(' ');
    q('polyline').setAttribute('points',line);
    q('polygon').setAttribute('points',line?'0,0 '+line+' 1000,0':'');
    q('[data-ok]').disabled=points.length<3;q('[data-back]').disabled=!points.length;
    q('[role=status]').textContent=points.length+' puntos';
  }
  img.src=camera.url;
  q('.rg-horizon-photo').onclick=e=>{
    const rect=e.currentTarget.getBoundingClientRect();
    points.push([(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height]);draw();
  };
  q('[data-back]').onclick=()=>{points.pop();draw();};
  q('[data-cancel]').onclick=()=>dialog.close();
  q('[data-ok]').onclick=async()=>{
    const mask=document.createElement('canvas');mask.width=2048;mask.height=1024;
    const ctx=mask.getContext('2d');ctx.fillRect(0,0,2048,1024);ctx.fillStyle='white';
    ctx.beginPath();ctx.moveTo(0,0);
    for(const [x,y] of ridge())ctx.lineTo(x*2048,y*1024);
    ctx.lineTo(2048,0);ctx.closePath();ctx.fill();
    dialog.inert=true;
    try {
      const blob=await new Promise(resolve=>mask.toBlob(resolve,'image/png'));
      if(!blob)throw Error('No se pudo generar la máscara.');
      await save(new File([blob],'horizonte.png',{type:'image/png'}));dialog.close();
    } catch(error){q('[role=status]').textContent=error.message;}
    finally{dialog.inert=false;}
  };
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);draw();dialog.showModal();
}

function desktopOnlyNotice(){const d=node('dialog',null,'rg-desktop-notice');d.setAttribute('aria-label','Cargador de loteos');d.innerHTML='<h2>Abrí esta herramienta desde una computadora</h2><p>El cargador de loteos necesita una pantalla de computadora para trabajar sobre el plano.</p><button type="button">Volver al proyecto</button>';d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();return d;}
