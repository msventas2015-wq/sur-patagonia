import {mobileTourViewport} from './miniweb-design.mjs';
import {projectTourUrl} from './recorrido-enlaces.mjs';

export function immediateImmersiveTour(config,project,block){
 return config.estilo==='inmersivo' && block?.tipo==='panoramica360' && block.variante==='recorrido'
  && !['alamos','aldea-los-huemules'].includes(project.slug) && Boolean(projectTourUrl(project,config));
}
// Keep the previous named export for an editor opened before this release.
export const immediateTerrazasTour=immediateImmersiveTour;
export const automatic360Enabled=(config,project,block)=>immediateImmersiveTour(config,project,block)||['estudio-vivo','relato','recorrido','manifiesto'].includes(config.estilo)&&project.slug!=='aldea-los-huemules';

export function interactiveSectionCopy(block,kind){
 const c=block?.contenido||{},selector=kind==='selector';
 return {title:String(Object.hasOwn(c,'titulo')?c.titulo??'':selector?'Elija su lote':'Recorrido inmersivo').trim(),help:String(Object.hasOwn(c,'texto')?c.texto??'':selector?'Toque un lote en el plano o en la lista para conocer sus características.':'').trim()};
}

// Resolve the page palette/fonts before an interactive section overrides them.
export function applyInteractiveHeadingStyle(heading,app){
 const style=app.ownerDocument.defaultView.getComputedStyle(app);
 for(const [token,source,fallback] of [['--section-title-font','--display',style.fontFamily],['--section-body-font','--sans',style.fontFamily],['--section-ink','--ink',style.color],['--section-copy-ink','--muted',style.color]])heading.style.setProperty(token,style.getPropertyValue(source).trim()||fallback);
}

// Keep trackpad inertia on the axis chosen at the start of each gesture.
export function wheelGestureAxis(now=()=>performance.now()){
 let axis='',last=-Infinity;
 return event=>{
  const time=now();if(time-last>=150)axis='';last=time;
  if(event.shiftKey){axis='';return 'zoom'}
  if(event.ctrlKey||event.metaKey){axis='';return 'zoom'}
  if(!axis)axis=Math.abs(event.deltaX)>Math.abs(event.deltaY)?'turn':'page';
  return axis;
 };
}

// The same gesture contract applies outside and inside an inline iframe.
export function bridgeInlineWheel(target,stage,{fullscreen=()=>!!stage.ownerDocument.fullscreenElement||stage.matches(':fullscreen')||stage.classList.contains('tour-expanded'),onHorizontal,onZoom}={}){
 const lifecycle=new AbortController(),{signal}=lifecycle,doc=stage.ownerDocument,win=doc.defaultView,axis=wheelGestureAxis();
 let shown=false,timer,hint;
 const dispatch=(type,delta,event)=>{
  const canvas=event.target.closest?.('canvas')||target.querySelector?.('canvas[data-f="ov"]')||target.querySelector?.('.rg-tour canvas')||target.querySelector?.('canvas');
  if(canvas){const owner=canvas.ownerDocument.defaultView;canvas.dispatchEvent(new owner.CustomEvent(type,{detail:{delta}}))}
 };
 target.addEventListener('wheel',event=>{
  if(fullscreen())return;
  if(!shown){shown=true;hint=doc.createElement('p');hint.className='inline-wheel-hint';hint.setAttribute('role','status');hint.textContent='Shift + rueda para acercar';stage.append(hint);timer=win.setTimeout(()=>{hint?.remove();hint=null},2000)}
  const modified=event.shiftKey||event.ctrlKey||event.metaKey;
  if(!modified&&!onZoom&&!onHorizontal&&event.target.closest?.('.hz-pop,.hz-card,.hz-player,.hz-layers'))return;
  const mode=axis(event);
  // Ordinary vertical wheel belongs entirely to the browser, including iframe chaining.
  if(mode==='page')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(mode==='turn'){const unit=event.deltaMode===1?16:event.deltaMode===2?win.innerHeight:1,delta=event.deltaX*unit;if(onHorizontal)onHorizontal(delta,event);else dispatch('mw-inline-turn',delta,event);return}
  const delta=event.shiftKey?(Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX):(event.deltaY||event.deltaX);
  if(onZoom)onZoom(delta,event);else dispatch('mw-inline-zoom',delta,event);
 },{capture:true,passive:false,signal});
 return ()=>{lifecycle.abort();win.clearTimeout(timer);hint?.remove()};
}

function fallback(stage,source,alt,message){
 stage.classList.add('auto-360-failed');stage.replaceChildren();
 if(source){const image=document.createElement('img');image.className='panorama-fallback';image.src=source;image.alt=alt||'Imagen de respaldo del proyecto';stage.append(image)}
 const status=document.createElement('p');status.className='auto-360-status';status.setAttribute('role','status');status.textContent=message;stage.append(status);
}

// Only the new inline entry uses this bridge. The original viewer keeps its
// controls and free gestures in fullscreen; vertical inline swipes scroll the page.
export function bridgeVerticalTouch(doc,childWindow,stage,fullscreen=()=>stage.matches(':fullscreen')||stage.classList.contains('tour-expanded')){
 const lifecycle=new AbortController(),{signal}=lifecycle;let touch;
 const inline=()=>!fullscreen();
 doc.addEventListener('touchstart',event=>{
  if(!inline()||event.touches.length!==1||!event.target.closest('canvas,svg')||event.target.closest('button,a,input,select,textarea')){touch=null;return}
  const point=event.touches[0];touch={x:point.clientX,y:point.clientY,axis:null,cancelled:false};
 },{capture:true,passive:true,signal});
 doc.addEventListener('pointermove',event=>{
  if(!touch||!inline()||event.pointerType==='mouse')return;
  if(!touch.axis){
   const dx=Math.abs(event.clientX-touch.x),dy=Math.abs(event.clientY-touch.y);
   if(Math.max(dx,dy)<6){event.stopImmediatePropagation();return}
   touch.axis=dy>=dx?'vertical':'horizontal';
  }
  if(touch.axis!=='vertical')return;event.stopImmediatePropagation();
  if(!touch.cancelled){touch.cancelled=true;event.target.dispatchEvent(new childWindow.PointerEvent('pointercancel',{bubbles:true,pointerId:event.pointerId,pointerType:event.pointerType}))}
 },{capture:true,signal});
 for(const event of ['touchend','touchcancel'])doc.addEventListener(event,()=>touch=null,{capture:true,passive:true,signal});
 return ()=>lifecycle.abort();
}

// The button lives with the viewer controls. The parent owns the fullscreen iframe.
function mountViewerFullscreen(frame,nav,signal,readingPosition){
 const doc=nav.ownerDocument,owner=frame.ownerDocument,root=frame.getRootNode();
 const stage=frame.closest('.tour-embed'),win=owner.defaultView;
 let returnPoint=null;
 const button=doc.createElement('button'),notice=doc.createElement('p');
 button.type='button';button.className='rg-fullscreen';
 notice.className='rg-fullscreen-notice';notice.hidden=true;notice.setAttribute('role','alert');
 nav.append(button);nav.after(notice);
 const active=()=>root.fullscreenElement===frame||stage.classList.contains('tour-expanded');
 const sync=()=>{
  const label=active()?'Salir de pantalla completa':'Pantalla completa';
  button.textContent=label;button.setAttribute('aria-pressed',String(active()));
  notice.hidden=true;
 };
 function collapse(){
  if(!returnPoint)return;
  if(stage.hasAttribute('popover')){
   if(stage.matches(':popover-open'))stage.hidePopover();
   stage.removeAttribute('popover');
  }
  stage.classList.remove('tour-expanded');
  win.scrollTo({left:returnPoint.x,top:returnPoint.y,behavior:'instant'});
  returnPoint=null;
  sync();
 }
 function expandInPage(){
  returnPoint=readingPosition();
  stage.classList.add('tour-expanded');
  if(stage.showPopover){
   stage.setAttribute('popover','manual');
   stage.showPopover();
  }
  const box=stage.getBoundingClientRect();
  if(Math.abs(box.left)>2||Math.abs(box.top)>2||box.width+2<win.innerWidth||box.height+2<(win.visualViewport?.height||win.innerHeight)){
   throw Error('El marco no cubrió la ventana');
  }
  button.focus({preventScroll:true});
  sync();
 }
 function escape(event){
  if(returnPoint&&event.key==='Escape'){event.preventDefault();collapse()}
 }
 doc.addEventListener('keydown',escape,{signal});
 owner.addEventListener('keydown',escape,{signal});
 stage.addEventListener('miniweb-tour-collapse',collapse,{signal});
 signal.addEventListener('abort',collapse,{once:true});
 sync();frame.addEventListener('fullscreenchange',sync,{signal});
 button.addEventListener('click',async()=>{
  try{
   if(returnPoint)collapse();
   else if(active())await owner.exitFullscreen();
   else if(owner.fullscreenEnabled!==false&&typeof frame.requestFullscreen==='function')await frame.requestFullscreen();
   else expandInPage();
  }catch{
   collapse();
   sync();notice.textContent='El navegador no pudo cambiar a pantalla completa.';
   notice.hidden=false;
  }
 },{signal});
}

const activeTouchView=new WeakMap();

// The parent owns these controls so they also work while the iframe is inert
// and a swipe on the photo belongs to the surrounding page.
function mountMobileTourInfo(stage, frame, signal) {
 const page = stage.ownerDocument;
 const viewer = frame.contentDocument;
 const layer = page.createElement('div');
 layer.className = 'tour-photo-info';
 layer.hidden = true;
 const controls = page.createElement('div');
 controls.className = 'tour-photo-tools';
 const stations = page.createElement('select');
 stations.className = 'tour-mobile-stations';
 stations.setAttribute('aria-label', 'Estación del recorrido');
 function stepButton(label, path, selector) {
  const button = page.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  const ns='http://www.w3.org/2000/svg';
  const icon=page.createElementNS(ns,'svg'),line=page.createElementNS(ns,'path');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  line.setAttribute('d',path);icon.append(line);button.append(icon);
  button.addEventListener('click', () => source(selector)?.click(), {signal});
  return button;
 }
 const previous = stepButton('Vista anterior', 'M20 12H4m7-7-7 7 7 7', '[data-prev]');
 const next = stepButton('Vista siguiente', 'M4 12h16m-7-7 7 7-7 7', '[data-next]');
 const stationControl = page.createElement('label');
 stationControl.className = 'tour-photo-station';
 const caption = page.createElement('span');
 caption.setAttribute('aria-hidden','true');
 stationControl.append(caption,stations);
 controls.append(previous, stationControl, next);
 layer.append(controls);
 stage.append(layer);
 const details = page.createElement('details');
 details.className = 'tour-photo-details';
 details.hidden = true;
 const summary = page.createElement('summary');
 summary.textContent = 'Detalles del recorrido';
 const legend = page.createElement('div');
 details.append(summary, legend);
 stage.after(details);
 let lastKey;
 const source = selector => viewer.querySelector('.rg-tour ' + selector);
 function text(element, value) {
  if (element.textContent !== value) element.textContent = value;
 }
 stations.addEventListener('change', () => {
  const original = source('footer select');
  if (!original) return;
  original.value = stations.value;
  original.dispatchEvent(new frame.contentWindow.Event('change', {bubbles:true}));
 }, {signal});
 function section(title, badges) {
  if (!badges.length) return;
  const row = page.createElement('div');
  const label = page.createElement('strong');
  label.textContent = title;
  row.append(label);
  for (const badge of badges) {
   const copy = page.createElement('span');
   copy.textContent = badge.textContent;
   copy.style.setProperty('--lot-fill', badge.style.getPropertyValue('--lot-fill'));
   if (badge.hasAttribute('data-zone-off')) copy.dataset.zoneOff = 'true';
   row.append(copy);
  }
  legend.append(row);
 }
 return {
  sync(enabled) {
   const original = enabled && source('footer select');
   if (!original) { layer.hidden = true; details.hidden = true; return; }
   const key = source('.rg-identity .rg-sale-key');
   const hasZones = key?.querySelector('.rg-state-key');
   if (lastKey !== key) {
    lastKey = key;
    legend.replaceChildren();
    if (key) {
     if (hasZones) section('Zonas de venta', key.querySelectorAll(':scope > span'));
     section('Disponibilidad', (hasZones || key).querySelectorAll(':scope > span'));
    }
   }
   details.hidden = !legend.childElementCount || stage.hasAttribute('data-photo-expanded');
   layer.hidden = !!source('.rg-card:not([hidden]),.rg-atlas:not([hidden]),.rg-locator:not([hidden])');
   if (stations.options.length !== original.options.length) {
    stations.replaceChildren(...Array.from(original.options, opt => new Option(opt.text, opt.value)));
   }
   previous.disabled = original.selectedIndex <= 0;
   next.disabled = original.selectedIndex >= original.options.length - 1;
   previous.hidden = next.hidden = original.options.length < 2;
   stations.value = original.value;
   text(caption,original.selectedOptions[0]?.text || "");
   stationControl.hidden = original.options.length < 2;
   stations.hidden = original.options.length < 2;
  },
  dispose() { layer.remove(); details.remove(); }
 };
}

function mountTouchExplorer(stage,frame,fullscreen,signal,tapTour=false,previewDevice=''){
 const media=window.matchMedia('(pointer: coarse)');
 const doc=frame.contentDocument,bar=document.createElement('div'),button=document.createElement('button'),hint=document.createElement('span');
 bar.className='tour-touch-bar';button.type='button';bar.append(button,hint);stage.prepend(bar);
 const page=stage.ownerDocument,win=page.defaultView,scrollLock=page.createElement('style');
 const mobile=win.matchMedia('(max-width: 760px)');
 const usePhoto=()=>tapTour&&mobileTourViewport(win.innerWidth,media.matches,previewDevice);
 const mobileInfo=tapTour?mountMobileTourInfo(stage,frame,signal):null;
 function syncStations(){
  mobileInfo?.sync(usePhoto()&&!fullscreen());
 }
 let exploring=false,origin;
 function releasePage(){
  if(!origin)return;
  if(stage.hasAttribute('data-photo-expanded')){
   if(stage.hasAttribute('popover')){
    if(stage.matches(':popover-open'))stage.hidePopover();
    stage.removeAttribute('popover');
   }
   delete stage.dataset.photoExpanded;
  }
  scrollLock.remove();
  win.scrollTo({left:origin.x,top:origin.y,behavior:'instant'});
  origin=null;
  activeTouchView.delete(page);
 }
 function leave(){exploring=false;sync()}
 function lockPage(){
  if(origin)return;
  origin={x:win.scrollX,y:win.scrollY};
  // Un desplazamiento con inercia puede continuar después de ocultar el scroll.
  // El cuerpo conserva la posición visible hasta que se suelta la cámara.
  scrollLock.textContent=`:root{overflow:hidden!important;overscroll-behavior:none!important}
body{position:fixed!important;top:${-origin.y}px!important;left:${-origin.x}px!important;right:${origin.x}px!important;bottom:auto!important}`;
  page.head.append(scrollLock);
  if(usePhoto()){
   stage.setAttribute('data-photo-expanded','');
   if(stage.showPopover){stage.setAttribute('popover','manual');stage.showPopover();}
  }
  activeTouchView.set(page,leave);
 }
 function sync(){
  if(!usePhoto()&&stage.hasAttribute('data-photo-expanded'))exploring=false;
  const enabled=(media.matches||previewDevice==='mobile')&&!fullscreen();
  if(!enabled)exploring=false;
  bar.hidden=!enabled||(usePhoto()&&exploring);
  stage.toggleAttribute('data-photo-touch',usePhoto());
  doc.documentElement.toggleAttribute('data-photo-touch',usePhoto());
  if(enabled)stage.dataset.touchMode=exploring?'explore':'page';else delete stage.dataset.touchMode;
  doc.documentElement.toggleAttribute('data-touch-exploring',enabled&&exploring);
  frame.inert=enabled&&!exploring;
  if(exploring)lockPage();else releasePage();
  button.setAttribute('aria-pressed',String(exploring));
  button.textContent=exploring?'Salir de explorar':'Explorar 360°';
  hint.textContent=exploring?'Dos dedos para zoom':'Tocá para mirar alrededor';
  syncStations();
 }
 function toggle(){
  if(exploring){leave();return}
  activeTouchView.get(page)?.();
  if(!usePhoto())button.scrollIntoView({block:'nearest',behavior:'instant'});
  exploring=true;
  sync();
 }
 button.addEventListener('click',toggle,{signal});
 stage.addEventListener('click',event=>{
  if(event.target===stage&&stage.dataset.touchMode==='page')toggle();
 },{signal});
 const exitWithEscape=event=>{
  if(exploring&&event.key==='Escape'){event.preventDefault();exploring=false;sync();button.focus({preventScroll:true});}
 };
 doc.addEventListener('keydown',exitWithEscape,{signal});
 doc.addEventListener('recorrido-toque-fondo',()=>{if(exploring&&usePhoto())leave();},{signal});
 // La ficha de un lote vendido pide ver los disponibles: se sale del panorama y se avisa al selector de la misma miniweb.
 doc.addEventListener('recorrido-ver-disponibles',()=>{if(exploring)leave();stage.dispatchEvent(new CustomEvent('mw-ver-disponibles',{bubbles:true,composed:true}));},{signal});
 stage.addEventListener('miniweb-tour-collapse',leave,{signal});
 bar.addEventListener('keydown',exitWithEscape,{signal});
 media.addEventListener('change',sync,{signal});
 mobile.addEventListener('change',sync,{signal});
 sync();
 return {sync,syncStations,enter(){if(stage.dataset.touchMode==='page')toggle()},exploring:()=>exploring,readingPosition:()=>origin||{x:win.scrollX,y:win.scrollY},dispose(){releasePage();frame.inert=false;delete stage.dataset.touchMode;delete stage.dataset.photoTouch;doc.documentElement.removeAttribute('data-photo-touch');doc.documentElement.removeAttribute('data-touch-exploring');mobileInfo?.dispose();bar.remove();}};
}

export function bridgeProjectBrochure(target,onBrochure,{signal,projectSlug}={}){
 if(typeof onBrochure!=='function')return;
 target.addEventListener('miniweb-brochure',event=>{
  if(event.detail?.projectSlug!==projectSlug || !event.detail?.lotId)return;
  event.preventDefault();
  event.detail.download=Promise.resolve().then(()=>onBrochure(event.detail.lotId));
 },{signal});
}

function mountInlineTour(entry,mountTourFrame,onBrochure){
 const {node,url,fallback:photo,alt}=entry,stage=node.querySelector('.tour-embed');
 const lifecycle=new AbortController(),{signal}=lifecycle;let disposed=false,failed=false,ready=false,hooked=false,pendingReady=false,childObserver,stageObserver,unbridge=()=>{};
 const status=document.createElement('p');status.className='auto-360-status';status.setAttribute('role','status');status.textContent='Cargando recorrido 360°…';
 const target=new URL(url,location.origin);target.searchParams.set('integrado','1');target.searchParams.set('miniweb-auto','1');
 if(entry.previewDevice==='mobile')target.searchParams.set('miniweb-preview','mobile');
 target.searchParams.set('miniweb-brochure',entry.brochure===false?'off':typeof onBrochure==='function'?'1':'0');
 if(entry.immediate)target.searchParams.set('interfaz','inmersivo');
 let frame,timer,touchExplorer,pendingLot;
 function openLot(lotId){
  if(disposed || failed)return false;
  if(!ready){pendingLot=lotId;return true}
  status.remove();
  const viewer=frame.contentDocument?.querySelector('.rg-tour[open]');
  if(!viewer)return false;
  const request=new frame.contentWindow.CustomEvent('miniweb-abrir-lote',{cancelable:true,detail:{lotId}});
  if(viewer.dispatchEvent(request))return false;
  touchExplorer?.enter();
  viewer.querySelector('.rg-card:not([hidden]) .rg-card-x')?.focus({preventScroll:true});
  return true;
 }
 if(entry.previewTour && target.origin===location.origin && target.pathname.replace(/\.html$/, '')==='/recorrido'){
  target.searchParams.set('miniweb-borrador','1');
  stage.addEventListener('miniweb-leer-recorrido',event=>{
   if(event.target!==frame || event.detail?.slug!==target.searchParams.get('proyecto'))return;
   event.detail.preview=entry.previewTour();
  },{signal});
 }

 const fail=()=>{if(disposed||failed)return;failed=true;delete stage.dataset.loaded;clearTimeout(timer);childObserver?.disconnect();stageObserver?.disconnect();unbridge();frame?.remove();fallback(stage,photo,alt,'No se pudo cargar el recorrido. Se muestra la imagen de respaldo.')};
 const markReady=()=>{if(disposed||failed||ready)return;if(!hooked){pendingReady=true;return}ready=true;clearTimeout(timer);status.remove();frame.style.visibility='';const expand=stage.querySelector('.tour-expand');if(expand)expand.style.visibility='';stage.dataset.loaded='true';
  if(pendingLot){
   const id=pendingLot;pendingLot=null;
   if(!openLot(id)){
    status.textContent='Este lote ya no está vinculado al recorrido.';
    stage.append(status);
   }
  }
 };
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;if(event.data?.type==='mw-tour-ready')markReady();if(event.data?.type==='mw-tour-error')fail()},{signal});
 frame=mountTourFrame(stage,target);frame.style.visibility='hidden';const expand=stage.querySelector('.tour-expand');if(expand)expand.style.visibility='hidden';stage.append(status);
 frame.addEventListener('error',fail,{signal});
 frame.addEventListener('load',()=>{
  if(disposed||failed)return;
  childObserver?.disconnect();stageObserver?.disconnect();unbridge();
  try{
   const doc=frame.contentDocument,w=frame.contentWindow;if(!doc?.body)throw Error('frame');
   const style=doc.createElement('style');style.textContent='#sp-staging-badge{display:none!important}html[data-mw-inline-scroll=page],html[data-mw-inline-scroll=page] body,html[data-mw-inline-scroll=page] .f-root{overscroll-behavior:auto!important}html[data-mw-inline-scroll=page] :is(canvas,.rg-stage,.rg-overlay){touch-action:pan-y!important;overscroll-behavior-y:auto!important}';doc.head.append(style);
   const fullscreen=()=>frame.matches(':fullscreen')||stage.matches(':fullscreen')||stage.classList.contains('tour-expanded');
   const frameLifecycle=new AbortController(),frameSignal=frameLifecycle.signal;
   if(entry.brochure!==false)bridgeProjectBrochure(doc,onBrochure,{signal:frameSignal,projectSlug:target.searchParams.get('proyecto')});
   doc.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.('a[target="_top"]');
    if(!link)return;
    const destination=new URL(link.href,location.href);
    if(destination.origin!==location.origin||destination.hash!=='#consulta-lote')return;
    const request=new CustomEvent('miniweb-consulta',{detail:{href:destination.href},bubbles:true,composed:true,cancelable:true});
    if(!stage.dispatchEvent(request))event.preventDefault();
   },{signal:frameSignal});
   touchExplorer=mountTouchExplorer(stage,frame,fullscreen,frameSignal,entry.immediate&&entry.tapTour,entry.previewDevice);
   style.textContent+='html[data-touch-exploring][data-mw-inline-scroll=page] :is(canvas,.rg-stage,.rg-overlay){touch-action:none!important}';
   const sync=()=>{doc.documentElement.dataset.mwInlineScroll=fullscreen()?'full':'page';touchExplorer.sync();};sync();stage.addEventListener('fullscreenchange',sync,{signal:frameSignal});
   // In the embedded immersive tour only the modified wheel reaches the zoom bridge.
   // Other wheel gestures retain their browser default.
   if(entry.immediate){
    doc.addEventListener('wheel',event=>{
     if(!event.shiftKey && !doc.fullscreenElement && doc.documentElement.dataset.mwInlineScroll==='page')event.stopImmediatePropagation();
    },{capture:true,passive:true,signal:frameSignal});
    style.textContent+='html[data-mw-inline-scroll=page],html[data-mw-inline-scroll=page] body{overflow:hidden!important}';
   }
   stageObserver=new MutationObserver(sync);stageObserver.observe(stage,{attributes:true,attributeFilter:['class']});const untouch=bridgeVerticalTouch(doc,w,stage,()=>fullscreen()||touchExplorer.exploring()),unwheel=bridgeInlineWheel(doc,stage,{fullscreen:()=>!!doc.fullscreenElement||fullscreen()});unbridge=()=>{frameLifecycle.abort();untouch();unwheel();touchExplorer.dispose()};
   const inspect=()=>{
    touchExplorer.syncStations();
    if(entry.immediate){
     const nav=doc.querySelector('.rg-tour .rg-actions');
     if(nav&&!nav.querySelector('.rg-fullscreen'))mountViewerFullscreen(frame,nav,frameSignal,touchExplorer.readingPosition);
    }
    const panoramaState=doc.querySelector('.rg-tour > [data-panorama-state]')?.dataset.panoramaState;
    if(panoramaState){
     if(panoramaState==='ready')markReady();
     if(panoramaState==='error')fail();
     return;
    }
    // El visor aéreo comunica su carga y sus fallos mediante mw-tour-ready/error.
    // Sus avisos de fotos o materiales opcionales también usan role=status.
    if(doc.querySelector('canvas[data-f=gl]'))return;
    const messages=[...doc.querySelectorAll('[role=status]')].map(el=>el.textContent).join(' ');
    if(/No se pudo|no puede mostrar|no pudo abrir|no tiene un recorrido|no es una panorámica/i.test(messages)){fail();return}
    if(doc.querySelector('.rg-tour canvas')&&/Arrastre|explorar los 360/i.test(messages))markReady();
   };
   hooked=true;childObserver=new MutationObserver(inspect);childObserver.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','data-panorama-state']});inspect();if(pendingReady)markReady();
  }catch{fail()}
 },{signal});
 timer=setTimeout(()=>{if(!ready)fail()},35000);
 return {openLot,dispose(){disposed=true;lifecycle.abort();clearTimeout(timer);childObserver?.disconnect();stageObserver?.disconnect();unbridge();frame.remove()}};
}

export function observeAutomatic360(entries,{mountTourFrame,startPanorama,header,onBrochure}){
 const lifecycle=new AbortController(),{signal}=lifecycle,disposals=[],started=new Set(),tours=new Map();let disposed=false;
 const size=()=>{
  let top=0;if(header){const style=getComputedStyle(header);if(['fixed','sticky'].includes(style.position))top=header.getBoundingClientRect().height}
  const height='max(620px, calc(100svh - '+top+'px))';
  for(const entry of entries)if(entry.kind==='recorrido'){
   entry.node.style.setProperty('--auto-tour-height',height);
   if(entry.immediate)entry.node.style.setProperty('--inline-menu-height',(header?.getBoundingClientRect().height||0)+'px');
  }
 };
 for(const entry of entries)entry.node.dataset.auto360=entry.kind;
 const fitted=entries.filter(entry=>entry.immediate);
 fitted.forEach(entry=>entry.node.dataset.fitUnderMenu='true');
 const menuObserver=header && typeof ResizeObserver==='function'?new ResizeObserver(size):null;
 if(menuObserver)menuObserver.observe(header);
 size();window.addEventListener('resize',size,{signal});
 const start=entry=>{
  if(disposed||started.has(entry.node))return;started.add(entry.node);
  try{
   if(entry.kind==='recorrido'){
    const tour=mountInlineTour(entry,mountTourFrame,onBrochure);
    tours.set(entry,tour);disposals.push(tour.dispose);
   }
   else if(entry.url){disposals.push(startPanorama(entry.node,entry.url,{automatic:true,fallback:entry.fallback,alt:entry.alt,alta:entry.alta}));const stage=entry.node.querySelector('.panorama-stage');disposals.push(bridgeInlineWheel(stage,stage));}
   else fallback(entry.node.querySelector('.panorama-stage'),entry.fallback,entry.alt,'No se pudo cargar la panorámica. Se muestra la imagen de respaldo.');
  }catch{fallback(entry.node.querySelector('.tour-embed,.panorama-stage'),entry.fallback,entry.alt,'No se pudo cargar la experiencia 360°. Se muestra la imagen de respaldo.')}
 };
 for(const entry of entries.filter(item=>item.kind==='recorrido')){
  entry.node.addEventListener('miniweb-ir-al-lote',event=>{
   const destination=new URL(entry.url,location.origin);
   if(destination.pathname!=='/recorrido' || event.detail?.slug!==destination.searchParams.get('proyecto'))return;
   start(entry);
   if(tours.get(entry)?.openLot(event.detail.lotId))event.preventDefault();
  },{signal});
 }
 let observer;if(typeof IntersectionObserver==='function'){
  const byNode=new Map(entries.map(entry=>[entry.node,entry]));observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer.unobserve(item.target);start(byNode.get(item.target))}},{rootMargin:'800px 0px'});entries.forEach(entry=>entry.immediate?start(entry):observer.observe(entry.node));
 }else entries.forEach(start);
 return ()=>{disposed=true;lifecycle.abort();menuObserver?.disconnect();observer?.disconnect();disposals.forEach(dispose=>dispose?.());for(const entry of entries){delete entry.node.dataset.auto360;delete entry.node.dataset.fitUnderMenu;entry.node.style.removeProperty('--inline-menu-height');entry.node.style.removeProperty('--auto-tour-height')}};
}
