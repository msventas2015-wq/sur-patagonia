import {imageLots,imagePolygonIssue,imageInside} from './recorrido-grilla.mjs?v=20261113-manzana';

// Image coordinates stay in their own plane: no projection, GPS or tour required.
// Match the existing selector's normalized SVG, which stretches with the photo.
export function imagePlanMap(plan,safeUrl){
 if(!plan||![1,2].includes(plan.version)||!Number.isFinite(plan.width)||!Number.isFinite(plan.height)||plan.width<=0||plan.height<=0)return null;
 const base=safeUrl(plan.url);if(!base)return null;
 let features;try{features=imageLots(plan).filter(f=>f.kind==='lot'&&!f.hidden);}catch{return null;}
 if(!features.length||features.length>5000)return null;
 const ids=new Set(),shapes=new Map(),bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
 for(const feature of features){
  if(typeof feature.id!=='string'||!feature.id||ids.has(feature.id)||imagePolygonIssue(feature.points))return null;
  ids.add(feature.id);
  for(const [u,v] of feature.points){bounds.left=Math.min(bounds.left,u);bounds.right=Math.max(bounds.right,u);bounds.top=Math.min(bounds.top,v);bounds.bottom=Math.max(bounds.bottom,v);}
  const center=interiorPoint(feature.points);
  shapes.set(feature.id,{feature,points:feature.points.map(([u,v])=>[u*843,v*1500].join(',')).join(' '),center:[center[0]*843,center[1]*1500]});
 }
 return {base,hasPhoto:true,shapes,bounds};
}
function interiorPoint(points){
 const average=points.reduce((r,p)=>[r[0]+p[0]/points.length,r[1]+p[1]/points.length],[0,0]);
 if(imageInside(average,points))return average;
 const low=Math.min(...points.map(p=>p[1])),high=Math.max(...points.map(p=>p[1]));let widest=0,result=points[0];
 for(const t of [.5,.375,.625,.25,.75,.125,.875]){
  const y=low+(high-low)*t,xs=[];let a=points.at(-1);
  for(const b of points){if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));a=b;}
  xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>widest){widest=xs[i]-xs[i-1];result=[(xs[i]+xs[i-1])/2,y];}
 }
 return result;
}
