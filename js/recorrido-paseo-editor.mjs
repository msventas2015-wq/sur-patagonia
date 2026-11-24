import {walkFiles} from './recorrido-paseo.mjs?v=20261124-paseo';
import {validTerrainContours} from './recorrido-detalle-terreno.mjs?v=20261124-paseo';

// The axes are the same as scripts/preparar-paseo-360.py and the visitor's shader.
export function cubeDirection(face,x,y) {
  switch(face) {
    case 'px': return [1,-y,-x];
    case 'nx': return [-1,-y,x];
    case 'py': return [x,1,y];
    case 'ny': return [x,-1,-y];
    case 'pz': return [x,-y,1];
    case 'nz': return [-x,-y,-1];
    default: throw Error('Cara desconocida.');
  }
}

export async function storeWalkFiles(parts,store) {
  const files={};
  for await (const [key,file] of parts) files[key]=await store(file,'web');
  if (!walkFiles.every(key=>files[key])) throw Error('Faltan imágenes para completar la estación.');
  return files;
}

function canvas(width,height) {
  const c=document.createElement('canvas');
  c.width=width; c.height=height;
  return c;
}

async function imageFile(c,name,quality) {
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',quality));
  if (!blob) throw Error('El navegador no pudo preparar la imagen.');
  return new File([blob],name+(blob.type==='image/webp'?'.webp':'.png'),{type:blob.type});
}

export async function* prepareWalkImages(camera,progress) {
  const image=new Image();
  image.crossOrigin='anonymous';
  image.src=camera.alta || camera.url;
  await image.decode();
  if (Math.abs(image.width/image.height-2)>.02) throw Error('La foto tiene que ser una panorámica esférica 2:1.');
  const w=Math.min(8192,image.width), h=Math.round(image.height*w/image.width);
  const source=canvas(w,h);
  const ctx=source.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h).data;
  image.removeAttribute('src');
  const vw=Math.min(1536,w);
  const preview=canvas(vw,Math.round(h*vw/w));
  preview.getContext('2d').drawImage(source,0,0,preview.width,preview.height);
  source.width=source.height=1;
  yield ['vista',await imageFile(preview,'vista',.78)];
  const size=Math.max(1,Math.floor(w/4)), faceCanvas=canvas(size,size);
  const faceCtx=faceCanvas.getContext('2d'), rgba=faceCtx.createImageData(size,size);
  for(const [index,face] of walkFiles.slice(1).entries()) {
    progress('Preparando imagen '+(index+2)+' de 7…');
    for(let y=0;y<size;y++) {
      const py=2*(y+.5)/size-1;
      for(let x=0;x<size;x++) {
        const [right,up,forward]=cubeDirection(face,2*(x+.5)/size-1,py);
        const sx=(Math.atan2(right,forward)/(2*Math.PI)+.5)*w-.5;
        const sy=Math.max(0,Math.min(h-1,(.5-Math.atan2(up,Math.hypot(right,forward))/Math.PI)*h-.5));
        const ix=Math.floor(sx), iy=Math.floor(sy), ax=sx-ix, ay=sy-iy;
        const left=(ix+w)%w,rightX=(left+1)%w,bottom=Math.min(iy+1,h-1);
        const a=(iy*w+left)*4,b=(iy*w+rightX)*4,c=(bottom*w+left)*4,d=(bottom*w+rightX)*4;
        const out=(y*size+x)*4;
        for(let ch=0;ch<3;ch++) rgba.data[out+ch]=(1-ay)*((1-ax)*pixels[a+ch]+ax*pixels[b+ch])+ay*((1-ax)*pixels[c+ch]+ax*pixels[d+ch]);
        rgba.data[out+3]=255;
      }
      if(y%64===63) await new Promise(resolve=>setTimeout(resolve,0));
    }
    faceCtx.putImageData(rgba,0,0);
    yield [face,await imageFile(faceCanvas,face,.86)];
  }
}

export function editTerrainContours(camera,apply) {
  const dialog=document.createElement('dialog');
  dialog.className='rg-horizon';
  dialog.setAttribute('aria-label','Marcar objetos delante de los lotes');
  dialog.innerHTML='<h2>Objetos delante de los lotes</h2><p>Marcá el borde de un árbol, una casa u otro objeto sobre la foto y cerrá el contorno. Las líneas de los lotes quedarán detrás.</p><div class="rg-horizon-photo"><img alt="Panorámica de la estación"><svg viewBox="0 0 2048 1024" preserveAspectRatio="none"></svg></div><p role="status"></p><footer><button data-undo>Deshacer</button><button data-close-shape>Cerrar contorno</button><button data-cancel>Cancelar</button><button data-apply>Aplicar contornos</button></footer>';
  const q=s=>dialog.querySelector(s);
  const reuse=document.createElement('details');
  reuse.innerHTML='<summary>Reutilizar contornos trazados</summary><label>Contornos de esta panorámica (coordenadas 2048 × 1024)<textarea rows="3"></textarea></label><button type="button">Cargar contornos en la vista</button>';
  q('footer').before(reuse);
  const contours=structuredClone(camera.terrainContours||[]);
  let points=[];
  function draw(){
    const svg=q('svg');svg.replaceChildren();
    for(const [i,list] of [...contours,points].entries()) {
      const shape=document.createElementNS(svg.namespaceURI,i===contours.length?'polyline':'polygon');
      shape.setAttribute('points',list.map(p=>p.join(',')).join(' '));svg.append(shape);
    }
    q('[data-undo]').disabled=!contours.length&&!points.length;
    q('[data-close-shape]').disabled=points.length<3;
    q('[data-apply]').disabled=points.length>0;
    q('[role=status]').textContent=contours.length+' contornos cerrados · '+points.length+' puntos en edición';
  }
  const img=q('img');img.crossOrigin='anonymous';img.src=camera.url;
  q('.rg-horizon-photo').onclick=e=>{
    if (!img.naturalWidth) return;
    if (points.length>=512 || contours.length>=128 || contours.reduce((n,p)=>n+p.length,points.length)>=8192) {
      q('[role=status]').textContent='Se alcanzó el límite de puntos o contornos. Deshacé puntos para seguir editando.';return;
    }
    const bounds=e.currentTarget.getBoundingClientRect();
    points.push([Math.round((e.clientX-bounds.left)*2048/bounds.width),Math.round((e.clientY-bounds.top)*1024/bounds.height)]);
    draw();
  };
  q('[data-close-shape]').onclick=()=>{contours.push(points);points=[];draw();};
  reuse.querySelector('textarea').value=contours.length?JSON.stringify(contours):'';
  reuse.querySelector('button').onclick=()=>{
    try{
      const next=JSON.parse(reuse.querySelector('textarea').value);
      if(!validTerrainContours(next))throw Error();
      contours.splice(0,contours.length,...next);points=[];draw();
    }catch{q('[role=status]').textContent='Revisá los contornos. Cada figura lleva al menos tres puntos de la panorámica.';}
  };
  q('[data-undo]').onclick=()=>{if(!points.length)points=contours.pop();else points.pop();draw();};
  q('[data-apply]').onclick=()=>{apply(contours);dialog.close();};
  q('[data-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);draw();dialog.showModal();
}
