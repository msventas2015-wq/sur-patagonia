import {normalizeLotPart} from './lotes-planilla.mjs';
// Calco de autoría en coordenadas normalizadas de imagen. Nunca son GPS ni m².
const EPS=1e-9;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<EPS;
const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
function onEdge(p,a,b){return Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;}
function intersects(a,b,c,d,strict=false){
 const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);
 if(x*y<-EPS*EPS&&u*v<-EPS*EPS)return true;
 return !strict&&((Math.abs(x)<EPS&&onEdge(c,a,b))||(Math.abs(y)<EPS&&onEdge(d,a,b))||(Math.abs(u)<EPS&&onEdge(a,c,d))||(Math.abs(v)<EPS&&onEdge(b,c,d)));
}
function crossesItself(es){
 for(let i=0;i<es.length;i++)for(let j=i+2;j<es.length;j++){
  if(!(i===0&&j===es.length-1)&&intersects(...es[i],...es[j]))return true;
 }
 return false;
}
export function imageInside(p,poly){
 if(edges(poly).some(([a,b])=>onEdge(p,a,b)))return false;
 let yes=false;for(const [a,b] of edges(poly))if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;return yes;
}
export function imagePolygonIssue(points,neighbors=[]){
 if(!Array.isArray(points)||points.length<3)return 'Marcá al menos tres esquinas para cerrar el lote.';
 if(points.length>2000||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))return 'Las esquinas deben quedar dentro de la imagen.';
 const es=edges(points);
 if(es.some(([a,b])=>same(a,b)))return 'Hay dos esquinas consecutivas en el mismo lugar.';
 const area=Math.abs(es.reduce((s,[a,b])=>s+a[0]*b[1]-b[0]*a[1],0))/2;
 if(crossesItself(es))return 'El contorno se cruza. Corregí las esquinas antes de cerrar.';
 if(area<EPS)return 'El lote no tiene una superficie dibujada. Separá sus esquinas.';
 const box=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];const bounds=box(points);
 for(const f of neighbors){
  const other=box(f.points);if(bounds[2]<=other[0]+EPS||other[2]<=bounds[0]+EPS||bounds[3]<=other[1]+EPS||other[3]<=bounds[1]+EPS)continue;
  const ns=edges(f.points);
  const probes=p=>[...p,...edges(p).map(([a,b])=>[(a[0]+b[0])/2,(a[1]+b[1])/2])];
  if(es.some(e=>ns.some(n=>intersects(...e,...n,true)))||probes(points).some(p=>imageInside(p,f.points))||probes(f.points).some(p=>imageInside(p,points))||points.every(p=>ns.some(([a,b])=>onEdge(p,a,b))))return 'El lote se superpone con '+f.name+'. Podés compartir el borde, pero no el interior.';
 }
 return '';
}
export function snapImagePoint(point,features,width,height,radius=10){
 let best=radius,result=point;
 const p=[point[0]*width,point[1]*height];
 for(const f of features.filter(f=>!f.hidden))for(const [aa,bb] of edges(f.points)){
  const a=[aa[0]*width,aa[1]*height],b=[bb[0]*width,bb[1]*height],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  const candidates=[a,b,[a[0]+t*dx,a[1]+t*dy]];
  for(const q of candidates){const distance=Math.hypot(p[0]-q[0],p[1]-q[1]);if(distance<best){best=distance;result=[q[0]/width,q[1]/height];}}
 }
 return result;
}
export function orderImageCorners(points){
 const unique=points.filter((p,i)=>!points.slice(0,i).some(q=>same(p,q))).map(p=>[...p]);
 if(unique.length<4||!crossesItself(edges(unique)))return unique;
 const center=unique.reduce((c,p)=>[c[0]+p[0]/unique.length,c[1]+p[1]/unique.length],[0,0]);
 const ordered=[...unique].sort((a,b)=>Math.atan2(a[1]-center[1],a[0]-center[0])-Math.atan2(b[1]-center[1],b[0]-center[0])||Math.hypot(a[0]-center[0],a[1]-center[1])-Math.hypot(b[0]-center[0],b[1]-center[1]));
 // Un conjunto convexo admite un único perímetro. Si tiene esquinas interiores,
 // mantener el cruce permite que el editor pida corregir el orden de los clics.
 if(ordered.some((p,i)=>cross(p,ordered[(i+1)%ordered.length],ordered[(i+2)%ordered.length]) < -EPS))return unique;
 // Keep the first marked corner identifiable after ordering the perimeter.
 const start=ordered.findIndex(p=>same(p,points[0]));return [...ordered.slice(start),...ordered.slice(0,start)];
}

// imagePlan v2: rings reference shared vertices, edges belong to the network,
// and only explicitly identified faces produce inventory entries.
const uid=()=>crypto.randomUUID();
const key=(a,b)=>[a,b].sort().join(':');
const signed=p=>edges(p).reduce((s,[a,b])=>s+a[0]*b[1]-b[0]*a[1],0)/2;
const normal=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('es').trim().replace(/\s+/g,' ');
export const facePoints=(plan,face)=>face.vertices.map(id=>plan.vertices[id]);
export function imageLots(plan){
 if(!plan)return [];
 if(plan.version===1)return plan.features||[];
 return (plan.faces||[]).filter(f=>f.lot).map(f=>({id:f.id,kind:'lot',...f.lot,hidden:!!f.hidden,points:facePoints(plan,f)}));
}
export function imagePlanV2(original){
 if(!original)return original;
 if(original.version===2)return original;
 if(original.version!==1)throw Error('Esta versión del calco necesita otro editor.');
 const plan={...structuredClone(original),version:2,vertices:{},edges:[],faces:[],blocks:[],addedVertices:[]};
 delete plan.features;
 for(const f of original.features||[]){
  const ring=f.points.map(p=>{let id=!f.hidden&&Object.keys(plan.vertices).find(id=>same(plan.vertices[id],p));if(!id){id=uid();plan.vertices[id]=[...p];}return id;});
  plan.faces.push({id:f.id,vertices:ring,lot:{block:f.block,number:f.number,name:f.name},hidden:!!f.hidden});
 }
 rebuildEdges(plan);return plan;
}
function rebuildEdges(plan,groups=new Map()){
 const previous=new Map(plan.edges.map(e=>[key(e.a,e.b),e])),found=new Map();
 for(const f of plan.faces)for(let i=0;i<f.vertices.length;i++){
  const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],k=key(a,b);
  if(!found.has(k))found.set(k,{...(previous.get(k)||{id:uid(),a,b}),...(groups.get(k)||{})});
 }
 plan.edges=[...found.values()];
 const used=new Set(plan.faces.flatMap(f=>f.vertices));
 for(const id of Object.keys(plan.vertices))if(!used.has(id))delete plan.vertices[id];
 plan.addedVertices=plan.addedVertices.filter(id=>used.has(id));
}
export function graphIssue(plan){
 if(!plan||plan.version!==2||!plan.vertices||!Array.isArray(plan.faces)||!Array.isArray(plan.edges)||!Array.isArray(plan.blocks))return 'La red del calco no está completa.';
 if(plan.faces.length>5000)return 'El calco supera los 5000 espacios.';
 const ids=new Set(),names=new Set(),edgeKeys=new Set(),used=new Set();
 for(const f of plan.faces){
  if(!f.id||ids.has(f.id)||!Array.isArray(f.vertices)||new Set(f.vertices).size!==f.vertices.length||f.vertices.some(id=>!plan.vertices[id]))return 'Hay un espacio con puntos repetidos o sin vínculo.';
  ids.add(f.id);const issue=imagePolygonIssue(facePoints(plan,f));if(issue)return issue;
  if(f.blockId&&!plan.blocks.some(b=>b.id===f.blockId))return 'Un espacio perdió su manzana.';
  if(f.lot){const n=normal(f.lot.name);if(!String(f.lot.block||'').trim()||!String(f.lot.number||'').trim()||names.has(n))return 'Esa manzana y número ya identifican otro lote.';names.add(n);}
  f.vertices.forEach((a,i)=>used.add(key(a,f.vertices[(i+1)%f.vertices.length])));
 }
 for(const e of plan.edges){const k=key(e.a,e.b);if(!plan.vertices[e.a]||!plan.vertices[e.b]||edgeKeys.has(k)||!used.has(k))return 'Hay una línea sin vínculo o repetida.';edgeKeys.add(k);}
 if(edgeKeys.size!==used.size)return 'Faltan líneas en la red del calco.';
 for(const b of plan.blocks){if(!b.name?.trim()||!Array.isArray(b.boundary)||b.boundary.some(id=>!plan.vertices[id]))return 'Revisá el nombre y el contorno de la manzana.';const issue=imagePolygonIssue(b.boundary.map(id=>plan.vertices[id]));if(issue)return issue;}
 const visible=plan.faces.filter(f=>!f.hidden);
 // All spaces participate, including those not yet identified as lots.
 for(let i=0;i<visible.length;i++){
  const f=visible[i],issue=imagePolygonIssue(facePoints(plan,f),visible.slice(0,i).map(n=>({points:facePoints(plan,n),name:n.lot?.name||'otro espacio'})));
  if(issue)return issue;
 }
 return '';
}
export function imagePlanIssue(plan){
 if(!plan?.url||!(plan.width>0)||!(plan.height>0))return 'La imagen de base no está completa.';
 try{return graphIssue(imagePlanV2(plan));}catch(error){return error.message;}
}
function demand(plan){const error=graphIssue(plan);if(error)throw Error(error);return plan;}
function vertex(plan,p){let id=Object.keys(plan.vertices).find(id=>same(plan.vertices[id],p));if(!id){id=uid();plan.vertices[id]=[...p];}return id;}
function ring(plan,points){return points.map(p=>vertex(plan,p));}
function label(plan,block,number,except=''){
 block=String(block||'').trim().replace(/^manzana\s+/i,'');number=String(number||'').trim();
 if(!block||!number)throw Error('Completá manzana y número del lote.');
 const name='Manzana '+block+' · Lote '+number;
 if(plan.faces.some(f=>f.id!==except&&f.lot&&normalizeLotPart(f.lot.block,true)===normalizeLotPart(block,true)&&normalizeLotPart(f.lot.number)===normalizeLotPart(number)))throw Error('Esa manzana y número ya identifican otro lote. Elegí otro número.');
 return {block,number,name};
}
export function nextLotNumber(plan,block){
 const group=normalizeLotPart(block,true);
 const used=new Set(plan.faces.filter(f=>f.lot&&normalizeLotPart(f.lot.block,true)===group).map(f=>normalizeLotPart(f.lot.number)));
 let n=1;
 while(used.has(String(n)))n++;
 return String(n);
}
export function addLooseLot(plan,points,block,number){
 const p=structuredClone(plan),ordered=orderImageCorners(points),f={id:uid(),vertices:ring(p,ordered),lot:label(p,block,number)};p.faces.push(f);nodeSharedEdges(p);demand(p);return {plan:p,id:f.id};
}
export function addBlock(plan,points,name){
 const p=structuredClone(plan);name=String(name||'').trim().replace(/^manzana\s+/i,'');if(!name)throw Error('Poné un nombre a la manzana.');
 if(p.blocks.some(b=>normal(b.name)===normal(name)))throw Error('Ya existe una manzana con ese nombre.');
 const boundary=ring(p,orderImageCorners(points)),id=uid();p.blocks.push({id,name,boundary,finished:false,divided:false});p.faces.push({id:uid(),vertices:[...boundary],blockId:id});rebuildEdges(p);demand(p);return {plan:p,id};
}
// Node T-junctions as well as complete shared sides (loose lots can touch a block).
function nodeSharedEdges(plan){
 const all=Object.keys(plan.vertices);
 for(const f of plan.faces){if(f.hidden)continue;const result=[];for(let i=0;i<f.vertices.length;i++){
  const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],A=plan.vertices[a],B=plan.vertices[b],dx=B[0]-A[0],dy=B[1]-A[1],l=dx*dx+dy*dy;
  result.push(a);result.push(...all.filter(id=>id!==a&&id!==b&&onEdge(plan.vertices[id],A,B)).sort((u,v)=>((plan.vertices[u][0]-plan.vertices[v][0])*dx+(plan.vertices[u][1]-plan.vertices[v][1])*dy)/l));
 }f.vertices=result;}
 rebuildEdges(plan);
}
function segmentHit(a,b,c,d){
 const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-12)return null;
 const q=[c[0]-a[0],c[1]-a[1]],t=(q[0]*s[1]-q[1]*s[0])/den,u=(q[0]*r[1]-q[1]*r[0])/den;
 return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[Math.max(0,Math.min(1,t)),Math.max(0,Math.min(1,u))]:null;
}
function polygonize(plan,segments){
 const splits=segments.map(()=>[0,1]);
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){const hit=segmentHit(segments[i].a,segments[i].b,segments[j].a,segments[j].b);if(hit){splits[i].push(hit[0]);splits[j].push(hit[1]);}}
 const network=new Map(),groups=new Map();
 segments.forEach((s,i)=>{const ts=[...new Set(splits[i].map(t=>Math.round(t*1e10)/1e10))].sort((a,b)=>a-b);for(let j=1;j<ts.length;j++){
  if(ts[j]-ts[j-1]<EPS)continue;const at=t=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t],a=vertex(plan,at(ts[j-1])),b=vertex(plan,at(ts[j]));
  if(a===b)continue;const k=key(a,b);network.set(k,{a,b});if(s.lineId)groups.set(k,{lineId:s.lineId,blockId:s.blockId});
 }});
 return {rings:walkFaces(plan,[...network.values()]),groups};
}
function walkFaces(plan,network){
 const adj=new Map();for(const e of network){if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
 for(const [id,ns] of adj){const p=plan.vertices[id];ns.sort((a,b)=>Math.atan2(plan.vertices[a][1]-p[1],plan.vertices[a][0]-p[0])-Math.atan2(plan.vertices[b][1]-p[1],plan.vertices[b][0]-p[0]));}
 const visited=new Set(),rings=[];
 for(const [a,ns] of adj)for(const b of ns){if(visited.has(a+':'+b))continue;let u=a,v=b,ring=[];for(let limit=0;limit<=network.length*2;limit++){
  const k=u+':'+v;if(visited.has(k))break;visited.add(k);ring.push(u);const next=adj.get(v),w=next[(next.indexOf(u)-1+next.length)%next.length];u=v;v=w;if(u===a&&v===b)break;
 }if(ring.length>=3&&new Set(ring).size===ring.length&&signed(ring.map(id=>plan.vertices[id]))>EPS)rings.push(ring);}
 return rings;
}
function sampleInside(points){
 // An ear centroid is inside a concave face; its vertex average may be outside.
 const sign=Math.sign(signed(points));for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];if(cross(a,b,c)*sign<=EPS)continue;const p=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3];if(imageInside(p,points))return p;}
 return points[0];
}
export function faceLabelPoint(plan,face){const points=facePoints(plan,face),area=signed(points);const c=edges(points).reduce((r,[a,b])=>{const k=a[0]*b[1]-b[0]*a[1];return [r[0]+(a[0]+b[0])*k/(6*area),r[1]+(a[1]+b[1])*k/(6*area)];},[0,0]);return imageInside(c,points)?c:sampleInside(points);}
export function divideBlock(plan,id,cols,rows){
 if(!Number.isInteger(cols)||cols<1||cols>30||!Number.isInteger(rows)||rows<1||rows>20||cols*rows>600)throw Error('Elegí de 1 a 30 lotes por fila y de 1 a 20 filas (hasta 600 espacios).');
 const p=structuredClone(plan),b=p.blocks.find(b=>b.id===id);if(!b)throw Error('Elegí una manzana.');
 if(p.faces.some(f=>f.blockId===id&&f.lot))throw Error('La manzana ya tiene lotes. Deshacé su numeración antes de volver a dividirla.');
 const outline=b.boundary.map(id=>p.vertices[id]);let axis=[1,0],longest=0;
 for(const [a,c] of edges(outline)){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len>longest){longest=len;axis=[(c[0]-a[0])/len,(c[1]-a[1])/len];}}
 // Use the side closest to the image's horizontal as the row direction.
 if(Math.abs(axis[0])<Math.abs(axis[1]))axis=[-axis[1],axis[0]];if(axis[0]<0)axis=axis.map(n=>-n);
 const across=[-axis[1],axis[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],projected=outline.map(q=>[dot(q,axis),dot(q,across)]),lo=[0,1].map(i=>Math.min(...projected.map(q=>q[i]))),hi=[0,1].map(i=>Math.max(...projected.map(q=>q[i]))),unproject=q=>[q[0]*axis[0]+q[1]*across[0],q[0]*axis[1]+q[1]*across[1]];
 const segments=edges(outline).map(([a,c])=>({a,b:c,blockId:id}));
 for(const [dimension,count] of [[0,cols],[1,rows]])for(let i=1;i<count;i++){
  const k=lo[dimension]+(hi[dimension]-lo[dimension])*i/count,other=1-dimension,A=[],B=[];A[dimension]=B[dimension]=k;A[other]=lo[other]-1;B[other]=hi[other]+1;
  const a=unproject(A),c=unproject(B),ts=[0,1];for(const [u,v] of edges(outline)){const hit=segmentHit(a,c,u,v);if(hit)ts.push(hit[0]);}ts.sort((a,b)=>a-b);const lineId=uid();
  for(let j=1;j<ts.length;j++){if(ts[j]-ts[j-1]<EPS)continue;const at=t=>[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];if(imageInside(at((ts[j]+ts[j-1])/2),outline))segments.push({a:at(ts[j-1]),b:at(ts[j]),lineId,blockId:id});}
 }
 p.faces=p.faces.filter(f=>f.blockId!==id);const {rings,groups}=polygonize(p,segments);
 if(!rings.length)throw Error('No se pudieron cerrar los espacios. Revisá el contorno.');
 for(const v of rings)p.faces.push({id:uid(),blockId:id,vertices:v});
 // Incorporate new boundary intersections so editing the block keeps every face attached.
 const newBoundary=[];for(let i=0;i<b.boundary.length;i++){const a=b.boundary[i],c=b.boundary[(i+1)%b.boundary.length],A=p.vertices[a],C=p.vertices[c];newBoundary.push(a,...Object.keys(p.vertices).filter(v=>v!==a&&v!==c&&onEdge(p.vertices[v],A,C)).sort((u,v)=>Math.hypot(p.vertices[u][0]-A[0],p.vertices[u][1]-A[1])-Math.hypot(p.vertices[v][0]-A[0],p.vertices[v][1]-A[1])));}
 b.boundary=newBoundary;b.divided=true;b.finished=false;rebuildEdges(p,groups);demand(p);return p;
}
export function identifyFace(plan,id,number){const p=structuredClone(plan),f=p.faces.find(f=>f.id===id),b=p.blocks.find(b=>b.id===f?.blockId);if(!f||!b)throw Error('Elegí un espacio de la manzana.');f.lot=label(p,b.name,number||nextLotNumber(p,b.name),id);demand(p);return p;}
export function renameLot(plan,id,block,number){const p=structuredClone(plan),f=p.faces.find(f=>f.id===id);if(!f?.lot)throw Error('Elegí un lote.');const b=p.blocks.find(b=>b.id===f.blockId);f.lot=label(p,b?.name||block,number,id);demand(p);return p;}
export function finishBlock(plan,id){const p=structuredClone(plan),b=p.blocks.find(b=>b.id===id);if(!b)throw Error('Elegí la manzana.');if(!p.faces.some(f=>f.blockId===id&&f.lot))throw Error('Tocá al menos un espacio para marcarlo como lote antes de terminar.');b.finished=true;return demand(p);}
export function moveGraphVertices(plan,ids,delta){const p=structuredClone(plan);for(const id of new Set(ids)){const v=p.vertices[id];if(!v)throw Error('El punto ya no existe.');p.vertices[id]=[v[0]+delta[0],v[1]+delta[1]];}return demand(p);}
export function insertGraphPoint(plan,edgeId,point){
 const p=structuredClone(plan),e=p.edges.find(e=>e.id===edgeId);if(!e)throw Error('Elegí una línea.');const A=p.vertices[e.a],B=p.vertices[e.b],dx=B[0]-A[0],dy=B[1]-A[1],t=Math.max(.02,Math.min(.98,((point[0]-A[0])*dx+(point[1]-A[1])*dy)/(dx*dx+dy*dy)));
 const id=vertex(p,[A[0]+t*dx,A[1]+t*dy]);if(id===e.a||id===e.b)throw Error('Ya hay un punto en ese lugar.');
 const rings=[...p.faces.map(f=>f.vertices),...p.blocks.map(b=>b.boundary)];for(const ring of rings)for(let i=0;i<ring.length;i++)if(key(ring[i],ring[(i+1)%ring.length])===key(e.a,e.b)){ring.splice(i+1,0,id);break;}
 p.addedVertices.push(id);const groups=new Map([e.a,e.b].map(v=>[key(v,id),{lineId:e.lineId,blockId:e.blockId}]));rebuildEdges(p,groups);return {plan:demand(p),id};
}
export function removeGraphPoint(plan,id){
 if(!plan.addedVertices.includes(id))throw Error('Ese punto es una esquina o un cruce. Para unir espacios, quitá la línea de división.');
 const incident=plan.edges.filter(e=>e.a===id||e.b===id);if(incident.length!==2)throw Error('Ese punto es un cruce. Quitá una línea de división para unir espacios.');
 const p=structuredClone(plan),neighbors=incident.map(e=>e.a===id?e.b:e.a);for(const ring of [...p.faces.map(f=>f.vertices),...p.blocks.map(b=>b.boundary)]){const i=ring.indexOf(id);if(i>=0){if(ring.length<=3)throw Error('El contorno necesita al menos tres esquinas.');ring.splice(i,1);}}
 rebuildEdges(p,new Map([[key(...neighbors),{lineId:incident[0].lineId,blockId:incident[0].blockId}]]));return demand(p);
}
export function lineVertexIds(plan,lineId){return [...new Set(plan.edges.filter(e=>e.lineId===lineId).flatMap(e=>[e.a,e.b]))];}
export function divisionRemoval(plan,lineId){
 const removed=plan.edges.filter(e=>e.lineId===lineId);if(!removed.length)throw Error('Elegí una línea interna de división.');const blockId=removed[0].blockId,faces=plan.faces.filter(f=>f.blockId===blockId),removedKeys=new Set(removed.map(e=>key(e.a,e.b)));
 const touched=faces.filter(f=>f.vertices.some((a,i)=>removedKeys.has(key(a,f.vertices[(i+1)%f.vertices.length]))));
 // Connected components joined by the removed edges describe every merge.
 const parent=new Map(touched.map(f=>[f.id,f.id])),find=id=>parent.get(id)===id?id:find(parent.get(id));
 for(const k of removedKeys){const at=touched.filter(f=>f.vertices.some((a,i)=>key(a,f.vertices[(i+1)%f.vertices.length])===k));if(at.length!==2)throw Error('Sólo se pueden quitar divisiones internas completas.');parent.set(find(at[0].id),find(at[1].id));}
 const groups=new Map();for(const f of touched){const id=find(f.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(f.id);}
 return [...groups.values()].filter(g=>g.length>1);
}
export function removeDivision(plan,lineId,choices={}){
 const groups=divisionRemoval(plan,lineId),p=structuredClone(plan),removed=new Set(p.edges.filter(e=>e.lineId===lineId).map(e=>key(e.a,e.b))),retired=[];
 for(const group of groups){const members=p.faces.filter(f=>group.includes(f.id)),assigned=members.filter(f=>f.lot),keepId=choices[group[0]]||(!assigned.length?members[0].id:assigned.length===1?assigned[0].id:'');
  if(!members.some(f=>f.id===keepId))throw Error('Elegí qué ficha conservar en cada unión.');
  const boundary=new Map();for(const f of members)for(let i=0;i<f.vertices.length;i++){const a=f.vertices[i],b=f.vertices[(i+1)%f.vertices.length],k=key(a,b);if(boundary.has(k))boundary.delete(k);else if(!removed.has(k))boundary.set(k,{a,b});}
  const rings=walkFaces(p,[...boundary.values()]);if(rings.length!==1)throw Error('La división no se puede quitar sin abrir el contorno.');
  const keep=members.find(f=>f.id===keepId);retired.push(...assigned.filter(f=>f.id!==keepId).map(f=>({id:f.id,keptId:keepId,name:f.lot.name})));
  p.faces=p.faces.filter(f=>!group.includes(f.id));p.faces.push({...keep,vertices:rings[0]});
 }
 rebuildEdges(p);return {plan:demand(p),retired};
}
