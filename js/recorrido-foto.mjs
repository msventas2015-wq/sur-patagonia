import {affine,gps,meters} from './recorrido-geografia.mjs?v=20261114-align1';
import {mapView,node} from './recorrido-escena.mjs?v=20261114-anillo7c';

// Dirección, 14-nov: the fourth pair checks the fit; it never defines it.
export const PHOTO_REGISTRATION_LIMITS=Object.freeze({preciseMeters:1,acceptableMeters:3});
export const photoNeedsReview=raster=>Number.isFinite(raster?.checkMeters)&&raster.checkMeters>PHOTO_REGISTRATION_LIMITS.acceptableMeters;
export function photoRegistration(pairs){
 const validPhoto=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1);
 const fit=pairs.slice(0,3);
 if(fit.length!==3||fit.some(p=>!p||!validPhoto(p.photo)||!gps(p.plan)))throw Error('Marcá los tres puntos en la foto y sus mismos lugares en el plano.');
 affine(fit.map(p=>p.plan),fit.map(p=>p.photo));
 const transform=affine(fit.map(p=>p.photo),fit.map(p=>p.plan)),corners=[[0,0],[1,0],[0,1]].map(transform);
 if(corners.some(p=>!gps(p)))throw Error('El calce queda fuera del plano. Revisá los tres pares de puntos.');
 const control=pairs[3];
 if(control&&(!validPhoto(control.photo)||!gps(control.plan)))throw Error('Completá el punto de control en ambas vistas o quitalo para seguir con tres puntos.');
 const projected=control?transform(control.photo):null,error=control?Math.hypot(...meters(projected,control.plan)):null;
 const assessment=error===null?'Tres puntos alineados · calce sin comprobar':error<=PHOTO_REGISTRATION_LIMITS.preciseMeters?'Calce preciso':error<=PHOTO_REGISTRATION_LIMITS.acceptableMeters?'Calce aceptable':'Revisá los puntos';
 return {corners,error,assessment,projected};
}

const NS='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
const copy=value=>JSON.parse(JSON.stringify(value));

export function openPhotoRegistration({url,scene,mapSales,onApply}){
 const life=new AbortController(),{signal}=life;
 const dialog=node('dialog',null,'rg-photo-registration');dialog.setAttribute('aria-label','Alinear la foto con el plano');
 const head=node('header'),title=node('h2','Alineá la foto con el plano'),intro=node('p','Marcá el mismo lugar en las dos vistas. Elegí tres puntos separados que formen un triángulo amplio.');head.append(title,intro);
 const tools=node('div',null,'rg-photo-tools'),content=node('div',null,'rg-photo-work'),pairsBar=node('div',null,'rg-photo-pairs');pairsBar.setAttribute('aria-label','Puntos de referencia');
 const guidance=node('p',null,'rg-photo-guidance');guidance.setAttribute('role','status');
 const panes=node('div',null,'rg-photo-panes'),report=node('div',null,'rg-photo-report'),assessment=node('strong'),deviation=node('p'),notice=node('p',null,'rg-photo-notice');notice.setAttribute('role','alert');report.setAttribute('aria-live','polite');report.append(assessment,deviation,notice);
 const footer=node('footer'),savedNote=node('p','Confirmar prepara el borrador. Después guardá el loteo para conservarlo.');
 const button=(text,action,className='')=>{const el=node('button',text,className);el.type='button';el.onclick=action;return el;};
 let busy=false,ready=false,active=0,pairs=[{},{},{}],past=[],future=[],opacity=.55,result=null,reviewAccepted=false;
 const cancel=button('Cancelar',()=>{if(!busy)dialog.close();}),confirm=button('Confirmar calce',async()=>{
  if(!ready||busy||!result)return;if(result.error>PHOTO_REGISTRATION_LIMITS.acceptableMeters&&!reviewAccepted){reviewMessage.textContent='El punto de control se desvía '+result.error.toLocaleString('es-AR',{maximumFractionDigits:1})+' m. ¿Confirmar igual?';reviewBox.hidden=false;confirm.disabled=true;reviewBack.focus();return;}busy=true;content.inert=true;confirm.disabled=true;cancel.disabled=true;undo.disabled=redo.disabled=true;notice.textContent='Preparando la foto…';
  try{await onApply({...result,pairs:copy(pairs)});dialog.close();}catch(error){busy=false;content.inert=false;cancel.disabled=false;render();notice.textContent=error.message||'No se pudo preparar la foto. Podés volver al editor y conservar el calce anterior.';}
 },'rg-photo-confirm');confirm.disabled=true;footer.append(savedNote,cancel,confirm);
 const snapshot=()=>({pairs:copy(pairs),active}),restore=state=>{pairs=copy(state.pairs);active=state.active;notice.textContent='';render();};
 const remember=()=>{past.push(snapshot());if(past.length>100)past.shift();future=[];};
 const undo=button('Deshacer',()=>{if(!past.length||busy)return;future.push(snapshot());restore(past.pop());}),redo=button('Rehacer',()=>{if(!future.length||busy)return;past.push(snapshot());restore(future.pop());});
 tools.append(undo,redo);head.append(tools);
 const overlayLabel=node('label','Superposición de la foto'),overlayInput=node('input');overlayInput.type='range';overlayInput.min='0';overlayInput.max='100';overlayInput.value='55';overlayInput.setAttribute('aria-label','Opacidad de la foto sobre el plano');overlayLabel.append(overlayInput);report.append(overlayLabel);
 overlayInput.oninput=()=>{opacity=Number(overlayInput.value)/100;overlay.style.opacity=String(opacity);};
 const reviewBox=node('div',null,'rg-photo-warning'),reviewMessage=node('p'),reviewActions=node('div'),reviewBack=button('Volver a revisar',()=>{reviewBox.hidden=true;confirm.disabled=false;plan.svg.focus({preventScroll:true});}),reviewConfirm=button('Confirmar igual',async()=>{reviewAccepted=true;await confirm.onclick();},'rg-photo-confirm');reviewBox.setAttribute('role','alert');reviewActions.append(reviewBack,reviewConfirm);reviewBox.append(reviewMessage,reviewActions);reviewBox.hidden=true;report.append(reviewBox);
 const states=[];
 function pane(kind,label,help){
  const section=node('section',null,'rg-photo-pane'),bar=node('header'),heading=node('h3',label),controls=node('div',null,'rg-photo-zoom'),canvas=node('div',null,'rg-photo-canvas rg-photo-'+kind);
  const plus=button('Acercar',()=>changeZoom(state,.65)),minus=button('Alejar',()=>changeZoom(state,1/.65)),home=button('Ver todo',()=>{state.view=[...state.home];viewChanged(state);});controls.append(minus,plus,home);bar.append(heading,controls);section.append(bar,node('p',help),canvas);panes.append(section);
  const state={kind,canvas,controls:[minus,plus,home],view:kind==='photo'?[0,0,1,1]:[0,0,900,600],home:kind==='photo'?[0,0,1,1]:[0,0,900,600],cursor:null,markers:null,svg:null,pointers:new Map(),gesture:null};states.push(state);return state;
 }
 const photo=pane('photo','La foto','Marcá un cruce, una esquina u otro lugar fácil de reconocer.'),plan=pane('plan','El plano','Buscá el mismo lugar y marcá su punto. Arrastrá para mover; usá Acercar para precisar.');
 const projection=mapView(plan.canvas,{...scene,cameras:[]},mapSales?.zones?mapSales:undefined);
 if(!projection)throw Error('Cargá primero el plano para poder alinear la foto.');
 plan.svg=plan.canvas.querySelector('svg');const currentGuide=plan.svg.querySelector('image');if(currentGuide){currentGuide.style.opacity='.18';currentGuide.setAttribute('pointer-events','none');currentGuide.setAttribute('aria-label','Foto guardada como guía');}
 const overlay=svg('image',{width:1,height:1,preserveAspectRatio:'none','pointer-events':'none',opacity}),planPoints=svg('g',{'pointer-events':'none'});plan.svg.prepend(overlay);plan.svg.append(planPoints);plan.markers=planPoints;
 photo.svg=svg('svg',{role:'group','aria-label':'Foto para marcar los puntos',tabindex:0});photo.canvas.append(photo.svg);const photoImage=svg('image',{href:url,x:0,y:0,preserveAspectRatio:'none'}),photoPoints=svg('g',{'pointer-events':'none'});photo.svg.append(photoImage,photoPoints);photo.markers=photoPoints;
 content.append(pairsBar,guidance,panes,report);dialog.append(head,content,footer);document.body.append(dialog);
 const image=new Image();
 function unit(state){const matrix=state.svg.getScreenCTM?.();return matrix?1/Math.hypot(matrix.a,matrix.b):state.view[2]/Math.max(1,state.svg.getBoundingClientRect().width);}
 function marker(state,point,text,selected=false,control=false){
  const group=svg('g',{class:'rg-photo-point'+(selected?' selected':'')+(control?' control':''),transform:'translate('+point.join(' ')+') scale('+unit(state)+')'}),circle=svg('circle',{r:11}),number=svg('text',{'text-anchor':'middle',y:5});number.textContent=text;group.append(circle,number);state.markers.append(group);
 }
 function drawPoints(){
  for(const state of states){state.markers.replaceChildren();if(!ready)continue;pairs.forEach((pair,index)=>{const point=pair[state.kind];if(point)marker(state,state.kind==='photo'?[point[0]*image.naturalWidth,point[1]*image.naturalHeight]:projection.xy(point),index+1,index===active,index===3);});
   if(state.cursor){const cross=svg('path',{class:'rg-photo-cursor',d:'M-9 0H9M0-9V9',transform:'translate('+state.cursor.join(' ')+') scale('+unit(state)+')'});state.markers.append(cross);}
  }
  if(result?.projected&&pairs[3]?.plan){const a=projection.xy(result.projected),b=projection.xy(pairs[3].plan),path=svg('path',{class:'rg-photo-control-error',d:'M'+a.join(' ')+'L'+b.join(' '),'vector-effect':'non-scaling-stroke'});const predicted=svg('circle',{class:'rg-photo-projected',cx:a[0],cy:a[1],r:11*unit(plan),'vector-effect':'non-scaling-stroke'}),title=svg('title');title.textContent='Punto de control según el calce de la foto';predicted.append(title);plan.markers.append(path,predicted);}
 }
 function viewChanged(state){state.svg.setAttribute('viewBox',state.view.join(' '));drawPoints();}
 function changeZoom(state,factor){if(!ready||busy)return;const width=Math.max(state.home[2]/64,Math.min(state.home[2]*2,state.view[2]*factor)),height=width*state.view[3]/state.view[2];state.view=[state.view[0]+(state.view[2]-width)/2,state.view[1]+(state.view[3]-height)/2,width,height];viewChanged(state);}
 function render(){
  reviewAccepted=false;reviewBox.hidden=true;
  undo.disabled=busy||!past.length;redo.disabled=busy||!future.length;for(const state of states)for(const button of state.controls)button.disabled=busy||!ready;pairsBar.replaceChildren();
  pairs.forEach((pair,index)=>{const done=!!pair.photo&&!!pair.plan,b=button((index===3?'Control':String(index+1))+' · '+(done?'Listo':pair.photo||pair.plan?'Falta un punto':'Por marcar'),()=>{active=index;render();});b.setAttribute('aria-pressed',String(active===index));pairsBar.append(b);});
  if(pairs.length===3){const add=button('Agregar punto de control',()=>{remember();pairs.push({});active=3;render();});add.disabled=!pairs.slice(0,3).every(p=>p.photo&&p.plan);pairsBar.append(add);}else pairsBar.append(button('Quitar punto de control',()=>{remember();pairs.pop();active=Math.min(active,2);render();}));
  guidance.textContent=!ready?'Cargando la foto…':pairs[active].photo&&pairs[active].plan?'Punto '+(active+1)+' seleccionado. Podés reemplazarlo tocando su nueva ubicación en cualquiera de las dos vistas.':'Punto '+(active+1)+': marcá '+(!pairs[active].photo?'su lugar en la foto':'el mismo lugar en el plano')+'.';
  result=null;try{result=photoRegistration(pairs);assessment.textContent=result.assessment;deviation.textContent=result.error===null?'Agregá un punto de control para comprobar el calce.':'Punto de control: '+result.error.toLocaleString('es-AR',{maximumFractionDigits:1})+' m de desvío';report.dataset.quality=result.error===null?'unchecked':result.error<=PHOTO_REGISTRATION_LIMITS.acceptableMeters?'checked':'review';}catch(error){assessment.textContent='Marcar los puntos';deviation.textContent=error.message;delete report.dataset.quality;}
  overlayLabel.hidden=!result;overlay.style.opacity=String(opacity);overlay.style.display=result?'':'none';
  if(currentGuide)currentGuide.style.display=result?'none':'';
  if(result){const [a,b,c]=result.corners.map(projection.xy);overlay.setAttribute('href',url);overlay.setAttribute('transform','matrix('+[b[0]-a[0],b[1]-a[1],c[0]-a[0],c[1]-a[1],...a].join(' ')+')');}
  confirm.disabled=!ready||busy||!result;drawPoints();
 }
 function place(state,point){
  if(!ready||busy)return;let value=state.kind==='photo'?[point[0]/image.naturalWidth,point[1]/image.naturalHeight]:projection.geo(point);
  if(state.kind==='photo'?value.some(n=>!Number.isFinite(n)||n<0||n>1):!gps(value)){notice.textContent='Marcá el punto dentro de '+(state.kind==='photo'?'la foto.':'el plano.');return;}
  remember();const wasComplete=!!pairs[active].photo&&!!pairs[active].plan;pairs[active][state.kind]=value;notice.textContent='';
  if(!wasComplete&&pairs[active].photo&&pairs[active].plan){const next=pairs.findIndex(p=>!p.photo||!p.plan);if(next!==-1)active=next;}
  render();
 }
 function pointAt(state,event){const matrix=state.svg.getScreenCTM();const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return [p.x,p.y];}
 for(const state of states){
  const el=state.svg;el.setAttribute('tabindex','0');el.setAttribute('role','group');el.setAttribute('aria-label',state.kind==='photo'?'Foto. Flechas para ubicar el cursor, Enter para marcar.':'Plano. Flechas para ubicar el cursor, Enter para marcar.');
  el.addEventListener('pointerdown',event=>{if(!ready||busy||event.button!==0||state.gesture)return;el.focus({preventScroll:true});state.gesture={id:event.pointerId,start:[event.clientX,event.clientY],point:pointAt(state,event),view:[...state.view],moved:false};el.setPointerCapture(event.pointerId);},{signal});
  el.addEventListener('pointermove',event=>{const g=state.gesture;if(!g||g.id!==event.pointerId)return;const dx=event.clientX-g.start[0],dy=event.clientY-g.start[1];if(Math.hypot(dx,dy)>5)g.moved=true;if(!g.moved)return;const scale=unit(state);state.view=[g.view[0]-dx*scale,g.view[1]-dy*scale,g.view[2],g.view[3]];viewChanged(state);},{signal});
  const end=(event,mark)=>{const g=state.gesture;if(!g||g.id!==event.pointerId)return;state.gesture=null;if(el.hasPointerCapture?.(event.pointerId))el.releasePointerCapture(event.pointerId);if(mark&&!g.moved)place(state,pointAt(state,event));};
  el.addEventListener('pointerup',e=>end(e,true),{signal});el.addEventListener('pointercancel',e=>end(e,false),{signal});el.addEventListener('lostpointercapture',e=>end(e,false),{signal});
  el.addEventListener('keydown',event=>{if(!ready||busy)return;const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(direction){event.preventDefault();state.cursor||=[state.view[0]+state.view[2]/2,state.view[1]+state.view[3]/2];const step=unit(state)*(event.shiftKey?10:1);state.cursor=state.cursor.map((v,i)=>v+direction[i]*step);drawPoints();}else if(event.key==='Enter'){event.preventDefault();place(state,state.cursor||[state.view[0]+state.view[2]/2,state.view[1]+state.view[3]/2]);}else if(['+','=','-','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home'){state.view=[...state.home];viewChanged(state);}else changeZoom(state,event.key==='-'?1/.65:.65);}},{signal});
 }
 window.addEventListener('blur',()=>{for(const state of states){const id=state.gesture?.id;state.gesture=null;if(id!=null&&state.svg.hasPointerCapture?.(id))state.svg.releasePointerCapture(id);}},{signal});
 const resize=new ResizeObserver(()=>drawPoints());resize.observe(dialog);
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)dialog.close();});
 dialog.addEventListener('close',()=>{life.abort();resize.disconnect();image.onload=image.onerror=null;dialog.remove();},{once:true});
 image.onload=()=>{if(!image.naturalWidth||!image.naturalHeight)return;ready=true;photo.home=photo.view=[0,0,image.naturalWidth,image.naturalHeight];photoImage.setAttribute('width',image.naturalWidth);photoImage.setAttribute('height',image.naturalHeight);photo.svg.setAttribute('viewBox',photo.view.join(' '));render();};
 image.onerror=()=>{ready=false;render();guidance.textContent='No se pudo abrir la foto. Volvé al editor para elegir otra imagen.';};
 render();dialog.showModal();image.src=url;cancel.focus();return {dialog,close:()=>{if(!busy)dialog.close();}};
}
