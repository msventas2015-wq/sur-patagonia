import {isTerrainDetail,terrainCamera,terrainLayer,validTerrainContours} from './recorrido-detalle-terreno.mjs?v=20261124-paseo';
import {ringIdentity,alignRingRows,placeRings,syncMapRings} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {LOT_STATES,isListedLot} from './zonas-venta.mjs?v=20261116-oferta360';
import {contrast,paletteTokens} from './miniweb-palettes.mjs';
import {commercialPresentation,mobileTourViewport} from './miniweb-design.mjs';
import {unitPriceLabel,unitPriceText} from './lote-precio.mjs';
import {appendLotReturnLinks,lotReturnUrl,hideLotInquiry,findPublicLot,lotLinkId} from './recorrido-enlaces.mjs?v=20261120-terrazas';
import {blockName,estados,paintLot,tourZones,tourZoneLegend} from './recorrido-estilo.mjs?v=20261114-anillo7b';
import {simulatedSales,simulateLotStates} from './recorrido-terrazas-qa.mjs?v=20261116-ficha';
import {lotTitle,rotularLotesTerrazas} from './ficha-lote-recorrido.mjs';
import {gps,meters} from './recorrido-geografia.mjs';
import {previewWindow,walkAssets} from './recorrido-paseo.mjs?v=20261124-paseo';
import {mountPanorama,openMediaViewer} from './recorrido-visor-medios.mjs?v=20261124-paseo';
import {mediaList,mediaURL,projectBrochureURL} from './recorrido-medios.mjs?v=20261114-media1';
// Regla de las miniwebs (opción estadosPlano del Explorador): primero el lote, después la manzana.
const lotFirstName=(config,name)=>{const match=config?.bloques?.find(block=>block.tipo==='explorador')?.opciones?.estadosPlano==='regla'&&String(name??'').match(/^(Manzana [^·]+?)\s*·\s*(Lote .+)$/i);return match?match[2]+' · '+match[1]:name};

export const numberIn=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
export const cameraParameters=c=>({heading:c.heading??0,height:c.height??60});
export const cameraNeedsAdjustment=c=>c.adjustment!=='confirmed'&&(c.heading==null||c.height==null||!!c.headingEstimated||!!c.heightEstimated);
export function sceneIssue(scene,{local=false,calibrating=false}={}) {
  if(scene?.version!==1)return 'Este proyecto todavía no tiene un recorrido disponible.';
  if(!Array.isArray(scene.features)||!Array.isArray(scene.cameras)||scene.features.length>5000||scene.features.some(f=>!['lot','line','poi'].includes(f?.kind)||!Array.isArray(f.points)||f.points.length<({lot:3,line:2,poi:1})[f.kind]||f.points.some(p=>!gps(p))))return 'El plano contiene un elemento sin geometría válida.';
 if(scene.raster&&(!mediaURL(scene.raster.url,{local})||scene.raster.corners?.length!==3||!scene.raster.corners.every(gps)))return 'El croquis necesita tres referencias válidas.';
 if(!scene.features?.length && !scene.raster?.corners)return 'Cargá un plano georreferenciado.';
  if(!scene.cameras?.length)return 'Agregá una panorámica para iniciar el recorrido.';
  const missingGround=scene.cameras.find(c=>c.stationType==='ground'&&!gps(c.point));
  if(missingGround&&!calibrating)return 'Ubicá en el plano la estación '+missingGround.name+'.';
  const located=scene.cameras.filter(c=>gps(c.point));
  if(!located.length)return 'Ubicá una estación en el plano para abrir el recorrido.';
  for(const c of located){
    const settings=cameraParameters(c);
    if(c.stationType==='ground' && !calibrating && (c.height==null || c.heightEstimated))return 'Confirmá la altura sobre el plano de '+c.name+'.';
    if(c.terrainContours!=null && !validTerrainContours(c.terrainContours))return 'Revisá los contornos del terreno de '+c.name+'.';
    if(!mediaURL(c.url,{local})||!numberIn(settings.heading,0,360)||!numberIn(settings.height,0.1,10000)||!numberIn(c.tilt??0,-45,45)||!numberIn(c.roll??0,-45,45))return 'Revisá la foto y los ajustes de '+c.name+'.';
  }
  return '';
}
export const node=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e;};
const svgNS='http://www.w3.org/2000/svg';
export function svg(tag,attrs){
  const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;
}
// Survey linework remains in the editor, never over a visitor's panorama.
export function linkedSceneFeatures(scene,linked){
  const cadLayers=new Set((scene.dxfReviews||[]).map(r=>r.layer).filter(v=>v!=null));
  return scene.features.filter(f=>f.kind==='lot'?!!linked.get(f.id):!(f.kind==='line'&&cadLayers.has(f.layer)));
}
export function mapStations(map,{cameras=[],xy,geo,active,onMove,onSelect}={}){
  cameras.forEach((camera,index)=>{
    if(!gps(camera.point))return;
    const marker=svg('g',{class:'rg-station-handle',role:'button',tabindex:0,'aria-label':'Estación '+(index+1)+' · '+camera.name+'. Arrastrá para reubicar; también podés usar las flechas.','aria-pressed':String(camera.id===active),'data-station-id':camera.id});
    marker.style.touchAction='none';marker.style.cursor='grab';
    const hit=svg('circle',{r:22,fill:'transparent',stroke:'none',style:'fill:transparent;stroke:none'}),dot=svg('circle',{r:camera.id===active?13:11,class:'station'+(camera.id===active?' sel':''),fill:'#d8bb75',stroke:camera.id===active?'#fff':'#162827','stroke-width':camera.id===active?4:1.5,'vector-effect':'non-scaling-stroke'}),label=svg('text',{y:4,'text-anchor':'middle','pointer-events':'none',fill:'#101514'}),title=svg('title',{});
    label.textContent=index+1;title.textContent='Estación '+(index+1)+' · '+camera.name;marker.append(hit,dot,label,title);map.append(marker);
    const place=p=>marker.setAttribute('transform','translate('+p.join(' ')+')'),point=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(map.getScreenCTM().inverse());return [p.x,p.y];};place(xy(camera.point));
    let drag=null;
    const clear=restore=>{const previous=drag;drag=null;marker.style.cursor='grab';window.removeEventListener('blur',cancel);if(previous&&marker.hasPointerCapture?.(previous.id))marker.releasePointerCapture(previous.id);if(restore){place(xy(camera.point));syncMapRings(map);}};
    const cancel=()=>clear(true);
    marker.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.button!==0||drag)return;e.preventDefault();const p=point(e),origin=xy(camera.point);drag={id:e.pointerId,start:p,origin,current:origin};marker.setPointerCapture(e.pointerId);marker.style.cursor='grabbing';window.addEventListener('blur',cancel);});
    marker.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;e.stopPropagation();const p=point(e);drag.current=drag.origin.map((v,k)=>v+p[k]-drag.start[k]);place(drag.current);syncMapRings(map);});
    marker.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;e.stopPropagation();const current=drag.current,moved=Math.hypot(...current.map((v,k)=>v-drag.origin[k]))>2;clear(false);const next=geo(current);if(moved&&gps(next))onMove?.(camera.id,next);else{place(xy(camera.point));onSelect?.(camera.id);}});
    marker.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.id)cancel();});marker.addEventListener('lostpointercapture',()=>{if(drag)cancel();});
    marker.addEventListener('click',e=>e.stopPropagation());
    marker.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();onSelect?.(camera.id);return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();const p=xy(camera.point),next=geo(p.map((v,k)=>v+delta[k]*(e.shiftKey?16:4)));if(gps(next))onMove?.(camera.id,next);});
  });
}
export function mapView(target,scene,{local=false,linked=new Map(),zones,active,onPick,onSelect,onStationMove,extra=[],zoom=1,center,landOnly=false,focusLot}={}) {
  const rasterCorners=scene.raster?.corners||[];
  const land=[...scene.features.filter(f=>f.kind!=='poi').flatMap(f=>f.points),...rasterCorners].filter(gps);
  if(rasterCorners.length===3 && rasterCorners.every(gps)){
    const [origin,right,bottom]=rasterCorners;
    land.push([right[0]+bottom[0]-origin[0],right[1]+bottom[1]-origin[1]]);
  }
  const coords=landOnly&&land.length?land:[...land,...scene.features.filter(f=>f.kind==='poi').flatMap(f=>f.points),...scene.cameras.map(c=>c.point),...extra].filter(gps);
  target.replaceChildren();
  if(!coords.length){target.append(node('p','Cargá el plano o ingresá la primera coordenada para ver el mapa.'));return;}
  let west=180,east=-180,north=-90,south=90;
  for(const [x,y] of coords){west=Math.min(x,west);east=Math.max(x,east);south=Math.min(y,south);north=Math.max(y,north);}
  let mid=center||[(east+west)/2,(north+south)/2],lotWidth=0,lotHeight=0;
  if(focusLot?.points?.length){
    let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
    for(const [x,y] of focusLot.points){
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    mid=[(left+right)/2,(bottom+top)/2];lotWidth=right-left;lotHeight=top-bottom;
  }
  const ratio=Math.max(.01,Math.cos(mid[1]*Math.PI/180));
  const totalSpan=Math.max(.0008,(east-west)*ratio,(north-south)*1.5)*1.12/zoom;
  const span=lotWidth||lotHeight?Math.min(totalSpan,Math.max(lotWidth*ratio,lotHeight*1.5)*4):totalSpan;
  const xy=([x,y])=>[450+(x-mid[0])*900*ratio/span,300-(y-mid[1])*900/span];
  const geo=([x,y])=>[mid[0]+(x-450)*span/(900*ratio),mid[1]-(y-300)*span/900];
  const map=svg('svg',{viewBox:'0 0 900 600','aria-label':'Plano del recorrido',role:'img'});
  target.append(map);
  if(scene.raster?.corners && mediaURL(scene.raster.url,{local})){
    const [a,b,c]=scene.raster.corners.map(xy);
    map.append(svg('image',{href:scene.raster.url,width:1,height:1,preserveAspectRatio:'none',transform:'matrix('+[b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1],...a].join(' ')+')'}));
  }
  function add(shape,id,title,selectable=true) {
    shape.classList.toggle('sel',id===active);
    const t=svg('title',{});t.textContent=title;shape.append(t);map.append(shape);
    if(onSelect&&selectable)shape.addEventListener('click',e=>{if(!onPick){e.stopPropagation();onSelect(id);}});
  }
  for(const f of scene.features){
    if(f.kind==='poi'){const [x,y]=xy(f.points[0]);add(svg('circle',{cx:x,cy:y,r:7,class:'place'}),f.id,f.name);}
    else {
      const shape=svg(f.kind==='lot'?'polygon':'polyline',{points:f.points.map(p=>xy(p).join(',')).join(' '),class:f.kind});
      const lot=f.kind==='lot'?linked.get(f.id):null, appearance=zones?.get(lot);
      if(appearance?.hidden)continue;
      if(f.kind==='lot'){
        paintLot(shape,f,appearance?.effective||lot,scene.style);
        zones?.paint(shape,lot,map);
      }
      add(shape,f.id,f.name,!appearance?.unavailable);
      if(appearance?.zone)zones.mark(map,lot,f.points.map(xy));
    }
  }
  if(onStationMove)mapStations(map,{cameras:scene.cameras,xy,geo,active,onMove:onStationMove,onSelect});
  else scene.cameras.forEach((c,i)=>{if(!gps(c.point))return;const [x,y]=xy(c.point);
    add(svg('circle',{cx:x,cy:y,r:12,class:'station'}),c.id,c.name);const n=svg('text',{x,y:y+4,'text-anchor':'middle','pointer-events':'none'});n.textContent=i+1;map.append(n);});
  if(extra.length)map.append(svg('polyline',{points:extra.map(p=>xy(p).join(',')).join(' '),class:'sketch'}));
  if(onPick)map.addEventListener('click',e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(map.getScreenCTM().inverse());const point=geo([p.x,p.y]);if(gps(point))onPick(point);});
  return {xy,geo};
}

const officeAddress = 'Av. San Martín 3229';
const officeNote = 'Ubicación aproximada';
const isOffice = feature => feature.kind === 'poi' && feature.marker === 'office-bolson';

// WGS84 positions of the Álamos landscape references. Its local survey origin
// is 1538486.02 E, 5351831.61 N in POSGAR 2007 / Argentina 1.
const regionalPlaces = [
  ['office','Oficina Sur Patagonian',-71.533981,-41.9591174,0],
  ['puelo','Lago Puelo',-71.6000125,-42.0640998,-110],
  // Terrazas uses the visual anchor approved on the mountain, formerly labelled Refugio.
  ['piltri','Cerro Piltriquitrón',-71.4780277,-41.9790988,1190],
  ['hoyo','El Hoyo',-71.5203233,-42.0604003,-50]
];

function strokeIcon(path) {
  const icon = svg('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'});
  icon.append(svg('path',{d:path}));
  return icon;
}

function landscapeMarker(feature, flyTo) {
  const camera = feature.kind === 'camera';
  const office = isOffice(feature);
  const skyLink = camera && !!flyTo;
  const width = skyLink ? 44 : office ? 224 : camera ? 162 : Math.min(210,Math.max(70,feature.name.length*7+12));
  const height = skyLink ? 44 : camera ? 56 : office ? 48 : 30;
  const content = svg('foreignObject',{width,height});
  const label = node(skyLink?'button':'div',null,office ? 'rg-office-mark' : camera ? 'rg-camera-mark' : 'rg-place-mark');
  const copy = node('div');
  copy.append(node('b',feature.name));
  if (office) {
    const logo=node('img');logo.src='/assets/logos/picos-blanco.png';logo.alt='';
    label.append(logo);copy.append(node('span',officeAddress),node('small',officeNote));
  } else if (skyLink) {
    label.type='button'; label.classList.add('rg-sky-link');
    label.setAttribute('aria-label','Ir a '+feature.name);
    label.append(strokeIcon('M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 1 1 8 0'));
    label.onclick=()=>flyTo(feature.id);
  } else if (camera) {
    label.append(node('strong','360°'));copy.append(node('small','Explorar ↗'));
  }
  if(!skyLink)label.append(copy);
  content.append(label);
  const guide=svg('path',{class:'rg-marker-guide'});
  const diamond=svg('path',{class:'rg-marker-anchor',d:'M0 -3.5 L3.5 0 L0 3.5 L-3.5 0 Z'});
  return {content,guide,diamond,width,height};
}

// Find the upper edge of this block at a screen x, including perspective and near-plane clipping.
function blockEdge(members,coordinate,axis=0,far=false) {
  let edge=far?-Infinity:Infinity;
  for(const {outline} of members){
    if(!outline?.length)continue;
    let a=outline.at(-1);
    for(const b of outline){
      if((a[axis]<=coordinate && coordinate<b[axis]) || (b[axis]<=coordinate && coordinate<a[axis])){
        const fraction=(coordinate-a[axis])/(b[axis]-a[axis]);
        const other=1-axis,value=a[other]+fraction*(b[other]-a[other]);
        edge=far?Math.max(edge,value):Math.min(edge,value);
      }
      a=b;
    }
  }
  return edge;
}
// Measure the clearance in screen pixels, including narrow or oblique parcels.
function roomForLotNumber(point,outline,clearance=16) {
  if (!outline || outline.length<3) return false;
  const [x,y]=point;
  let inside=false;
  let a=outline.at(-1);
  for (const b of outline) {
    const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    if (length2) {
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length2));
      if ((x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2<clearance**2) return false;
      if ((a[1]>y)!==(b[1]>y) && x<a[0]+dx*(y-a[1])/dy) inside=!inside;
    }
    a=b;
  }
  return inside;
}
function ringTouchesPanel(entity,bounds){
  const [x,y]=entity.anchor;
  const dx=Math.max(bounds[0]-x,0,x-bounds[2]);
  const dy=Math.max(bounds[1]-y,0,y-bounds[3]);
  return dx*dx+dy*dy <= (entity.d/2+3)**2;
}
export function openScene(scene,{local=false,config,lots=[],financing,brochureUrl,onLotBrochure,returnUrl,slug,projectSlug=slug,lotId,preview=false,calibration=null,reviewMedia=[],reviewStart,detailStart,initialFlight}={}) {
  const issue=sceneIssue(scene,{local,calibrating:!!calibration});if(issue)throw Error(issue);
  const autoEmbedded=window.parent!==window && new URLSearchParams(location.search).get('miniweb-auto')==='1';
  scene={...scene,cameras:scene.cameras.filter(c=>gps(c.point)).map(c=>({...c,...cameraParameters(c)}))};
  // Los contornos guardan geometría; los datos publicados se resuelven por identidad.
  lots=rotularLotesTerrazas(projectSlug,lots);
  const simulating=simulatedSales(projectSlug);
  if (simulating) lots=simulateLotStates(lots);
  const zones=tourZones(config,projectSlug,lots);
  const linked = new Map();
  for (const lot of lots) {
    const record=config?.lotes?.[lot.id];
    if (!record?.elementoRecorrido || record.fichaEnRecorrido===false) continue;
    const key=record.elementoRecorrido;
    linked.set(key,linked.has(key)?null:(zones?.get(lot)?.effective||lot));
  }
  scene={...scene,features:linkedSceneFeatures(scene,linked).filter(f=>!zones?.get(linked.get(f.id))?.hidden).map(f=>{
    if(f.kind!=='lot')return f;
    const lot=linked.get(f.id);
    return {id:f.id,points:f.points,height:f.height,kind:'lot',block:f.block,stage:f.stage,name:lot?lotTitle(lot):'Contorno del plano'};
  })};
  const interactive=f=>f.kind==='poi'||(f.kind==='lot'&&isListedLot(linked.get(f.id)));
  function linkedFeature(publicId){
    const lot=findPublicLot(config,lots,publicId);
    return lot && scene.features.find(f=>linked.get(f.id)?.id===lot.id && interactive(f));
  }
  const dialog=node('dialog',null,'rg-tour');dialog.setAttribute('aria-label','Recorrido de '+scene.name);
  const commercialStates=config?.bloques?.some(b=>b.tipo==='explorador' && b.opciones?.estadosPlano==='regla');
  dialog.toggleAttribute('data-regla-estados',Boolean(commercialStates));
  const embeddedOverview=window.parent!==window && new URLSearchParams(location.search).get('integrado')==='1'
    && commercialStates;
  dialog.toggleAttribute('data-resumen-embebido',embeddedOverview);
  const commercialCard = commercialStates && commercialPresentation(config);
  if (commercialCard) {
    const palette = paletteTokens(config.paleta);
    dialog.dataset.terrazasComercial = '';
    dialog.style.setProperty('--rg-action', palette.accion);
    const text = contrast(palette.accion, palette.textoAccion) >= 4.5 ? palette.textoAccion
      : contrast(palette.accion, '#ffffff') >= 4.5 ? '#ffffff' : '#000000';
    dialog.style.setProperty('--rg-action-text', text);
  }
  dialog.innerHTML=`
    <div class="rg-stage rm-stage"></div>
    <header class="rg-identity"><div><small></small><h2></h2></div></header>
    <div class="rg-compass" aria-hidden="true"></div>
    <nav class="rg-actions" aria-label="Opciones del recorrido">
      <button type="button" data-sky aria-pressed="false" hidden>Hora azul</button>
      <button type="button" data-map aria-expanded="false">Plano y lugares</button>
      <button type="button" data-close>Cerrar recorrido</button>
    </nav>
    <div class="rg-world-title" aria-hidden="true" hidden></div>
    <aside class="rg-card" aria-label="Ficha seleccionada" hidden></aside>
    <div class="rg-atlas" hidden><div class="rg-atlas-head"><strong>Plano del loteo</strong><button type="button" data-closemap aria-label="Cerrar plano">×</button></div>
      <div class="rg-map"></div><label>Lotes y lugares<select data-places></select></label></div>
    <aside class="rg-locator" aria-label="Ubicación del lote" hidden><header><strong>Ubicación del lote</strong><button type="button" aria-label="Ocultar ubicación">−</button></header><div class="rg-map"></div><small></small></aside>
    <div class="rg-tip" hidden></div>
    <footer><button type="button" data-play>Reproducir</button><button type="button" data-prev aria-label="Vista anterior">←</button>
      <select aria-label="Estación del recorrido"></select><button type="button" data-next aria-label="Vista siguiente">→</button>
      <button type="button" data-layers aria-pressed="true">Trazado</button></footer>
    <p role="status"></p>
    <small class="rg-credit" hidden>Cielo recreado · estrellas adaptadas de <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener">ESO/S. Brunier</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></small>`;
  const q=s=>dialog.querySelector(s),stage=q('.rg-stage'),card=q('.rg-card'),atlas=q('.rg-atlas'),selector=q('footer select'),places=q('[data-places]');
  let calibrationApply,endCalibration=()=>{},refreshPlan=()=>{},centerPlan=()=>{};
  if(preview){dialog.classList.add('rg-tour-preview');q('footer').prepend(q('[data-close]'));}
  if(calibration){
    dialog.classList.add('rg-calibration');dialog.setAttribute('aria-label','Ajustar estación mirando');
    const camera=scene.cameras.find(c=>c.id===calibration.cameraId);if(!camera)throw Error('Elegí una estación ubicada en el plano.');
    const original={heading:camera.heading,height:camera.height},controls=node('section',null,'rg-calibration-controls');controls.setAttribute('aria-label','Alinear el plano sobre la foto');
    controls.append(node('h3','Alineá el plano sobre la foto'),node('p','Arrastrá la foto para mirar el loteo. Mové los controles hasta que sus límites coincidan con el terreno.'));
    const settings=node('div',null,'rg-calibration-settings');
    for(const [key,title,min,max,step,suffix]of [['heading','Girar el plano',0,360,.5,'°'],['height','Altura sobre el plano',.1,Math.max(300,camera.height*2),.1,' m']]){
      const label=node('label',title),output=node('output'),range=node('input');range.type='range';range.min=min;range.max=max;range.step=step;range.value=camera[key];range.setAttribute('aria-label',title);output.textContent=Number(camera[key]).toLocaleString('es-AR',{maximumFractionDigits:1})+suffix;
      range.oninput=()=>{camera[key]=Number(range.value);output.textContent=Number(camera[key]).toLocaleString('es-AR',{maximumFractionDigits:1})+suffix;range.setAttribute('aria-valuetext',output.textContent);clean.redraw?.();};
      range.onkeydown=event=>{const delta={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();range.value=String(Math.max(Number(min),Math.min(Number(max),Number(range.value)+delta*(event.shiftKey?10:1))));range.oninput();};label.append(output,range);settings.append(label);
    }
    const actions=node('div',null,'rg-calibration-actions'),apply=node('button','Confirmar ajuste'),cancel=node('button','Cancelar');apply.type=cancel.type='button';apply.className='rg-calibration-apply';apply.disabled=true;calibrationApply=apply;
    endCalibration=commit=>{if(!calibration)return;try{if(commit)calibration.onApply?.({heading:camera.heading,height:camera.height,headingEstimated:false,heightEstimated:false,adjustment:'confirmed'});else Object.assign(camera,original);calibration=null;refreshPlan();controls.remove();dialog.classList.remove('rg-calibration');dialog.setAttribute('aria-label','Recorrido de '+scene.name);q('footer').hidden=false;q('[data-map]').hidden=false;q('[data-layers]').hidden=false;q('[data-close]').textContent='Volver al editor';clean.redraw?.();q('[data-close]').focus();q('[role=status]').textContent=commit?'Ajuste confirmado. Estás viendo el recorrido.':'Ajuste cancelado. Se conserva la vista anterior.';}catch(error){q('[role=status]').textContent=error.message;}};
    apply.onclick=()=>endCalibration(true);cancel.onclick=()=>endCalibration(false);const center=node('button','Centrar en los lotes');center.type='button';center.onclick=()=>centerPlan();actions.append(center,apply,cancel);controls.append(settings,actions);dialog.append(controls);
    q('[data-close]').textContent='Cancelar ajuste';q('footer').hidden=true;q('[data-map]').hidden=true;q('[data-layers]').hidden=true;
  }
  q('header small').textContent=preview?'Vista previa':'Recorrido aéreo 360°';
  const identityTitle=q('.rg-identity h2');
  identityTitle.textContent=scene.title || scene.name;
  identityTitle.hidden=scene.titlePlacement==='center';
  q('[data-close]').textContent=calibration?'Cancelar ajuste':returnUrl?'Volver al proyecto':preview?'Volver al editor':'Cerrar recorrido';
  const world=q('.rg-world-title'),titleText=(scene.title || scene.name).trim();
  if (identityTitle.hidden) world.removeAttribute('aria-hidden');
  const words=titleText.split(/\s+/);
  const titles=titleText.includes('\n')?titleText.split(/\n+/):words.length>1?[words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')]:words;
  world.append(node('small','Recorrido aéreo 360°'),...titles.filter(Boolean).map(text=>node('strong',text)));
  const key=node('div',null,'rg-sale-key');
  const counts={disponible:0,reservado:0,vendido:0,proximamente:0,sin:0};
  for(const f of scene.features){
    const lot=linked.get(f.id);
    if(f.kind==='lot' && isListedLot(lot))counts[Object.hasOwn(counts,lot.estado)?lot.estado:'sin']++;
  }
  if(embeddedOverview){
    const n=zones?.counts.states.disponible ?? counts.disponible;
    q('.rg-identity').append(node('strong',n+(n===1?' lote disponible':' lotes disponibles'),'rg-available-summary'));
    q('[data-layers]').textContent='Ocultar lotes';
  }
  const inventory=zones?.counts.states || counts;
  function stateBadges(){
    const badges=[];
    for(const [state,count] of Object.entries(inventory)){
      if(!count && (state==='sin'||state==='proximamente'))continue;
      const badge=node('span',LOT_STATES[state].text);
      badge.style.setProperty('--lot-fill',LOT_STATES[state].color);
      badge.append(node('em',' '+count));
      badges.push(badge);
    }
    const off=lots.some(lot=>{
      const effective=zones?.get(lot)?.effective || lot;
      return !effective.zonaOculta && effective.estado==='no_a_la_venta';
    });
    if(off){
      const badge=node('span','No comercializado');
      badge.dataset.zoneOff='true';
      badges.push(badge);
    }
    return badges;
  }
  if(commercialStates && zones?.settings.colorPor==='zona'){
    key.setAttribute('role','group');
    key.setAttribute('aria-label','Disponibilidad de los lotes');
    const availability=node('div',null,'rg-state-key');
    availability.append(...stateBadges());
    key.append(node('strong',zones.counts.total+' lotes comercializados'),availability);
    q('.rg-atlas-head').after(key.cloneNode(true));
    q('.rg-identity').append(key);
  }else if(zones?.settings.colorPor==='zona'){
    key.setAttribute('role','group');
    key.setAttribute('aria-label','Zonas y disponibilidad');
    const total=node('strong',zones.counts.total+' lotes');key.append(total);
    for(const row of zones.legend){
      const badge=node('span',row.label);
      if(row.color)badge.style.setProperty('--lot-fill',row.color);if(row.off)badge.dataset.zoneOff='true';
      if(row.count!=null)badge.append(node('em',' '+row.count));
      key.append(badge);
    }
    const availability=node('div',null,'rg-state-key');
    for(const [state,count] of Object.entries(zones.counts.states)){
      if(!count&&state==='sin')continue;
      const badge=node('span',LOT_STATES[state].text);badge.style.setProperty('--lot-fill',LOT_STATES[state].color);badge.append(node('em',' '+count));availability.append(badge);
    }
    key.append(availability);
    if(key.childElementCount){q('.rg-atlas-head').after(key.cloneNode(true));q('.rg-identity').append(key);}
  }else if(Object.values(counts).some(Boolean)){
    key.setAttribute('role','group');
    key.setAttribute('aria-label','Disponibilidad de los lotes');
    for(const [state,count] of Object.entries(counts)){
      const badge=node('span',state==='sin'?'Sin información':estados[state]);
      paintLot(badge,{}, {estado:state},{...scene.style,mode:'estado'});
      badge.append(node('em',' '+count));
      key.append(badge);
    }
    q('.rg-atlas-head').after(key.cloneNode(true));
    q('.rg-identity').append(key);
  }
  function stationName(c,i){
    const file=c.filename?.replace(/\.[^.]+$/,'');
    return !c.name || c.name===file ? 'Vista '+(i+1) : c.name;
  }
  const previewDevice=autoEmbedded&&new URLSearchParams(location.search).get('miniweb-preview')==='mobile'?'mobile':'';
  const commercialMobile = (projectSlug === 'terrazas-del-piltri'||commercialPresentation(config)) && autoEmbedded;
  if(commercialMobile&&previewDevice==='mobile'&&mobileTourViewport(innerWidth,matchMedia('(pointer:coarse)').matches,previewDevice))document.documentElement.setAttribute('data-photo-touch','');
  const photoMode = () => commercialMobile && document.documentElement.hasAttribute('data-photo-touch');
  // Original drone identifiers keep the itinerary stable if the editor reorders stations.
  const itinerary = [
    ['0251','Vista cenital'],
    ['0250','Recorrido del loteo · Inicio oeste'],
    ['0249','Recorrido del loteo · Tramo 2'],
    ['0248','Recorrido del loteo · Tramo 3'],
    ['0247','Recorrido del loteo · Tramo 4'],
    ['0246','Recorrido del loteo · Tramo 5'],
    ['0245','Recorrido del loteo · Final este'],
    ['0061','Vista cenital cercana'],
    ['0291','Vista lateral del loteo completo'],
    ['0292','Panorámica del loteo'],
    ['0293','Panorámica en altura · 988 m'],
    ['0294','Panorámica en altura · 647 m'],
    ['0297','Panorámica desde Cerrito La Cruz · Alta'],
    ['0298','Panorámica desde Cerrito La Cruz · Baja']
  ];
  function flightId(cam,index) {
    const flight=[cam.filename,cam.name,cam.url].join(' ').match(/_(\d{4})_D_M4/i)?.[1];
    return flight || cam.sourceFlight || (scene.cameras.filter(c=>!c.id?.startsWith?.('detalle-')).length===itinerary.length ? itinerary[index]?.[0] : null);
  }
  function itineraryTitle(cam,index) {
    const title = stationName(cam,index);
    if (projectSlug !== 'terrazas-del-piltri' || !/^(Vista\s+\d+$|DJI_)/i.test(title)) return title;
    return itinerary.find(([id])=>id===flightId(cam,index))?.[1] || title;
  }
  function isPanoramic(camera,i) {
    return camera.marker==='context' || (!camera.marker && /^panor[aá]mica\b/i.test(camera.name)) ||
      (projectSlug==='terrazas-del-piltri' && /^panor[aá]mica\b/i.test(itineraryTitle(camera,i)));
  }
  // Cross on the ridge, identified in the ground photographs of stations 1, 2 and 4.
  // Elevation is relative to the scene datum, like the other terrain features.
  const ridge={id:'terrazas-cerrito-cruz',name:'Cerrito La Cruz',kind:'camera',points:[[-71.5224232,-41.9618515]],height:128.85};
  const ridgeViews=projectSlug==='terrazas-del-piltri' ? scene.cameras.filter((c,i)=>['0297','0298'].includes(flightId(c,i))) : [];
  let compareIcons=false;
  if(projectSlug==='terrazas-del-piltri' && location.hostname==='staging.surpatagonian.com') {
    try {compareIcons=new URL(window.parent.location.href).searchParams.get('maqueta')==='iconos';} catch {}
  }
  if(compareIcons){
    const options=node('div',null,'rg-marker-options');
    options.setAttribute('role','group');options.setAttribute('aria-label','Diseño de los accesos');
    for(const [id,label] of [['camara','Cámara'],['aro','Aro'],['punto','Punto']]){
      const choice=node('button',label);choice.type='button';choice.dataset.style=id;
      choice.setAttribute('aria-pressed',String(id==='camara'));
      choice.onclick=()=>{dialog.dataset.portalStyle=id;for(const b of options.children)b.setAttribute('aria-pressed',String(b===choice));};
      options.append(choice);
    }
    dialog.append(options);
  }
  let aerialReturn;
  if((scene.aerialReturnId || projectSlug==='terrazas-del-piltri') && !calibration) {
    const findStation=(flight,name)=>scene.cameras.find((c,i)=>
      [c.filename,c.url,c.name].some(value=>value?.includes('_'+flight+'_D_M4')) || itineraryTitle(c,i)===name);
    const aerial=Object.hasOwn(scene,'aerialReturnId') ? scene.cameras.find(c=>c.id===scene.aerialReturnId)
      : findStation('0061','Vista cenital cercana') || findStation('0251','Vista cenital');
    if(aerial) {
      aerialReturn=node('button',null,'rg-aerial-return');
      aerialReturn.type='button';aerialReturn.hidden=true;
      aerialReturn.title='Volver a la vista cenital del loteo';
      aerialReturn.setAttribute('aria-label',aerialReturn.title);
      aerialReturn.append(strokeIcon('M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5 M7 7h10v10H7z M12 7v10m0-6h5'));
      aerialReturn.onclick=()=>{select(aerial.id);stage.querySelector('canvas')?.focus({preventScroll:true});};
      dialog.append(aerialReturn);
    }
  }
  const regional = projectSlug==='terrazas-del-piltri' ? regionalPlaces
    .filter(([key,name])=>!scene.features.some(f=>f.kind==='poi'&&(f.name===name || (key==='office'&&isOffice(f)))))
    .map(([key,name,lon,lat,height])=>({id:'terrazas-ref-'+key,name,kind:'poi',points:[[lon,lat]],height,
      marker:key==='office'?'office-bolson':undefined})) : [];
  scene.cameras.forEach((cam,index)=>{
    const name = itineraryTitle(cam,index);
    const label = commercialCard && embeddedOverview ? name.replace(/\s*·\s*\d+\/\d+\s*$/, '') : name;
    selector.add(new Option(label,cam.id));
  });
  const candidates=projectSlug==='terrazas-del-piltri' && !calibration ? reviewMedia : [];
  const viewCount=scene.cameras.length+candidates.length;
  if(candidates.length){
    const group=document.createElement('optgroup');group.label='Panorámicas para elegir';
    candidates.forEach((m,j)=>group.append(new Option((j+1)+'/'+candidates.length+' · DJI '+m.numero+(m.tipo==='abierta'?' · Foto abierta':''),m.id)));
    selector.append(group);
  }
  let compassNeedle, northLetter;
  if (commercialMobile) {
    const ink='#f5f2e8', paper='#17221f';
    const dial=svg('svg',{class:'rg-north-dial',viewBox:'-6 -8 60 64',role:'img','aria-label':'Brújula de orientación del terreno. La N indica el norte.'});
    dial.append(svg('circle',{cx:24,cy:24,r:16.2,fill:paper,'fill-opacity':.86}));
    compassNeedle=svg('g',{});
    const scale=svg('g',{fill:'none',stroke:ink});
    scale.append(svg('circle',{cx:24,cy:24,r:16,'stroke-width':.45}));
    for(let i=0;i<16;i++){
      scale.append(svg('path',{d:'M24 8v16',transform:'rotate('+i*22.5+' 24 24)','stroke-width':.32,opacity:.7}));
    }
    scale.append(svg('circle',{cx:24,cy:24,r:11.3,'stroke-width':.55}),svg('circle',{cx:24,cy:24,r:10.6,'stroke-width':.35}));
    compassNeedle.append(scale);
    for(let i=0;i<8;i++){
      compassNeedle.append(svg('path',{d:'M24 '+(i%2?11.3:2.8)+' L26.3 23.5 L24 26 L21.7 23.5Z',transform:'rotate('+i*45+' 24 24)',fill:ink,stroke:paper,'stroke-width':.2,'stroke-linejoin':'round'}));
    }
    northLetter=svg('text',{x:24,y:1,'text-anchor':'middle',fill:'#fff',stroke:paper,'stroke-width':1.5,'paint-order':'stroke'});
    northLetter.textContent='N';
    compassNeedle.append(northLetter);
    dial.append(compassNeedle,svg('circle',{cx:24,cy:24,r:8.8,fill:paper,stroke:ink,'stroke-width':.55}),
      svg('image',{x:17,y:20.15,width:14,height:7.7,href:'/assets/logos/picos-blanco.png'}));
    q('.rg-identity > div:first-child').append(dial);
    const availability = node('div',null,'rg-mobile-availability');
    availability.setAttribute('aria-label','Disponibilidad de los lotes');
    if(commercialStates && zones?.settings.colorPor==='zona'){
      availability.dataset.commercialKey='';
      availability.append(...stateBadges());
    }else{
      const unavailable = lots.filter(lot=>{
        const effective = zones?.get(lot)?.effective || lot;
        return !effective.zonaOculta && effective.estado === 'no_a_la_venta';
      }).length;
      const rows = [['disponible','Disponibles'],['reservado','Reservados'],['vendido','Vendidos']];
      if (inventory.proximamente) rows.push(['proximamente','Próximamente']);
      if (inventory.sin) rows.push(['sin','Sin informar']);
      rows.push(['no_a_la_venta','No disponibles']);
      for (const [state,label] of rows) {
        const value = state === 'no_a_la_venta' ? unavailable : inventory[state] || 0;
        const badge = node('span',label+' '+value);
        badge.style.setProperty('--state-color',LOT_STATES[state].color);
        availability.append(badge);
      }
    }
    q('.rg-identity').append(availability);
    if (!key.querySelector('strong')) {
      const total = Object.values(counts).reduce((sum,n)=>sum+n,0);
      availability.before(node('strong',total+(total===1?' lote':' lotes'),'rg-mobile-count'));
    }
  }
  places.add(new Option('Elegí un lote o lugar',''));
  scene.features.filter(interactive).forEach(f=>places.add(new Option(lotFirstName(config,f.name),f.id)));
  let index=0,clean=()=>{},timer,playing=false,selected=null,blue=false,hover=null,frame=0;
  const previews=previewWindow();
  let navigation=0, intended=0, activeCamera;
  function walkDirectory(camera) {
    if (calibration || camera?.skyMask || !camera?.paseo) return '';
    if(camera.stationType==='aerial')return '';
    return walkAssets(camera.paseo,{projectId:config?.recorrido?.proyectoId,local});
  }
  function neighborPreviews(i) {
    return [i,i+1,i-1].map(n=>walkDirectory(scene.cameras[n])).filter(Boolean).map(p=>p.vista);
  }
  function stop(){clearTimeout(timer);playing=false;q('[data-play]').textContent='Reproducir';}
  function paintSelection(){
    for(const el of stage.querySelectorAll('[data-geo-id]')) {
      el.classList.toggle('chosen',el.dataset.geoId===selected?.id);
      el.classList.toggle('hovered',el.dataset.geoId===hover?.id);
    }
  }
  let atlasReturn, aimAtLot;
  function updateMap(focusLot){mapView(atlas.querySelector('.rg-map'),scene,{local,linked,zones,active:selected?.id || scene.cameras[index].id,onSelect:select,focusLot});}
  function mapOpen(on,focusLot){
    atlas.hidden=!on;q('[data-map]').setAttribute('aria-expanded',String(on));dialog.classList.toggle('rg-map-open',on);
    if(on){stop();updateMap(focusLot);}
  }
  const locator=q('.rg-locator');
  locator.querySelector('button').onclick=()=>{locator.hidden=true;};
  function locateLot(feature) {
    const plan={...scene,raster:null,cameras:[],features:scene.features.filter(f=>f.kind==='lot')};
    mapView(locator.querySelector('.rg-map'),plan,{local,linked,zones,landOnly:true,active:feature.id});
    locator.querySelector('small').textContent=lotFirstName(config,feature.name);locator.hidden=false;
  }
  function closeCard(){locator.hidden=true;selected=null;places.value='';card.hidden=true;paintSelection();if(!atlas.hidden)updateMap();}
  function locateSelectedLot(f, locate) {
    if (photoMode()) {
      if (aimAtLot(f)) {
        card.hidden = true;
        stage.querySelector('canvas')?.focus({preventScroll:true});
      }
    } else {
      atlasReturn = locate;
      mapOpen(true,f);
      q('[data-closemap]').focus({preventScroll:true});
    }
  }
  function showAvailableLots() {
    card.hidden = true;
    stage.dispatchEvent(new Event('recorrido-toque-fondo', {bubbles:true}));
    stage.dispatchEvent(new Event('recorrido-ver-disponibles', {bubbles:true}));
    if (window.parent === window && slug) location.assign('/'+encodeURIComponent(slug)+'?estado=disponible#lotes');
  }

  function brochureAction(lot) {
    const mode=new URLSearchParams(location.search).get('miniweb-brochure');
    const tourBlock=config?.bloques?.find(block=>block.tipo==='panoramica360' && block.variante==='recorrido' && block.activo!==false);
    const standalone=typeof onLotBrochure==='function' && commercialStates && window.parent===window;
    if(standalone && !tourBlock)return null;
    const hidden=tourBlock?.opciones?.mostrarBrochure==='no';
    if(lot.estado!=='disponible'||mode==='off'||(standalone||mode===null)&&hidden)return null;
    const label=control=>{
      control.replaceChildren(strokeIcon('M12 3v12m-5-5 5 5 5-5M5 20h14'),node('span','Brochure'));
      control.setAttribute('aria-label','Descargar brochure');return control;
    };
    const url=projectBrochureURL(brochureUrl,{local});
    if(!standalone && url && mode!=='1'){
      const link=label(node('a'));
      link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;
    }
    if(!standalone && (mode!=='1'||window.parent===window))return null;
    const button=label(node('button'));button.type='button';
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label','Generando brochure');button.textContent='Generando…';
      try{
        if(standalone){
          if(await onLotBrochure(lot.id)===false)throw Error('brochure_failed');
        }else{
          const detail={projectSlug:slug,lotId:lot.id};
          const request=new CustomEvent('miniweb-brochure',{detail,cancelable:true});
          document.dispatchEvent(request);
          if(!request.defaultPrevented)throw Error('brochure_unavailable');
          if(await detail.download===false)throw Error('brochure_failed');
        }
        label(button);
      }catch{button.textContent='Reintentar';button.setAttribute('aria-label','Reintentar descarga');}
      finally{button.disabled=false;button.removeAttribute('aria-busy');}
    };
    return button;
  }

  function renderCommercialCard(feature, lot, close, body) {
    card.dataset.fichaRegla = '';
    close.replaceChildren(strokeIcon('M6 6l12 12M18 6L6 18'));
    const heading = node('div', null, 'rg-card-heading');
    const badge = node('small', estados[lot.estado], 'rg-availability');
    badge.dataset.state = lot.estado;
    heading.append(close, badge);
    const identity = node('div', null, 'rg-measures');
    identity.append(node('h3', lotFirstName(config, feature.name)));
    if (lot.superficie_m2 != null) identity.append(node('strong', Number(lot.superficie_m2).toLocaleString('es-AR')+' m²', 'rg-area'));
    body.append(heading, identity);
    const nav = node('nav', null, 'rg-card-actions');
    nav.setAttribute('aria-label', 'Acciones del lote');
    if (lot.estado === 'vendido') {
      const available = node('button', 'Ver lotes disponibles', 'rg-lot-inquiry');
      available.type = 'button';
      available.onclick = showAvailableLots;
      nav.append(available);
    } else {
      const amount = lot.precio_usd == null ? 'A consultar' : 'USD '+Number(lot.precio_usd).toLocaleString('es-AR');
      const price = node('p', amount, 'rg-proposed-price');
      const unit = unitPriceText(lot);
      if (unit !== '—') price.append(node('span', 'USD '+unit+' / m²'));
      body.append(price);
      if (financing) {
        const plan = financing.match(/^Entrega de (USD [\d.]+) y saldo de USD [\d.]+ en (\d+) cuotas fijas de (USD [\d.]+)\.$/);
        body.append(node('p', plan ? 'Entrega '+plan[1]+' + '+plan[2]+' cuotas de '+plan[3] : financing, 'card-finance'));
      }
      const reserve = node('a', 'QUIERO RESERVAR ESTE LOTE', 'rg-lot-inquiry');
      reserve.href = lotReturnUrl(slug, lotLinkId(config, lot.id), true);
      reserve.target = '_top';
      if (simulating) {
        const url = new URL(reserve.href);
        url.searchParams.set('simulacion','estados');
        reserve.href = url.href;
      }
      nav.append(reserve);
      const secondary = node('div', null, 'rg-card-secondary');
      const locate = node('button', 'Plano', 'rg-locate');
      locate.type = 'button';
      locate.append(strokeIcon('M4 12h15m-6-6 6 6-6 6'));
      locate.onclick = () => locateSelectedLot(feature, locate);
      secondary.append(locate);
      const brochure=brochureAction(lot);
      if(brochure)secondary.append(brochure);
      nav.append(secondary);
    }
    body.append(nav);
    if (!photoMode()) locateLot(feature);
  }
  function detail(f){
    stop();selected=f;locator.hidden=true;card.replaceChildren();card.hidden=false;places.value=f.id;paintSelection();
    const close=node('button','×','rg-card-x');close.type='button';close.setAttribute('aria-label','Cerrar ficha');close.onclick=closeCard;
    if (photoMode()) close.replaceChildren(strokeIcon('M6 6l12 12M18 6L6 18'));
    const body=node('div',null,'rg-card-body');card.append(close,body);
    card.classList.toggle('rg-lot-card',f.kind==='lot');
    if(f.kind==='lot'){
      const lot=linked.get(f.id);
      if (commercialCard && ['disponible','vendido'].includes(lot.estado)) {
        renderCommercialCard(f, lot, close, body);
        if(!atlas.hidden)updateMap();
        clean.redraw?.();
        return;
      }
      const items=mediaList(config,lot.id,{local});
      const cover=items.find(m=>m.tipo==='foto')||items.find(m=>m.miniatura);
      const block=blockName(f), sector=mediaURL(scene.sectorPhoto,{local});
      const imageUrl=cover?.miniatura || cover?.url || sector;
      if(imageUrl){
        const visual=node('div',null,'rg-card-visual'),img=node('img');
        const caption=node('span');
        function setImage(url,kind){
          img.alt=kind==='Vista del sector'?'Vista general del sector':(cover?.titulo || f.name);
          caption.textContent=[block?'Manzana '+block.padStart(2,'0'):'',kind.toUpperCase()].filter(Boolean).join(' · ');
          img.src=url;
        }
        img.onerror=()=>{if(sector && img.src!==sector)setImage(sector,'Vista del sector');else visual.remove();};
        visual.append(img,caption);card.insertBefore(visual,body);
        setImage(imageUrl,cover ? (cover.tipo==='foto'?'Foto del lote':'Vista 360°') : 'Vista del sector');
      }
      const badge=node('small',estados[lot.estado]||'Sin información','rg-availability');badge.dataset.state=lot.estado||'';
      const mobile = photoMode();
      // Regla de estados de las miniwebs (opción estadosPlano del Explorador): un lote vendido no muestra importes ni vistas 360.
      const stateRule = commercialStates;
      const soldRule = stateRule && lot.estado==='vendido';
      if (stateRule && ['disponible','vendido'].includes(lot.estado)) card.dataset.fichaRegla=''; else delete card.dataset.fichaRegla;
      const desktopSale = slug === 'terrazas-del-piltri' && !mobile && matchMedia('(min-width: 761px)').matches;
      const heading=node('div',null,'rg-card-heading'),name=node('h3');
      const lines=String(lotFirstName(config,f.name)).split(/\s+(?=·\s+(?:Lote|Manzana)\b)/i);
      if(mobile){name.className='rg-lot-identity';name.textContent=lotFirstName(config,f.name);heading.append(badge);}
      else {for(const line of lines)name.append(node('span',line));heading.append(name,badge);}
      body.append(heading);
      const measures=node('div',null,'rg-measures');
      if(mobile)measures.append(name);
      if(lot.superficie_m2!=null){
        const column=node('div',null,'rg-lot-area'),area=node('strong',Number(lot.superficie_m2).toLocaleString('es-AR'),'rg-area');
        area.append(node('small',' m²'));column.append(area);
        if(mobile)area.setAttribute('aria-label','Superficie del lote');else column.append(node('small','Superficie del lote'));
        measures.append(column);
      }
      const phase=scene.style?.stages?.['manzana:'+block] || f.stage;
      if(phase&&!mobile){
        const column=node('div',null,'rg-lot-phase'),value=String(phase);
        column.append(node('strong',/^etapa\s/i.test(value)?value:'Etapa '+value.padStart(2,'0')),node('small','Según plano'));
        measures.append(column);
      }
      if(measures.childElementCount)body.append(measures);
      if (mobile && !soldRule) {
        const facts=node('dl',null,'rg-lot-facts');
        const unit=unitPriceText(lot);
        const rows=[
          ['Precio',soldRule?'':lot.precio_usd==null?'A consultar':'USD '+Number(lot.precio_usd).toLocaleString('es-AR')],
          ['Precio por m²',soldRule||unit==='—'?'':'USD '+unit],
          ['Etapa',phase ? (/^etapa\s/i.test(String(phase))?String(phase):'Etapa '+String(phase).padStart(2,'0')) : ''],
          ['Zona',zones?.get(lot)?.zone?.nombre],
          ['Tipo de lote',lot.tipo_lote], ['Financiación del proyecto',financing],
          ['Frente al agua',lot.frente_agua?'Sí':''], ['Notas',lot.notas]
        ];
        for (const [label,value] of rows) if(value) facts.append(node('dt',label),node('dd',value));
        body.append(facts);
      }
      const locate = node('button',mobile ? 'Ubicar en el mapa 360' : 'Ubicar en el plano','rg-locate');
      locate.type = 'button';
      locate.append(photoMode() ? strokeIcon('M4 12h15m-6-6 6 6-6 6') : node('span','↗'));
      locate.onclick = () => locateSelectedLot(f, locate);
      if (!mobile && !soldRule) body.append(locate);
      if (!photoMode()) locateLot(f);
      for(const [kind,label] of [['foto','Fotos del lote'],['panorama','Vista 360°']]){
        const group=items.filter(m=>m.tipo===kind);if(!group.length||(soldRule&&(mobile||kind==='panorama')))continue;
        const open=node('button',label);open.onclick=()=>openMediaViewer(group,{title:f.name,context:'recorrido'});body.append(open);
      }
      const external=mediaURL(config.lotes?.[lot.id]?.tour360);
      if(external&&!soldRule){const a=node('a','Vista externa');a.href=external;a.target='_blank';a.rel='noopener';body.append(a);}
      if (!mobile) {
        const details=node('details');details.append(node('summary','Información del lote'));
        for(const value of [soldRule?'':lot.precio_usd==null?'Precio a consultar':'USD '+Number(lot.precio_usd).toLocaleString('es-AR'),soldRule||lot.precio_usd==null?'':unitPriceLabel+' · '+unitPriceText(lot),lot.tipo_lote,lot.frente_agua?'Frente al agua':'',lot.notas])if(value)details.append(node('p',value));
        if(slug&&!soldRule)appendLotReturnLinks(body,slug,lotLinkId(config,lot.id),lot,{includeInquiry:!desktopSale});
        if(details.childElementCount>1)body.append(details);if(phase)body.append(node('p','Datos de la ficha del lote. Etapa según el plano.','rg-card-source'));
      }
      if ((mobile || desktopSale) && slug && !hideLotInquiry(slug,lot)) {
        const nav=node('nav',null,desktopSale?'rg-desktop-inquiry':'');
        nav.setAttribute('aria-label',desktopSale?'Consulta por el lote':'Acciones del lote');
        const label=lot.estado==='disponible' ? 'Quiero reservar este lote' :
          lot.estado==='proximamente' ? 'Avisarme cuando salga a la venta' : 'Consultar este lote';
        const action=node('a',label,'rg-lot-inquiry');
        action.href=lotReturnUrl(slug,lotLinkId(config,lot.id),true);
        action.target='_top';
        nav.append(action);
        if (desktopSale && lot.estado==='disponible') {
          const help=node('p','Se abre una consulta con Sur Patagonian para coordinar la reserva.');
          help.id='rg-reserva-'+lot.id;
          action.setAttribute('aria-describedby',help.id);
          nav.append(help);
        }
        body.insertBefore(nav,desktopSale?locate:null);
      }
      if(stateRule && lot.estado==='disponible'){
        const brochure=brochureAction(lot);
        if(brochure)body.append(brochure);
      }
      if(mobile&&!soldRule)body.append(locate);
      if (soldRule) {
        // Única acción de un vendido: salir del panorama y mostrar la lista de disponibles. La miniweb escucha el aviso.
        const nav=node('nav',null,mobile?'':'rg-desktop-inquiry');nav.setAttribute('aria-label','Acciones del lote');
        const available=node('button','Ver lotes disponibles','rg-lot-inquiry');available.type='button';
        // Embebido: la miniweb que lo contiene recibe el aviso. Abierto solo: vuelve a la miniweb por su dirección pública, con el selector en disponibles.
        available.onclick = showAvailableLots;
        nav.append(available);
        if(measures.isConnected)measures.after(nav);else body.append(nav);
      }
      if (simulating) for (const link of body.querySelectorAll('nav a')) {
        const url=new URL(link.href);url.searchParams.set('simulacion','estados');link.href=url.href;
      }
    }else{
      body.append(node('small','Lugar'),node('h3',f.name));if(isOffice(f))body.append(node('p',officeAddress),node('small',officeNote));if(f.description)body.append(node('p',f.description));
      if(mediaURL(f.photo,{local})){const img=node('img');img.src=f.photo;img.alt=f.name;card.insertBefore(img,body);}
    }
    if(!atlas.hidden)updateMap();
    clean.redraw?.();
  }
  function select(id){
    if(id===ridge.id && ridgeViews.length){
      const available=ridgeViews.filter(c=>c!==scene.cameras[index]);
      if(available.length===1){select(available[0].id);return;}
      stop();closeCard();card.classList.remove('rg-lot-card');card.hidden=false;
      const close=node('button','×','rg-card-x');close.type='button';close.setAttribute('aria-label','Cerrar');close.onclick=closeCard;
      const body=node('div',null,'rg-card-body');body.append(node('h3','Cerrito La Cruz'));
      for(const c of available){
        const high=flightId(c,scene.cameras.indexOf(c))==='0297';
        const button=node('button',high?'Panorámica alta':'Panorámica baja');
        button.type='button';button.onclick=()=>{closeCard();select(c.id);};body.append(button);
      }
      card.replaceChildren(close,body);body.querySelector('button')?.focus({preventScroll:true});return;
    }
    const review=candidates.findIndex(m=>m.id===id);
    if(review>=0){stop();show(scene.cameras.length+review);return;}
    const i=scene.cameras.findIndex(c=>c.id===id);
    if(i!==-1){stop();show(i);return;}
    const f=scene.features.find(f=>f.id===id) || regional.find(f=>f.id===id);
    if(f && interactive(f)){mapOpen(false);detail(f);}
  }
  function clearHover(){
    if(hover){hover=null;paintSelection();}
    q('.rg-tip').hidden=true;stage.classList.remove('rg-pointing');
  }
  async function show(i,focusFeature){
    if(i<0 || i>=viewCount)return;
    intended=i;
    const ticket=++navigation, camera=scene.cameras[i], directory=walkDirectory(camera);
    const status=q('[role=status]');
    let prepared;
    if (directory || (walkDirectory(activeCamera) && camera && i!==index)) {
      const url=directory ? directory.vista : camera.url;
      selector.value=camera.id;
      // La vista actual sigue aceptando giro y zoom durante la descarga.
      previews.retain([...neighborPreviews(index),url]);
      if (!activeCamera) {
        status.dataset.panoramaState='loading';
        status.textContent='Cargando panorámica…';
      } else {
        status.textContent='Preparando la próxima vista. Podés seguir girando.';
        dialog.dispatchEvent(new Event('recorrido-estacion-pendiente'));
      }
      try {
        try { prepared=await previews.get(url,'high'); }
        catch (error) {
          if (ticket!==navigation || url===camera.url) throw error;
          prepared=await previews.get(camera.url,'high');
        }
      } catch {
        if (ticket===navigation) {
          intended=index; selector.value=activeCamera?.id || camera.id;
          status.dataset.panoramaState='error';
          status.textContent='No se pudo abrir la próxima vista. Volvé a elegirla para reintentar.';
          dialog.dispatchEvent(new Event('recorrido-estacion-fallida'));
        }
        return;
      }
      if (ticket!==navigation || !dialog.open) return;
    }
    const reuse=directory && clean.setStation ? clean : null;
    cancelAnimationFrame(frame);clearHover();if(!reuse)clean();q('.rg-world-title').hidden=true;stage.replaceChildren();
    activeCamera=camera;
    const neighbors=neighborPreviews(i);
    previews.retain(neighbors);
    const candidate=candidates[i-scene.cameras.length];
    dialog.classList.toggle('rg-reviewing',Boolean(candidate));
    if(candidate){
      mapOpen(false);closeCard();stop();index=i;selector.value=candidate.id;
      if(aerialReturn)aerialReturn.hidden=false;
      q('[data-sky]').hidden=true;q('.rg-credit').hidden=true;
      q('[data-prev]').disabled=false;q('[data-next]').disabled=i===viewCount-1;
      const status=q('[role=status]');let tap;
      stage.onpointerdown=e=>{tap=e.isPrimary?[e.clientX,e.clientY]:null;};
      stage.onpointercancel=()=>{tap=null;};stage.onpointermove=stage.onpointerleave=null;
      stage.onpointerup=e=>{
        if(tap && Math.hypot(e.clientX-tap[0],e.clientY-tap[1])<5 && document.documentElement.hasAttribute('data-photo-touch') && ['CANVAS','IMG'].includes(e.target.tagName))stage.dispatchEvent(new Event('recorrido-toque-fondo',{bubbles:true}));
        tap=null;
      };
      if(candidate.tipo==='abierta'){
        const img=new Image();img.className='rg-review-photo';img.alt='Panorámica abierta DJI '+candidate.numero;
        status.dataset.panoramaState='loading';status.textContent='Cargando foto…';
        img.onload=()=>{status.dataset.panoramaState='ready';status.textContent='';};
        img.onerror=()=>{status.dataset.panoramaState='error';status.textContent='No se pudo abrir esta foto.';};
        img.src=candidate.url;img.srcset=candidate.url+' 4096w, '+candidate.alta+' 8192w';img.sizes='100vw';stage.append(img);clean=()=>{img.onload=img.onerror=null;};
      }else clean=mountPanorama(stage,{...candidate,fov:1.4},status,null,null,{focusOnReady:!autoEmbedded});
      return;
    }
    index=i;const cam=scene.cameras[i];selector.value=cam.id;
    if(aerialReturn)aerialReturn.hidden=scene.aerialReturnId ? cam.id===scene.aerialReturnId : !isPanoramic(cam,i);
    q('[data-prev]').disabled=i===0;q('[data-next]').disabled=i===viewCount-1;
    updateMap();
    const mask=mediaURL(cam.skyMask,{local});
    const skyButton=q('[data-sky]');
    function skyState(active){
      q('.rg-credit').hidden=!active;
      skyButton.setAttribute('aria-pressed',String(active));
      skyButton.textContent=active?'Cielo original':'Hora azul';
    }
    skyButton.hidden=!mask;skyState(false);
    skyButton.onclick=()=>{blue=!blue;clean.setSky?.(blue);};
    const overlay=svg('svg',{class:'rg-overlay','aria-hidden':'true'});stage.append(overlay);
    const detailTerrain=isTerrainDetail(projectSlug,cam);
    let lastTerrainView;
    const foreground=detailTerrain ? terrainLayer(overlay,cam.id,svg,()=>{if(lastTerrainView)draw(lastTerrainView);},
      cam.stationType ? cam.terrainContours||[] : undefined) : null;
    const opticalPose=detailTerrain && !cam.stationType ? terrainCamera(cam):cam;
    const ground=foreground?.ground || overlay;
    const near=.15;
    const portals=scene.cameras.flatMap((destination,i)=>{
      if(destination===cam || ridgeViews.includes(destination))return [];
      const name=itineraryTitle(destination,i);
      if(!isPanoramic(destination,i))return [];
      return [{...destination,name,kind:'camera',points:[destination.point]}];
    });
    if(ridgeViews.some(c=>c!==cam))portals.push(ridge);
    if(projectSlug==='terrazas-del-piltri' && portals.length)overlay.removeAttribute('aria-hidden');
    const entities=[...scene.features,...regional,...portals].map(f=>{
      const positions=f.points.map(p=>{const [x,z]=meters(cam.point,p);return [x,(f.height||0)-cam.height,z];});
      const element=svg(f.kind==='poi'||f.kind==='camera'?'g':'path',{class:f.kind});
      if(f.kind==='lot'){const lot=linked.get(f.id);paintLot(element,f,lot,scene.style);zones?.paint(element,lot,overlay);}
      const marker=element.tagName==='g'?landscapeMarker(f,projectSlug==='terrazas-del-piltri'?select:null):null;
      if(marker)element.append(marker.guide,marker.diamond,marker.content);
      element.dataset.geoId=f.id;(f.kind==='lot'||f.kind==='line'?ground:overlay).append(element);
      const lot = f.kind==='lot' && linked.get(f.id);
      let mobileRing;
      if (commercialMobile && lot) {
        element.dataset.mobileAvailability = lot.estado || 'sin';
        if (isListedLot(lot)) {
          const {number} = ringIdentity(lot);
          if (number) {
            mobileRing = svg('g',{class:'rg-mobile-number','aria-hidden':'true','data-availability':lot.estado});
            const circle = svg('circle',{r:9});
            circle.style.stroke = (LOT_STATES[lot.estado] || LOT_STATES.sin).color;
            const text = svg('text',{'text-anchor':'middle',y:3.5});
            if(commercialStates && lot.estado==='vendido'){
              mobileRing.dataset.caption='vendido';
              text.textContent='VENDIDO';
            }else{
              mobileRing.append(circle);
              text.textContent=number;
            }
            mobileRing.append(text);
          }
        }
      }
      const ring=f.kind==='lot'?zones?.mark(overlay,linked.get(f.id)):null;
      return {f,positions,element,marker,ring,mobileRing};

    });
    const ringEntities=entities.filter(e=>e.ring);
    const groundRings=ringEntities.map(e=>({lot:linked.get(e.f.id),points:e.f.points,block:blockName(e.f)}));
    alignRingRows(groundRings);
    ringEntities.forEach((e,i)=>{e.groundAnchor=groundRings[i].anchor;overlay.append(e.ring);});
    const mobileNumbers = entities.filter(e=>e.mobileRing);
    for (const e of mobileNumbers) overlay.append(e.mobileRing);
    const groups=new Map();
    for(const entity of entities){
      if(!interactive(entity.f)||entity.f.kind!=='lot')continue;
      if(!blockName(entity.f))continue;
      const name='Manzana '+blockName(entity.f); // Nombre importado o identificado en Lotes.
      if(!groups.has(name)){
        const label=svg('g',{class:'rg-block-label'});
        const compact=scene.style?.labels==='compact';
        const stem=svg('path',{d:'M0 0 V-18 M-2.5 0 L0 -2.5 L2.5 0 L0 2.5 Z',class:'rg-stem'});
        const block = blockName(entity.f);
        label.append(stem);
        if (compact) {
          const caption = svg('text', {x: 4, y: -21, class: 'rg-small-block'});
          caption.textContent = name;
          label.append(caption);
        } else {
          const panel = svg('rect', {x: -46, y: -55, width: 92, height: 35, rx: 8});
          const number = svg('text', {x: -34, y: -32, class: 'rg-block-num'});
          number.textContent = /^\d+$/.test(block) ? block.padStart(2, '0') : block;
          const phase = scene.style?.stages?.['manzana:' + block] || entity.f.stage;
          const description = svg('text', {x: -4, y: phase ? -40 : -34, class: 'rg-block-description'});
          description.textContent = 'Manzana';
          label.append(panel, number, description);
          if (phase) {
            const detail = svg('text', {x: -4, y: -27, class: 'rg-block-phase'});
            detail.textContent = /^etapa\b/i.test(phase) ? phase : 'Etapa ' + phase;
            label.append(detail);
          }
          overlay.append(label);
          const detailX = number.getBBox().x + number.getBBox().width + 8;
          for (const text of label.querySelectorAll('.rg-block-description,.rg-block-phase')) {
            text.setAttribute('x', detailX);
          }
          const right = Math.max(...Array.from(label.querySelectorAll('text'), text => {
            const box = text.getBBox();
            return box.x + box.width;
          }));
          panel.setAttribute('width', Math.max(92, right + 58));
        }
        overlay.append(label);
        groups.set(name,{label,members:[]});
      }
      groups.get(name).members.push(entity);
    }
    if(ringEntities.length){
      for(const [name,group] of groups){
        group.extent=entities.filter(e=>e.f.kind==='lot' && 'Manzana '+blockName(e.f)===name);
      }
    }
    const rad=Math.PI/180;
    function projectPlan(){const pose=calibration && detailTerrain && !cam.stationType ? terrainCamera(cam) : opticalPose;const h=pose.heading*rad,t=(pose.tilt||0)*rad,r=(pose.roll||0)*rad;
      function project(p,height,skyPortal=false){
        const [x,z]=meters(pose.point,p);
        const altitude=(height||0)-pose.height;
        // Sky links preserve the station's bearing, even for a lower destination.
        const y=skyPortal?Math.max(altitude,Math.hypot(x,z)*Math.tan(24*rad)):altitude;
        const right=x*Math.cos(h)-z*Math.sin(h),ahead=x*Math.sin(h)+z*Math.cos(h);
        const up=y*Math.cos(t)-ahead*Math.sin(t),forward=ahead*Math.cos(t)+y*Math.sin(t);
        return [right*Math.cos(r)+up*Math.sin(r),up*Math.cos(r)-right*Math.sin(r),forward];
      }
      for(const e of entities){e.positions=e.f.points.map(p=>project(p,e.f.height,projectSlug==='terrazas-del-piltri' && e.f.kind==='camera' && e.f!==ridge));if(e.groundAnchor)e.ringPosition=project(e.groundAnchor,e.f.height);}
    }projectPlan();refreshPlan=projectPlan;
    overlay.style.visibility=q('[data-layers]').getAttribute('aria-pressed')==='true'?'visible':'hidden';
    const draw=({yaw,pitch,width,height,fov})=>{
      if(calibration){projectPlan();calibrationApply.disabled=false;}
      const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),scale=height/(2*fov);
      const camera=([x,h,z])=>{const forward=x*sy+z*cy;return [x*cy-z*sy,h*cp-forward*sp,forward*cp+h*sp];};
      const screen=([x,y,z])=>[width/2+x*scale/z,height/2-y*scale/z];
      if(foreground){lastTerrainView={yaw,pitch,width,height,fov};foreground.update(camera,screen,width,height); }
      const cross=(a,b)=>a.map((v,j)=>v+(b[j]-v)*(near-a[2])/(b[2]-a[2]));
      for(const entity of entities){
        const {f,positions,element}=entity;
        const pts=positions.map(camera);
        if(f.kind==='poi'||f.kind==='camera'){
          element.style.visibility='';
          entity.anchor=pts[0][2]>near?screen(pts[0]):null;
          element.style.display=entity.anchor?'':'none';if(entity.anchor)element.setAttribute('transform','translate('+entity.anchor.join(' ')+')');
        }else if(f.kind==='lot'){
          const center=pts.reduce((sum,p)=>sum.map((n,k)=>n+p[k]/pts.length),[0,0,0]);
          entity.center=center[2]>near?screen(center):null;
          if(entity.ring){const point=camera(entity.ringPosition);entity.anchor=point[2]>near?screen(point):null;}
          const visible=[];let a=pts.at(-1);for(const b of pts){if((a[2]>=near)!==(b[2]>=near))visible.push(cross(a,b));if(b[2]>=near)visible.push(b);a=b;}
          const projected=visible.map(screen);
          if(ringEntities.length || entity.mobileRing)entity.outline=projected;
          if(photoMode() && projected.length>=3){
            // Foreshortened distant lots should not merge into a solid grid.
            const shortSide=Math.min(...[0,1].map(axis=>{
              const values=projected.map(p=>p[axis]);return Math.max(...values)-Math.min(...values);
            }));
            const widthFactor=Math.min(1,Math.max(.42,shortSide/24));
            const base=element.dataset.mobileAvailability==='no_a_la_venta'?.8:1.8;
            element.style.setProperty('--rg-projected-line',(base*widthFactor).toFixed(2)+'px');
          }
          element.setAttribute('d',projected.length>=3?'M'+projected.map(p=>p.join(' ')).join(' L')+' Z':'');
        }else{let path='';for(let j=1;j<pts.length;j++){let a=pts[j-1],b=pts[j];if(a[2]<near&&b[2]<near)continue;if(a[2]<near)a=cross(a,b);else if(b[2]<near)b=cross(a,b);path+='M'+screen(a).join(' ')+' L'+screen(b).join(' ');}element.setAttribute('d',path);}
      }
      if(ringEntities.length)placeRings(ringEntities,{a:1,b:0,c:0,d:1});
      if (photoMode()) {
        const placed = [];
        // Keep one readable number when several lots project to the same few pixels.
        // A closer view reveals the remaining numbers at their own plot centres.
        const priority = selected && mobileNumbers.find(e=>e.f.id===selected.id);
        const numbers = priority ? [priority,...mobileNumbers.filter(e=>e!==priority)] : mobileNumbers;
        for (const e of numbers) {
          e.mobileRing.classList.toggle('chosen',e===priority);
          const p = e.anchor || e.center;
          const soldLabel=e.mobileRing.dataset.caption==='vendido';
          const radius=soldLabel?25:9.5;
          const visible = fov<1.39 && p && p[0]>=radius && p[0]<=width-radius && p[1]>=9 && p[1]<=height-9 &&
            roomForLotNumber(p,e.outline,soldLabel?27:16) && !placed.some(other=>Math.hypot(other.x-p[0],other.y-p[1])<other.radius+radius);
          e.mobileRing.style.visibility = visible ? 'visible' : 'hidden';
          if (visible) {
            e.mobileRing.setAttribute('transform','translate('+p.join(' ')+')');
            placed.push({x:p[0],y:p[1],radius});
          }
        }
      }
      if(foreground){
        for(const e of ringEntities){
          const p=e.anchor;
          const obscured=p && p[0]>=0 && p[0]<=width && p[1]>=0 && p[1]<=height && foreground.occludes(new DOMPoint(...p));
          e.ring.toggleAttribute('data-behind-tree',!!obscured);
        }
        for(const e of mobileNumbers){
          const p=e.anchor||e.center;
          e.mobileRing.toggleAttribute('data-behind-tree',!!p && foreground.occludes(new DOMPoint(...p)));
        }
      }
      const bearing=(opticalPose.heading+yaw/rad+360)%360;
      const direction=['N','NE','E','SE','S','SO','O','NO'][Math.round(bearing/45)%8];
      q('.rg-compass').textContent=direction+'  ·  '+Math.round(bearing)+'°';
      if (compassNeedle) {
        compassNeedle.setAttribute('transform','rotate('+(-bearing)+' 24 24)');
        northLetter.setAttribute('transform','rotate('+bearing+' 24 -2)');
      }
      const textBounds = [];
      const intersects = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      // Keep the title at the original viewing height, independent of zoom and parcel clipping.
      const turn = Math.atan2(focus[0], focus[2]) - yaw;
      const angle = Math.atan2(Math.sin(turn), Math.cos(turn));
      const referenceScale = height / (2 * Math.tan(35 * rad));
      const halfAngle = Math.atan(width / (2 * referenceScale));
      world.hidden = photoMode() || scene.titlePlacement === 'corner' || !vectors.length || Math.abs(angle) > halfAngle + .12 || overlay.style.visibility === 'hidden';
      if (!world.hidden) {
        const half = world.offsetWidth / 2;
        const center = width / 2 + referenceScale * Math.tan(angle);
        world.style.left = Math.max(half + 12, Math.min(width - half - 12, center)) + 'px';
        const box = world.getBoundingClientRect(), origin = stage.getBoundingClientRect();
        if (box.width) textBounds.push([box.left-origin.left,box.top-origin.top,box.right-origin.left,box.bottom-origin.top]);
      }
      const visibleRings=ringEntities.filter(e=>e.anchor && e.ring.style.visibility==='visible');
      for (const {label,members,extent} of groups.values()) {
        label.style.display = 'none';
        if (scene.style?.labels === 'off') continue;
        const centers = members.map(m => m.center).filter(p => p && p[0]>20 && p[0]<width-20 && p[1]>28 && p[1]<height-16);
        if (!centers.length) continue;
        const [x,y] = centers.reduce(([x,y],p) => [x+p[0]/centers.length, y+p[1]/centers.length],[0,0]);
        label.style.display = '';
        if(!extent){
          const box=label.getBBox(),bounds=[x+box.x,y+box.y,x+box.x+box.width,y+box.y+box.height];
          if(textBounds.some(other=>intersects(bounds,other))){label.style.display='none';continue;}
          label.setAttribute('transform','translate('+x+' '+y+')');
          textBounds.push(bounds);
          continue;
        }
        // The stem points to the boundary. Only the painted panel can cover a lot number.
        const box=(label.querySelector('rect') || label.querySelector('text')).getBBox();
        const xs=centers.map(p=>p[0]),left=Math.min(...xs),right=Math.max(...xs);
        const candidates=[];
        for(const ratio of [.5,.25,.75,0,1,.125,.375,.625,.875]){
          const anchorX=left+(right-left)*ratio,edge=blockEdge(extent,anchorX);
          if(Number.isFinite(edge))candidates.push([anchorX,edge]);
        }
        const edgePositions=candidates.slice();
        for(const lift of [18,36]){
          for(const [cx,edge] of edgePositions)candidates.push([cx,edge-lift,cx,edge]);
        }
        const ys=centers.map(p=>p[1]),upper=Math.min(...ys),lower=Math.max(...ys);
        for(const ratio of [.5,.25,.75]){
          const cy=upper+(lower-upper)*ratio;
          for(const rightSide of [true,false]){
            const edge=blockEdge(extent,cy,1,rightSide);
            if(!Number.isFinite(edge))continue;
            const cx=rightSide?edge+8-box.x:edge-8-box.x-box.width;
            candidates.push([cx,cy-box.y-box.height/2,edge,cy]);
          }
        }
        for(const [cx] of edgePositions){
          const bottom=blockEdge(extent,cx,0,true);
          if(Number.isFinite(bottom))candidates.push([cx,bottom+8-box.y,cx,bottom]);
        }
        candidates.push([x,y]);
        let best;
        for(const [cx,cy,tipX=cx,tipY=cy] of candidates){
          const bounds=[cx+box.x,cy+box.y,cx+box.x+box.width,cy+box.y+box.height];
          if(bounds[0]<6 || bounds[1]<6 || bounds[2]>width-6 || bounds[3]>height-6)continue;
          if(textBounds.some(other=>intersects(bounds,other)))continue;
          const hits=visibleRings.filter(r=>ringTouchesPanel(r,bounds));
          if(!best || hits.length<best.hits.length)best={cx,cy,tipX,tipY,bounds,hits};
          if(!hits.length)break;
        }
        if(!best || best.hits.length>1){label.style.display='none';continue;}
        label.setAttribute('transform','translate('+best.cx+' '+best.cy+')');
        const edgeX=Math.max(best.bounds[0],Math.min(best.tipX,best.bounds[2]));
        const edgeY=Math.max(best.bounds[1],Math.min(best.tipY,best.bounds[3]));
        label.querySelector('.rg-stem').setAttribute('d','M'+(best.tipX-best.cx)+' '+(best.tipY-best.cy)+' L'+(edgeX-best.cx)+' '+(edgeY-best.cy));
        textBounds.push(best.bounds);
        for(const {ring} of best.hits)ring.style.visibility='hidden';
      }
      const origin=stage.getBoundingClientRect();
      for(const control of [q('.rg-identity'),q('.rg-compass'),q('.rg-actions'),q('footer'),card,locator,aerialReturn]){
        if(!control || control.hidden)continue;
        const box=control.getBoundingClientRect();
        textBounds.push([box.left-origin.left,box.top-origin.top,box.right-origin.left,box.bottom-origin.top]);
      }
      const markerPriority=f=>projectSlug==='terrazas-del-piltri' && f.kind==='camera'?2:Number(isOffice(f));
      const markers=entities.filter(e=>e.marker && e.anchor).sort((a,b)=>markerPriority(b.f)-markerPriority(a.f));
      for(const {anchor:[x,y],element,marker,f} of markers){
        const {width:w,height:h,content,guide}=marker;
        if(projectSlug==='terrazas-del-piltri' && f.kind==='camera'){
          // Keep the optical centre on the projected ray. Panning never changes the offset.
          content.setAttribute('x',-w/2);content.setAttribute('y',-h/2);
          guide.style.display=marker.diamond.style.display='none';
          element.style.visibility=x>=0 && x<=width && y>=0 && y<=height?'visible':'hidden';
          if(element.style.visibility==='visible')textBounds.push([x-10,y-10,x+10,y+10]);
          continue;
        }
        const offsets=isOffice(f)?[[12,-h-20],[-w-16,-h-20],[-w-50,-h],[50,-h],[12,14],[-w-16,14]] :
          [[-w/2,-h-16],[12,-h-20],[-w-12,-h-20]];
        if(projectSlug==='terrazas-del-piltri')offsets.push([-w/2,10],[12,10],[-w-12,10]);
        element.style.visibility='hidden';
        if(x<0 || x>width || y<0 || y>height)continue;
        for(const [dx,dy] of offsets){
          const left=Math.max(8,Math.min(width-w-8,x+dx)),top=Math.max(8,y+dy);
          const bounds=[left,top,left+w,top+h];
          if(bounds[3]>height-12 || textBounds.some(other=>intersects(bounds,other)))continue;
          content.setAttribute('x',left-x);content.setAttribute('y',top-y);
          const endX=Math.max(left,Math.min(left+w,x))-x;
          const endY=Math.max(top,Math.min(top+h,y))-y;
          guide.setAttribute('d','M0 0 H'+endX+' V'+endY);
          element.style.visibility='visible';textBounds.push(bounds);break;
        }
      }
    };
    function hit(x,y){
      if(overlay.style.visibility==='hidden' || stage.dataset.paseo==='avance')return null;
      const rect=stage.getBoundingClientRect(),point=new DOMPoint(x-rect.left,y-rect.top);
      const onTree=foreground?.occludes(point);
      for(let j=entities.length-1;j>=0;j--){
        const {f,element}=entities[j];if(f.kind!=='camera'&&!interactive(f) || element.style.display==='none'||element.style.visibility==='hidden')continue;
        if(f.kind==='lot'){
          if(!onTree && element.isPointInFill(point))return f;
        }else{const box=(element.querySelector('foreignObject') || element).getBoundingClientRect();if(x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom)return f;}
      }
      return null;
    }
    let tap=null;
    stage.onpointerdown=e=>{clearHover();tap=e.isPrimary?[e.clientX,e.clientY]:null;};
    stage.onpointerleave=()=>{cancelAnimationFrame(frame);clearHover();};
    stage.onpointercancel=()=>{tap=null;clearHover();};
    stage.onpointermove=e=>{
      if(tap&&document.documentElement.hasAttribute('data-photo-touch')&&Math.hypot(e.clientX-tap[0],e.clientY-tap[1])>5)tap=null;
      cancelAnimationFrame(frame);
      if(tap || e.buttons || e.pointerType!=='mouse' || e.target.tagName!=='CANVAS'){clearHover();return;}
      frame=requestAnimationFrame(()=>{
        const f=hit(e.clientX,e.clientY);
        if(!f){clearHover();return;}
        if(f!==hover){hover=f;paintSelection();}
        const tip=q('.rg-tip'),area=linked.get(f.id)?.superficie_m2;
        const title=commercialCard && f.kind==='lot' ? lotFirstName(config,f.name) : f.name;
        tip.textContent=title+(estados[linked.get(f.id)?.estado]?' · '+estados[linked.get(f.id).estado]:'')+(area!=null?' · '+Number(area).toLocaleString('es-AR')+' m²':'');
        tip.hidden=false;tip.style.left=Math.max(4,Math.min(e.clientX+16,dialog.clientWidth-tip.offsetWidth-8))+'px';
        tip.style.top=Math.max(4,Math.min(e.clientY+16,dialog.clientHeight-tip.offsetHeight-8))+'px';stage.classList.add('rg-pointing');
      });
    };
    stage.onpointerup=e=>{
      const start=tap;tap=null;
      if(!start || Math.hypot(e.clientX-start[0],e.clientY-start[1])>5 || e.target.tagName!=='CANVAS')return;
      const f=hit(e.clientX,e.clientY);
      if(f)select(f.id);
      else if(document.documentElement.hasAttribute('data-photo-touch'))stage.dispatchEvent(new Event('recorrido-toque-fondo',{bubbles:true}));
    };
    // Aim the first view at the parcels, including sites below an aerial station.
    const vectors=entities.filter(e=>focusFeature?e.f.id===focusFeature.id:e.f.kind==='lot').flatMap(e=>e.positions);
    const focus=vectors.reduce((sum,p)=>sum.map((v,k)=>v+p[k]/vectors.length),[0,0,0]);
    const aim=vectors.length && (focusFeature || cam.start==null);
    const yaw=aim?Math.atan2(focus[0],focus[2])/rad:cam.start||0;
    const pitch=aim?Math.max(focusFeature || photoMode()?-85:-45,Math.min(focusFeature?85:-8,Math.atan2(focus[1],Math.hypot(focus[0],focus[2]))/rad)):-20;
    const viewMedia={url:cam.url,...(cam.alta?{alta:cam.alta}:{}),orientacion:yaw,pitch,fov:commercialMobile && mobileTourViewport(innerWidth,matchMedia('(pointer:coarse)').matches,previewDevice) ? 1.4 : (aim && pitch<=-44?1.23:.8)};
    if((cam.stationType ? cam.stationType==='ground' && cam.start==null : projectSlug==='terrazas-del-piltri' && cam.id.startsWith('detalle-')) && !focusFeature){
      // Open toward a nearby frontage. The centre of the whole development can be behind a low station.
      const frontages=entities.filter(e=>e.f.kind==='lot' && isListedLot(linked.get(e.f.id))).map(e=>{
        const points=e.positions;
        const centre=points.reduce((sum,p)=>sum.map((v,k)=>v+p[k]/points.length),[0,0,0]);
        const [x,,z]=centre, distance=Math.hypot(x,z);
        return {centre, score:Math.abs(distance-38)+18*(1-z/Math.max(distance,1))};
      });
      const nearest=frontages.sort((a,b)=>a.score-b.score)[0];
      if(nearest){
        const [x,y,z]=nearest.centre;
        viewMedia.orientacion=Math.atan2(x,z)/rad;
        viewMedia.pitch=Math.atan2(y,Math.hypot(x,z))/rad;
        viewMedia.fov=1.4;
      }
    }
    if(!focusFeature && Number.isFinite(cam.startPitch))viewMedia.pitch=cam.startPitch;
    if(compareIcons && flightId(cam,i)==='0251' && !focusFeature){
      const landmark=entities.find(entity=>entity.f===ridge)?.positions[0];
      if(landmark){
        const [x,y,z]=landmark;
        viewMedia.orientacion=Math.atan2(x,z)/rad;viewMedia.pitch=Math.atan2(y,Math.hypot(x,z))/rad+8;
        viewMedia.fov=.55;
      }
    }
    centerPlan=()=>{projectPlan();const vertices=entities.filter(e=>e.f.kind==='lot').flatMap(e=>e.positions);if(!vertices.length){q('[role=status]').textContent='No hay lotes vinculados para centrar.';return;}const target=vertices.reduce((sum,p)=>sum.map((v,k)=>v+p[k]/vertices.length),[0,0,0]);viewMedia.orientacion=Math.atan2(target[0],target[2])/rad;viewMedia.pitch=Math.max(-85,Math.min(-8,Math.atan2(target[1],Math.hypot(target[0],target[2]))/rad));viewMedia.fov=1.23;const reset=stage.querySelector('.rm-pan-tools button:last-child');if(reset)reset.click();};
    aimAtLot = feature => {
      const entity = entities.find(item=>item.f.id===feature.id);
      if (!entity?.positions.length || !clean.lookAt) return false;
      const points = entity.positions;
      const [x,y,z] = points.reduce((sum,p)=>sum.map((n,k)=>n+p[k]/points.length),[0,0,0]);
      const azimuth = Math.atan2(x,z), elevation = Math.atan2(y,Math.hypot(x,z));
      const aspect = stage.clientWidth / Math.max(1,stage.clientHeight);
      // Fit the parcel around the optical axis, with context on every side.
      let extent = 0;
      for (const [px,py,pz] of points) {
        const ahead = px*Math.sin(azimuth)+pz*Math.cos(azimuth);
        const depth = Math.max(.1,ahead*Math.cos(elevation)+py*Math.sin(elevation));
        const right = px*Math.cos(azimuth)-pz*Math.sin(azimuth);
        const up = py*Math.cos(elevation)-ahead*Math.sin(elevation);
        extent = Math.max(extent,Math.abs(right)/(depth*aspect),Math.abs(up)/depth);
      }
      clean.lookAt(azimuth,elevation,Math.max(.3,extent*1.8));
      return true;
    };
    const skyError='No se pudo abrir este cielo. Se muestra el original.';
    if(directory){viewMedia.paseo=directory;viewMedia.pose=opticalPose;}
    clean=mountPanorama(stage,viewMedia,status,draw,mask?{
      mask,heading:cam.heading,
      onChange:active=>{
        skyState(active);
        if(active&&status.textContent===skyError)status.textContent='Hora azul activada.';
        else if(!active&&status.textContent==='Hora azul activada.')status.textContent='Cielo original.';
      },
      onError:()=>{blue=false;skyState(false);status.textContent=skyError;}
    }:null,{focusOnReady:!autoEmbedded,prepared,reuse,keepDirection:!focusFeature});
    if (directory && !navigator.connection?.saveData) {
      for (const url of neighbors.slice(1)) previews.get(url).catch(()=>{});
    }
    if(mask && blue)clean.setSky?.(true);
    paintSelection();
    if(playing){clearTimeout(timer);timer=setTimeout(()=>i+1<scene.cameras.length?show(i+1):stop(),5500);}
  }
  selector.onchange=()=>{stop();select(selector.value);};places.onchange=()=>select(places.value);
  q('[data-prev]').onclick=()=>{stop();show(intended-1);};q('[data-next]').onclick=()=>{stop();show(intended+1);};
  q('[data-layers]').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));if(embeddedOverview)e.currentTarget.textContent=on?'Ocultar lotes':'Mostrar lotes';const overlay=stage.querySelector('.rg-overlay');if(overlay)overlay.style.visibility=on?'visible':'hidden';clearHover();if(!on)q('.rg-world-title').hidden=true;else clean.redraw?.();};
 q('[data-map]').onclick=()=>{atlasReturn=null;mapOpen(atlas.hidden);};
 q('[data-closemap]').onclick=()=>{mapOpen(false);(atlasReturn?.isConnected?atlasReturn:q('[data-map]')).focus({preventScroll:true});atlasReturn=null;};
  q('[data-play]').onclick=()=>{if(playing){stop();return;}playing=true;q('[data-play]').textContent='Pausar';show(index===scene.cameras.length-1?0:index);};
  q('[data-close]').onclick=()=>{if(calibration){endCalibration(false);return;}dialog.close();if(returnUrl){const id=linked.get(selected?.id)?.id;window.top.location.href=id&&slug?lotReturnUrl(slug,lotLinkId(config,id)):returnUrl;}};dialog.addEventListener('cancel',event=>{if(calibration){event.preventDefault();endCalibration(false);}});dialog.addEventListener('close',()=>{navigation++;previews.retain([]);cancelAnimationFrame(frame);stop();clean();dialog.remove();},{once:true});
  document.body.append(dialog);
  if(autoEmbedded)dialog.open=true;
  else dialog.showModal();
  let station=calibration?Math.max(0,scene.cameras.findIndex(c=>c.id===calibration.cameraId)):0;
  function openLinkedLot(feature){
    const center=feature.points.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/feature.points.length),[0,0]);
    const distances=scene.cameras.map(cam=>Math.hypot(...meters(cam.point,center)));
    mapOpen(false);
    show(distances.indexOf(Math.min(...distances)),feature);
    detail(feature);
  }
  if(autoEmbedded)dialog.addEventListener('miniweb-abrir-lote',event=>{
    const feature=linkedFeature(event.detail?.lotId);
    if(!feature)return;
    event.preventDefault();
    openLinkedLot(feature);
  });
  const requested=linkedFeature(lotId);
  if(!requested && detailStart && projectSlug==='terrazas-del-piltri'){
    const detail=scene.cameras.findIndex(c=>c.id==='detalle-'+detailStart);
    if(detail>=0)station=detail;
  }
  if(!requested && initialFlight && projectSlug==='terrazas-del-piltri'){
    const target=scene.cameras.findIndex((cam,i)=>flightId(cam,i)===initialFlight);
    if(target>=0)station=target;
  }
  const initialCandidate=candidates.findIndex(m=>m.numero===reviewStart);
  if(requested)openLinkedLot(requested);
  else {
    show(initialCandidate>=0?scene.cameras.length+initialCandidate:station);
    if(lotId)q('[role=status]').textContent='Este lote ya no está vinculado al recorrido.';
  }
  return dialog;
}
