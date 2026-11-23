import {arrivalPose, walkRenderer, walkShader} from './recorrido-paseo.mjs';

// Visor de medios propios. No registra visitas ni modifica la cámara del recorrido.
export function openMediaViewer(items, {title = 'Imágenes del proyecto', onClose, start = 0, context = 'admin'} = {}) {
  if (!items?.length) return null;
  const dialog = document.createElement('dialog');
  dialog.className = 'rm-viewer'+(context==='recorrido'?' rm-public':'');
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = '<header><div><small></small><h2></h2></div><button type="button" data-close aria-label="Volver al recorrido">Volver al recorrido ×</button></header><div class="rm-stage"></div><div class="rm-caption"><strong></strong><p></p><p role="status"></p></div><nav aria-label="Imágenes"><button type="button" data-prev aria-label="Imagen anterior">← Anterior</button><span></span><button type="button" data-next aria-label="Imagen siguiente">Siguiente →</button></nav>';
  const closeLabel=context==='recorrido'?'Volver al recorrido':'Cerrar vista previa';
  dialog.querySelector('[data-close]').textContent=closeLabel+' ×';dialog.querySelector('[data-close]').setAttribute('aria-label',closeLabel);
  document.body.append(dialog);
  const previousFocus = document.activeElement, stage = dialog.querySelector('.rm-stage');
  let current = Math.max(0, Math.min(start, items.length - 1)), cleanup = () => {}, disposed = false;
  const status = dialog.querySelector('[role=status]');
  function show() {
    cleanup(); cleanup = () => {}; stage.replaceChildren(); status.textContent = '';
    const media = items[current];
    dialog.querySelector('header small').textContent = title;
    dialog.querySelector('h2').textContent = media.titulo || (media.tipo === 'panorama' ? 'Panorámica 360°' : 'Fotografía');
    dialog.querySelector('.rm-caption strong').textContent = media.descripcion || '';
    const viewLabel={'referencia':'Referencia del lugar','aerea':'Vista aérea orientada al lote','desde-lote':'Captura tomada desde el lote'}[media.vista];
    dialog.querySelector('.rm-caption p').textContent = [viewLabel,media.fecha, media.autor && 'Foto: ' + media.autor].filter(Boolean).join(' · ');
    dialog.querySelector('nav span').textContent = `${current + 1} / ${items.length}`;
    dialog.querySelector('[data-prev]').disabled = current === 0;
    dialog.querySelector('[data-next]').disabled = current === items.length - 1;
    if (media.tipo === 'panorama') cleanup = mountPanorama(stage, media, status);
    else {
      const img = new Image(); img.alt = media.descripcion || media.titulo || title;
      img.onload = () => { if (!disposed) status.textContent = ''; };
      img.onerror = () => { if (!disposed) status.textContent = 'No se pudo cargar esta foto. Puede elegir otra o volver al recorrido.'; };
      status.textContent = 'Cargando foto…'; img.src = media.url; stage.append(img);
      cleanup = () => { img.onload = img.onerror = null; img.removeAttribute('src'); };
    }
  }
  const move = delta => { const next = current + delta; if (next >= 0 && next < items.length) { current = next; show(); } };
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-prev]').onclick = () => move(-1);
  dialog.querySelector('[data-next]').onclick = () => move(1);
  dialog.addEventListener('keydown', e => {
    // Las flechas sobre el panorama giran; fuera de él cambian de imagen.
    if (e.target.tagName === 'CANVAS') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); move(e.key === 'ArrowLeft' ? -1 : 1); }
  });
  dialog.addEventListener('close', () => {
    if (disposed) return; disposed = true; cleanup(); dialog.remove();
    previousFocus?.isConnected && previousFocus.focus({preventScroll: true}); onClose?.();
  }, {once: true});
  dialog.showModal(); show();
  return dialog;
}

// The base texture remains bound until the higher-resolution image is usable.
export function upgradePanoramaTexture(gl,url,base,onReady,onFailure){
 const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
 if(!url||limit<8192)return;
 const image=new Image();image.crossOrigin='anonymous';
 const release=()=>{image.onload=image.onerror=null;image.removeAttribute('src')};
 image.onerror=()=>{release();onFailure()};
 image.onload=()=>{
  if(Math.abs(image.naturalWidth/image.naturalHeight-2)>.02||image.naturalWidth>limit){
   release();onFailure();return;
  }
  const active=gl.getParameter(gl.ACTIVE_TEXTURE);
  let next;
  try{
   next=gl.createTexture();
   if(!next)throw Error('texture');
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,next);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
   if(gl.getError()!==gl.NO_ERROR)throw Error('texture');
  }catch{
   if(next)gl.deleteTexture(next);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,base);
   onFailure();return;
  }finally{gl.activeTexture(active);release()}
  gl.deleteTexture(base);onReady(next);
 };
 image.src=url;
 return release;
}

export function mountPanorama(stage, media, status, onView, sky, {focusOnReady=true, prepared, reuse, keepDirection=true}={}) {
  if (reuse?.setStation && prepared) {
    try {
      reuse.setStation(media,prepared,onView,keepDirection);
      return reuse;
    } catch {
      reuse();
      stage.querySelectorAll(':scope > canvas,:scope > .rm-pan-tools').forEach(el=>el.remove());
    }
  }
  function setPanoramaState(state, message) {
    status.dataset.panoramaState = state;
    status.textContent = message;
  }
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Panorámica 360°. Arrastre o use las flechas para girar.');
  const gl = canvas.getContext('webgl', {alpha: false, antialias: false});
  if (!gl) { setPanoramaState('error', 'Este dispositivo no pudo abrir el visor 360°. Puede volver al recorrido.'); return () => {}; }
  let inlineTurn,inlineZoom;
  let disposed = false, observer, program, texture, buffer, shaders = [], image = prepared || new Image(), cancelDetail;
  let walk, travelFrame = 0, moving = false, finishMovement;
  let yaw = (Number(media.orientacion) || 0) * Math.PI / 180, pitch = (Number(media.pitch)||0)*Math.PI/180, fov = media.fov || .8, drag, pinch=0;const pointers=new Map();
  stage.append(canvas); setPanoramaState('loading', 'Cargando panorámica…');
  let drawSky, skyPending, skyLoaded = false, skyRequested = false;
  const skyTextures = [];
  const cleanup = () => {
    if(inlineTurn)canvas.removeEventListener('mw-inline-turn',inlineTurn);if(inlineZoom)canvas.removeEventListener('mw-inline-zoom',inlineZoom);
    disposed = true; image.onload = image.onerror = null;cancelDetail?.(); observer?.disconnect();
    canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onkeydown = canvas.onwheel = null;
    skyTextures.forEach(t => gl.deleteTexture(t));
    cancelAnimationFrame(travelFrame);
    delete stage.dataset.paseo;
    if (walk) walk.dispose(); else gl.deleteTexture(texture);
    gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed)setPanoramaState('error','El dispositivo interrumpió la vista 360°. Cierre y vuelva a abrir la panorámica.');});
  function initialize() {
    if (disposed) return;
    if (Math.abs(image.naturalWidth / image.naturalHeight - 2) > .02) { setPanoramaState('error', 'La imagen no es una panorámica esférica 2:1.'); return; }
    try {
      const shader = (type, source) => {
        const s = gl.createShader(type); shaders.push(s); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error('shader'); return s;
      };
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}'));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 v;
        uniform sampler2D photo, ridge, night, horizon;
        uniform float yaw,pitch,fov,aspect,blue,heading;
        ${media.paseo ? walkShader : ''}
        void main(){
          vec3 d=normalize(vec3(v.x*aspect*fov,v.y*fov,1.));
          d=vec3(d.x,d.y*cos(pitch)+d.z*sin(pitch),-d.y*sin(pitch)+d.z*cos(pitch));
          float az=atan(d.x,d.z)+yaw;
          float el=asin(clamp(d.y,-1.,1.));
          vec2 uv=vec2(fract(az/6.2831853+.5),.5-el/3.14159265);
          vec3 col=${media.paseo ? 'walkColor(vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el)),uv)' : 'texture2D(photo,uv).rgb'};
          ${media.paseo ? '' : `
          if(blue>.5){
            float k=texture2D(ridge,uv).r;
            float lon=fract((az+heading)/6.2831853+.5);
            vec3 stars=texture2D(night,vec2(lon,uv.y)).rgb;
            float air=clamp(exp(-el*2.5),0.,1.);
            vec3 upper=mix(vec3(.035,.07,.15),vec3(.18,.27,.43),air)
              +pow(max(stars-.015,vec3(0.)),vec3(1.25))*vec3(.62,.67,.78)*smoothstep(.07,.35,el);
            float hy=clamp(.72-(el-.045)*.53,.32,.76);
            vec3 low=texture2D(horizon,vec2(.04+lon*.96,hy)).rgb;
            low=mix(low,texture2D(horizon,vec2(max(0.,.04+lon*.96-.96),hy)).rgb,smoothstep(.92,1.,lon));
            col=mix(col*vec3(.84,.88,.97),mix(low,upper,smoothstep(.15,.45,el)),k);
          }
          `}
          gl_FragColor=vec4(col,1.);
        }`));
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('program');
      gl.useProgram(program); buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const max = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE)); let source = image;
      if (image.naturalWidth > max) {
        source = document.createElement('canvas'); source.width = max; source.height = Math.round(max / 2);
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      if (gl.getError() !== gl.NO_ERROR) throw Error('texture');
      const uniforms = Object.fromEntries(['yaw','pitch','fov','aspect'].map(k => [k, gl.getUniformLocation(program, k)]));
      const draw = () => {
        if (disposed) return;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(stage.clientWidth * dpr)), height = Math.max(1, Math.round(stage.clientHeight * dpr));
        if (canvas.width!==width || canvas.height!==height) {canvas.width=width; canvas.height=height;}
        gl.viewport(0, 0, canvas.width, canvas.height);
        Object.entries({yaw,pitch,fov,aspect:canvas.width/canvas.height}).forEach(([k,v]) => gl.uniform1f(uniforms[k],v));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (!moving) {
          walk?.detail({yaw,pitch,fov,aspect:width/height});
          onView?.({yaw,pitch,fov,width:stage.clientWidth,height:stage.clientHeight});
        }
      };
      cleanup.redraw = draw;
      cleanup.lookAt = (azimuth, elevation, field) => {
        finishMovement?.();
        yaw = azimuth;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, elevation));
        fov = Math.max(.25, Math.min(1.4, field));
        draw();
      };
      if (sky?.mask) {
        const skyAssets=[
          {url:sky.mask,unit:1,uniform:'ridge'},
          {url:'/assets/recorridos/alamos/cielo-via-lactea-eso.jpg',unit:2,uniform:'night'},
          {url:'/assets/recorridos/alamos/cielo-hora-azul-prueba.png',unit:3,uniform:'horizon'}
        ];
        async function loadTexture(url, unit, uniform) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          await img.decode();
          if (disposed) return;
          let pixels = img;
          if (img.width > max || img.height > max) {
            const factor = max / Math.max(img.width,img.height);
            pixels = document.createElement('canvas');
            pixels.width = Math.round(img.width*factor); pixels.height = Math.round(img.height*factor);
            pixels.getContext('2d').drawImage(img,0,0,pixels.width,pixels.height);
          }
          gl.activeTexture(gl.TEXTURE0 + unit);
          const tex = gl.createTexture();
          try {
            gl.bindTexture(gl.TEXTURE_2D,tex);
            for (const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);
            for (const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,pixels);
            if (gl.getError() !== gl.NO_ERROR) throw Error('sky texture');
            gl.uniform1i(gl.getUniformLocation(program,uniform),unit);
            skyTextures.push(tex);
          } catch(error) {
            gl.deleteTexture(tex);
            throw error;
          } finally {
            gl.activeTexture(gl.TEXTURE0);
          }
        }
        drawSky = async () => {
          if (skyRequested && !skyLoaded) {
            if(skyPending)return;
            skyPending=Promise.all(skyAssets.map(asset=>{
              asset.request??=loadTexture(asset.url,asset.unit,asset.uniform).catch(error=>{
                asset.request=null;
                throw error;
              });
              return asset.request;
            }));
            try { await skyPending; skyLoaded = true; }
            catch { if (!disposed && skyRequested) { skyRequested=false; sky.onError?.(); } return; }
            finally { skyPending=null; }
          }
          if (disposed) return;
          gl.uniform1f(gl.getUniformLocation(program,'blue'),skyRequested ? 1 : 0);
          gl.uniform1f(gl.getUniformLocation(program,'heading'),(sky.heading || 0)*Math.PI/180);
          draw();
          sky.onChange?.(skyRequested);
        };
        if (skyRequested) drawSky();
      }
      const turn = (x,y) => { yaw += x; pitch = Math.max(-1.45, Math.min(1.45, pitch + y)); draw(); };
      const distance=()=>{const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;};
      canvas.onpointerdown = e => {pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY};pinch=distance();canvas.setPointerCapture(e.pointerId);};
      canvas.onpointermove = e => {
        if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===2){const next=distance();if(pinch&&next)fov=Math.max(.25,Math.min(1.4,fov*pinch/next));pinch=next;drag=null;draw();}
        else if(drag){turn(-(e.clientX-drag.x)*.005,(e.clientY-drag.y)*.005);drag={x:e.clientX,y:e.clientY};}
      };
      canvas.onpointerup = canvas.onpointercancel = e => {pointers.delete(e.pointerId);pinch=0;drag=pointers.size===1?[...pointers.values()][0]:null;};
      canvas.onkeydown = e => { const moves = {ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]}; if (moves[e.key]) { e.preventDefault(); e.stopPropagation(); turn(...moves[e.key]); } };
      if(window.parent!==window&&new URLSearchParams(location.search).get('miniweb-auto')==='1'){inlineTurn=e=>turn(-(Number(e.detail?.delta)||0)*.005,0);inlineZoom=e=>{fov=Math.max(.25,Math.min(1.4,fov+Math.sign(Number(e.detail?.delta)||0)*.06));draw()};canvas.addEventListener('mw-inline-turn',inlineTurn);canvas.addEventListener('mw-inline-zoom',inlineZoom);}
      canvas.onwheel = e => { if(document.documentElement.dataset.mwInlineScroll==='page'&&!document.fullscreenElement&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey)return;e.preventDefault(); fov = Math.max(.25, Math.min(1.4, fov + Math.sign(e.deltaY)*.06)); draw(); };
      const tools = document.createElement('div'); tools.className = 'rm-pan-tools';
      tools.innerHTML = '<button type="button" aria-label="Girar a la izquierda">←</button><button type="button" aria-label="Girar a la derecha">→</button><button type="button" aria-label="Acercar panorámica">+</button><button type="button" aria-label="Alejar panorámica">−</button><button type="button">Restablecer vista</button>';
      [...tools.children].forEach((b,i) => b.onclick = () => { if (i<2) turn(i ? .2 : -.2,0); else if (i<4) { fov=Math.max(.25,Math.min(1.4,fov+(i===2?-.12:.12)));draw(); } else {yaw=(Number(media.orientacion)||0)*Math.PI/180;pitch=(Number(media.pitch)||0)*Math.PI/180;fov=media.fov || .8;draw();} });
      if (media.paseo) {
        walk=walkRenderer(gl,program,texture,media.paseo,draw);
        const finish = () => {
          cancelAnimationFrame(travelFrame);
          if (!moving) return;
          moving=false; walk.endTravel(); delete stage.dataset.paseo;
          stage.querySelector('.rg-overlay')?.removeAttribute('opacity');
          draw();
        };
        finishMovement=finish;
        cleanup.setStation = (next,preview,nextView,preserve) => {
          finish();
          const start=arrivalPose(media.pose,next.pose,{yaw,pitch,fov});
          const end=preserve ? start : {yaw:next.orientacion*Math.PI/180,pitch:next.pitch*Math.PI/180,fov:next.fov};
          const angle=Math.atan2(Math.sin(end.yaw-start.yaw),Math.cos(end.yaw-start.yaw));
          walk.move(preview,next.paseo,media.pose,next.pose);
          media=next; onView=nextView; drag=null; pointers.clear(); pinch=0;
          stage.append(canvas,tools);
          setPanoramaState('ready','Arrastre o use las flechas para explorar los 360°.');
          yaw=end.yaw; pitch=end.pitch; fov=end.fov;
          if (matchMedia('(prefers-reduced-motion: reduce)').matches) {walk.endTravel();draw();return;}
          const began=performance.now();
          moving=true; stage.dataset.paseo='avance';
          stage.querySelector('.rg-overlay')?.setAttribute('opacity','0');
          function step(now) {
            if (disposed || !moving) return;
            const fraction=Math.min(1,(now-began)/620);
            const t=fraction*fraction*(3-2*fraction);
            yaw=start.yaw+angle*t; pitch=start.pitch+(end.pitch-start.pitch)*t; fov=start.fov+(end.fov-start.fov)*t;
            walk.progress(t);
            if (fraction===1) {finish();return;}
            draw(); travelFrame=requestAnimationFrame(step);
          }
          step(began);
        };
        // Un gesto interrumpe el viaje y devuelve el control de inmediato.
        for (const event of ['pointerdown','wheel','keydown']) canvas.addEventListener(event,finish,{capture:true});
        tools.addEventListener('click',finish,{capture:true});
      }
      stage.append(tools); observer = new ResizeObserver(draw); observer.observe(stage); draw();
      setPanoramaState('ready', 'Arrastre o use las flechas para explorar los 360°.');
      if(focusOnReady)canvas.focus({preventScroll:true});
      // Only new uploads have an explicit optimized 8k URL. Existing projects
      // keep their original loading path. Swap the texture, never the camera.
      if(!walk&&media.alta&&media.alta!==media.url){
        cancelDetail=upgradePanoramaTexture(gl,media.alta,texture,next=>{texture=next;draw()},()=>{status.textContent='La vista 4k sigue disponible. No se pudo cargar la versión de mayor detalle.'});
      }
    } catch { setPanoramaState('error', 'No se pudo abrir el visor 360°. Puede elegir otro medio o volver al recorrido.'); }
  }
  cleanup.setSky = enabled => { skyRequested=enabled; drawSky?.(); };
  if (prepared) {
    initialize();
    if (media.paseo && status.dataset.panoramaState==='error') {
      cleanup(); canvas.remove();
      return mountPanorama(stage,{...media,paseo:null},status,onView,sky,{focusOnReady,prepared});
    }
  }
  else {
    image.crossOrigin = 'anonymous';
    image.onerror = () => { if (!disposed) setPanoramaState('error', 'No se pudo cargar la panorámica. Revise el archivo o el permiso de acceso a la imagen.'); };
    image.onload = initialize;
    image.src = media.url;
  }
  return cleanup;
}
