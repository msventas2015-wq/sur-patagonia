import {createLotRing,addMapRing} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {paletteTokens} from './miniweb-palettes.mjs';
// Shared presentation data: no inventory state or geometry is overwritten here.
export const SALES_ZONE_STATES={a_la_venta:'A la venta',proximamente:'Próximamente',suspendida:'No a la venta',oculta:'Oculta'};
export const SALES_ZONE_LABELS=['Manzana','Zona','Etapa','Sector'];
export const SALES_ZONE_APPEARANCE={version:2,modo:'borde',opacidad:.16,opacidadHover:.42,anchoBorde:1.6,anchoContorno:4.5,anchoHover:3.2};
export const SALES_ZONE_COLORS=['#2C4F86','#7FC4E0','#7964A7','#5A81BC','#A387CD','#47A4C1'];
export function allowedZoneColor(color){
 if(!/^#[0-9a-f]{6}$/i.test(color))return false;
 const [r,g,b]=color.slice(1).match(/../g).map(c=>parseInt(c,16)/255),high=Math.max(r,g,b),low=Math.min(r,g,b),d=high-low;
 if(d<.12||high<.22)return false;
 const hue=(60*(high===r?(g-b)/d:high===g?2+(b-r)/d:4+(r-g)/d)+360)%360;
 return hue>=185&&hue<=310;
}
export function zoneLine(color){
 const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]<125?'#'+rgb.map(c=>Math.round(c+(255-c)*.45).toString(16).padStart(2,'0')).join(''):color;
}
function glacierColor(zone,index,upgraded){
 const name=String(zone.nombre||'').trim().match(/^(?:(?:zona|etapa|sector)\s+)?([ab])$/i);
 if(!upgraded&&name)return SALES_ZONE_COLORS[name[1].toLowerCase()==='a'?0:1];
 return allowedZoneColor(zone.color)?zone.color:SALES_ZONE_COLORS[index%SALES_ZONE_COLORS.length];
}
export const LOT_STATES={
 disponible:{text:'Disponible',color:'#24A860'},reservado:{text:'Reservado',color:'#E8A01C'},
 vendido:{text:'Vendido',color:'#DC403C'},proximamente:{text:'Próximamente',color:'#6fb1ff'},
 no_a_la_venta:{text:'No a la venta',color:'#9aa0a0'},sin:{text:'Sin informar',color:'#c9ccca'}
};
function zoneSwitch(value){
 const old=Object.hasOwn(SALES_ZONE_STATES,value.estado)?value.estado:value.aLaVenta===false?'suspendida':'a_la_venta';
 const previous=value.estadoAnterior||(['oculta','proximamente'].includes(old)?old:null);
 const estado=old==='proximamente'?'suspendida':old;
 return previous?{estado,estadoAnterior:previous}:{estado};
}
export function zoneLotState(zone,lot){
 if(zone?.estado==='oculta')return {...lot,estado:'no_a_la_venta',zonaOculta:true};
 if(zone?.estado==='suspendida')return {...lot,estado:'no_a_la_venta'};
 return lot;
}
export const isListedLot=lot=>Boolean(lot)&&!lot.zonaOculta&&lot.estado!=='no_a_la_venta';
export function lotCounts(lots){
 const states={disponible:0,reservado:0,vendido:0,proximamente:0,sin:0};
 let total=0;
 for(const lot of lots){
  if(!isListedLot(lot))continue;
  states[Object.hasOwn(states,lot.estado)?lot.estado:'sin']++;total++;
 }
 return {total,states};
}
export function zoneCountText(counts){
 return [counts.total+' lotes',...Object.entries(counts.states).filter(([state,n])=>state!=='sin'||n).map(([state,n])=>LOT_STATES[state].text+' '+n)].join(' · ');
}
export function lotRing(doc,lot){
 return createLotRing(doc,lot,(LOT_STATES[lot.estado]||LOT_STATES.sin).color);
}
export function salesZones(config={}){
 const raw=config.recursos?.zonasVenta||{},ids=new Set(),zones=[];
 for(const value of Array.isArray(raw.zonas)?raw.zonas:[]){if(!value||typeof value.id!=='string'||!value.id||ids.has(value.id))continue;ids.add(value.id);zones.push({id:value.id,nombre:String(value.nombre||'').trim().slice(0,100)||'Sin nombre',color:glacierColor(value,zones.length,raw.paleta==='glaciar'),...zoneSwitch(value)});}
 const appearance=raw.apariencia?.version===2?raw.apariencia:{},apariencia={...SALES_ZONE_APPEARANCE,modo:['relleno','borde'].includes(appearance.modo)?appearance.modo:SALES_ZONE_APPEARANCE.modo};
 for(const key of ['opacidad','opacidadHover'])if(Number.isFinite(appearance[key]))apariencia[key]=Math.max(0,Math.min(1,appearance[key]));
 for(const key of ['anchoBorde','anchoContorno','anchoHover'])if(Number.isFinite(appearance[key]))apariencia[key]=Math.max(.5,Math.min(8,appearance[key]));
 return {version:1,paleta:'glaciar',apariencia,rotulo:SALES_ZONE_LABELS.includes(raw.rotulo)?raw.rotulo:'Zona',colorPor:'zona',zonas:zones};
}
export function lotSalesZone(config,id){const zoneId=config.lotes?.[id]?.zonaVenta;return salesZones(config).zonas.find(z=>z.id===zoneId)||null;}
export const salesZoneColor=zone=>zone?.color||SALES_ZONE_COLORS[0];
export function effectiveSaleLot(config,lot){
 return zoneLotState(lotSalesZone(config,lot.id),lot);
}
export function salesZoneBoundaries(polygons){
 const precision=1e6,key=p=>p.map(n=>Math.round(n*precision)).join(','),points=[...new Map(polygons.flat().map(p=>[key(p),p])).values()],edges=new Map();
 for(const polygon of polygons){for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;if(!len)continue;
   const cuts=[{p:a,t:0},{p:b,t:1}];for(const p of points){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len;if(t>1e-7&&t<1-1e-7&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)<1e-7*Math.sqrt(len))cuts.push({p,t});}
   cuts.sort((x,y)=>x.t-y.t);for(let j=1;j<cuts.length;j++){const p=cuts[j-1].p,q=cuts[j].p,k=[key(p),key(q)].sort().join('|');const old=edges.get(k);edges.set(k,{count:(old?.count||0)+1,p,q});}
 }}
 return [...edges.values()].filter(e=>e.count===1).map(({p,q})=>[p,q]);
}

export function salesZoneInterior(points){
 const low=Math.min(...points.map(p=>p[1])),high=Math.max(...points.map(p=>p[1]));let best=0,result=points[0];
 for(const fraction of [.5,.375,.625,.25,.75]){const y=low+(high-low)*fraction,xs=[];let a=points.at(-1);
  for(const b of points){if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));a=b;}
  xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>best){best=xs[i]-xs[i-1];result=[(xs[i]+xs[i-1])/2,y];}
 }return result;
}

export function salesZoneIntersectsBox(points,[left,top,right,bottom]){
 if(points.some(([x,y])=>x>=left&&x<=right&&y>=top&&y<=bottom))return true;
 const inside=([x,y])=>{let result=false,a=points.at(-1);for(const b of points){if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;a=b;}return result;};
 if([[left,top],[right,top],[right,bottom],[left,bottom]].some(inside))return true;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];let low=0,high=1,valid=true;
  for(const [origin,delta,min,max]of [[a[0],b[0]-a[0],left,right],[a[1],b[1]-a[1],top,bottom]]){if(!delta){if(origin<min||origin>max)valid=false;continue;}const t0=(min-origin)/delta,t1=(max-origin)/delta;low=Math.max(low,Math.min(t0,t1));high=Math.min(high,Math.max(t0,t1));}
  if(valid&&high>=low)return true;
 }return false;
}

export function nextSalesZoneColor(zones=[]){const used=new Set(zones.map(z=>salesZoneColor(z).toLowerCase()));return SALES_ZONE_COLORS.find(c=>!used.has(c.toLowerCase()))||SALES_ZONE_COLORS[zones.length%SALES_ZONE_COLORS.length];}
export function salesZoneInventory(config,lots,project={}){return project.slug==='aldea-los-huemules'||!salesZones(config).zonas.length?lots:lots.map(l=>effectiveSaleLot(config,l)).filter(l=>!l.zonaOculta);}
export const canInquireAboutLot=lot=>!!lot&&!['vendido','no_a_la_venta'].includes(lot.estado);

export function projectSaleInventory(project, sourceLots) {
 const theme=typeof project.tema==='string'
  ? (project.tema.trimStart().startsWith('{')?JSON.parse(project.tema):{})
  : project.tema;
 const config=theme?.miniweb;
 const lots=salesZoneInventory(config||{},sourceLots,project)
  .filter(isListedLot)
  .map(lot=>({...lot,permiteConsulta:canInquireAboutLot(lot)}));
 const managedZones=project.slug!=='aldea-los-huemules'&&salesZones(config||{}).zonas.length>0;
 const total=managedZones||lots.length!==sourceLots.length?lots.length:project.cantidad_lotes;
 return {config,lots,total};
}
export function salesZoneAppearance(config,lot,project={}){
 if(project.slug==='aldea-los-huemules')return null;
 const zone=lotSalesZone(config,lot.id),settings=salesZones(config);if(!zone)return null;
 const effective=effectiveSaleLot(config,lot);return {zone,effective,hidden:!!effective.zonaOculta,unavailable:effective.estado==='no_a_la_venta',color:salesZoneColor(zone,paletteTokens(config.paleta).texto),...settings.apariencia,byZone:true,opacidad:.24,opacidadHover:.34};
}

export const publicSalesZoneColor=zone=>zone?.estado==='suspendida'?'#ffffff':salesZoneColor(zone);
export function zoneSurface(shape,color,off){
 shape.style.setProperty('--zone-color',color);shape.style.setProperty('--zone-line',off?'#fff':zoneLine(color));
 if(off){shape.style.fill='none';shape.style.stroke='#fff';shape.style.strokeOpacity='.8';shape.style.strokeWidth='.8px';shape.style.strokeDasharray='none';}
}
export function paintSalesZone(shape,config,lot,project={},layer=shape.parentElement){
 const a=salesZoneAppearance(config,lot,project);if(!a||a.hidden||!a.byZone&&!a.unavailable)return a;
 shape.dataset.salesZone=a.zone.id;shape.dataset.zoneUpcoming=String(a.effective.estado==='proximamente');shape.dataset.zoneUnavailable=String(a.unavailable);shape.dataset.zoneMode=a.modo;
 zoneSurface(shape,a.color,a.unavailable);
 for(const [key,value]of Object.entries({'--zone-opacity':.24,'--zone-hover-opacity':.34,'--zone-width':1.8,'--zone-hover-width':3,'--zone-dash':'none'}))shape.style.setProperty(key,String(value));
 shape.setAttribute('vector-effect','non-scaling-stroke');shape.setAttribute('stroke-linejoin','round');return a;
}
export function salesZoneLabelPoint(polygons){
 const points=polygons.flat(),top=Math.min(...points.map(p=>p[1])),bottom=Math.max(...points.map(p=>p[1]));let best=0,result=salesZoneInterior(polygons[0]);
 for(const fraction of [.35,.5,.65,.25,.75]){const y=top+(bottom-top)*fraction,intervals=[];for(const polygon of polygons){const xs=[];let a=polygon.at(-1);for(const b of polygon){if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));a=b;}xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i+=2)intervals.push([xs[i-1],xs[i]]);}intervals.sort((a,b)=>a[0]-b[0]);const joined=[];for(const span of intervals){const last=joined.at(-1);if(last&&span[0]<=last[1]+1e-8)last[1]=Math.max(last[1],span[1]);else joined.push([...span]);}for(const [left,right]of joined)if(right-left>best+1e-8){best=right-left;result=[(left+right)/2,y];}}
 return result;
}
export function buildSalesZoneLayers(map,config,rows,{height=1500,project={},ink='#29221a'}={}){
 const result={layers:[],markers:[]},settings=salesZones(config);if(project.slug==='aldea-los-huemules'||!settings.zonas.length)return result;
 const doc=map.ownerDocument,create=(tag,attrs={})=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 for(const row of rows){const zone=row.zone||lotSalesZone(config,row.id||row.lot.id);if(!zone||row.hidden||row.unavailable)continue;
  const points=row.points?.map(([x,y])=>[x*843,y*height]),anchor=row.pin&&[row.pin[0]*843,row.pin[1]*height];
  if(!points&&!anchor)continue;
  const ring=lotRing(doc,zoneLotState(zone,row.lot));
  if(ring){ring.classList.add('zone-layer');addMapRing(map,ring,row.lot,points,anchor);result.markers.push(ring);}
 }
 for(const zone of settings.zonas.filter(z=>z.estado==='a_la_venta')){
  const members=rows.filter(r=>(r.zone||lotSalesZone(config,r.id||r.lot.id))?.id===zone.id&&r.points);if(!members.length)continue;
  const edges=salesZoneBoundaries(members.map(r=>r.points)),color=zoneLine(salesZoneColor(zone)),outline=create('path',{class:'zone-layer zone-outline',fill:'none',stroke:color,'stroke-width':1.8,'stroke-opacity':zone.estado==='suspendida'?.55:1,'stroke-linejoin':'round','stroke-linecap':'round','stroke-dasharray':zone.estado==='proximamente'?'10 7':'none','vector-effect':'non-scaling-stroke','pointer-events':'none','aria-hidden':'true',d:edges.map(([a,b])=>'M'+a[0]*843+' '+a[1]*height+'L'+b[0]*843+' '+b[1]*height).join(' ')});
  const points=members.flatMap(r=>r.points),bounds=[Math.min(...points.map(p=>p[0]*843)),Math.min(...points.map(p=>p[1]*height)),Math.max(...points.map(p=>p[0]*843)),Math.max(...points.map(p=>p[1]*height))],labelPoint=salesZoneLabelPoint(members.map(r=>r.points)),anchor=[labelPoint[0]*843,labelPoint[1]*height],labelNode=create('g',{class:'zone-layer zone-label','aria-hidden':'true','pointer-events':'none',transform:'translate('+anchor[0]+' '+(anchor[1]+4)+')'}),text=create('text',{'text-anchor':'middle',y:0});text.textContent=zone.nombre+(zone.estado==='a_la_venta'?'':' · '+SALES_ZONE_STATES[zone.estado]);labelNode.append(text);map.append(outline,labelNode);result.layers.push({bounds,labelNode,outline,id:zone.id,anchor});
 }for(const layer of result.layers)map.append(layer.labelNode);return result;
}
