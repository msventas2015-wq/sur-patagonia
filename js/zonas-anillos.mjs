// Option 7. Geometry stays in the plan; sizes and collision distances are in CSS pixels.
import {lotIdentity} from './lotes-planilla.mjs?v=20261114-import2';

const SVG='http://www.w3.org/2000/svg';
const maps=new WeakMap();
export function ringIdentity(lot){
 const raw=String(lot.numero??'').trim(),compact=raw.match(/^(\d+)\s*[-/]\s*(\d+)$/);
 const identity=lotIdentity(compact?{manzana:compact[1],lote:compact[2]}:lot);
 return {block:identity.block,number:identity.lot.replace(/^0+(?=\d)/,'')};
}
function inside(p,points){
 let result=false,a=points.at(-1);
 for(const b of points){if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;a=b;}
 return result;
}
function middle(points){
 const [ox,oy]=points[0];let area=0,x=0,y=0;
 for(let i=1;i<points.length-1;i++){
  const ax=points[i][0]-ox,ay=points[i][1]-oy,bx=points[i+1][0]-ox,by=points[i+1][1]-oy,k=ax*by-ay*bx;
  area+=k;x+=k*(ax+bx);y+=k*(ay+by);
 }
 const center=area?[ox+x/(3*area),oy+y/(3*area)]:points[0];
 if(inside(center,points))return center;
 const cuts=[];let a=points.at(-1);
 for(const b of points){if((a[1]>center[1])!==(b[1]>center[1]))cuts.push(a[0]+(center[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]));a=b;}
 cuts.sort((a,b)=>a-b);let best=0,mid=center;
 for(let i=1;i<cuts.length;i+=2)if(cuts[i]-cuts[i-1]>best){best=cuts[i]-cuts[i-1];mid=[(cuts[i]+cuts[i-1])/2,center[1]];}
 return mid;
}
function straighten(run){
 if(run.length<3)return;
 const first=run[0].anchor,last=run.at(-1).anchor,dx=last[0]-first[0],dy=last[1]-first[1],len=Math.hypot(dx,dy);
 if(!len)return;
 const nx=-dy/len,ny=dx/len,offsets=run.map(({anchor:p})=>(p[0]-first[0])*nx+(p[1]-first[1])*ny);
 const mean=offsets.reduce((a,b)=>a+b,0)/run.length;
 for(const [i,item] of run.entries()){
  const shift=mean-offsets[i],p=[item.anchor[0]+shift*nx,item.anchor[1]+shift*ny];
  if(inside(p,item.points))item.anchor=p;
 }
}
export function alignRingRows(items){
 const blocks=new Map();
 for(const item of items){
  if(!item.points?.length)continue;
  item.anchor=middle(item.points);
  const {block,number}=ringIdentity(item.lot);item.number=number;
  const key=block||item.block||item.zone||'';
  if(!blocks.has(key))blocks.set(key,[]);blocks.get(key).push(item);
 }
 for(const block of blocks.values()){
  block.sort((a,b)=>a.number.localeCompare(b.number,'es',{numeric:true}));
  let run=[];
  for(const item of block){
   if(run.length>=2){
    const p=run.at(-1).anchor,a=run[0].anchor,b=item.anchor;
    const dx=p[0]-a[0],dy=p[1]-a[1],ex=b[0]-p[0],ey=b[1]-p[1];
    if(dx*ex+dy*ey<.82*Math.hypot(dx,dy)*Math.hypot(ex,ey)){straighten(run);run=[];}
   }
   run.push(item);
  }
  straighten(run);
 }
}
export function createLotRing(doc,lot,color){
 const {number}=ringIdentity(lot);
 if(!number||lot.estado==='no_a_la_venta'||lot.zonaOculta)return null;
 const ring=doc.createElementNS(SVG,'g'),box=doc.createElementNS(SVG,'foreignObject'),glass=doc.createElement('div');
 ring.dataset.lotState=lot.id;ring.dataset.availability=lot.estado||'sin';ring.classList.add('zone-ring');
 ring.setAttribute('pointer-events','none');ring.setAttribute('aria-hidden','true');ring.style.visibility='hidden';
 for(const [k,v]of Object.entries({x:-17,y:-17,width:34,height:34}))box.setAttribute(k,v);
 glass.style.cssText='box-sizing:border-box;margin:3px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.80);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:2.4px solid '+color+';color:#fff;box-shadow:0 1px 3px #0006;font:600 '+(number.length>3?'10':'13')+'px/1 Avenir Next,Avenir,Inter,sans-serif;letter-spacing:0;text-shadow:none;white-space:nowrap;';
 glass.textContent=number;box.append(glass);ring.append(box);return ring;
}
export function placeRings(items,matrix){
 if(!matrix)return;
 const sx=Math.hypot(matrix.a,matrix.b),sy=Math.hypot(matrix.c,matrix.d);if(!sx||!sy)return;
 const visible=items.filter(i=>i.anchor&&i.ring.style.display!=='none');
 const cells=new Map(),side=32;
 for(const i of visible){
  const [x,y]=i.anchor;i.x=matrix.a*x+matrix.c*y;i.y=matrix.b*x+matrix.d*y;i.d=28;
  const col=Math.floor(i.x/side),row=Math.floor(i.y/side);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of cells.get((col+dx)+','+(row+dy))||[]){
   const distance=Math.hypot(i.x-other.x,i.y-other.y)-2;i.d=Math.min(i.d,distance);other.d=Math.min(other.d,distance);
  }
  const key=col+','+row;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
 }
 for(const item of items){
  const show=item.anchor&&item.ring.style.display!=='none'&&item.d>=15;item.ring.style.visibility=show?'visible':'hidden';
  if(show)item.ring.setAttribute('transform','translate('+item.anchor.join(' ')+') scale('+item.d/(28*sx)+' '+item.d/(28*sy)+')');
 }
}
export function addMapRing(layer,ring,lot,points,anchor){
 if(!ring)return;
 let group=maps.get(layer);
 if(!group){group={items:[],dirty:true,pending:false};maps.set(layer,group);}
 group.items.push({ring,lot,points,anchor});group.dirty=true;layer.append(ring);
 if(!group.pending){group.pending=true;requestAnimationFrame(()=>{group.pending=false;syncMapRings(layer);});}
}
export function syncMapRings(layer){
 const group=maps.get(layer);if(!group)return;
 if(group.dirty){
  group.items=group.items.filter(i=>i.ring.parentNode===layer);alignRingRows(group.items);
  for(const item of group.items)layer.append(item.ring);
  group.dirty=false;
 }
 const matrix=layer.getScreenCTM();
 placeRings(group.items,matrix);
 if(!matrix || !layer.querySelector('circle.station'))return;
 const stations=[...layer.querySelectorAll('circle.station')].map(station=>station.getBoundingClientRect());
 const visible=group.items.filter(item=>item.ring.style.visibility==='visible');
 const positions=new Map(visible.map(item=>[item,new DOMPoint(...item.anchor).matrixTransform(matrix)]));
 const nearStation=(p,r)=>stations.some(box=>{
  const dx=Math.max(box.left-p.x,0,p.x-box.right),dy=Math.max(box.top-p.y,0,p.y-box.bottom);
  return Math.hypot(dx,dy)<r+2;
 });
 const inverse=matrix.inverse();
 for(const item of visible){
  const center=positions.get(item);
  if(!nearStation(center,item.d/2))continue;
  // Keep the alternate position inside this lot and clear of neighboring numbers.
  const diameter=Math.min(item.d,20),radius=diameter/2;
  let placed=false;
  for(const distance of [12,20,28,36,44]){
   for(let angle=0;angle<8;angle++){
    const rad=angle*Math.PI/4,p=new DOMPoint(center.x+distance*Math.cos(rad),center.y+distance*Math.sin(rad));
    if(nearStation(p,radius))continue;
    const local=p.matrixTransform(inverse);
    if(!item.points || !inside([local.x,local.y],item.points))continue;
    if([...positions].some(([other,q])=>other!==item && Math.hypot(q.x-p.x,q.y-p.y)<radius+other.d/2+2))continue;
    item.ring.setAttribute('transform','translate('+local.x+' '+local.y+') scale('+diameter/(28*Math.hypot(matrix.a,matrix.b))+' '+diameter/(28*Math.hypot(matrix.c,matrix.d))+')');
    positions.set(item,p);placed=true;break;
   }
   if(placed)break;
  }
  if(!placed){item.ring.style.visibility='hidden';positions.delete(item);}
 }
}
