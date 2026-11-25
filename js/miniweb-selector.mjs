import {syncMapRings} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {LOT_STATES,lotCounts,salesZones,salesZoneColor,publicSalesZoneColor,paintSalesZone,buildSalesZoneLayers,salesZoneBoundaries,salesZoneInterior,effectiveSaleLot,SALES_ZONE_STATES} from './zonas-venta.mjs?v=20261114-anillo7b';
import {paletteTokens} from './miniweb-palettes.mjs';
import {bridgeInlineWheel} from './miniweb-360.mjs?v=20261117-cierre-venta1';
import {unitPrice,unitPriceText} from './lote-precio.mjs';
import {projectTourUrl} from './recorrido-enlaces.mjs';
import {mediaList} from './recorrido-medios.mjs';
import {commercialPresentation,usesLotPlanKey,lotPlanKeyEntries} from './miniweb-design.mjs?v=20261117-cierre-venta1';

const NS='http://www.w3.org/2000/svg';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('es-AR',{maximumFractionDigits:1});
const has=value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value));
const usd=value=>has(value)?'USD '+number(value):'A consultar';
const unitUsd=lot=>unitPrice(lot)===null?'—':'USD '+unitPriceText(lot);
const unitLabel=lot=>unitPrice(lot)===null?'—':unitUsd(lot)+' / m²';
const area=value=>has(value)?number(value)+' m²':'—';
const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});

const originalStates={...LOT_STATES,disponible:{text:'Disponible',color:'#34d17f'},reservado:{text:'Reservado',color:'#ffa63d'},vendido:{text:'Vendido',color:'#ff6a6f'}};
const svgIcon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const closeIcon=svgIcon('m6 6 12 12M6 18 18 6');
const brochureContent=svgIcon('M12 3v12m-5-5 5 5 5-5M5 20h14')+'<span>Brochure</span>';
const resetBrochureButton=button=>{button.innerHTML=brochureContent;button.setAttribute('aria-label','Descargar brochure')};

export function selectorEnabled(config,project={},mapUrl=project.mapa_activo===false?'':project.mapa_imagen_url){
 return project.slug!=='aldea-los-huemules'&&['estudio-vivo','relato','manifiesto','recorrido','inmersivo'].includes(config.estilo);
}
export function selectorTone(config){
 const value=config.bloques?.find(b=>b.tipo==='explorador')?.opciones.panelesSelector;
 return ['claro','oscuro'].includes(value)?value:['estudio-vivo','relato','recorrido'].includes(config.estilo)?'claro':'oscuro';
}
export function selectorRows(lots,shapeFor=()=>null,{allowPins=true}={}){
 return lots.map(lot=>{
  const shape=shapeFor(lot),block=String(shape?.feature.block||lot.manzana||lot.numero?.match(/^Manzana\s+(.+?)(?:\s*[·•–—]\s*|\s+)Lote\s+/i)?.[1]||'').replace(/^Manzana\s+/i,'').trim();
  const label=String(lot.numero??'').match(/(?:^|\s)Lote\s+(.+)$/i)?.[1]||String(lot.numero??'').replace(/^Lote\s+/i,'');
  const points=shape?.points?.trim().split(/\s+/).map(pair=>pair.split(',').map(Number));
  const polygon=points?.length>=3&&points.every(p=>p.length===2&&p.every(Number.isFinite))?points.map(([x,y])=>[x/843,y/1500]):null;
  const pin=allowPins&&!polygon&&has(lot.mapa_x)&&has(lot.mapa_y)&&Number(lot.mapa_x)>=0&&Number(lot.mapa_x)<=100&&Number(lot.mapa_y)>=0&&Number(lot.mapa_y)<=100?[Number(lot.mapa_x)/100,Number(lot.mapa_y)/100]:null;
  return {lot,id:String(lot.id),block,label,points:polygon,pin,unavailable:lot.estado==='no_a_la_venta'};
 }).sort((a,b)=>collator.compare(a.block,b.block)||collator.compare(a.label,b.label));
}
export function selectorZoneRows(lots,shapeFor,config={},options){
 const rows=selectorRows(lots,shapeFor,options),settings=salesZones(config);
 if(!settings.zonas.length)return rows;
 const zones=new Map(settings.zonas.map(z=>[z.id,z]));
 return rows.map(row=>{const zone=zones.get(config.lotes?.[row.id]?.zonaVenta),lot=effectiveSaleLot(config,row.lot);
  return {...row,manzana:row.block,block:zone?.id||'',groupLabel:String(row.lot.numero||'').match(/^(Manzana\s+.+?)\s*(?:[·•–—]\s*)?Lote\s+/i)?.[1]?.trim()||(row.block?'Manzana '+row.block:'Lote individual'),inventoryLabel:String(row.lot.numero??''),zone,unavailable:lot.estado==='no_a_la_venta',hidden:lot.zonaOculta===true,lot};
 }).filter(row=>!row.hidden);
}
const zoneFingerprint=config=>JSON.stringify([config.recursos?.zonasVenta,Object.entries(config.lotes||{}).filter(([,card])=>card?.zonaVenta).map(([id,card])=>[id,card.zonaVenta])]);
export function selectorVisible(rows,state='',block='',order='numero'){
 const visible=rows.filter(r=>!r.unavailable&&(!state||(Object.hasOwn(LOT_STATES,r.lot.estado)?r.lot.estado:'sin')===state)&&(!block||r.block===block));
 if(order==='disponibles')return visible.sort((a,b)=>Number(b.lot.estado==='disponible')-Number(a.lot.estado==='disponible')||collator.compare(a.label,b.label)||collator.compare(a.block,b.block));
 const value=row=>order==='superficie'?(has(row.lot.superficie_m2)?-Number(row.lot.superficie_m2):Infinity):order==='metro'?(unitPrice(row.lot)??Infinity):has(row.lot.precio_usd)?Number(row.lot.precio_usd):Infinity;
 const priceOrder=['precio','metro'].includes(order),group=row=>row.lot.estado==='vendido'?2:Number.isFinite(value(row))?0:1;
 return order==='numero'?visible:visible.sort((a,b)=>(priceOrder?group(a)-group(b):0)||(value(a)-value(b))||collator.compare(a.block,b.block)||collator.compare(a.label,b.label));
}
export const selectorCanConsult=lot=>!!lot&&!['vendido','no_a_la_venta'].includes(lot.estado);
export function comparisonAdvantages(a,b){
 const values={precio:[a.precio_usd,b.precio_usd],superficie:[a.superficie_m2,b.superficie_m2],metro:[unitPrice(a),unitPrice(b)]};
 return Object.fromEntries(Object.entries(values).map(([key,pair])=>{
  if(!pair.every(has)||Number(pair[0])===Number(pair[1]))return [key,null];
  const first=key==='superficie'?Number(pair[0])>Number(pair[1]):Number(pair[0])<Number(pair[1]),winner=first?0:1;return [key,[a,b][winner].estado==='vendido'?null:winner];
 }));
}
export function selectorCoverView({worldHeight=600,ratio=1.5,center=[.5,.5]}={}){
 const width=Math.min(843,worldHeight*ratio),height=width/ratio;
 return [Math.max(0,Math.min(843-width,center[0]*843-width/2)),Math.max(0,Math.min(worldHeight-height,center[1]*worldHeight-height/2)),width,height];
}
export function selectorConstrainView(view,{worldHeight=600,ratio=1.5}={}){
 const cover=selectorCoverView({worldHeight,ratio}),width=Math.max(cover[2]/32,Math.min(cover[2],view[2])),height=width/ratio;
 return [Math.max(0,Math.min(843-width,view[0])),Math.max(0,Math.min(worldHeight-height,view[1])),width,height];
}
// A photo must always cover the viewport. A vector plan without a photo instead
// needs to contain all its geometry; white margins are part of the plan surface.
export function selectorPlanHome({worldHeight=600,ratio=1.5}={}){
 const width=Math.max(843,worldHeight*ratio)*1.06,height=width/ratio;
 return [(843-width)/2,(worldHeight-height)/2,width,height];
}
export function selectorConstrainPlanView(view,{worldHeight=600,ratio=1.5}={}){
 const home=selectorPlanHome({worldHeight,ratio}),width=Math.max(home[2]/32,Math.min(home[2],view[2])),height=width/ratio;
 return [Math.max(Math.min(0,843-width),Math.min(Math.max(0,843-width),view[0])),Math.max(Math.min(0,worldHeight-height),Math.min(Math.max(0,worldHeight-height),view[1])),width,height];
}
function rowBounds(rows,worldHeight){
 const points=rows.flatMap(row=>row.points||[row.pin].filter(Boolean));
 if(!points.length)return null;
 return {left:Math.min(...points.map(p=>p[0]*843)),right:Math.max(...points.map(p=>p[0]*843)),top:Math.min(...points.map(p=>p[1]*worldHeight)),bottom:Math.max(...points.map(p=>p[1]*worldHeight))};
}
export function selectorListView(row,{rows=[row],worldHeight=600,box}){
 const group=row.block?rows.filter(other=>other.block===row.block):[row],bounds=rowBounds(group,worldHeight);
 if(!bounds)return [...box];
 const ratio=box[2]/box[3],dx=bounds.right-bounds.left,dy=bounds.bottom-bounds.top;
 // The revised brief asks for neighbouring blocks, with no tighter than 45%
 // of the initial frame. This replaces the previous thirteen-lot-width rule.
 const width=Math.max(dx*3,dy*1.3*ratio,box[2]*.45);
 if(width>=box[2])return [...box];
 const height=width/ratio;
 return [(bounds.left+bounds.right-width)/2,(bounds.top+bounds.bottom-height)/2,width,height];
}
export function selectorIsClear(view,{row,worldHeight=600,mapRect,occluders=[],viewport=mapRect,gap=12}){
 const b=rowBounds([row],worldHeight);if(!b||!mapRect.width||!mapRect.height)return false;
 const rect={left:mapRect.left+(b.left-view[0])/view[2]*mapRect.width,right:mapRect.left+(b.right-view[0])/view[2]*mapRect.width,top:mapRect.top+(b.top-view[1])/view[3]*mapRect.height,bottom:mapRect.top+(b.bottom-view[1])/view[3]*mapRect.height};
 return rect.left>=Math.max(mapRect.left,viewport.left)+gap&&rect.right<=Math.min(mapRect.right,viewport.right)-gap&&rect.top>=Math.max(mapRect.top,viewport.top)+gap&&rect.bottom<=Math.min(mapRect.bottom,viewport.bottom)-gap&&!occluders.some(o=>o&&o.right>o.left&&o.bottom>o.top&&rect.left<o.right+gap&&rect.right>o.left-gap&&rect.top<o.bottom+gap&&rect.bottom>o.top-gap);
}
export function selectorFocusView(view,{rows,worldHeight=600,mapRect,occluders=[],viewport=mapRect,above=null,comparison=false,gap=12,minimumWidth=0,fixedScale=false,limitToPhoto=true}){
 const ratio=mapRect.width/mapRect.height,cover=(limitToPhoto?selectorCoverView:selectorPlanHome)({worldHeight,ratio}),constrain=limitToPhoto?selectorConstrainView:selectorConstrainPlanView,initial=constrain(view,{worldHeight,ratio});
 if(initial[2]<minimumWidth){initial[2]=Math.min(cover[2],minimumWidth);initial[3]=initial[2]/ratio;const bounded=constrain(initial,{worldHeight,ratio});initial.splice(0,4,...bounded)}
 const area={left:Math.max(mapRect.left,viewport.left)+gap,right:Math.min(mapRect.right,viewport.right)-gap,top:Math.max(mapRect.top,viewport.top)+gap,bottom:Math.min(mapRect.bottom,viewport.bottom,above==null?Infinity:above-gap)-gap};
 if(area.right-area.left<48||area.bottom-area.top<48)return initial;
 const obstacles=occluders.filter(o=>o&&o.right>o.left&&o.bottom>o.top).map(o=>({left:Math.max(area.left,o.left-gap),right:Math.min(area.right,o.right+gap),top:Math.max(area.top,o.top-gap),bottom:Math.min(area.bottom,o.bottom+gap)})).filter(o=>o.right>o.left&&o.bottom>o.top);
 const xs=[...new Set([area.left,area.right,...obstacles.flatMap(o=>[o.left,o.right])])].sort((a,b)=>a-b),ys=[...new Set([area.top,area.bottom,...obstacles.flatMap(o=>[o.top,o.bottom])])].sort((a,b)=>a-b);
 const solve=bounds=>{
  if(!bounds)return null;let best=null,score=Infinity;
  for(let i=0;i<xs.length-1;i++)for(let j=i+1;j<xs.length;j++)for(let k=0;k<ys.length-1;k++)for(let n=k+1;n<ys.length;n++){
   const r={left:xs[i],right:xs[j],top:ys[k],bottom:ys[n]};if(r.right-r.left<48||r.bottom-r.top<48||obstacles.some(o=>r.left<o.right-1e-7&&r.right>o.left+1e-7&&r.top<o.bottom-1e-7&&r.bottom>o.top+1e-7))continue;
   const l=(r.left-mapRect.left)/mapRect.width,u=(r.right-mapRect.left)/mapRect.width,t=(r.top-mapRect.top)/mapRect.height,b=(r.bottom-mapRect.top)/mapRect.height;
   const low=Math.max(cover[2]/32,minimumWidth,fixedScale?initial[2]:0,(bounds.right-bounds.left)/(u-l),(bounds.bottom-bounds.top)*ratio/(b-t));
   const high=Math.min(cover[2],fixedScale?initial[2]:Infinity,limitToPhoto&&l>0?bounds.left/l:Infinity,limitToPhoto&&u<1?(843-bounds.right)/(1-u):Infinity,limitToPhoto&&t>0?bounds.top*ratio/t:Infinity,limitToPhoto&&b<1?(worldHeight-bounds.bottom)*ratio/(1-b):Infinity);
   if(low>high+1e-7||high<=0)continue;
   const width=comparison?high:Math.max(low,Math.min(high,initial[2])),height=width/ratio,x0=Math.max(Math.min(0,limitToPhoto?0:843-width),bounds.right-u*width),x1=Math.min(Math.max(843-width,limitToPhoto?843-width:0),bounds.left-l*width),y0=Math.max(Math.min(0,limitToPhoto?0:worldHeight-height),bounds.bottom-b*height),y1=Math.min(Math.max(worldHeight-height,limitToPhoto?worldHeight-height:0),bounds.top-t*height);
   if(x0>x1+1e-7||y0>y1+1e-7)continue;
   const x=Math.max(x0,Math.min(x1,comparison?(bounds.left+bounds.right)/2-(l+u)/2*width:initial[0])),y=Math.max(y0,Math.min(y1,comparison?(bounds.top+bounds.bottom)/2-(t+b)/2*height:initial[1]));
   const motion=Math.hypot((x-initial[0])/width*mapRect.width,(y-initial[1])/height*mapRect.height),cost=comparison?-width*1000+motion*.01:Math.abs(Math.log(width/initial[2]))*10000+motion;
   if(cost<score){score=cost;best=[x,y,width,height]}
  }
  return best;
 };
 const complete=solve(rowBounds(rows,worldHeight));if(complete)return complete;
 // Preserve a visible mark when an extremely large polygon cannot fit in any
 // free rectangle. Both comparison centres still participate in this fallback.
 const centres=rows.map(row=>{const b=rowBounds([row],worldHeight);return b?{pin:[(b.left+b.right)/2/843,(b.top+b.bottom)/2/worldHeight]}:row});
 return solve(rowBounds(centres,worldHeight))||initial;
}
export function selectorRevealView(view,{row,worldHeight=600,mapRect,cardRect,viewport=mapRect,gap=12,limitToPhoto=false}){
 const bounds=rowBounds([row],worldHeight);
 if(!bounds||!mapRect.width||!mapRect.height||!cardRect||cardRect.right<=cardRect.left||cardRect.bottom<=cardRect.top)return [...view];
 const projected={left:mapRect.left+(bounds.left-view[0])/view[2]*mapRect.width,right:mapRect.left+(bounds.right-view[0])/view[2]*mapRect.width,top:mapRect.top+(bounds.top-view[1])/view[3]*mapRect.height,bottom:mapRect.top+(bounds.bottom-view[1])/view[3]*mapRect.height};
 const overlaps=rect=>rect.left<cardRect.right+gap&&rect.right>cardRect.left-gap&&rect.top<cardRect.bottom+gap&&rect.bottom>cardRect.top-gap;
 if(!overlaps(projected))return [...view];
 const visible={left:Math.max(mapRect.left,viewport.left)+gap,right:Math.min(mapRect.right,viewport.right)-gap,top:Math.max(mapRect.top,viewport.top)+gap,bottom:Math.min(mapRect.bottom,viewport.bottom)-gap};
 const shiftFor=rect=>{
  const choices=[[0,cardRect.top-gap-rect.bottom],[cardRect.right+gap-rect.left,0],[cardRect.left-gap-rect.right,0],[0,cardRect.bottom+gap-rect.top]];
  return choices.filter(([dx,dy])=>{const moved={left:rect.left+dx,right:rect.right+dx,top:rect.top+dy,bottom:rect.bottom+dy},x=view[0]-dx*view[2]/mapRect.width,y=view[1]-dy*view[3]/mapRect.height;return (!limitToPhoto||x>=-1e-7&&y>=-1e-7&&x+view[2]<=843+1e-7&&y+view[3]<=worldHeight+1e-7)&&moved.left>=visible.left&&moved.right<=visible.right&&moved.top>=visible.top&&moved.bottom<=visible.bottom&&!overlaps(moved)}).sort((a,b)=>Math.hypot(...a)-Math.hypot(...b))[0];
 };
 let shift=shiftFor(projected);
 // At a manually extreme zoom, a whole polygon may not fit. Reveal its centre
 // rather than changing the buyer's chosen zoom level.
 if(!shift){const x=(projected.left+projected.right)/2,y=(projected.top+projected.bottom)/2;shift=shiftFor({left:x-4,right:x+4,top:y-4,bottom:y+4})}
 if(!shift)return [...view];
 return [view[0]-shift[0]*view[2]/mapRect.width,view[1]-shift[1]*view[3]/mapRect.height,view[2],view[3]];
}

export function selectorMapSource(url,{hasPhoto=true,hasGeometry=false,safeUrl}={}){
 if(!hasPhoto&&hasGeometry){let width=843,height=1500;try{if(String(url).startsWith('data:image/svg+xml,')){const size=decodeURIComponent(url.slice(url.indexOf(',')+1)).match(/width="([\d.]+)" height="([\d.]+)"/);if(size&&size.slice(1).every(n=>Number(n)>0&&Number(n)<100000)){width=Number(size[1]);height=Number(size[2]);}}}catch{}return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/></svg>`);}
 return safeUrl(url);
}

// Screen-space labels keep a readable size while the SVG camera moves. A label
// is shown only when its full text and outline fit inside its own lot.
export function selectorLotLabel(row,{worldHeight=600,view=[0,0,843,600],width=1000,height=650,caption='',captionSize,captionBox}={}){
 if(!row.points||row.unavailable||row.hidden||!width||!height)return null;
 const points=row.points.map(([u,v])=>[u*843,v*worldHeight]),sx=width/view[2],sy=height/view[3];
 const vertices=points.filter(([x,y],i)=>i===0||x!==points[0][0]||y!==points[0][1]);
 const anchor=caption?vertices.reduce(([x,y],[u,v])=>[x+u/vertices.length,y+v/vertices.length],[0,0]):salesZoneInterior(points);
 const screen=points.map(([x,y])=>[(x-anchor[0])*sx,(y-anchor[1])*sy]);
 const fits=(text,size,polygon=screen)=>{
  const halfWidth=captionBox ? captionBox.width/2 : caption ? [...text].length*size*.33+1 : [...text].length*size*.36+4+(row.zone&&['vendido','reservado'].includes(row.lot?.estado)?12:0);
  const halfHeight=captionBox ? captionBox.height/2 : size*.4+(caption?1:3);
  const inside=([x,y])=>{let yes=false,a=polygon.at(-1);for(const b of polygon){if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;a=b;}return yes};
  const corners=[[-halfWidth,-halfHeight],[halfWidth,-halfHeight],[halfWidth,halfHeight],[-halfWidth,halfHeight]];
  // Corners alone are insufficient for concave lots: no boundary may enter the text box.
  const enters=(a,b)=>{let lo=0,hi=1;for(const [origin,delta,min,max]of [[a[0],b[0]-a[0],-halfWidth,halfWidth],[a[1],b[1]-a[1],-halfHeight,halfHeight]]){if(!delta){if(origin<=min||origin>=max)return false;continue;}const x=(min-origin)/delta,y=(max-origin)/delta;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));}return hi>lo&&hi>0&&lo<1};
  return corners.every(inside)&&!polygon.some((a,i)=>enters(a,polygon[(i+1)%polygon.length]));
 };
 if(caption){
  const sizes=captionSize?[captionSize]:[16,14,12,10,8];
  const layout=(size,angle)=>({text:caption,x:anchor[0],y:anchor[1],scale:view[2]/width,size,angle});
  const horizontal=sizes.find(px=>fits(caption,px));
  if(horizontal)return layout(horizontal,0);
  // En parcelas angostas, orientar la palabra en la dirección del lado largo.
  const edges=screen.map(([x,y],i)=>[x-screen[(i+1)%screen.length][0],y-screen[(i+1)%screen.length][1]]);
  const [dx,dy]=edges.reduce((a,b)=>Math.hypot(...a)>Math.hypot(...b)?a:b);
  const angle=(Math.atan2(dy,dx)*180/Math.PI+270)%180-90;
  const radians=angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  const rotated=screen.map(([x,y])=>[x*cos+y*sin,y*cos-x*sin]);
  const size=sizes.find(px=>fits(caption,px,rotated));
  return size?layout(size,angle):null;
 }
 const size=16,label=String(row.label||'').trim();if(!label||!fits(label,size))return null;
 const block=String(row.manzana??row.lot?.manzana??row.block??'').trim(),full=block?'M'+block+' · '+label:label;
 const text=block&&fits(full,size)?full:label,scale=view[2]/width;
 return {text,x:anchor[0],y:anchor[1],scale,size,markerX:anchor[0]+([...text].length*size*.36+9)*scale};
}

// Presentation only: IDs, inventory, geometry, consultation and media are supplied
// by the existing miniweb. No database client, alternate inventory or GPS model.
export function mountSelector(host,{project,config,lots,shapeFor,mapUrl,safeUrl,onSelect,onConsult,onTour,onPanoramas,onBrochure,mapHasPhoto=true,allowPins=true,initialPlanBounds}){
 const states=salesZones(config).zonas.length?LOT_STATES:originalStates,ruleColors={disponible:'#3FA66A',vendido:'#f4f3ef'},stateOf=lot=>{const base=states[lot.estado]||states.sin;return section.dataset.estados==='regla'&&ruleColors[lot.estado]?{...base,color:ruleColors[lot.estado]}:base};
 const root=host.attachShadow({mode:'open'}),lifecycle=new AbortController(),{signal}=lifecycle;
 let resolveReady;const whenReady=new Promise(resolve=>{resolveReady=resolve});
 const referenceProject=['alamos','aldea-los-huemules'].includes(project.slug);
 const photoPlan=Boolean(mapUrl)&&mapHasPhoto&&!referenceProject;
 const css=document.createElement('link');
 const sheetReady=new Promise(resolve=>{css.addEventListener('load',()=>resolve(true),{once:true});css.addEventListener('error',()=>resolve(false),{once:true})});
 const critical=document.createElement('style');critical.textContent=`
 .sel[data-map-pending]{position:relative;min-height:min(70svh,620px)}
 .sel[data-map-pending]>:not(.map-message){visibility:hidden!important}
 .sel[data-map-pending]>.map-message{position:absolute;inset:0;margin:auto;display:grid;place-items:center;width:fit-content;height:fit-content;max-width:90%;font:500 16px/1.5 system-ui;color:#f5f4f1;background:#26322e;border-radius:6px;padding:10px 16px}
 .sel[data-list-only=true] .map,.sel[data-list-only=true] .zoom{display:none!important}
 `;root.append(critical)
css.rel='stylesheet';css.href='/css/miniweb-selector.css?v=20261125-entrada-plano';root.append(css);
 const section=document.createElement('section');section.className='sel';section.setAttribute('aria-label','Selector de lotes');section.dataset.mapPending='';section.setAttribute('aria-busy','true');
 section.innerHTML=`<svg class="map" role="group" aria-label="Plano de lotes" tabindex="0"></svg><div class="shade"></div><p class="map-message" role="status">Cargando la imagen del plano…</p>
 <div class="head"><div class="chips glass" role="group" aria-label="Filtrar por disponibilidad"></div><label class="mz glass">Manzana<select aria-label="Manzana"><option value="">Todas</option></select></label><div class="zone-filters" hidden aria-label="Filtrar por zonas"></div></div>
 <div class="zoom glass" role="group" aria-label="Zoom del plano"><button type="button" data-zoom="in" aria-label="Acercar">${svgIcon('M12 5v14M5 12h14')}</button><button type="button" data-zoom="out" aria-label="Alejar">${svgIcon('M5 12h14')}</button><button type="button" data-zoom="all" aria-label="Ver todo el plano" title="Ver todo">${svgIcon('M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6')}</button><button type="button" data-fullscreen aria-label="Pantalla completa" title="Pantalla completa">${svgIcon('M8 8 3 3m0 5V3h5M16 8l5-5m-5 0h5v5M8 16l-5 5m0-5v5h5m8-5 5 5m0-5v5h-5')}</button></div>
 <button type="button" class="list-tab glass" data-list-open aria-controls="selector-list" aria-expanded="false" hidden></button>
 <button type="button" class="list-show glass" data-list-show aria-controls="selector-list" hidden></button>
 <aside id="selector-list" class="side glass" aria-label="Lista de lotes"><header><span class="count" role="status"></span><select class="f-state" aria-label="Filtrar por estado" hidden></select><select class="f-zone" aria-label="Filtrar por zona" hidden></select><select class="order" aria-label="Ordenar lotes"><option value="numero">Por número</option><option value="precio">Menor precio</option><option value="superficie">Mayor superficie</option><option value="metro">Menor USD/m²</option></select><button type="button" class="list-hide" data-list-hide aria-label="Esconder la lista" title="Esconder la lista" hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><button type="button" class="list-close x" data-list-close aria-label="Cerrar lista">${closeIcon}</button></header><div class="list"></div></aside>
 <article class="card glass" aria-label="Ficha del lote" hidden></article><aside class="tray glass" aria-label="Comparación de dos lotes" hidden></aside>`;
 if(photoPlan)section.querySelector('.shade').remove();
 if(photoPlan){
  section.classList.add('photo-plan');
  const backdrop=document.createElement('div');
  backdrop.className='list-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  section.prepend(backdrop);
 }
 const layout=document.createElement('div');layout.className='selector-layout';layout.append(section);root.append(layout);
 const q=selector=>section.querySelector(selector),map=q('.map'),list=q('.list'),card=q('.card'),tray=q('.tray'),blockSelect=q('.mz select');
 // A georeferenced photo can cover only part of the linked DXF. Keep both in
 // a common plane so choosing a lot outside the photo never changes its location.
 let rasterExtent=null;
 function projectRows(cfg){
  const items=selectorZoneRows(lots,shapeFor,cfg,{allowPins});
  rasterExtent=null;
  if(!mapHasPhoto||cfg.recorrido?.escena?.planoActivo!=='vectorial')return items;
  let left=0,top=0,right=1,bottom=1;
  for(const row of items)for(const [x,y] of row.points||[]){
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(left>=-1e-6&&right<=1+1e-6&&top>=-1e-6&&bottom<=1+1e-6)return items;
  const width=right-left,height=bottom-top;
  rasterExtent={left,top,width,height};
  const project=([x,y])=>[(x-left)/width,(y-top)/height];
  return items.map(row=>({...row,points:row.points?.map(project),pin:row.pin&&project(row.pin)}));
 }
 const limitToPhoto=()=>mapHasPhoto&&!rasterExtent;
 let rows=projectRows(config),byId=new Map(rows.filter(r=>!r.unavailable).map(r=>[r.id,r]));const shapes=new Map(),lotLabels=new Map();let zoneSignature=zoneFingerprint(config),zoneLayers=[],zoneMarkers=[];
 // Estados del plano según las reglas de las miniwebs: opción estadosPlano del bloque Explorador. Sin la opción, el selector conserva sus colores.
 const soldRule=lot=>section.dataset.estados==='regla'&&lot?.estado==='vendido';
 function paintStateRule(cfg){
  let legend=layout.querySelector('.state-legend');
  if(!usesLotPlanKey(cfg)){delete section.dataset.estados;legend?.remove();return}
  section.dataset.estados='regla';
  const entries=lotPlanKeyEntries(rows,false), signature=entries.map(([key])=>key).join(' ');
  if(legend?.dataset.keys===signature)return;
  if(!legend){legend=document.createElement('div');legend.className='state-legend';legend.setAttribute('role','group');legend.setAttribute('aria-label','Referencia del plano');layout.append(legend)}
  legend.dataset.keys=signature;
  legend.replaceChildren(...entries.map(([key,{label,color}])=>{
   layout.style.setProperty('--plan-'+key,color);
   const item=document.createElement('span'),swatch=document.createElement('i');
   swatch.setAttribute('aria-hidden','true');swatch.dataset.state=key;swatch.style.setProperty('--swatch',color);
   item.append(swatch,label);return item;
  }));
 }
 paintStateRule(config);
 let outlinedShape=null;
 function outlineFromRow(target){
  const row=target?.closest?.('[data-select]');
  const shape=section.dataset.estados==='regla' && row && list.contains(row) ? shapes.get(row.dataset.select) : null;
  if(shape===outlinedShape)return;
  outlinedShape?.classList.remove('from-list');
  shape?.classList.add('from-list');
  outlinedShape=shape;
 }
 list.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')outlineFromRow(event.target)},{signal});
 list.addEventListener('pointerleave',()=>outlineFromRow(list.getRootNode().activeElement),{signal});
 list.addEventListener('focusin',event=>outlineFromRow(event.target),{signal});
 list.addEventListener('focusout',event=>outlineFromRow(event.relatedTarget),{signal});
 let highlightedRow=null;
 const hoverLabel=document.createElement('div');
 hoverLabel.className='lot-hover';hoverLabel.hidden=true;hoverLabel.setAttribute('aria-hidden','true');
 hoverLabel.append(document.createElement('b'),document.createElement('span'));section.append(hoverLabel);
 function highlightFromShape(target){
  const id=target?.closest?.('.lot')?.dataset.lotId;
  const row=id && section.dataset.estados==='regla' && !card.classList.contains('show') ? list.querySelector('[data-select="'+CSS.escape(id)+'"]') : null;
  if(row===highlightedRow)return;
  highlightedRow?.classList.remove('from-map');
  row?.classList.add('from-map');
  highlightedRow=row;
  hoverLabel.hidden=true;
  if(row){
   const box=list.getBoundingClientRect(),bounds=row.getBoundingClientRect();
   if(box.height && bounds.top<box.top)list.scrollTop+=bounds.top-box.top-8;
   else if(box.height && bounds.bottom>box.bottom)list.scrollTop+=bounds.bottom-box.bottom+8;
   hoverLabel.firstChild.textContent=row.querySelector('.t b').textContent;
   hoverLabel.lastChild.textContent=[row.querySelector('.t > span:last-child')?.textContent,row.querySelector('.p > span')?.textContent].filter(Boolean).join(' · ');
  }
 }
 map.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')highlightFromShape(event.target)},{signal});
 map.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse'||!highlightedRow||map.classList.contains('drag')){hoverLabel.hidden=true;return}
  const box=section.getBoundingClientRect();hoverLabel.hidden=false;
  const left=event.clientX-box.left-hoverLabel.offsetWidth/2,top=event.clientY-box.top-hoverLabel.offsetHeight-14;
  hoverLabel.style.left=Math.max(4,Math.min(left,box.width-hoverLabel.offsetWidth-4))+'px';
  hoverLabel.style.top=(top>=4?top:event.clientY-box.top+14)+'px';
 },{signal});
 map.addEventListener('pointerleave',()=>{highlightFromShape(map.getRootNode().activeElement);hoverLabel.hidden=true},{signal});
 map.addEventListener('focusin',event=>highlightFromShape(event.target),{signal});
 map.addEventListener('focusout',event=>highlightFromShape(event.relatedTarget),{signal});
 // Pedido desde el recorrido 360 de la misma miniweb: mostrar la lista filtrada en disponibles.
 host.getRootNode().addEventListener('mw-ver-disponibles',()=>{if(sheetMode())phoneState='disponible';state='disponible';block='';selected=null;onSelect?.(null);if(compact())mobileListOpen=true;listCollapsed=false;section.removeAttribute('data-list-panel-hidden');paint();host.scrollIntoView({block:'start',behavior:'smooth'});(list.querySelector('.row')||q('.order'))?.focus({preventScroll:true});},{signal});
 let currentConfig=config,selected=null,comparison=[],state='',block='',order='numero',worldHeight=600,photoWidth=843,box=[0,0,843,600],view=[...box],frame=0,ready=false,disposed=false,listCollapsed=false,initialWidth=843,mobileListOpen=false,bodyOverflow=null;
 const compact=()=>window.innerWidth<=900;
 const sheetMode=()=>window.innerWidth<=700 && photoPlan && section.dataset.listOnly!=='true' && commercialPresentation(currentConfig) && usesLotPlanKey(currentConfig);
 let phoneState=rows.some(row=>!row.unavailable&&row.lot.estado==='disponible')?'disponible':'';
 const listState=()=>sheetMode()?phoneState:state;
 const wideEntry=()=>sheetMode()&&currentConfig.bloques?.find(block=>block.tipo==='explorador')?.opciones?.entradaPlano==='amplia';
 const availableSummary=document.createElement('span');
 availableSummary.className='selector-available-count';
 signal.addEventListener('abort',()=>availableSummary.remove(),{once:true});
 const fullPhoto=()=>mapHasPhoto&&section.hasAttribute('data-list-panel-hidden');
 const fullscreen=()=>root.fullscreenElement===layout||!!layout.matches?.(':fullscreen')||layout.classList.contains('tour-expanded');
 let viewportInset=0;
 function viewportHeight(){
  const vh=window.visualViewport?.height||window.innerHeight;
  let height=compact()?Math.max(360,vh-(fullscreen()?0:Math.max(112,viewportInset+12))):Math.max(620,Math.min(920,vh));
  const sheet=sheetMode(),modeChanged=sheet!==section.hasAttribute('data-mobile-sheet'),legend=layout.querySelector('.state-legend');
  host.toggleAttribute('data-mobile-sheet',sheet);
  section.toggleAttribute('data-mobile-sheet',sheet);
  const wide=wideEntry();
  for(const node of [host,section])node.toggleAttribute('data-wide-entry',wide);
  if(wide){
   const heading=host.parentElement?.querySelector(':scope > .interactive-section-heading');
   if(heading&&availableSummary.parentElement!==heading)heading.append(availableSummary);
  }else availableSummary.remove();
  if(legend && legend.parentElement!==(sheet?section:layout))(sheet?section:layout).append(legend);
  host.toggleAttribute('data-two-columns',desktopZonePlan());
  if(desktopZonePlan() && host.clientWidth>380){
   // A tall, narrow crop cannot contain both ends of the cadastral plan.
   const photoHeightAtColumnWidth=(host.clientWidth-(fullPhoto()?0:380))*worldHeight/843;
   height=Math.min(height,photoHeightAtColumnWidth);
  }
  host.dataset.compact=String(compact());
  host.style.setProperty('--selector-height',height+'px');
  host.parentElement?.style.setProperty('--selector-height',height+'px');
  if(modeChanged&&ready)paint();else paintListState();
 }
 viewportHeight();window.addEventListener('resize',viewportHeight,{signal});window.visualViewport?.addEventListener('resize',viewportHeight,{signal});
 const label=row=>section.dataset.estados==='regla' && row.manzana
  ? 'Lote '+row.label+' · Manzana '+row.manzana
  : row.inventoryLabel||[row.groupLabel||(row.block?'Manzana '+row.block:''),'Lote '+row.label].filter(Boolean).join(' · ');
 const immersiveZones=()=>currentConfig.estilo==='inmersivo'&&!['alamos','aldea-los-huemules'].includes(project.slug);
 const zoneTag=row=>row.zone?`<span class="zone-tag"><i style="background:${salesZoneColor(row.zone,paletteTokens(currentConfig.paleta).texto)}"></i>${escape(row.zone.nombre)}</span>`:'';
 const create=(tag,attrs={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node};
 const selectedMarker=create('g',{class:'phone-selection','aria-hidden':'true','pointer-events':'none'});
 selectedMarker.append(create('path',{d:'M-15 -24h30v18H4L0 0l-4 -6h-11z'}),create('text',{x:0,y:-15,'text-anchor':'middle','dominant-baseline':'central'}));
 const image=create('image',{x:0,y:0,width:843,height:worldHeight,preserveAspectRatio:'none'});map.append(image);
 const boundsOf=items=>{let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const row of items)for(const [u,v]of row.points||[row.pin].filter(Boolean)){left=Math.min(left,u*843);right=Math.max(right,u*843);top=Math.min(top,v*worldHeight);bottom=Math.max(bottom,v*worldHeight)}return Number.isFinite(left)?[left,top,right,bottom]:[0,0,843,worldHeight]};
 function desktopZonePlan(){
  return photoPlan && section.dataset.listOnly!=='true' && window.matchMedia('(min-width:1100px)').matches;
 }
 const mobileZonePlan=()=>compact() && photoPlan && section.dataset.listOnly!=='true';
 // Keep the camera in the space between the filters and the sheet toolbar.
 function mobileFrame(items,preferredWidth=0,overview=false){
  const rect=map.getBoundingClientRect(),bounds=rowBounds(items,worldHeight);
  if(!bounds||!rect.width||!rect.height)return [...box];
  const headerBottom=section.hasAttribute('data-list-filters')?0:Math.max(0,q('.head').getBoundingClientRect().bottom-rect.top);
  // The initial overview belongs to the whole map, even when an incoming
  // lot link has already opened its sheet before the raster is ready.
  const sheetHeight=overview?(parseFloat(section.style.getPropertyValue('--mobile-overlay-height'))||0):0;
  const controlsTop=Math.min(rect.height,q('.zoom').getBoundingClientRect().top-rect.top+sheetHeight);
  const inset=Math.min(12,Math.max(0,controlsTop-headerBottom)/4);
  const top=headerBottom+inset,bottom=controlsTop-inset;
  const fitScale=Math.max((bounds.right-bounds.left)/Math.max(1,rect.width-32),
   (bounds.bottom-bounds.top)/Math.max(1,bottom-top),preferredWidth/rect.width);
  // Centre the lot using the zoom the map can actually display, even with a tall sheet.
  const scale=overview?fitScale:Math.min(fitScale,Math.max(843,initialWidth)/rect.width);
  const width=rect.width*scale,height=rect.height*scale;
  return [(bounds.left+bounds.right-width)/2,(bounds.top+bounds.bottom)/2-scale*(top+bottom)/2,width,height];
 }
 function desktopArea(){
  const rect=map.getBoundingClientRect();
  const zoom=q('.zoom').getBoundingClientRect(),head=q('.head').getBoundingClientRect();
  return {left:Math.max(110,zoom.right-rect.left+12),top:Math.max(150,head.bottom-rect.top+12),right:rect.width-30,bottom:rect.height-40};
 }
 function desktopFrame(items){
  const rect=map.getBoundingClientRect(),area=desktopArea(),bounds=rowBounds(items,worldHeight);
  if(!bounds || rect.width<=0 || rect.height<=0)return home();
  const scale=Math.max((bounds.right-bounds.left)/Math.max(1,area.right-area.left),(bounds.bottom-bounds.top)/Math.max(1,area.bottom-area.top));
  const width=Math.max(scale*rect.width,home()[2]/32),height=width/mapRatio();
  return [(bounds.left+bounds.right)/2-width*(area.left+area.right)/(2*rect.width),
   (bounds.top+bounds.bottom)/2-height*(area.top+area.bottom)/(2*rect.height),width,height];
 }
 function resetTarget(){
  if(wideEntry()){
   const ratio=mapRatio(),bounds=rowBounds(rows,worldHeight);
   if(bounds){
    const padding=20,centerX=(bounds.left+bounds.right)/2,centerY=(bounds.top+bounds.bottom)/2;
    const width=Math.max(bounds.right-bounds.left+padding,(bounds.bottom-bounds.top+padding)*ratio);
    return constrain([centerX-width/2,centerY-width/ratio/2,width,width/ratio]);
   }
  }
  if(sheetMode())return selectorCoverView({worldHeight,ratio:mapRatio(),center:[.5,.5]});
  if(fullPhoto())return photoFrame();
  if(mobileZonePlan())return mobileFrame(selectorVisible(rows,state,block),0,true);
  return desktopZonePlan()?desktopFrame(selectorVisible(rows,state,block)):[...box];
 }
 function fit(items,detail=false){
  if(mobileZonePlan())return mobileFrame(items);
  if(desktopZonePlan())return desktopFrame(items);
  const [x0,y0,x1,y1]=boundsOf(items),rect=map.getBoundingClientRect(),width=rect.width||1000,height=rect.height||650,wide=width>900,ratio=width/height;
  const left=wide?44:18,right=wide?Math.min(440,width*.34):18,top=wide?160:160,bottom=compact()?88:detail&&wide?310:56;
  const usableW=Math.max(width*.3,width-left-right),usableH=Math.max(height*.28,height-top-bottom);
  const w=Math.max((x1-x0||30)*width/usableW,(y1-y0||30)*height/usableH*ratio,detail?box[2]*.25:0)*1.08,h=w/ratio;
  return [(x0+x1)/2-w/2+(right-left)/width*w/2,(y0+y1)/2-h/2+(bottom-top)/height*h/2,w,h];
 }
 const mapRatio=()=>{const rect=map.getBoundingClientRect();return rect.width&&rect.height?rect.width/rect.height:box[2]/box[3]};
 function photoFrame(target){
  const photo=image.getBBox(),ratio=mapRatio();
  const maxWidth=Math.max(photo.width,photo.height*ratio);
  const width=target?Math.max(maxWidth/32,Math.min(maxWidth,target[2])):maxWidth,height=width/ratio;
  const origin=(start,length,span,requested)=>requested==null||span>=length?start+(length-span)/2:Math.max(start,Math.min(start+length-span,requested));
  return [origin(photo.x,photo.width,width,target?.[0]),origin(photo.y,photo.height,height,target?.[1]),width,height];
 }
 const constrain=target=>{
  if(sheetMode())return selectorConstrainView(target,{worldHeight,ratio:mapRatio()});
  if(fullPhoto())return photoFrame(target);
  if(!mobileZonePlan())return (limitToPhoto()?selectorConstrainView:selectorConstrainPlanView)(target,{worldHeight,ratio:mapRatio()});
  // The photo can be wider than the phone. Its borders must not prevent the
  // chosen lot from moving into the visible area above the sheet.
  const width=Math.max(843/64,Math.min(Math.max(843,initialWidth),target[2])),height=width/mapRatio();
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  return [clamp(target[0],-width/2,843-width/2),clamp(target[1],-height,worldHeight),width,height];
 };
 const home=()=>{if(!limitToPhoto())return selectorPlanHome({worldHeight,ratio:mapRatio()});const [x0,y0,x1,y1]=boundsOf(rows);return selectorCoverView({worldHeight,ratio:mapRatio(),center:[(x0+x1)/2/843,(y0+y1)/2/worldHeight]})};
 const setView=()=>{view=constrain(view);map.setAttribute('viewBox',view.join(' '));map.toggleAttribute('data-pan',sheetMode()&&(fullscreen()||view[2]<initialWidth*.995));syncMapRings(map);paintZoneLabels();paintLotLabels()};
 const startView=()=>{if(fullPhoto()){cancelAnimationFrame(frame);box=photoFrame();view=[...box];initialWidth=view[2];setView();return}box=home();const rect=map.getBoundingClientRect(),bounds=!rasterExtent&&initialPlanBounds?.({width:rect.width,height:rect.height,imageWidth:photoWidth,imageHeight:worldHeight*photoWidth/843});view=mobileZonePlan()?resetTarget():desktopZonePlan()?constrain(resetTarget()):bounds?constrain(fit([{points:[[bounds.left,bounds.top],[bounds.right,bounds.bottom]]}])):[...box];initialWidth=view[2];setView()};
 function fly(target){
  target=constrain(target);cancelAnimationFrame(frame);if(matchMedia('(prefers-reduced-motion: reduce)').matches){view=[...target];setView();return}
  const from=[...view],start=performance.now();const step=now=>{if(disposed)return;const t=Math.min(1,(now-start)/650),eased=1-(1-t)**4;view=from.map((v,i)=>v+(target[i]-v)*eased);setView();if(t<1)frame=requestAnimationFrame(step)};frame=requestAnimationFrame(step);
 }
 function showWholePlan(){
  if(selected){
   selected=null;
   listCollapsed=false;
   onSelect?.(null);
   paint();
  }
  fly(resetTarget());
 }
 function zoom(factor,anchor=[.5,.5]){
  const max=fullPhoto()?photoFrame()[2]:mobileZonePlan()?initialWidth:(limitToPhoto()?selectorCoverView:selectorPlanHome)({worldHeight,ratio:mapRatio()})[2],w=Math.max(max/32,Math.min(max,view[2]*factor)),h=w/mapRatio();
  if(mobileZonePlan()&&w===max&&factor>1){fly(resetTarget());return}
  if(factor>1&&!sheetMode()){fly([843/2-w/2,worldHeight/2-h/2,w,h]);return}
  fly([view[0]+(view[2]-w)*anchor[0],view[1]+(view[3]-h)*anchor[1],w,h]);
 }
 // Con la regla, los filtros van dentro de la lista, como desplegables, y el plano queda limpio (también en teléfono).
 // Se arman a partir de los mismos filtros de siempre: un filtro que no filtra no se muestra.
 function paintListFilters(){
  const fs=q('.f-state'),fz=q('.f-zone'),on=section.dataset.estados==='regla'&&section.dataset.listOnly!=='true';
  // Con la regla, la lista también se puede ordenar con los disponibles primero, sin sacar ningún lote.
  {const sort=q('.order'),has=sort.querySelector('[value=disponibles]');if(section.dataset.estados==='regla'&&!has)sort.querySelector('[value=numero]').after(new Option('Disponibles primero','disponibles'));else if(section.dataset.estados!=='regla'&&has){has.remove();if(order==='disponibles'){order='numero';sort.value='numero'}}}
  section.toggleAttribute('data-list-filters',on);
  // La cruz cierra el panel táctil. La flecha además pliega la lista y muestra la foto entera.
  if(!on)section.removeAttribute('data-list-panel-hidden');
  q('.list-hide').hidden=!on;
  const show=q('.list-show'),count=selectorVisible(rows,state,block).length;
  show.hidden=!on||!section.hasAttribute('data-list-panel-hidden');
  show.textContent='Ver lista · '+count+(count===1?' lote':' lotes');
  if(!on){fs.hidden=fz.hidden=true;return}
  const fill=(select,options,value)=>{const key=JSON.stringify(options);if(select.dataset.options!==key){select.dataset.options=key;select.replaceChildren(...options.map(([v,t])=>new Option(t,v)))}if(select.value!==value)select.value=value;select.hidden=options.length<3};
  const text=node=>[...node.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const chips=[...q('.chips').querySelectorAll('[data-state]')].filter(c=>c.dataset.state&&Number(c.querySelector('b')?.textContent)>0);
  fill(fs,chips.length>=2?[['','Todos los estados'],...chips.map(c=>[c.dataset.state,text(c)])]:[],chips.some(c=>c.dataset.state===listState())?listState():'');
  const zones=[...section.querySelectorAll('.zone-filters [data-zone]')].filter(b=>b.dataset.zone&&!/\(/.test(b.textContent));
  fill(fz,zones.length>=2?[['','Todas las zonas'],...zones.map(b=>[b.dataset.zone,text(b)])]:[],zones.some(b=>b.dataset.zone===block)?block:'');
 }
 function paintListState(){
  paintListFilters();
  const small=compact(),onlyList=section.dataset.listOnly==='true',side=q('.side'),tab=q('.list-tab'),open=small&&!onlyList&&mobileListOpen;
  if(!selected||comparison.length||desktopZonePlan())listCollapsed=false;
  side.hidden=onlyList?false:small?!open:listCollapsed;side.inert=side.hidden;tab.hidden=onlyList||(!small&&!listCollapsed)||(open&&!sheetMode());
  const tabCount=sheetMode()?rows.filter(row=>!row.unavailable&&row.lot.estado==='disponible').length:selectorVisible(rows,state,block).length;
  if(section.hasAttribute('data-wide-entry')){
   const countText=tabCount+(tabCount===1?' disponible':' disponibles');
   if(availableSummary.textContent!==countText)availableSummary.textContent=countText;
  }
  tab.textContent=sheetMode()&&open?'Ocultar lista':(small?'Ver lista':'Lista')+' ('+tabCount+')';
  tab.setAttribute('aria-expanded',String(open||!side.hidden));q('.list-close').hidden=!open;
  section.classList.toggle('mobile-list-open',open);for(const panel of [card,tray]){panel.inert=open;if(open)panel.setAttribute('aria-hidden','true');else panel.removeAttribute('aria-hidden')}
  const panel=comparison.length?tray:card;section.style.setProperty('--mobile-overlay-height',small&&!onlyList&&!open&&!panel.hidden?panel.offsetHeight+'px':'0px');
  // Con la regla de las miniwebs, en pantallas angostas la ficha abierta no puede tapar ni los filtros ni el zoom: si no entran, el selector crece lo justo.
  {const head=q('.head'),active=small&&!sheetMode()&&!onlyList&&!open&&!panel.hidden,clear=active?Math.ceil(head.getBoundingClientRect().bottom-section.getBoundingClientRect().top+14+54+24+12):0,needed=section.dataset.estados==='regla'&&active?clear+Math.max(panel.offsetHeight,panel.scrollHeight+2)+(layout.querySelector('.state-legend')?.offsetHeight||0)+'px':'0px';
   // Espacio que la ficha no puede ocupar (filtros y zoom): si el selector no llega a crecer, la ficha se desplaza por dentro en vez de taparlos.
   section.style.setProperty('--selector-clear',clear?clear+'px':'24px');const changed=host.style.getPropertyValue('--selector-needed')!==needed;for(const target of [host,host.parentElement])target?.style.setProperty('--selector-needed',needed);
   // La ficha se mide con su contenido completo; al cambiar el alto del selector se vuelve a ubicar el zoom una vez.
   if(changed)requestAnimationFrame(()=>{if(!disposed)paintListState()})}
  const full=q('[data-fullscreen]');full.setAttribute('aria-label',fullscreen()?'Salir de pantalla completa':'Pantalla completa');full.setAttribute('title',fullscreen()?'Salir de pantalla completa':'Pantalla completa');full.setAttribute('aria-pressed',String(fullscreen()));full.innerHTML=svgIcon(fullscreen()?'M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5':'M8 8 3 3m0 5V3h5M16 8l5-5m-5 0h5v5M8 16l-5 5m0-5v5h5m8-5 5 5m0-5v5h-5');
 }
 function exitFullscreen(){
  if(root.fullscreenElement===layout||layout.matches?.(':fullscreen'))document.exitFullscreen?.().catch(()=>{});
  layout.classList.remove('tour-expanded');if(bodyOverflow!==null){document.body.style.overflow=bodyOverflow;bodyOverflow=null;}viewportHeight();
 }
 async function toggleFullscreen(){
  if(fullscreen()){exitFullscreen();return;}if(section.dataset.listOnly==='true')return;
  try{if(!layout.requestFullscreen)throw Error('fallback');await layout.requestFullscreen();}
  catch{bodyOverflow=document.body.style.overflow||'';document.body.style.overflow='hidden';layout.classList.add('tour-expanded');}
  viewportHeight();if(ready){startView();if(selected)focusSelection(byId.get(selected));}
 }
 document.addEventListener?.('fullscreenchange',()=>{viewportHeight();if(ready){startView();const row=byId.get(selected||comparison[0]);if(row)focusSelection(row);}},{signal});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&layout.classList.contains('tour-expanded'))exitFullscreen()},{signal});
 function zoneControls(){
  const data=salesZones(currentConfig),enabled=!!data.zonas.length,filter=q('.zone-filters');
  filter.hidden=!enabled;q('.mz').hidden=enabled;
  if(enabled)section.dataset.zoneMode='true';else delete section.dataset.zoneMode;
  if(!enabled){filter.replaceChildren();return;}
  const active=data.zonas.filter(z=>z.estado!=='oculta');if(block&&!active.some(z=>z.id===block))block='';
  const title=document.createElement('span');title.textContent=data.rotulo;title.className='zone-filter-label glass';filter.replaceChildren(title);
  for(const zone of [null,...active]){const button=document.createElement('button');button.type='button';button.className='chip glass';button.dataset.zone=zone?.id||'';button.setAttribute('aria-pressed',String(block===(zone?.id||'')));
   if(zone){const dot=document.createElement('i');dot.style.background=publicSalesZoneColor(zone,paletteTokens(currentConfig.paleta).texto);button.append(dot);}
   button.append(document.createTextNode(zone?zone.nombre+(zone.estado==='a_la_venta'?'':' ('+(section.dataset.estados==='regla'&&zone.estado==='suspendida'?'No comercializado':SALES_ZONE_STATES[zone.estado])+')'):'Todas'));filter.append(button);
  }
 }
 function rebuildZoneLayers(){
  map.querySelectorAll('.zone-layer,.zone-outline,.zone-label,.zone-state-dot').forEach(n=>n.remove());
  const layers=buildSalesZoneLayers(map,currentConfig,rows,{height:worldHeight,project,ink:paletteTokens(currentConfig.paleta).texto});zoneLayers=layers.layers;zoneMarkers=layers.markers;syncMapRings(map);paintZoneLabels();
 }
 function paintZoneLabels(){
  const width=map.getBoundingClientRect().width;if(!width)return;
  for(const {bounds,labelNode,outline,id,anchor}of zoneLayers){const [left,top,right,bottom]=bounds,visible=(!block||block===id)&&left>=view[0]&&top>=view[1]&&right<=view[0]+view[2]&&bottom<=view[1]+view[3];outline.style.display=!block||block===id?'':'none';labelNode.style.display=visible&&!immersiveZones()?'':'none';labelNode.setAttribute('transform','translate('+anchor[0]+' '+(anchor[1]+4*view[2]/width)+') scale('+(view[2]/width)+')');}
 }
 function paintLotLabels(){
  const rect=map.getBoundingClientRect(),visible=new Set(selectorVisible(rows,state,block).map(r=>r.id));
  if(sheetMode()){
   const row=byId.get(selected),bounds=row&&rowBounds([row],worldHeight);
   selectedMarker.style.display=bounds?'':'none';
   if(bounds){
    selectedMarker.lastElementChild.textContent=row.label;
    const x=(bounds.left+bounds.right)/2,y=(bounds.top+bounds.bottom)/2;
    selectedMarker.setAttribute('transform',`translate(${x} ${y}) scale(${view[2]/(rect.width||1)})`);
    map.append(selectedMarker);
   }
   return;
  }
  selectedMarker.style.display='none';
  // Maqueta final (regla de estados): sobre el plano van sólo los metros del lote disponible o «Vendido» en chico.
  // Con el plano lejos (lotes a menos de 28 px entre sí) no se escribe nada: el color alcanza; al acercar aparecen.
  const rule=section.dataset.estados==='regla';let far=false,tight=false;
  if(rule&&rect.width&&rect.height){
   const centers=rows.filter(r=>r.points&&!r.unavailable).map(r=>{const n=r.points.length;return [(r.points.reduce((a,[u])=>a+u,0)/n*843-view[0])*rect.width/view[2],(r.points.reduce((a,[,v])=>a+v,0)/n*worldHeight-view[1])*rect.height/view[3]]});
   if(centers.length>1){const nearest=centers.map((a,i)=>Math.min(...centers.map((b,j)=>i===j?Infinity:Math.hypot(a[0]-b[0],a[1]-b[1])))).sort((a,b)=>a-b),quartile=nearest[Math.floor(nearest.length*.25)];far=quartile<28;tight=quartile<50}
  }
  for(const row of rows){const text=lotLabels.get(row.id);if(!text)continue;
   const sold=soldRule(row.lot);
   const caption=rule ? (far?'':sold?'VENDIDO':row.lot.estado==='disponible'&&has(row.lot.superficie_m2)?area(row.lot.superficie_m2):'') : '';
   if(rule){if(soldRule(row.lot))text.dataset.caption='vendido';else text.dataset.caption='metros'}
   if((rule||row.zone) && !caption){text.style.display='none';continue}
   const captionSize=sold?8.5:tight?10.5:12;
   const layout=visible.has(row.id)||comparison.includes(row.id)?selectorLotLabel(row,{worldHeight,view,width:rect.width,height:rect.height,caption,captionSize}):null;
   text.style.fontSize=(layout?.size||16)+'px';
   text.style.display=layout?'':'none';if(!layout)continue;
   if(text.dataset.captionText!==layout.text){
    text.dataset.captionText=layout.text;
    const content=rule?text.querySelector('.plan-caption'):text;
    if(rule&&!sold){
     const unit=document.createElement('small');unit.textContent='m²';
     content.replaceChildren(document.createTextNode(number(row.lot.superficie_m2)),unit);
    }else content.textContent=layout.text;
   }
   text.setAttribute('transform',`translate(${layout.x} ${layout.y}) scale(${layout.scale}) rotate(${layout.angle||0})`);
  }
  for(const ring of zoneMarkers){
   const label=lotLabels.get(ring.dataset.lotState);
   ring.style.opacity=rule||(label&&label.style.display!=='none')?'0':'';
  }
 }
 function paintMap(){
  const visible=new Set(selectorVisible(rows,state,block).map(r=>r.id));
  for(const row of rows){const shape=shapes.get(row.id);if(!shape)continue;shape.classList.toggle('off',!sheetMode()&&!row.unavailable&&!visible.has(row.id)&&!comparison.includes(row.id));shape.classList.toggle('on',row.id===selected);shape.classList.toggle('cmp',comparison.includes(row.id));if(!row.unavailable)shape.setAttribute('aria-pressed',String(row.id===selected||comparison.includes(row.id)));}
  // Paint chosen outlines above their neighbours, including shared borders.
  for(const id of comparison.length?comparison:[selected]){const shape=shapes.get(id);if(shape)map.append(shape)}
  for(const text of lotLabels.values())map.append(text);
  for(const {labelNode}of zoneLayers)map.append(labelNode);
  for(const marker of zoneMarkers){marker.style.display=visible.has(marker.dataset.lotState)||comparison.includes(marker.dataset.lotState)?'':'none';map.append(marker);}syncMapRings(map);
 }
 function paintCard(){
  const row=comparison.length?null:byId.get(selected);card.hidden=!row;card.classList.toggle('show',!!row);if(!row){card.replaceChildren();return}
  const lot=row.lot,sale=stateOf(lot),tour=projectTourUrl(project,currentConfig,lot.id),external=safeUrl(currentConfig.lotes?.[lot.id]?.tour360),panoramas=mediaList(currentConfig,lot.id).some(m=>m.tipo==='panorama');
  const consult=selectorCanConsult(lot)?`<button type="button" class="btn go" data-action="consult"><span>${lot.avisoZonaProximamente?'Avisarme cuando salga a la venta':'Consultar este lote'}</span>${svgIcon('M4 12h16m-6-6 6 6-6 6')}</button>`:'<button type="button" class="btn go" disabled aria-disabled="true">Lote vendido</button>';
  card.innerHTML=`<div class="top"><div><h3>${escape(row.groupLabel||(row.block?'Manzana '+row.block:'Lote individual'))}</h3>${zoneTag(row)}<p class="big">Lote ${escape(row.label)}</p></div><span class="st" style="--c:${sale.color}"><i></i>${sale.text}</span><button type="button" class="x" data-action="close" aria-label="Cerrar ficha">${closeIcon}</button></div>
  <dl class="kv">${soldRule(lot)?'':`<div><dt>Precio</dt><dd>${escape(usd(lot.precio_usd))}</dd></div>`}<div><dt>Superficie</dt><dd>${escape(area(lot.superficie_m2))}</dd></div>${soldRule(lot)?'':`<div><dt>Valor del m²</dt><dd>${escape(unitUsd(lot))}</dd></div>`}</dl>
  <div class="acts">${soldRule(lot)?'<button type="button" class="btn go" data-action="available">Ver lotes disponibles</button>':consult+(tour?`<a class="btn" data-project-lot-tour href="${escape(tour)}">${svgIcon('M3 12c3 3 15 3 18 0M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18')}360°</a>`:external||panoramas?`<button type="button" class="btn" data-action="360">360°</button>`:'')+`<button type="button" class="btn" data-action="compare" aria-pressed="${comparison.includes(row.id)}">Comparar</button>`+(currentConfig.bloques?.find(b=>b.tipo==='explorador')?.opciones?.mostrarBrochure!=='no'&&lot.estado==='disponible'&&onBrochure?'<button type="button" class="btn" data-action="brochure" aria-label="Descargar brochure">'+brochureContent+'</button>':'')}</div>`;
 }
 function paintTray(){
  const pair=comparison.map(id=>byId.get(id)).filter(Boolean),active=pair.length>0;tray.hidden=!active;tray.classList.toggle('show',active);section.classList.toggle('has-compare',active);tray.tabIndex=-1;
  if(!active){tray.replaceChildren();section.style.removeProperty('--compare-tray-height');return}
  const header=`<header class="compare-head"><strong>Comparar lotes</strong><button type="button" class="x" data-clear-compare aria-label="Salir de la comparación">${closeIcon}</button></header>`;
  if(pair.length===1){const row=pair[0];tray.innerHTML=header+`<div class="compare-wait"><div><h3>${escape(label(row))}</h3>${zoneTag(row)}<p>${soldRule(row.lot)?'':escape(usd(row.lot.precio_usd))+' · '}${escape(area(row.lot.superficie_m2))}</p></div><p class="compare-prompt" role="status">Elija otro lote para comparar</p></div>`}
  else{
   const advantages=comparisonAdvantages(pair[0].lot,pair[1].lot),metrics=[['estado','Estado',row=>stateOf(row.lot).text],['precio','Precio',row=>soldRule(row.lot)?'—':usd(row.lot.precio_usd)],['superficie','Superficie',row=>area(row.lot.superficie_m2)],['metro','Valor del m²',row=>soldRule(row.lot)?'—':unitUsd(row.lot)]],benefits={precio:'Menor precio',superficie:'Mayor superficie',metro:'Menor valor del m²'};
   tray.innerHTML=header+'<div class="compare-grid">'+pair.map((row,index)=>`<section class="compare-column"><h3>${escape(label(row))}</h3>${zoneTag(row)}<dl>${metrics.map(([key,title,read])=>`<div class="compare-metric ${advantages[key]===index?'favorable':''}"><dt>${title}</dt><dd>${escape(read(row))}${advantages[key]===index?`<small>${benefits[key]}</small>`:''}</dd></div>`).join('')}</dl>${selectorCanConsult(row.lot)?`<button type="button" class="btn go" data-compare-consult="${escape(row.id)}">${row.lot.avisoZonaProximamente?'Avisarme cuando salga a la venta':'Consultar'}</button>`:'<button type="button" class="btn go" disabled aria-disabled="true">Lote vendido</button>'}</section>`).join('')+'</div>';
  }
  section.style.setProperty('--compare-tray-height',(tray.offsetHeight+52)+'px');
 }
 function focusListReturn(id){
  const target=q('.side').hidden?q('.list-tab'):(list.querySelector('[data-select="'+CSS.escape(id)+'"]')||q('.order'));
  target.focus({preventScroll:true});
 }
 function exitComparison(){const first=comparison[0];comparison=[];selected=null;onSelect?.(null);paint();focusListReturn(first)}
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&comparison.length)exitComparison()},{signal});
 function paint(){
  outlineFromRow(null);
  highlightFromShape(null);
  zoneControls();
  const visible=selectorVisible(rows,listState(),block,order);
  // Con la regla de las miniwebs la lista se ordena por número de lote, que es como se nombra cada lote.
  if(section.dataset.estados==='regla'&&order==='numero')visible.sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.block,b.block));
  const base=rows.filter(r=>!r.unavailable&&(!block||r.block===block));
  const counts=lotCounts(base.map(r=>r.lot));
  q('.chips').innerHTML=[['','Todos'],...['disponible','reservado','vendido','proximamente',...(counts.states.sin&&salesZones(currentConfig).zonas.length?['sin']:[])].map(key=>[key,states[key].text])].map(([key,text])=>`<button type="button" class="chip" data-state="${key}" aria-pressed="${state===key}" ${key?`style="--c:${stateOf({estado:key}).color}"`:''}>${key?'<i></i>':''}${text}<b>${key?counts.states[key]:counts.total}</b></button>`).join('')+'<span class="leg"><i></i>'+ (section.dataset.estados==='regla'?'No comercializado':'No a la venta')+'</span>';
  q('.count').innerHTML=`<b>${visible.length}</b> ${visible.length===1?'lote':'lotes'}`;
  list.innerHTML=visible.map(row=>{const sale=stateOf(row.lot);return `<button type="button" class="row" data-row-state="${escape(row.lot.estado)}" data-select="${escape(row.id)}" aria-current="${row.id===selected}" aria-pressed="${comparison.includes(row.id)}" style="--c:${sale.color}"><span class="n">${escape(row.label)}</span><span class="t"><b>${escape(label(row))}</b>${zoneTag(row)}<span>${row.zone&&immersiveZones()&&section.dataset.estados!=='regla'?' · ':''}${escape(area(row.lot.superficie_m2))} · <strong data-lot-status="${escape(row.lot.estado)}">${escape(sale.text)}</strong></span></span><span class="p">${soldRule(row.lot)?'':escape(usd(row.lot.precio_usd))+`<span>${escape(unitLabel(row.lot))}</span>`}</span></button>`}).join('')||'<p class="empty" role="status">No hay lotes con estos filtros.</p>';
  paintMap();paintLotLabels();paintCard();paintTray();paintListState();
 }
 function focusSelection(row,fromList=false,immediate=false){
  if(!ready)return;
  if(mobileZonePlan() && !comparison.length && row){
   const bounds=rowBounds([row],worldHeight),width=Math.min(view[2],initialWidth*.6),height=width/mapRatio();
   const target=sheetMode()&&bounds?[(bounds.left+bounds.right-width)/2,(bounds.top+bounds.bottom-height)/2,width,height]:mobileFrame([row],Math.min(view[2],initialWidth));
   if(immediate){cancelAnimationFrame(frame);view=target;setView()}else fly(target);
   return;
  }
  const readRect=element=>{
   if(!element||element.hidden)return null;const r=element.getBoundingClientRect();let x=0,y=0;const transform=getComputedStyle(element).transform;
   if(transform&&transform!=='none'){const matrix=new DOMMatrixReadOnly(transform);x=matrix.m41*(element.offsetWidth?r.width/element.offsetWidth:1);y=matrix.m42*(element.offsetHeight?r.height/element.offsetHeight:1)}
   return {left:r.left-x,right:r.right-x,top:r.top-y,bottom:r.bottom-y};
  };
  const overlay=readRect(comparison.length?tray:card),mapRect=map.getBoundingClientRect(),viewport={left:0,top:0,right:window.innerWidth,bottom:window.visualViewport?.height||window.innerHeight},targets=comparison.length?comparison.map(id=>byId.get(id)).filter(Boolean):[row];
  // A map click may reveal the lot, but must keep the buyer's current zoom.
  // The automatic zoom limit belongs to list/comparison navigation only.
  const above=comparison.length?overlay?.top:null,visibleViewport={...viewport,bottom:Math.min(viewport.bottom,above==null?Infinity:above-12)},minimumWidth=fromList||comparison.length?(mapHasPhoto?box[2]:initialWidth)/1.6:0;
  const blockers=()=>[overlay,readRect(q('.side')),readRect(q('.list-tab')),readRect(q('.head')),readRect(q('.zoom'))].filter(Boolean);
  let occluders=blockers();
  if(desktopZonePlan() && fromList && !comparison.length){
   const bounds=rowBounds([row],worldHeight);
   if(!bounds)return;
   const area=desktopArea(),ratio=mapRatio();
   const freeTop=Math.max(area.top,-mapRect.top+12),freeBottom=Math.min(area.bottom,viewport.bottom-mapRect.top-12);
   const anchorX=(area.left+area.right)/(2*mapRect.width);
   const anchorY=(freeBottom>freeTop?(freeTop+freeBottom)/2:(area.top+area.bottom)/2)/mapRect.height;
   const x=(bounds.left+bounds.right)/2,y=(bounds.top+bounds.bottom)/2;
   // Use the widest crop that centres the lot and still fills the map with the photo.
   const width=Math.min(initialWidth,x/anchorX,(843-x)/(1-anchorX),ratio*y/anchorY,ratio*(worldHeight-y)/(1-anchorY));
   const height=width/ratio;
   const target=constrain([x-width*anchorX,y-height*anchorY,width,height]);
   fly(selectorFocusView(target,{rows:[row],worldHeight,mapRect,occluders,viewport,fixedScale:true,limitToPhoto:limitToPhoto()}));
   return;
  }
  if(targets.every(item=>selectorIsClear(view,{row:item,worldHeight,mapRect,viewport:visibleViewport,occluders})))return;
  const desired=fromList&&!comparison.length?selectorListView(row,{rows,worldHeight,box}):view;
  const target=constrain([desired[0],desired[1],Math.max(desired[2],minimumWidth),Math.max(desired[2],minimumWidth)/mapRatio()]);
  const solve=()=>selectorFocusView(target,{rows:targets,worldHeight,mapRect,occluders,viewport,above,comparison:comparison.length>0,minimumWidth,fixedScale:!comparison.length,limitToPhoto:limitToPhoto()});
  let next=solve();
  const side=readRect(q('.side')),bounds=rowBounds([row],worldHeight);
  const underList=side&&bounds&&mapRect.left+(bounds.left-next[0])/next[2]*mapRect.width<side.right+12&&mapRect.left+(bounds.right-next[0])/next[2]*mapRect.width>side.left-12&&mapRect.top+(bounds.top-next[1])/next[3]*mapRect.height<side.bottom+12&&mapRect.top+(bounds.bottom-next[1])/next[3]*mapRect.height>side.top-12;
  // At a photo edge, give the lot space by folding the list, never by zooming in.
  if(!desktopZonePlan()&&!comparison.length&&selected&&underList){listCollapsed=true;paintListState();occluders=blockers();next=solve()}
  if(next.some((v,i)=>Math.abs(v-view[i])>1e-7))fly(next);
 }
 function pick(id,fromList=false){
  const row=byId.get(id);if(!row)return;cancelAnimationFrame(frame);listCollapsed=false;if(compact()){mobileListOpen=false;section.removeAttribute('data-list-panel-hidden');if(!fullscreen()&&section.dataset.listOnly!=='true'&&!sheetMode())section.scrollIntoView({block:'start',behavior:'instant'}); }
  if(comparison.length){if(row.id!==comparison[0])comparison=[comparison[0],row.id];selected=null;onSelect?.(null)}else{selected=row.id;onSelect?.(row.id)}paint();
  if(ready)focusSelection(row,fromList);
  if(fromList&&sheetMode()&&!fullscreen()){
   requestAnimationFrame(()=>{
    if(disposed||selected!==row.id)return;
    const nav=host.closest('.miniweb')?.querySelector('.project-nav');
    const headerHeight=nav?Math.max(0,parseFloat(getComputedStyle(nav).top)||0)+nav.offsetHeight:0;
    const inset=Math.max(viewportInset,headerHeight)+8;
    const rect=map.getBoundingClientRect(),bottom=card.getBoundingClientRect().bottom;
    const screen=window.visualViewport?.height||window.innerHeight;
    if(rect.top<inset||rect.bottom>screen||(bottom>screen&&bottom-rect.top<=screen-inset)){
     map.style.scrollMarginTop=inset+'px';
     map.scrollIntoView({block:'start',behavior:'instant'});
    }
   });
  }
  if(q('.side').hidden){
   if(fromList){const panel=comparison.length?tray:card;panel.tabIndex=-1;panel.focus({preventScroll:true})}
   return;
  }
  const active=list.querySelector('[data-select="'+CSS.escape(row.id)+'"]');
  if(active){
   const a=active.getBoundingClientRect(),b=list.getBoundingClientRect();
   if(a.top<b.top||a.bottom>b.bottom)list.scrollTop+=a.top-b.top;
   if(fromList)active.focus({preventScroll:true});
  }
 }
 const chooseBlocks=[...new Set(rows.filter(r=>!r.unavailable).map(r=>r.block).filter(Boolean))].sort(collator.compare);
 for(const name of chooseBlocks)blockSelect.add(new Option('Manzana '+name,name));
 blockSelect.addEventListener('change',()=>{block=blockSelect.value;selected=null;onSelect?.(null);paint();if(ready)fly(block?fit(rows.filter(r=>!r.unavailable&&r.block===block)):resetTarget())},{signal});
 q('.order').addEventListener('change',e=>{order=e.target.value;paint()},{signal});
 q('.f-state').addEventListener('change',e=>{if(sheetMode()){phoneState=e.target.value;paint();return}state=e.target.value;if(selected&&!selectorVisible(rows,state,block).some(r=>r.id===selected)){selected=null;onSelect?.(null)}paint()},{signal});
 q('.f-zone').addEventListener('change',e=>{block=e.target.value;selected=null;onSelect?.(null);paint()},{signal});
 let suppressClick=false;
 section.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-fullscreen')){toggleFullscreen();return}
  if(button.hasAttribute('data-list-hide')){mobileListOpen=false;section.setAttribute('data-list-panel-hidden','');paintListState();q('.list-show').focus({preventScroll:true});return}
  if(button.hasAttribute('data-list-show')){mobileListOpen=compact();section.removeAttribute('data-list-panel-hidden');paintListState();q('.list-hide').focus({preventScroll:true});return}
  if(button.hasAttribute('data-list-close')){mobileListOpen=false;paintListState();q('.list-tab').focus({preventScroll:true});return}
  if(button.hasAttribute('data-list-open')&&sheetMode()){
   mobileListOpen=!mobileListOpen;
   if(mobileListOpen&&selected){selected=null;onSelect?.(null)}
   paint();
   (mobileListOpen?q('.list-close'):q('.list-tab')).focus({preventScroll:true});
   return;
  }
  if(button.hasAttribute('data-list-open')){listCollapsed=false;mobileListOpen=compact();section.removeAttribute('data-list-panel-hidden');paintListState();const active=[...list.querySelectorAll('.row')].find(n=>n.dataset.select===selected);(active||q('.order')).focus({preventScroll:true});return}
  if(button.hasAttribute('data-state')){state=button.dataset.state;if(selected&&!selectorVisible(rows,state,block).some(r=>r.id===selected)){selected=null;onSelect?.(null)}paint();q('.chips').querySelector(`[data-state="${state}"]`)?.focus({preventScroll:true});return}
  if(button.hasAttribute('data-zone')){
   block=button.dataset.zone;selected=null;onSelect?.(null);paint();
   q('.zone-filters [aria-pressed="true"]')?.focus({preventScroll:true});
   if(ready)fly(block?fit(rows.filter(r=>!r.unavailable&&r.block===block)):resetTarget());
   return;
  }
  if(button.dataset.select){pick(button.dataset.select,true);return}
  if(button.dataset.zoom){button.dataset.zoom==='all'?showWholePlan():zoom(button.dataset.zoom==='in'?.6:1.6);return}
  if(button.hasAttribute('data-clear-compare')){exitComparison();return}
  if(button.dataset.compareConsult){const row=byId.get(button.dataset.compareConsult);if(selectorCanConsult(row?.lot))onConsult?.(row.id);return}
  const action=button.dataset.action;if(!action)return;
  if(action==='close'){const id=selected;selected=null;onSelect?.(null);paint();focusListReturn(id);return}
  if(action==='available'){if(sheetMode())phoneState='disponible';state='disponible';block='';selected=null;onSelect?.(null);if(compact())mobileListOpen=true;listCollapsed=false;section.removeAttribute('data-list-panel-hidden');paint();(list.querySelector('.row')||q('.order'))?.focus({preventScroll:true});return}
  if(!selected||!byId.has(selected))return;
  if(action==='consult'&&selectorCanConsult(byId.get(selected)?.lot))onConsult?.(selected);
  if(action==='brochure'){
   const lotId=selected;
   if(onBrochure&&!button.disabled){
    button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label','Generando brochure');button.textContent='Generando…';
    Promise.resolve().then(()=>onBrochure(lotId)).then(result=>{if(result===false)throw Error('brochure_failed');resetBrochureButton(button)}).catch(()=>{button.textContent='Reintentar';button.setAttribute('aria-label','Reintentar descarga')})
     .finally(()=>{button.disabled=false;button.removeAttribute('aria-busy')});
   }
   return;
  }
  if(action==='360'){const lot=byId.get(selected).lot;if(safeUrl(currentConfig.lotes?.[lot.id]?.tour360))onTour?.(lot.id);else onPanoramas?.(lot.id)}
  if(action==='compare'){const base=byId.get(selected);comparison=[selected];selected=null;onSelect?.(null);paint();focusSelection(base);tray.focus({preventScroll:true})}
 },{signal});
 function buildMap(){
  const zoneSettings=salesZones(currentConfig);
  shapes.clear();lotLabels.clear();map.querySelectorAll('.lot,.lot-number').forEach(node=>node.remove());
  const extent=rasterExtent||{left:0,top:0,width:1,height:1};
  if(probe.naturalWidth)worldHeight=843*probe.naturalHeight/probe.naturalWidth*extent.height/extent.width;
  image.setAttribute('x',-843*extent.left/extent.width);
  image.setAttribute('y',-worldHeight*extent.top/extent.height);
  image.setAttribute('width',843/extent.width);
  image.setAttribute('height',worldHeight/extent.height);
  if(rasterExtent||whiteMap)section.dataset.mapWhite='true';else delete section.dataset.mapWhite;
  for(const row of rows){if(!row.points&&!row.pin)continue;const attrs=row.points?{points:row.points.map(([u,v])=>[u*843,v*worldHeight].join(',')).join(' ')}:{cx:row.pin[0]*843,cy:row.pin[1]*worldHeight,r:5};const shape=create(row.points?'polygon':'circle',attrs);
   shape.setAttribute('class','lot'+(row.unavailable?' nov':''));shape.dataset.state=states[row.lot.estado]?row.lot.estado:'sin';shape.setAttribute('vector-effect','non-scaling-stroke');shape.style.setProperty('--c',row.zone&&!row.unavailable&&salesZones(currentConfig).colorPor==='zona'?salesZoneColor(row.zone,paletteTokens(currentConfig.paleta).texto):stateOf(row.lot).color);
   if(row.zone){shape.dataset.zoneId=row.zone.id;paintSalesZone(shape,currentConfig,row.lot,project,map);if(!row.unavailable&&zoneSettings.colorPor==='zona')shape.dataset.zoneFill='true';}shape.setAttribute('aria-label',label(row)+', '+(row.unavailable&&section.dataset.estados==='regla'?'No comercializado':stateOf(row.lot).text));
   if(!row.unavailable){shape.setAttribute('tabindex','0');shape.setAttribute('role','button');shape.addEventListener('click',()=>{if(!suppressClick)pick(row.id)},{signal});shape.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pick(row.id)}},{signal})}else{shape.setAttribute('aria-disabled','true');shape.setAttribute('role','img')}
   shape.dataset.lotId=row.id;
   shapes.set(row.id,shape);map.append(shape);
   if(row.points&&!row.unavailable&&(!row.zone||section.dataset.estados==='regla')){
    const rule=section.dataset.estados==='regla';
    const text=create(rule?'g':'text',{class:'lot-number','text-anchor':'middle','dominant-baseline':'central','aria-hidden':'true','pointer-events':'none'});
    if(rule){
     const box=create('foreignObject',{x:-50,y:-16,width:100,height:32});
     const content=document.createElement('span');content.className='plan-caption';box.append(content);text.append(box);
    }
    lotLabels.set(row.id,text);map.append(text);
   }

  }
  startView();rebuildZoneLayers();paintMap();paintLotLabels();ready=true;
 }
 const whiteMap=!mapHasPhoto&&(salesZones(currentConfig).zonas.length>0||currentConfig.recorrido?.escena?.planoActivo==='vectorial')&&lots.some(l=>shapeFor?.(l)?.points),photo=selectorMapSource(mapUrl,{hasPhoto:mapHasPhoto,hasGeometry:whiteMap,safeUrl});if(whiteMap)section.dataset.mapWhite='true';const probe=new Image();
 const listOnly=()=>{
  host.dataset.listOnly='true';section.dataset.listOnly='true';
  map.hidden=true;map.inert=true;q('.zoom').hidden=true;q('.zoom').inert=true;
  q('.map-message').hidden=true;ready=false;
  viewportHeight();
 };
 const reveal=()=>{delete section.dataset.mapPending;section.removeAttribute('aria-busy');q('.map-message').hidden=true;resolveReady(true);};
 const photoReady=()=>{
  if(disposed)return;
  photoWidth=probe.naturalWidth;worldHeight=843*probe.naturalHeight/photoWidth;
  // A deep link can open the sheet while the shadow stylesheet is loading.
  // Read its styled height before measuring the toolbar and framing the map.
  if(compact())paintListState();else if(desktopZonePlan())viewportHeight();
  buildMap();reveal();
  if(mobileZonePlan()&&selected)focusSelection(byId.get(selected),false,true);
 };
 const unavailable=text=>{
  if(disposed)return;
  listOnly();reveal();
  if(text){
   const notice=document.createElement('p');notice.dataset.mapFailure='';notice.setAttribute('role','status');notice.textContent=text;
   const header=q('.side header'),heading=document.createElement('div');
   header.before(heading);heading.append(header,notice);
  }
 };
 if(photo){
  image.setAttribute('href',photo);const backdrop=q('.list-backdrop');if(backdrop)backdrop.style.setProperty('--list-photo','url('+JSON.stringify(photo)+')');
  const decoded=new Promise(resolve=>{
   probe.onload=()=>probe.decode?probe.decode().then(()=>resolve(true),()=>resolve(false)):resolve(true);
   probe.onerror=()=>resolve(false);
  });
  Promise.all([sheetReady,decoded]).then(([styled,loaded])=>{
   if(disposed)return;
   if(styled&&loaded)photoReady();
   else unavailable('No se pudo mostrar el plano. Puede elegir un lote en la lista.');
  });
  probe.src=photo;
 }else sheetReady.then(()=>unavailable(''));
 const pointers=new Map();let gesture=null;
 map.addEventListener('pointerdown',e=>{if(e.button!==0||compact()&&e.pointerType==='touch')return;cancelAnimationFrame(frame);pointers.set(e.pointerId,[e.clientX,e.clientY]);suppressClick=false;gesture={view:[...view],points:[...pointers.values()]};},{signal});
 map.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);const now=[...pointers.values()],rect=map.getBoundingClientRect();
  if(now.length===2&&gesture.points.length===2){const distance=p=>Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]),ratio=distance(gesture.points)/Math.max(1,distance(now)),w=Math.max(box[2]/32,Math.min(box[2]*1.5,gesture.view[2]*ratio)),h=w*gesture.view[3]/gesture.view[2],oldCenter=gesture.points[0].map((v,i)=>(v+gesture.points[1][i])/2),center=now[0].map((v,i)=>(v+now[1][i])/2);view=[gesture.view[0]+(oldCenter[0]-rect.left)/rect.width*gesture.view[2]-(center[0]-rect.left)/rect.width*w,gesture.view[1]+(oldCenter[1]-rect.top)/rect.height*gesture.view[3]-(center[1]-rect.top)/rect.height*h,w,h];suppressClick=true;setView();return}
  if(now.length!==1)return;const dx=now[0][0]-gesture.points[0][0],dy=now[0][1]-gesture.points[0][1];if(Math.hypot(dx,dy)>4){suppressClick=true;map.setPointerCapture(e.pointerId);map.classList.add('drag');view=[gesture.view[0]-dx/rect.width*gesture.view[2],gesture.view[1]-dy/rect.height*gesture.view[3],gesture.view[2],gesture.view[3]];setView()}
 },{signal});
 const end=e=>{if(compact()&&e.pointerType==='touch')return;pointers.delete(e.pointerId);gesture=pointers.size?{view:[...view],points:[...pointers.values()]}:null;map.classList.remove('drag');setTimeout(()=>suppressClick=false,0)};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])map.addEventListener(event,end,{signal});
 let touchGesture=null,oneFingerStart=null,sheetGesture=null;
 const touchPoints=event=>[...event.touches].filter(t=>!t.target||map.contains(t.target)).map(t=>[t.clientX,t.clientY]);
 const touchCenter=points=>points.reduce((a,p)=>a.map((n,i)=>n+p[i]/points.length),[0,0]);
 function startTouch(event){
  if(!compact()||!ready)return;const points=touchPoints(event);oneFingerStart=points.length===1?{point:points[0],view:[...view],axis:null}:null;
  if(points.length>=2||fullscreen()){
   if(event.cancelable===false){touchGesture=null;return;}event.preventDefault();cancelAnimationFrame(frame);suppressClick=true;touchGesture={view:[...view],points:points.slice(0,2)};
  }else touchGesture=null;
 }
 map.addEventListener('touchstart',startTouch,{signal,passive:false});
 map.addEventListener('touchmove',event=>{
  if(!compact()||!ready)return;const points=touchPoints(event);
  if(points.length===1&&!fullscreen()){
   if(!oneFingerStart)return;
   const dx=points[0][0]-oneFingerStart.point[0],dy=points[0][1]-oneFingerStart.point[1];
   if(!oneFingerStart.axis){
    if(Math.max(Math.abs(dx),Math.abs(dy))<7)return;
    oneFingerStart.axis=map.hasAttribute('data-pan')?'both':Math.abs(dx)>Math.abs(dy)?'horizontal':'vertical';
    suppressClick=true;
    cancelAnimationFrame(frame);
   }
   if((oneFingerStart.axis==='horizontal'||oneFingerStart.axis==='both')&&event.cancelable){
    event.preventDefault();
    const initial=oneFingerStart.view;
    const rect=map.getBoundingClientRect();
    view=[initial[0]-dx*initial[2]/rect.width,initial[1]-(oneFingerStart.axis==='both'?dy*initial[3]/rect.height:0),initial[2],initial[3]];
    setView();
   }
   return;
  }
  if(!touchGesture||event.cancelable===false)return;event.preventDefault();const now=points.slice(0,2),old=touchGesture.points;if(now.length!==old.length||!now.length)return;
  const rect=map.getBoundingClientRect(),a=touchCenter(old),b=touchCenter(now),distance=p=>p.length===2?Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]):1,ratio=distance(old)/Math.max(1,distance(now)),w=touchGesture.view[2]*ratio,h=w/mapRatio();
  view=[touchGesture.view[0]+(a[0]-rect.left)/rect.width*touchGesture.view[2]-(b[0]-rect.left)/rect.width*w,touchGesture.view[1]+(a[1]-rect.top)/rect.height*touchGesture.view[3]-(b[1]-rect.top)/rect.height*h,w,h];suppressClick=true;setView();
 },{signal,passive:false});
 const finishTouch=event=>{oneFingerStart=null;touchGesture=null;if(event.touches.length&&(event.touches.length>=2||fullscreen()))startTouch(event);else if(!event.touches.length)setTimeout(()=>suppressClick=false,0);};
 map.addEventListener('touchend',finishTouch,{signal,passive:false});map.addEventListener('touchcancel',()=>{oneFingerStart=null;touchGesture=null;setTimeout(()=>suppressClick=false,0);},{signal,passive:true});
 function cancelSheet(){if(sheetGesture){sheetGesture.panel.style.removeProperty('transform');delete sheetGesture.panel.dataset.dragging;}sheetGesture=null;}
 for(const panel of [card,tray]){
  panel.addEventListener('touchstart',event=>{if(!compact()||sheetMode()||section.dataset.listOnly==='true'||event.touches.length!==1||event.target.closest('button,a,input,select')||!event.target.closest('.top,.compare-head'))return;const t=event.touches[0];sheetGesture={panel,x:t.clientX,y:t.clientY,dy:0};},{signal,passive:true});
  panel.addEventListener('touchmove',event=>{if(!sheetGesture||sheetGesture.panel!==panel||event.touches.length!==1)return;const t=event.touches[0],dy=t.clientY-sheetGesture.y,dx=t.clientX-sheetGesture.x;if(dy<0||Math.abs(dx)>Math.abs(dy))return;if(event.cancelable!==false)event.preventDefault();sheetGesture.dy=dy;panel.dataset.dragging='true';panel.style.transform='translateY('+dy+'px)';},{signal,passive:false});
  panel.addEventListener('touchend',()=>{if(!sheetGesture||sheetGesture.panel!==panel)return;const close=sheetGesture.dy>60;cancelSheet();if(close){if(panel===tray)exitComparison();else{selected=null;onSelect?.(null);paint();}}},{signal,passive:true});
  panel.addEventListener('touchcancel',cancelSheet,{signal,passive:true});
 }
 window.addEventListener('blur',()=>{touchGesture=null;oneFingerStart=null;cancelSheet();for(const id of pointers.keys())if(map.hasPointerCapture?.(id))map.releasePointerCapture(id);pointers.clear();gesture=null;map.classList.remove('drag');suppressClick=false;},{signal});
 const unbridgeWheel=bridgeInlineWheel(map,section,{fullscreen,onHorizontal:delta=>{cancelAnimationFrame(frame);const rect=map.getBoundingClientRect();view[0]+=delta/rect.width*view[2];setView()},onZoom:(delta,event)=>{if(!delta)return;const rect=map.getBoundingClientRect();zoom(delta>0?1.2:.83,[(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height])}});lifecycle.signal.addEventListener('abort',unbridgeWheel,{once:true});
 map.addEventListener('wheel',e=>{if(!fullscreen()&&!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const rect=map.getBoundingClientRect(),delta=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!delta)return;zoom(delta>0?1.2:.83,[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height])},{signal,passive:false});
 map.addEventListener('keydown',e=>{if(e.target!==map)return;const delta={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]}[e.key];if(delta){e.preventDefault();fly([view[0]+delta[0]*view[2],view[1]+delta[1]*view[3],view[2],view[3]])}else if(['+','=','-','Home'].includes(e.key)){e.preventDefault();e.key==='Home'?showWholePlan():zoom(e.key==='-'?1.6:.6)}},{signal});
 // Si otra capa retoca la ficha después (importes, financiación), el alto necesario se vuelve a calcular.
 let panelSize='';const panelHead=q('.head'),panelCheck=()=>{const size=[card.offsetHeight,tray.offsetHeight,Math.round(panelHead.getBoundingClientRect().bottom-section.getBoundingClientRect().top)].join(':');if(disposed||size===panelSize)return;panelSize=size;if(compact())paintListState()},panelResize=new ResizeObserver(panelCheck);for(const target of [card,tray,panelHead,q('.side')])panelResize.observe(target);
 for(const type of ['transitionend','animationend'])section.addEventListener(type,panelCheck,{signal:lifecycle.signal});
 let lastSize='',lastPanel=null,lastMapWidth=0;
 const resize=new ResizeObserver(()=>{
  const rect=map.getBoundingClientRect(),size=[rect.width,rect.height].join(':');
  if(!rect.width||!rect.height||size===lastSize)return;
  const panel=wideEntry()&&(selected||mobileListOpen||comparison.length)?'detail':'map';
  const panelResized=wideEntry()&&lastPanel!==null&&panel!==lastPanel&&rect.width===lastMapWidth;
  lastSize=size;lastPanel=panel;lastMapWidth=rect.width;
  if(!ready)return;
  if(sheetMode()!==section.hasAttribute('data-mobile-sheet'))viewportHeight();
  if(panelResized){
   const [x,y,w,h]=view,home=resetTarget(),atHome=w>=initialWidth*.995;
   initialWidth=home[2];const height=w/mapRatio();
   view=atHome?home:[x,y+(h-height)/2,w,height];setView();
  }else startView();
  if(fullPhoto())return;
  if(block){view=constrain(fit(rows.filter(r=>!r.unavailable&&r.block===block)));setView()}
  const row=byId.get(selected||comparison[0]);if(row)focusSelection(row,false,true);
 });
 resize.observe(map);
 const panelObserver=new MutationObserver(()=>{viewportHeight();if(ready&&(!compact()||fullPhoto())){cancelAnimationFrame(frame);startView()}});
 panelObserver.observe(section,{attributes:true,attributeFilter:['data-list-panel-hidden']});
 signal.addEventListener('abort',()=>panelObserver.disconnect(),{once:true});
 function update(next,selection){
  const signature=zoneFingerprint(next),zoneChanged=signature!==zoneSignature;currentConfig=next;host.dataset.t=selectorTone(next);
  if(zoneChanged){zoneSignature=signature;rows=projectRows(next);byId=new Map(rows.filter(r=>!r.unavailable).map(r=>[r.id,r]));comparison=comparison.filter(id=>byId.has(id));if(selected&&!byId.has(selected)){selected=null;onSelect?.(null);}}
  const ruleBefore=section.dataset.estados;paintStateRule(next);const ruleChanged=ruleBefore!==section.dataset.estados;
  viewportHeight();
  if((zoneChanged||ruleChanged)&&ready)buildMap();
  const id=comparison.length||selection==null?null:String(selection);
  if(id!==selected||zoneChanged||ruleChanged){selected=byId.has(id)?id:null;paint();if(ready&&mobileZonePlan()&&selected)focusSelection(byId.get(selected));}else{paintCard();paintTray();paintListState();}
 }

 // Llegada desde el recorrido abierto por separado: /proyecto?estado=disponible#lotes muestra la lista ya filtrada (sólo con la regla de estados activa).
 if(section.dataset.estados==='regla'&&new URLSearchParams(location.search).get('estado')==='disponible'){
  state='disponible';if(compact())mobileListOpen=true;
  // Sólo para esta llegada explícita: el ancla #lotes vive dentro del shadow DOM y no posiciona sola. Se lleva la vista y el foco cuando el selector está listo.
  // El plano se carga recién cuando el selector entra en pantalla, así que no se espera a que esté listo: se reintenta mientras la página termina de armarse y se abandona en cuanto la persona se mueve.
  let moved=false,focused=null;const stop=()=>{moved=true};
  for(const type of ['wheel','touchstart','keydown','pointerdown'])window.addEventListener(type,stop,{once:true,passive:true,signal});
  // El foco se da una sola vez. Si después la persona lo llevó a otro lado, se deja de insistir también con el desplazamiento.
  const arrive=()=>{if(disposed||moved)return;if(focused&&root.activeElement!==focused){moved=true;return}host.scrollIntoView({block:'start'});if(!focused){focused=list.querySelector('.row')||q('.order');focused?.focus({preventScroll:true})}};
  requestAnimationFrame(arrive);for(const delay of [600,1500,3000,5000])setTimeout(arrive,delay);
  window.addEventListener('load',()=>setTimeout(arrive,100),{once:true,signal});
  whenReady.then(ok=>{if(ok!==false)requestAnimationFrame(arrive)});
 }
 update(config,null);paint();
 return {update,whenReady,setViewportInset(inset){viewportInset=Math.max(0,Number(inset)||0);viewportHeight()},destroy(){disposed=true;resolveReady(false);if(fullscreen())exitFullscreen();lifecycle.abort();cancelAnimationFrame(frame);resize.disconnect();panelResize.disconnect();host.parentElement?.style.removeProperty('--selector-needed');probe.onload=probe.onerror=null;host.parentElement?.style.removeProperty('--selector-height');root.replaceChildren()}};
}
