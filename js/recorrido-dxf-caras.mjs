import {salesZoneInterior} from './zonas-venta.mjs?v=20261114-anillo7b';
// Polygonize CAD linework in its original units, before projecting to WGS84.
// No line is invented across a gap larger than the declared snapping tolerance.
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const area=points=>{const o=points[0];return points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length];return sum+(a[0]-o[0])*(b[1]-o[1])-(b[0]-o[0])*(a[1]-o[1]);},0)/2;};
function contains(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j],dx=b[0]-a[0],dy=b[1]-a[1],t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);if(t>=0&&t<=1&&Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<1e-7)return false;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function labelName(text){
 const clean=String(text||'').replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/\s+/g,' ').trim();
 const m=clean.match(/^(?:manzana|mz\.?|mza\.?)\s*([\w -]+?)\s*[·,;/-]?\s*(?:lote|lt\.?)\s*([\w-]+)$/i);
 return m?{block:m[1].trim(),number:m[2].trim(),name:'Manzana '+m[1].trim()+' · Lote '+m[2].trim()}:null;
}
export function reconstructDXFLots(features,{labels=[],tolerance=.02,includeNested=false}={}){
 if(!Array.isArray(features)||features.length>5000||!Number.isFinite(tolerance)||tolerance<.000001||tolerance>1)throw Error('No se pudo reconstruir este plano: revisá sus líneas y la tolerancia.');
 const existing=features.filter(f=>f.kind==='lot');
 const lines=features.filter(f=>f.kind==='line');
 if(existing.length&&!lines.length)return {features,faces:existing,report:{closed:existing.length,reconstructed:0,alreadyClosed:true,tolerance}};
 const raw=[];
 // Un polígono explícito aporta sus bordes a los cierres vecinos y conserva su identidad.
 for(const f of [...existing,...lines])for(let i=1;i<f.points.length+(f.kind==='lot'?1:0);i++){
  const a=f.points[i-1],b=f.points[i%f.points.length];if(![...a.slice(0,2),...b.slice(0,2)].every(Number.isFinite))throw Error('Hay una línea con coordenadas incompletas.');
  if(Math.hypot(b[0]-a[0],b[1]-a[1])>tolerance/100)raw.push({a:a.slice(0,2),b:b.slice(0,2),layer:f.layer});
 }
 if(raw.length>5000)throw Error('Esta capa supera las 5000 líneas. Elegí una capa más acotada.');
 const vertices=[],buckets=new Map();let snapped=0;
 function vertex(p){
  const x=Math.floor(p[0]/tolerance),y=Math.floor(p[1]/tolerance);let found=-1,best=tolerance;
  for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)for(const id of buckets.get(i+':'+j)||[]){const q=vertices[id],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<=best){found=id;best=d;}}
  if(found>=0){if(best>1e-7)snapped++;return found;}
  if(vertices.length>=30000)throw Error('El plano tiene demasiados cruces. Elegí una capa más acotada para revisarla.');
  const id=vertices.length,k=x+':'+y;vertices.push(p);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);return id;
 }
 const unique=new Map();let duplicates=0;
 for(const s of raw){const a=vertex(s.a),b=vertex(s.b);if(a===b)continue;const k=edgeKey(a,b);if(unique.has(k)){duplicates++;continue;}unique.set(k,{a,b,layer:s.layer});}
 const segments=[...unique.values()],splits=segments.map(s=>new Set([s.a,s.b]));let intersections=0;
 function project(id,s,index){const p=vertices[id],a=vertices[s.a],b=vertices[s.b],d=[b[0]-a[0],b[1]-a[1]],l=d[0]*d[0]+d[1]*d[1],t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l;if(t<0||t>1)return;if(Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1])<=tolerance)splits[index].add(id);}
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const s=segments[i],t=segments[j],a=vertices[s.a],b=vertices[s.b],c=vertices[t.a],d=vertices[t.b];
  if(Math.max(a[0],b[0])+tolerance<Math.min(c[0],d[0])||Math.max(c[0],d[0])+tolerance<Math.min(a[0],b[0])||Math.max(a[1],b[1])+tolerance<Math.min(c[1],d[1])||Math.max(c[1],d[1])+tolerance<Math.min(a[1],b[1]))continue;
  project(s.a,t,j);project(s.b,t,j);project(t.a,s,i);project(t.b,s,i);
  const r=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],den=cross(r,v);
  if(Math.abs(den)<1e-12)continue;
  const q=[c[0]-a[0],c[1]-a[1]],u=cross(q,v)/den,w=cross(q,r)/den;
  if(u<0||u>1||w<0||w>1)continue;
  const id=vertex([a[0]+u*r[0],a[1]+u*r[1]]);splits[i].add(id);splits[j].add(id);intersections++;
 }
 const network=new Map();
 segments.forEach((s,i)=>{const a=vertices[s.a],b=vertices[s.b],dx=b[0]-a[0],dy=b[1]-a[1],ids=[...splits[i]].sort((u,v)=>(vertices[u][0]-vertices[v][0])*dx+(vertices[u][1]-vertices[v][1])*dy);for(let j=1;j<ids.length;j++){const a=ids[j-1],b=ids[j];if(a!==b)network.set(edgeKey(a,b),{a,b});}});
 if(network.size>30000)throw Error('El plano tiene demasiados cruces para revisar esta capa. Elegí una capa más acotada.');
 let adj=adjacency([...network.values()]);const bridges=bridgeEdges(adj);
 for(const k of bridges)network.delete(k);
 adj=adjacency([...network.values()]);
 for(const [id,ns]of adj){const p=vertices[id];ns.sort((a,b)=>Math.atan2(vertices[a][1]-p[1],vertices[a][0]-p[0])-Math.atan2(vertices[b][1]-p[1],vertices[b][0]-p[0]));}
 const visited=new Set(),rings=[];let rejected=0;
 for(const [a,ns]of adj)for(const b of ns){if(visited.has(a+':'+b))continue;let u=a,v=b,ring=[],closed=false;
  for(let guard=0;guard<=network.size*2;guard++){
   const k=u+':'+v;if(visited.has(k))break;visited.add(k);ring.push(u);const next=adj.get(v),w=next[(next.indexOf(u)-1+next.length)%next.length];u=v;v=w;if(u===a&&v===b){closed=true;break;}
  }
  if(!closed||ring.length<3||new Set(ring).size!==ring.length){rejected++;continue;}
  const points=ring.map(id=>vertices[id]),surface=area(points);if(surface>tolerance*tolerance)rings.push({points,surface});
 }
 // A detached ring inside another face would create a hole. Keep it for review,
 // but never emit overlapping lots automatically.
 const nested=new Set();for(let i=0;i<rings.length;i++)for(let j=0;j<rings.length;j++)if(i!==j&&rings[i].surface>rings[j].surface&&contains(rings[j].points[0],rings[i].points))nested.add(i);
 const identified=labels.map(l=>({...l,identification:labelName(l.text)})).filter(l=>l.identification&&Array.isArray(l.point)&&l.point.every(Number.isFinite));
 const explicit=existing.map(f=>({points:f.points,surface:Math.abs(area(f.points))}));
 const candidates=rings.filter((r,i)=>{
  if(!includeNested&&nested.has(i))return false;
  if(!explicit.length)return true;
  // La red ya está cortada en todos los bordes. Una cara interior a un lote
  // explícito es el propio lote o una subdivisión que no se debe duplicar.
  const sample=salesZoneInterior(r.points);
  return !explicit.some(f=>f.surface>=r.surface-1e-7&&contains(sample,f.points));
 });
 const faces=candidates.map((r,i)=>{
  const hits=identified.filter(l=>contains(l.point,r.points)),name=hits.length===1?hits[0].identification:null;
  return {id:crypto.randomUUID(),kind:'lot',name:name?.name||'Lote por identificar '+(i+1),...(name||{}),points:r.points,layer:features[0]?.layer||'0',description:'',dxfReconstructed:true};
 });
 const usedNames=new Map();for(const f of faces)if(f.block){const key=f.name.toLowerCase();if(usedNames.has(key)){const other=usedNames.get(key);delete other.block;delete other.number;other.name='Lote por identificar';delete f.block;delete f.number;f.name='Lote por identificar';}else usedNames.set(key,f);}
 const allFaces=[...existing,...faces];
 const report={closed:allFaces.length,reconstructed:faces.length,identified:allFaces.filter(f=>f.block&&f.number).length,inputSegments:raw.length,uniqueSegments:segments.length,duplicates,snapped,intersections,openSegments:bridges.size,rejected,nested:nested.size,tolerance};
 return {features:[...features,...faces],faces:allFaces,report};
}
function adjacency(edges){const map=new Map();for(const {a,b}of edges){if(!map.has(a))map.set(a,[]);if(!map.has(b))map.set(b,[]);map.get(a).push(b);map.get(b).push(a);}return map;}
function bridgeEdges(adj){
 const visited=new Map(),low=new Map(),bridges=new Set();let time=0;
 for(const start of adj.keys()){
  if(visited.has(start))continue;
  visited.set(start,++time);low.set(start,time);const stack=[{id:start,parent:null,index:0}];
  while(stack.length){const frame=stack.at(-1),neighbors=adj.get(frame.id);
   if(frame.index<neighbors.length){const next=neighbors[frame.index++];if(next===frame.parent)continue;if(!visited.has(next)){visited.set(next,++time);low.set(next,time);stack.push({id:next,parent:frame.id,index:0});}else low.set(frame.id,Math.min(low.get(frame.id),visited.get(next)));}
   else{stack.pop();if(frame.parent!=null){low.set(frame.parent,Math.min(low.get(frame.parent),low.get(frame.id)));if(low.get(frame.id)>visited.get(frame.parent))bridges.add(edgeKey(frame.parent,frame.id));}}
  }
 }
 return bridges;
}
