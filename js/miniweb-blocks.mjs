import {upgradePanoramaTexture} from './recorrido-visor-medios.mjs?v=20261114-media1';
import {automatic360Enabled,immediateImmersiveTour,observeAutomatic360,interactiveSectionCopy,applyInteractiveHeadingStyle} from './miniweb-360.mjs?v=20261117-cierre-venta1';
import {lotTitle} from './ficha-lote-recorrido.mjs';
import {mountEstudio} from './miniweb-estudio.mjs?v=20261113-estudio9';
import {mountRelato} from './miniweb-relato.mjs';
import {unitPrice,unitPriceText,unitPriceLabel} from './lote-precio.mjs';
import {projectTourUrl} from './recorrido-enlaces.mjs';
import {availabilityColor,projectAvailability,estados} from './recorrido-estilo.mjs';
import {mountLotTools} from './miniweb-herramientas-lotes.mjs?v=20261113-imageplan1';
import {VISUAL_TYPES,visualResourceControls,renderVisualResource,mountVisualResources} from './miniweb-effects.mjs?v=20261030-editor-r3';
import {ALAMOS_RENDERS,REGIONAL_PHOTOS} from './miniweb-media.mjs';
import {CONTEXT_PHOTOS} from './miniweb-contexto.mjs';
import {COVER_MEDIA,renderMediaBlock,renderPhotoStory,mountDesignResources,mountImmersiveMotion,mountReferenceExperience,renderAerialApproach,applyBlockLayout,blockLayoutControls,stylePresentationPlan,estudioPhotoConflicts,estudioGalleryPhotos,estudioIntroCopy} from './miniweb-design.mjs?v=20261117-cierre-venta1';
// Public sales blocks. Commercial data remains in the project / lot records.
export const BLOCK_TYPES={
 ...VISUAL_TYPES,
 video:{nombre:'Video',variantes:['a-sangre','contenida'],repeat:true},
 imagen:{nombre:'Imagen',variantes:['a-sangre','contenida'],repeat:true},
 perspectivas:{nombre:'Fotos con pestañas',variantes:['pestanas','miniaturas'],repeat:true},
 capitulos:{nombre:'Relato con fotos',variantes:['lectura','apilada'],repeat:true},
 intro:{nombre:'Introducción',variantes:['centrada','izquierda'],repeat:true},
 'par-fotos':{nombre:'Par de fotos asimétrico',variantes:['grande-izquierda','grande-derecha','paisaje-detalle'],repeat:true},
 'asi-se-vive':{nombre:'Galería de fotos',variantes:['banda','editorial','mosaico','carrusel','tira','ritmo','franjas','experiencias','album'],repeat:true},
 escenas:{nombre:'Imagen fija o secuencia',variantes:['fija','barrido','apilada','acercamiento'],repeat:true},
 portada:{nombre:'Portada',variantes:['a-sangre','compacta'],fijo:true},
 'foto-texto':{nombre:'Foto + título + texto',variantes:['foto-derecha','foto-izquierda','apilada','dos-tercios'],repeat:true},
 cifras:{nombre:'Cifras',variantes:['franja','celdas','barra'],legacy:'facts'},
 'foto-frase':{nombre:'Foto grande con frase',variantes:['a-sangre','contenida','banda'],repeat:true},
 'foto-frase-lateral':{nombre:'Foto + frase lateral',variantes:['foto-izquierda','foto-derecha','apilada'],repeat:true},
 galeria:{nombre:'Galería de fotos',variantes:['banda','editorial','mosaico','carrusel','tira','ritmo','franjas','experiencias','album'],legacy:'gallery',repeat:true},
 experiencias:{nombre:'Experiencias',variantes:['albumes'],repeat:true},
 explorador:{nombre:'Explorador de lotes',variantes:['mapa-lista','lista','tarjetas','sectores','tabla']},
 ubicacion:{nombre:'Dónde queda',variantes:['foto-tarjeta','mapa','texto']},
 servicios:{nombre:'Servicios',variantes:['lista','grilla','fichas'],legacy:'projectDetails'},
 'ficha-tecnica':{nombre:'Ficha técnica',variantes:['tabla','columnas'],legacy:'projectDetails'},
 cronograma:{nombre:'Cronograma',variantes:['texto','acordeon'],legacy:'projectDetails'},
 financiacion:{nombre:'Financiación y condiciones',variantes:['columnas','acordeon'],legacy:'projectDetails'},
 plano:{nombre:'Plano documental',variantes:['expandible','abierto'],legacy:'masterplan'},
 contacto:{nombre:'Contacto',variantes:['formulario','compacto']},
 panoramica360:{nombre:'Panorámica 360',variantes:['contenida','a-sangre','foto-texto','recorrido'],repeat:true},
 comercializacion:{nombre:'Inmobiliarias e información profesional',variantes:['editorial','panoramica'],fijo:true}
};
Object.setPrototypeOf(BLOCK_TYPES,null);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
export function setBlockPanorama(block,value){
 if(typeof value==='string'){
  if(block.medio!==value)delete block.contenido.panorama;
  block.medio=value;
 }else{
  block.medio=value.web;
  block.contenido.panorama={web:value.web,alta:value.alta,miniatura:value.miniatura};
 }
}
export function normalizeBlocks(raw={}){
 const initial=Object.entries(BLOCK_TYPES).filter(([t])=>!['panoramica360','video','imagen','perspectivas','capitulos','experiencias',...Object.keys(VISUAL_TYPES)].includes(t)).map(([tipo,s])=>({id:tipo+'-1',tipo,activo:!['foto-frase','foto-frase-lateral','intro','par-fotos','asi-se-vive','escenas'].includes(tipo)&&(!s.legacy||raw.modulos?.[s.legacy]!==false),variante:['galeria','asi-se-vive'].includes(tipo)&&raw.estilo==='paisaje'?'editorial':s.variantes[0],fuente:'proyecto'}));
 const used=new Set();const list=(Array.isArray(raw.bloques)?raw.bloques:initial).map((value,i)=>{const b=object(value),tipo=b.tipo==='representantes'?'comercializacion':b.tipo==='atmosfera'?'foto-frase':typeof b.tipo==='string'?b.tipo:'desconocido';let id=typeof b.id==='string'&&/^[\w-]{1,80}$/.test(b.id)?b.id:tipo.replace(/[^\w-]/g,'')+'-'+(i+1);while(used.has(id))id+='-c';used.add(id);return {...b,id,tipo,activo:tipo==='comercializacion'||b.activo!==false,variante:tipo==='comercializacion'&&b.variante==='logos'?'editorial':typeof b.variante==='string'?b.variante:['asi-se-vive','galeria'].includes(tipo)&&raw.estilo==='paisaje'?'editorial':BLOCK_TYPES[tipo]?.variantes[0],contenido:{...object(b.contenido)},opciones:{...object(b.opciones)}}});
 for(const block of list){
  const photos=block.contenido.fotos;
  if(Array.isArray(photos))block.contenido.fotos=Array.from(photos,photo=>photo??{});
 }
 const fixed=list.find(b=>b.tipo==='comercializacion')||{id:'comercializacion-fija',tipo:'comercializacion',activo:true,variante:'editorial',contenido:{},opciones:{}};
 const hero=list.find(b=>b.tipo==='portada')||{id:'portada-fija',tipo:'portada',activo:true,variante:'a-sangre',contenido:{},opciones:{}};
 hero.activo=true;fixed.activo=true;
 if(!raw.controlBloques){for(const b of list){const legacy=BLOCK_TYPES[b.tipo]?.legacy;if(legacy&&raw.modulos?.[legacy]===false&&!BLOCK_TYPES[b.tipo]?.fijo)b.activo=false;if(b.tipo==='explorador'&&raw.modulos?.interactiveMap===false)b.opciones.mostrarMapa='no'}}
 return [hero,...list.filter(b=>!['portada','comercializacion'].includes(b.tipo)),fixed];
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fileLabel=v=>{try{return decodeURIComponent(String(v).split('/').pop())}catch{return String(v).split('/').pop()}};
const photoKey=url=>String(url||'').split('?')[0].replace(/^https?:\/\/[^/]+/,'');
const contextPhoto=url=>CONTEXT_PHOTOS.find(photo=>photoKey(photo.url)===photoKey(url));
const photoButton=(photo,value,field,index,selected)=>`<button type="button" data-bank-choice="${esc(value)}" data-bank-field="${esc(field)}" data-bank-index="${esc(index)}" aria-label="Usar ${esc(photo.nombre)}" aria-pressed="${photoKey(value)===photoKey(selected)}">${photo.url?`<img src="${esc(photo.miniatura||photo.url)}" alt="" loading="lazy">`:'<span class="editor-photo-none">Sin imagen</span>'}<span class="editor-photo-name">${esc(photo.nombre)}</span></button>`;
export function switchPhotoBank(button){
 const bank=button.closest('.editor-photo-bank');if(!bank)return;
 const source=button.dataset.bankTab,context=bank.querySelector('[data-bank-group="contexto"]');
 if(source==='contexto'&&!context.childElementCount)context.innerHTML=CONTEXT_PHOTOS.map(photo=>photoButton(photo,photo.url,bank.dataset.bankField,bank.dataset.bankIndex,bank.dataset.selected)).join('');
 bank.querySelectorAll('[data-bank-tab]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.bankTab===source)));
 bank.querySelectorAll('[data-bank-group]').forEach(group=>group.hidden=group.dataset.bankGroup!==source);
 bank.querySelector('[data-context-help]').hidden=source!=='contexto';
}
export function editableBlockPhoto(block,index,source=block.contenido.fotos){
 const position=Number(index);
 if(!Number.isInteger(position)||position<0||position>99)return null;
 const photos=Array.isArray(source)?source:[];
 // The empty gallery offers four slots. Keep that capacity when its first image is chosen.
 if(['galeria','asi-se-vive'].includes(block.tipo)&&!photos.length&&!Number(block.opciones?.cantidadFotos)){
  (block.opciones??={}).cantidadFotos=4;
 }
 block.contenido.fotos=Array.from({length:Math.max(photos.length,position+1)},(_,i)=>
  typeof photos[i]==='string'?{url:photos[i]}:{...object(photos[i])});
 return block.contenido.fotos[position];
}
export function selectBlockPhoto(block,field,index,url,fallback=[]){
 let target=block.contenido,key=field;
 if(field==='photo'){
  target=editableBlockPhoto(block,index,Array.isArray(block.contenido.fotos)?block.contenido.fotos:fallback);
  if(!target)return;
  key='url';
 }
 target[key]=url;
 const captionKey=field==='imagenDetalle'?'pieDetalle':'pie';
 if(contextPhoto(url)&&!target[captionKey])target[captionKey]='Fotografía de contexto';
 else if(!contextPhoto(url)&&target[captionKey]==='Fotografía de contexto')delete target[captionKey];
}
const has=v=>v!==undefined&&v!==null&&v!=='';
const PHOTO_FRAMES={centro:'50% 50%',arriba:'50% 0%',abajo:'50% 100%',izquierda:'0% 50%',derecha:'100% 50%',completa:'50% 50%'};
const photoFrame=f=>Object.hasOwn(PHOTO_FRAMES,f.encuadre)?f.encuadre:'centro';
const photoAttrs=(f,explicitCrop=false)=>{
 const frame=photoFrame(f);
 const fit=frame==='completa'?'object-fit:contain;':explicitCrop&&Object.hasOwn(PHOTO_FRAMES,f.encuadre)?'object-fit:cover;':'';
 return `data-photo-frame="${frame}" style="object-position:${PHOTO_FRAMES[frame]};${fit}"`;
};


// Shared by the real block editor and the local compositions. Native page scrolling;
// no scroll interception, foreign imagery, animation library or database writes.
export function renderScrollScenes(b,{media=v=>v,href=()=>''}={}){
 const photos=(Array.isArray(b.contenido?.fotos)?b.contenido.fotos:[]).slice(0,b.variante==='fija'?1:Math.max(1,Math.min(4,Number(b.opciones?.cantidadFotos)||4))).map(f=>typeof f==='string'?{url:f}:f).filter(f=>media(f.url));
 if(!photos.length)return '';
 const index=(current,buttons=false)=>`<ol class="scene-index">${photos.map((f,i)=>`<li ${i===current?'class="is-current"':''}>${buttons?`<button type="button" data-scene-go="${i}" aria-pressed="${i===current}">${esc(f.titulo||'Escena '+(i+1))}</button>`:`<span>${esc(f.titulo||'Escena '+(i+1))}</span>`}</li>`).join('')}</ol>`;
 return `<div class="editorial-scenes" data-scene-count="${photos.length}" data-scene-approach="${b.variante==='acercamiento'}" data-scene-motion="${photos.length>1&&['barrido','acercamiento'].includes(b.variante)&&b.opciones?.movimiento!=='no'}" data-scene-index="${photos.length>1&&b.opciones?.indice!=='no'}"><div class="scene-viewport">${photos.map((f,i)=>{const target=href(f.destino),sceneTitle=f.titulo||(i===0?b.contenido.titulo:'');return `<article class="scene-panel" data-scene-panel="${i}"><div class="scene-image"><img ${photoAttrs(f)} src="${esc(media(f.url))}" alt="${esc(f.alt||f.titulo||'')}" loading="lazy" width="2200" height="1238"></div><div class="scene-copy">${b.contenido.rotulo?`<p class="scene-kicker">${esc(b.contenido.rotulo)}</p>`:''}<div class="scene-mobile-index">${index(i)}</div>${sceneTitle?`<h2>${esc(sceneTitle)}</h2>`:''}${f.texto?`<p class="scene-description">${esc(f.texto)}</p>`:''}<div class="scene-actions">${target&&f.boton?`<a class="scene-action" href="${esc(target)}">${esc(f.boton)} <span aria-hidden="true">↗</span></a>`:''}</div>${f.pie?`<p class="scene-caption">${esc(f.pie)}</p>`:''}</div></article>`}).join('')}<nav class="scene-navigation" aria-label="Escenas fotográficas">${index(0,true)}</nav></div></div>`;
}

export function renderRhythmGallery(b,{media=v=>v}={}){
 const photos=(Array.isArray(b.contenido?.fotos)?b.contenido.fotos:[]).slice(0,Math.max(1,Math.min(100,Number(b.opciones?.cantidadFotos)||100))).map(f=>typeof f==='string'?{url:f}:f).filter(f=>media(f.url));
 if(!photos.length)return '';
 return `<div class="editorial-gallery"><header>${b.contenido.rotulo?`<p class="editorial-kicker">${esc(b.contenido.rotulo)}</p>`:''}${b.contenido.titulo?`<h2>${esc(b.contenido.titulo)}</h2>`:''}${b.contenido.texto?`<p>${esc(b.contenido.texto)}</p>`:''}</header><div class="rhythm-track" tabindex="0" role="region" aria-label="Galería de fotografías">${photos.map((f,i)=>`<figure class="rhythm-photo ${i%2?'landscape':'portrait'}"><button type="button" data-image="${esc(media(f.url))}" data-image-title="${esc(f.alt||f.pie||'Fotografía')}" data-photo="${esc(media(f.url))}" data-caption="${esc(f.pie||f.alt||'Fotografía')}" aria-label="Ampliar ${esc(f.alt||'foto '+(i+1))}"><img ${photoAttrs(f)} src="${esc(media(f.url))}" alt="${esc(f.alt||'')}" loading="lazy" width="2200" height="1238"></button>${f.pie?`<figcaption>${esc(f.pie)}</figcaption>`:''}</figure>`).join('')}</div><div class="rhythm-controls"><button type="button" data-rhythm-step="-1" aria-label="Fotografías anteriores">←</button><button type="button" data-rhythm-step="1" aria-label="Fotografías siguientes">→</button><div class="rhythm-progress" aria-hidden="true"><span></span></div></div></div>`;
}

function landscapeStory(content, photos, media) {
 const valid=photos.filter(photo=>media(photo.url));
 if(!valid.length)return '';
 const picture=(photo,kind)=>`<figure class="landscape-${kind}"><img src="${esc(media(photo.url))}" ${photoAttrs(photo)} alt="${esc(photo.alt||'')}" loading="lazy">${photo.pie&&photo.mostrarPie!=='no'?`<figcaption>${esc(photo.pie)}</figcaption>`:''}</figure>`;
 return `<div class="landscape-story">${picture(valid[0],'main')}
  <div class="landscape-aside"><header>${content.rotulo?`<span class="eyebrow">${esc(content.rotulo)}</span>`:''}${content.titulo?`<h2>${esc(content.titulo)}</h2>`:''}${content.texto?`<p>${esc(content.texto)}</p>`:''}</header>
  ${valid[1]?picture(valid[1],'detail'):''}</div></div>`;
}

function serviceCards(content, services, labels) {
 const icons={luz_electrica:'M13 2 4 14h7l-1 8 9-12h-7z',agua_corriente:'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  gas_natural:'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',cloaca:'M4 7h9a4 4 0 0 1 4 4v9M4 12h5a3 3 0 0 1 3 3v5M4 5v9M15 20h4',wifi:'M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 19.5h.01'};
 const iconKeys={Luz:'luz_electrica',Agua:'agua_corriente',Gas:'gas_natural',Cloaca:'cloaca',Cloacas:'cloaca',Internet:'wifi','Fibra óptica':'wifi'};
 const iconFor=key=>{const name=String(key).split(' (')[0].trim(),id=Object.hasOwn(iconKeys,name)?iconKeys[name]:Object.hasOwn(iconKeys,key)?iconKeys[key]:key;return Object.hasOwn(icons,id)?icons[id]:'m4 12 5 5L20 6'};
 const tiles=services.map(key=>`<li><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.25" aria-hidden="true"><path d="${iconFor(key)}"/></svg><span>${esc(labels[key]||key)}</span></li>`);
 return `<div class="service-cards"><header><h2>${esc(content.titulo||'Servicios')}</h2>${content.texto?`<p>${esc(content.texto)}</p>`:''}</header><ul>${tiles.join('')}</ul></div>`;
}

// Autoría de álbumes del bloque Experiencias. El nombre vive en cada foto (experiencia) y el orden de los álbumes es el de su primera foto.
const albumName=photo=>String(photo?.experiencia||contextPhoto(photo?.url)?.categoria||'El lugar').trim()||'El lugar';
const albumPhotos=block=>(Array.isArray(block.contenido.fotos)?block.contenido.fotos:[]).map(f=>typeof f==='string'?{url:f}:{...f});
export function albumNames(block){const names=[];for(const photo of albumPhotos(block).filter(f=>f.url)){const name=albumName(photo);if(!names.includes(name))names.push(name)}return names}
// Un nombre ya usado por otro álbum uniría sus fotos sin aviso: se compara sin distinguir mayúsculas ni acentos.
const albumKey=name=>String(name||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function albumNameTaken(block,from,to){const key=albumKey(to);return !!key&&albumNames(block).some(name=>name!==from&&albumKey(name)===key)}
export function renameAlbum(block,from,to){const name=String(to||'').trim();if(!name||name===from||albumNameTaken(block,from,name))return false;block.contenido.fotos=albumPhotos(block).map(photo=>photo.url&&albumName(photo)===from?{...photo,experiencia:name}:photo);return true}
export function moveAlbum(block,name,step){const photos=albumPhotos(block),names=albumNames(block),from=names.indexOf(name),to=from+step;if(from<0||to<0||to>=names.length)return false;[names[from],names[to]]=[names[to],names[from]];block.contenido.fotos=[...names.flatMap(album=>photos.filter(f=>f.url&&albumName(f)===album)),...photos.filter(f=>!f.url)];return true}
// Un solo visor para todas las galerías con álbum (regla 10 de las miniwebs).
const PHOTO_VIEWER=`<dialog class="experience-viewer" aria-label="Álbum de fotos"><header><h2></h2><button type="button" data-album-close aria-label="Cerrar álbum" autofocus>×</button></header>
   <img class="experience-photo" alt=""><footer><p aria-live="polite"></p><nav aria-label="Fotos del álbum"><button type="button" data-step="-1" aria-label="Foto anterior">←</button><output></output><button type="button" data-step="1" aria-label="Foto siguiente">→</button></nav></footer></dialog>`;
// Variante «álbum»: una foto grande, las miniaturas y el acceso al visor. Todas las fotos del bloque forman un único álbum.
function albumGallery(block, photos, media) {
 const content=block.contenido,name=String(content.titulo||'Fotos').trim()||'Fotos';
 const items=photos.map(photo=>({url:media(photo.url),alt:photo.alt||contextPhoto(photo.url)?.nombre||name,pie:photo.mostrarPie==='no'||block.opciones.textosFotos==='ocultos'?'':photo.pie||''}));
 if(!items.length)return '';
 const total=items.length+' '+(items.length===1?'foto':'fotos');
 const header=block.opciones.textosCabecera==='no'?'':`<header>${content.titulo?`<h2>${esc(content.titulo)}</h2>`:''}${content.texto?`<p>${esc(content.texto)}</p>`:''}</header>`;
 const thumbs=items.slice(0,9).map((item,i)=>`<button class="experience-cover album-thumb" type="button" data-start="${i}" aria-pressed="${i===0}" aria-label="Mostrar la foto ${i+1} de ${items.length}"><span class="experience-frame"><img loading="lazy" src="${esc(item.url)}" alt=""></span></button>`).join('');
 return `<div class="experience-gallery album-gallery" data-album-name="${esc(name)}" data-album-photos="${esc(JSON.stringify(items))}">
  <button class="experience-cover album-main" type="button" aria-haspopup="dialog" data-start="0" aria-label="Abrir el álbum, ${total}"><span class="experience-frame"><img loading="lazy" src="${esc(items[0].url)}" alt="${esc(items[0].alt)}"></span></button>
  <div class="album-side">${header}<div class="album-thumbs">${thumbs}</div><div class="album-foot"><output class="album-count" aria-live="polite">Foto 1 de ${items.length}</output><button class="experience-cover album-open" type="button" aria-haspopup="dialog" data-start="0">${items.length===1?'Ampliar foto':'Ver las '+total}</button></div></div>
  ${PHOTO_VIEWER}</div>`;
}

function experienceGallery(block, photos, media) {
 const albums=new Map();
 for(const photo of photos){
  const theme=albumName(photo);
  if(!albums.has(theme))albums.set(theme,[]);
  albums.get(theme).push({url:media(photo.url),alt:photo.alt||contextPhoto(photo.url)?.nombre||theme,pie:photo.mostrarPie==='no'||block.opciones.textosFotos==='ocultos'?'':photo.pie||'',tapa:photo.tapa==='si'});
 }
 const covers=Array.from(albums,([name,items])=>{
  const cover=items.find(item=>item.tapa)||items[0];
  return `<button class="experience-cover" type="button" aria-haspopup="dialog" data-experience-name="${esc(name)}" data-experience-photos="${esc(JSON.stringify(items))}">
   <span class="experience-frame"><img loading="lazy" src="${esc(cover.url)}" alt="${esc(cover.alt)}"></span>
   <span class="experience-caption"><span>${esc(name)}</span><small>${items.length} ${items.length===1?'foto':'fotos'}</small></span></button>`;
 }).join('');
 const content=block.contenido;
 const header=block.opciones.textosCabecera==='no'?'':`<header>${content.titulo?`<h2>${esc(content.titulo)}</h2>`:''}${content.texto?`<p>${esc(content.texto)}</p>`:''}</header>`;
 return `<div class="experience-gallery">${header}<div class="experience-grid">${covers}</div>
  ${PHOTO_VIEWER}</div>`;
}

function mountExperienceGallery(gallery) {
 const dialog=gallery.querySelector('dialog'), image=dialog.querySelector('.experience-photo');
 let items=[], index=0;
 function show(position){
  index=(position+items.length)%items.length;
  const photo=items[index];
  image.src=photo.url;image.alt=photo.alt;
  dialog.querySelector('footer p').textContent=photo.pie||'';
  dialog.querySelector('output').textContent=(index+1)+' / '+items.length;
 }
 function onClick(event){
  const cover=event.target.closest('.experience-cover');
  // Álbum: una miniatura elige la foto grande; la foto grande y el botón abren el visor en esa foto.
  if(cover?.classList.contains('album-thumb')){
   const photos=JSON.parse(gallery.dataset.albumPhotos),at=Number(cover.dataset.start)||0,photo=photos[at];if(!photo)return;
   const main=gallery.querySelector('.album-main'),picture=main.querySelector('img');picture.src=photo.url;picture.alt=photo.alt;
   for(const opener of [main,gallery.querySelector('.album-open')])opener.dataset.start=at;
   for(const thumb of gallery.querySelectorAll('.album-thumb'))thumb.setAttribute('aria-pressed',String(thumb===cover));
   gallery.querySelector('.album-count').textContent='Foto '+(at+1)+' de '+photos.length;return;
  }
  if(cover){
   items=JSON.parse(cover.dataset.experiencePhotos||gallery.dataset.albumPhotos);const name=cover.dataset.experienceName||gallery.dataset.albumName;
   dialog.querySelector('h2').textContent=name;
   dialog.setAttribute('aria-label',name);
   dialog.querySelectorAll('[data-step]').forEach(button=>button.disabled=items.length<2);
   show(Number(cover.dataset.start)||0);dialog.showModal();return;
  }
  if(event.target.closest('[data-album-close]'))dialog.close();
  const step=event.target.closest('[data-step]');
  if(step&&dialog.open)show(index+Number(step.dataset.step));
 }
 function onKey(event){
  if(!dialog.open||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();show(index+(event.key==='ArrowRight'?1:-1));
 }
 gallery.addEventListener('click',onClick);dialog.addEventListener('keydown',onKey);
 return ()=>{if(dialog.open)dialog.close();gallery.removeEventListener('click',onClick);dialog.removeEventListener('keydown',onKey)};
}

const editorialResourceCSS=`
.miniweb.sale :is([data-variant=experiencias],[data-variant=album],[data-block-type=experiencias]){display:block;width:100%;max-width:none;margin-inline:0;padding:0;box-sizing:border-box;background:var(--pal-fondo,var(--bg));color:var(--pal-texto,var(--ink))}
.experience-gallery{box-sizing:border-box;width:100%;padding:0 clamp(24px,5vw,96px);background:var(--pal-fondo,#ecedee);color:var(--pal-texto,#2f2a25)}
.experience-gallery>header{display:block;margin:0 0 clamp(20px,2.7vw,40px)}
.experience-gallery>header h2{font:400 clamp(34px,3.6vw,54px)/1.08 var(--display,Georgia);margin:0}
.experience-gallery>header p{max-width:58ch;margin:10px 0 0}
.experience-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(22px,2.4vw,38px) clamp(12px,1.6vw,26px)}
.experience-grid .experience-cover{display:block;width:100%;min-width:0;padding:0;border:0;text-align:left;background:transparent;color:inherit;cursor:pointer}
.experience-frame{display:block;overflow:hidden;aspect-ratio:4/3}
.experience-frame img{display:block;width:100%;height:100%;object-fit:cover}
.experience-caption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:14px 0 0}
.experience-caption>span{font:600 13px/1.45 var(--sans,system-ui);text-transform:uppercase;letter-spacing:.1em}
.experience-caption small{font:400 13px/1.45 var(--sans,system-ui);white-space:nowrap}
.experience-gallery button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
@media(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference){
 .vfx-hover .experience-frame img{transition:scale var(--album-duration,700ms) cubic-bezier(.19,1,.22,1)}
 .vfx-hover .experience-cover:is(:hover,:focus-visible) .experience-frame img{scale:1.05}
}
.miniweb.sale dialog.experience-viewer{box-sizing:border-box;width:min(1200px,calc(100vw - 48px));max-width:none;height:fit-content;max-height:94dvh;border:0;padding:0;color:var(--pal-textoInverso,#f4f3ef);background:var(--pal-oscuro,#161b19);overflow:auto}
.miniweb.sale dialog.experience-viewer::backdrop{background:#101411e6}
.miniweb.sale dialog.experience-viewer header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px;padding:0 0 0 24px;border-bottom:1px solid #ffffff24}
.miniweb.sale dialog.experience-viewer header h2{margin:0;font:400 clamp(20px,1.6vw,24px)/1.2 var(--display,Georgia)!important;color:inherit!important}
.miniweb.sale dialog.experience-viewer button{min-width:44px;min-height:44px;border:0;background:transparent;color:inherit;cursor:pointer;font-size:22px}
.miniweb.sale dialog.experience-viewer button:is(:hover,:focus-visible){background:#ffffff14}
.miniweb.sale dialog.experience-viewer [data-album-close]{width:72px;height:72px;border-left:1px solid #ffffff24}
.miniweb.sale dialog.experience-viewer .experience-photo{display:block;width:auto;max-width:calc(100% - 168px);height:auto;max-height:min(68dvh,720px);object-fit:contain;margin:24px auto}
.miniweb.sale dialog.experience-viewer footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 24px 20px;background:transparent;color:inherit}
.miniweb.sale dialog.experience-viewer footer p{margin:0}
.miniweb.sale dialog.experience-viewer footer nav{display:contents}
.miniweb.sale dialog.experience-viewer [data-step]{position:absolute;top:calc(50% - 22px);width:44px;height:44px;font-size:26px}
.miniweb.sale dialog.experience-viewer [data-step="-1"]{left:18px}
.miniweb.sale dialog.experience-viewer [data-step="1"]{right:18px}
.miniweb.sale dialog.experience-viewer output{white-space:nowrap;font-variant-numeric:tabular-nums}
.album-gallery{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,4fr);gap:clamp(32px,4.5vw,72px);align-items:center}
.album-gallery .experience-cover{display:block;width:100%;min-width:0;padding:0;border:0;text-align:left;background:transparent;color:inherit;cursor:pointer}
.album-main .experience-frame{aspect-ratio:16/10}
.album-side>header{margin:0 0 24px}
.album-side>header h2{font:400 clamp(34px,3.6vw,54px)/1.08 var(--display,Georgia);margin:0}
.album-side>header p{max-width:58ch;margin:10px 0 0}
.album-thumbs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.album-thumb .experience-frame{aspect-ratio:1}
.album-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:24px}.album-count{margin:0;font:400 15px/1.4 var(--sans,system-ui);font-variant-numeric:tabular-nums}.album-thumb{opacity:.82}.album-thumb:is(:hover,[aria-pressed=true]){opacity:1}.album-thumb[aria-pressed=true]{outline:2px solid currentColor;outline-offset:2px}
.album-gallery .album-open{display:inline-flex;align-items:center;width:auto;min-height:48px;margin:0;padding:0 16px;border:1px solid color-mix(in srgb,currentColor 55%,transparent);border-radius:2px;font:600 15px/1 var(--sans,system-ui);letter-spacing:0;text-transform:none}
@media(max-width:760px){.album-gallery{grid-template-columns:minmax(0,1fr);gap:24px}.miniweb.sale dialog.experience-viewer{width:100vw;max-height:100dvh}.miniweb.sale dialog.experience-viewer .experience-photo{max-width:100%;margin:16px auto}.miniweb.sale dialog.experience-viewer [data-step]{position:static}.miniweb.sale dialog.experience-viewer footer nav{display:flex;align-items:center;gap:8px}}
@media(max-width:760px){.experience-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.experience-caption{display:block}.experience-caption small{display:block;margin-top:3px}.experience-viewer footer{flex-wrap:wrap}}
@media(max-width:480px){.experience-grid{grid-template-columns:1fr}.experience-caption{display:flex}.experience-caption small{margin:0}}

.editorial-scenes{position:relative;margin:0;width:100%;color:#fff;background:#16231e}
.editorial-scenes .scene-viewport{position:relative;width:100%}
.editorial-scenes .scene-panel{position:relative;height:100svh;min-height:620px;overflow:hidden;margin:0}
.editorial-scenes .scene-image{position:absolute;inset:0}
.editorial-scenes .scene-image img{display:block;width:100%;height:100%;object-fit:cover}
.editorial-scenes .scene-panel:after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(0,0,0,.69),transparent 72%)}
.editorial-scenes .scene-copy{position:absolute;z-index:1;left:clamp(24px,4vw,70px);bottom:48px;max-width:min(68%,920px);color:#fff}
.editorial-scenes .scene-copy h2{font:400 clamp(42px,5.4vw,88px)/1.03 'ogg',Georgia,serif;letter-spacing:-.035em;text-transform:uppercase;color:inherit;margin:20px 0 24px}
.editorial-scenes .scene-kicker{font:600 10px/1.6 'sweet-sans-pro',Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:inherit;margin:0}
.editorial-scenes .scene-description{font:400 16px/1.55 'neue-haas-grotesk-text',Arial,sans-serif;max-width:42ch;margin:0 0 24px;color:inherit}
.editorial-scenes .scene-actions{min-height:48px}
.editorial-scenes .scene-action{display:inline-flex;align-items:center;justify-content:space-between;gap:30px;min-height:48px;padding:13px 22px;border:1px solid #ffffff80;font:600 11px/1.5 'sweet-sans-pro',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:#fff;background:#00000016}
.editorial-scenes .scene-action:hover{background:#fff;color:#16231e}
.editorial-scenes .scene-caption{font:400 11px/1.45 'neue-haas-grotesk-text',Arial,sans-serif;color:#fff;margin:24px 0 0;max-width:55ch}
.editorial-scenes .scene-navigation{display:none;position:absolute;z-index:6;right:clamp(24px,4vw,70px);bottom:76px}
.editorial-scenes .scene-index{list-style:none;padding:0;margin:0;display:grid;gap:0}
.editorial-scenes .scene-index li{position:relative;padding-left:16px;color:#ffffffe6;text-shadow:0 1px 8px #000000a6}
.editorial-scenes .scene-index li.is-current{color:#fff;font-weight:600}
.editorial-scenes .scene-index li.is-current:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;position:absolute;left:0;top:20px}
.editorial-scenes .scene-index button,.editorial-scenes .scene-index span{font:400 13px/1.4 'neue-haas-grotesk-text',Arial,sans-serif;text-align:left;color:inherit;display:flex;align-items:center;min-height:44px;border:0;background:none;padding:8px 0;cursor:pointer}
.editorial-scenes .scene-mobile-index{margin-bottom:28px}
.editorial-scenes .scene-mobile-index .scene-index{display:grid;grid-template-columns:1fr;gap:0}
.editorial-scenes .scene-mobile-index .scene-index span{font-size:11px;min-height:24px;cursor:default;padding:3px 0}
.editorial-scenes .scene-mobile-index .scene-index li.is-current:before{top:10px}
.editorial-scenes[data-scene-index=false] :is(.scene-mobile-index,.scene-navigation){display:none!important}
.editorial-scenes :focus-visible,.editorial-gallery :focus-visible{outline:3px solid var(--pal-foco,#fff);outline-offset:5px}
@media(min-width:900px) and (prefers-reduced-motion:no-preference){
 .editorial-scenes.is-scroll-enhanced{height:var(--scene-length)}
 .editorial-scenes.is-scroll-enhanced .scene-viewport{position:sticky;top:0;height:100svh;overflow:hidden}
 .editorial-scenes.is-scroll-enhanced .scene-panel{position:absolute;inset:0;min-height:0;height:100%;will-change:transform}
 .editorial-scenes.is-scroll-enhanced .scene-image{will-change:transform}
 .editorial-scenes.is-scroll-enhanced .scene-navigation{display:block}
 .editorial-scenes.is-scroll-enhanced .scene-mobile-index{display:none}
}
.editorial-gallery{padding:110px 0 90px;color:var(--pal-texto,var(--ink,#243b2c));background:var(--pal-superficie,var(--paper,#f8f8f3));overflow:hidden}
.editorial-gallery>header{width:min(720px,calc(100% - 48px));margin:0 auto 75px;text-align:center}
.editorial-gallery>header h2{font:400 clamp(30px,3vw,44px)/1.15 'ogg',Georgia,serif;letter-spacing:-.025em;margin:18px 0 30px;color:inherit}
.editorial-gallery>header>p:not(.editorial-kicker){font:400 16px/1.6 'neue-haas-grotesk-text',Arial,sans-serif;color:inherit;margin:0}
.editorial-kicker{font:600 10px/1.5 'sweet-sans-pro',Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase}
.rhythm-track{display:flex;align-items:center;gap:clamp(20px,2.8vw,40px);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:0 max(24px,4vw) 24px;scrollbar-width:none}
.rhythm-track::-webkit-scrollbar{display:none}
.rhythm-track .rhythm-photo{flex:0 0 clamp(280px,34vw,500px);margin:0;scroll-snap-align:center;min-width:0}
.rhythm-track .rhythm-photo button{width:100%;border:0;padding:0;background:none;display:block;cursor:zoom-in;aspect-ratio:10/13}
.rhythm-track .rhythm-photo.landscape button{aspect-ratio:4/3}
.rhythm-track .rhythm-photo img{display:block;width:100%;height:100%;object-fit:cover}
.rhythm-track .rhythm-photo figcaption{font:400 11px/1.5 'neue-haas-grotesk-text',Arial,sans-serif;margin-top:14px;color:inherit}
.rhythm-controls{display:flex;align-items:center;gap:12px;margin:38px max(24px,10vw) 0}
.rhythm-controls button{width:44px;height:44px;flex:none;border:1px solid var(--pal-linea,#b9bdb4);color:inherit;background:transparent;cursor:pointer;font-size:20px}
.rhythm-controls button:disabled{opacity:.35;cursor:default}
.rhythm-progress{height:1px;flex:1;margin-left:28px;background:var(--pal-linea,#b9bdb4);overflow:hidden}
.rhythm-progress span{display:block;height:1px;background:currentColor;transform-origin:left;transform:scaleX(0)}
.miniweb.sale .photo-gallery[data-gallery-variant=ritmo]{width:100%;max-width:none;padding:0!important;margin:0!important}
.miniweb.sale [data-block-type=escenas]{width:100%;max-width:none;padding:0!important;margin:0!important}
@media(max-width:899px){
 .editorial-scenes .scene-panel{min-height:590px}
 .editorial-scenes .scene-copy{left:24px;right:24px;bottom:28px;max-width:none}
 .editorial-scenes .scene-copy h2{font-size:clamp(34px,9.6vw,50px);margin:14px 0 22px;overflow-wrap:break-word}
 .editorial-scenes .scene-description{font-size:15px}
 .editorial-scenes .scene-caption{font-size:10px;margin-top:18px}
 .editorial-gallery{padding:76px 0 60px}
 .editorial-gallery>header{margin-bottom:42px}
 .rhythm-track .rhythm-photo{flex-basis:78vw}
 .rhythm-controls{margin-top:22px}
}
@media(prefers-reduced-motion:reduce){.editorial-scenes *,.editorial-gallery *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;

export function mountEditorialResources(scope){
 let sheet=scope.querySelector('[data-editorial-resource-style]');
 if(!sheet){sheet=document.createElement('style');sheet.dataset.editorialResourceStyle='';sheet.textContent=editorialResourceCSS;(scope.head||scope).append(sheet)}
 const rootNode=scope.getRootNode(),scroller=rootNode.host?.closest('dialog')||window,scrollTop=()=>scroller===window?scrollY:scroller.scrollTop,scrollOffset=()=>scroller===window?0:scroller.getBoundingClientRect().top;
 const disposers=Array.from(scope.querySelectorAll('.experience-gallery'),mountExperienceGallery),reduced=matchMedia('(prefers-reduced-motion:reduce)'),wide=matchMedia('(min-width:900px)');
 scope.querySelectorAll('.editorial-scenes').forEach(section=>{
  const panels=[...section.querySelectorAll('.scene-panel')],viewport=section.querySelector('.scene-viewport'),buttons=[...section.querySelectorAll('[data-scene-go]')];let frame=0,active=-1;
  const update=()=>{frame=0;const animated=wide.matches&&!reduced.matches&&section.dataset.sceneMotion==='true';section.classList.toggle('is-scroll-enhanced',animated);section.style.setProperty('--scene-length',`${Math.max(2,panels.length-1)*100}svh`);
   if(!animated){panels.forEach(p=>{p.style.transform='';p.querySelector('.scene-image').style.transform='';p.inert=false;p.removeAttribute('aria-hidden')});active=-1;return}
   const r=section.getBoundingClientRect(),height=viewport.clientHeight,travel=Math.max(1,r.height-height),progress=Math.max(0,Math.min(panels.length-1,(scrollOffset()-r.top)/travel*(panels.length-1))),next=Math.min(panels.length-1,Math.floor(progress+.55));
   panels.forEach((panel,i)=>{const y=i===0?0:Math.max(0,Math.min(1,i-progress))*height;panel.style.transform=`translate3d(0,${y}px,0)`;panel.querySelector('.scene-image').style.transform=section.dataset.sceneApproach==='true'?`scale(${1+Math.max(0,Math.min(1,progress-i))*.22})`:`translate3d(0,${-y*.5}px,0)`;if(next!==active){panel.inert=i!==next;panel.setAttribute('aria-hidden',String(i!==next))}});
   if(next!==active){buttons.forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===next));b.parentElement.classList.toggle('is-current',i===next)});active=next}
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
  const navigate=event=>{const button=event.target.closest('[data-scene-go]');if(!button)return;const n=Number(button.dataset.sceneGo),r=section.getBoundingClientRect(),travel=r.height-viewport.clientHeight;scroller.scrollTo({top:scrollTop()+r.top-scrollOffset()+travel*n/Math.max(1,panels.length-1),behavior:reduced.matches?'instant':'smooth'})};
  section.addEventListener('click',navigate);scroller.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);reduced.addEventListener('change',schedule);wide.addEventListener('change',schedule);update();
  disposers.push(()=>{cancelAnimationFrame(frame);section.removeEventListener('click',navigate);scroller.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);reduced.removeEventListener('change',schedule);wide.removeEventListener('change',schedule)});
 });
 scope.querySelectorAll('.editorial-gallery').forEach(gallery=>{
  const track=gallery.querySelector('.rhythm-track'),bar=gallery.querySelector('.rhythm-progress span'),buttons=[...gallery.querySelectorAll('[data-rhythm-step]')];
  const update=()=>{const extent=track.scrollWidth-track.clientWidth;bar.style.transform=`scaleX(${extent<=0?1:Math.min(1,(track.scrollLeft+track.clientWidth)/track.scrollWidth)})`;buttons[0].disabled=track.scrollLeft<2;buttons[1].disabled=track.scrollLeft>=extent-2};
  const move=event=>{const button=event.target.closest('[data-rhythm-step]');if(button)track.scrollBy({left:Number(button.dataset.rhythmStep)*(track.querySelector('figure').getBoundingClientRect().width+parseFloat(getComputedStyle(track).columnGap)),behavior:reduced.matches?'instant':'smooth'})};
  track.addEventListener('scroll',update,{passive:true});gallery.addEventListener('click',move);window.addEventListener('resize',update);update();
  disposers.push(()=>{track.removeEventListener('scroll',update);gallery.removeEventListener('click',move);window.removeEventListener('resize',update)});
 });
 return ()=>disposers.forEach(f=>f());
}

export function mountBlocks({app,root,config,hasMap,hasMapPhoto,hasGeometry,hasUnavailableLots=false,parcelKey,project:p,lots,compare,editing=false,visualEditor=false,uploadMedia,safeUrl,serviceLabels,onChange,onSelection,onTourLot,getSelected}){
 const $=id=>root.getElementById(id),old=[$('proyecto'),$('projectDetails'),$('gallery'),$('contacto')],original={portada:$('inicio'),cifras:$('facts'),explorador:$('lotes'),plano:$('masterplan')};
 app.classList.add('sale');
 const landscape=()=>app.dataset.style==='paisaje';
 const cleanImmersive=()=>config.estilo==='inmersivo'&&!['alamos','aldea-los-huemules'].includes(p.slug);
 const editorialPhotos=b=>(Array.isArray(b.contenido.fotos)?b.contenido.fotos:b.tipo==='galeria'?p.fotos||[]:[]).map(f=>typeof f==='string'?{url:f}:f).map(f=>{if(config.estilo==='estudio-vivo'&&p.slug!=='aldea-los-huemules')return f;const known=String(f.url||'').split('?')[0],regional=REGIONAL_PHOTOS.some(x=>known.endsWith(x.url)),concept=p.slug==='alamos'&&ALAMOS_RENDERS.some(x=>known.endsWith(x.url));return !f.pie&&(regional||concept)?{...f,pie:regional?'Fotografía regional':'Propuesta conceptual del parque productivo.'}:f});

 const nodes=new Map(),expanded=new Set(),slides=new Map(),localMedia=new Map();let serial=0,cleanups=[],pendingUploads=0,inspectedId=config.bloques[0]?.id;const activePhotos=new Map();
 const stream=document.createElement('div');stream.className='block-stream';$('contenido').prepend(stream);
 const nav=app.querySelector('.project-nav'),oldFooter=app.querySelector('footer'),form=$('contactForm');nav.classList.add('nav');nav.querySelector('.identity').classList.add('brand');
 const n=v=>Number(v).toLocaleString('es-AR'),money=v=>has(v)?'USD '+n(v):'';
 const panoramaDetail=b=>b.medio&&b.contenido.panorama?.web===b.medio?safeUrl(b.contenido.panorama.alta):'';
 const media=v=>localMedia.get(v)||safeUrl(v),image=(v,alt,cls='')=>media(v)?`<img class="${cls}" src="${esc(media(v))}" alt="${esc(alt||p.nombre)}" loading="lazy">`:'';
 const para=v=>String(v||'').split(/\n\s*\n/).filter(Boolean).map(t=>`<p>${esc(t)}</p>`).join('');
 const title=(b,f)=>b.contenido.titulo||f;
 const head=(b,label,f)=>`<span class="eyebrow label">${esc(b.contenido.rotulo||label)}</span><h2>${esc(title(b,f))}</h2>`;
 const projectCopy=(b,key)=>has(b.contenido[key])?b.contenido[key]:b.fuente==='proyecto'?p[key==='texto'?'descripcion':key]:'';
 const saleLots=lots.filter(l=>l.estado==='disponible');const prices=lots.filter(l=>has(l.precio_usd)).map(l=>Number(l.precio_usd)),areas=lots.filter(l=>has(l.superficie_m2)).map(l=>Number(l.superficie_m2));
 const fromPrice=p.precio_desde??(prices.length?Math.min(...prices):null),areaText=areas.length?n(Math.min(...areas))+(Math.max(...areas)!==Math.min(...areas)?' a '+n(Math.max(...areas)):'')+' m²':has(p.sup_min_m2)?n(p.sup_min_m2)+(has(p.sup_max_m2)&&p.sup_max_m2!==p.sup_min_m2?' a '+n(p.sup_max_m2):'')+' m²':'';
 const number=v=>String(v||'').replace(/^lote\s+/i,''),displayZone=v=>v&&v===v.toUpperCase()?v.charAt(0)+v.slice(1).toLowerCase():v;
 const hrefType=type=>{const b=config.bloques.find(x=>x.tipo===type&&x.activo);return b?'#'+(original[type]?.id||'block-'+b.id):''};
 const link=(type,label,primary=false)=>hrefType(type)&&label?`<a class="btn${primary?' primary':''}" href="${esc(hrefType(type))}">${esc(label)}</a>`:'';
 const empty={ready:false,html:'',missing:'Complete el contenido de este bloque o desactívelo.'};
 function galleryVariant(b){if(b.tipo==='experiencias')return 'experiencias';const value=({'asimetrica':'editorial','a-sangre':'banda'})[b.variante]||b.variante;return ['banda','editorial','mosaico','carrusel','tira','ritmo','franjas','experiencias','album'].includes(value)?value:(landscape()?'editorial':'banda')}
 function galleryContent(b){
  const c=b.contenido,isEstudio=config.estilo==='estudio-vivo'&&p.slug!=='aldea-los-huemules',all=isEstudio&&b.tipo==='galeria'&&b.variante!=='experiencias'&&!(p.slug==='terrazas-del-piltri'&&location.hostname==='staging.surpatagonian.com')?estudioGalleryPhotos(b,config.bloques,p):editorialPhotos(b),count=Math.max(1,Math.min(100,Number(b.opciones.cantidadFotos)||all.length)),photos=all.slice(0,count).filter(f=>media(f.url)),variant=galleryVariant(b),index=photos.length?((slides.get(b.id)||0)%photos.length+photos.length)%photos.length:0;
  if(variant==='experiencias')return {ready:!!photos.length,html:experienceGallery(b,photos,media),missing:'Elija las fotos de los álbumes.'};
  if(variant==='album')return {ready:!!photos.length,html:photos.length?albumGallery(b,photos,media):'',missing:'Elija las fotos del álbum.'};
  const captions=['ocultos','debajo','sobre'].includes(b.opciones.textosFotos)?b.opciones.textosFotos:'debajo';
  const caption=f=>captions!=='ocultos'&&f.mostrarPie!=='no'&&f.pie?`<figcaption>${esc(f.pie)}</figcaption>`:'';
  const regional=photos.some(f=>contextPhoto(f.url)||REGIONAL_PHOTOS.some(x=>String(f.url).split('?')[0].endsWith(x.url)));
  const note=regional?'<p class="gallery-context-note">Fotografías de contexto de la región; no representan los lotes.</p>':'';
  if(variant==='ritmo'){const html=renderRhythmGallery({...b,contenido:{...c,...(b.opciones.textosCabecera==='no'?{rotulo:'',titulo:'',texto:''}:{}),fotos:photos.map(f=>({...f,pie:captions==='ocultos'||f.mostrarPie==='no'?'':f.pie}))}},{media});return {ready:!!html,html:html+note,missing:'Elija las fotos de este bloque.'}}
  return {ready:!!photos.length,html:`${b.opciones.textosCabecera!=='no'&&(c.rotulo||c.titulo||c.texto)?`<header><div>${c.rotulo?`<span class="eyebrow label">${esc(c.rotulo)}</span>`:''}${c.titulo?`<h2>${esc(c.titulo)}</h2>`:''}${para(c.texto)}</div></header>`:''}<div class="photo-grid" data-photo-count="${photos.length}">${photos.map((f,i)=>`<figure ${variant==='carrusel'&&i!==index?'hidden':''}><button data-image="${esc(media(f.url))}" data-image-title="${esc(f.alt||p.nombre)}" aria-label="Ampliar ${esc(f.alt||'foto '+(i+1))}">${image(f.url,f.alt).replace('<img ','<img '+photoAttrs(f,config.estilo==='inmersivo'&&p.slug!=='aldea-los-huemules')+' ')}</button>${variant==='franjas'&&caption(f)?`<span class="franjas-index" aria-hidden="true">${String(i+1).padStart(2,'0')}</span>`:''}${caption(f)}</figure>`).join('')}</div>${variant==='carrusel'&&photos.length>1?`<div class="gallery-controls"><span aria-live="polite">${index+1} / ${photos.length}</span><button data-gallery-step="-1" aria-label="Foto anterior">←</button><button data-gallery-step="1" aria-label="Foto siguiente">→</button></div>`:''}${note}`,missing:'Elija las fotos de este bloque.'}
 }
 function paletteFields(){
  if(config.recorrido?.escena?.style)return '';
  const style=projectAvailability(config);
  return ['disponible','reservado','vendido','proximamente'].map(state=>
   `<label>Color · ${estados[state]}<input type="color" data-block-option="color_${state}" value="${availabilityColor(style,state)}"></label>`
  ).join('');
 }
 function tourUrl(lotId){return projectTourUrl(p,config,lotId)}
 function mountTourFrame(stage,url){
    const frame=stage.querySelector('iframe') || document.createElement('iframe');
    frame.title='Recorrido 360° de '+p.nombre;
    const viewerControls=stage.closest('[data-fit-under-menu=true]');
    frame.allowFullscreen=true;
    if(viewerControls)frame.allow="fullscreen 'self'";
    if(frame.src!==url.href)frame.src=url.href;
    if(viewerControls){
     if(frame.parentNode!==stage)stage.replaceChildren(frame);
     return frame;
    }
    if(frame.parentNode!==stage){
     const expand=document.createElement('button');
     expand.type='button';
     expand.className='tour-expand';
     const syncSize=()=>{
      const expanded=stage.matches(':fullscreen')||stage.classList.contains('tour-expanded');
      expand.textContent=expanded?'Volver a la página':'Pantalla completa';
      expand.setAttribute('aria-pressed',String(expanded));
     };
     expand.onclick=async()=>{
      if(stage.matches(':fullscreen')){
       await document.exitFullscreen();
      }else if(stage.classList.contains('tour-expanded')){
       if(stage.hasAttribute('popover')){stage.hidePopover();stage.removeAttribute('popover')}
       stage.classList.remove('tour-expanded');
       expand.focus({preventScroll:true});
      }else{
       if(document.fullscreenEnabled){
        try{await stage.requestFullscreen();return}catch{/* El navegador puede limitar la pantalla completa en un visor integrado. */}
       }
       stage.classList.add('tour-expanded');
       if(stage.showPopover){stage.setAttribute('popover','manual');stage.showPopover()}
      }
      syncSize();
     };
     stage.addEventListener('fullscreenchange',syncSize);
     stage.replaceChildren(expand,frame);
     syncSize();
    }
    return frame;
 }
 function lotTourLink(row){
  const url=tourUrl(row.id);
  return url ? `<a class="lot-tour-link" href="${esc(url)}" aria-label="Ver ${esc(row.numero)} en el recorrido 360°">Ver en 360° ↗</a>` : '';
 }
 function content(b){const c=b.contenido;
  switch(b.tipo){
   case 'indice-fotografico':case 'lista-fotografica':return {ready:true,html:`<nav class="section-photo-index" aria-label="${esc(c.titulo||'Secciones de la página')}">${c.titulo?`<h2>${esc(c.titulo)}</h2>`:''}<div class="index-links"></div><figure hidden><img alt=""></figure></nav>`};
   case 'texto-foto':case 'texto-movil':case 'cortina':{const html=renderVisualResource(b,{media});return {ready:!!html,html,missing:b.tipo==='cortina'?'Elija dos fotografías para la apertura.':'Escriba el texto y elija una fotografía cuando corresponda.'}}
   case 'imagen':case 'video':{const html=renderMediaBlock(b,{media});return {ready:!!html,html,missing:'Seleccione el medio de este bloque.'}}
   case 'perspectivas':case 'capitulos':{const authored=config.estilo==='estudio-vivo'&&b.tipo==='perspectivas'?{...b,opciones:{...b.opciones,exigirNombres:'si',cantidadFotos:3}}:b;const html=renderPhotoStory(authored,{media});return {ready:!!html,html,missing:'Elija las fotos y el texto de cada vista.'}}
   case 'escenas':{const selected={...b,contenido:{...b.contenido,fotos:editorialPhotos(b)}};const html=b.variante==='acercamiento'&&config.estilo==='inmersivo'?renderAerialApproach(selected,{media,href:hrefType}):renderScrollScenes(selected,{media,href:hrefType});return {ready:!!html,html:(c.titulo||c.texto?`<header class="media-heading scene-block-heading">${c.titulo?`<h2>${esc(c.titulo)}</h2>`:''}${para(c.texto)}</header>`:'')+html,missing:'Elija una imagen; para el barrido puede usar hasta cuatro.'}}
   case 'intro':if(config.estilo==='estudio-vivo'&&p.slug!=='aldea-los-huemules'){const {lead,body}=estudioIntroCopy(c,p);return {ready:!!lead,html:`<div class="estudio-intro-copy"><p class="estudio-intro-lead">${esc(lead)}</p>${body?`<p class="estudio-intro-body">${esc(body)}</p>`:''}</div>`}}return {ready:!!String(c.texto||'').trim(),html:`<p>${esc(c.texto)}${c.enfasis?` <i>${esc(c.enfasis)}</i>`:''}</p>${c.detalle?`<small>${esc(c.detalle)}</small>`:''}`};
   case 'par-fotos':{const photos=editorialPhotos(b).slice(0,2);
    if(b.variante==='paisaje-detalle'){const html=landscapeStory(c,photos,media);return {ready:!!html,html,missing:'Elija una foto de paisaje.'}}
    if(app.dataset.styleBody==='estudio-vivo'&&stylePresentationPlan(config.estilo,[b],BLOCK_TYPES).presentations[b.id]==='perspectivas')return {ready:photos.some(f=>media(f.url)),html:renderPhotoStory({...b,tipo:'perspectivas',opciones:{...b.opciones,exigirNombres:'si'},contenido:{...c,fotos:photos}},{media})};return {ready:photos.some(f=>media(f.url)),html:(c.titulo||c.rotulo||c.texto?`<header>${head(b,'','')}${para(c.texto)}</header>`:'')+photos.map((f,i)=>media(f.url)?`<figure class="${i?'chica':'grande'}">${image(f.url,f.alt).replace('<img ','<img '+photoAttrs(f)+' ')}${f.pie?`<figcaption>${esc(f.pie)}</figcaption>`:''}</figure>`:'').join('')};}
   case 'asi-se-vive':case 'galeria':case 'experiencias':return galleryContent(b);

   case 'foto-texto':{
    const copy=projectCopy(b,'texto');
    const photo=image(c.imagen||p.foto_portada,c.alt);
    const figure=photo?`<figure class="${landscape()?'r43':''}">${photo}${c.pie?`<figcaption>${esc(c.pie)}</figcaption>`:''}</figure>`:'';
    return {ready:!!copy,html:`<div class="${landscape()?'t':'text'}">${head(b,'El proyecto',p.tagline||p.nombre)}${para(copy)}${b.opciones.enlaceLotes==='no'?'':link('explorador',c.boton||'Ver los lotes')}</div>${figure}`,missing:'Falta el texto de este bloque.'};
   }
   case 'foto-frase':{const src=c.imagen||p.foto_atmosfera;return {ready:!!media(src),html:landscape()?`${image(src,c.alt)}<div class="copy"><div>${head(b,'El lugar','')}</div>${para(c.texto)}</div>`:`${image(src,c.alt)}${title(b,c.texto||'')?`<blockquote>${c.rotulo?`<span class="eyebrow label">${esc(c.rotulo)}</span>`:''}${esc(title(b,c.texto||''))}${c.titulo&&c.texto?`<p class="quote-description">${esc(c.texto)}</p>`:''}</blockquote>`:''}${c.pie?`<p class="quote-caption">${esc(c.pie)}</p>`:''}`,missing:'Elija una foto para este bloque.'}}
   case 'foto-frase-lateral':{const src=c.imagen;return {ready:!!media(src),html:`<figure>${image(src,c.alt)}${c.pie?`<figcaption>${esc(c.pie)}</figcaption>`:''}</figure><div class="side-copy">${c.rotulo||c.titulo?head(b,'',''):''}${c.texto?`<p class="lead">${esc(c.texto)}</p>`:''}</div>`,missing:'Elija la foto y escriba la frase lateral.'}}

   case 'ubicacion':{const copy=c.texto||[p.descripcion_ubicacion,p.acceso_desc].filter(Boolean).join('\n\n'),place=[p.ciudad,p.provincia?.replaceAll('_',' ')].filter(Boolean).join(', '),rawPoints=Array.isArray(c.puntos)?c.puntos:[],points=cleanImmersive()?rawPoints.filter(value=>typeof value==='string'&&value.trim()):rawPoints,lat=Number(p.latitud),lng=Number(p.longitud),valid=has(p.latitud)&&has(p.longitud)&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;return {ready:cleanImmersive()?!!(String(copy).trim()||media(c.imagen)||points.length||(valid&&b.variante==='mapa')):!!(copy||place||valid),warning:b.variante==='mapa'&&!valid?'El mapa no se mostrará: revise latitud (−90 a 90) y longitud (−180 a 180) en Datos técnicos.':'',html:landscape()&&b.variante!=='mapa'?`<figure class="r11">${image(c.imagen,c.alt)}</figure><div class="t">${head(b,'Dónde queda',place||'Cómo llegar')}${para(copy)}${c.pie?`<p class="media-caption">${esc(c.pie)}</p>`:''}${link('contacto',c.boton||'Coordinar una visita')}</div>`:`${image(c.imagen,c.alt)}<div class="shell"><div class="card">${head(b,'Dónde queda',place||'Cómo llegar')}${para(copy)}${c.pie?`<p class="media-caption">${esc(c.pie)}</p>`:''}${points.length?`<ul>${points.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}</div>${b.variante==='mapa'&&valid?`<iframe class="location-map" title="Ubicación de ${esc(p.nombre)}" loading="lazy" src="https://maps.google.com/maps?q=${lat},${lng}&hl=es&z=${['apaisado','cuadrado'].includes(b.opciones.formatoMapa)?15:14}&output=embed"></iframe>`:''}</div>`,missing:'Faltan los datos de ubicación o el texto elegido.'}}
   case 'servicios':{const own=b.variante==='fichas'?String(c.serviciosPropios||'').split(/[,;\n]/).map(value=>value.trim()).filter(Boolean):[];
    // Lista propia del bloque (optativa, sólo en fichas): no cambia los servicios cargados en el proyecto ni lo que usan otras miniwebs.
    const services=own.length?own:Array.isArray(p.servicios)?p.servicios:[];const items=cleanImmersive()?services.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()):services;if(b.variante==='fichas')return {ready:!!items.length,html:serviceCards(c,items,serviceLabels),missing:'Cargue los servicios en el proyecto.'};
    const groups=[['Infraestructura',['agua_corriente','luz_electrica','gas_natural','cloaca','wifi','calles_ripio','calles_asfalto']],['Amenities',['sum','parrillas','senderos','muelle','playa','cancha','piscina']],['Acceso y seguridad',['porteria','vigilancia']]];const known=new Set(groups.flatMap(([,keys])=>keys));groups.push(['Otros servicios',items.filter(key=>!known.has(key))]);return {ready:!!items.length||(cleanImmersive()&&!!String(c.texto||'').trim()),html:`${head(b,'El desarrollo','Infraestructura y amenities')}${para(c.texto)}<div class="service-groups">${groups.map(([name,keys])=>{const values=items.filter(key=>keys.includes(key));return values.length?`<section class="service-group"><h3>${esc(name)}</h3><ul class="block-services">${values.map(s=>`<li>${esc(serviceLabels[s]||s)}</li>`).join('')}</ul></section>`:''}).join('')}</div>`,missing:'Cargue infraestructura y amenities en Servicios y obras del proyecto.'}}
   case 'ficha-tecnica':{const rows=[['Zonificación',p.zonificacion],['Tipo de propiedad',p.tipo_propiedad],['FOS',p.fos],['Altura máxima',has(p.altura_max)?n(p.altura_max)+' m':null],['Reglamento',p.reglamento_obs]].filter(([,v])=>has(v));return {ready:!!rows.length,html:`${head(b,'Características','Ficha técnica')}${para(c.texto)}<dl class="block-specs">${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,missing:'Faltan los datos públicos de la ficha técnica.'}}
   case 'financiacion':case 'cronograma':{const parts=b.tipo==='financiacion'?[['Financiación',p.financiacion],['Condiciones de venta',p.condiciones_venta]]:[['Cronograma',p.cronograma],['Entrega informada',/^\d{4}-\d{2}$/.test(p.fecha_entrega||'')?new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(p.fecha_entrega+'-01T12:00:00Z')):p.fecha_entrega]];const plan=b.tipo==='financiacion'?[1,2,3].map(n=>[String(c['planValor'+n]||'').trim(),String(c['planEtiqueta'+n]||'').trim()]).filter(([value])=>value):[];return {ready:parts.some(([,v])=>has(v))||!!plan.length,html:`${head(b,b.tipo==='financiacion'?'Condiciones':'Desarrollo',b.tipo==='financiacion'?'Financiación y condiciones':'Cronograma')}${para(c.texto)}${plan.length?`<div class="finance-plan">${plan.map(([value,label])=>`<div><strong>${esc(value)}</strong>${label?`<span>${esc(label)}</span>`:''}</div>`).join('')}</div>`:''}<div class="finance-options">${parts.filter(([,v])=>has(v)).map(([k,v])=>b.variante==='acordeon'?`<details><summary>${esc(k)}</summary>${para(v)}</details>`:`<div><h3>${esc(k)}</h3>${para(v)}</div>`).join('')}</div>`,missing:'Falta el texto informado por el proyecto.'}}
   case 'contacto':{
    if(b.opciones.formatoConsulta==='tarjeta')return {ready:true,html:`<div class="contact-side"><div class="contact-invitation"><h2>${esc(title(b,'Consultar'))}</h2></div><div class="inline-form-slot"></div></div>`};
    const phone=String(p.contacto_whatsapp||'').replace(/[^+0-9]/g,''),email=String(p.contacto_email||'');const close=config.bloques.find(b=>b.tipo==='comercializacion'),panoramic=close?.variante==='panoramica',photo=close?.contenido.imagen||p.foto_atmosfera||p.foto_portada;const mapLat=Number(p.latitud),mapLng=Number(p.longitud),mapPlace=[p.ciudad,p.provincia?.replaceAll('_',' ')].filter(Boolean).join(', '),contactMap=b.opciones.mapaContacto==='si'&&has(p.latitud)&&has(p.longitud)&&Number.isFinite(mapLat)&&Number.isFinite(mapLng)&&Math.abs(mapLat)<=90&&Math.abs(mapLng)<=180?`<aside class="contact-map" aria-label="Ubicación de ${esc(p.nombre)}"><h3>Dónde queda</h3>${mapPlace?`<p>${esc(mapPlace)}</p>`:''}<iframe class="location-map" title="Ubicación de ${esc(p.nombre)}" loading="lazy" src="https://maps.google.com/maps?q=${mapLat},${mapLng}&hl=es&z=14&output=embed"></iframe></aside>`:'';return {ready:true,html:`${panoramic&&media(photo)?`<figure class="close-panorama">${image(photo,close?.contenido.alt||p.nombre)}${close?.contenido.pie?`<figcaption>${esc(close.contenido.pie)}</figcaption>`:''}</figure>`:''}<div class="contact-invitation">${head(b,'Consultar','Hablemos del lote que le interesa.')+para(c.texto||'Consulte por el lote que le interesa.')}<div class="contact-public">${phone?`<a href="tel:${esc(phone)}">${esc(p.contacto_whatsapp)}</a>`:''}${email?`<a href="mailto:${esc(email)}">${esc(email)}</a>`:''}</div><div class="ways"><button type="button" data-contact-way="visita"><span>Coordine su visita</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg></button>${safeUrl(p.masterplan_url)&&p.plano_activo!==false?`<button type="button" data-image="${esc(safeUrl(p.masterplan_url))}" data-image-title="Plano de mensura de ${esc(p.nombre)}"><span>Ver plano de mensura</span><span aria-hidden="true">↗</span></button>`:''}${!cleanImmersive()||safeUrl(p.brochure_url)?`<button type="button" data-contact-brochure><span>Descargue el brochure</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg></button>`:''}</div>${para(c.pie)}</div><div class="contact-side">${app.dataset.styleBody==='estudio-vivo'?'<div class="studio-consult-selection" aria-live="polite"></div>':''}${app.dataset.styleBody==='relato'?'<div class="relato-consult-selection" aria-live="polite"></div>':app.dataset.styleBody==='recorrido'?'<div class="recorrido-consult-selection" aria-live="polite"></div>':''}${['inmersivo','manifiesto'].includes(config.estilo)?'<h3 class="contact-form-title">Su consulta</h3>':''}<div class="inline-form-slot"></div></div>${contactMap}`}};
   case 'comercializacion':{const closePhoto=c.imagen||p.foto_atmosfera||p.foto_portada,panoramaWithoutContact=b.variante==='panoramica'&&!config.bloques.some(x=>x.tipo==='contacto'&&x.activo);const reps=p.rep_activo!==false&&Array.isArray(p.representantes)?p.representantes.filter(r=>r&&(r.empresa||r.nombre||r.logo_url)):[];return {ready:true,html:`${panoramaWithoutContact&&media(closePhoto)?`<figure class="close-panorama">${image(closePhoto,c.alt||p.nombre)}${c.pie?`<figcaption>${esc(c.pie)}</figcaption>`:''}</figure>`:''}<div class="commerce-network"><div class="network-layout"><div class="network-principal"><h2>Comercializado por</h2><img class="network-sur" src="/assets/logos/logo-horizontal-blanco.png" alt="Sur Patagonian"></div>${reps.length?`<div class="network-authorized"><h2>Inmobiliarias que forman parte de la red de Sur Patagonian</h2><div class="network-agencies">${reps.map(r=>{const name=r.empresa||r.nombre||'',place=[r.ciudad,r.provincia?.replaceAll('_',' ')].filter(Boolean).join(', ');return `<article class="network-agency">${media(r.logo_url)?image(r.logo_url,name,'agency-logo'):''}<h3>${esc(name)}</h3>${place?`<p>${esc(place)}</p>`:''}</article>`}).join('')}</div></div>`:''}</div></div><section class="professional-close" aria-label="Información profesional"><div><strong>Mariana Ayelén García</strong><span>Martillera y Corredora Pública</span><span>Mat. 271-RP-18 · F°350 T°II</span></div><p>La disponibilidad y los precios están sujetos a posibles modificaciones. Consulte las condiciones de cada lote.</p></section><footer class="footer-bottom"><span>${esc(p.nombre)}</span><a href="#inicio">Volver al inicio ↑</a><span>Sur Patagonian</span></footer>`}}

   case 'panoramica360':{if(automatic360Enabled(config,p,b)){
    const tour=b.variante==='recorrido',url=tour?tourUrl():media(b.medio||c.imagen360);
    const copy=interactiveSectionCopy(b,'360'),heading=copy.title||copy.help?`<header class="interactive-section-heading">${copy.title?`<h2>${esc(copy.title)}</h2>`:''}${para(copy.help)}</header>`:'';
    return {ready:tour?!!url:!!(url||media(c.respaldo||p.foto_portada)),missing:tour?'Active el recorrido del proyecto desde Mapa y recorrido 360°.':'Elija la panorámica o una foto de respaldo.',html:heading+(tour?'<div class="tour-embed auto-tour" aria-label="Recorrido 360°"><p class="auto-360-status" role="status">Cargando recorrido 360°…</p></div>':`<div class="panorama-stage"><p class="panorama-result" role="status"></p></div>${c.pie?`<p class="media-caption">${esc(c.pie)}</p>`:''}`)};
   }if(b.variante==='recorrido'){
    const url=tourUrl();return {ready:!!url,html:`<div class="tour-embed" aria-label="Recorrido 360°">${image(c.respaldo||p.foto_portada,c.alt)}<button type="button" class="btn primary" data-open-project-tour>Abrir recorrido 360°</button></div>`,missing:'Active el recorrido del proyecto desde Mapa y recorrido 360°.'};
   }const src=media(b.medio||c.imagen360),fallback=c.respaldo||p.foto_portada;return {ready:!!(src||media(fallback)),html:`<div class="panorama-copy">${c.titulo?head(b,'El lugar',''):''}${para(c.texto)}</div><div class="panorama-stage">${image(fallback,c.alt,'panorama-fallback')}${src?'<button class="btn primary panorama-start" data-panorama-start>Explorar panorámica 360°</button>':''}<p class="panorama-result" role="status"></p></div>${c.pie?`<p class="media-caption">${esc(c.pie)}</p>`:''}`,missing:'Elija la panorámica o una foto de respaldo.'}}
   default:return empty;
  }
 }
 // Precio de la fila de cifras dentro del grupo de oferta: sale de los lotes disponibles con importe válido. Sin importes, la cifra se omite.
 function salePrice(){const valid=saleLots.map(l=>typeof l.precio_usd==='number'||(typeof l.precio_usd==='string'&&l.precio_usd.trim()!=='')?Number(l.precio_usd):NaN).filter(v=>Number.isFinite(v)&&v>0);if(!valid.length)return ['',''];const low=Math.min(...valid),high=Math.max(...valid),partial=valid.length<saleLots.length;return low===high?[money(low),partial?'precio desde':'precio por lote']:[money(low)+' a '+n(high),partial?'precios publicados de lotes disponibles':'precios de los lotes disponibles']}
 function figures(b){const values={lotes:[has(p.cantidad_lotes)?n(p.cantidad_lotes):lots.length?n(lots.length):'','lotes del desarrollo'],sector:[[...new Set(lots.map(l=>displayZone(l.tipo_lote)).filter(Boolean))].join(' / '),'sectores de la selección'],superficies:[areaText,areas.length?'superficies de los lotes publicados':'superficies informadas'],precio:b.opciones.grupoOferta==='si'?salePrice():[money(fromPrice),'precio desde'],hectareas:[has(p.hectareas_total)?n(p.hectareas_total)+' ha':'','superficie del desarrollo'],total:[has(p.cantidad_lotes)?n(p.cantidad_lotes):'','total de lotes']};return (Array.isArray(b.opciones.cifras)?b.opciones.cifras:['hectareas','superficies','precio']).map(k=>values[k]&&[values[k][0],String(b.contenido['rotulo_'+k]||'').trim()||values[k][1]]).filter(v=>v&&has(v[0]))}
 function availability(b){if(b.tipo==='portada'){
  const mode=b.opciones.medio||config.medio;
  if(mode==='recorrido'&&tourUrl())return {ready:true};
  if(mode==='panoramica360'&&media(b.medio||b.contenido.imagen360))return {ready:true};
  return {ready:!!media(b.contenido.imagen||p.foto_portada),missing:'Elija una foto de respaldo para la portada.'};
 }if(b.tipo==='cifras')return {ready:!!figures(b).length};if(b.tipo==='explorador')return {ready:!!lots.length||hasUnavailableLots,missing:'No hay lotes en el snapshot.'};if(b.tipo==='plano')return {ready:!!safeUrl(p.masterplan_url)&&p.plano_activo!==false,missing:'Falta el plano documental o está desactivado.'};return content(b)}
 const enabled=b=>!!BLOCK_TYPES[b.tipo]?.fijo||b.activo;
 // Reuse the live map controls, selection and form instead of a second explorer.
 const header=app.querySelector('.section-heading');header.classList.add('lotes-head');header.innerHTML='<div><span class="eyebrow label">Los lotes</span><h2></h2></div><p></p>';
 const filterWrap=document.createElement('details');filterWrap.className='sale-filter-wrap';filterWrap.innerHTML='<summary>Filtrar</summary>';header.after(filterWrap);filterWrap.append(app.querySelector('.lot-filters'),app.querySelector('.advanced-lot-filters'));
 const right=document.createElement('div');right.className='sale-lots-right';right.innerHTML='<div class="lote-list"></div><div class="lotes-foot"><span>Superficies y precios según la planilla del desarrollo.</span><span class="sale-lot-actions"></span></div>';app.querySelector('.lot-layout').append(right);right.prepend(filterWrap);
 const lotTools=document.createElement('section');lotTools.className='lot-tools';lotTools.hidden=true;
 right.querySelector('.lotes-foot').before(lotTools);
 const updateLotTools=mountLotTools(lotTools,{config,project:p,safeUrl,lotNumber:number});
 const legend=document.createElement('aside');
 legend.className='parcel-references';
 legend.setAttribute('aria-label','Referencias del plano');
 app.querySelector('.map-panel').prepend(legend);
 const keyItem=(label,color,kind)=>`<span class="key-item"><i aria-hidden="true" class="key-${kind}" style="--sample:${esc(color)}"></i>${esc(label)}</span>`;
 const keyGroup=(label,items)=>items.length?`<div class="key-group"><b>${label}</b>${items.join('')}</div>`:'';

 const formRow=document.createElement('div');formRow.className='row';const nameLabel=form.querySelector('[name=nombre]').closest('label'),phoneLabel=form.querySelector('[name=telefono]').closest('label');nameLabel.before(formRow);formRow.append(nameLabel,phoneLabel);form.classList.add('form');const submitWrap=document.createElement('div');const submit=form.querySelector('[type=submit]');submit.before(submitWrap);submitWrap.append(submit);
 let currentVisible=lots,currentLot=null,lotOrder='numero',configuredOrder;
 const sortBar=document.createElement('label');sortBar.className='vfx-lot-sort';sortBar.hidden=true;sortBar.innerHTML='Ordenar lotes <select aria-label="Ordenar lotes"><option value="numero">Número de lote</option><option value="precio">Precio: menor a mayor</option><option value="superficie">Superficie: menor a mayor</option><option value="metro">USD por m²: menor a mayor</option></select>';filterWrap.after(sortBar);sortBar.addEventListener('change',()=>{lotOrder=sortBar.querySelector('select').value;syncSelection(currentLot)});
 function syncSelection(l,visible){currentLot=l;if(visible)currentVisible=visible;
  const floating=app.querySelector('.lot-floating-consult');
  if(floating&&!l)floating.hidden=true;
  if(floating&&l){floating.querySelector('span').textContent='Lote '+number(l.numero)+(has(l.precio_usd)?' · '+money(l.precio_usd):'');floating.querySelector('button').dataset.consultLot=l.id}
  const consultSelection=app.querySelector('.studio-consult-selection');
  if(consultSelection){const key=l?[l.id,l.numero,l.superficie_m2,l.precio_usd,l.tipo_lote].join('|'):'none';if(consultSelection.dataset.selection!==key){consultSelection.dataset.selection=key;const target=hrefType('explorador')||'#contenido',plan=media(p.mapa_imagen_url);consultSelection.innerHTML=l?`${plan?`<a class="studio-consult-plan" href="${esc(target)}" aria-label="Ver el plano y cambiar de lote"><img src="${esc(plan)}" alt="Plano del proyecto" loading="lazy"></a>`:''}<div class="studio-consult-lot"><h3>${esc(lotTitle(l))}</h3><p>${[has(l.superficie_m2)?n(l.superficie_m2)+' m²':'',displayZone(l.tipo_lote)].filter(Boolean).map(esc).join(' · ')}</p></div><strong class="studio-consult-price">${has(l.precio_usd)?money(l.precio_usd):'Precio a consultar'}</strong><a class="studio-consult-change" href="${esc(target)}">Cambiar lote<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>`:`<span>Todavía no eligió un lote</span>${hrefType('explorador')?'<a href="'+esc(hrefType('explorador'))+'">Elegir en el plano</a>':''}`}}

  const relatoSelection=app.querySelector('.relato-consult-selection,.recorrido-consult-selection');
  if(relatoSelection){const key=l?[l.id,l.numero,l.superficie_m2,l.precio_usd,l.tipo_lote].join('|'):'none';if(relatoSelection.dataset.selection!==key){relatoSelection.dataset.selection=key;relatoSelection.innerHTML=l?`<div><h3>${esc(lotTitle(l))}</h3><p>${[has(l.superficie_m2)?n(l.superficie_m2)+' m²':'',displayZone(l.tipo_lote)].filter(Boolean).map(esc).join(' · ')}</p></div><strong>${has(l.precio_usd)?money(l.precio_usd):'Precio a consultar'}</strong><a href="${esc(hrefType('explorador')||'#contenido')}">Cambiar lote<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>`:`<span>Todavía no eligió un lote</span>${hrefType('explorador')?'<a href="'+esc(hrefType('explorador'))+'">Elegir en el plano</a>':''}`}}


  const requested=config.bloques.find(b=>b.tipo==='explorador')?.opciones.ordenLotes||'numero';if(requested!==configuredOrder){configuredOrder=requested;lotOrder=['precio','superficie','metro'].includes(requested)?requested:'numero'}sortBar.querySelector('select').value=lotOrder;
  const value=row=>{const numeric=v=>has(v)&&String(v).trim()!==''&&Number.isFinite(Number(v));if(lotOrder==='superficie')return numeric(row.superficie_m2)?Number(row.superficie_m2):Infinity;if(!numeric(row.precio_usd))return Infinity;return lotOrder==='metro'?(unitPrice(row)??Infinity):Number(row.precio_usd)};
  // currentVisible preserves the catalog's natural manzana/lote order, including ties.
  const ordered=lotOrder==='numero'?currentVisible:[...currentVisible].sort((a,b)=>(value(a)-value(b))||0);
  const table=()=>`<div class="vfx-lot-table-wrap" tabindex="0" role="region" aria-label="Tabla comparativa de lotes"><table class="vfx-lot-table"><caption>Lotes publicados</caption><thead><tr><th scope="col">Lote</th><th scope="col">Superficie</th><th scope="col">Sector</th><th scope="col">Estado</th><th scope="col">Precio</th><th scope="col">${unitPriceLabel}</th></tr></thead><tbody>${ordered.map(row=>`<tr><td><button class="lote" type="button" data-lot="${esc(row.id)}" aria-current="${l?.id===row.id}" aria-label="Seleccionar lote ${esc(number(row.numero))}">${esc(number(row.numero))}</button> <button type="button" class="btn" data-expand="${esc(row.id)}" aria-label="Ver ficha del lote ${esc(number(row.numero))}">Ver ficha</button>${lotTourLink(row)}</td><td>${has(row.superficie_m2)?n(row.superficie_m2)+' m²':'—'}</td><td>${esc(displayZone(row.tipo_lote)||'—')}</td><td>${esc({proximamente:'Próximamente',disponible:'Disponible',reservado:'Reservado',vendido:'Vendido'}[row.estado]||'—')}</td><td>${has(row.precio_usd)?money(row.precio_usd):'Consultar'}</td><td>${unitPriceText(row)}</td></tr>`).join('')}</tbody></table></div>`;

  const variant=config.bloques.find(b=>b.tipo==='explorador')?.variante||'mapa-lista';right.dataset.view=variant;const settings=config.bloques.find(b=>b.tipo==='explorador')?.opciones||{};
  sortBar.hidden=settings.ordenVisitante==='no'||(variant!=='tabla'&&settings.ordenVisitante!=='si');
  filterWrap.hidden=settings.filtrosVisitante==='no';
  filterWrap.querySelector('summary').textContent='Filtrar · '+currentVisible.length+' de '+lots.length+' lotes';
  const list=right.querySelector('.lote-list');
  const manyLots=ordered.length>12;
  list.classList.toggle('scroll-lot-options',manyLots);
  if(manyLots){list.tabIndex=0;list.setAttribute('role','region');list.setAttribute('aria-label','Lista de lotes')}
  else{list.removeAttribute('tabindex');list.removeAttribute('role');list.removeAttribute('aria-label')}
  updateLotTools(l,ordered,settings);
  const palette=projectAvailability(config);
  function renderRow(row){
   const name=esc(number(row.numero));
   const area=has(row.superficie_m2)?n(row.superficie_m2)+' m²':'';
   const state=Object.hasOwn(estados,row.estado)?estados[row.estado]:estados.sin;
   const color=availabilityColor(palette,row.estado)||'transparent';
   const price=has(row.precio_usd)?money(row.precio_usd):'';
   return `<div class="lot-choice">
    <button class="lot-summary-row" type="button" data-lot="${esc(row.id)}" aria-current="${l?.id===row.id}">
     <strong>${name}</strong>
     <span class="lot-row-facts">${area?`<span>${area}</span>`:''}<span class="lot-row-state"><i aria-hidden="true" style="--state-dot:${esc(color)}"></i>${state}</span></span>
     ${price?`<span class="lot-row-price">${price}</span>`:''}
    </button>${lotTourLink(row)}
   </div>`;
  }
  const groups=[...new Set(ordered.map(row=>displayZone(row.tipo_lote)||'Sin sector'))];
  right.querySelector('.lote-list').innerHTML=!currentVisible.length?'<p class="empty-filter" role="status">No hay lotes con estos filtros.</p>':variant==='sectores'?groups.map(zone=>`<section class="sale-sector"><h3>${esc(zone)}</h3>${ordered.filter(row=>(displayZone(row.tipo_lote)||'Sin sector')===zone).map(renderRow).join('')}</section>`).join(''):variant==='tabla'?table():ordered.map(renderRow).join('');
  right.querySelector('.sale-lot-actions').innerHTML=(safeUrl(p.masterplan_url)&&p.plano_activo!==false?`<button class="text-plan" data-image="${esc(safeUrl(p.masterplan_url))}" data-image-title="Plano de mensura de ${esc(p.nombre)}">${landscape()?'Plano de mensura':'Ver plano de mensura'}</button>`:'')+(l?`<button class="btn primary" data-consult data-consult-lot="${esc(l.id)}">Consultar el lote ${esc(number(l.numero))}</button>`:'');
  const states=['disponible','reservado','vendido','proximamente','sin'];
  const fills=hasGeometry?parcelKey.fills:new Map();
  if(!hasGeometry && settings.colorearDisponibilidad!=='no'){
   for(const row of currentVisible){
    if(row.mapa_x==null||row.mapa_y==null)continue;
    const state=Object.hasOwn(estados,row.estado)?row.estado:'sin';
    fills.set(state,state==='sin'?'transparent':availabilityColor(palette,state));
   }
  }
  const statusItems=states.filter(state=>fills.has(state)).map(state=>
   keyItem(state==='sin'?estados.sin:estados[state],fills.get(state),'fill'));
  const lines=hasGeometry?[...parcelKey.lines].sort(([a],[b])=>a.localeCompare(b,'es',{numeric:true})):[];
  const edgeItems=lines.map(([label,color])=>keyItem(label,color,'line'));
  if(lines.length)edgeItems.push(keyItem('Lote elegido','currentColor','selected'));
  legend.hidden=!hasMap||!(statusItems.length||edgeItems.length);
  legend.innerHTML='<strong>Referencias</strong>'+keyGroup(hasGeometry?'Relleno':'Disponibilidad',statusItems)+keyGroup('Bordes',edgeItems);
  onSelection?.(l);
 }
 function defaultCoverDetail(c){
  return [...(p.media_bank||[]),...(p.fotos||[])]
   .map(photo=>typeof photo==='string'?photo:photo?.url)
   .find(url=>url && url!==p.foto_portada && url!==c.imagen) || '';
 }
 function paintIdentityCover(b){
  const hero=original.portada;hero.querySelector('.relato-experience')?.remove();hero.querySelector('.identity-cover')?.remove();
  const style=app.dataset.styleBody;if(!['relato','recorrido'].includes(style))return;
  const c=b.contenido,photo=c.imagen||p.foto_portada,target=hrefType('explorador');
  const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  const phrase=c.titulo&&c.titulo!==p.nombre?c.titulo:p.tagline;
  const cover=document.createElement('div');cover.className='identity-cover';
  const action=style==='relato'&&target?`<a class="cover-main-action" href="${esc(target)}"><span>${esc(c.botonPrincipal||'Ver los lotes disponibles')}</span>${arrow}</a>`:'';
  cover.innerHTML=`<div class="cover-title"><h1>${esc(p.nombre)}</h1>${phrase?`<p class="cover-phrase">${esc(phrase)}</p>`:''}${action}</div><div class="cover-atlas"><figure class="cover-photo">${image(photo,c.alt||p.nombre).replace('loading="lazy"','loading="eager"')}${c.pie?`<figcaption>${esc(c.pie)}</figcaption>`:''}</figure></div>`;
  hero.append(cover);
 }
 function paintHero(b){const c=b.contenido,hero=original.portada,copy=hero.querySelector('.hero-copy');const shade=b.opciones,percent=(v,f)=>Number.isFinite(Number(v))&&v!==null&&v!==''?Math.max(0,Math.min(100,Number(v))):f;hero.dataset.coverShade=shade.degradeActivo==='no'?'apagado':['paleta','negro','blanco'].includes(shade.degradeColor)?shade.degradeColor:'negro';hero.style.setProperty('--cover-height',percent(shade.degradeAltura,55)+'%');hero.style.setProperty('--cover-top',percent(shade.degradeArriba,18)+'%');hero.style.setProperty('--cover-bottom',percent(shade.degradeAbajo,0)+'%');const h=copy.querySelector('h1');h.textContent=p.nombre;h.className='project-title';let partner=copy.querySelector('.hero-partner');if(!partner){partner=document.createElement('div');partner.className='hero-partner';h.after(partner)}let titleRow=copy.querySelector('.hero-title-row');if(!titleRow){titleRow=document.createElement('div');titleRow.className='hero-title-row';h.before(titleRow);titleRow.append(h,partner)}partner.remove();let phrase=copy.querySelector('.hero-phrase');if(!phrase){phrase=document.createElement('p');phrase.className='hero-phrase';titleRow.after(phrase)}phrase.textContent=(c.titulo&&c.titulo!==p.nombre?c.titulo:p.tagline)||'';phrase.hidden=!phrase.textContent;copy.querySelector('.hero-tagline').textContent='';copy.querySelector('.hero-tagline').classList.add('lead');hero.querySelector('.place').hidden=true;hero.querySelector('.hero-index').hidden=true;const caption=(b.opciones.medio||config.medio)==='video'&&['Imágenes de la región','Video de la región'].includes(c.pie)?'':c.pie||'';hero.querySelector('.hero-caption').hidden=!caption;hero.querySelector('.hero-caption').textContent=caption;
  const actions=copy.querySelector('.hero-actions');let secondary=actions.querySelector('[data-hero-secondary]');if(!secondary){secondary=document.createElement('a');secondary.dataset.heroSecondary='';secondary.className='btn';actions.append(secondary)}const primary=actions.querySelector('a');primary.href=hrefType('explorador')||'#contenido';primary.textContent=c.botonPrincipal||'Ver los lotes disponibles';if(config.estilo==='manifiesto'||app.dataset.styleBody==='relato')primary.innerHTML=`<span>${esc(primary.textContent)}</span><span class="hero-action-direction" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M5 5h14v14"/></svg></span>`;primary.hidden=!hrefType('explorador');secondary.href=hrefType('foto-texto')||'#contenido';secondary.textContent=c.botonSecundario||'Conocer el proyecto';secondary.hidden=!hrefType('foto-texto');
  let side=copy.querySelector('.hero-side');if(!side){side=document.createElement('aside');side.className='hero-side';copy.append(side)}side.innerHTML=(has(fromPrice)?`<strong>desde ${money(fromPrice)}</strong>`:'')+(c.detalleLateral?'<br>'+esc(c.detalleLateral):'');
  copy.querySelector('.studio-hero-specs')?.remove();
  if(app.dataset.styleBody==='estudio-vivo'&&areaText){const specs=document.createElement('dl');specs.className='studio-hero-specs';specs.innerHTML=`<div><dt>${areas.length?'Superficies de los lotes publicados':'Superficies informadas'}</dt><dd>${esc(areaText)}</dd></div>`;side.after(specs)}
  let detail=hero.querySelector('.hero-detail');if(!detail){detail=document.createElement('figure');detail.className='hero-detail';hero.append(detail)}const detailUrl=media(c.imagenDetalle||defaultCoverDetail(c));detail.innerHTML=detailUrl?`<img src="${esc(detailUrl)}" alt="${esc(c.altDetalle||p.nombre)}" loading="lazy">${c.pieDetalle?`<figcaption>${esc(c.pieDetalle)}</figcaption>`:''}`:'';detail.hidden=!detailUrl;
  const photo=media(c.imagen||p.foto_portada);hero.querySelector('.hero-media>img').src=photo||'';hero.querySelector('.hero-media>img').hidden=!photo;hero.querySelector('.hero-media>img').alt=c.alt||p.nombre;
  const isLandscape=landscape();hero.querySelector('.place').textContent=c.rotulo||'Bienvenido';hero.querySelector('.place').classList.add('label');hero.querySelector('.place').hidden=!isLandscape;copy.querySelector('.hero-tagline').hidden=!copy.querySelector('.hero-tagline').textContent;actions.hidden=isLandscape;side.hidden=isLandscape;
  let scroll=hero.querySelector('.scroll');if(!scroll){scroll=document.createElement('span');scroll.className='scroll';scroll.textContent='Deslizar';hero.append(scroll)}hero.append(scroll);scroll.hidden=config.estilo!=='inmersivo';
  const mode=b.opciones.medio||config.medio;
  hero.querySelector('.hero-panorama')?.remove();
  const panoramaSource = mode === 'panoramica360' && media(b.medio || c.imagen360);
  if (panoramaSource) {
   const pano = document.createElement('div');
   pano.className = 'hero-panorama';
   pano.innerHTML = '<div class="panorama-stage"><p class="panorama-result" role="status"></p></div>';
   hero.querySelector('.hero-media').append(pano);
   cleanups.push(startPanorama(pano,panoramaSource,{alta:panoramaDetail(b)}));
  }
  hero.querySelector('.hero-perspectives')?.remove();
  if(app.dataset.styleBody==='estudio-vivo'&&mode==='foto'){
   const views=[{url:c.imagen||p.foto_portada,alt:c.alt||p.nombre},...(p.fotos||[]).map(f=>typeof f==='string'?{url:f,alt:p.nombre}:f)].filter((f,i,a)=>media(f.url)&&a.findIndex(x=>x.url===f.url)===i).slice(0,4),current=Math.min(slides.get('hero-'+b.id)||0,views.length-1);
   if(views.length>1){const tabs=document.createElement('div');tabs.className='hero-perspectives';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Vistas del proyecto');tabs.innerHTML=views.map((view,i)=>`<button type="button" data-hero-view="${esc(media(view.url))}" data-hero-view-index="${i}" data-hero-view-block="${esc(b.id)}" data-hero-view-alt="${esc(view.alt||p.nombre)}" aria-pressed="${i===current}"><img src="${esc(media(view.url))}" alt="" width="96" height="64" loading="lazy"><span>Vista ${i+1}</span></button>`).join('');hero.insertBefore(tabs,copy);hero.querySelector('.hero-media>img').src=media(views[current].url);hero.querySelector('.hero-media>img').alt=views[current].alt||p.nombre}
  }
  paintIdentityCover(b);
  if (panoramaSource && app.dataset.styleBody === 'recorrido') {
   const photoSlot = hero.querySelector('.identity-cover .cover-photo');
   if (photoSlot) photoSlot.append(hero.querySelector('.hero-panorama'));
  }
 }
 function compose(){
  app.toggleAttribute('data-composicion-terrazas',config.recursos?.cierreTerrazas==='bloques');
  // Keep the live form attached while its optional block is rebuilt or removed.
  // It remains available in the consultation dialog when Contacto is hidden.
  $('contactDialog').append(form);
  cleanups.forEach(f=>f());cleanups=[];stream.querySelectorAll(':scope > .style-reader').forEach(group=>{group.querySelectorAll('[data-block-id]').forEach(node=>stream.insertBefore(node,group));group.remove()});nodes.forEach(node=>{node.classList.remove('style-reader-chapter');delete node.dataset.readerNoCopy});const kept=new Set(config.bloques.map(b=>b.id));for(const [id,node]of nodes){if(!kept.has(id)){if(Object.values(original).includes(node)){node.hidden=true;delete node.dataset.blockId;delete node.dataset.blockType;$('contenido').append(node)}else node.remove();nodes.delete(id)}}const isLandscape=landscape();app.dataset.closeVariant=config.bloques.find(b=>b.tipo==='comercializacion')?.variante==='panoramica'?'panoramica':'editorial';old.forEach(n=>n.hidden=true);Object.values(original).forEach(n=>n.hidden=true);oldFooter.hidden=true;const active=[];
  for(const b of config.bloques){let node=nodes.get(b.id);if(!node){node=original[b.tipo]&&!Array.from(nodes.values()).includes(original[b.tipo])?original[b.tipo]:document.createElement('section');nodes.set(b.id,node)}const state=availability(b);node.dataset.blockId=b.id;node.dataset.blockType=b.tipo;node.dataset.variant=b.variante;node.dataset.presentation=stylePresentationPlan(config.estilo,[b],BLOCK_TYPES).presentations[b.id];node.hidden=!enabled(b)||!state.ready;
   // Some authored variants use display:grid!important. The model's visibility
   // must still win; a hidden attribute alone loses to those layout rules.
   if(node.hidden)node.style.setProperty('display','none','important');else node.style.removeProperty('display');
   if(b.tipo==='portada'){paintHero(b)}else if(b.tipo==='cifras'){node.className='cifras';node.innerHTML=(b.contenido.rotulo||b.contenido.titulo||b.contenido.texto?`<header class="media-heading figures-heading">${head(b,'','')}${para(b.contenido.texto)}</header>`:'')+'<div class="shell">'+figures(b).map(([v,k])=>`<div><strong>${esc(v)}</strong><span>${esc(k)}</span></div>`).join('')+'</div>'}else if(b.tipo==='explorador'){node.classList.add('lotes');header.querySelector('.label').textContent=b.contenido.rotulo||'';header.querySelector('h2').textContent=title(b,'Lotes');header.querySelector('p').textContent=b.contenido.texto||'';}else if(b.tipo==='plano'){node.classList.add('shell');node.open=b.variante==='abierto'}else{node.id='block-'+b.id;node.className=({'foto-texto':'proyecto','foto-frase':'lugar-hero','foto-frase-lateral':'shell lugar-duo',ubicacion:'donde',contacto:'contacto shell',comercializacion:'comercial',galeria:'content-block block-galeria shell',panoramica360:'content-block block-panoramica360 shell'})[b.tipo]||'content-block block-'+b.tipo+' shell';node.innerHTML=state.html; if(isLandscape){const classes={'foto-texto':'cap shell','foto-frase':'sangre',ubicacion:'cap inv shell',contacto:'contacto shell on-dark',comercializacion:'comercial on-dark'};if(classes[b.tipo])node.className=classes[b.tipo]} if(b.tipo==='intro')node.className='intro';if(b.tipo==='par-fotos')node.className='par shell';if(['asi-se-vive','galeria','experiencias'].includes(b.tipo)){node.className='photo-gallery shell';node.dataset.galleryVariant=galleryVariant(b);node.toggleAttribute('data-default-immersive-gallery',p.slug==='aldea-los-huemules'||(!b.opciones.varianteManual&&b.variante===BLOCK_TYPES[b.tipo].variantes[0]));node.dataset.captionMode=['ocultos','debajo','sobre'].includes(b.opciones.textosFotos)?b.opciones.textosFotos:'debajo'}}
   if(automatic360Enabled(config,p,b))node.querySelectorAll(':scope > .interactive-section-heading').forEach(heading=>applyInteractiveHeadingStyle(heading,app));
   applyBlockLayout(node,b);if(b.variante==='experiencias'||b.tipo==='experiencias')node.style.setProperty('--album-duration',Math.min(2000,Math.max(200,Number(b.opciones.efectoDuracion)||700))+'ms');if(galleryVariant(b)==='franjas'&&['galeria','asi-se-vive'].includes(b.tipo)){node.style.setProperty('--franjas-ratio',String(Math.max(3,Math.min(12,Number(b.opciones.franjasProporcion)||7))));node.style.setProperty('--franjas-shade',String(Math.max(0,Math.min(80,Number(b.opciones.franjasVelo??30)))/100))}stream.append(node);if(!node.hidden)active.push({b,node});
   if(b.tipo==='contacto'&&!node.hidden){node.querySelector('.inline-form-slot').append(form);form.querySelector('button[type=submit]').textContent='Enviar consulta';if(['estudio-vivo','relato','recorrido'].includes(app.dataset.styleBody))form.querySelector('button[type=submit]').innerHTML='<span>Enviar consulta</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7"/></svg>'}
  }
  if(['relato','recorrido'].includes(app.dataset.styleBody)){const way=app.querySelector('.contacto .ways [data-image] span[aria-hidden]');if(way)way.outerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>'}
  for(const {node} of active.filter(({b})=>['indice-fotografico','lista-fotografica'].includes(b.tipo))){
   const index=node.querySelector('.section-photo-index'),links=index.querySelector('.index-links'),figure=index.querySelector('figure');
   const entries=active.filter(x=>x.node.id&&!['portada','comercializacion','indice-fotografico','lista-fotografica'].includes(x.b.tipo));
   if(!entries.length){node.hidden=true;node.style.setProperty('display','none','important');continue}
   for(const entry of entries){
    const anchor=document.createElement('a');anchor.href='#'+entry.node.id;
    anchor.textContent=entry.b.contenido.titulo||entry.node.querySelector('h2')?.textContent||BLOCK_TYPES[entry.b.tipo].nombre;
    const photo=entry.node.querySelector('figure img,.scene-image img,.cover-photo img')?.getAttribute('src')||media(entry.b.contenido.imagen||p.foto_portada);
    const show=()=>{figure.hidden=!photo;if(photo)figure.firstElementChild.src=photo;links.querySelectorAll('a').forEach(a=>a.toggleAttribute('data-current',a===anchor))};
    anchor.addEventListener('pointerenter',show);anchor.addEventListener('focus',show);links.append(anchor);if(links.childElementCount===1)show();
   }
  }
  for(const node of nodes.values()){delete node.dataset.beforeLotSelector;delete node.dataset.afterPhotoGallery;delete node.dataset.oferta;}
  active.forEach(({b,node},index)=>{
   if(b.tipo!=='cifras'||b.opciones.grupoOferta!=='si')return;
   let next=index+1;while(active[next]&&['financiacion','servicios'].includes(active[next].b.tipo)){active[next].node.dataset.oferta=active[next].b.tipo;next++}
   if(next>index+1)node.dataset.oferta='cifras';
  });
  if(cleanImmersive()){
   active.forEach(({b,node},index)=>{
    if(['galeria','asi-se-vive'].includes(b.tipo)&&active[index+1]?.b.tipo==='explorador'){
     node.dataset.beforeLotSelector='';active[index+1].node.dataset.afterPhotoGallery='';
    }
   });
  }
  cleanups.push(composeStyleReader(active));
  if(isLandscape){nav.innerHTML=`<a class="menu" href="${hrefType('explorador')||'#contenido'}" aria-label="Menú"><i></i><span>Menú</span></a><a class="identity wordmark" href="#inicio"><span class="identity-name">${esc(p.nombre)}</span><span class="nav-partner"><span>by</span><img src="/assets/logos/logo-horizontal-blanco.png" alt="Sur Patagonian"></span></a><div class="right"><a href="${hrefType('contacto')||'#contenido'}">Contacto</a></div><nav class="nav-links" hidden></nav>`}else{nav.innerHTML=`<a class="identity brand" href="#inicio"><b class="identity-name">${esc(p.nombre)}</b><span class="nav-partner"><span>by</span><img src="/assets/logos/logo-horizontal-blanco.png" alt="Sur Patagonian"></span></a><nav class="nav-links" aria-label="Navegación del proyecto"></nav>`}
  const hero=active.find(x=>x.b.tipo==='portada');if(hero)hero.node.prepend(nav);else stream.prepend(nav);nav.classList.toggle('standalone-nav',!hero);nav.querySelector('.identity-name').textContent=p.nombre;nav.querySelector('.identity').href=hero?'#inicio':'#contenido';
  const route=[['foto-texto','El proyecto'],['foto-frase','El lugar'],['explorador','Lotes'],['ubicacion','Dónde queda'],['contacto','Consultar']];nav.querySelector('.nav-links').innerHTML=route.map(([t,label])=>{const x=active.find(x=>x.b.tipo===t);return x?`<a${t==='contacto'?' class="btn"':''} href="#${esc(x.node.id)}">${label}</a>`:''}).join('');
  if(!editing&&!compare){
   const href=tourUrl();
   if(href){
    const links=nav.querySelector(isLandscape?'.right':'.nav-links'),tour=document.createElement('a');
    tour.href=href;tour.dataset.aerialTour='';tour.setAttribute('aria-label','Recorrido 360°');
    tour.style.display='flex';tour.style.whiteSpace='nowrap';tour.textContent=matchMedia('(max-width:700px)').matches?'360°':'Recorrido 360°';
    links.insertBefore(tour,isLandscape?links.firstChild:links.querySelector('.btn'));
   }
  }
  if(app.hasAttribute('data-composicion-terrazas')){
   const links=nav.querySelector('.nav-links'),finance=active.find(({b})=>b.tipo==='financiacion');
   const tour=links.querySelector('[data-aerial-tour]');
   if(tour)links.prepend(tour);
   if(finance){
    const link=document.createElement('a');link.dataset.seccion='financiacion';
    link.href='#'+finance.node.id;link.textContent='Financiación';
    links.insertBefore(link,links.querySelector('.btn'));
   }
  }
  const coverTour=hero && (hero.b.opciones.medio||config.medio)==='recorrido' && tourUrl();
  original.portada.toggleAttribute('data-tour-cover',!!coverTour);
  if(coverTour || ['estudio-vivo','relato','recorrido'].includes(app.dataset.styleBody))$('contenido').before(nav);
  if(app.dataset.styleBody==='recorrido'){
   const links=nav.querySelector('.nav-links'),menu=document.createElement('button');
   links.id='route-menu-links';menu.type='button';menu.className='route-menu-toggle';
   menu.setAttribute('aria-controls',links.id);menu.textContent='Menú';links.before(menu);
   const setOpen=open=>{menu.setAttribute('aria-expanded',String(open));nav.toggleAttribute('data-menu-open',open)};
   setOpen(false);menu.onclick=()=>setOpen(!nav.hasAttribute('data-menu-open'));
   const close=e=>{if(e.target.closest('a'))setOpen(false)};
   const escape=e=>{if(e.key==='Escape'&&nav.hasAttribute('data-menu-open')){setOpen(false);menu.focus()}};
   const resize=()=>setOpen(false),mobile=matchMedia('(max-width:700px)');
   links.addEventListener('click',close);nav.addEventListener('keydown',escape);mobile.addEventListener('change',resize);
   cleanups.push(()=>{nav.removeEventListener('keydown',escape);mobile.removeEventListener('change',resize);setOpen(false)});
  }
  if(app.dataset.styleBody==='recorrido'&&typeof IntersectionObserver!=='undefined'){
   const links=[...nav.querySelectorAll('.nav-links a[href^="#"]')],targets=links.map(link=>app.querySelector(link.getAttribute('href'))).filter(Boolean);
   const observer=new IntersectionObserver(()=>{const visible=targets.filter(node=>node.getBoundingClientRect().top<innerHeight*.55);const current=visible.sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top)[0];links.forEach(link=>{if(current&&link.getAttribute('href')==='#'+current.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})},{rootMargin:'-15% 0px -50% 0px'});targets.forEach(node=>observer.observe(node));cleanups.push(()=>observer.disconnect());
  }
  if(!editing&&lots.length&&hero?.b.opciones.consultaFlotante==='si'){
   const floating=document.createElement('aside');floating.className='lot-floating-consult';floating.hidden=true;
   floating.innerHTML='<span></span><button type="button" class="btn primary" data-consult>Consultar</button>';app.append(floating);
   const contact=active.find(({b})=>b.tipo==='contacto')?.node;
   const show=()=>{floating.hidden=hero.node.getBoundingClientRect().bottom>0||(contact&&contact.getBoundingClientRect().top<innerHeight)||!getSelected?.()};
   window.addEventListener('scroll',show,{passive:true});show();cleanups.push(()=>{window.removeEventListener('scroll',show);floating.remove()});
  }
  app.querySelector('.floating-contact').hidden=true;app.dataset.contactEnabled=String(active.some(x=>x.b.tipo==='contacto'));app.dataset.portadaVariant=config.bloques.find(b=>b.tipo==='portada')?.variante||'';syncSelection(getSelected?.());renderEditor();cleanups.push(mountEditorialResources(stream),mountDesignResources(stream),mountVisualResources(stream,active,{app,editing,project:p}));
  if(config.estilo==='estudio-vivo'){
   cleanups.push(mountEstudio(app,{active,project:p,lots,media,editing,coverMode:config.medio}));
  }else if(config.estilo==='relato'){
   cleanups.push(mountRelato(stream,{app,active,lots,project:p,editing,safeUrl}));
  }else{
   cleanups.push(mountImmersiveMotion(stream,{app,compare:false,editing,nativeWheel:active.some(({b})=>immediateImmersiveTour(config,p,b))}),mountReferenceExperience(stream,{app,editing}));
  }
  {
   const entries=active.filter(({b})=>b.tipo==='panoramica360'&&automatic360Enabled(config,p,b)).map(({b,node})=>({node,immediate:immediateImmersiveTour(config,p,b),kind:b.variante==='recorrido'?'recorrido':'panorama',alta:panoramaDetail(b),url:b.variante==='recorrido'?tourUrl():media(b.medio||b.contenido.imagen360),fallback:media(b.contenido.respaldo||p.foto_portada),alt:b.contenido.alt||p.nombre}));
   if(entries.length)cleanups.push(observeAutomatic360(entries,{mountTourFrame,startPanorama,header:nav}));
  }
  if(coverTour){
   const stage=document.createElement('div');
   stage.className='tour-embed hero-tour';
   stage.setAttribute('aria-label','Explorador 360° de '+p.nombre);
   hero.node.append(stage);
   const url=new URL(coverTour,location.origin);
   url.searchParams.set('integrado','1');
   mountTourFrame(stage,url);
   cleanups.push(()=>stage.remove());
  }
 }
 // Style-specific presentation keeps the configured blocks, order and native handlers.
 function composeStyleReader(active){
  if(app.dataset.styleBody!=='recorrido')return ()=>{};
  const disposals=[];
  for(const {b,node} of active){
   if(!['par-fotos','galeria','asi-se-vive'].includes(b.tipo))continue;
   let track=node.querySelector('.photo-grid'),wrapped=false;
   if(b.tipo==='par-fotos')continue;
   if(!track||track.children.length<2||node.dataset.galleryVariant==='carrusel')continue;
   const photos=[...track.children],controls=document.createElement('div');controls.className='route-gallery-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Navegar fotos de '+(b.contenido.titulo||p.nombre));
   controls.innerHTML='<span aria-live="polite"></span><button type="button" aria-label="Ver foto anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button><button type="button" aria-label="Ver foto siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>';
   track.after(controls);const [prev,next]=controls.querySelectorAll('button'),count=controls.querySelector('span');
   const update=()=>{const step=photos[1].offsetLeft-photos[0].offsetLeft,index=step>0?Math.min(photos.length-1,Math.max(0,Math.round(track.scrollLeft/step))):0;count.textContent=(index+1)+' / '+photos.length;prev.disabled=track.scrollLeft<2;next.disabled=track.scrollLeft>=track.scrollWidth-track.clientWidth-2};
   const move=direction=>{const step=photos[1].offsetLeft-photos[0].offsetLeft;track.scrollBy({left:direction*step,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})};
   const back=()=>move(-1),forward=()=>move(1);prev.addEventListener('click',back);next.addEventListener('click',forward);track.addEventListener('scroll',update,{passive:true});const resize=new ResizeObserver(update);resize.observe(track);update();
   disposals.push(()=>{resize.disconnect();track.removeEventListener('scroll',update);prev.removeEventListener('click',back);next.removeEventListener('click',forward);controls.remove();if(wrapped){photos.forEach(photo=>track.before(photo));track.remove()}});
  }
  return ()=>disposals.forEach(dispose=>dispose());
 }
 function field(b,key,label,textarea=false){const interactive=automatic360Enabled(config,p,b)&&['explorador','panoramica360'].includes(b.tipo),copy=interactive?interactiveSectionCopy(b,b.tipo==='explorador'?'selector':'360'):null,value=copy&&key==='titulo'?copy.title:copy&&key==='texto'?copy.help:b.contenido[key]||'';return `<label>${label}${textarea?`<textarea data-block-field="${key}" rows="3">${esc(value)}</textarea>`:`<input data-block-field="${key}" value="${esc(value)}">`}${interactive&&key==='titulo'?'<small>Vacío: no se muestra el título.</small>':''}</label>`}
 let editor;const supported=Number(config.version)<=2;
 if(compare){editor=document.createElement('section');editor.className='block-editor';editor.innerHTML=`<h3>Contenido de la miniweb</h3><p>Elija contenido, orden y variante. Portada fija arriba; inmobiliarias e información profesional al pie. Apagar conserva el contenido. ${editing?'Aplique al proyecto y guarde desde el creador.':'Cambios locales en memoria, sin guardados.'}</p><div class="block-editor-list"></div><div class="block-add"><label>Agregar bloque<select aria-label="Tipo de bloque"></select></label><button type="button" data-add-block>Agregar</button></div><p class="block-editor-status" role="status"></p>`;($('previewSettings').querySelector('.design-chooser')||$('previewSettings').querySelector('.settings-subtitle')).after(editor);
  const capture=e=>{if(!supported)return;const b=config.bloques.find(b=>b.id===e.target.closest('[data-edit-block]')?.dataset.editBlock),d=e.target.dataset;if(!b)return;if(d.photoKey){const photo=editableBlockPhoto(b,d.photoIndex,editorialPhotos(b));if(!photo)return;photo[d.photoKey]=e.target.value;if(d.photoKey==='url'&&(p.banco_regional||[]).some(f=>f.url===e.target.value))photo.pie='Fotografía regional'}if(d.blockField)b.contenido[d.blockField]=e.target.value;if('blockPoints'in d)b.contenido.puntos=e.target.value.split('\n').map(s=>s.trim()).filter(Boolean);if('figureKey'in d){const values=new Set(Array.isArray(b.opciones.cifras)?b.opciones.cifras:['hectareas','superficies','precio']);if(d.figureKey==='lotes')values.delete('total');e.target.checked?values.add(d.figureKey):values.delete(d.figureKey);b.opciones.cifras=[...values]}if(d.blockOption)b.opciones[d.blockOption]=e.target.type==='number'?Number(e.target.value):e.target.value;if('blockPhotos'in d){const urls=e.target.value.split('\n').map(s=>s.trim()).filter(Boolean);if(urls.every(safeUrl)){if(urls.length)b.contenido.fotos=urls;else delete b.contenido.fotos}}if(d.blockMedia&&(!e.target.value||safeUrl(e.target.value)))setBlockPanorama(b,e.target.value);};
  editor.addEventListener('input',capture);editor.addEventListener('change',async e=>{if(!supported)return;capture(e);const b=config.bloques.find(b=>b.id===e.target.closest('[data-edit-block]')?.dataset.editBlock);if(!b)return;const d=e.target.dataset;if('albumRename'in d&&b.tipo==='experiencias')renameAlbum(b,d.albumRename,e.target.value);if('blockOrder'in d&&!BLOCK_TYPES[b.tipo]?.fijo){const i=config.bloques.indexOf(b),j=Math.max(1,Math.min(config.bloques.length-2,Number(e.target.value)));if(Number.isInteger(j)){config.bloques.splice(i,1);config.bloques.splice(j,0,b)}}if('blockActive'in d&&!BLOCK_TYPES[b.tipo]?.fijo){b.activo=e.target.checked}if('blockVariant'in d){b.variante=e.target.value;b.opciones.varianteManual=true}if(d.blockFile||'photoUpload'in d||d.imageUpload){const f=e.target.files?.[0];if(!f)return;if(!/^image\/(jpeg|png|webp)$/.test(f.type)||(d.blockFile!=='panorama'&&f.size>30*1024*1024)){editor.querySelector('.block-editor-status').textContent='Seleccione JPG, PNG o WebP de hasta30MB.';return}let uploaded;if(uploadMedia){try{pendingUploads++;e.target.disabled=true;uploaded=await uploadMedia(f,d.blockFile);if(!config.bloques.includes(b))return}catch(error){editor.querySelector('.block-editor-status').textContent=error.message||'No se pudo subir la imagen.';return}finally{pendingUploads--;e.target.disabled=false}}else{const key='local:'+ ++serial;localMedia.set(key,URL.createObjectURL(f));uploaded=key}if('photoUpload'in d){const photo=editableBlockPhoto(b,d.photoUpload,editorialPhotos(b));if(photo)photo.url=uploaded}else if(d.imageUpload)b.contenido[d.imageUpload]=uploaded;else setBlockPanorama(b,uploaded)}onChange()});
  editor.addEventListener('click',e=>{if(!supported)return;const button=e.target.closest('button');if(!button)return;const i=config.bloques.findIndex(b=>b.id===button.closest('[data-edit-block]')?.dataset.editBlock);if('editorPhotoSelect'in button.dataset){const b=config.bloques[i];if(b){activePhotos.set(b.id,Number(button.dataset.editorPhotoSelect));renderEditor()}return}if(button.dataset.albumMove){const b=config.bloques[i];if(b?.tipo==='experiencias'&&moveAlbum(b,button.dataset.albumName,Number(button.dataset.albumMove)))onChange();return}if('bankTab'in button.dataset){switchPhotoBank(button);return}if('bankChoice'in button.dataset){const b=config.bloques[i];if(!b)return;selectBlockPhoto(b,button.dataset.bankField,button.dataset.bankIndex,button.dataset.bankChoice,editorialPhotos(b));onChange();return}if('blockApply'in button.dataset)onChange();if(button.dataset.blockMove){const j=i+Number(button.dataset.blockMove);if(i>=0&&i>0&&j>0&&j<config.bloques.length-1)[config.bloques[i],config.bloques[j]]=[config.bloques[j],config.bloques[i]];onChange()}if('addBlock'in button.dataset){const type=editor.querySelector('.block-add select').value,s=BLOCK_TYPES[type];if(!s)return;const b={id:type+'-'+Date.now().toString(36)+'-'+ ++serial,tipo:type,activo:true,variante:['galeria','asi-se-vive'].includes(type)?(landscape()?'editorial':'banda'):s.variantes[0],fuente:'editorial',contenido:{},opciones:{}};config.bloques.splice(config.bloques.length-1,0,b);onChange()}});
 }
 function photoFields(b){
  const photos=editorialPhotos(b),pair=['par-fotos','cortina'].includes(b.tipo),curtain=b.tipo==='cortina',scenes=b.tipo==='escenas',story=['perspectivas','capitulos'].includes(b.tipo),count=pair?2:Math.max(1,Math.min(scenes?4:story?12:100,Number(b.opciones.cantidadFotos)||photos.length||4));
  const active=Math.max(0,Math.min(count-1,activePhotos.get(b.id)||0));activePhotos.set(b.id,active);
  const bank=b.tipo==='asi-se-vive'?p.banco_regional||[]:[...(b.tipo==='experiencias'?p.banco_regional||[]:[]),...(p.media_bank||[]),...(p.fotos||[]).map(url=>({url,nombre:fileLabel(url)})),...(scenes?p.banco_regional||[]:[])];
  return `<p>${b.tipo==='asi-se-vive'?'Fotos regionales; no representan los lotes.':scenes?'Una imagen fija o hasta cuatro escenas. Identifique las fotos regionales en su pie; no son imágenes del lote.':curtain?'La foto inicial se abre para descubrir la segunda.':pair?'Elija dos escalas distintas: una vista amplia para la foto grande y un acercamiento para la foto detalle.':'Seleccione las fotos del proyecto.'}</p>`+(!pair?`<label>Cantidad de fotos<input type="number" min="1" max="${scenes?4:story?12:100}" data-block-option="cantidadFotos" value="${count}"></label>`:'')+(scenes?`<label>Movimiento<select data-block-option="movimiento"><option value="si" ${b.opciones.movimiento!=='no'?'selected':''}>Barrido en escritorio</option><option value="no" ${b.opciones.movimiento==='no'?'selected':''}>Fotos quietas</option></select></label><label>Índice de escenas<select data-block-option="indice"><option value="si" ${b.opciones.indice!=='no'?'selected':''}>Mostrar</option><option value="no" ${b.opciones.indice==='no'?'selected':''}>Ocultar</option></select></label>`:'')+`<div class="editor-photo-strip" role="group" aria-label="Fotos del bloque">${Array.from({length:count},(_,i)=>`<button type="button" data-editor-photo-select="${i}" aria-label="Editar ${curtain?(i?'foto que se descubre':'foto inicial'):pair?(i?'foto detalle':'foto grande'):'foto '+(i+1)}" aria-pressed="${i===active}">${media(photos[i]?.url)?`<img src="${esc(media(photos[i].url))}" alt="" loading="lazy">`:'<span>＋</span>'}<span>${curtain?(i?'Se descubre':'Inicial'):pair?(i?'Detalle':'Grande'):i+1}</span></button>`).join('')}</div><p class="editor-active-photo">Editando ${curtain?(active?'foto que se descubre':'foto inicial'):pair?(active?'foto detalle':'foto grande'):'foto '+(active+1)+' de '+count}. Seleccione otra miniatura o una foto de la página.</p>`+[active].map(i=>{
   const f=photos[i]||{},choices=bank.some(x=>x.url===f.url)||!f.url?bank:[{url:f.url,nombre:'Imagen seleccionada'},...bank];
   return `<fieldset class="editor-photo-fields"><legend>${curtain?(i?'Foto que se descubre':'Foto inicial'):pair?(i?'Foto detalle':'Foto grande'):(scenes?'Escena ':'Foto ')+(i+1)}</legend><label>Imagen<select data-photo-index="${i}" data-photo-key="url"><option value="">Sin imagen</option>${choices.map(x=>`<option value="${esc(x.url)}" ${f.url===x.url?'selected':''}>${esc(x.nombre||x.url)}</option>`).join('')}</select></label>${b.variante==='experiencias'||b.tipo==='experiencias'?`<label>Álbum de esta foto<input data-photo-index="${i}" data-photo-key="experiencia" value="${esc(f.experiencia||contextPhoto(f.url)?.categoria||'')}" placeholder="Nombre de la experiencia"></label><label>Tapa del álbum<select data-photo-index="${i}" data-photo-key="tapa"><option value="">No</option><option value="si" ${f.tapa==='si'?'selected':''}>Sí, usar esta foto</option></select></label>`:''}<label>Subir esta foto<input type="file" accept="image/jpeg,image/png,image/webp" data-photo-upload="${i}"></label>${!story&&!curtain?`<label>Encuadre<select data-photo-index="${i}" data-photo-key="encuadre">${Object.entries({centro:"Centrado",arriba:"Priorizar parte superior",abajo:"Priorizar parte inferior",izquierda:"Priorizar izquierda",derecha:"Priorizar derecha",completa:"Foto completa, sin recortar"}).map(([value,label])=>`<option value="${value}" ${photoFrame(f)===value?"selected":""}>${label}</option>`).join("")}</select></label>`:""}${scenes||story?`<label>Título<input data-photo-index="${i}" data-photo-key="titulo" value="${esc(f.titulo||'')}"></label><label>Texto breve<input data-photo-index="${i}" data-photo-key="texto" value="${esc(f.texto||'')}"></label><label>Texto del botón<input data-photo-index="${i}" data-photo-key="boton" value="${esc(f.boton||'')}"></label><label>Destino<select data-photo-index="${i}" data-photo-key="destino"><option value="">Sin enlace</option><option value="explorador" ${f.destino==='explorador'?'selected':''}>Explorador de lotes</option><option value="contacto" ${f.destino==='contacto'?'selected':''}>Contacto</option></select></label>`:''}<label>Descripción<input data-photo-index="${i}" data-photo-key="alt" value="${esc(f.alt||'')}"></label>${!curtain?`<label>Pie de foto (opcional)<input data-photo-index="${i}" data-photo-key="pie" value="${esc(f.pie||'')}"></label>`:''}${['galeria','asi-se-vive','experiencias'].includes(b.tipo)?`<label>Mostrar el texto de esta foto<select data-photo-index="${i}" data-photo-key="mostrarPie"><option value="si">Sí</option><option value="no" ${f.mostrarPie==='no'?'selected':''}>No</option></select></label>`:''}</fieldset>`;
  }).join('');
 }
 function coverPhotoFields(b){
  const c=b.contenido;
  const index=activePhotos.get(b.id)===1?1:0;
  const slots=[
   {label:'Foto principal',key:'imagen',alt:'alt',caption:'pie',fallback:p.foto_portada},
   {label:'Foto de detalle',key:'imagenDetalle',alt:'altDetalle',caption:'pieDetalle',fallback:defaultCoverDetail(c)}
  ];
  const slot=slots[index], source=c[slot.key]||slot.fallback||'';
  const choices=slots.map((item,i)=>`<button type="button" data-editor-photo-select="${i}" aria-pressed="${index===i}" aria-label="Editar ${item.label.toLowerCase()}">${image(c[item.key]||item.fallback,'')}<span>${item.label}</span></button>`).join('');
  return `<div class="editor-photo-strip" data-cover-photos role="group" aria-label="Fotos de portada">${choices}</div>
   <fieldset class="editor-single-photo-fields"><legend>${slot.label}</legend>
   <label>Imagen<select data-block-field="${slot.key}" data-cover-fallback="${esc(slot.fallback||'')}"><option value="">Usar foto del proyecto</option>${source?`<option selected value="${esc(source)}">${esc(fileLabel(source))}</option>`:''}</select></label>
   <label>Subir ${slot.label.toLowerCase()}<input type="file" accept="image/jpeg,image/png,image/webp" data-image-upload="${slot.key}"></label>
   ${field(b,slot.alt,'Descripción de la imagen')}${field(b,slot.caption,'Pie de foto')}</fieldset>`;
 }
 function decoratePhotoPickers(){
  editor.querySelectorAll('select[data-photo-key="url"],select[data-block-field="imagen"],select[data-block-field="respaldo"],select[data-block-field="imagenDetalle"]').forEach(select=>{
   const field=select.dataset.photoKey?'photo':select.dataset.blockField,index=select.dataset.photoIndex||'',label=select.closest('label'),bank=document.createElement('section');
   bank.className='editor-photo-bank';bank.setAttribute('aria-label',field==='respaldo'?'Elegir foto de respaldo':'Elegir imagen');bank.dataset.bankField=field;bank.dataset.bankIndex=index;bank.dataset.selected=select.value;
   const base=[{value:'',text:select.options[0]?.text||'Sin imagen'},...(p.foto_portada?[{value:p.foto_portada,text:'Portada del proyecto'}]:[]),...(p.media_bank||[]).map(photo=>({value:photo.url,text:photo.nombre||'Imagen del proyecto'})),...(p.fotos||[]).map((url,i)=>({value:url,text:'Foto '+(i+1)+' del proyecto'})),...[...select.options].filter(option=>option.value).map(option=>({value:option.value,text:option.text}))];
   const options=base.filter((option,i,all)=>(!option.value||media(option.value))&&(!option.value||!contextPhoto(option.value))&&all.findIndex(other=>photoKey(other.value)===photoKey(option.value))===i);
   bank.innerHTML='<strong class="editor-photo-heading">'+(field==='respaldo'?'Foto de respaldo':'Elegir imagen')+'</strong><div class="editor-photo-tabs" role="group" aria-label="Biblioteca de imágenes"><button type="button" data-bank-tab="proyecto" aria-pressed="true">Proyecto</button><button type="button" data-bank-tab="contexto" aria-pressed="false">Contexto</button></div><p class="editor-photo-help" data-context-help hidden>Biblioteca compartida de Sur para todas las miniwebs. Son fotos de contexto; no representan el desarrollo ni sus lotes.</p><div class="editor-photo-options" data-bank-group="proyecto">'+options.map((option,i)=>{const name=!option.value?option.text:/^\d+-[\w-]+\.(?:webp|jpe?g|png)$/i.test(option.text)?'Foto '+i+' del proyecto':option.text;return photoButton({url:media(option.value||(select.dataset.coverFallback??(!select.dataset.photoKey?p.foto_portada:''))),nombre:name},option.value,field,index,select.value)}).join('')+'</div><div class="editor-photo-options" data-bank-group="contexto" hidden></div>';
   label.hidden=true;label.after(bank);if(contextPhoto(select.value))switchPhotoBank(bank.querySelector('[data-bank-tab="contexto"]'));
  });
 }
 function estudioControls(b){
  if(config.estilo!=='estudio-vivo'||p.slug==='aldea-los-huemules')return '';
  const effects=b.tipo==='portada'?[['estudioTituloMovimiento','Entrada del título'],['estudioBarraMovimiento','Movimiento de la barra'],['estudioSubrayadoMovimiento','Subrayado de enlaces'],['estudioBotonMovimiento','Movimiento del botón']]:b.tipo==='perspectivas'?[['estudioVistasMovimiento','Fundido entre vistas']]:b.tipo==='foto-frase'?[['estudioAperturaMovimiento','Apertura de la foto']]:[];
  const warning=estudioPhotoConflicts(config.bloques,p).includes(b.id)?'<p role="status">Esta foto también está en otro bloque. Puede elegir otra sin perder la foto cargada.</p>':'';
  return warning+(effects.length?'<fieldset><legend>Movimientos de Estudio</legend>'+effects.map(([key,label])=>`<label>${label}<select data-block-option="${key}"><option value="si" ${b.opciones[key]!=='no'?'selected':''}>Activado</option><option value="no" ${b.opciones[key]==='no'?'selected':''}>Apagado</option></select></label>`).join('')+'</fieldset>':'');
 }
 function renderEditor(){if(!editor)return;const opened=new Set([...editor.querySelectorAll('details[data-edit-block][open]')].map(d=>d.dataset.editBlock)),formats=new Set([...editor.querySelectorAll('details[data-edit-block]:has(.block-format[open])')].map(d=>d.dataset.editBlock)),effects=new Set([...editor.querySelectorAll('details[data-edit-block]:has(.block-effects[open])')].map(d=>d.dataset.editBlock));editor.querySelector('.block-add select').innerHTML=Object.entries(BLOCK_TYPES).filter(([t,s])=>t!=='asi-se-vive'&&!s.fijo&&(s.repeat||!config.bloques.some(b=>b.tipo===t))).map(([t,s])=>`<option value="${t}">${s.nombre}</option>`).join('');editor.querySelector('.block-add').hidden=!supported;
  editor.querySelector('.block-editor-list').innerHTML=config.bloques.filter(b=>!visualEditor||b.id===inspectedId).map((b)=>{const i=config.bloques.indexOf(b),s=BLOCK_TYPES[b.tipo],c=b.contenido,state=availability(b),editable=['indice-fotografico','lista-fotografica','video','imagen','perspectivas','capitulos','escenas','intro','par-fotos','asi-se-vive','experiencias','portada','foto-texto','foto-frase','foto-frase-lateral','galeria','ubicacion','contacto','panoramica360','texto-foto','texto-movil','cortina','explorador','servicios','ficha-tecnica','cronograma','financiacion','cifras'].includes(b.tipo),mediaType=['intro','video','imagen','portada','foto-texto','foto-frase','foto-frase-lateral','ubicacion','panoramica360','comercializacion','texto-foto'].includes(b.tipo);return `<details data-edit-block="${esc(b.id)}" ${opened.has(b.id)?'open':''}><summary><input data-block-active type="checkbox" aria-label="Mostrar ${esc(s?.nombre||b.tipo)}" ${b.activo?'checked':''} ${s?.fijo||!supported?'disabled':''}><span>${esc(s?.nombre||b.tipo)}${s?.fijo?'<small>Siempre presente</small>':enabled(b)&&!state.ready?'<small>Falta contenido</small>':!enabled(b)?'<small>Apagado</small>':''}</span></summary><div class="block-edit-body">${blockLayoutControls(b)}${visualResourceControls(b)}${estudioControls(b)}${!s?.fijo?`<div class="block-position"><button data-block-move="-1" ${i<=1?'disabled':''}>↑ Subir</button><button data-block-move="1" ${i>=config.bloques.length-2?'disabled':''}>↓ Bajar</button></div><label>Posición en la página<select aria-label="Posición en la página" data-block-order>${config.bloques.slice(1,-1).map((other,j)=>`<option value="${j+1}" ${i===j+1?'selected':''}>${j+2} · ${esc(BLOCK_TYPES[other.tipo]?.nombre||other.tipo)}</option>`).join('')}</select></label>`:''}<label>Diseño del bloque<select data-block-variant>${(s?.variantes||[b.variante]).map(v=>`<option value="${v}" ${b.variante===v?'selected':''}>${({acercamiento:'Acercamiento (plano o aérea)',banda:'Banda a sangre',editorial:'Editorial',mosaico:'Mosaico',carrusel:'Carrusel',tira:'Tira horizontal',ritmo:'Ritmo fotográfico',franjas:'Franjas panorámicas',experiencias:'Por experiencias',album:'Álbum','paisaje-detalle':'Paisaje y detalle',fichas:'Fichas con iconos',fija:'Una imagen fija',barrido:'Barrido al desplazarse',apilada:'Una debajo de otra'})[v]||v.replaceAll('-',' ')}</option>`).join('')}</select></label>${['galeria','asi-se-vive','experiencias'].includes(b.tipo)?`<label>Encabezado de la galería<select data-block-option="textosCabecera"><option value="si">Mostrar</option><option value="no" ${b.opciones.textosCabecera==='no'?'selected':''}>Ocultar conservando los textos</option></select></label><label>Textos de las fotos<select data-block-option="textosFotos">${[['ocultos','Ocultos'],['debajo','Debajo de las fotos'],['sobre','Sobre las fotos']].map(([v,n])=>`<option value="${v}" ${(b.opciones.textosFotos||'debajo')===v?'selected':''}>${n}</option>`).join('')}</select></label>`:''}${editable?(b.tipo==='intro'?'':(['texto-foto','texto-movil','cortina'].includes(b.tipo)?'':field(b,'rotulo','Antetítulo (opcional)'))+field(b,'titulo',b.tipo==='portada'?'Frase de portada':'Título'))+(b.tipo==='portada'?'<p>Una sola frase breve debajo del nombre. El desarrollo del proyecto va en Introducción o Foto + título + texto.</p>':['texto-movil','cortina'].includes(b.tipo)?'':field(b,'texto','Texto',true)):''}${b.tipo==='contacto'?`<label>Mapa de la ubicación junto al formulario<select data-block-option="mapaContacto"><option value="">No</option><option value="si" ${b.opciones.mapaContacto==='si'?'selected':''}>Sí, a la derecha del formulario</option></select></label>`:''}${b.tipo==='financiacion'?`<fieldset class="figure-choices"><legend>Plan de pagos en cifras (optativo)</legend>${[1,2,3].map(n=>field(b,'planValor'+n,'Cifra '+n)+field(b,'planEtiqueta'+n,'Aclaración de la cifra '+n)).join('')}<p>Escriba cada importe como debe verse. El texto de financiación cargado en el proyecto se conserva.</p></fieldset>`:''}${b.tipo==='servicios'&&b.variante==='fichas'?`<fieldset class="figure-choices"><legend>Servicios de este bloque (optativo)</legend>${field(b,'serviciosPropios','Servicios, separados por coma')}<p>Vacío: se muestran los servicios cargados en el proyecto. Escribirlos acá no cambia los datos del proyecto.</p></fieldset>`:''}${b.tipo==='cifras'?`<label>Unir con Financiación y Servicios, si van a continuación<select data-block-option="grupoOferta"><option value="">No</option><option value="si" ${b.opciones.grupoOferta==='si'?'selected':''}>Sí, en una sola grilla</option></select></label>`:''}${b.tipo==='cifras'?`<fieldset class="figure-choices"><legend>Rótulos de las cifras (optativo)</legend>${field(b,'rotulo_precio','Rótulo del precio')+field(b,'rotulo_superficies','Rótulo de las superficies')}<p>Vacío: se usa el rótulo habitual.</p></fieldset>`:''}${b.tipo==='cifras'?`<fieldset class="figure-choices"><legend>Cifras que se muestran</legend>${[['hectareas','Superficie del desarrollo'],['superficies','Superficies de los lotes publicados'],['precio','Precio desde'],['lotes','Total de lotes del desarrollo'],['sector','Sectores de la selección']].map(([key,label])=>`<label><input type="checkbox" data-figure-key="${key}" ${(Array.isArray(b.opciones.cifras)?b.opciones.cifras:['hectareas','superficies','precio']).some(v=>v===key||(key==='lotes'&&v==='total'))?'checked':''}>${label}</label>`).join('')}<p>Sin dato cargado, la cifra no aparece.</p></fieldset>`:''}${b.tipo==='intro'?field(b,'enfasis','Continuación del texto')+field(b,'detalle','Detalle',true):''}${b.tipo==='experiencias'&&albumNames(b).length?`<fieldset class="figure-choices"><legend>Álbumes</legend>${albumNames(b).map((name,k,all)=>`<div class="album-row" style="display:flex;gap:8px;align-items:end;margin:0 0 10px"><label style="flex:1;margin:0">Nombre del álbum ${k+1}<input data-album-rename="${esc(name)}" value="${esc(name)}"></label><button type="button" data-album-move="-1" data-album-name="${esc(name)}" aria-label="Subir el álbum ${esc(name)}" ${k===0?'disabled':''}>↑ Subir</button><button type="button" data-album-move="1" data-album-name="${esc(name)}" aria-label="Bajar el álbum ${esc(name)}" ${k===all.length-1?'disabled':''}>↓ Bajar</button></div>`).join('')}<p>El nombre se cambia en todas las fotos del álbum. El orden de esta lista es el de la página.</p></fieldset>`:''}${['perspectivas','capitulos','escenas','par-fotos','asi-se-vive','galeria','experiencias','cortina'].includes(b.tipo)?photoFields(b):''}${['texto-foto','cortina'].includes(b.tipo)?`<label>${b.tipo==='texto-foto'?'Texto complementario':'Título sobre las fotografías'}<select data-block-option="textosRecurso"><option value="si">Mostrar</option><option value="no" ${b.opciones.textosRecurso==='no'?'selected':''}>Ocultar</option></select></label>`:''}${['galeria','asi-se-vive'].includes(b.tipo)&&b.variante==='franjas'?`<label>Proporción de las franjas (ancho / alto)<input type="number" min="3" max="12" step=".5" data-block-option="franjasProporcion" value="${b.opciones.franjasProporcion||7}"></label><label>Velo sobre las fotos (%)<input type="range" min="0" max="80" data-block-option="franjasVelo" value="${b.opciones.franjasVelo??30}"></label>`:''}${b.tipo==='video'?field(b,'video','URL del video')+`<label>Reproducción automática (sin sonido)<select data-block-option="autoplay"><option value="no" ${b.opciones.autoplay!=='si'?'selected':''}>No</option><option value="si" ${b.opciones.autoplay==='si'?'selected':''}>Sí, respeta movimiento reducido</option></select></label><label>Repetir<select data-block-option="repetir"><option value="no">No</option><option value="si" ${b.opciones.repetir==='si'?'selected':''}>Sí</option></select></label><p>MP4/WebM o YouTube. La foto de respaldo se usa en MP4/WebM; YouTube muestra su propia portada.</p>`:''}${b.tipo==='explorador'?`${config.estilo!=='inmersivo'&&p.slug!=='aldea-los-huemules'?`<label>Paneles del selector<select data-block-option="panelesSelector"><option value="oscuro" ${(b.opciones.panelesSelector||(['estudio-vivo','relato','recorrido'].includes(config.estilo)?'claro':'oscuro'))==='oscuro'?'selected':''}>Oscuros</option><option value="claro" ${(b.opciones.panelesSelector||(['estudio-vivo','relato','recorrido'].includes(config.estilo)?'claro':'oscuro'))==='claro'?'selected':''}>Claros</option></select></label>`:''}${b.variante==='tabla'?`<label>Orden inicial de la tabla<select data-block-option="ordenLotes">${[['numero','Número de lote'],['precio','Precio: menor a mayor'],['superficie','Superficie: menor a mayor'],['metro','USD por m²: menor a mayor']].map(([v,label])=>`<option value="${v}" ${(b.opciones.ordenLotes||'numero')===v?'selected':''}>${label}</option>`).join('')}</select></label>`:''}${[['filtrosVisitante','Filtros y contador'],['ordenVisitante','Ordenar lotes'],['fichaConMedios','Ficha con sector, vista 360° y fotos'],['compararLotes','Comparar dos lotes']].map(([key,label])=>`<label>${label}<select data-block-option="${key}"><option value="">Del estilo</option><option value="si" ${b.opciones[key]==='si'?'selected':''}>Mostrar</option><option value="no" ${b.opciones[key]==='no'?'selected':''}>Ocultar</option></select></label>`).join('')}<label>Colorear lotes por disponibilidad<select data-block-option="colorearDisponibilidad"><option value="si">Sí</option><option value="no" ${b.opciones.colorearDisponibilidad==='no'?'selected':''}>No</option></select></label>${paletteFields()}<label>Relleno de las parcelas en la cenital<select data-block-option="rellenoCenital">${[['suave','Suave · hasta 20 %'],['recorrido','Igual al recorrido'],['lineas','Sólo contornos']].map(([v,n])=>`<option value="${v}" ${(b.opciones.rellenoCenital||'suave')===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Encuadre de la foto cenital<select data-block-option="encuadreCenital"><option value="completo" ${b.opciones.encuadreCenital==='completo'?'selected':''}>Foto completa</option><option value="parcelas" ${b.opciones.encuadreCenital!=='completo'?'selected':''}>Ajustar a las parcelas</option></select></label><label>Fondo del plano<select data-block-option="fondoMapa"><option value="foto" ${b.opciones.fondoMapa!=='plano'?'selected':''}>Foto aérea</option><option value="plano" ${b.opciones.fondoMapa==='plano'?'selected':''}>Sólo plano</option></select></label>${!hasMap?(hasGeometry?'<p>Vinculá los contornos a las fichas en Lotes para activar el mapa.</p>':'<p>Cargá un plano de parcelas en Mapa y recorrido 360° y vinculalo a los lotes del inventario.</p>'):!hasMapPhoto?'<p>Para usar una foto aérea, cargala con tres referencias en Mapa y recorrido 360°. Mientras tanto se muestra el plano.</p>':''}<p>Los precios, sectores, pines y coordenadas se editan en Lotes y Mapa de lotes.</p>`:''}${b.tipo==='portada'?`<div class="editor-video-source"><strong>Video de la portada</strong><p>Se utiliza el enlace cargado en Fotos y videos → Video del proyecto.</p>${safeUrl(p.video_url)?`<code>${esc(p.video_url)}</code>`:'<p>No hay un video cargado en el proyecto. Se conserva la foto de portada.</p>'}</div>`+field(b,'detalleLateral','Detalle lateral')+field(b,'botonPrincipal','Botón principal')+field(b,'botonSecundario','Botón secundario')+`<label>Medio de portada<select data-block-option="medio">${Object.entries(COVER_MEDIA).map(([v,label])=>`<option value="${v}" ${(b.opciones.medio||config.medio)===v?'selected':''}>${label}</option>`).join('')}</select></label>${(b.opciones.medio||config.medio)==='recorrido'?`<p class="editor-tour-source" role="status">${tourUrl()?'Esta portada abre el recorrido 360° del proyecto.':'Para mostrar el explorador, guardá el proyecto y activá su recorrido en Mapa y recorrido 360°.'}</p>`:''}`:''}${b.tipo==='portada'?`${config.estilo==='inmersivo'?`<label>Encuadre del video<select data-block-option="encuadreVideo"><option value="normal">Llenar portada</option><option value="cine" ${b.opciones.encuadreVideo==='cine'?'selected':''}>Recorte cine (video con franjas)</option></select></label><p>El recorte cine amplía la imagen y corta los extremos. Conserva el video original.</p>`:''}<label>Reproducción automática<select data-block-option="autoplay"><option value="si">Sí, sin sonido</option><option value="no" ${b.opciones.autoplay==='no'?'selected':''}>No, reproducir al solicitarlo</option></select></label>`:''}${b.tipo==='foto-texto'?field(b,'boton','Botón hacia lotes'):''}${b.tipo==='portada'&&config.estilo==='manifiesto'?coverPhotoFields(b):mediaType?`<fieldset class="editor-single-photo-fields"><legend>Fotografía</legend><label>${b.tipo==='panoramica360'?'Foto de respaldo':'Imagen'}<select data-block-field="${b.tipo==='panoramica360'?'respaldo':'imagen'}"><option value="">Del proyecto</option>${[c[b.tipo==='panoramica360'?'respaldo':'imagen'],p.foto_portada,...(p.media_bank||[]).map(f=>f.url),...(p.fotos||[])].filter((u,i,a)=>u&&a.indexOf(u)===i).map((u,j)=>`<option value="${esc(u)}" ${c[b.tipo==='panoramica360'?'respaldo':'imagen']===u?'selected':''}>${esc((p.media_bank||[]).find(f=>f.url===u)?.nombre||fileLabel(u))}</option>`).join('')}</select></label><label>Subir imagen<input type="file" accept="image/jpeg,image/png,image/webp" data-image-upload="${b.tipo==='panoramica360'?'respaldo':'imagen'}"></label>${b.tipo==='texto-foto'?'':field(b,'alt','Descripción de la imagen')+field(b,'pie','Pie de foto')}</fieldset>`:''}${b.tipo==='ubicacion'?`<label>Puntos destacados: uno por línea<textarea data-block-points rows="3">${esc((c.puntos||[]).join('\n'))}</textarea></label>`:''}${b.tipo==='contacto'?field(b,'pie','Texto junto a las formas de contacto',true):''}${b.tipo==='comercializacion'?`<p>La variante Editorial o Panorámica define también la presentación del contacto. Sur encabeza esta sección. Logos y ubicación se toman de las inmobiliarias de la red vinculadas al proyecto. La información profesional queda en una franja separada.</p>`:''}${b.tipo==='panoramica360'||b.tipo==='portada'?`<label>URL de la panorámica<input type="url" data-block-media="panorama" value="${esc(b.medio?.startsWith('local:')?'':b.medio||'')}"></label><label>${editing?'Subir panorámica360':'Probar foto360 local'}<input type="file" data-block-file="panorama" accept="image/jpeg,image/png,image/webp"></label><p>Panorámica2:1. ${editing?'Se sube al almacenamiento del proyecto.':'Archivo sólo en memoria, sin subir.'}</p>`:''}${editable&&!visualEditor?'<button type="button" data-block-apply>Aplicar contenido a la vista</button>':''}${enabled(b)&&!state.ready?`<p class="block-missing">${esc(state.missing)}</p>`:''}${state.warning?`<p class="block-missing" role="status">${esc(state.warning)}</p>`:''}</div></details>`}).join('');editor.querySelectorAll('[data-edit-block]').forEach(d=>{const f=d.querySelector('.block-format');if(f)f.open=formats.has(d.dataset.editBlock);const v=d.querySelector('.block-effects');if(v)v.open=effects.has(d.dataset.editBlock)});decoratePhotoPickers();if(!supported)editor.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);editor.querySelector('.block-editor-status').textContent=!supported?'Versión posterior: sólo lectura. Se conserva sin modificar.':editing?'Aplique los cambios y luego guarde el proyecto.':'Contrato v2. Sin guardados en esta vista.';
 }
 app.addEventListener('click',e=>{
  const open=e.target.closest('[data-open-project-tour]');
  const lotLink=e.target.closest('a.lot-tour-link');
  if(open || (lotLink && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button===0)){
   const stage=open?.closest('.tour-embed') || [...stream.querySelectorAll('.tour-embed')].find(node=>node.getClientRects().length);
   const href=lotLink?.href || tourUrl();
   if(stage && href){
    const url=new URL(href,location.origin);
    url.searchParams.set('integrado','1');
    e.preventDefault();
    if(lotLink){
     lotLink.closest('dialog[open]')?.close();
     onTourLot(url.searchParams.get('lote'));
    }
    const frame=mountTourFrame(stage,url);
    stage.scrollIntoView({block:'center'});
    frame.focus({preventScroll:true});
    return;
   }
  }
  const view=e.target.closest('[data-hero-view]');if(view){const hero=view.closest('[data-block-type=portada]');hero.querySelector('.hero-media>img').src=view.dataset.heroView;if(view.dataset.heroViewAlt)hero.querySelector('.hero-media>img').alt=view.dataset.heroViewAlt;slides.set('hero-'+view.dataset.heroViewBlock,Number(view.dataset.heroViewIndex));hero.querySelectorAll('[data-hero-view]').forEach(button=>button.setAttribute('aria-pressed',String(button===view)))}if(e.target.closest('[data-contact-brochure]')){if(cleanImmersive()){const url=safeUrl(p.brochure_url);if(url)window.open(url,'_blank','noopener,noreferrer')}else $('showBrochure').click();}const more=e.target.closest('[data-gallery-more]');if(more){const id=more.dataset.galleryMore,b=config.bloques.find(b=>b.id===id);expanded.has(id)?expanded.delete(id):expanded.add(id);nodes.get(id).innerHTML=content(b).html}const step=e.target.closest('[data-gallery-step]');if(step){const section=step.closest('[data-block-id]'),id=section.dataset.blockId,b=config.bloques.find(b=>b.id===id);slides.set(id,(slides.get(id)||0)+Number(step.dataset.galleryStep));section.innerHTML=content(b).html;section.querySelector(`[data-gallery-step="${step.dataset.galleryStep}"]`)?.focus({preventScroll:true})}const start=e.target.closest('[data-panorama-start]');if(start){const section=start.closest('[data-block-id]'),b=config.bloques.find(b=>b.id===section.dataset.blockId),dispose=startPanorama(section,media(b.medio||b.contenido.imagen360),{alta:panoramaDetail(b)});if(dispose)cleanups.push(dispose)}const way=e.target.closest('[data-contact-way]');if(way){const l=getSelected?.();onSelection?.(l);if(!$('contactMessage').value.startsWith('Quisiera coordinar una visita. '))$('contactMessage').value='Quisiera coordinar una visita. '+$('contactMessage').value;$('contactMessage').focus()}});
 function openContact({fromLink=false}={}){
  const section=form.closest('.contacto');
  if(!form.isConnected||!section||section.hidden)return false;
  const input=form.querySelector('[name=nombre]');
  const behavior=fromLink||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  if(matchMedia('(max-width: 800px)').matches){
   const label=input.closest('label');
   const navTop=Math.max(0,parseFloat(getComputedStyle(nav).top)||0);
   label.style.scrollMarginTop=(navTop+nav.offsetHeight+12)+'px';
   label.scrollIntoView({block:'start',behavior});
  }else{
   form.scrollIntoView({block:'center',behavior});
  }
  input.focus({preventScroll:true});
  return true;
 }
 return {compose,syncSelection,inspect:(id,index)=>{if(!config.bloques.some(b=>b.id===id))return;inspectedId=id;if(Number.isInteger(index))activePhotos.set(id,index);renderEditor()},isUploading:()=>pendingUploads>0,destroy:()=>{cleanups.forEach(f=>f());for(const value of localMedia.values())URL.revokeObjectURL(value)},openContact,explorerVariant:()=>{const b=config.bloques.find(b=>b.tipo==='explorador');return {lista:'lista',tarjetas:'tarjetas',sectores:'sectores'}[b?.variante]||'inmersivo'},portadaVariant:()=>config.bloques.find(b=>b.tipo==='portada')?.variante,heroVideo:()=>safeUrl(p.video_url),heroMode:()=>config.bloques.find(b=>b.tipo==='portada')?.opciones.medio||config.medio};
}

// A single equirectangular image; no third-party iframe, tour or database.
function startPanorama(section, url, {automatic=false,fallback,alt,alta}={}) {
 const stage = section.querySelector('.panorama-stage');
 const button = stage.querySelector('[data-panorama-start]');
 const result = stage.querySelector('[role=status]');
 if (!url || stage.querySelector('canvas')) return;
 const canvas = document.createElement('canvas');
 canvas.tabIndex = 0;
 canvas.setAttribute('aria-label','Panorámica 360°. Arrastre o use las flechas para girar.');
 const gl = canvas.getContext('webgl', {alpha:false, antialias:false});
 const image = new Image();
 let disposed = false, observer, tools,loadTimer,cancelDetail,baseTexture;
 const cleanup = () => {
   if (disposed) return;
   disposed = true;
   clearTimeout(loadTimer);
   image.onload = image.onerror = null;
   cancelDetail?.();
   observer?.disconnect();
   canvas.remove();
   tools?.remove();
   gl?.getExtension('WEBGL_lose_context')?.loseContext();
 };
 const fail = message => {
   stage.classList.add('panorama-unavailable');
   cleanup();
   if (button) button.disabled = false;
   result.textContent = message;
   if(automatic&&fallback&&!stage.querySelector('img')){const photo=new Image();photo.src=fallback;photo.alt=alt||'Imagen de respaldo del proyecto';photo.className='panorama-fallback';stage.prepend(photo)}
 };
 if(automatic){canvas.style.touchAction='pan-y';result.textContent='Cargando panorámica…';loadTimer=setTimeout(()=>fail('No se pudo cargar la panorámica. Se muestra la imagen de respaldo.'),35000)}
 if (button) { button.disabled = true; result.textContent = 'Cargando panorámica…'; }
 image.crossOrigin = 'anonymous';
 image.onerror = () => fail('No se pudo cargar la panorámica. Se conserva la foto de respaldo.');
 image.onload = () => {
  if (disposed) return;
  if (Math.abs(image.width/image.height-2)>.08) { fail('La imagen debe ser una panorámica equirectangular 2:1.'); return; }
  try {
   let renderView;
   if (gl) {const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error();return s};const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 v; void main(){v=p; gl_Position=vec4(p,0.,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision highp float; varying vec2 v; uniform sampler2D photo; uniform float yaw; uniform float pitch; uniform float fov; uniform float aspect; void main(){vec3 d=normalize(vec3(v.x*aspect*fov,v.y*fov,1.)); d=vec3(d.x,d.y*cos(pitch)+d.z*sin(pitch),-d.y*sin(pitch)+d.z*cos(pitch)); float u=fract(atan(d.x,d.z)/6.2831853+yaw/6.2831853+0.5); float t=0.5-asin(clamp(d.y,-1.,1.))/3.14159265;gl_FragColor=texture2D(photo,vec2(u,t));}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error();gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);baseTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,baseTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const max=gl.getParameter(gl.MAX_TEXTURE_SIZE);if(image.width>max){const resized=document.createElement('canvas');resized.width=max;resized.height=Math.round(max/2);resized.getContext('2d').drawImage(image,0,0,resized.width,resized.height);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,resized)}else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    const uniforms = Object.fromEntries(['yaw','pitch','fov','aspect'].map(key => [key,gl.getUniformLocation(program,key)]));
    renderView = (yaw,pitch,fov) => {
      const dpr = Math.min(devicePixelRatio || 1,2);
      const width = Math.max(1,Math.round(stage.clientWidth*dpr)), height = Math.max(1,Math.round(stage.clientHeight*dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0,0,width,height);
      for (const [key,value] of Object.entries({yaw,pitch,fov,aspect:width/height})) gl.uniform1f(uniforms[key],value);
      gl.drawArrays(gl.TRIANGLES,0,6);
    };
   } else {
    // Devices without WebGL can still pan the full photo. Horizontal tiling keeps the seam continuous.
    canvas.style.backgroundImage = 'url(' + JSON.stringify(image.src) + ')';
    canvas.style.backgroundRepeat = 'repeat-x';
    renderView = (yaw,pitch,fov) => {
      const height = Math.max(stage.clientHeight,stage.clientWidth/2) * (1.4/fov);
      const width = height*image.width/image.height;
      canvas.style.backgroundSize = width+'px '+height+'px';
      canvas.style.backgroundPosition = (stage.clientWidth/2-width*(.5+yaw/(2*Math.PI)))+'px '+((stage.clientHeight-height)*(.5-pitch/Math.PI))+'px';
    };
   }
   let yaw=0,pitch=0,fov=.8,drag;
   const draw=()=>renderView(yaw,pitch,fov);
   const turn=(x,y)=>{yaw+=x;pitch=Math.max(-1.4,Math.min(1.4,pitch+y));draw()};
   if(automatic){canvas.addEventListener('mw-inline-turn',e=>turn(-(Number(e.detail?.delta)||0)*.005,0));canvas.addEventListener('mw-inline-zoom',e=>{fov=Math.max(.3,Math.min(1.4,fov+Math.sign(Number(e.detail?.delta)||0)*.06));draw()});canvas.onwheel=e=>{if(!stage.matches(':fullscreen')&&!document.fullscreenElement&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey)return;e.preventDefault();fov=Math.max(.3,Math.min(1.4,fov+Math.sign(e.deltaY)*.06));draw()};}
   canvas.onpointerdown=e=>{
     if (e.button!==0 || !e.isPrimary) return;
     drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);
   };
   canvas.onpointermove=e=>{
     if (!drag || e.pointerId!==drag.id) return;
     turn(-(e.clientX-drag.x)*.005,(e.clientY-drag.y)*.005);
     drag.x=e.clientX;drag.y=e.clientY;
   };
   canvas.onlostpointercapture=canvas.onpointerup=canvas.onpointercancel=()=>{drag=null};
   canvas.onkeydown=e=>{
     const moves={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,.1],ArrowDown:[0,-.1]};
     if (moves[e.key]) { e.preventDefault();turn(...moves[e.key]); }
   };
   stage.append(canvas);
   clearTimeout(loadTimer);
   result.textContent='';
   if (button) {
    tools=document.createElement('div');tools.className='panorama-tools';
    tools.innerHTML='<button data-pan-view="left" aria-label="Girar a la izquierda">←</button><button data-pan-view="right" aria-label="Girar a la derecha">→</button><button data-pan-view="zoom" aria-label="Acercar panorámica">+</button><button data-pan-view="out" aria-label="Alejar panorámica">−</button><button data-pan-view="stop">Volver a foto</button>';
    stage.append(tools);button.hidden=true;
    result.textContent='Arrastre para girar. Puede seguir desplazando la página verticalmente.';
    tools.onclick=e=>{
      const action=e.target.dataset.panView;
      if(action==='left')turn(-.25,0);
      if(action==='right')turn(.25,0);
      if(action==='zoom'||action==='out'){fov=Math.max(.3,Math.min(1.4,fov+(action==='zoom'?-.1:.1)));draw()}
      if(action==='stop'){cleanup();button.hidden=false;button.disabled=false;result.textContent='';button.focus({preventScroll:true})}
    };
    canvas.focus({preventScroll:true});
   }
   observer=new ResizeObserver(draw);observer.observe(stage);draw();
   if(gl&&alta&&alta!==url)cancelDetail=upgradePanoramaTexture(gl,alta,baseTexture,next=>{
    baseTexture=next;draw();
   },()=>{result.textContent='La vista 4k sigue disponible. No se pudo cargar la versión de mayor detalle.'});
  } catch { fail('No se pudo abrir esta panorámica. Se conserva la foto.'); }
 };
 image.src=url;
 return cleanup;
}
