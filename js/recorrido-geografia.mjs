// Coordenadas públicas [longitud, latitud], grados WGS84; dibujos DXF [este, norte], metros.
const rad = Math.PI / 180;
export function gps(p) {
  return Array.isArray(p) && p.length >= 2 && p.slice(0,2).every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) < 89.9;
}
export function affine(from,to) {
  const [[x,y],[x1,y1],[x2,y2]] = from;
  const a=x1-x,b=x2-x,c=y1-y,d=y2-y, det=a*d-b*c;
  if (!Number.isFinite(det) || Math.abs(det) <= Math.hypot(a,c)*Math.hypot(b,d)*0.001 || !det) throw Error('Las tres referencias deben estar separadas y formar un triángulo amplio.');
  return ([px,py]) => {
    const u=((px-x)*d-(py-y)*b)/det,v=((py-y)*a-(px-x)*c)/det;
    return to[0].map((o,i)=>o+u*(to[1][i]-o)+v*(to[2][i]-o));
  };
}
export function meters(a,b) {
  const lat=(a[1]+b[1])*rad/2;
  return [(b[0]-a[0])*(111412.84*Math.cos(lat)-93.5*Math.cos(3*lat)),(b[1]-a[1])*(111132.92-559.82*Math.cos(2*lat)+1.175*Math.cos(4*lat))];
}
// Inversa de Transversa de Mercator (serie de Snyder). POSGAR 2007, origen polo sur;
// UTM WGS84, hemisferio sur. Se valida el rango de la faja elegida.
export function dxfProjection(system,zone) {
  if (!['posgar','utm'].includes(system) || !Number.isInteger(zone) || zone<1 || zone>(system==='posgar'?7:60)) throw Error('Elegí el sistema y la faja/zona indicados por el agrimensor.');
  const posgar=system==='posgar',lon0=posgar?-75+3*zone:zone*6-183;
  const a=6378137, f=1/298.257223563, e=2*f-f*f, ep=e/(1-e),k=posgar?1:.9996;
  const A=1-e/4-3*e**2/64-5*e**3/256, n=(1-Math.sqrt(1-e))/(1+Math.sqrt(1-e));
  return ([east,north])=>{
    const x=east-(posgar?zone*1e6+500000:500000);
    const m=posgar?north-a*A*Math.PI/2:(north-1e7)/k;
    if (Math.abs(x)>500000 || north<0 || north>1e7) throw Error('Las coordenadas del DXF no coinciden con la faja, unidades u orden de ejes indicados.');
    const u=m/(a*A);
    const phi=u+(3*n/2-27*n**3/32)*Math.sin(2*u)+(21*n*n/16-55*n**4/32)*Math.sin(4*u)+151*n**3/96*Math.sin(6*u)+1097*n**4/512*Math.sin(8*u);
    const t=Math.tan(phi)**2,c=ep*Math.cos(phi)**2,w=1-e*Math.sin(phi)**2,N=a/Math.sqrt(w),R=a*(1-e)/w**1.5,D=x/(N*k);
    const lat=phi-(N*Math.tan(phi)/R)*(D*D/2-(5+3*t+10*c-4*c*c-9*ep)*D**4/24+(61+90*t+298*c+45*t*t-252*ep-3*c*c)*D**6/720);
    const lon=lon0+(D-(1+2*t+c)*D**3/6+(5-2*c+28*t-3*c*c+8*ep+24*t*t)*D**5/120)/Math.cos(phi)/rad;
    return [lon,lat/rad];
  };
}

function shape(kind,name,points) {
  if (!Array.isArray(points) || points.length < ({lot:3,line:2,poi:1})[kind] || points.some(p=>!Array.isArray(p) || p.length<2 || !p.slice(0,2).every(Number.isFinite))) throw Error('El plano contiene una geometría incompleta.');
  return {id:crypto.randomUUID(),kind,name:String(name||({lot:'Lote',poi:'Lugar',line:'Traza'})[kind]).slice(0,140),points:points.map(p=>p.slice(0,2)),description:''};
}
// Compara únicamente segmentos cuyas cajas se tocan, en las unidades del archivo.
export function* nearbyRingEdges(rings,tolerance=0) {
  const segments=[];
  for(const ring of rings){
    const points=ring.points;
    for(let index=0;index<points.length;index++){
      const a=points[index],b=points[(index+1)%points.length];
      if(a[0]===b[0] && a[1]===b[1])continue;
      segments.push({ring,index,a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
    }
  }
  // Elegir el eje con menos intervalos superpuestos evita recorrer toda una
  // hilera vertical cuando sus segmentos tienen la misma coordenada X.
  function density(min,max){
    let low=Infinity,high=-Infinity,sum=0;
    for(const s of segments){low=Math.min(low,s[min]);high=Math.max(high,s[max]);sum+=s[max]-s[min]+tolerance;}
    return high>low?sum/(high-low):Infinity;
  }
  const vertical=density('minY','maxY')<density('minX','maxX');
  const [min,max,otherMin,otherMax]=vertical?['minY','maxY','minX','maxX']:['minX','maxX','minY','maxY'];
  segments.sort((a,b)=>a[min]-b[min] || a[otherMin]-b[otherMin]);
  for(let i=0;i<segments.length;i++){
    const s=segments[i];
    for(let j=i+1;j<segments.length;j++){
      const t=segments[j];
      if(t[min]>s[max]+tolerance)break;
      if(t[otherMin]<=s[otherMax]+tolerance && s[otherMin]<=t[otherMax]+tolerance)yield [s,t];
    }
  }
}

function validateLotRing(feature) {
  const same=(a,b)=>a[0]===b[0] && a[1]===b[1];
  const points=feature.points.filter((p,i,all)=>i===0 || !same(p,all[i-1]));
  if(points.length>1 && same(points[0],points.at(-1)))points.pop();
  const invalid=reason=>{throw Error('Revisá el contorno de «'+feature.name+'»: '+reason+'.');};
  if(points.length<3)invalid('faltan tres esquinas distintas');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    area+=cross(points[0],a,b);
    if(cross(a,b,c)===0 && (a[0]-b[0])*(c[0]-b[0])+(a[1]-b[1])*(c[1]-b[1])>0)invalid('un lado vuelve sobre sí mismo');
  }
  if(area===0)invalid('el lote no tiene superficie');
  for(const [s,t] of nearbyRingEdges([{points}])){
    const distance=Math.abs(s.index-t.index);
    if(distance===1 || distance===points.length-1)continue;
    if(Math.sign(cross(s.a,s.b,t.a))*Math.sign(cross(s.a,s.b,t.b))<=0 &&
       Math.sign(cross(t.a,t.b,s.a))*Math.sign(cross(t.a,t.b,s.b))<=0)invalid('hay lados que se cruzan o se tocan');
  }
}

function checked(list) {
  if (!list.length || list.length>5000 || list.reduce((n,f)=>n+f.points.length,0)>100000) throw Error('El plano debe contener geometría reconocible y hasta 5000 elementos o 100 000 vértices.');
  if (list.some(f=>f.points.some(p=>!gps(p)))) throw Error('Se necesitan coordenadas geográficas WGS84 en grados.');
  for(const feature of list)if(feature.kind==='lot')validateLotRing(feature);
  return list;
}
export function importGeoJSON(text) {
  const doc=JSON.parse(text),out=[];
  if(doc.crs && !/4326|CRS84/i.test(doc.crs.properties?.name||''))throw Error('Exportá el GeoJSON en WGS84.');
  function add(g,name) {
    if (!g) throw Error('Geometría vacía.');
    switch(g.type) {
      case 'GeometryCollection': return g.geometries.forEach(child=>add(child,name));
      case 'MultiPolygon': return g.coordinates.forEach(coordinates=>add({type:'Polygon',coordinates},name));
      case 'MultiLineString': return g.coordinates.forEach(coordinates=>add({type:'LineString',coordinates},name));
      case 'Polygon': if(g.coordinates.length!==1) throw Error('Separá los polígonos con huecos antes de importar.');out.push(shape('lot',name,g.coordinates[0]));break;
      case 'LineString': out.push(shape('line',name,g.coordinates));break;
      case 'Point': out.push(shape('poi',name,[g.coordinates]));break;
      default: throw Error('Geometría no admitida: '+g.type);
    }
  }
  for(const f of doc.type==='FeatureCollection'?doc.features:[doc]){
    const start=out.length, props=f.properties||{};
    add(f.geometry||f,props.name??props.nombre??(props.manzana && props.lote?'Manzana '+props.manzana+' · Lote '+props.lote:props.lote));
    for(const feature of out.slice(start))if(feature.kind==='lot'){
      if(props.etapa!=null)feature.stage=String(props.etapa).trim().slice(0,40);
      if(props.manzana!=null)feature.block=String(props.manzana).trim().slice(0,60);
    }
  }
  return checked(out);
}
export function importKML(text) {
  const doc=new DOMParser().parseFromString(text,'application/xml'),out=[];
  if(doc.querySelector('parsererror') || doc.documentElement.localName!=='kml')throw Error('El archivo no es un KML válido.');
  const nodes=(root,tag)=>Array.from(root.getElementsByTagNameNS('*',tag));
  for(const mark of nodes(doc,'Placemark')){
    const name=nodes(mark,'name')[0]?.textContent;
    for(const [tag,kind] of [['Polygon','lot'],['LineString','line'],['Point','poi']]) for(const geo of nodes(mark,tag)){
      if(nodes(geo,'innerBoundaryIs').length) throw Error('Separá los polígonos con huecos antes de importar.');
      const coords=nodes(geo,'coordinates')[0]?.textContent.trim().split(/\s+/).map(v=>v.split(',').slice(0,2).map(n=>n.trim()?Number(n):NaN))||[];
      out.push(shape(kind,name,coords));
    }
  }
  return checked(out);
}
export function readDXF(text) {
  if(text.startsWith('AutoCAD Binary'))throw Error('Exportá el DXF como ASCII.');
  const lines=text.trimEnd().split(/\r?\n/),entities=[];let inside=false,entity;
  for(let i=0;i+1<lines.length;i+=2){
    const code=lines[i].trim(),v=lines[i+1].trim();
    if(code==='0' && v==='ENDSEC')inside=false;
    if(!inside){if(code==='2' && v==='ENTITIES')inside=true;continue;}
    if(code==='0'){entity={kind:v,tags:[]};entities.push(entity);}else entity?.tags.push([code,(entity.kind==='TEXT'||entity.kind==='MTEXT')&&(code==='1'||code==='3')?lines[i+1]:v]);
  }
  const features=[],labels=[],skipped=new Map();
  const ignore=k=>skipped.set(k,(skipped.get(k)||0)+1);
  const val=(e,c)=>e.tags.find(([k])=>k===c)?.[1];
  for(let i=0;i<entities.length;i++){
    const e=entities[i],layer=val(e,'8')||'0';let pts=[],closed=false;
    if(e.kind==='TEXT'||e.kind==='MTEXT'){
      const point=[Number(val(e,'10')),Number(val(e,'20'))],text=e.tags.filter(([k])=>k==='1'||k==='3').map(([,v])=>v).join('');
      if(point.every(Number.isFinite)&&text)labels.push({text:text.slice(0,1000),point,layer});else ignore('texto sin ubicación');
      continue;
    }
    if(e.kind==='LINE') pts=[[Number(val(e,'10')),Number(val(e,'20'))],[Number(val(e,'11')),Number(val(e,'21'))]];
    else if(e.kind==='LWPOLYLINE'||e.kind==='POLYLINE'){
      const vertices=e.kind==='POLYLINE'?[]:[e];
      if(e.kind==='POLYLINE')while(entities[i+1]?.kind==='VERTEX') vertices.push(entities[++i]);
      if(vertices.some(v=>v.tags.some(([k,n])=>k==='42' && Number(n)!==0)) || (val(e,'230')!=null && Number(val(e,'230'))!==1)){ignore('curvas o ejes especiales');continue;}
      for(const v of vertices){let point;for(const [k,n] of v.tags){if(k==='10'){point=[Number(n),NaN];pts.push(point);}if(k==='20'&&point)point[1]=Number(n);}}
      closed=!!(Number(val(e,'70'))&1) || (pts.length>3 && pts[0].every((v,j)=>v===pts.at(-1)[j]));
    }else{if(e.kind!=='SEQEND')ignore(e.kind);continue;}
    features.push({...shape(closed?'lot':'line',layer+' · '+(features.length+1),pts),layer});
  }
  if(!features.length)throw Error('Exportá líneas o polilíneas rectas en el espacio modelo, explotando los bloques. Para lotes usá polilíneas cerradas.');
  return {features,labels,skipped:[...skipped].map(([k,n])=>n+' '+k).join(', ')};
}
export function convertDXF(features,transform) {
  return checked(features.map(f=>({...f,points:f.points.map(transform)})));
}

// Sólo metadatos específicos; no se conserva el EXIF ni los identificadores del equipo.
export async function cameraMetadata(file) {
  const buf=await file.slice(0,2*1024*1024).arrayBuffer(),v=new DataView(buf),xml=new TextDecoder('latin1').decode(buf);
  // DJI also writes namespace aliases such as drone-dji_1_. Their URI, not
  // their spelling, identifies the metadata; gimbal yaw is never PoseHeading.
  const aliases=new Map([['drone-dji',new Set(['drone-dji'])],['GPano',new Set(['GPano'])]]);
  for(const m of xml.matchAll(/xmlns:([\w.-]+)=["']([^"']+)["']/g)){
    const family=['http://www.dji.com/drone-dji/1.0/','http://www.uav.com/drone-dji/1.0/'].includes(m[2])?'drone-dji':m[2]==='http://ns.google.com/photos/1.0/panorama/'?'GPano':null;
    if(family)aliases.get(family).add(m[1]);
  }
  const field=name=>{const [family,key]=name.split(':');for(const prefix of aliases.get(family)||[]){const escaped=(prefix+':'+key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=xml.match(new RegExp(escaped+'(?:="([^"]+)"|>([^<]+)<)'));if(m)return Number(m[1]??m[2]);}return NaN;};
  let pt=[field('drone-dji:GpsLongitude'),field('drone-dji:GpsLatitude')];
  let heading=field('GPano:PoseHeadingDegrees');
  if(!gps(pt)) {
    // JPEG APP1 Exif -> TIFF GPS IFD (racionales DMS, signo N/S/E/O).
    try {
      let pos=2;
      while(pos+10<v.byteLength && v.getUint8(pos)===255){
        const size=v.getUint16(pos+2);if(size<2)break;
        if(v.getUint8(pos+1)===225 && v.getUint32(pos+4)===0x45786966){
          const t=pos+10,little=v.getUint16(t)===0x4949,u16=p=>v.getUint16(t+p,little),u32=p=>v.getUint32(t+p,little);
          const tags=offset=>{const m=new Map();for(let i=0;i<u16(offset);i++){const p=offset+2+i*12;m.set(u16(p),p);}return m;};
          const ptr=tags(u32(4)).get(0x8825);if(ptr!=null){
            const g=tags(u32(ptr+8)),ref=k=>String.fromCharCode(v.getUint8(t+g.get(k)+8));
            const dms=k=>{const o=u32(g.get(k)+8);return [1,60,3600].reduce((n,d,i)=>n+u32(o+8*i)/u32(o+8*i+4)/d,0);};
            if(['E','W'].includes(ref(3)) && ['N','S'].includes(ref(1)))pt=[dms(4)*(ref(3)==='W'?-1:1),dms(2)*(ref(1)==='S'?-1:1)];
          }
          break;
        }pos+=2+size;
      }
    }catch{/* Sin GPS utilizable: ubicación manual. */}
  }
  // DJI RelativeAltitude is relative to takeoff, not measured ground clearance.
  // AbsoluteAltitude/GPSAltitude cannot serve as height above the project plan.
  const relative=field('drone-dji:RelativeAltitude'),height=Number.isFinite(relative)&&relative>=.1&&relative<=10000?relative:null;
  return {point:gps(pt)?pt:null,heading:Number.isFinite(heading)&&heading>=0&&heading<=360?heading%360:null,height,heightReference:height==null?null:'takeoff'};
}

// Una fila nombra una única geometría. Nunca asocia por nombre registros comerciales.
export function parcelNames(text,features){
  const rows=text.trim().split(/\r?\n/).filter(x=>x.trim());
  if(rows.length<2)throw Error('Pegá la cabecera y las filas de la planilla de lotes.');
  const sep=rows[0].includes('\t')?'\t':rows[0].includes(';')?';':',';
  if(rows.shift().toLowerCase().split(sep).map(v=>v.trim()).join(',')!=='manzana,lote,longitud,latitud')throw Error('Las columnas son manzana, lote, longitud y latitud.');
  const changes=new Map(),names=new Set(),polygons=features.filter(f=>f.kind==='lot');
  for(const [i,row] of rows.entries()){
    const cells=row.split(sep).map(x=>x.trim()),[block,lot,lon,lat]=cells;
    const point=[lon,lat].map(v=>v?Number(sep===','?v:v.replace(',','.')):NaN);
    if(cells.length!==4||!lot||!block||!gps(point))throw Error('Revisá la fila '+(i+2)+' de la planilla de lotes.');
    const hits=polygons.filter(f=>inside(point,f.points));
    const name='Manzana '+block+' · Lote '+lot;
    if(hits.length!==1||names.has(name)||changes.has(hits[0].id))throw Error('Fila '+(i+2)+': se requiere un punto interior de una única parcela y una identificación sin repetir.');
    changes.set(hits[0].id,name);names.add(name);
  }
  return changes;
}
function inside([x,y],polygon){
  let hit=false,a=polygon.at(-1);
  for(const b of polygon){
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length && Math.abs((x-a[0])*dy-(y-a[1])*dx)<1e-10*length && (x-a[0])*(x-b[0])+(y-a[1])*(y-b[1])<=0)return false;
    if((b[1]>y)!==(a[1]>y) && x<(a[0]-b[0])*(y-b[1])/(a[1]-b[1])+b[0])hit=!hit;
    a=b;
  }
  return hit;
}
