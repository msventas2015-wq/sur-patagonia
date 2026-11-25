import {MINIWEB_PALETTES,applyMiniwebPalette,paletteTokens} from './miniweb-palettes.mjs';

export const COVER_MEDIA = {foto:'Foto', video:'Video', panoramica360:'Panorámica 360°', recorrido:'Explorador 360°'};

export const LOT_PLAN_KEY = {
 disponible:{label:'Disponible',color:'#3fa66a'},
 vendido:{label:'Vendido',color:'#14181a'},
 no_a_la_venta:{label:'No comercializado',color:'#ffffff'},
 seleccionado:{label:'Seleccionado',color:'#69aad8'},
 reservado:{label:'Reservado',color:'#ffa63d'},
 proximamente:{label:'Próximamente',color:'#6fb1ff'},
 sin:{label:'Sin informar',color:'#c9ccca'}
};

export function usesLotPlanKey(config) {
 return config?.bloques?.find(block=>block.tipo==='explorador')?.opciones?.estadosPlano==='regla';
}

export function lotPlanKeyEntries(rows, showSelection=true) {
 const present=new Set(rows.map(row=>Object.hasOwn(LOT_PLAN_KEY,row.lot.estado)?row.lot.estado:'sin'));
 return Object.entries(LOT_PLAN_KEY).filter(([key])=>key==='seleccionado'?showSelection:
  ['disponible','vendido','no_a_la_venta'].includes(key)||present.has(key));
}

// La elección por dispositivo se guarda en el bloque; ningún proyecto cambia
// de video a foto por una excepción de presentación.
export function coverMedium(config, {mobile=false}={}) {
 const options=config?.bloques?.find(block=>block.tipo==='portada')?.opciones||{};
 return mobile&&['foto','video'].includes(options.medioMovil)
  ?options.medioMovil:options.medio||config?.medio||'foto';
}

export function coverName(config, identityName, previousName=identityName) {
 const name=config?.bloques?.find(block=>block.tipo==='portada')?.contenido?.nombreVisible;
 return typeof name==='string' ? name.trim() || identityName : previousName;
}

// El creador puede simular un teléfono sin cambiar el dispositivo del visitante.
export function mobileTourViewport(width, coarse, previewDevice='') {
 return Number(width)>0 && Number(width)<=760 && (Boolean(coarse)||previewDevice==='mobile');
}

export function commercialPresentation(config) {
 const choice=config?.recursos?.presentacionLotes;
 return config?.estilo==='inmersivo'&&(choice==='comercial'||choice==null&&config?.recursos?.cierreTerrazas==='bloques');
}

export const DESIGN_STYLES=[
 {id:'inmersivo',name:'Inmersivo',selector:'inmersivo',title:'Explore el desarrollo',description:'Portada cinematográfica, paisaje a pantalla completa y pausas fotográficas.'},
 {id:'estudio-vivo',name:'Estudio',selector:'inmersivo',title:'Conozca cada posibilidad',description:'Fotografía de producto, perspectivas elegibles y datos junto a la decisión.'},
 {id:'relato',name:'Relato',selector:'inmersivo',title:'Elija su lugar',description:'Lectura editorial con fotografías que acompañan cada capítulo.'},
 {id:'manifiesto',name:'Manifiesto',selector:'inmersivo',title:'Encuentre su espacio',description:'Tipografía de gran escala, imágenes superpuestas y composición asimétrica.'},
 {id:'recorrido',name:'Recorrido',selector:'inmersivo',title:'Del lugar a su lote',description:'Presentación breve y plano protagonista, con una lista coordinada de lotes.'}
];
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHTML;
const mediaHeading=c=>c.rotulo||c.titulo||c.texto?`<header class="media-heading">${c.rotulo?`<span class="eyebrow label">${e(c.rotulo)}</span>`:''}${c.titulo?`<h2>${e(c.titulo)}</h2>`:''}${c.texto?`<p>${e(c.texto)}</p>`:''}</header>`:'';
export function youtubeEmbed(value){try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return '';let id='';if(url.hostname==='youtu.be')id=url.pathname.slice(1);if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(url.hostname))id=url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];return /^[\w-]{11}$/.test(id||'')?'https://www.youtube-nocookie.com/embed/'+id:''}catch{return ''}}
export function renderMediaBlock(block,{media}){
 const c=block.contenido||{},o=block.opciones||{},url=media(c.video||block.medio),poster=media(c.imagen||c.respaldo),embed=youtubeEmbed(url);
 if(block.tipo==='imagen')return poster?`${mediaHeading(c)}<figure class="media-figure"><button type="button" data-image="${e(poster)}" data-image-title="${e(c.alt||c.titulo||'Fotografía')}" aria-label="Ampliar fotografía"><img src="${e(poster)}" alt="${e(c.alt||'')}" loading="lazy"></button>${c.pie?`<figcaption>${e(c.pie)}</figcaption>`:''}</figure>`:'';
 if(!url)return '';
 const title=mediaHeading(c);
 const player=embed?`<iframe title="${e(c.titulo||'Video del proyecto')}" src="${e(embed)}?playsinline=1&rel=0&enablejsapi=1${o.repetir==='si'?'&loop=1&playlist='+embed.split('/').pop():''}" ${o.autoplay==='si'?'data-youtube-autoplay':''} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`:/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)?`<video controls playsinline preload="metadata" ${poster?`poster="${e(poster)}"`:''} ${o.repetir==='si'?'loop':''} ${o.autoplay==='si'?'muted data-block-autoplay':''}><source src="${e(url)}">Su navegador no pudo abrir el video.</video>`:`<a class="btn" href="${e(url)}" target="_blank" rel="noopener noreferrer">Ver video</a>`;
 return `${title}<div class="block-video-stage" ${c.alt?`role="group" aria-label="${e(c.alt)}"`:''}>${player}</div>${c.pie?`<p class="media-caption">${e(c.pie)}</p>`:''}`;
}
export function renderPhotoStory(block,{media}){
 const c=block.contenido||{},limit=Math.max(1,Math.min(12,Number(block.opciones?.cantidadFotos)||4));
 const photos=(Array.isArray(c.fotos)?c.fotos:[]).slice(0,limit).flatMap((value,slot)=>{
  const photo=typeof value==='string'?{url:value}:value;
  return photo&&media(photo.url)?[{...photo,slot}]:[];
 });
 if(!photos.length||(block.tipo==='perspectivas'&&block.opciones?.exigirNombres==='si'&&(photos.length<3||photos.some(f=>!String(f.titulo||'').trim()))))return '';
 const picture=f=>`<img src="${e(media(f.url))}" alt="${e(f.alt||'')}" data-photo-frame="${['centro','arriba','abajo','izquierda','derecha','completa'].includes(f.encuadre)?f.encuadre:'centro'}" style="object-position:${({arriba:'50% 0%',abajo:'50% 100%',izquierda:'0% 50%',derecha:'100% 50%'})[f.encuadre]||'50% 50%'};${f.encuadre==='completa'?'object-fit:contain;':''}" loading="lazy">${f.pie?`<p class="media-caption">${e(f.pie)}</p>`:''}`;
 const copy=f=>`${f.titulo?`<h2>${e(f.titulo)}</h2>`:''}${f.texto?`<p>${e(f.texto)}</p>`:''}`;
 if(block.tipo==='perspectivas')return `${mediaHeading(c)}<div class="perspective-block" data-thumbnails="${block.variante==='miniaturas'}"><div class="perspective-panels">${photos.map((f,i)=>`<div data-perspective-panel="${f.slot}" ${i?'hidden':''}>${picture(f)}<div class="perspective-copy">${copy(f)}</div></div>`).join('')}</div><div class="perspective-tabs" role="group" aria-label="Perspectivas">${photos.map((f,i)=>`<button type="button" data-perspective-go="${f.slot}" aria-pressed="${!i}">${block.variante==='miniaturas'?'<img src="'+e(media(f.url))+'" alt="" loading="lazy">':''}${e(f.titulo||'Vista '+(f.slot+1))}</button>`).join('')}</div></div>`;
 return `${mediaHeading(c)}<div class="chapter-block" data-stacked="${block.variante==='apilada'}"><div class="chapter-visual">${photos.map((f,i)=>`<figure data-chapter-photo="${f.slot}" ${i?'hidden':''}>${picture(f)}</figure>`).join('')}</div><div class="chapter-texts">${photos.map(f=>`<article data-chapter="${f.slot}"><figure class="chapter-mobile">${picture(f)}</figure>${copy(f)}</article>`).join('')}</div></div>`;
}
// A single reading line and a dead band prevent alternating chapters at a boundary.
export function photoChapterAt(tops,height,current=-1){
 if(!tops.length)return 0;const line=height*.42,band=Math.min(64,height*.07);let index=Math.max(0,Math.min(tops.length-1,current));
 if(current<0){tops.forEach((top,i)=>{if(top<=line)index=i});return index}
 while(index<tops.length-1&&tops[index+1]<=line-band)index++;
 while(index>0&&tops[index]>line+band)index--;
 return index;
}
export function mountDesignResources(scope){
 const dispose=[],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 scope.querySelectorAll('.perspective-block').forEach(block=>{
  const click=event=>{if(block.dataset.estudioTabs==='true')return;const button=event.target.closest('[data-perspective-go]');if(!button)return;block.querySelectorAll('[data-perspective-go]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));block.querySelectorAll('[data-perspective-panel]').forEach(p=>p.hidden=p.dataset.perspectivePanel!==button.dataset.perspectiveGo)};
  block.addEventListener('click',click);dispose.push(()=>block.removeEventListener('click',click));
 });
 scope.querySelectorAll('.chapter-block').forEach(block=>{
  const doc=block.ownerDocument,win=doc.defaultView,articles=[...block.querySelectorAll('[data-chapter]')],pictures=[...block.querySelectorAll('[data-chapter-photo]')],wide=win.matchMedia('(min-width:901px)');
  let frame=0,index=-1,shown=0,request=0,disposed=false,fade;
  const reveal=async next=>{const token=++request,picture=pictures[next],image=picture?.querySelector('img');if(!picture)return;if(image){image.loading='eager';try{await image.decode()}catch{if(!image.complete||!image.naturalWidth)return}}if(disposed||token!==request)return;fade?.cancel();const previous=pictures[shown];pictures.forEach(p=>p.hidden=p!==picture&&p!==previous);picture.hidden=false;picture.style.zIndex='1';if(previous&&previous!==picture&&!reduced.matches){fade=picture.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out'});try{await fade.finished}catch{}}if(disposed||token!==request)return;pictures.forEach(p=>{p.hidden=p!==picture;p.style.removeProperty('z-index')});shown=next};
  const update=()=>{frame=0;if(!wide.matches||block.dataset.stacked==='true')return;const tops=articles.map(a=>a.getBoundingClientRect().top),next=photoChapterAt(tops,win.innerHeight,index);if(next!==index){index=next;reveal(next)}const adjacent=pictures[index+1]?.querySelector('img');if(adjacent)adjacent.loading='eager'};
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update)};
  win.addEventListener('scroll',schedule,{passive:true});win.addEventListener('resize',schedule,{passive:true});wide.addEventListener('change',schedule);update();
  dispose.push(()=>{disposed=true;request++;win.cancelAnimationFrame(frame);fade?.cancel();win.removeEventListener('scroll',schedule);win.removeEventListener('resize',schedule);wide.removeEventListener('change',schedule)});
 });
 scope.querySelectorAll('iframe[data-youtube-autoplay]').forEach(video=>{
  let visible=false;const command=func=>video.contentWindow?.postMessage(JSON.stringify({event:'command',func,args:[]}),'https://www.youtube-nocookie.com');
  const update=()=>{command('mute');command(visible&&!document.hidden&&!reduced.matches?'playVideo':'pauseVideo')};
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update()},{threshold:.25});observer.observe(video);video.addEventListener('load',update);document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
  dispose.push(()=>{observer.disconnect();command('pauseVideo');video.removeEventListener('load',update);document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update)});
 });
 scope.querySelectorAll('video[data-block-autoplay]').forEach(video=>{
  let visible=false;
  const update=()=>{if(visible&&!document.hidden&&!reduced.matches){video.muted=true;video.play().catch(()=>{})}else video.pause()};
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update()},{threshold:.25});observer.observe(video);document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
  dispose.push(()=>{observer.disconnect();video.pause();document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update)});
 });
 return ()=>dispose.forEach(f=>f());
}
// Keep native layout and section geometry for the shared motion effects.
// No transformed page ancestor: fixed backgrounds, sticky scenes and map coordinates survive.
export function mountImmersiveMotion(scope,{app,compare=false,editing=false,nativeWheel=false}={}){
 const style=app?.dataset.style;
 if(!['inmersivo','estudio-vivo','relato','recorrido'].includes(style)||compare||editing)return ()=>{};
 const depth=style!=='recorrido';
 const editorial=app.hasAttribute('data-composicion-terrazas');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)'),desktop=matchMedia('(min-width:900px)'),controller=new AbortController(),{signal}=controller;
 const hero=scope.querySelector('.hero'),nav=app.querySelector('.nav'),explorer=scope.querySelector('[data-block-type="explorador"]'),images=[],pairs=[],aerials=[];
 let frame=0,lastY=window.scrollY,lastTime=0,target=lastY,smoothing=false,down=0;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),motion=()=>!reduced.matches&&desktop.matches;
 const remember=(node,property,value)=>{if(!node)return;const old=node.style.getPropertyValue(property);node.style.setProperty(property,value);return ()=>old?node.style.setProperty(property,old):node.style.removeProperty(property)};
 const restores=[],focusTargets=new Map();
 if(hero&&depth&&!editorial){const medium=hero.querySelector(style==='relato'?'.cover-photo img':style==='estudio-vivo'?'.hero-media>img':'.hero-media');if(medium){medium.dataset.immersiveMedium='';images.push({node:medium,section:hero,hero:true})}}
 if(style==='inmersivo')scope.querySelectorAll('.par').forEach(section=>{const figures=[...section.querySelectorAll(':scope>figure')];if(figures.length===2)pairs.push({section,figures})});
 // Transform only the image inside its own clipping frame. Captions remain still.
 if(depth&&!editorial)scope.querySelectorAll('.proyecto>figure img').forEach(node=>{if(node.dataset.photoFrame==='completa')return;node.dataset.immersiveMedium='';const section=node.closest('.proyecto');restores.push(remember(node.parentElement,'overflow','hidden'));images.push({node,section})});
 if(depth)scope.querySelectorAll('.immersive-aerial').forEach(section=>{const image=section.querySelector('img');if(image)aerials.push({section,image})});
 function reset(){images.forEach(({node})=>{node.style.removeProperty('--immersive-y');node.style.removeProperty('--immersive-scale')});pairs.forEach(({figures})=>figures.forEach(n=>n.style.removeProperty('translate')));aerials.forEach(({section,image})=>{image.style.removeProperty('--aerial-scale');delete section.dataset.aerialMotion});if(nav)delete nav.dataset.immersiveHeader}
 function paint(now){
  frame=0;const dt=Math.min(48,now-(lastTime||now-16));lastTime=now;
  if(smoothing){const y=window.scrollY,limit=Math.max(0,document.documentElement.scrollHeight-innerHeight);target=clamp(target,0,limit);const next=y+(target-y)*(1-Math.exp(-dt/85));window.scrollTo({top:Math.abs(target-next)<.6?target:next,behavior:'instant'});smoothing=Math.abs(target-window.scrollY)>.6}
  const y=window.scrollY,delta=y-lastY,h=innerHeight;
  if(!reduced.matches){
   images.forEach(({node,section,hero:isHero})=>{const r=section.getBoundingClientRect();if(r.bottom<0||r.top>h)return;const amount=motion()?(isHero?clamp(-r.top*.18,-60,h*.18):clamp((h/2-r.top-r.height/2)*.04,-Math.max(0,Math.min(24,node.offsetHeight*.045-1)),Math.max(0,Math.min(24,node.offsetHeight*.045-1)))):0;node.style.setProperty('--immersive-y',amount+'px');node.style.setProperty('--immersive-scale',isHero?'1.04':'1.09')});
   pairs.forEach(({section,figures})=>{const r=section.getBoundingClientRect();if(r.bottom<0||r.top>h)return;const progress=clamp((h-r.top)/(h+r.height),0,1);figures.forEach((n,i)=>n.style.translate=motion()?`0 ${(i?1-progress:progress)*40}px`:'none')});
   aerials.forEach(({section,image})=>{const r=section.getBoundingClientRect(),limit=clamp(Math.min((image.naturalWidth||r.width)/r.width,(image.naturalHeight||h)/h),1,1.65),enabled=motion()&&limit>1.01;section.dataset.aerialMotion=String(enabled);const travel=section.getBoundingClientRect().height-h,progress=travel>0?clamp(-r.top/travel,0,1):0;image.style.setProperty('--aerial-scale',enabled?String(1+progress*(limit-1)):'1')});
   if(nav){const top=y<Math.max(100,(hero?.offsetHeight||h)-nav.offsetHeight),selling=explorer&&explorer.getBoundingClientRect().top<h*.35,focused=nav.matches(':focus-within');down=delta>0?down+delta:0;nav.dataset.immersiveHeader=top?'top':selling||focused||delta< -2?'shown':down>18?'hidden':nav.dataset.immersiveHeader||'shown'}
  }else reset();
  lastY=y;if(smoothing)frame=requestAnimationFrame(paint)
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint)},cancel=()=>{smoothing=false;target=window.scrollY};
 const excluded=event=>event.composedPath().some(n=>n?.matches?.('input,textarea,select,[contenteditable],dialog,.lotes,.contacto,.map-panel,.map-stage,.map-viewport,.panorama-stage,.tour-frame,.rhythm-track,.photo-grid,.preview-settings,[data-immersive-native]'));
 function wheel(event){
  if(!event.cancelable||reduced.matches||!fine.matches||!desktop.matches||event.ctrlKey||event.metaKey||event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!event.composedPath().includes(app)||excluded(event)){cancel();return}
  if(!event.deltaY)return;const limit=Math.max(0,document.documentElement.scrollHeight-innerHeight),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1),next=clamp((smoothing?target:window.scrollY)+delta,0,limit);
  if(next===window.scrollY&&!smoothing)return;
  event.preventDefault();target=next;smoothing=true;schedule()
 }
 // With native wheel input, paint only reads the page position for visual effects.
 if(depth && !nativeWheel && !editorial)window.addEventListener('wheel',wheel,{passive:false,signal});
 window.addEventListener('scroll',schedule,{passive:true,signal});window.addEventListener('resize',schedule,{passive:true,signal});
 window.addEventListener('pointerdown',cancel,{passive:true,signal});window.addEventListener('touchstart',cancel,{passive:true,signal});window.addEventListener('keydown',cancel,{signal});
 // An anchor or focus uses native scrolling. Cancel wheel inertia before it can fight it.
 scope.addEventListener('click',event=>{cancel();const link=event.target.closest?.('a[href^="#"]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const destination=scope.getRootNode().getElementById(link.getAttribute('href').slice(1));if(!destination)return;const focus=destination.querySelector('h1,h2')||destination;if(!focusTargets.has(focus))focusTargets.set(focus,focus.getAttribute('tabindex'));focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true})},{capture:true,signal});scope.addEventListener('focusin',()=>{cancel();if(nav?.matches(':focus-within'))nav.dataset.immersiveHeader='shown'},{signal});
 const preference=()=>{cancel();reset();schedule()};reduced.addEventListener('change',preference);desktop.addEventListener('change',preference);fine.addEventListener('change',preference);
 aerials.forEach(({image})=>image.addEventListener('load',schedule,{signal}));
 document.addEventListener('visibilitychange',()=>{cancel();if(document.hidden){cancelAnimationFrame(frame);frame=0}else schedule()},{signal});
 schedule();return ()=>{controller.abort();cancelAnimationFrame(frame);reduced.removeEventListener('change',preference);desktop.removeEventListener('change',preference);fine.removeEventListener('change',preference);reset();focusTargets.forEach((value,node)=>value===null?node.removeAttribute('tabindex'):node.setAttribute('tabindex',value));images.forEach(({node})=>delete node.dataset.immersiveMedium);restores.forEach(f=>f?.())}
}
export function renderAerialApproach(block,{media,href}){
 const c=block.contenido||{},photo=(Array.isArray(c.fotos)?c.fotos:[])[0],f=typeof photo==='string'?{url:photo}:photo||{},url=media(f.url);if(!url)return '';
 const target=href('explorador'),title=f.titulo||c.titulo||'',text=f.texto||c.texto||'';
 return `<div class="immersive-aerial"><div class="aerial-frame"><img src="${e(url)}" alt="${e(f.alt||title)}" loading="lazy"><div class="aerial-copy">${title?`<h2>${e(title)}</h2>`:''}${text?`<p>${e(text)}</p>`:''}${f.pie?`<p class="aerial-caption">${e(f.pie)}</p>`:''}</div>${target?`<a class="aerial-skip" href="${e(target)}">Ir a los lotes <span aria-hidden="true">↓</span></a>`:''}</div></div>`
}
export function applyBlockLayout(node,block){
 const o=block.opciones||{};
 // Separate desktop/mobile values; absence preserves the style, including zero.
 for(const [key,attr,variable] of [['espacioArriba','spaceTop','--block-space-top'],['espacioAbajo','spaceBottom','--block-space-bottom'],['espacioArribaMovil','spaceTopMobile','--block-space-top-mobile'],['espacioAbajoMovil','spaceBottomMobile','--block-space-bottom-mobile']]){
  const value=o[key],valid=!['portada','comercializacion'].includes(block.tipo)&&value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  if(valid){node.dataset[attr]='custom';node.style.setProperty(variable,Math.max(0,Math.min(320,Number(value)))+'px')}else{delete node.dataset[attr];node.style.removeProperty(variable)}
 }
 if(block.tipo==='ubicacion'){
  if(block.variante==='mapa' && ['apaisado','cuadrado'].includes(o.formatoMapa))node.dataset.formatoMapa=o.formatoMapa;
  else delete node.dataset.formatoMapa;
 }
 if(block.tipo==='contacto')node.toggleAttribute('data-consulta-tarjeta',o.formatoConsulta==='tarjeta');
 if(block.tipo==='explorador')node.toggleAttribute('data-regla-estados',o.estadosPlano==='regla');
 if(['left','center','right'].includes(o.textAlign))node.querySelectorAll('h1,h2,h3,p,blockquote').forEach(n=>n.style.textAlign=o.textAlign);
 if(Number.isFinite(Number(o.textSize))&&Number(o.textSize)>0)node.querySelectorAll('h2,blockquote').forEach(n=>n.style.fontSize=`clamp(24px,${Math.max(24,Math.min(100,Number(o.textSize)))/14.4}vw,${Math.max(24,Math.min(100,Number(o.textSize)))}px)`);
 // Título de sección por adopción del bloque: sólo escritorio y sólo títulos propios de la sección (la regla vive en miniweb.css). Ausente conserva el estilo.
 // Se marca el bloque y no el título: los encabezados del selector y del recorrido pueden montarse después de este paso.
 {const size=Number(o.tituloSeccion),valid=!['portada','comercializacion','capitulos','perspectivas','escenas'].includes(block.tipo)&&Number.isFinite(size)&&size>0;
  if(valid){node.dataset.tituloSeccion='';node.style.setProperty('--titulo-seccion',Math.max(24,Math.min(100,size))+'px')}else{delete node.dataset.tituloSeccion;node.style.removeProperty('--titulo-seccion')}}
 if(block.tipo==='foto-texto'&&o.photoSize&&block.variante!=='apilada'){const v=Math.max(30,Math.min(70,Number(o.photoSize)||50));node.style.setProperty('--block-photo-share',v+'%');node.classList.add('custom-photo-share');node.style.gridTemplateColumns=block.variante==='foto-izquierda'?v+'fr '+(100-v)+'fr':(100-v)+'fr '+v+'fr'}
 for(const [key,values]of Object.entries({ancho:['estilo','completo','contenido','dos-tercios','mitad'],formato:['natural','pantalla','16-9','4-3','1-1','9-16'],alineacion:['izquierda','centro','derecha'],ajuste:['cubrir','contener']}))node.dataset[key]=values.includes(o[key])?o[key]:values[0];
}
export function blockLayoutControls(block){
 if(block.tipo==='portada')return '';
 const o=block.opciones||{},control=(key,label,values)=>`<label>${label}<select aria-label="${label}" data-block-option="${key}">${values.map(([v,t])=>`<option value="${v}" ${o[key]===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
 let html=block.tipo==='comercializacion'
   ? control('fondoLogos','Fondo de los logos',[['','Integrado'],['claro','Franja clara']])
   : control('ancho','Ancho',[['estilo','Propio del estilo'],['completo','A todo el ancho'],['contenido','Con márgenes'],['dos-tercios','Dos tercios'],['mitad','Media página']])+control('alineacion','Posición',[['izquierda','Izquierda'],['centro','Centro'],['derecha','Derecha']]);
 if(block.tipo==='explorador')html+=control('entradaPlano','Vista inicial del plano',[['','Vista habitual'],['amplia','Vista amplia']]);
 if(block.tipo==='panoramica360' && block.variante==='recorrido')html+=control('mostrarDetallesRecorrido','Detalles del recorrido debajo de la foto',[['si','Mostrar'],['no','Ocultar']]);
 if(['galeria','asi-se-vive'].includes(block.tipo) && block.variante==='album')html+=control('mostrarBotonAlbum','Botón para abrir el álbum',[['si','Mostrar'],['no','Ocultar']]);
 if(block.tipo==='ubicacion' && block.variante==='mapa'){
  html+=control('formatoMapa','Formato del mapa',[['','Propio del estilo'],['apaisado','Apaisado'],['cuadrado','Cuadrado']]);
  html+=control('mapaBase','Cartografía',[['','Google Maps estándar'],['referencias-bolson','Referencias principales · El Bolsón']]);
 }
 if(block.tipo==='contacto')html+=control('formatoConsulta','Presentación de la consulta',[['','Propia del estilo'],['tarjeta','Tarjeta centrada']]);
 if(['imagen','video','foto-frase','panoramica360'].includes(block.tipo))html+=control('formato','Formato',[['natural','Proporción original'],['pantalla','Pantalla completa'],['16-9','Apaisado 16:9'],['4-3','Apaisado 4:3'],['1-1','Cuadrado'],['9-16','Vertical 9:16']]);
 if(['imagen','foto-frase'].includes(block.tipo)||(block.tipo==='video'&&/\.(mp4|webm|mov)(?:[?#]|$)/i.test(block.contenido?.video||block.medio||'')))html+=control('ajuste','Encuadre',[['cubrir','Llenar el espacio'],['contener','Mostrar completo']]);
 return `<details class="block-format"><summary>Formato y posición</summary>${html}</details>`;
}
// Presentation of an authored block remains separate from the declared starter composition.
export function stylePresentationPlan(style,blocks,types={}){
 const manual=b=>b.opciones?.varianteManual===true||!!(types[b.tipo]?.variantes?.[0]&&b.variante!==types[b.tipo].variantes[0]);
 const editorial=new Set(['intro','foto-texto','par-fotos','foto-frase','foto-frase-lateral']);
 const groups=[];let group=[];const flush=()=>{if(group.length>1)groups.push(group);group=[]};
 const presentations={};
 for(const b of blocks){
  presentations[b.id]=style==='estudio-vivo'&&b.tipo==='par-fotos'&&!manual(b)?'perspectivas':style==='manifiesto'?'manifiesto':style==='recorrido'?'compacta':style==='relato'?'editorial':'inmersiva';
  if(style==='relato'&&b.activo!==false&&editorial.has(b.tipo)&&!manual(b)&&!b.opciones?.photoSize&&(!b.opciones?.ancho||b.opciones.ancho==='estilo'))group.push(b.id);else flush();
 }
 flush();return {presentations,readerGroups:groups};
}
export function orderForStyle(blocks,style){
 const orders={inmersivo:['intro','par-fotos','escenas','explorador','foto-texto','asi-se-vive','ubicacion'], 'estudio-vivo':['intro','lista-fotografica','perspectivas','foto-frase','explorador','ubicacion','galeria','panoramica360'],relato:['intro','galeria','explorador','cifras','capitulos','indice-fotografico','foto-texto','panoramica360','ubicacion'],manifiesto:['intro','foto-frase','cifras','explorador','par-fotos','ubicacion'],recorrido:['intro','escenas','explorador','cifras','foto-texto','panoramica360','galeria','ubicacion']};
 const order=orders[style]||[],priority=type=>type==='portada'?-1:type==='comercializacion'?1000:type==='contacto'?999:order.includes(type)?order.indexOf(type):100;
 return blocks.map((b,i)=>({b,i})).sort((a,b)=>priority(a.b.tipo)-priority(b.b.tipo)||a.i-b.i).map(x=>x.b);
}
// Each destination declares every active role. Unused blocks stay in the document,
// disabled, with their original content and media. Shared sales/cover blocks retain
// their configuration: preparing a style never redesigns the protected surfaces.
const slot=(tipo,variante,opciones={},activo=true)=>({key:tipo,tipo,variante,opciones,activo});
export const STYLE_COMPOSITIONS={
 inmersivo:[slot('portada'),slot('intro','centrada'),slot('par-fotos','grande-izquierda'),slot('escenas','fija',{cantidadFotos:4}),slot('explorador'),slot('foto-texto','foto-derecha'),slot('asi-se-vive','editorial',{cantidadFotos:3}),slot('ubicacion','texto'),slot('panoramica360','recorrido'),slot('contacto','formulario')],
 'estudio-vivo':[slot('portada'),slot('intro','izquierda'),slot('lista-fotografica','lista'),slot('perspectivas','pestanas',{cantidadFotos:3,exigirNombres:'si'}),slot('foto-frase','contenida'),slot('explorador'),slot('ubicacion','texto'),slot('galeria','tira',{cantidadFotos:3,textosFotos:'sobre'}),slot('panoramica360','recorrido',{},false),slot('contacto','formulario')],
 relato:[slot('portada'),slot('intro','centrada'),slot('par-fotos','grande-izquierda'),slot('galeria','mosaico',{cantidadFotos:6}),slot('capitulos','lectura',{cantidadFotos:4}),slot('explorador'),slot('asi-se-vive','editorial',{cantidadFotos:3}),slot('ubicacion','texto'),slot('cifras','barra',{cifras:['lotes','superficies','precio']}),slot('panoramica360','recorrido'),slot('contacto','formulario')],
 manifiesto:[slot('portada'),slot('intro','izquierda'),slot('foto-frase','a-sangre'),slot('cifras','franja',{cifras:['hectareas','superficies','precio']}),slot('explorador'),slot('par-fotos','grande-izquierda'),slot('ubicacion','texto'),slot('contacto','formulario')],
 recorrido:[slot('portada'),slot('intro','izquierda',{tinta:'si'}),slot('escenas','acercamiento',{cantidadFotos:4}),slot('explorador'),slot('cifras','franja',{cifras:['hectareas','superficies','precio']}),slot('foto-texto','dos-tercios'),slot('panoramica360','recorrido'),slot('galeria','carrusel',{cantidadFotos:6,textosFotos:'debajo'}),slot('ubicacion','texto'),slot('contacto','formulario')]
};
const compositionOptions=['cantidadFotos','textosFotos','exigirNombres','tinta','presentacionRelato','cifras'];
function compositionContent(tipo,project){
 const photos=[...(project.media_bank||[]),...(project.fotos||[])].map(f=>typeof f==='string'?{url:f}:{url:f?.url,alt:f?.alt||f?.nombre||'',pie:f?.pie||f?.descripcion||'',titulo:f?.titulo||'',texto:f?.texto||''}).filter((f,i,a)=>f.url&&a.findIndex(x=>x.url===f.url)===i);
 const text=project.descripcion||project.tagline||'';
 if(tipo==='intro')return {texto:text,imagen:photos[0]?.url||project.foto_portada||''};
 if(tipo==='foto-texto')return {titulo:project.tagline||'',texto:text,imagen:photos[0]?.url||project.foto_portada||''};
 if(tipo==='foto-frase')return {titulo:project.tagline||'',imagen:project.foto_atmosfera||project.foto_portada||''};
 if(['par-fotos','perspectivas','capitulos','escenas','galeria','asi-se-vive','experiencias'].includes(tipo))return {fotos:photos};
 return {};
}
// Initial photographs are assigned once per role. User content always wins below.
export function estudioIntroCopy(content={},project={}){
 const text=String(content.detalle||content.texto||project.descripcion||project.tagline||'').trim();
 if(!text)return {lead:'',body:''};
 const first=[...new Intl.Segmenter('es',{granularity:'sentence'}).segment(text)][0]?.segment||text;
 return {lead:first.trim(),body:text.slice(first.length).trim()};
}
export function estudioInitialContent(project={}){
 const photos=compositionContent('galeria',project).fotos||[],used=new Set([project.foto_portada,project.foto_atmosfera].filter(Boolean));
 const take=(count,predicate=()=>true)=>photos.filter(f=>!used.has(f.url)&&predicate(f)).slice(0,count).map(f=>{used.add(f.url);return {...f}});
 const intro=take(1)[0],named=photos.filter(f=>!used.has(f.url)&&String(f.titulo||'').trim());
 const views=named.length>=3?take(3,f=>!!String(f.titulo||'').trim()):[];
 const wide=project.foto_atmosfera&&project.foto_atmosfera!==project.foto_portada?project.foto_atmosfera:take(1)[0]?.url||'';
 return {intro:{texto:project.descripcion||project.tagline||'',imagen:intro?.url||'',alt:intro?.alt||'',pie:intro?.pie||''},perspectivas:{fotos:views},'foto-frase':{titulo:project.tagline||'',imagen:wide},galeria:{fotos:take(3)}};
}
// Estudio can show project photos without captions; only authored captions become pills.
// This is a rendering choice, leaving every existing block/photo in the editor untouched.
export function estudioGalleryPhotos(block,blocks,project={}){
 const key=url=>{try{return decodeURI(String(url||'').split(/[?#]/)[0])}catch{return String(url||'').split(/[?#]/)[0]}},used=new Set();
 for(const b of blocks.filter(b=>b.activo&&b.id!==block.id)){
  const c=b.contenido||{};
  if(b.tipo==='ubicacion'&&b.variante==='texto')continue;
  if(b.tipo==='perspectivas'&&(!(c.fotos||[]).length||(c.fotos||[]).slice(0,3).length<3||(c.fotos||[]).slice(0,3).some(f=>!String(f.titulo||'').trim())))continue;
  const urls=b.tipo==='portada'?[c.imagen||project.foto_portada]:['intro','foto-frase','foto-texto','ubicacion','imagen','foto-frase-lateral'].includes(b.tipo)?[c.imagen||(b.tipo==='foto-frase'?project.foto_atmosfera:'')]:['perspectivas','par-fotos','galeria','asi-se-vive','experiencias'].includes(b.tipo)?(c.fotos||[]).slice(0,Number(b.opciones?.cantidadFotos)||3).map(f=>typeof f==='string'?f:f.url):[];
  urls.filter(Boolean).forEach(url=>used.add(key(url)));
 }
 const candidates=[...(block.contenido?.fotos||[]),...(compositionContent('galeria',project).fotos||[])],photos=[];
 for(const value of candidates){
  const f=typeof value==='string'?{url:value}:value;if(!f?.url||used.has(key(f.url)))continue;
  used.add(key(f.url));const pie=String(f.pie||'').trim();
  photos.push({...f,pie:/^(?:fotografía regional|propuesta conceptual(?: del parque(?: productivo)?)?)[.!]?$/i.test(pie)?'':pie});
  if(photos.length>=3)break;
 }
 return photos;
}
export function estudioPhotoConflicts(blocks,project={}){
 const occurrences=new Map();
 for(const b of blocks.filter(b=>b.activo)){
  if(b.tipo==='ubicacion'&&b.variante==='texto')continue;
  const c=b.contenido||{},photos=b.tipo==='portada'?[c.imagen||project.foto_portada]:['intro','foto-frase','foto-texto','ubicacion'].includes(b.tipo)?[c.imagen]:['perspectivas','galeria','par-fotos'].includes(b.tipo)?(c.fotos||[]).slice(0,b.opciones?.cantidadFotos||3).map(f=>typeof f==='string'?f:f.url):[];
  for(const url of photos.filter(Boolean)){const key=String(url).split(/[?#]/)[0];if(!occurrences.has(key))occurrences.set(key,new Set());occurrences.get(key).add(b.id)}
 }
 return [...new Set([...occurrences.values()].filter(ids=>ids.size>1).flatMap(ids=>[...ids]))];
}
export function prepareStyleComposition(blocks,style,project={}){
 const specs=STYLE_COMPOSITIONS[style];if(!specs)return structuredClone(blocks);
 const remaining=structuredClone(blocks),ids=new Set(remaining.map(b=>b.id)),ordered=[],estudioDefaults=style==='estudio-vivo'?estudioInitialContent(project):null;
 const initialContent=tipo=>estudioDefaults?.[tipo]||compositionContent(tipo,project);
 for(const spec of specs){
  // A role is stable across styles; repeated user blocks are never substituted
  // for the same role according to whichever style happened to run last.
  let i=remaining.findIndex(b=>b.opciones?.composicionRol===spec.key);
  if(i<0)i=remaining.findIndex(b=>b.tipo===spec.tipo&&!b.opciones?.composicionRol&&b.opciones?.presentacionRelato!=='nota');
  let entry=i<0?null:remaining.splice(i,1)[0];
  if(!entry){let id='composicion-'+spec.key;while(ids.has(id))id+='-c';ids.add(id);entry={id,tipo:spec.tipo,activo:spec.activo,variante:spec.variante||'a-sangre',fuente:'editorial',contenido:initialContent(spec.tipo),opciones:{}}}
  if(!['portada','explorador'].includes(spec.tipo)){
   const options={...entry.opciones};for(const key of compositionOptions)delete options[key];
   entry.opciones={...options,...spec.opciones,composicionRol:spec.key,plantillaBase:style};
   entry.variante=spec.variante;entry.activo=spec.activo;
   const defaults={...initialContent(spec.tipo)};
   if(style==='estudio-vivo'&&Object.hasOwn(entry.contenido||{},'imagen')){delete defaults.imagen;delete defaults.alt;delete defaults.pie}
   entry.contenido={...defaults,...entry.contenido};
  }else{entry.activo=true;if(spec.tipo==='explorador'&&style!=='inmersivo'&&!['claro','oscuro'].includes(entry.opciones?.panelesSelector))entry.opciones={...entry.opciones,panelesSelector:['estudio-vivo','relato','recorrido'].includes(style)?'claro':'oscuro'};}
  ordered.push(entry);
 }
 for(const entry of remaining)if(entry.tipo!=='comercializacion')entry.activo=false;
 const contact=ordered.pop();
 return [...ordered,...remaining.filter(b=>b.tipo!=='comercializacion'),contact,...remaining.filter(b=>b.tipo==='comercializacion')];
}
// Older open editors import this flag. Visual changes now preserve blocks in every project.
export const preserveStyleBlocks=()=>true;
export function prepareStyleConfig(config,style,project={}){
 if(!STYLE_COMPOSITIONS[style])throw Error('Estilo desconocido');
 const next={...structuredClone(config),estilo:style};
 if(!next.bloques?.length)next.bloques=prepareStyleComposition([],style,project);
 return next;
}
// One disposable buyer preview for every style entry point. The live model is
// untouched until Confirmar; the caller owns its single undo checkpoint.
export function previewStyleChange({config,style,project={},lots=[],onConfirm}){
 const keep=Boolean(config.bloques?.length);
 // Dispose the previous preview (including its iframe and message listener)
 // even if two editor entry points or two module URLs initiate a change.
 document.dispatchEvent(new Event('miniweb-close-style-preview'));
 const candidate=prepareStyleConfig(config,style,project),name=DESIGN_STYLES.find(s=>s.id===style).name;
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Vista previa de '+name);
 dialog.style='position:fixed;inset:0;margin:0;width:100vw;max-width:none;height:100svh;max-height:none;padding:0;border:0;background:#0d1014;color:#eef0f2;font:14px/1.5 Inter,Arial,sans-serif';
 dialog.innerHTML=`<div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:16px 24px;border-bottom:1px solid #ffffff26"><strong style="margin-right:auto">Vista previa · ${e(name)}</strong><div role="group" aria-label="Ancho de la vista previa"><button type="button" data-preview-width="1440" aria-pressed="true">1440 px</button><button type="button" data-preview-width="390" aria-pressed="false">390 px</button></div><button type="button" data-style-cancel>Cancelar</button><button type="button" data-style-confirm disabled>Confirmar ${e(name)}</button><p role="status" style="width:100%;margin:0" data-preview-status>Preparando la página completa. Sus cambios actuales se conservan.</p></div><div data-style-viewport style="overflow:auto;height:calc(100% - 118px);display:flex;justify-content:center;padding:12px;box-sizing:border-box"><div data-style-frame-wrap><iframe title="Página completa · ${e(name)}" allowfullscreen allow="fullscreen 'self'" src="/admin/miniweb-editor.html?canvas=1&v=20261117-cierre-venta1" style="display:block;border:0;transform-origin:top left;background:#fff"></iframe></div></div>`;
 dialog.querySelectorAll('button').forEach(b=>b.style='min-height:44px;padding:10px 16px;border:1px solid #ffffff42;border-radius:6px;background:#14171b;color:#eef0f2;font:inherit;cursor:pointer');
 const frame=dialog.querySelector('iframe'),viewport=dialog.querySelector('[data-style-viewport]'),wrap=dialog.querySelector('[data-style-frame-wrap]'),confirm=dialog.querySelector('[data-style-confirm]'),status=dialog.querySelector('[data-preview-status]');
 dialog.style.display='flex';dialog.style.flexDirection='column';dialog.style.overflow='hidden';
  viewport.style.cssText='flex:1;min-height:0;display:flex;justify-content:center;padding:12px;overflow:hidden;box-sizing:border-box';
  frame.title='Página completa · '+name;frame.tabIndex=0;
 let width=1440,closed=false;
 const fit=()=>{const scale=Math.min(1,Math.max(1,viewport.clientWidth-24)/width),height=Math.max(300,viewport.clientHeight-24);wrap.style.cssText=`width:${width*scale}px;height:${height}px`;frame.style.width=width+'px';frame.style.height=height/scale+'px';frame.style.transform=`scale(${scale})`};
 const observer=new ResizeObserver(fit);
 const close=()=>{if(closed)return;closed=true;document.removeEventListener('miniweb-close-style-preview',close);clearTimeout(timer);observer.disconnect();window.removeEventListener('message',receive);dialog.close();dialog.remove()};
 document.addEventListener('miniweb-close-style-preview',close,{once:true});
 const receive=event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||closed)return;const data=event.data;if(data.type==='ready')frame.contentWindow.postMessage({type:'render',config:candidate,project,lots,previewAnimations:true},location.origin);if(data.type==='rendered'){clearTimeout(timer);confirm.disabled=false;status.textContent=keep?'Recorra su página. Sólo cambia el estilo; se conservan las secciones, su orden y contenido.':'Recorra la página antes de confirmar. Después podrá deshacer el cambio.'}if(data.type==='previewError'){status.textContent='No se pudo mostrar la página. Cancele y vuelva a intentar; su edición sigue intacta.';confirm.disabled=true}};
 const timer=setTimeout(()=>{status.textContent='La vista previa está tardando. Puede cancelar y volver a intentar sin perder cambios.'},20000);
 window.addEventListener('message',receive);dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.querySelector('[data-style-cancel]').onclick=close;
 dialog.querySelectorAll('[data-preview-width]').forEach(button=>button.onclick=()=>{width=Number(button.dataset.previewWidth);dialog.querySelectorAll('[data-preview-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));fit()});
 confirm.onclick=()=>{if(confirm.disabled||closed)return;close();onConfirm(candidate)};document.body.append(dialog);dialog.showModal();observer.observe(viewport);fit();return close;
}
// Shared visual choices: the same palette tokens are used by the public renderer.
export function renderDesignChoices(config,project={}){
 const p=paletteTokens(config.paleta),photo=/^(https?:\/\/|\/[^/])/.test(project.foto_portada||'')?project.foto_portada:'',name=project.nombre||'Su proyecto';
 const vars=v=>`--choice-bg:${v.fondo};--choice-surface:${v.superficie};--choice-text:${v.texto};--choice-muted:${v.secondaryFondo};--choice-action:${v.actionBg};--choice-action-text:${v.actionFg};--choice-dark:${v.oscuro};--choice-inverse:${v.textoInverso}`;
 return `<div class="visual-design-choices" style="${vars(p)}"><h3>Estilo visual</h3><p>Pruebe su página en cada estilo. Sus bloques conservan el orden y el contenido.</p><div class="visual-style-grid" role="group" aria-label="Estilos visuales">${DESIGN_STYLES.map(style=>`<button type="button" class="visual-style-card" data-visual-style="${style.id}" aria-pressed="${style.id===config.estilo}"><span class="visual-style-mini" data-mini-style="${style.id}" aria-hidden="true">${photo?`<img src="${e(photo)}" alt="" loading="lazy">`:'<span class="visual-photo-empty"></span>'}<span class="visual-mini-title">${e(name)}</span><span class="visual-mini-copy"></span><span class="visual-mini-action"></span></span><span class="visual-choice-name">${style.name}${style.id===config.estilo?' ✓':''}</span><span class="visual-choice-description">${style.description}</span></button>`).join('')}</div><h3>Paleta de colores</h3><p>Vea los colores juntos y seleccione una paleta para probarla en la página.</p><div class="visual-palette-grid" role="group" aria-label="Paletas de colores">${MINIWEB_PALETTES.map(value=>{const v=paletteTokens(value.id);return `<button type="button" class="visual-palette-card" style="${vars(v)}" data-visual-palette="${v.id}" aria-pressed="${v.id===config.paleta}" aria-label="Paleta ${e(v.nombre)}"><span class="visual-palette-sample" aria-hidden="true"><b>Aa</b><span>Consultar</span></span><span class="visual-palette-strip" aria-hidden="true">${['fondo','superficie','texto','accion','oscuro'].map(k=>`<i style="background:${v[k]}"></i>`).join('')}</span><span class="visual-choice-name">${e(v.nombre)}${v.id===config.paleta?' ✓':''}</span></button>`}).join('')}</div><div class="visual-application"><h3>Así se aplica ${e(p.nombre)}</h3><div class="visual-application-example"><div><small>Fondo y texto</small><strong>${e(name)}</strong><span>Texto secundario</span><span class="visual-example-button">Consultar</span></div><div><small>Superficie de contenido</small><strong>El proyecto</strong><span>Información del desarrollo</span></div><footer>Secciones oscuras y cierre</footer></div><div class="visual-color-roles">${[['fondo','Fondo'],['superficie','Superficies'],['texto','Texto'],['actionBg','Botones'],['oscuro','Fondo oscuro']].map(([k,n])=>`<span><i style="background:${p[k]}"></i>${n}<code>${p[k]}</code></span>`).join('')}</div></div></div>`;
}
export function mountDesignChooser({container,config,project,lots=[],onChange}){
 const controls=document.createElement('section');controls.className='design-chooser';
 controls.innerHTML='<div data-visual-choices></div><button type="button" data-design-undo hidden>Deshacer cambio de plantilla</button>';
 container.querySelector('.settings-subtitle').after(controls);const undo=[];
 const sync=()=>{const active=controls.getRootNode().activeElement;const style=active?.dataset?.visualStyle,palette=active?.dataset?.visualPalette;controls.querySelector('[data-visual-choices]').innerHTML=renderDesignChoices(config,project);controls.querySelector('[data-design-undo]').hidden=!undo.length;if(style||palette)controls.querySelector(style?`[data-visual-style="${style}"]`:`[data-visual-palette="${palette}"]`)?.focus({preventScroll:true})};
 const assign=next=>{for(const key of Object.keys(config))delete config[key];Object.assign(config,next);onChange();sync()};
 sync.previewStyle=style=>previewStyleChange({config,style,project,lots,onConfirm:next=>{undo.push(structuredClone(config));assign(next)}});
 controls.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.visualStyle){sync.previewStyle(button.dataset.visualStyle);return}if(button.dataset.visualPalette){config.paleta=button.dataset.visualPalette;onChange()}if(button.hasAttribute('data-design-undo')&&undo.length)assign(undo.pop())});sync();return sync;
}
export {applyMiniwebPalette};

// Four public experiences. Blocks, IDs, data and their handlers remain canonical.
// The horizontal chapters never wrap the interactive map or consultation form.
export function mountReferenceExperience(scope,{app,editing=false}={}){
 const style=app?.dataset.styleBody;
 if(!['inmersivo','estudio-vivo','relato','recorrido'].includes(style))return ()=>{};
 const controller=new AbortController(),{signal}=controller,reduced=matchMedia('(prefers-reduced-motion:reduce)'),wide=matchMedia('(min-width:1000px)'),animations=[],wrapped=[];
 const clamp=v=>Math.max(0,Math.min(1,v));let frame=0;
 if(editing){
  if(style==='inmersivo')return ()=>{};
  app.dataset.experience=style;
  return ()=>{delete app.dataset.experience};
 }
 if(style==='inmersivo')app.classList.add('immersive-reader');
 else app.dataset.experience=style;
 const easing=style==='inmersivo'?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.23,1,.32,1)';
 const title=scope.querySelector('.identity-cover h1')||scope.querySelector('.hero-copy h1');
 if(title&&!reduced.matches){
  const text=title.textContent;title.setAttribute('aria-label',text);
  title.replaceChildren(...text.split(/\s+/).map((word,i)=>{const mask=document.createElement('span'),ink=document.createElement('span');mask.className='title-window';ink.textContent=word+' ';ink.setAttribute('aria-hidden','true');mask.append(ink);animations.push(ink.animate([{transform:'translateY(105%)'},{transform:'translateY(0)'}],{duration:1050,delay:120+i*110,easing,fill:'backwards'}));return mask}));
  wrapped.push(()=>{title.textContent=text;title.removeAttribute('aria-label')});
 }
 const expanding=style==='estudio-vivo'?[...scope.querySelectorAll('.hero-media,.scene-viewport,.lugar-hero')]:[];
 const photographs=style==='inmersivo'&&!app.hasAttribute('data-composicion-terrazas')?[...scope.querySelectorAll('.par>figure,.proyecto>figure,.lugar-duo>figure')]:style==='relato'?[...scope.querySelectorAll('.par>figure,.photo-grid>figure')]:[];
 const reveals=style==='inmersivo'?scope.querySelectorAll('.proyecto>figure,.lugar-duo>figure'):style==='relato'?scope.querySelectorAll('.par>.grande,.proyecto>figure,.intro>small'):style==='estudio-vivo'?scope.querySelectorAll('.perspective-block,.proyecto>figure'):[];
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;observer.unobserve(entry.target);if(reduced.matches)continue;const frames=style==='relato'?[{opacity:0,clipPath:'inset(0 0 85% 0)'},{clipPath:'inset(0)'}]:style==='estudio-vivo'?[{opacity:0,clipPath:'inset(8% 12% round 24px)'},{clipPath:'inset(0 round 24px)'}]:[{clipPath:'inset(8% 4%)',opacity:.75},{clipPath:'inset(0)',opacity:1}];animations.push(entry.target.animate(frames,{duration:1200,easing}))}},{threshold:.15});reveals.forEach(n=>observer.observe(n));
 if(style==='estudio-vivo')scope.addEventListener('click',event=>{if(!event.target.closest('[data-perspective-go]')||reduced.matches)return;const picture=event.target.closest('.perspective-block')?.querySelector('[data-perspective-panel]:not([hidden]) img');if(picture)animations.push(picture.animate([{clipPath:'inset(0 100% 0 0)',transform:'scale(1.04)'},{clipPath:'inset(0)',transform:'scale(1)'}],{duration:650,easing}))},{signal});
 const paint=()=>{
  frame=0;const active=!reduced.matches,desktop=active&&wide.matches,h=innerHeight;
  for(const node of expanding){const section=node.closest('[data-block-id]'),r=section.getBoundingClientRect();const progress=active?clamp((h-r.top)/h):1;node.style.setProperty('--frame-inset',`${(1-progress)*12}%`)}
  for(const [i,node]of photographs.entries()){const r=node.getBoundingClientRect();if(r.bottom<0||r.top>h)continue;const y=desktop?(clamp((h-r.top)/(h+r.height))-.5)*(style==='relato'?110:65)*(i%2?-1:1):0;node.style.setProperty('--photo-drift',`${y}px`)}
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint)};
 window.addEventListener('scroll',schedule,{passive:true,signal});window.addEventListener('resize',schedule,{passive:true,signal});reduced.addEventListener('change',schedule,{signal});wide.addEventListener('change',schedule,{signal});scope.addEventListener('load',schedule,{capture:true,signal});document.fonts.ready.then(()=>{if(!signal.aborted)schedule()});paint();
 reduced.addEventListener('change',()=>{if(reduced.matches)animations.forEach(a=>a.cancel())},{signal});
 return ()=>{controller.abort();observer.disconnect();cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());wrapped.forEach(f=>f());for(const node of expanding)node.style.removeProperty('--frame-inset');for(const node of photographs)node.style.removeProperty('--photo-drift');delete app.dataset.experience;app.classList.remove('immersive-reader')};
}
