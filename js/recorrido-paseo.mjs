import {meters} from './recorrido-geografia.mjs';

const rad = Math.PI / 180;
const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

function loadImage(url, priority) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.fetchPriority = priority;
  image.src = url;
  return {image, ready: image.decode().then(() => image)};
}

// Una ventana por visita. Al salir del tramo se liberan tanto los píxeles como
// los pedidos especulativos. Un fallo nunca queda guardado como resultado.
export function previewWindow() {
  const entries = new Map();
  function retain(urls) {
    for (const [url, entry] of entries) {
      if (!urls.includes(url)) {
        entries.delete(url);
        if (!entry.image.complete) entry.image.removeAttribute('src');
      }
    }
  }
  function get(url, priority = 'low') {
    let entry = entries.get(url);
    if (!entry) {
      entry = loadImage(url, priority);
      entry.ready = entry.ready.then(image => {
        if (Math.abs(image.naturalWidth / image.naturalHeight - 2) > .02) throw Error('preview');
        return image;
      }).catch(error => {
        if (entries.get(url) === entry) entries.delete(url);
        throw error;
      });
      entries.set(url, entry);
    } else if (priority === 'high') entry.image.fetchPriority = 'high';
    return entry.ready;
  }
  return {get, retain};
}

// Matriz óptica a mundo (este, arriba, norte), en orden de columnas WebGL.
// Es la inversa de la proyección de las parcelas en recorrido-escena.
function basis(pose) {
  const h = pose.heading * rad, t = (pose.tilt || 0) * rad, r = (pose.roll || 0) * rad;
  const ch = Math.cos(h), sh = Math.sin(h), ct = Math.cos(t), st = Math.sin(t), cr = Math.cos(r), sr = Math.sin(r);
  return [
    cr*ch-sr*st*sh, sr*ct, -cr*sh-sr*st*ch,
    -sr*ch-cr*st*sh, cr*ct, sr*sh-cr*st*ch,
    ct*sh, st, ct*ch
  ];
}
const transpose = m => [m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
const rotate = (m,[x,y,z]) => [0,1,2].map(i => m[i]*x+m[i+3]*y+m[i+6]*z);
function ray(x, y, yaw, pitch) {
  const up = y*Math.cos(pitch)+Math.sin(pitch), front = Math.cos(pitch)-y*Math.sin(pitch);
  return [x*Math.cos(yaw)+front*Math.sin(yaw), up, front*Math.cos(yaw)-x*Math.sin(yaw)];
}

export function arrivalPose(from, to, view) {
  const world = rotate(basis(from), ray(0, 0, view.yaw, view.pitch));
  const [x,y,z] = rotate(transpose(basis(to)), world);
  return {yaw: Math.atan2(x,z), pitch: Math.atan2(y,Math.hypot(x,z)), fov:view.fov};
}

export const walkShader = `
  uniform sampler2D previous, px, nx, py, ny, pz, nz;
  uniform vec3 posReady, negReady, offsetWorld;
  uniform mat3 localToWorld, worldToOld, worldToNew;
  uniform float travel, oldHeight, newHeight;
  vec2 spherical(vec3 d){
    return vec2(fract(atan(d.x,d.z)/6.2831853+.5),.5-asin(clamp(normalize(d).y,-1.,1.))/3.14159265);
  }
  vec3 detail(vec3 d, vec3 base){
    vec3 a=abs(d);
    if(a.x>=a.y && a.x>=a.z){
      if(d.x>0. && posReady.x>.5)return texture2D(px,.5+.5*vec2(-d.z,-d.y)/a.x).rgb;
      if(d.x<0. && negReady.x>.5)return texture2D(nx,.5+.5*vec2(d.z,-d.y)/a.x).rgb;
    }else if(a.y>=a.z){
      if(d.y>0. && posReady.y>.5)return texture2D(py,.5+.5*vec2(d.x,d.z)/a.y).rgb;
      if(d.y<0. && negReady.y>.5)return texture2D(ny,.5+.5*vec2(d.x,-d.z)/a.y).rgb;
    }else{
      if(d.z>0. && posReady.z>.5)return texture2D(pz,.5+.5*vec2(d.x,-d.y)/a.z).rgb;
      if(d.z<0. && negReady.z>.5)return texture2D(nz,.5+.5*vec2(-d.x,-d.y)/a.z).rgb;
    }
    return base;
  }
  vec3 walkColor(vec3 d,vec2 uv){
    if(travel>=1.)return detail(d,texture2D(photo,uv).rgb);
    vec3 worldRay=localToWorld*d;
    float inverseDepth=max(-worldRay.y,0.)/max(.1,mix(oldHeight,newHeight,travel));
    vec3 shift=offsetWorld*inverseDepth;
    vec2 a=spherical(worldToOld*(worldRay+travel*shift));
    vec2 b=spherical(worldToNew*(worldRay-(1.-travel)*shift));
    return mix(texture2D(previous,a).rgb,texture2D(photo,b).rgb,smoothstep(.22,.78,travel));
  }`;

// Sólo se piden caras dentro del encuadre. La primera muestra mira al centro.
function visibleFaces({yaw,pitch,fov,aspect}) {
  const visible = new Set();
  for (const x of [0,-.5,.5,-1,1]) for (const y of [0,-.5,.5,-1,1]) {
    const d = ray(x*aspect*fov,y*fov,yaw,pitch);
    const a = d.map(Math.abs), axis = a.indexOf(Math.max(...a));
    visible.add(axis*2 + Number(d[axis]<0));
  }
  return [...visible];
}

export function uploadTexture(gl, image) {
  const texture = gl.createTexture();
  if (!texture) throw Error('texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);
  for (const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
  if (gl.getError()!==gl.NO_ERROR) {gl.deleteTexture(texture);throw Error('texture');}
  return texture;
}

export function walkRenderer(gl, program, base, directory, redraw) {
  const loc = name => gl.getUniformLocation(program,name);
  const progress = loc('travel'), positive = loc('posReady'), negative = loc('negReady');
  const ready = new Map(), failed = new Set();
  let previous, activeRequest, wanted = [], timer, generation = 0;
  gl.uniform1i(loc('previous'),1);
  faces.forEach((name,i) => gl.uniform1i(loc(name),i+2));

  function bind(unit, texture) {
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.activeTexture(gl.TEXTURE0);
  }
  function flags() {
    gl.uniform3f(positive,...[0,2,4].map(i=>Number(ready.has(i))));
    gl.uniform3f(negative,...[1,3,5].map(i=>Number(ready.has(i))));
  }
  function resetFaces() {
    generation++;
    clearTimeout(timer);
    activeRequest?.image.removeAttribute('src');
    activeRequest = null;
    wanted = [];
    for (const texture of ready.values()) gl.deleteTexture(texture);
    ready.clear(); failed.clear(); flags();
    faces.forEach((_,i) => bind(i+2,base));
  }
  async function loadFace() {
    const index = wanted.find(i => !ready.has(i) && !failed.has(i));
    if (activeRequest || index === undefined) return;
    const version = generation;
    const request = loadImage(directory+faces[index]+'.webp','low');
    activeRequest = request;
    try {
      const image = await request.ready;
      if (version !== generation || !wanted.includes(index)) return;
      if (image.width !== image.height || image.width > gl.getParameter(gl.MAX_TEXTURE_SIZE)) throw Error('face');
      gl.activeTexture(gl.TEXTURE0+index+2);
      ready.set(index,uploadTexture(gl,image));
      flags();
      gl.activeTexture(gl.TEXTURE0);
      redraw();
    } catch {
      if (version === generation) failed.add(index);
    } finally {
      if (version === generation) {
        gl.activeTexture(gl.TEXTURE0);
        activeRequest = null;
        loadFace();
      }
    }
  }
  function detail(view) {
    const next = visibleFaces(view);
    if (next.join()===wanted.join()) return;
    wanted = next;
    // Mantener una cara lateral al girar, con memoria acotada en el teléfono.
    for (const [i, texture] of ready) {
      if (ready.size<=4 || wanted.includes(i)) continue;
      bind(i+2,base); gl.deleteTexture(texture); ready.delete(i);
    }
    flags();
    clearTimeout(timer);
    timer = setTimeout(loadFace,100);
  }
  function endTravel() {
    gl.uniform1f(progress,1);
    bind(1,base);
    if (previous) gl.deleteTexture(previous);
    previous = null;
  }
  function move(image, nextDirectory, from, to) {
    // Preparar el destino antes de soltar ningún recurso de la estación visible.
    gl.activeTexture(gl.TEXTURE0);
    const next = uploadTexture(gl,image);
    endTravel();
    previous = base; base = next; directory = nextDirectory;
    resetFaces();
    bind(0,base); bind(1,previous);
    const [east,north] = meters(from.point,to.point);
    gl.uniform3f(loc('offsetWorld'),east,to.height-from.height,north);
    gl.uniform1f(loc('oldHeight'),from.height); gl.uniform1f(loc('newHeight'),to.height);
    gl.uniformMatrix3fv(loc('localToWorld'),false,basis(to));
    gl.uniformMatrix3fv(loc('worldToOld'),false,transpose(basis(from)));
    gl.uniformMatrix3fv(loc('worldToNew'),false,transpose(basis(to)));
  }
  resetFaces(); endTravel();
  return {
    detail, move, endTravel,
    progress: t => gl.uniform1f(progress,t),
    dispose() {resetFaces(); endTravel(); gl.deleteTexture(base);}
  };
}
