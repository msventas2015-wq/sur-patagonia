// Direction masks are traced on the source panorama, in its native 2:1 coordinates.
const width = 2048, height = 1024;
const rad = Math.PI / 180;
let source;
let maskNumber = 0;

export function isTerrainDetail(slug, camera) {
  return slug === 'terrazas-del-piltri' && /^detalle-032[3-9]$/.test(camera.id);
}

export function terrainCamera(camera) {
  if (camera.id !== 'detalle-0326') return camera;
  // The two frontage intersections at the foot of the utility pillars constrain
  // one optical pose. This is the ground-plane similarity from the approved mock.
  const scale = Math.hypot(1.068913, .015663);
  const lonMeters = 111320 * Math.cos(camera.point[1] * rad);
  return {...camera, point:[camera.point[0] + .886 / lonMeters, camera.point[1] + .430 / 111320],
    height:camera.height / scale, heading:camera.heading - Math.atan2(.015663,1.068913) / rad};
}

function direction(x,y) {
  const az = (x / width - .5) * 2 * Math.PI;
  const el = (.5 - y / height) * Math.PI;
  return [Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el)];
}

function directions(contour) {
  const result = [];
  // Long edges along a latitude are curved when the panorama rotates.
  let a = contour.at(-1);
  for (const b of contour) {
    const n = Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])) / 14);
    for (let j=1; j<=n; j++) result.push(direction(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n));
    a = b;
  }
  return result;
}

function contourPath(points, camera, screen, width, height) {
  const near = .04;
  const clipped = [];
  let a = camera(points.at(-1));
  for (const world of points) {
    const b = camera(world);
    if ((a[2]>near) !== (b[2]>near)) {
      const t = (near-a[2]) / (b[2]-a[2]);
      clipped.push(screen([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),near]));
    }
    if (b[2]>near) clipped.push(screen(b));
    a=b;
  }
  if (clipped.length<3 || clipped.every(p=>p[0]<0) || clipped.every(p=>p[1]<0) ||
      clipped.every(p=>p[0]>width) || clipped.every(p=>p[1]>height)) return '';
  return 'M'+clipped.map(([x,y])=>x.toFixed(1)+' '+y.toFixed(1)).join('L')+'Z';
}

export function terrainLayer(overlay, station, svg, redraw) {
  const id = 'rg-terrain-mask-'+(++maskNumber);
  const mask = svg('mask',{id,maskUnits:'userSpaceOnUse',x:0,y:0});
  const field = svg('rect',{x:0,y:0,fill:'white'});
  const silhouette = svg('path',{fill:'black','fill-rule':'nonzero'});
  mask.append(field,silhouette);
  const defs = svg('defs',{}); defs.append(mask);
  const ground = svg('g',{'mask':'url(#'+id+')'});
  overlay.append(defs,ground);
  overlay.dataset.terrainDetail = station;
  let contours = [];
  function update(camera, screen, width, height) {
    for (const el of [mask,field]) {
      el.setAttribute('width',width);el.setAttribute('height',height);
    }
    silhouette.setAttribute('d',contours.map(points=>contourPath(points,camera,screen,width,height)).join(''));
  }
  source ??= fetch(new URL('../assets/recorridos/terrazas-revision/oclusiones-detalle.json?v=20261116-bordes1',import.meta.url))
    .then(response=>{if (!response.ok) throw Error('Máscara de terreno');return response.json();})
    .catch(error=>{source=undefined;throw error;});
  source.then(data=>{
    if (!overlay.isConnected) return;
    contours = data[station.slice(-4)].map(directions);
    redraw();
    overlay.dataset.terrainMask = 'ready';
  }).catch(()=>{overlay.dataset.terrainMask = 'unavailable';});
  return {ground,update,occludes:point=>contours.length>0 && silhouette.isPointInFill(point)};
}
