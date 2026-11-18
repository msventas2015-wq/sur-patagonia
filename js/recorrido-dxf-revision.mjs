import {nearbyRingEdges} from './recorrido-geografia.mjs?v=20261116-bordes';
import {lotStateText,lotIdentity,normalizeLotPart,readLotFile,parseLotGrid,planDXFImport,prepareSheetAreas,appendSheetAreaChoice,appendSheetNumberChoice} from './lotes-planilla.mjs?v=20261117-integridad';
import {divideBlock,facePoints} from './recorrido-grilla.mjs?v=20261116-plano6';
import {salesZoneIntersectsBox,salesZoneInterior} from './zonas-venta.mjs?v=20261114-anillo7b';
import {mapStations} from './recorrido-escena.mjs?v=20261114-anillo7c';
const uid=()=>crypto.randomUUID();
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length?(a[i]+a[Math.max(0,i-(a.length%2?0:1))])/2:0;};
export function dxfArea(points){const o=points[0];return Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+(a[0]-o[0])*(b[1]-o[1])-(b[0]-o[0])*(a[1]-o[1]);},0)/2);}
export const dxfIdentity=f=>lotIdentity({numero:f.name});
export const dxfNamed=f=>{const i=dxfIdentity(f);return !!i.block&&!!i.lot;};
function inside(point,ring,boundary=true){let result=false,a=ring.at(-1);for(const b of ring){const dx=b[0]-a[0],dy=b[1]-a[1],t=((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1);if(t>=0&&t<=1&&Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)<1e-7)return boundary;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;a=b;}return result;}
function metrics(points){
 const area=dxfArea(points);let perimeter=0,boxArea=Infinity,elongation=1;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);perimeter+=length;if(!length)continue;const u=[(b[0]-a[0])/length,(b[1]-a[1])/length],v=[-u[1],u[0]],p=points.map(q=>[(q[0]-a[0])*u[0]+(q[1]-a[1])*u[1],(q[0]-a[0])*v[0]+(q[1]-a[1])*v[1]]),w=Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])),h=Math.max(...p.map(q=>q[1]))-Math.min(...p.map(q=>q[1]));if(w*h<boxArea){boxArea=w*h;elongation=Math.max(w,h)/Math.max(1e-9,Math.min(w,h));}}
 return {area,elongation,compactness:4*Math.PI*area/(perimeter*perimeter||1)};
}
// Un borde largo puede estar dividido en varios tramos en el lote vecino.
function sharedBoundary(first,second,tolerance){
 const [base,other]=first.length>=second.length?[first,second]:[second,first];
 const ux=(base.b[0]-base.a[0])/base.length,uy=(base.b[1]-base.a[1])/base.length;
 const startX=other.a[0]-base.a[0],startY=other.a[1]-base.a[1];
 const endX=other.b[0]-base.a[0],endY=other.b[1]-base.a[1];
 if(Math.abs(startX*uy-startY*ux)>tolerance || Math.abs(endX*uy-endY*ux)>tolerance)return false;
 const start=startX*ux+startY*uy,end=endX*ux+endY*uy;
 return Math.min(base.length,Math.max(start,end))-Math.max(0,Math.min(start,end))>tolerance*2;
}
export function classifyDXFCandidates(features,{tolerance=.02}={}){
 const copy=structuredClone(features),lots=copy.filter(f=>f.kind==='lot'),values=new Map(lots.map(f=>[f.id,metrics(f.points)])),middle=median([...values.values()].map(m=>m.area).filter(a=>a>0)),discarded=[];
 for(const f of lots){const m=values.get(f.id),reasons=[];f.dxfReconstructed=true;f.dxfMetrics=m;
  if(!dxfNamed(f)){
   if(m.area<middle*.3)reasons.push('Superficie muy pequeña respecto del lote típico');
   if(m.area>middle*4)reasons.push('Superficie muy grande respecto del lote típico');
   if(m.elongation>9||m.compactness<.04)reasons.push('Forma muy alargada o angosta');
   if(lots.some(other=>other.id!==f.id&&values.get(other.id).area<m.area-1e-5&&other.points.every(p=>inside(p,f.points))&&other.points.some(p=>inside(p,f.points,false))))reasons.push('Contiene otros cierres');
  }
  if(reasons.length){f.dxfDiscardReason=reasons.join('. ');discarded.push(f);}
 }
 const rejected=new Set(discarded.map(f=>f.id)),kept=lots.filter(f=>!rejected.has(f.id)),parent=new Map(kept.map(f=>[f.id,f.id])),find=id=>{while(parent.get(id)!==id){parent.set(id,parent.get(parent.get(id)));id=parent.get(id);}return id;},unite=(a,b)=>{parent.set(find(a),find(b));};
 for(const [a,b] of nearbyRingEdges(kept,tolerance)){
  if(a.ring===b.ring || find(a.ring.id)===find(b.ring.id))continue;
  a.length??=Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1]);
  b.length??=Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1]);
  if(sharedBoundary(a,b,tolerance))unite(a.ring.id,b.ring.id);
 }
 const groups=new Map();for(const f of kept){const id=find(f.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(f);}
 const blocks=[],used=new Set();let next=1;
 for(const members of groups.values()){const names=[...new Set(members.filter(dxfNamed).map(f=>dxfIdentity(f).block))];let name=names.length===1?names[0]:'';if(!name||used.has(name)){while(used.has(String(next)))next++;name=String(next++);}used.add(name);const id=uid();blocks.push({id,nombre:name});for(const f of members)f.dxfGroup=id;}
 return {features:copy.filter(f=>!rejected.has(f.id)),discarded,blocks,report:{total:lots.length,kept:kept.length,discarded:discarded.length,medianArea:middle,groups:blocks.length}};
}
export function renameDXFGroup(features,groupId,name,{linked=new Set()}={}){
 name=String(name||'').trim().replace(/^manzana\s+/i,'');if(!name)throw Error('Escribí el nombre de la manzana.');
 const members=features.filter(f=>f.kind==='lot'&&f.dxfGroup===groupId);if(members.some(f=>linked.has(f.id)))throw Error('Esta manzana ya tiene fichas. Corregí su identificación desde Lotes antes de renombrarla.');
 const next=features.map(f=>{if(!members.includes(f)||!dxfNamed(f))return f;const number=dxfIdentity(f).lot;return {...f,block:name,number,name:'Manzana '+name+' · Lote '+number};});assertDXFNames(next);return next;
}
export function assertDXFNames(features){const seen=new Set();for(const f of features.filter(f=>f.kind==='lot'&&dxfNamed(f))){const key=dxfIdentity(f).key;if(seen.has(key))throw Error('La manzana y el número ya identifican otro lote.');seen.add(key);}return features;}
export function numberDXFFeature(features,id,block,number,{linked=new Set()}={}){
 const f=features.find(f=>f.id===id&&f.kind==='lot');if(!f)throw Error('Elegí un cierre.');if(linked.has(id))throw Error('Este lote ya tiene ficha. Corregí su número desde Lotes.');
 block=String(block||'').trim();number=String(number||'').trim();if(!block||!number)throw Error('Completá manzana y número.');
 const next=features.map(item=>item.id===id?{...item,block,number,name:'Manzana '+block+' · Lote '+number}:item);return assertDXFNames(next);
}
export function nextDXFNumber(features,block,start=1){const used=new Set(features.filter(f=>f.kind==='lot'&&dxfNamed(f)&&dxfIdentity(f).block===normalizeLotPart(block,true)).map(f=>dxfIdentity(f).lot));let number=Math.max(1,Math.floor(Number(start)||1));while(used.has(String(number)))number++;return String(number);}
export function autoNumberDXF(features,group,name,corner='nw',{linked=new Set()}={}){
 const pending=features.filter(f=>f.kind==='lot'&&f.dxfGroup===group&&!dxfNamed(f)&&!linked.has(f.id));
 const center=f=>f.points.reduce((p,q)=>[p[0]+q[0]/f.points.length,p[1]+q[1]/f.points.length],[0,0]),ys=pending.map(f=>Math.max(...f.points.map(p=>p[1]))-Math.min(...f.points.map(p=>p[1]))),height=median(ys)||1,centers=new Map(pending.map(f=>[f.id,center(f)])),north=!corner.startsWith('s'),west=corner.endsWith('w');
 const vertical=pending.sort((a,b)=>(north?-1:1)*(centers.get(a.id)[1]-centers.get(b.id)[1])),rows=[];
 for(const f of vertical){const y=centers.get(f.id)[1],row=rows.at(-1);if(!row||Math.abs(row.y-y)>height*.45)rows.push({y,features:[f]});else row.features.push(f);}
 let next=features;for(const row of rows)for(const f of row.features.sort((a,b)=>(west?1:-1)*(centers.get(a.id)[0]-centers.get(b.id)[0])))next=numberDXFFeature(next,f.id,name,nextDXFNumber(next,name),{linked});return next;
}
export function splitDXFClosure(feature,cols,rows,block,{geographic=false}={}){
 const origin=feature.points[0],lat=origin[1]*Math.PI/180,kx=geographic?111412.84*Math.cos(lat)-93.5*Math.cos(3*lat):1,ky=geographic?111132.92-559.82*Math.cos(2*lat)+1.175*Math.cos(4*lat):1;
 // Un DXF puede representar el cierre tanto con su bandera como repitiendo el primer vértice.
 const last=feature.points.at(-1);
 const ringPoints=last[0]===origin[0]&&last[1]===origin[1]?feature.points.slice(0,-1):feature.points;
 const input=ringPoints.map(([x,y])=>[(x-origin[0])*kx,(y-origin[1])*ky]);
 const xs=input.map(p=>p[0]),ys=input.map(p=>p[1]),left=Math.min(...xs),top=Math.max(...ys),span=Math.max(Math.max(...xs)-left,top-Math.min(...ys));if(!span)throw Error('El cierre no tiene superficie.');
 const id=uid(),vertices=Object.fromEntries(input.map((p,i)=>['v'+i,[(p[0]-left)/span,(top-p[1])/span]])),ring=Object.keys(vertices),plan={version:2,width:1000,height:1000,url:'dxf-review',vertices,edges:[],faces:[{id:uid(),blockId:id,vertices:ring}],blocks:[{id,name:block,boundary:ring,finished:false,divided:false}],addedVertices:[]};
 const divided=divideBlock(plan,id,cols,rows);
 const features=divided.faces.map(face=>{
  const localPoints=facePoints(divided,face).map(([x,y])=>[left+x*span,top-y*span]);
  return {id:uid(),kind:'lot',name:'Lote por identificar',dxfReconstructed:true,dxfGroup:feature.dxfGroup,
   points:localPoints.map(([x,y])=>[origin[0]+x/kx,origin[1]+y/ky]),
   dxfMetrics:metrics(localPoints),layer:feature.layer,dxfSplitFrom:feature.id};
 });
 const original=dxfArea(feature.points),total=features.reduce((sum,f)=>sum+dxfArea(f.points),0);if(Math.abs(original-total)>Math.max(1e-12,original*1e-5))throw Error('La división no conserva el contorno original. No se cambió el cierre.');return features;
}

export function mountDXFReview({host,getScene,getLinked=()=>new Set(),onChange,onStatus=()=>{},onFocus=()=>{}}){
 const doc=host.ownerDocument,ns='http://www.w3.org/2000/svg',make=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;return n;},svg=(tag,attrs)=>{const n=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const panel=make('section');panel.className='rg-dxf-review';host.append(panel);let group=null,mode='select',selected=new Set(),history=[],number='1',showDiscarded=false,message='';
 function tell(text){message=text;const n=panel.querySelector('[data-dxf-note]');if(n)n.textContent=text;onStatus(text);}
 const scene=()=>getScene(),lots=()=>scene().features.filter(f=>f.kind==='lot'),blocks=()=>scene().dxfBlocks||[],active=()=>blocks().find(b=>b.id===group),linked=()=>getLinked();
 const available=()=>lots().some(f=>f.dxfReconstructed)||!!scene().dxfDiscarded?.length;
 const safe=fn=>event=>{try{fn(event);}catch(error){tell(error.message);}};
 function snapshot(){const s=scene();return structuredClone({features:s.features,dxfBlocks:s.dxfBlocks||[],dxfDiscarded:s.dxfDiscarded||[]});}
 function apply(fn,message){const before=snapshot(),draft=structuredClone(before);fn(draft);history.push(before);if(history.length>40)history.shift();Object.assign(scene(),draft);onChange();refresh();tell(message);}
 const selectedFeatures=()=>lots().filter(f=>selected.has(f.id));
 function requireUnlinked(features){if(features.some(f=>linked().has(f.id)))throw Error('Hay lotes con ficha vinculada. No se cambió nada: revisá esos vínculos desde Lotes antes de descartar, agrupar o dividir.');}
 function choose(id,focus=true){group=id;selected.clear();number=nextDXFNumber(scene().features,active()?.nombre||'');if(focus)onFocus(lots().filter(f=>f.dxfGroup===id).flatMap(f=>f.points));onChange(false);refresh();}
 function pick(feature){
  if(mode==='multi'){selected.has(feature.id)?selected.delete(feature.id):selected.add(feature.id);onChange(false);refresh();return;}
  if(mode==='number'){
   if(!active())throw Error('Elegí una manzana antes de numerarla.');if(feature.dxfGroup!==group)throw Error('Ese cierre pertenece a otra manzana. Elegila primero o cambiá a Elegir manzana.');
   selected=new Set([feature.id]);if(dxfNamed(feature)){number=nextDXFNumber(scene().features,active().nombre);onChange(false);refresh();tell('Este lote ya tiene número. Podés corregirlo abajo.');return;}
   const name=active().nombre,n=number||nextDXFNumber(scene().features,name);apply(d=>{d.features=numberDXFFeature(d.features,feature.id,name,n,{linked:linked()});},'Lote '+n+' marcado. Tocá el siguiente cierre.');number=nextDXFNumber(scene().features,name,Number(n)+1);refresh();return;
  }
  group=feature.dxfGroup||'';selected=new Set([feature.id]);onChange(false);refresh();
 }
 function recover(ids){apply(d=>{const restored=d.dxfDiscarded.filter(f=>ids.includes(f.id));if(!restored.length)return;if(d.features.length+restored.length>5000)throw Error('El plano superaría los5000elementos. Recuperá un grupo más chico.');let target=group;if(!d.dxfBlocks.some(b=>b.id===target)){target=uid();d.dxfBlocks.push({id:target,nombre:String(d.dxfBlocks.length+1)});group=target;}for(const f of restored){delete f.dxfDiscardReason;f.dxfGroup||=target;if(d.features.some(item=>item.id===f.id))throw Error('Ese cierre ya está en el plano.');d.features.push(f);}d.dxfDiscarded=d.dxfDiscarded.filter(f=>!ids.includes(f.id));},'Cierres recuperados. Revisá la manzana y numeralos si son lotes.');}
 function refresh(){
  panel.hidden=!available();if(panel.hidden)return;
  if(group===null||group&&!active())group=blocks()[0]?.id||'';const live=new Set(lots().map(f=>f.id));selected=new Set([...selected].filter(id=>live.has(id)));panel.replaceChildren();panel.append(make('h3','Revisar el plano por manzanas'),make('p','Los grupos se proponen por bordes compartidos. Revisá sus nombres; las calles y detalles apartados se pueden recuperar. No se completan divisiones ausentes.'));
  const notice=make('p',message);notice.dataset.dxfNote='';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');panel.append(notice);
  const blockLabel=make('label','Manzana'),select=make('select');select.setAttribute('aria-label','Manzana para revisar');select.append(new Option('Todo el plano',''));for(const b of blocks())select.append(new Option('Manzana '+b.nombre+' · '+lots().filter(f=>f.dxfGroup===b.id).length+' cierres',b.id));select.value=group;select.onchange=safe(()=>choose(select.value));blockLabel.append(select);panel.append(blockLabel);
  if(active()){
   const renameLabel=make('label','Nombre de esta manzana'),name=make('input');name.value=active().nombre;name.maxLength=60;name.onchange=safe(()=>{const id=group,value=name.value.trim();apply(d=>{d.features=renameDXFGroup(d.features,id,value,{linked:linked()});d.dxfBlocks.find(b=>b.id===id).nombre=value;},'Nombre de manzana actualizado.');});renameLabel.append(name);panel.append(renameLabel);
  }
  const modes=make('div');modes.className='rg-load-actions';for(const [value,text]of [['select','Elegir manzana'],['number','Numerar tocando'],['multi','Elegir varios']]){const button=make('button',text);button.type='button';button.setAttribute('aria-pressed',mode===value);button.onclick=()=>{mode=value;selected.clear();if(mode==='number')number=nextDXFNumber(scene().features,active()?.nombre||'');onChange(false);refresh();};modes.append(button);}panel.append(modes);
  if(mode==='number'){const label=make('label','Próximo número'),input=make('input');input.value=number;input.maxLength=60;input.oninput=()=>number=input.value;label.append(input);panel.append(label,make('p','Tocá cada cierre en el orden que quieras. Cada clic lo convierte en lote; los cierres sin tocar quedan sin número.'));}
  const automatic=make('details');automatic.append(make('summary','Numerar automáticamente desde una esquina'));const corner=make('select');corner.setAttribute('aria-label','Esquina inicial');for(const [value,text]of [['nw','Arriba a la izquierda'],['ne','Arriba a la derecha'],['sw','Abajo a la izquierda'],['se','Abajo a la derecha']])corner.append(new Option(text,value));const auto=make('button','Numerar los que faltan');auto.type='button';auto.disabled=!active();auto.onclick=safe(()=>{const b=active();if(!b)throw Error('Elegí una manzana.');const count=lots().filter(f=>f.dxfGroup===group&&!dxfNamed(f)).length;if(!count)throw Error('Esta manzana ya está numerada.');apply(d=>{d.features=autoNumberDXF(d.features,group,b.nombre,corner.value,{linked:linked()});},count+' cierres numerados. Revisá el orden antes de guardar.');});automatic.append(corner,auto);panel.append(automatic);
  const count=make('p',selected.size+' '+(selected.size===1?'cierre elegido':'cierres elegidos'));count.setAttribute('role','status');panel.append(count);
  if(active()){const whole=make('button','Elegir toda esta manzana');whole.type='button';whole.onclick=()=>{selected=new Set(lots().filter(f=>f.dxfGroup===group).map(f=>f.id));mode='multi';onChange(false);refresh();};panel.append(whole);}
  if(mode==='multi')panel.append(make('p','Tocá los cierres o arrastrá un recuadro. Podés descartar varios o reunirlos en una misma manzana.'));
  const bulk=make('div');bulk.className='rg-load-actions';const discard=make('button','Descartar elegidos'),groupInput=make('input'),regroup=make('button','Agrupar elegidos');discard.type=regroup.type='button';discard.disabled=regroup.disabled=!selected.size;groupInput.placeholder='Nombre de la manzana';groupInput.setAttribute('aria-label','Nombre para agrupar los cierres elegidos');
  discard.onclick=safe(()=>{const candidates=selectedFeatures();requireUnlinked(candidates);apply(d=>{for(const f of d.features.filter(f=>selected.has(f.id))){f.dxfDiscardReason='Apartado durante la revisión';d.dxfDiscarded.push(f);}d.features=d.features.filter(f=>!selected.has(f.id));},'Cierres apartados. Los podés recuperar o deshacer.');selected.clear();});
  regroup.onclick=safe(()=>{const candidates=selectedFeatures(),name=groupInput.value.trim();requireUnlinked(candidates);if(!name)throw Error('Escribí el nombre de la manzana para los cierres elegidos.');const id=uid();apply(d=>{d.dxfBlocks.push({id,nombre:name});for(const f of d.features.filter(f=>selected.has(f.id))){f.dxfGroup=id;if(dxfNamed(f)){const n=dxfIdentity(f).lot;f.block=name;f.number=n;f.name='Manzana '+name+' · Lote '+n;}}assertDXFNames(d.features);},'Cierres agrupados. Podés numerar la manzana.');group=id;selected.clear();refresh();});bulk.append(discard,groupInput,regroup);panel.append(bulk);
  const chosen=selectedFeatures();if(chosen.length===1){const f=chosen[0],edit=make('label','Número del cierre elegido'),value=make('input'),change=make('button','Cambiar número');value.value=dxfNamed(f)?dxfIdentity(f).lot:'';value.maxLength=60;change.type='button';change.disabled=!active()||linked().has(f.id);change.onclick=safe(()=>{apply(d=>{d.features=numberDXFFeature(d.features,f.id,active()?.nombre,value.value,{linked:linked()});},'Número actualizado.');});edit.append(value,change);panel.append(edit);
   const split=make('details');split.append(make('summary','Falta una división en este cierre'));const fields=make('div');fields.className='rg-pair';const cols=make('input'),rows=make('input');for(const [input,text,max]of [[cols,'Lotes por fila',30],[rows,'Filas',20]]){const label=make('label',text);input.type='number';input.min='1';input.max=String(max);input.value=input===cols?'2':'1';label.append(input);fields.append(label);}const divide=make('button','Dividir este cierre');divide.type='button';divide.disabled=linked().has(f.id);divide.onclick=safe(()=>{requireUnlinked([f]);if(dxfNamed(f)&&!confirm('Se reemplaza '+f.name+' por espacios sin número. Después elegís cuáles son lotes. ¿Dividir?'))return;const pieces=splitDXFClosure(f,Number(cols.value),Number(rows.value),active()?.nombre||'1',{geographic:true});apply(d=>{d.features=d.features.filter(item=>item.id!==f.id).concat(pieces);},'División preparada con la grilla. Tocá Numerar tocando y elegí cuáles espacios son lotes.');selected.clear();mode='number';refresh();});split.append(make('p','Sólo se agregan las divisiones que indiques. Se conserva el contorno y se usa la misma grilla del modo manzana.'),fields,divide);panel.append(split);
  }
  const discarded=make('details'),rejected=scene().dxfDiscarded||[];discarded.append(make('summary','Descartados ('+rejected.length+')'));const show=make('label'),toggle=make('input');toggle.type='checkbox';toggle.checked=showDiscarded;toggle.onchange=()=>{showDiscarded=toggle.checked;onChange(false);};show.append(toggle,doc.createTextNode('Verlos en el plano'));discarded.append(show,make('p','Recuperar los lleva a la manzana elegida si todavía no tenían grupo.'));
  const list=make('div');list.className='rg-dxf-discarded';for(const f of rejected){const row=make('div'),text=make('span',f.name+' · '+(f.dxfMetrics?.area?Math.round(f.dxfMetrics.area)+' m² · ':'')+(f.dxfDiscardReason||'Apartado')),button=make('button','Recuperar');button.type='button';button.setAttribute('aria-label','Recuperar '+f.name);button.onclick=safe(()=>recover([f.id]));row.append(text,button);list.append(row);}discarded.append(list);panel.append(discarded);
  const undo=make('button','Deshacer revisión');undo.type='button';undo.disabled=!history.length;undo.onclick=()=>{const previous=history.pop();if(previous){Object.assign(scene(),previous);selected.clear();onChange();refresh();tell('Último paso de revisión deshecho.');}};panel.append(undo);
 }
 function drawMap(target,{zoom=1,center,zones,linked:inventory,activeStation,onStationMove,onStationSelect}={}){
  if(!available())return false;refresh();const features=scene().features,land=features.flatMap(f=>f.points);if(!land.length)return false;target.replaceChildren();const xs=land.map(p=>p[0]),ys=land.map(p=>p[1]),mid=center||[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],ratio=Math.max(.01,Math.cos(mid[1]*Math.PI/180)),span=Math.max(.0008,(Math.max(...xs)-Math.min(...xs))*ratio,(Math.max(...ys)-Math.min(...ys))*1.5)*1.12/zoom,xy=([x,y])=>[450+(x-mid[0])*900*ratio/span,300-(y-mid[1])*900/span],geo=([x,y])=>[mid[0]+(x-450)*span/(900*ratio),mid[1]-(y-300)*span/900];
  const map=svg('svg',{viewBox:'0 0 900 600',role:'group','aria-label':'Revisar y numerar los cierres del plano'});map.classList.add('rg-dxf-map');target.append(map);
  if(scene().raster?.corners){const [a,b,c]=scene().raster.corners.map(xy);map.append(svg('image',{href:scene().raster.url,width:1,height:1,preserveAspectRatio:'none',transform:'matrix('+[b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1],...a].join(' ')+')'}));}
  for(const f of features.filter(f=>f.kind==='line'))map.append(svg('polyline',{points:f.points.map(p=>xy(p).join(',')).join(' '),fill:'none',stroke:'#ffffff','stroke-opacity':.2,'stroke-width':.7,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
  if(showDiscarded)for(const f of scene().dxfDiscarded||[])map.append(svg('polygon',{points:f.points.map(p=>xy(p).join(',')).join(' '),fill:'#9aa0a0','fill-opacity':.15,stroke:'#9aa0a0','stroke-width':1,'stroke-dasharray':'3 3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
  let suppress=false,start;
  for(const f of lots()){const lot=inventory?.get(f.id),appearance=zones?.get(lot);if(appearance?.hidden)continue;const points=f.points.map(xy),chosen=selected.has(f.id),inGroup=f.dxfGroup===group,polygon=svg('polygon',{points:points.map(p=>p.join(',')).join(' '),fill:chosen?'#e2b869':inGroup?'#82bee2':'#b7d5cd','fill-opacity':chosen?.6:inGroup?.35:.16,stroke:chosen?'#fff':inGroup?'#82bee2':'#ffffff77','stroke-width':chosen?3:1,'vector-effect':'non-scaling-stroke',role:'button',tabindex:0,'aria-pressed':String(chosen),'aria-label':f.name});const title=svg('title',{});title.textContent=f.name;polygon.append(title);zones?.paint(polygon,lot,map);if(appearance?.unavailable){polygon.removeAttribute('tabindex');polygon.setAttribute('aria-disabled','true');}else {polygon.addEventListener('click',safe(event=>{event.stopPropagation();if(!suppress)pick(f);}));polygon.addEventListener('keydown',safe(event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();pick(f);}}));}map.append(polygon);if(appearance?.zone)zones.mark(map,lot,points);
   if(!appearance?.zone&&dxfNamed(f)){const width=Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),height=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));if(width>14&&height>12){const p=salesZoneInterior(points),text=svg('text',{x:p[0]+(appearance?.zone&&!appearance.unavailable?10:0),y:p[1]+4,'text-anchor':'middle','pointer-events':'none',class:'rg-dxf-number'});text.textContent=dxfIdentity(f).lot;map.append(text);}}
  }
  if(onStationMove)mapStations(map,{cameras:scene().cameras,xy,geo,active:activeStation,onMove:onStationMove,onSelect:onStationSelect});
  const rect=svg('rect',{fill:'#ffffff22',stroke:'#fff','stroke-width':1,'vector-effect':'non-scaling-stroke','pointer-events':'none',visibility:'hidden'});map.append(rect);const point=event=>{const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(map.getScreenCTM().inverse());return [p.x,p.y];};
  map.onpointerdown=event=>{if(mode!=='multi'||event.button!==0)return;start=point(event);suppress=false;map.setPointerCapture(event.pointerId);};map.onpointermove=event=>{if(!start)return;const p=point(event);if(Math.hypot(p[0]-start[0],p[1]-start[1])<4)return;suppress=true;for(const [k,v]of Object.entries({visibility:'visible',x:Math.min(p[0],start[0]),y:Math.min(p[1],start[1]),width:Math.abs(p[0]-start[0]),height:Math.abs(p[1]-start[1])}))rect.setAttribute(k,v);};map.onpointerup=safe(event=>{if(!start)return;const p=point(event),a=geo(start),b=geo(p),box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];start=null;rect.setAttribute('visibility','hidden');if(!suppress)return;selected=new Set(lots().filter(f=>!zones?.get(inventory?.get(f.id))?.unavailable&&salesZoneIntersectsBox(f.points,box)).map(f=>f.id));onChange(false);refresh();});map.onpointercancel=()=>{start=null;rect.setAttribute('visibility','hidden');};return true;
 }
 refresh();return {refresh,drawMap,available,focusFeature(id){const f=lots().find(f=>f.id===id);if(!f)return;group=f.dxfGroup||'';selected=new Set([id]);mode='select';onFocus(f.points);onChange(false);refresh();}};
}

export function mountDXFSpreadsheet({host,getState,onApply,onFocus,onStatus=()=>{}}){
 const doc=host.ownerDocument,make=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;return n;},panel=make('section');panel.className='rg-dxf-sheet';host.append(panel);
 const file=make('input');file.type='file';file.accept='.csv,.xlsx';file.hidden=true;
 const button=(text,fn)=>{const b=make('button',text);b.type='button';b.onclick=()=>{try{fn()}catch(e){onStatus(e.message)}};return b;};
 const open=button('Completar con planilla',()=>file.click()),preview=make('div'),status=make('p');status.setAttribute('role','status');panel.append(make('h3','Datos de los lotes'),make('p','Primero identificá los contornos por manzana y lote. La planilla completa sus datos; no asigna números por el orden de las filas.'),file,open,status,preview);
 let sheets=[],index=0,name='',resolutions=new Map(),confirmed=new Set(),block='',revision='',plan=null,disposed=false,busy=false,wholeArea=null;
 let readGeneration=0;
 const signature=()=>{const s=getState();return JSON.stringify([s.lots,s.features.map(f=>[f.id,f.kind,f.name,f.points,f.dxfMetrics]),[...s.bindings],s.zones]);};
 function clear(message=''){readGeneration++;busy=false;open.disabled=false;sheets=[];resolutions.clear();confirmed.clear();plan=null;preview.replaceChildren();status.textContent=message;}
 function resolve(line,value){resolutions.set(line,{...resolutions.get(line),...value});confirmed.delete(line);render();}
 const area=n=>Number(n).toLocaleString('es-AR',{maximumFractionDigits:2})+' m²';
 function render(){
  if(!sheets.length||disposed)return;const state=getState();let imported;
  try{imported=parseLotGrid(sheets[index].grid,sheets[index]);}catch(e){preview.replaceChildren(make('p',e.message));if(sheets.length>1){const label=make('label','Hoja del Excel'),select=make('select');for(const [i,sheet]of sheets.entries())select.append(new Option(sheet.name,String(i)));select.value=String(index);select.onchange=()=>{index=Number(select.value);wholeArea=null;resolutions.clear();confirmed.clear();block='';render();};label.append(select);preview.append(label);}preview.append(button('Cancelar',()=>clear()));return;}
  const areas=prepareSheetAreas(imported,state.lots,wholeArea);
  plan=planDXFImport(areas.items,state.lots,state.features,{...state,resolutions,block});revision=signature();preview.replaceChildren();
  preview.append(make('h4',name),make('p',`${plan.matches.length} coinciden · ${plan.creates.length} nuevos · ${plan.conflicts.length} con conflicto · ${plan.unmatched.length} sin lugar en el plano`));
  if(sheets.length>1){const label=make('label','Hoja del Excel'),select=make('select');for(const [i,s]of sheets.entries())select.append(new Option(s.name,String(i)));select.value=String(index);select.onchange=()=>{index=Number(select.value);wholeArea=null;resolutions.clear();confirmed.clear();block='';render();};label.append(select);preview.append(label);}
  appendSheetNumberChoice(preview,imported,sheets[index],()=>{wholeArea=null;confirmed.clear();render();});
  appendSheetAreaChoice(preview,areas,value=>{wholeArea=value;confirmed.clear();render();});
  if(imported.some(i=>!i.identity.block)){const label=make('label','Manzana para las filas que no la indican'),select=make('select');select.append(new Option('Elegí una manzana…',''));const names=[...new Set(state.features.map(f=>lotIdentity({numero:f.name}).block).filter(Boolean))];for(const n of names)select.append(new Option(n,n));select.value=block;select.onchange=()=>{block=select.value;confirmed.clear();render();};label.append(select);preview.append(label);}
  const actions=make('div');actions.className='rg-load-actions rg-sheet-actions';
  const apply=button('Aplicar al borrador',()=>{
   if(signature()!==revision){confirmed.clear();render();status.textContent='El plano o el inventario cambiaron. Revisá el cruce actualizado.';return;}
   if(plan.conflicts.length)throw Error('Resolvé o excluí los conflictos antes de aplicar.');
   const changes=[...plan.matches,...plan.creates].filter(r=>!r.same||r.needsLink&&confirmed.has(r.line)).map(r=>({...r,linkConfirmed:!r.needsLink||confirmed.has(r.line)}));
   onApply(changes);clear('Planilla aplicada al borrador. Guardá y seguí después para conservar los cambios.');
  });apply.disabled=!!plan.conflicts.length||!(plan.creates.length||plan.matches.some(r=>!r.same));actions.append(apply,button('Cancelar',()=>clear('Carga cancelada. El borrador no cambió.')));preview.append(actions);
  const links=plan.matches.filter(r=>r.needsLink);if(links.length){const confirm=button('Confirmar los '+links.length+' vínculos nuevos',()=>{links.forEach(r=>confirmed.add(r.line));render();});preview.append(confirm,make('p',links.filter(r=>confirmed.has(r.line)).length+' de '+links.length+' vínculos confirmados. Los desmarcados sólo completan datos y siguen sin un contorno nuevo.'));}
  const section=(title,rows,paint)=>{const details=make('details');details.append(make('summary',title+' ('+rows.length+')'));const body=make('div');details.append(body);let expanded=false;const draw=()=>{body.replaceChildren();for(const row of expanded?rows:rows.slice(0,5)){const item=make('div');item.className='rg-sheet-row';paint(item,row);body.append(item);}};draw();if(rows.length>5){const more=button('Ver todas ('+rows.length+')',()=>{expanded=!expanded;draw();more.textContent=expanded?'Ver sólo 5':'Ver todas ('+rows.length+')';});details.append(more);}preview.append(details);};
  const describe=(item,row)=>{
   item.append(make('strong',row.identity.label));
   const changes=Object.entries(row.patch).map(([key,value])=>{const labels={superficie_m2:'Superficie',precio_usd:'Precio USD',estado:'Estado',notas:'Notas',zonaVenta:'Zona',tipo_lote:'Sector',frente_agua:'Frente al agua'},show=v=>key==='zonaVenta'?state.zones.find(z=>z.id===v)?.nombre||'Sin zona':key==='estado'?lotStateText(v):v==null||v===''?'Sin informar':String(v);return labels[key]+': '+show(row.target?.[key])+' → '+show(value);});item.append(make('p',row.same?'Ya coincide con la planilla.':changes.join(' · ')||'Sin cambios comerciales.'));
   if(row.areaDifference)item.append(make('p','Superficie comercial: '+area(row.areaDifference.commercial)+' · Medida en el DXF: '+area(row.areaDifference.measured)+' (diferencia mayor al 5 %).'));
   if(row.feature)item.append(button('Localizar en el plano',()=>onFocus(row.feature.id)));else item.append(make('p','Sin contorno en el plano activo. Sus datos se conservan en la lista.'));
   if(row.needsLink){const label=make('label'),check=make('input');check.type='checkbox';check.checked=confirmed.has(row.line);check.onchange=()=>{check.checked?confirmed.add(row.line):confirmed.delete(row.line);render();};label.append(check,make('span','Confirmar vínculo nuevo con este contorno'));item.append(label);}
  };
  section('Se actualizan',plan.matches.filter(r=>!r.same),describe);section('Sin cambios',plan.matches.filter(r=>r.same),describe);section('Se incorporan fichas vinculadas',plan.creates,describe);
  section('Conflictos por resolver',plan.conflicts,(item,row)=>{
   item.append(make('strong','Fila '+row.line+' · '+row.identity.label),make('p',row.errors.join(' ')));
   for(const [items,key,title]of [[row.lots,'lotId','Ficha'],[row.faces,'featureId','Contorno']])if(items.length>1){const label=make('label',title),select=make('select');select.append(new Option('Elegí uno…',''));for(const value of items)select.append(new Option((value.numero||value.name)+' · '+value.id.slice(0,8),value.id));select.value=resolutions.get(row.line)?.[key]||'';select.onchange=()=>resolve(row.line,{[key]:select.value});label.append(select);item.append(label);}
   if(row.feature)item.append(button('Localizar en el plano',()=>onFocus(row.feature.id)));item.append(button('Excluir esta fila',()=>resolve(row.line,{skip:true})));
  });
  section('Sin lugar en el plano',plan.unmatched,(item,row)=>item.append(make('strong',row.identity.label),make('p','Fila '+row.line+'. No se crea ninguna ficha.')));
  section('Quedan como están',plan.unchanged,(item,row)=>item.append(make('span',row.numero)));section('Filas excluidas',plan.skipped,(item,row)=>item.append(make('span','Fila '+row.line+' · '+row.identity.label),button('Volver a revisar',()=>resolve(row.line,{skip:false}))));
 }
 file.onchange=async()=>{
  const selected=file.files?.[0];file.value='';if(!selected||disposed)return;
  clear();
  const generation=readGeneration;
  open.disabled=true;busy=true;
  try{
   const loaded=await readLotFile(selected);
   if(generation!==readGeneration)return;
   sheets=loaded;wholeArea=null;block='';name=selected.name;
   index=Math.max(0,sheets.findIndex(sheet=>{try{parseLotGrid(sheet.grid,sheet);return true;}catch{return false;}}));
   render();
  }catch(error){
   if(generation===readGeneration)clear(error.message);
  }finally{
   if(generation===readGeneration){busy=false;open.disabled=false;}
  }
 };
 return {refresh(){if(sheets.length&&signature()!==revision){confirmed.clear();render();status.textContent='El plano o el inventario cambiaron. Revisá el cruce actualizado.';}},issue(){return busy?'Esperá a que termine de leer la planilla.':sheets.length?'Aplicá o cancelá la vista previa de la planilla antes de guardar.':'';},destroy(){disposed=true;clear();}};
}
