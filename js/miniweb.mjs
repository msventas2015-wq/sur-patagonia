import {validarConsulta,errorConsulta} from './consulta-miniweb.mjs';
import {syncMapRings} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {lotCounts,zoneCountText,salesZones,lotSalesZone,salesZoneInventory,salesZoneAppearance,salesZoneColor,publicSalesZoneColor,paintSalesZone,buildSalesZoneLayers,SALES_ZONE_STATES} from './zonas-venta.mjs?v=20261114-anillo7b';
import {interactiveSectionCopy,applyInteractiveHeadingStyle,bridgeInlineWheel} from './miniweb-360.mjs?v=20261117-cierre-venta1';
import {mountSelector,selectorEnabled,selectorRows} from './miniweb-selector.mjs?v=20261117-cierre-venta1';
import {lotTitle} from './ficha-lote-recorrido.mjs';
import {simulatedSales,simulateLotStates} from './recorrido-terrazas-qa.mjs?v=20261116-ficha';
import {lotFacts} from './lote-precio.mjs';
import {proyectarParcelas} from './lotes-inventario.mjs';
import {isAlamosReferenceProject,isReferencePreviewHost,projectTourUrl,lotLinkId,findPublicLot,hideLotInquiry} from './recorrido-enlaces.mjs?v=20261115-consulta-terrazas1';
import {availabilityColor,projectAvailability,estados,paintLot} from './recorrido-estilo.mjs?v=20261114-anillo7b';
import {mediaList} from './recorrido-medios.mjs?v=20261118-miniweb';
import {openMediaViewer} from './recorrido-visor-medios.mjs?v=20261114-media1';
import {applyMiniwebBackground} from './miniweb-background.mjs?v=20261113-estudio9';
import {COVER_MEDIA,coverMedium,commercialPresentation,DESIGN_STYLES,applyMiniwebPalette,mountDesignChooser,youtubeEmbed,usesLotPlanKey} from './miniweb-design.mjs?v=20261117-cierre-venta1';
import {normalizeBlocks,mountBlocks,developmentServices} from './miniweb-blocks.mjs?v=20261117-cierre-venta1';
import {rotularLotesTerrazas} from './ficha-lote-recorrido.mjs';
let youtubeAPI,youtubeSerial=0;
function loadYouTubeAPI(){
 if(window.YT?.Player)return Promise.resolve(window.YT);
 if(!youtubeAPI)youtubeAPI=new Promise((resolve,reject)=>{
  const previous=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{previous?.();resolve(window.YT)};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>reject(new Error('Video no disponible'));document.head.append(script);
 });
 return youtubeAPI;
}
// Five compositions share one data model; no backend, tracking or routing logic here.
const markup="\n<a class=\"skip\" href=\"#contenido\">Ir al contenido</a>\n<div class=\"preview-bar\" aria-label=\"Controles de comparación\">\n <div class=\"preview-caption\"><b>Miniwebs</b><span>Comparación local, datos de demostración</span></div>\n <div class=\"style-choices\" aria-label=\"Estilo visual\"><button data-style-choice=\"inmersivo\" aria-pressed=\"true\">Inmersivo oscuro</button><button data-style-choice=\"editorial\" aria-pressed=\"false\">Editorial claro</button><button data-style-choice=\"arquitectonico\" aria-pressed=\"false\">Arquitectónico</button></div>\n <button class=\"settings-trigger\" id=\"settingsTrigger\" aria-expanded=\"false\" aria-controls=\"previewSettings\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"3\" fill=\"#f5f5f3\"/><circle cx=\"15\" cy=\"17\" r=\"3\" fill=\"#f5f5f3\"/></svg>Ajustes</button>\n</div>\n<aside class=\"preview-settings\" id=\"previewSettings\" aria-label=\"Opciones de la vista previa\" hidden>\n <div class=\"settings-head\"><h2>Opciones de la miniweb</h2><button id=\"closeSettings\" aria-label=\"Cerrar ajustes\">×</button></div>\n <p class=\"settings-subtitle\">El contenido y las herramientas se mantienen al cambiar de estilo.</p>\n <label class=\"setting\">Portada principal<select id=\"mediaChoice\"><option value=\"foto\">Foto</option><option value=\"video\">Video</option><option value=\"panoramica360\">Panorámica 360°</option><option value=\"recorrido\">Explorador 360°</option></select></label>\n <label class=\"setting\">Reproducir video<input id=\"videoEnabled\" type=\"checkbox\" checked></label>\n <label class=\"setting\">Barra de datos<input type=\"checkbox\" data-section=\"facts\" checked></label>\n <label class=\"setting\">Mapa interactivo<input type=\"checkbox\" data-section=\"interactiveMap\" checked></label>\n <label class=\"setting\">Plano de mensura<input type=\"checkbox\" data-section=\"masterplan\" checked></label>\n <label class=\"setting\">Galería<input type=\"checkbox\" data-section=\"gallery\" checked></label>\n <label class=\"setting\">Representantes<input type=\"checkbox\" data-section=\"partners\" checked></label>\n <p class=\"settings-note\">Demostración local. Nombre, precios, lotes y posiciones ilustrativos. Fotos y plano del banco del sitio, sin correspondencia con los lotes de ejemplo. Los ajustes se restablecen al recargar.</p>\n</aside>\n<main id=\"contenido\">\n <section class=\"hero\" id=\"inicio\" aria-label=\"Presentación del proyecto\">\n  <div class=\"hero-media\"><img src=\"/assets/DESEMBOQUE-24.webp\" width=\"1920\" height=\"1080\" alt=\"Vista aérea de bosque y agua en la Patagonia\" fetchpriority=\"high\"><video id=\"heroVideo\" muted loop playsinline preload=\"none\" hidden aria-label=\"Video de presentación del proyecto\"></video></div>\n  <header class=\"project-nav\"><a class=\"identity\" href=\"#inicio\" aria-label=\"Naciente Patagonia, inicio\"><span class=\"identity-name\">naciente</span><span class=\"identity-partner\"><span>by</span><img src=\"/assets/logos/logo-horizontal-blanco.png\" width=\"288\" height=\"65\" alt=\"Sur Patagonian\"></span></a><nav class=\"nav-links\" aria-label=\"Navegación del proyecto\"><a href=\"#proyecto\">El proyecto</a><a href=\"#lotes\">Lotes</a><a href=\"#galeria\">El lugar</a><button class=\"btn nav-contact\" data-consult>Consultar</button></nav></header>\n  <div class=\"hero-copy\"><div><p class=\"place\">Desarrollo residencial en la Patagonia</p><h1>Naciente<span>Patagonia</span></h1><p class=\"hero-tagline\">El paisaje, el espacio y un lugar propio.</p><div class=\"hero-actions\"><a class=\"btn primary\" href=\"#lotes\">Explorar los lotes<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M5 12h14m-6-6 6 6-6 6\"/></svg></a><button class=\"btn\" id=\"playHero\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m9 5 10 7-10 7z\"/></svg>Ver video</button></div></div><p class=\"hero-index\">Una forma distinta<br>de encontrar su lugar.</p></div>\n  <span class=\"hero-caption\">Paisaje de referencia del banco de Sur Patagonian</span><div class=\"media-control\"><button id=\"pauseHero\" hidden aria-label=\"Pausar video\">Pausar video<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 5v14M16 5v14\"/></svg></button></div>\n </section>\n <div class=\"shell\"><dl class=\"facts\" id=\"facts\"><div><dt>Lotes desde</dt><dd>USD 38.000</dd></div><div><dt>Superficie desde</dt><dd>800<small>m²</small></dd></div><div><dt>Entorno</dt><dd>Bosque y agua</dd></div><div><dt>Desarrollo</dt><dd>8<small>lotes</small></dd></div></dl>\n <section class=\"intro\" id=\"proyecto\"><h2>La naturaleza como punto de partida.</h2><div><p>Un proyecto pensado para elegir el espacio donde quiere estar. Recorra el lugar, explore las distintas zonas y encuentre un lote a su medida.</p><div class=\"intro-links\"><a class=\"text-link\" href=\"#lotes\">Explorar disponibilidad</a><a class=\"text-link\" href=\"#masterplan\">Ver plano de mensura</a></div></div></section></div>\n <section class=\"lots\" id=\"lotes\" data-view=\"mapa\"><div class=\"shell\">\n  <header class=\"section-heading\"><h2>Encuentre su lugar.</h2><p>Explore el mapa o compare los lotes.<br>Todo lo que necesita, en una misma vista.</p></header>\n  <div class=\"lot-filters\"><div class=\"zones\" aria-label=\"Filtrar por zona\"><button data-zone=\"todas\" aria-pressed=\"true\">Todas las zonas</button><button data-zone=\"Bosque\" aria-pressed=\"false\">Bosque</button><button data-zone=\"Mirador\" aria-pressed=\"false\">Mirador</button></div><label><span class=\"quiet\" style=\"font-size:11px;margin-right:10px\">Disponibilidad</span><select id=\"stateFilter\" aria-label=\"Disponibilidad\"><option value=\"todos\">Todos los estados</option><option value=\"disponible\">Disponibles</option><option value=\"proximamente\">Próximamente</option><option value=\"reservado\">Reservados</option><option value=\"vendido\">Vendidos</option></select></label></div>\n  <div class=\"mobile-views\" aria-label=\"Vista de lotes\"><button data-view=\"mapa\" aria-pressed=\"true\">Mapa</button><button data-view=\"listado\" aria-pressed=\"false\">Listado</button></div>\n  <div class=\"lot-layout\"><div class=\"map-panel\" id=\"interactiveMap\"><div class=\"map-toolbar\"><span class=\"map-label\">Mapa interactivo</span><div class=\"map-zoom\" aria-label=\"Escala del mapa\"><button id=\"zoomOut\" aria-label=\"Alejar mapa\">−</button><button id=\"zoomReset\" aria-label=\"Restablecer escala\" style=\"font-size:10px\">1×</button><button id=\"zoomIn\" aria-label=\"Acercar mapa\">+</button></div></div><div class=\"map-stage\" id=\"mapStage\"><div class=\"map-canvas\" id=\"mapCanvas\"><img src=\"/assets/DJI_0272-Pano%20(1).webp\" width=\"1920\" height=\"1080\" alt=\"Imagen aérea de referencia con posiciones ilustrativas de lotes\" loading=\"lazy\"><div id=\"mapPins\"></div></div></div><div class=\"map-legend\"><span><i class=\"status-dot\"></i>Disponible</span><span><i class=\"status-dot reservado\"></i>Reservado</span><span><i class=\"status-dot vendido\"></i>Vendido</span><small>Posiciones de demostración</small></div></div><aside class=\"lot-aside\" id=\"lotDetail\" aria-label=\"Lote seleccionado\"></aside></div>\n  <div class=\"list-summary\"><span class=\"quiet\" id=\"lotCount\" role=\"status\"></span><button id=\"toggleList\" aria-expanded=\"false\" aria-controls=\"lotList\">Ver listado de lotes</button></div><div class=\"lots-table-wrap\" id=\"lotList\" hidden><table class=\"lots-table\"><thead><tr><th>Lote</th><th>Superficie</th><th>Zona</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody id=\"lotRows\"></tbody></table></div>\n </div></section>\n <div class=\"shell\"><details class=\"masterplan\" id=\"masterplan\"><summary><span>Plano de mensura</span><span>Ver plano completo<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m6 9 6 6 6-6\"/></svg></span></summary><button data-image=\"/assets/plano-buena-vista.webp\" data-image-title=\"Plano de mensura de referencia\" style=\"display:block;padding:0;border:0;background:none;width:100%;cursor:zoom-in\"><img src=\"/assets/plano-buena-vista.webp\" alt=\"Plano de mensura de referencia, separado del mapa interactivo\" width=\"1440\" height=\"810\" loading=\"lazy\"></button><p>Plano de ejemplo del banco del sitio. No corresponde a los lotes de demostración.</p></details></div>\n <section class=\"gallery shell\" id=\"gallery\"><header class=\"gallery-head\" id=\"galeria\"><h2>El lugar, de cerca.</h2><p>Otra perspectiva de la Patagonia.</p></header><div class=\"gallery-grid\"><button data-image=\"/assets/DESEMBOQUE-23.webp\" data-image-title=\"Paisaje de referencia\"><img src=\"/assets/DESEMBOQUE-23.webp\" alt=\"Paisaje patagónico junto al agua\" width=\"1920\" height=\"1080\" loading=\"lazy\"></button><button data-image=\"/assets/DESEMBOQUE-20.jpg\" data-image-title=\"Entorno de referencia\"><img src=\"/assets/DESEMBOQUE-20.jpg\" alt=\"Entorno natural patagónico\" width=\"1920\" height=\"1080\" loading=\"lazy\"></button></div></section>\n <section class=\"bottom shell\" id=\"contacto\"><div class=\"contact-row\"><div><h2>El próximo paso empieza con una conversación.</h2><p>Consulte por un lote o solicite más información sobre el proyecto.</p><div class=\"contact-options\"><button class=\"btn primary\" data-consult>Consultar el proyecto</button><button class=\"btn\" id=\"showBrochure\">Ficha PDF<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4\"/></svg></button></div></div><div class=\"location\"><strong>Patagonia, Argentina</strong>La ubicación de cada desarrollo se presenta aquí.<br><span style=\"display:block;margin-top:16px;font-size:11px\">Contenido ilustrativo para comparar estilos.</span></div></div><div class=\"partners\" id=\"partners\"><div class=\"partners-brand\"><span>Comercializado por</span><img src=\"/assets/logos/logo-horizontal-blanco.png\" width=\"288\" height=\"65\" alt=\"Sur Patagonian\"></div><div class=\"partners-slots\"><span class=\"partner-slot\">Inmobiliaria representante</span><span class=\"partner-slot\">Espacio para representante</span></div></div><footer><span>Naciente Patagonia. Desarrollo de demostración.</span><span>Vista previa local de estilos para el creador de miniwebs.</span></footer></section>\n</main>\n<button class=\"btn primary floating-contact\" data-consult>Consultar un lote</button>\n<dialog class=\"dialog\" id=\"contactDialog\" aria-labelledby=\"contactTitle\"><header><h2 id=\"contactTitle\">Consultar el proyecto</h2><button class=\"close\" data-close aria-label=\"Cerrar consulta\">×</button></header><form id=\"contactForm\"><label>Nombre<input name=\"nombre\" autocomplete=\"name\" required></label><label>Email<input name=\"email\" type=\"email\" autocomplete=\"email\" required></label><label>Mensaje<textarea name=\"mensaje\" id=\"contactMessage\" required></textarea></label><p>Prueba local: esta consulta no se envía ni se guarda.</p><button class=\"btn primary\" type=\"submit\">Probar consulta</button><p id=\"contactResult\" role=\"status\"></p></form></dialog>\n<dialog class=\"dialog image-dialog\" id=\"imageDialog\" aria-labelledby=\"imageTitle\"><header><h2 id=\"imageTitle\">Imagen</h2><button class=\"close\" data-close aria-label=\"Cerrar imagen\">×</button></header><img id=\"expandedImage\" src=\"data:,\" alt=\"\"></dialog>\n<p class=\"toast\" id=\"toast\" role=\"status\" hidden></p>\n";

export const STYLES = [
  ...DESIGN_STYLES,
  {id:'productivo',name:'Productivo',selector:'inmersivo',title:'Elija el suyo.',description:'Futura PT + Acumin Pro. Presentación oscura, foto de impacto y propuesta comercial.'},
  {id:'paisaje',name:'Paisaje',selector:'inmersivo',title:'Elija el suyo.',description:'Ogg + Sweet Sans Pro + Neue Haas Grotesk. Video inmersivo y relato fotográfico sobre cuerpo claro.'},
  {id:'editorial',name:'Editorial',selector:'lista',title:'Compare sus posibilidades',description:'Relato fotográfico del proyecto y comparación en lista.'},
  {id:'arquitectonico',name:'Arquitectónica',selector:'plano',title:'El desarrollo, en detalle',description:'Plano protagonista y ficha técnica junto al dibujo.'},
  {id:'sectores',name:'Sectores',selector:'sectores',title:'Un lugar en cada sector',description:'Explore primero las zonas y después los lotes de cada una.'},
  {id:'catalogo',name:'Catálogo',selector:'tarjetas',title:'Conozca cada lote',description:'Tarjetas fotográficas y ficha ampliada de cada lote.'}
];
export function parseTheme(value){try{const t=typeof value==='string'?JSON.parse(value):value;return t&&typeof t==='object'&&!Array.isArray(t)?t:{}}catch{return {}}}
export function safeUrl(value){if(typeof value!=='string'||!value.trim()||value.length>3000)return '';try{const u=new URL(value,location.origin);return (u.protocol==='https:'||(u.origin===location.origin&&u.protocol==='http:'))&&!u.username&&!u.password?u.href:''}catch{return ''}}
export function normalizeMiniweb(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const allowed=(v,list,fallback)=>list.includes(v)?v:fallback;
 return {...raw,version:Number(raw.version)>2?raw.version:2,bloques:normalizeBlocks(raw),controlBloques:1,paleta:typeof raw.paleta==='string'?raw.paleta:'bosque',activa:raw.activa!==false,estilo:allowed(raw.estilo,STYLES.map(s=>s.id),'inmersivo'),selector:allowed(raw.selector,['auto','inmersivo','lista','plano','sectores','tarjetas'],'auto'),ficha:allowed(raw.ficha,['auto','lateral','modal'],'auto'),densidad:allowed(raw.densidad,['normal','compacto','amplio'],'normal'),presentacion:allowed(raw.presentacion,['auto','apilada','foto'],'auto'),alineacion:allowed(raw.alineacion,['izquierda','centro'],'izquierda'),altura:allowed(raw.altura,['auto','compacta','completa'],'auto'),columnas:allowed(Number(raw.columnas),[2,3,4],3),medio:allowed(raw.medio,Object.keys(COVER_MEDIA),'foto'),videoActivo:raw.videoActivo!==false,modulos:{...raw.modulos,facts:true,projectDetails:true,gallery:true,masterplan:true,partners:true},lotes:raw.lotes&&typeof raw.lotes==='object'&&!Array.isArray(raw.lotes)?raw.lotes:{}};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null||v===''?'No informado':Number(v).toLocaleString('es-AR');
const price=v=>v==null||v===''?'Precio a consultar':'USD '+num(v);
const lotField=l=>[lotTitle(l),l.tipo_lote].filter(Boolean).join(' / ');
const lotNumber=v=>String(v??'').replace(/^lote\s+/i,'');
export function miniwebZones(catalog=[],lots=[]){
 const zones=new Map();
 for(const z of Array.isArray(catalog)?catalog:[]){if(typeof z?.nombre!=='string'||!z.nombre.trim()||zones.has(z.nombre))continue;zones.set(z.nombre,{nombre:z.nombre,color:/^#[0-9a-f]{6}$/i.test(z.color||'')?z.color:null,count:0})}
 for(const l of lots){const name=l.tipo_lote||'Sin sector';if(!zones.has(name))zones.set(name,{nombre:name,color:null,count:0});zones.get(name).count++}
 return [...zones.values()];
}
function zoneInk(color){if(!color)return '#fff';const c=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]>.179?'#101718':'#fff'}
const stateLabel=s=>Object.hasOwn(estados,s)?estados[s]:estados.sin;
const serviceLabels={agua_corriente:'Agua corriente',luz_electrica:'Electricidad',gas_natural:'Gas natural',cloaca:'Red cloacal',wifi:'Wi-Fi',porteria:'Portería',sum:'Salón de usos múltiples',parrillas:'Parrillas',senderos:'Senderos',muelle:'Acceso al agua',playa:'Playa',cancha:'Cancha',piscina:'Piscina',vigilancia:'Vigilancia',calles_ripio:'Calles internas',calles_asfalto:'Calles asfaltadas'};
const fonts='https://use.typekit.net/pfz4xlh.css';
export const demoLots=Array.from({length:8},(_,i)=>({id:'demo-'+(i+1),numero:String(i+1),superficie_m2:[920,1080,890,1250,800,1050,1170,1320][i],precio_usd:[38000,44000,41000,56000,39000,47000,52000,59000][i],tipo_lote:i<3||i===4?'Bosque':'Mirador',estado:i===4?'vendido':[2,6].includes(i)?'reservado':'disponible',mapa_x:[28,43,57,72,29,44,59,73][i],mapa_y:i<4?38:65}));
export const demoProject={nombre:'Naciente Patagonia',tagline:'El paisaje, el espacio y un lugar propio.',ciudad:'Patagonia',provincia:'Argentina',descripcion:'Un desarrollo residencial organizado en dos sectores: Bosque y Mirador. La propuesta reúne lotes de distintas superficies, espacios abiertos y recorridos internos.\n\nEsta presentación permite conocer el proyecto antes de elegir un lote: su entorno, los servicios informados y las características de cada sector.',hectareas_total:12,cantidad_lotes:8,sup_min_m2:800,sup_max_m2:1320,precio_desde:38000,acceso_desc:'Acceso por camino de ripio. Aquí se presenta el recorrido y la distancia desde los puntos de referencia del proyecto.',servicios:['luz_electrica','calles_ripio','senderos'],zonificacion:'Residencial — dato ilustrativo',cronograma:'Etapa de presentación — ejemplo visual',financiacion:'Las condiciones se completan para cada desarrollo.',foto_portada:'/assets/DESEMBOQUE-24.webp',fotos:['/assets/DESEMBOQUE-23.webp','/assets/DESEMBOQUE-20.jpg'],video_url:'/assets/hero-loop.mp4',mapa_imagen_url:'/assets/DJI_0272-Pano%20(1).webp',masterplan_url:'/assets/plano-buena-vista.webp',tema:JSON.stringify({miniweb:{estilo:'inmersivo'}})};

// A mounted page is revealed only after its own presentation is ready.
function stylesheetReady(link){
 if(link.sheet)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timeout);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);error?reject(error):resolve()};
  const loaded=()=>finish(),failed=()=>finish(new Error('No se pudo cargar la presentación de la miniweb.'));
  const timeout=setTimeout(failed,10000);
  link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});
 });
}
function boundedReady(promise,ms){
 return new Promise(resolve=>{const timer=setTimeout(resolve,ms);Promise.resolve(promise).then(()=>{clearTimeout(timer);resolve()},()=>{clearTimeout(timer);resolve()})});
}
function heroReady(hero,signal){
 if(hero.dataset.videoCover!=='pending'||matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
 return new Promise(resolve=>{
  const finish=()=>{clearTimeout(timer);observer.disconnect();signal.removeEventListener('abort',finish);resolve()};
  const observer=new MutationObserver(()=>{if(hero.dataset.videoCover!=='pending')finish()});
  const timer=setTimeout(finish,5000);
  observer.observe(hero,{attributes:true,attributeFilter:['data-video-cover']});signal.addEventListener('abort',finish,{once:true});
 });
}

// The three raster corners used by the tour correspond to top-left, top-right and bottom-left.
export function tourMapGeometry(scene,{lotIds}={}) {
 const linked=lotIds==null?null:new Set(lotIds);
 const lots=(scene?.features||[]).filter(f=>f.kind==='lot' && f.points?.length>=3 && (!linked||linked.has(f.id)));
 if(!lots.length)return null;
 const raster=safeUrl(scene.raster?.url);
 const corners=scene.raster?.corners;
 let base,projectPoint,width,height;
 if(raster && corners?.length===3){
  const [a,b,c]=corners,dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-a[0],ey=c[1]-a[1],det=dx*ey-dy*ex;
  if(Number.isFinite(det) && Math.abs(det)>1e-16){
   base=raster;
   projectPoint=([x,y])=>[843*((x-a[0])*ey-(y-a[1])*ex)/det,1500*(dx*(y-a[1])-dy*(x-a[0]))/det];
  }
 }
 let shapes=lots;
 if(!projectPoint){
  let plan;
  try{plan=proyectarParcelas(lots,[])}catch{return null}
  shapes=plan.shapes.map((shape,i)=>({...lots[i],...shape}));
  width=plan.w;height=plan.h;
  projectPoint=([x,y])=>[843*x/plan.w,1500*y/plan.h];
  base='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${plan.w}" height="${plan.h}"></svg>`);
 }
 const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
 const projected=new Map(shapes.map(feature=>{
  const points=feature.points.map(projectPoint);
  for(const [x,y] of points){
   bounds.left=Math.min(bounds.left,x/843);bounds.right=Math.max(bounds.right,x/843);
   bounds.top=Math.min(bounds.top,y/1500);bounds.bottom=Math.max(bounds.bottom,y/1500);
  }
  return [feature.id,{feature,points:points.map(pt=>pt.join(',')).join(' '),center:[0,1].map(i=>points.reduce((n,pt)=>n+pt[i],0)/points.length)}];
 }));
 return {base,hasPhoto:base===raster,shapes:projected,bounds,...(width?{width,height}:{})};
}

// The outer SVG occupies the viewport. Its inner image plane keeps the same
// scale on both real axes, even though stored SVG points use 843 × 1500 units.
export function vectorViewportLayout({width,height,imageWidth,imageHeight,bounds,padding=24}){
 if(![width,height,imageWidth,imageHeight].every(n=>Number.isFinite(n)&&n>0)||!bounds)return null;
 const factor=Math.min(width/imageWidth,height/imageHeight),w=imageWidth*factor,h=imageHeight*factor;
 const left=(width-w)/2,top=(height-h)/2,spanX=(bounds.right-bounds.left)*w,spanY=(bounds.bottom-bounds.top)*h;
 if(!(spanX>0&&spanY>0))return null;
 const gap=Math.min(padding,width*.08,height*.08),scale=Math.min((width-2*gap)/spanX,(height-2*gap)/spanY);
 return {width,height,image:{left,top,width:w,height:h},matrix:[w/843,0,0,h/1500,left,top],scale,
  panX:(width/2-left-(bounds.left+bounds.right)*w/2)*scale,
  panY:(height/2-top-(bounds.top+bounds.bottom)*h/2)*scale};
}
export function vectorInitialBounds(shapes,layout,{preferGroup=false}={}){
 const rows=[...shapes.values()],groups=new Map();
 const box=rows=>{const points=rows.flatMap(s=>s.points.trim().split(/\s+/).map(p=>p.split(',').map(Number)));return {left:Math.min(...points.map(p=>p[0]/843)),right:Math.max(...points.map(p=>p[0]/843)),top:Math.min(...points.map(p=>p[1]/1500)),bottom:Math.max(...points.map(p=>p[1]/1500))}};
 for(const shape of rows){const id=shape.feature.dxfGroup;if(id){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(shape)}}
 const main=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
 if(!main||main.length<3||main.length<=rows.length/2)return null;
 const tiny=main.some(shape=>{const b=box([shape]);return Math.min((b.right-b.left)*layout.image.width,(b.bottom-b.top)*layout.image.height)*layout.scale<18});
 return preferGroup||tiny?box(main):null;
}

// Raster registration stays unchanged. Only the initial camera targets linked
// lots whose polygons actually fall within this photo, never distant trial geometry.
export function vectorPhotoInitialBounds(shapes,layout){
 const inside=new Map([...shapes].filter(([,shape])=>shape.points.trim().split(/\s+/).map(p=>p.split(',').map(Number)).every(([x,y])=>x>=0&&x<=843&&y>=0&&y<=1500)));
 if(!inside.size)return null;
 const main=vectorInitialBounds(inside,layout,{preferGroup:true});if(main)return main;
 const points=[...inside.values()].flatMap(s=>s.points.trim().split(/\s+/).map(p=>p.split(',').map(Number)));
 return {left:Math.min(...points.map(p=>p[0]/843)),right:Math.max(...points.map(p=>p[0]/843)),top:Math.min(...points.map(p=>p[1]/1500)),bottom:Math.max(...points.map(p=>p[1]/1500))};
}

// This sheet belongs only to the active Estudio preview.
export function syncEstudioStylesheet(root,enabled){
 const current=root.querySelector('link[data-miniweb-estudio]');
 if(!enabled){current?.remove();return null}
 if(current)return current;
 const sheet=root.ownerDocument.createElement('link');sheet.rel='stylesheet';sheet.href='/css/miniweb-estudio.css?v=20261113-estudio9';sheet.dataset.miniwebEstudio='';root.append(sheet);return sheet;
}

async function miniwebLotMap(p,config,sourceLots,lots) {
 const configuredMap=safeUrl(p.mapa_imagen_url);
 const scene=config.recorrido?.escena;
 const originalPlan=isAlamosReferenceProject(p) && Object.values(config.lotes||{}).some(card=>card.recorrido?.plano?.id==='alamos');
 const activeVector=p.slug!=='aldea-los-huemules'&&!originalPlan&&scene?.planoActivo==='vectorial';
 const legacyPhoto='/assets/miniweb-alamos/mapa.webp';
 const legacyRaster=isReferencePreviewHost() && scene?.raster?.url && safeUrl(scene.raster.url)===new URL(legacyPhoto,location.origin).href;
 let sceneMap,parcelPlan,imageMap;
 if(originalPlan||legacyRaster){
  const {alamosPlan,alamosCenital}=await import('./recorrido-alamos-fichas.mjs?v=20261117-cierre-venta1');
  const raster=scene?.raster?.url&&!legacyRaster?scene.raster:alamosCenital;
  if(originalPlan){
   parcelPlan=await alamosPlan();
   const features=parcelPlan.parcels.map(parcel=>({...parcel,id:parcel.key,kind:'lot'}));
   sceneMap=tourMapGeometry({raster,features});
  }else sceneMap=tourMapGeometry({...scene,raster});
 }else if(scene?.imagePlan&&(p.slug==='aldea-los-huemules'||scene.planoActivo!=='vectorial')){
  const {imagePlanMap}=await import('./miniweb-image-plan.mjs?v=20261113-imageplan1');
  imageMap=imagePlanMap(scene.imagePlan,safeUrl);
  sceneMap=imageMap||tourMapGeometry(scene);
 }else sceneMap=tourMapGeometry(scene,activeVector?{lotIds:sourceLots.map(l=>config.lotes[l.id]?.elementoRecorrido).filter(Boolean)}:{});
 function shapeFor(lot){
  const card=config.lotes[lot.id];
  if(imageMap)return sceneMap.shapes.get(card?.elementoImagen);
  if(!originalPlan)return sceneMap?.shapes.get(card?.elementoRecorrido);
  const binding=card?.recorrido?.plano;
  return binding?.version===parcelPlan.version?sceneMap.shapes.get(binding.lote):null;
 }
 const positionedImage=!activeVector&&!!configuredMap && lots.some(l=>l.mapa_x!=null && l.mapa_y!=null && Number.isFinite(Number(l.mapa_x)) && Number.isFinite(Number(l.mapa_y)));
 const mapUrl=sceneMap?.base||(activeVector?'':configuredMap);
 const hasMapPhoto=sceneMap?sceneMap.hasPhoto:positionedImage;
 return {sceneMap,originalPlan,activeVector,shapeFor,mapUrl,hasMapPhoto,positionedImage};
}

function lotBrochureRequest(project,config,inventory,map,lotId) {
 const {activeVector,shapeFor,mapUrl,hasMapPhoto,sceneMap}=map;
 const rows=selectorRows(inventory,shapeFor,{allowPins:!activeVector});
 const selected=rows.find(row=>row.id===lotId && row.lot.estado==='disponible');
 if(!selected)return null;
 const serviceBlock=config.bloques.find(block=>block.tipo==='servicios' && block.activo!==false);
 const services=developmentServices(serviceBlock,project).map(value=>serviceLabels[value]||value);
 const plan={rows,stateRule:usesLotPlanKey(config),image:hasMapPhoto?mapUrl:'',width:sceneMap?.width,height:sceneMap?.height};
 return {lotId,services,plan,label:'Lote '+selected.label+(selected.block?' · Manzana '+selected.block:'')};
}

// El recorrido independiente obtiene los datos públicos al pedir la descarga.
export async function downloadPublicLotBrochure(slug,projectId,lotId) {
 const [{supabase,getRef},{leerInventarioCompleto},{projectSaleInventory},{createBrochureGenerator}]=await Promise.all([
  import('./config.js?v=20261118-miniweb'),import('./lotes-inventario.mjs?v=20261117-publico'),
  import('./zonas-venta.mjs?v=20261115-inventario'),import('./brochure-proyecto.mjs?v=20261123-compartido')
 ]);
 const fields='id,slug,nombre,tema,ciudad,provincia,descripcion,cantidad_lotes,sup_min_m2,sup_max_m2,servicios,financiacion,foto_portada,fotos,mapa_imagen_url,contacto_nombre,contacto_whatsapp,contacto_email';
 const {data:project,error}=await supabase.from('proyectos_publicos_v1').select(fields).eq('id',projectId).eq('slug',slug).eq('estado','activo').maybeSingle();
 if(error||!project)return false;
 const stored=parseTheme(project.tema).miniweb;
 if(!stored||stored.activa===false||stored.recorrido?.proyectoId!==projectId)return false;
 const block=stored.bloques?.find(b=>b.tipo==='panoramica360' && b.variante==='recorrido' && b.activo!==false);
 if(!block||block.opciones?.mostrarBrochure==='no')return false;
 const result=await leerInventarioCompleto(supabase,projectId,'id,numero,superficie_m2,precio_usd,estado,mapa_x,mapa_y');
 if(result.error)return false;
 const source=rotularLotesTerrazas(slug,result.data);
 const inventory=projectSaleInventory(project,source);
 if(!inventory.lots.some(lot=>lot.id===lotId && lot.estado==='disponible'))return false;
 const config=normalizeMiniweb(stored);
 const map=await miniwebLotMap(project,config,source,inventory.lots);
 const request=lotBrochureRequest(project,config,salesZoneInventory(config,source,project),map,lotId);
 if(!request)return false;
 return createBrochureGenerator(()=>({project:{...project,cantidad_lotes:inventory.total},config,lots:inventory.lots,gallery:project.fotos||[],reference:getRef()}))(request);
}

export async function mountMiniweb(host,{project:p,lots:input=[],compare=false,editing=false,uploadMedia,demo=false,onContact,onPdf,onConfigChange,visualEditor=false,soloSelector=false,publicPage=false,previewDevice='',config:override}={}){
 // Terrazas: los lotes se muestran con su número comercial; el identificador de cada lote no cambia.
 input=rotularLotesTerrazas(p?.slug,input);
 const lifecycle=new AbortController();const {signal}=lifecycle;
 const root=host.attachShadow({mode:'open'});const css=document.createElement('link');css.rel='stylesheet';css.href='/css/miniweb.css?miniweb=20261116-mapas';root.append(css);const designCSS=document.createElement('link');designCSS.rel='stylesheet';designCSS.href='/css/miniweb-design.css?v=20261116-foto-texto';root.append(designCSS);
 const relatoCSS=document.createElement('link');relatoCSS.rel='stylesheet';relatoCSS.href='/css/miniweb-relato.css';root.append(relatoCSS);
 let estudioSheet=null,estudioCSSReady=Promise.resolve();
 const syncEstudioCSS=()=>{const sheet=syncEstudioStylesheet(root,config.estilo==='estudio-vivo'&&p.slug!=='aldea-los-huemules');if(sheet!==estudioSheet){estudioSheet=sheet;estudioCSSReady=sheet?stylesheetReady(sheet):Promise.resolve();estudioCSSReady.catch(()=>{});}return estudioCSSReady};

 let fontCSS=document.querySelector('link[data-miniweb-fonts]');if(!fontCSS){fontCSS=document.createElement('link');fontCSS.rel='stylesheet';fontCSS.href=fonts;fontCSS.dataset.miniwebFonts='';document.head.append(fontCSS)}
 const app=document.createElement('div');app.className='miniweb'+(compare?' comparison':'');app.dataset.projectSlug=p.slug||'';app.innerHTML=markup;app.style.visibility='hidden';root.append(app);
 const selectorOnly=!editing&&(soloSelector||new URLSearchParams(location.search).get('solo')==='selector');
 if(selectorOnly)app.dataset.selectorOnly='true';
 let previewSizer;
 if(editing&&!visualEditor){
  app.dataset.editorDock='true';
  const canvas=document.createElement('div');canvas.className='editor-preview-canvas';canvas.setAttribute('aria-label','Vista previa completa de la miniweb');canvas.tabIndex=0;
  const main=app.querySelector('main');main.before(canvas);canvas.append(main);
  const fit=()=>{const width=window.innerWidth;const space=canvas.clientWidth-32;if(space<=0)return;main.style.width=width+'px';main.style.zoom=String(Math.min(1,space/width));};
  previewSizer=new ResizeObserver(fit);previewSizer.observe(canvas);window.addEventListener('resize',fit,{signal});fit();
 }

 const $=id=>root.getElementById(id),q=s=>app.querySelector(s),qa=s=>[...app.querySelectorAll(s)];
 const config=normalizeMiniweb(override||parseTheme(p.tema).miniweb);let blockComposition,designSync,approvedSelector,approvedHost;let style=config.estilo,selector='';let activeMapSource='';let zone='todas',status='todos',selected=null,scale=1,listOpen=false,media=config.medio,videoEnabled=config.videoActivo,timer;
 let mobilePeek=false;let search='',minArea='',maxArea='',maxPrice='',panX=0,panY=0,fitWidth=0,fitHeight=0,skipMapClick=false,contactLot=null;
 const lotNumbers=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
 const inventory=!editing && simulatedSales(p.slug) ? simulateLotStates(input) : input;
 const sourceLots=inventory.map(l=>({...l,id:String(l.id)})),unavailableLots=[],lots=[];
 function refreshSaleInventory(){const presented=salesZoneInventory(config,sourceLots,p);unavailableLots.splice(0,unavailableLots.length,...presented.filter(l=>l.estado==='no_a_la_venta'));lots.splice(0,lots.length,...presented.filter(l=>l.estado!=='no_a_la_venta').sort((a,b)=>lotNumbers.compare(a.numero,b.numero)));}
 refreshSaleInventory();
 const requestedLot = !editing && !compare ? new URLSearchParams(location.search).get('lote') : null;
 const linkedLot = findPublicLot(config,lots,requestedLot);
 const consultLink = location.hash==='#consulta-lote';
 const returningLot = consultLink && hideLotInquiry(p.slug,linkedLot) ? null : linkedLot;
 const initialId = config.bloques.find(b=>b.tipo==='explorador')?.opciones.loteInicial;
 if (requestedLot!==null) selected=returningLot?.id??null;
 else selected=lots.find(l=>l.id===initialId)?.id??lots[0]?.id??null;
 let chosenLotId=returningLot?.id??null;
 const contactSelection=lot=>{
  if(hideLotInquiry(p.slug,lot))return null;
  if(lot?.id!==chosenLotId)return null;
  return lot;
 };
 const tourLinkFor = lot => {
  const href = projectTourUrl(p,config,lot.id);
  return href ? `<a class="lot-tour-link" href="${esc(href)}">Ver en el recorrido 360°</a>` : '';
 };
 const colorMap = () => config.bloques.find(b=>b.tipo==='explorador')?.opciones.colorearDisponibilidad !== 'no';
 function availabilityStyle(lot) {
  if (!colorMap() || !Object.hasOwn(estados,lot.estado) || lot.estado==='sin') return '';
  const style = projectAvailability(config);
  const color = availabilityColor(style,lot.estado);
  const opacity = Number.isFinite(style?.opacity) ? Math.max(0,Math.min(90,style.opacity))/100 : .35;
  return `--availability-color:${color};--availability-opacity:${opacity}`;
 }
 const photo=safeUrl(p.foto_portada),photos=(p.fotos||[]).map(safeUrl).filter(Boolean);const videoUrl=safeUrl(p.video_url),planUrl=safeUrl(p.masterplan_url);
 const scene=config.recorrido?.escena;
 const lotMap=await miniwebLotMap(p,config,sourceLots,lots);
 const {originalPlan,activeVector,sceneMap,shapeFor,mapUrl,positionedImage,hasMapPhoto}=lotMap;
 if(activeVector)app.dataset.activePlan='vectorial';
 const isParcelPlan=!!sceneMap;
 const mobileParcelMap=()=>isParcelPlan && matchMedia('(max-width:700px)').matches;
 let parcelFitScale=1;
 const zoomLimit=()=>activeVector?Math.max(32,parcelFitScale*16):Math.max(mobileParcelMap()?8:4,parcelFitScale*2);
 function downloadLotBrochure(lotId) {
  if(!onPdf)return false;
  const request=lotBrochureRequest(p,config,[...lots,...unavailableLots],lotMap,lotId);
  return request ? onPdf(request) : false;
 }
 const linkedPlan=isParcelPlan && [...lots,...unavailableLots].some(shapeFor);
 const hasMap=isParcelPlan?linkedPlan:positionedImage;
 const parcelKey={lines:new Map(),fills:new Map()};
 function drawParcels(visible){
  parcelKey.lines.clear();
  parcelKey.fills.clear();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.classList.add('lot-parcels');svg.setAttribute('viewBox','0 0 843 1500');
  svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','Parcelas del proyecto');
  const plot=activeVector?document.createElementNS(ns,'g'):svg;
  if(activeVector){plot.dataset.vectorWorld='';svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.append(plot)}
  const style={...projectAvailability(config)};
  if(originalPlan&&!style.mode)style.mode='etapa';
  const fill=config.bloques.find(b=>b.tipo==='explorador')?.opciones.rellenoCenital||'suave';
  if(fill==='suave')style.opacity=Math.min(style.opacity??20,20);
  if(fill==='lineas')style.opacity=0;
  const showStatus=colorMap();
  for(const lot of [...visible,...unavailableLots]){
   const shape=shapeFor(lot);
   if(!shape)continue;
   const polygon=document.createElementNS(ns,'polygon'),title=document.createElementNS(ns,'title');
   const unavailable=lot.estado==='no_a_la_venta';
   polygon.dataset.parcel='';if(!unavailable)polygon.dataset.lot=lot.id;
   polygon.setAttribute('points',shape.points);polygon.setAttribute('tabindex','0');polygon.setAttribute('role','button');
   if(unavailable){polygon.setAttribute('tabindex','-1');polygon.setAttribute('role','img');polygon.setAttribute('aria-disabled','true')}
   const state=stateLabel(lot.estado);
   polygon.setAttribute('aria-label',lot.numero+', '+state);polygon.setAttribute('aria-pressed',String(lot.id===selected));
   const mark=paintLot(polygon,shape.feature,showStatus||unavailable?lot:{},style);
   if(activeVector&&!hasMapPhoto&&mark.state==='sin'&&!lotSalesZone(config,lot.id)){
    for(const [key,value]of Object.entries({'--lot-line':'#243b30','--lot-line-opacity':'1','--lot-width':'2px','--lot-focus-width':'3px','--lot-fill':'#dce5df','--lot-opacity':'.18'}))polygon.style.setProperty(key,value);
   }
   parcelKey.lines.set(mark.lineLabel,mark.line);
   if(showStatus && mark.showsFill)parcelKey.fills.set(mark.state,mark.fill);
   title.textContent=[lot.numero,lot.superficie_m2!=null?num(lot.superficie_m2)+' m²':'',state,shape.feature.stage?'Etapa '+shape.feature.stage:''].filter(Boolean).join(' · ');
   paintSalesZone(polygon,config,lot,p,plot);
   polygon.append(title);plot.append(polygon);

  }
  buildSalesZoneLayers(plot,config,[...visible,...unavailableLots].flatMap(lot=>{const shape=shapeFor(lot);return shape?[{id:lot.id,lot,unavailable:lot.estado==='no_a_la_venta',points:shape.points.trim().split(/\s+/).map(pair=>pair.split(',').map(Number)).map(([x,y])=>[x/843,y/1500])}]:[];}),{height:1500,project:p});
  $('mapPins').replaceChildren(svg);
  if(activeVector)fitMap();
 }
 const localName=p.nombre||'Proyecto';
 qa('.style-choices').forEach(el=>{el.innerHTML=DESIGN_STYLES.map(s=>`<button data-style-choice="${s.id}" aria-pressed="false">${s.name}</button>`).join('')});
 q('.preview-caption').innerHTML='<b>Miniweb</b><span>Vista previa del proyecto</span>';
 q('.identity-name').textContent=localName;q('.identity').setAttribute('aria-label',localName+', inicio');q('.hero h1').textContent=localName;q('.hero-tagline').textContent=p.tagline||'';q('.place').textContent=[p.ciudad,p.provincia?.replaceAll('_',' ')].filter(Boolean).join(', ')||'Ubicación no informada';q('.hero-media img').src=photo||'';q('.hero-media img').hidden=!photo;q('.hero-media img').alt=demo?'Paisaje de referencia del banco de Sur Patagonian':localName;q('.hero-caption').textContent=demo?'Contenido ilustrativo. Imágenes de referencia; no representan los lotes.':'';
 $('playHero').hidden=!videoUrl;
 $('facts').innerHTML=[[p.precio_desde!=null?'Lotes desde':'Lotes cargados desde',price(p.precio_desde??(lots.some(l=>l.precio_usd!=null)?Math.min(...lots.filter(l=>l.precio_usd!=null).map(l=>Number(l.precio_usd))):null))],['Superficies',p.sup_min_m2?num(p.sup_min_m2)+' m²'+(p.sup_max_m2?' a '+num(p.sup_max_m2)+' m²':''):'No informadas'],['Superficie del desarrollo',p.hectareas_total?num(p.hectareas_total)+' ha':'No informada'],[p.cantidad_lotes!=null?'Total de lotes declarado':'Lotes cargados',num(p.cantidad_lotes??lots.length)]].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
 $('proyecto').innerHTML=`<h2>${esc(p.tagline||'Conozca el proyecto')}</h2><div><p>${esc(p.descripcion||'Descripción del proyecto no informada.')}</p><div class="intro-links"><a class="text-link" href="#lotes">Explorar los lotes</a><a class="text-link" href="#projectDetails">Servicios y características</a></div></div>${photos[0]?`<img class="project-photo" src="${esc(photos[0])}" alt="${esc(demo?'Foto de referencia':localName)}" loading="lazy">`:''}`;
 const tourRoute = !demo && projectTourUrl(p,config);
 if(tourRoute){
  const url=new URL(tourRoute,location.origin);
  url.searchParams.set('v','20261118-miniweb');
  const link=document.createElement('a');
  link.className='text-link';
  link.href=url.pathname+url.search;
  link.textContent='Recorrer el loteo en 360°';
  $('proyecto').querySelector('.intro-links')?.append(link);
 }
 const details=document.createElement('section');details.id='projectDetails';details.className='project-details shell';details.innerHTML=`<div class="detail-grid"><div class="detail-cell"><h3>Ubicación y acceso</h3><p>${esc([p.descripcion_ubicacion,[p.ciudad,p.provincia?.replaceAll('_',' ')].filter(Boolean).join(', '),p.acceso_desc,p.distancia_km!=null?'Distancia informada: '+num(p.distancia_km)+' km':''].filter(Boolean).join('\n')||'No informado')}</p></div><div class="detail-cell"><h3>Servicios e infraestructura</h3><div class="services">${(p.servicios||[]).map(s=>`<span class="service">${esc(serviceLabels[s]||s)}</span>`).join('')||'<p>No informados</p>'}</div></div><div class="detail-cell"><h3>Características del desarrollo</h3><dl>${[['Zonificación',p.zonificacion],['Ocupación del suelo (FOS)',p.fos],['Altura máxima',p.altura_max!=null?num(p.altura_max)+' m':null],['Reglamento',p.reglamento_obs]].filter(x=>x[1]!=null&&x[1]!=='').map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')||'<dd>No informadas</dd>'}</dl></div><div class="detail-cell"><h3>Etapa y condiciones</h3><p>${esc([p.cronograma,p.fecha_entrega?'Entrega informada: '+p.fecha_entrega:'',p.financiacion,p.condiciones_venta].filter(Boolean).join('\n')||'No informadas')}</p></div></div>`;$('proyecto').parentElement.after(details);
 const explorer=document.createElement('div');explorer.className='explorer';const layout=q('.lot-layout'),results=document.createElement('div');results.className='results';layout.before(explorer);explorer.append(layout,results);results.append(q('.list-summary'),$('lotList'));
 const cards=document.createElement('div');cards.className='lot-cards';results.append(cards);const sector=document.createElement('div');sector.className='sector-banner';q('.lot-filters').after(sector);
 const views=document.createElement('div');views.className='selector-tabs';views.setAttribute('aria-label','Cómo explorar los lotes');views.innerHTML='<label>Ver como<select id="displayChoice" aria-label="Ver como"><option value="auto">Vista del estilo</option><option value="plano">Plano / mapa</option><option value="tarjetas">Fotos de los lotes</option><option value="lista">Comparación en lista</option></select></label>';q('.lot-filters').append(views);
 q('.mobile-views').innerHTML='<button data-mobile-view="mapa" aria-pressed="true">Mapa</button><button data-mobile-view="listado" aria-pressed="false">Listado</button>';
 const zoneCatalog=miniwebZones(p.mapa_zonas,lots),zones=zoneCatalog.map(z=>z.nombre),zoneByName=new Map(zoneCatalog.map(z=>[z.nombre,z]));
 q('.zones').innerHTML=[`<button data-zone="todas" aria-pressed="true">Todos los sectores</button>`,...zoneCatalog.filter(z=>z.count).map(z=>`<button data-zone="${esc(z.nombre)}" aria-pressed="false" ${z.count?'':'disabled'}><i class="zone-dot" style="--zone:${z.color||'#777'}"></i>${esc(z.nombre)}<span>${z.count}</span></button>`)].join('');
 const searchFilters=document.createElement('div');searchFilters.className='explorer-filters';searchFilters.innerHTML='<label>Número de lote<input id="lotSearch" type="search" placeholder="Buscar lote" autocomplete="off"></label><label>Superficie mínima<input id="areaMin" type="number" min="0" placeholder="m²" inputmode="numeric"></label><label>Superficie máxima<input id="areaMax" type="number" min="0" placeholder="m²" inputmode="numeric"></label><label>Precio máximo<input id="priceMax" type="number" min="0" placeholder="USD" inputmode="numeric"></label><button id="clearLotFilters" hidden>Limpiar filtros</button>';const filterPanel=document.createElement('details');filterPanel.className='advanced-lot-filters';filterPanel.open=!matchMedia('(max-width:700px)').matches;filterPanel.innerHTML='<summary id="lotFilterSummary">Filtros</summary>';filterPanel.append(searchFilters);q('.lot-filters').after(filterPanel);
 const key=document.createElement('details');key.className='map-key';key.open=true;key.innerHTML='<summary>Leyenda del mapa</summary><div class="key-zones"><span>Sectores</span>'+zoneCatalog.filter(z=>z.count).map(z=>`<button data-zone="${esc(z.nombre)}" ${z.count?'':'disabled'}><i class="zone-dot" style="--zone:${z.color||'#777'}"></i>${esc(z.nombre)} <small>${z.count}</small></button>`).join('')+'</div><div class="key-states"><span>Disponibilidad informada</span>'+['disponible','proximamente','reservado','vendido'].map(s=>`<button data-map-state="${s}"><i class="state-key ${s}" aria-hidden="true">${s==='proximamente'?'P':s==='reservado'?'R':s==='vendido'?'V':''}</i>${stateLabel(s)} <small>${lots.filter(l=>l.estado===s).length}</small></button>`).join('')+'</div>';q('.map-legend').replaceWith(key);
 $('mapStage').tabIndex=0;$('mapStage').setAttribute('aria-label','Mapa de lotes. Use los botones para ampliar y las flechas para desplazar.');
 const mapTools=document.createElement('div');mapTools.className='map-view-tools';mapTools.innerHTML='<button id="mapFit">Ver mapa completo</button><button id="mapFill">Llenar vista</button><button id="mapTouch" aria-pressed="false">Mover mapa</button>';q('.map-toolbar').after(mapTools);const quickLot=document.createElement('aside');quickLot.id='mobileLotSummary';quickLot.className='mobile-lot-summary';quickLot.hidden=true;quickLot.setAttribute('aria-label','Ficha rápida del lote');$('mapStage').append(quickLot);const syncQuickVisibility=()=>{const bounds=$('mapStage').getBoundingClientRect();quickLot.hidden=!mobilePeek||!selected||bounds.bottom<=120||bounds.top>=innerHeight-80};window.addEventListener('scroll',syncQuickVisibility,{passive:true,signal});window.addEventListener('resize',syncQuickVisibility,{signal});for(const id of ['mapFit','mapFill']){const b=$(id);b.setAttribute('aria-label',b.textContent);b.title=b.textContent;b.innerHTML='<span aria-hidden="true">'+(id==='mapFit'?'⊡':'⛶')+'</span><span class="map-tool-label">'+b.textContent+'</span>';}
 const unavailableKey=document.createElement('small');unavailableKey.className='unavailable-key';unavailableKey.textContent='No a la venta';unavailableKey.hidden=!unavailableLots.length;key.append(unavailableKey);
 const note=document.createElement('p');note.className='selector-note'+(demo?' demo-note':'');explorer.before(note);
 $('masterplan').hidden=!planUrl||p.plano_activo===false;const planButton=$('masterplan').querySelector('[data-image]');planButton.dataset.image=planUrl;planButton.dataset.imageTitle='Plano de '+localName;planButton.querySelector('img').src=planUrl||'';planButton.querySelector('img').alt='Plano de '+localName;$('masterplan').querySelector('p').textContent=demo?'Plano de referencia del banco. El plano interactivo de la demostración es esquemático.':'';
 $('gallery').hidden=!photos.length;$('gallery').querySelector('.gallery-grid').innerHTML=photos.map(url=>`<button data-image="${esc(url)}" data-image-title="${esc(demo?'Foto de referencia':localName)}"><img src="${esc(url)}" alt="${esc(demo?'Foto de referencia':localName)}" loading="lazy"></button>`).join('');
 q('.location').innerHTML=`<strong>${esc([p.ciudad,p.provincia?.replaceAll('_',' ')].filter(Boolean).join(', ')||'Ubicación no informada')}</strong><p>${esc(p.descripcion_ubicacion||p.acceso_desc||'')}</p>`;
 if(Number.isFinite(Number(p.latitud))&&Number.isFinite(Number(p.longitud))&&p.latitud!=null&&p.longitud!=null&&location.hostname!=='staging.surpatagonian.com'){const frame=document.createElement('iframe');frame.className='location-map';frame.loading='lazy';frame.title='Ubicación del proyecto';frame.src=`https://maps.google.com/maps?q=${Number(p.latitud)},${Number(p.longitud)}&hl=es&z=14&output=embed`;q('.location').append(frame)}
 q('.partners-slots').innerHTML=(p.representantes||[]).map(r=>`<span class="partner-slot">${safeUrl(r.logo_url)?`<img src="${esc(safeUrl(r.logo_url))}" alt="${esc(r.nombre||'Representante')}" loading="lazy">`:''}${esc(r.nombre||r.empresa||'Representante')}${r.ciudad||r.zona?'<br>'+esc(r.ciudad||r.zona):''}</span>`).join('');$('partners').hidden=p.rep_activo===false;q('footer').innerHTML=`<span>${esc(localName)}${demo?'. Desarrollo de demostración.':''}</span><a href="/">Sur Patagonian</a>`;
 const sheet=document.createElement('dialog');sheet.className='dialog lot-sheet';sheet.setAttribute('aria-labelledby','sheetTitle');sheet.innerHTML='<header><h2 id="sheetTitle">Ficha del lote</h2><button class="close" data-close aria-label="Cerrar ficha">×</button></header><div class="lot-sheet-body"></div>';app.append(sheet);
 const tour=document.createElement('dialog');tour.className='dialog image-dialog';tour.innerHTML='<header><h2>Vista 360 del lote</h2><button class="close" data-close aria-label="Cerrar vista 360">×</button></header><div class="tour-content"></div>';app.append(tour);tour.addEventListener('close',()=>tour.querySelector('.tour-content').replaceChildren());
 const settingsExtra=document.createElement('div');settingsExtra.innerHTML=`<h3 class="settings-group">Composición</h3>${[['selectorChoice','Explorador de lotes',[['auto','Del estilo'],['inmersivo','Mapa con ficha flotante'],['lista','Lista comparativa'],['plano','Plano y ficha técnica'],['sectores','Por sectores'],['tarjetas','Tarjetas fotográficas']]],['sheetChoice','Apertura de ficha',[['auto','Del estilo'],['lateral','En la página'],['modal','Ventana ampliada']]],['introChoice','Presentación del proyecto',[['auto','Del estilo'],['apilada','Texto en una columna'],['foto','Foto y texto al lado']]],['densityChoice','Espaciado',[['normal','Normal'],['compacto','Compacto'],['amplio','Amplio']]],['alignChoice','Texto de portada',[['izquierda','A la izquierda'],['centro','Centrado']]],['heightChoice','Altura de portada',[['auto','Del estilo'],['compacta','Compacta'],['completa','Pantalla completa']]],['columnsChoice','Columnas de tarjetas',[['2','Dos'],['3','Tres'],['4','Cuatro']]]].map(([id,label,options])=>`<label class="setting">${label}<select id="${id}">${options.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label>`).join('')}<label class="setting">Información del loteo<input type="checkbox" data-section="projectDetails" checked></label>`;$('previewSettings').querySelector('.settings-subtitle').after(settingsExtra);
 q('.settings-note').textContent=demo?'Demostración local con datos ficticios. Las fotos son referencias del proyecto, no imágenes reales de cada lote. El 360 aparece sólo si hay un enlace configurado. Los ajustes se mantienen mientras navega, no se guardan.':'Vista de comparación. Los cambios se mantienen sólo en memoria y no se guardan en el proyecto.';
 const notify=t=>{$('toast').textContent=t;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4500)};
 const manzanaByLot=new Map(lots.map(l=>{
  const block=shapeFor(l)?.feature.block||l.manzana||lotFacts(l).find(([label])=>label==='Manzana')?.[1];
  return [l.id,String(block??'').trim()];
 }));
 const manzanaSelect=document.createElement('select');
 manzanaSelect.add(new Option('Todas las manzanas',''));
 for(const block of [...new Set(manzanaByLot.values())].filter(Boolean).sort(lotNumbers.compare)){
  manzanaSelect.add(new Option('Manzana '+block,block));
 }
 manzanaSelect.setAttribute('aria-label','Manzana');
 manzanaSelect.onchange=()=>{paint();q('.lote-list').scrollTop=0;};
 let salesZoneFilter='';
 const otherFilters=()=>lots.filter(l=>(!salesZoneFilter||lotSalesZone(config,l.id)?.id===salesZoneFilter)&&(!manzanaSelect.value||manzanaByLot.get(l.id)===manzanaSelect.value)&&(zone==='todas'||(l.tipo_lote||'Sin sector')===zone)&&(!search||lotNumber(l.numero).toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&(!minArea||l.superficie_m2!=null&&Number(l.superficie_m2)>=Number(minArea))&&(!maxArea||l.superficie_m2!=null&&Number(l.superficie_m2)<=Number(maxArea))&&(!maxPrice||l.precio_usd!=null&&Number(l.precio_usd)<=Number(maxPrice)));
 const stateOf=lot=>['disponible','reservado','vendido','proximamente'].includes(lot.estado)?lot.estado:'sin-informacion';
 const stateSelect=$('stateFilter');
 const stateOptions=[...stateSelect.options].map(o=>[o.value,o.text]);
 stateOptions.push(['sin-informacion',estados.sin]);
 function filtered(){
  const candidates=otherFilters(),states=new Set(candidates.map(stateOf));
  if(status!=='todos'&&!states.has(status))status='todos';
  const available=stateOptions.filter(([value])=>value==='todos'||states.has(value));
  if([...stateSelect.options].map(o=>o.value).join('|')!==available.map(([value])=>value).join('|')){
   stateSelect.replaceChildren(...available.map(([value,label])=>new Option(label,value)));
  }
  stateSelect.value=status;
  key.querySelectorAll('[data-map-state]').forEach(button=>button.hidden=!states.has(button.dataset.mapState));
  key.querySelector('.key-states').hidden=![...states].some(s=>s!=='sin-informacion');
  if(p.slug!=='aldea-los-huemules'&&salesZones(config).zonas.length){
   const counts=lotCounts(candidates);
   for(const badge of key.querySelectorAll('[data-map-state]')){badge.hidden=false;badge.querySelector('small').textContent=counts.states[badge.dataset.mapState]||0;}
   key.querySelector('.key-states').hidden=false;
  }
  return status==='todos'?candidates:candidates.filter(lot=>stateOf(lot)===status);
 }
 function lotCardSummary(lot){
  const area=lot.superficie_m2==null||lot.superficie_m2===''?'':num(lot.superficie_m2)+' m²';
  return [...new Set([area,lotSalesZone(config,lot.id)?.nombre,lot.tipo_lote].filter(Boolean))].join(' · ');
 }
 function lotMedia(l){const saved=config.lotes[l.id]||{};return {fotos:(Array.isArray(saved.fotos)?saved.fotos:[]).slice(0,20).map(safeUrl).filter(Boolean),tour360:safeUrl(saved.tour360)}}
 function cardPhoto(l){return lotMedia(l).fotos[0]||(demo?photos[Number(l.numero)%photos.length]:null)}
 function lotDetail(l){const m=lotMedia(l),image=cardPhoto(l);return `<div class="lot-aside-top"><span>Su selección</span><span class="lot-status"><i class="status-dot ${esc(l.estado)}"></i>${esc(stateLabel(l.estado))}</span></div><h3>${esc(lotTitle(l))}</h3>${image?`<img class="lot-photo" src="${esc(image)}" alt="${esc(demo&&!m.fotos.length?'Foto de referencia, no corresponde al lote':'Foto del lote '+l.numero)}" loading="lazy">`:''}<dl class="lot-specs">${lotFacts(l).map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join('')}${l.frente_agua?'<div><dt>Frente al agua</dt><dd>Sí</dd></div>':''}</dl>${l.notas?`<p class="lot-hint">${esc(l.notas)}</p>`:''}<div class="lot-media-actions">${tourLinkFor(l)}<button data-expand="${esc(l.id)}">${m.fotos.length?'Ver ficha y fotos':'Ver ficha'}</button>${mediaList(config,l.id).some(item=>item.tipo==='panorama')?`<button type="button" data-lot-panos="${esc(l.id)}">Ver panorámicas del lote</button>`:''}${m.tour360?`<button data-tour="${esc(l.id)}">Vista 360</button>`:''}</div>${hideLotInquiry(p.slug,l)?'':`<button class="btn primary" data-consult data-consult-lot="${esc(l.id)}">${l.avisoZonaProximamente?'Avisarme cuando salga a la venta':l.estado==='disponible'?'Consultar este lote':'Consultar alternativas'}</button>`}`}
 function showSheet(id){
  const lot=lots.find(x=>x.id===id);if(!lot)return;
  if(selected!==lot.id||chosenLotId!==lot.id){chosenLotId=selected=lot.id;paint()}
  const media=lotMedia(lot),files=mediaList(config,id);
  const images=[...new Set([...files.filter(f=>f.tipo==='foto').map(f=>f.url),...media.fotos])];
  sheet.querySelector('h2').textContent=lotTitle(lot);
  const photo=images[0],body=sheet.querySelector('.lot-sheet-body');
  const photoList=images.length>1?`<div class="photo-strip">${images.map((url,i)=>`<button type="button" data-sheet-photo="${esc(url)}" aria-label="Foto ${i+1}"><img src="${esc(url)}" alt=""></button>`).join('')}</div>`:'';
  const facts=lotFacts(lot);
  if(lot.frente_agua)facts.push(['Frente al agua','Sí']);
  const status=stateLabel(lot.estado);
  body.innerHTML=`${photo?`<img class="sheet-photo" src="${esc(photo)}" alt="Foto de ${esc(lotTitle(lot))}">${photoList}`:''}
   <p class="sheet-status"><i style="background:${availabilityColor(projectAvailability(config),lot.estado)}"></i>${esc(status)}</p>
   <dl>${facts.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
   ${lot.notas?`<p>${esc(lot.notas)}</p>`:''}
   <div class="sheet-actions">${tourLinkFor(lot)}${files.some(f=>f.tipo==='panorama')?`<button type="button" data-lot-panos="${esc(id)}">Panorámicas del lote</button>`:''}${media.tour360?`<button type="button" data-tour="${esc(id)}">Vista 360° del lote</button>`:''}${hideLotInquiry(p.slug,lot)?'':`<button type="button" data-consult data-consult-lot="${esc(id)}">${lot.avisoZonaProximamente?'Avisarme cuando salga a la venta':'Consultar este lote'}</button>`}</div>`;
  if(!sheet.open)sheet.showModal();
 }

 function mapTransform(){
  const stage=$('mapStage'),canvas=$('mapCanvas');
  if(!automaticFrame){
   const limitX=Math.max(0,(fitWidth*scale-stage.clientWidth)/2);
   const limitY=Math.max(0,(fitHeight*scale-stage.clientHeight)/2);
   panX=Math.max(-limitX,Math.min(limitX,panX));
   panY=Math.max(-limitY,Math.min(limitY,panY));
  }
  if(activeVector&&vectorLayout){
   canvas.style.transform='none';
   const [sx,, ,sy,x,y]=vectorLayout.matrix,world=q('.lot-parcels [data-vector-world]');
   world?.setAttribute('transform',`matrix(${sx*scale} 0 0 ${sy*scale} ${fitWidth/2+panX+(x-fitWidth/2)*scale} ${fitHeight/2+panY+(y-fitHeight/2)*scale})`);
   const image=q('.map-canvas>img');if(image)image.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;
  }else canvas.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;
  syncMapRings(q(activeVector?'.lot-parcels [data-vector-world]':'.lot-parcels'));
  canvas.style.setProperty('--inverse-zoom',1/scale);
  $('zoomReset').textContent=scale.toFixed(1).replace('.0','')+'×';
  $('zoomOut').disabled=scale<=1;
  $('zoomIn').disabled=scale>=zoomLimit();
  updatePinDensity();
 }
 // Compact only overlapping labels; image coordinates are never altered.
 function updatePinDensity(){
  const pins=qa('#mapPins .map-pin');pins.forEach(pin=>pin.classList.remove('pin-compact'));
  const boxes=pins.map(pin=>pin.querySelector('.pin-body').getBoundingClientRect());
  const crowded=boxes.map((a,i)=>a.width>0&&boxes.some((b,j)=>i!==j&&a.left<b.right+8&&a.right+8>b.left&&a.top<b.bottom+8&&a.bottom+8>b.top));
  pins.forEach((pin,i)=>pin.classList.toggle('pin-compact',crowded[i]));
 }
 let parcelFraming=false, automaticFrame=false,vectorLayout=null,vectorInitial=true;
 const bounds=sceneMap?.bounds;
 const parcelWidth=bounds?bounds.right-bounds.left:0;
 const parcelHeight=bounds?bounds.bottom-bounds.top:0;
 const canFrameParcels=Number.isFinite(parcelWidth)&&Number.isFinite(parcelHeight)&&parcelWidth>0&&parcelHeight>0;
 function mapAspect(image){
  const photoRatio=image.naturalWidth/image.naturalHeight;
  const parcelRatio=photoRatio*parcelWidth/parcelHeight;
  const ratio=parcelFraming?Math.max(16/9,Math.min(3,parcelRatio)):photoRatio;
  app.dataset.mapOrientation=ratio<1?'vertical':'horizontal';
  app.style.setProperty('--map-ratio',String(ratio));
 }
 function fitMap(){
  const image=q('.map-canvas>img'),stage=$('mapStage'),canvas=$('mapCanvas');
  if(!image?.naturalWidth||!stage.clientWidth||!stage.clientHeight)return;
  const width=stage.clientWidth,height=stage.clientHeight;
  if(activeVector){
   vectorLayout=vectorViewportLayout({width,height,imageWidth:image.naturalWidth,imageHeight:image.naturalHeight,bounds});
   if(!vectorLayout)return;
   if(vectorInitial){const initial=vectorInitialBounds(sceneMap.shapes,vectorLayout);if(initial)vectorLayout=vectorViewportLayout({width,height,imageWidth:image.naturalWidth,imageHeight:image.naturalHeight,bounds:initial})}
   fitWidth=width;fitHeight=height;
   Object.assign(canvas.style,{width:width+'px',height:height+'px',left:'0px',top:'0px',right:'auto',bottom:'auto'});
   const svg=q('.lot-parcels'),world=svg?.querySelector('[data-vector-world]');
   if(world){svg.setAttribute('viewBox',`0 0 ${width} ${height}`);world.setAttribute('transform','matrix('+vectorLayout.matrix.join(' ')+')')}
   parcelFitScale=vectorLayout.scale;
   if(automaticFrame){scale=parcelFitScale;panX=vectorLayout.panX;panY=vectorLayout.panY}
   mapTransform();return;
  }
  const factor=Math.min(width/image.naturalWidth,height/image.naturalHeight);
  fitWidth=image.naturalWidth*factor;fitHeight=image.naturalHeight*factor;
  Object.assign(canvas.style,{width:fitWidth+'px',height:fitHeight+'px',left:(width-fitWidth)/2+'px',top:(height-fitHeight)/2+'px',right:'auto',bottom:'auto'});
  // The photograph and the SVG always share this one camera transform. The
  // full inventory determines its initial extent, also when a filter is active.
  parcelFitScale=parcelFraming?Math.min(width/(parcelWidth*fitWidth),height/(parcelHeight*fitHeight))*.95:1;
  if(automaticFrame){
   scale=parcelFitScale;
   panX=(.5-(bounds.left+bounds.right)/2)*fitWidth*scale;
   panY=(.5-(bounds.top+bounds.bottom)/2)*fitHeight*scale;
  }
  mapTransform();
 }
 const mapObserver=new ResizeObserver(fitMap);mapObserver.observe($('mapStage'));
 function setMap(){const img=q('.map-canvas>img'),src=mapUrl;img.loading='eager';activeMapSource=src;q('.map-label').textContent=activeVector&&!hasMapPhoto?'Plano de lotes':'Mapa interactivo';img.hidden=!src;
 const crop=canFrameParcels && (activeVector||config.bloques.find(b=>b.tipo==='explorador')?.opciones.encuadreCenital!=='completo');
 if(crop!==parcelFraming){
  parcelFraming=crop;automaticFrame=crop;scale=1;panX=panY=0;
 }
 if(src&&img.getAttribute('src')!==src){
  img.onload=()=>{mapAspect(img);fitMap()};
  img.src=src;
  img.alt='Mapa del proyecto '+localName;
 }
 if(img.naturalWidth)mapAspect(img);
 $('interactiveMap').hidden=!hasMap;
 q('.lot-layout').dataset.mapHidden=String(!hasMap);
 const plain=!hasMapPhoto || !activeVector&&config.bloques.find(b=>b.tipo==='explorador')?.opciones.fondoMapa==='plano';
 app.dataset.vectorPlan=String(plain);
 img.style.visibility=plain?'hidden':'';
 fitMap();
 note.textContent=demo?'Posiciones y lotes ilustrativos. Las fotos de las tarjetas son referencias del proyecto.':'';

 }
 function syncActivePlanInfo(){
  if(!activeVector||selectorEnabled(config,p,mapUrl))return;
  const vis=filtered(),drawn=vis.filter(shapeFor).length;
  $('lotCount').textContent=`${vis.length} de ${lots.length} lotes en lista · ${drawn} ubicados en este plano. No incluye lotes «No a la venta».`;
  const summary=q('.sale-filter-wrap>summary');if(summary)summary.textContent=`Filtrar · ${vis.length} de ${lots.length} lotes en lista`;
  const zones=q('.zones');if(salesZones(config).zonas.length&&zones){zones.classList.add('active-plan-zones');q('.section-heading')?.after(zones)}
  for(const button of qa('.lote-list .lot-summary-row')){
   button.querySelector('.active-plan-zone-tag')?.remove();const zone=lotSalesZone(config,button.dataset.lot);if(!zone)continue;
   const tag=document.createElement('small');tag.className='active-plan-zone-tag';tag.style.setProperty('--zone',publicSalesZoneColor(zone));tag.textContent=zone.nombre;button.append(tag);
  }
  note.textContent=vis.some(l=>!shapeFor(l))?'Los lotes sin dibujo en este plano se pueden consultar desde la lista.':'';
 }
 let legacyZoneCSS;
 function syncLegacySalesZoneCSS(){const wanted=p.slug!=='aldea-los-huemules'&&(salesZones(config).zonas.length>0||scene?.planoActivo==='vectorial'&&!hasMapPhoto)&&!selectorEnabled(config,p,mapUrl);if(wanted&&!legacyZoneCSS){legacyZoneCSS=document.createElement('link');legacyZoneCSS.rel='stylesheet';legacyZoneCSS.href='/css/miniweb-zonas.css?v=20261114-anillo7';root.append(legacyZoneCSS);}else if(!wanted&&legacyZoneCSS){legacyZoneCSS.remove();legacyZoneCSS=null;}}
 function paintLegacySalesZones(){
  const data=salesZones(config);if(p.slug==='aldea-los-huemules'||!data.zonas.length||selectorEnabled(config,p,mapUrl))return;
  const visible=data.zonas.filter(z=>z.estado!=='oculta');if(salesZoneFilter&&!visible.some(z=>z.id===salesZoneFilter))salesZoneFilter='';
  const chip=(id,text,color)=>`<button type="button" data-sales-zone="${esc(id)}" aria-pressed="${salesZoneFilter===id}">${color?`<i class="zone-dot" style="--zone:${color}"></i>`:''}${esc(text)}</button>`;
  const content=chip('','Todas')+visible.map(z=>chip(z.id,z.nombre+(z.estado==='a_la_venta'?'':' ('+SALES_ZONE_STATES[z.estado]+')'),publicSalesZoneColor(z))).join('');
  const zones=q('.zones');zones.innerHTML=content;const total=document.createElement('span');total.textContent=zoneCountText(lotCounts(lots));total.style.flexBasis='100%';zones.append(total);zones.style.setProperty('display','flex');key.querySelector('.key-zones').innerHTML='<span>'+esc(data.rotulo)+'</span>'+content;
  const mz=q('.manzana-control');if(mz)mz.hidden=true;
 }
 function paint(){paintLegacySalesZones();const vis=filtered();if(!vis.some(l=>l.id===selected))selected=requestedLot===null?(vis[0]?.id??null):null;setMap();
 app.dataset.availabilityMap=String(colorMap());

 const focusedParcel=root.activeElement?.closest('[data-parcel]')?.dataset.lot;
 if(selectorEnabled(config,p,mapUrl))$('mapPins').replaceChildren();
 else if(isParcelPlan)drawParcels(vis);
 else $('mapPins').innerHTML=vis.filter(l=>mapUrl&&activeMapSource===mapUrl&&l.mapa_x!=null&&l.mapa_y!=null&&Number.isFinite(Number(l.mapa_x))&&Number.isFinite(Number(l.mapa_y))&&Number(l.mapa_x)>=0&&Number(l.mapa_x)<=100&&Number(l.mapa_y)>=0&&Number(l.mapa_y)<=100).map(l=>{const z=zoneByName.get(l.tipo_lote||'Sin sector'),appearance=salesZoneAppearance(config,l,p),color=appearance?.byZone?appearance.color:z?.color||'#626b70',shape=['circulo','gotita','etiqueta'].includes(p.mapa_pin_estilo)?p.mapa_pin_estilo:'gotita';return `<button type="button" class="map-pin" data-shape="${shape}" data-lot="${esc(l.id)}" data-state="${esc(l.estado)}" style="${availabilityStyle(l)};left:${Number(l.mapa_x)}%;top:${Number(l.mapa_y)}%;--zone:${color};--zone-ink:${zoneInk(color)}" aria-label="${esc(lotTitle(l))}, ${esc(l.tipo_lote||'Sin sector')}, ${esc(stateLabel(l.estado))}" title="${esc(lotTitle(l))}: ${num(l.superficie_m2)} m²" aria-pressed="${selected===l.id}"><span class="pin-body">${esc(lotNumber(l.numero))}${['proximamente','reservado','vendido'].includes(l.estado)?`<small class="pin-state">${l.estado==='proximamente'?'P':l.estado==='reservado'?'R':'V'}</small>`:''}</span></button>`}).join('');
 if(!isParcelPlan&&!selectorEnabled(config,p,mapUrl))for(const l of unavailableLots){
  if(!mapUrl||l.mapa_x==null||l.mapa_y==null||!Number.isFinite(Number(l.mapa_x))||!Number.isFinite(Number(l.mapa_y)))continue;
  const pin=document.createElement('span');pin.className='map-pin unavailable-pin';pin.setAttribute('role','img');pin.setAttribute('aria-label','No a la venta');pin.style.left=Number(l.mapa_x)+'%';pin.style.top=Number(l.mapa_y)+'%';pin.innerHTML='<span class="pin-body">—</span>';$('mapPins').append(pin);
 }
 if(!hasMap)listOpen=true;
 if(focusedParcel) $('mapPins').querySelector('[data-lot="'+CSS.escape(focusedParcel)+'"]')?.focus({preventScroll:true});
 updatePinDensity();const l=lots.find(x=>x.id===selected);$('lotDetail').innerHTML=l?lotDetail(l):vis.length?'<p class="empty-filter">Elija un lote para ver su ficha.</p>':'<p class="empty-filter">No hay lotes con estos filtros.</p>';$('lotDetail').style.setProperty('--selected-zone',zoneByName.get(l?.tipo_lote||'Sin sector')?.color||'#777');syncQuickVisibility();quickLot.innerHTML=l?`<button class="peek-close" data-hide-peek aria-label="Ocultar ficha rápida">×</button><div><strong>${esc(lotTitle(l))}</strong><span>${esc(l.tipo_lote||'Sin sector')} / ${esc(stateLabel(l.estado))}</span></div><div><strong>${price(l.precio_usd)}</strong><span>${num(l.superficie_m2)} m²</span></div><button class="btn primary" data-expand="${esc(l.id)}">Ver ficha</button>`:'';$('lotFilterSummary').textContent='Filtros'+([search,minArea,maxArea,maxPrice].filter(Boolean).length?' ('+[search,minArea,maxArea,maxPrice].filter(Boolean).length+')':'');
 $('lotRows').innerHTML=vis.map(l=>`<tr aria-selected="${selected===l.id}"><td>${esc(lotTitle(l))}</td><td>${num(l.superficie_m2)}${l.superficie_m2!=null?' m²':''}</td><td>${esc(l.tipo_lote||'No informado')}</td><td>${price(l.precio_usd)}</td><td><span class="lot-status"><i class="status-dot ${esc(l.estado)}"></i>${esc(stateLabel(l.estado))}</span></td><td><button data-lot="${esc(l.id)}" aria-label="Seleccionar lote ${esc(lotNumber(l.numero))}">Seleccionar</button></td></tr>`).join('')||'<tr><td colspan="6">No hay lotes con estos filtros.</td></tr>';
 cards.innerHTML=vis.map((l,index)=>{const image=cardPhoto(l),specific=lotMedia(l).fotos.length,summary=lotCardSummary(l);return `<article class="lot-card" aria-current="${selected===l.id}"><button data-expand="${esc(l.id)}" aria-label="Abrir ficha del lote ${esc(lotNumber(l.numero))}"><figure>${image?`<img src="${esc(image)}" alt="${esc(specific?'Foto del lote '+l.numero:'Foto de referencia del proyecto')}" loading="${index<6?'eager':'lazy'}" width="800" height="450">`:''}${image&&!specific?'<small>Imagen de referencia del proyecto</small>':''}</figure><div class="lot-card-info"><h3>${esc(lotTitle(l))}</h3>${summary?`<p>${esc(summary)}</p>`:''}<strong>${price(l.precio_usd)}</strong><span class="lot-status"><i class="status-dot ${esc(l.estado)}"></i>${esc(stateLabel(l.estado))}</span></div></button></article>`}).join('')||'<p class="empty-filter">No hay lotes con estos filtros.</p>';
 $('lotCount').textContent=`${vis.length} de ${lots.length} lotes cargados`;$('lotList').hidden=!(selector==='lista'||listOpen||app.dataset.mobileView==='listado');$('clearLotFilters').hidden=!(salesZoneFilter||manzanaSelect.value||search||minArea||maxArea||maxPrice||zone!=='todas'||status!=='todos');qa('[data-map-state]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapState===status)));
 blockComposition?.syncSelection(contactSelection(l),vis);syncActivePlanInfo();approvedSelector?.update(config,chosenLotId);
 const sectorPhoto=photos[zone==='todas'?0:Math.max(0,zones.indexOf(zone))%Math.max(photos.length,1)]||photo;sector.innerHTML=`${sectorPhoto?`<img src="${esc(sectorPhoto)}" alt="Imagen del proyecto, no específica del sector" loading="eager" width="800" height="450">`:''}<div><h3>${esc(zone==='todas'?'Elija su sector':zone)}</h3><p>${zone==='todas'?'Explore las zonas del desarrollo y compare los lotes que pertenecen a cada una.':`${vis.length} lotes en este sector con los filtros seleccionados.`}</p>${sectorPhoto?'<p class="lot-hint">Imagen de referencia del proyecto</p>':''}</div>`;qa('[data-zone]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.zone===zone)));
 }
 function syncApprovedSelector(){
  const enabled=selectorEnabled(config,p,mapUrl),section=$('lotes');section.classList.toggle('selector-aprobado',enabled);
  const legacy=section.querySelector(':scope > .shell');let heading=section.querySelector(':scope > .interactive-section-heading');
  if(!enabled){heading?.remove();if(legacy?.dataset.approvedHidden){legacy.inert=false;legacy.removeAttribute('aria-hidden');delete legacy.dataset.approvedHidden}approvedSelector?.destroy();approvedSelector=null;approvedHost?.remove();approvedHost=null;return}
  if(!heading){heading=document.createElement('header');heading.className='interactive-section-heading';heading.innerHTML='<h2></h2><p></p>';section.prepend(heading)}
  applyInteractiveHeadingStyle(heading,app);const copy=interactiveSectionCopy(config.bloques.find(b=>b.tipo==='explorador'),'selector');heading.hidden=!copy.title&&!copy.help;const title=heading.querySelector('h2'),help=heading.querySelector('p');title.textContent=copy.title;title.hidden=!copy.title;help.textContent=copy.help;help.hidden=!copy.help;
  if(legacy){legacy.inert=true;legacy.setAttribute('aria-hidden','true');legacy.dataset.approvedHidden='true'}
  $('mapPins').replaceChildren();
  if(!approvedSelector){
   approvedHost=document.createElement('div');approvedHost.className='approved-selector-host';section.append(approvedHost);
   const forward=(attribute,id)=>{const button=document.createElement('button');button.hidden=true;button.dataset[attribute]=id;app.append(button);button.click();button.remove()};
   approvedSelector=mountSelector(approvedHost,{project:p,config,lots:sourceLots,shapeFor,mapUrl,mapHasPhoto:hasMapPhoto,allowPins:!activeVector,initialPlanBounds:activeVector?size=>{const layout=vectorViewportLayout({...size,bounds:hasMapPhoto?{left:0,top:0,right:1,bottom:1}:sceneMap.bounds});return layout?(hasMapPhoto?vectorPhotoInitialBounds(sceneMap.shapes,layout):vectorInitialBounds(sceneMap.shapes,layout)):null}:null,safeUrl,onSelect:id=>{
    if(!id && chosenLotId)updateConsultAddress(null);
    chosenLotId=id;selected=id;paint();
   },onConsult:openConsult,onBrochure:onPdf?downloadLotBrochure:null,onTour:id=>forward('tour',id),onPanoramas:id=>forward('lotPanos',id)});
  }
  approvedSelector.update(config,chosenLotId);
 }
 // Con la regla de las miniwebs el lote se nombra siempre igual: primero el lote y después la manzana.
 const lotFirst=l=>{const m=config.bloques?.some(b=>b.tipo==='explorador'&&b.opciones?.estadosPlano==='regla')&&String(l?.numero??'').match(/^(Manzana [^·]+?)\s*·\s*(Lote .+)$/i);return m?m[2]+' · '+m[1]:''};
 const lotPhrase=l=>lotFirst(l)?'el '+lotFirst(l):'el lote '+l.numero;
 const lotFieldShown=l=>lotFirst(l)?[lotFirst(l),l.tipo_lote].filter(Boolean).join(' / '):lotField(l);
 function applyConfig(){refreshSaleInventory();syncLegacySalesZoneCSS();style=config.estilo;syncEstudioCSS();if(['relato','recorrido'].includes(style)&&!document.querySelector('link[data-miniweb-relato-fonts]')){const fonts=document.createElement('link');fonts.rel='stylesheet';fonts.href=new URL('../css/miniweb-relato-fonts.css?v=20261112-flujo1',import.meta.url).href;fonts.dataset.miniwebRelatoFonts='';document.head.append(fonts)}app.dataset.style=style;app.dataset.styleBody=style;applyMiniwebPalette(app,config.paleta);designSync?.();app.dataset.sheet=config.ficha;app.dataset.density=config.densidad;app.dataset.intro=config.presentacion;app.dataset.heroAlign=config.alineacion;app.dataset.heroHeight=config.altura;app.style.setProperty('--card-columns',config.columnas);const preset=STYLES.find(s=>s.id===style)||STYLES[0];selector=blockComposition?.explorerVariant()||(config.selector==='auto'?preset.selector:config.selector);app.dataset.selector=selector;q('.section-heading h2').textContent=compare?preset.title:({inmersivo:'Explore los lotes',editorial:'Compare los lotes',arquitectonico:'Plano y características',sectores:'Explore los sectores',catalogo:'Conozca los lotes'})[style];q('.section-heading p').textContent=compare?preset.description:'Seleccione un lote para conocer sus características, fotos y disponibilidad.';
 qa('[data-style-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.styleChoice===style)));$('displayChoice').value=['auto','plano','tarjetas','lista'].includes(config.selector)?config.selector:'auto';Object.entries({selectorChoice:config.selector,sheetChoice:config.ficha,introChoice:config.presentacion,densityChoice:config.densidad,alignChoice:config.alineacion,heightChoice:config.altura,columnsChoice:config.columnas}).forEach(([id,v])=>$(id).value=v);
 qa('[data-section]').forEach(i=>{const id=i.dataset.section;i.checked=config.modulos[id]!==false;if($(id))$(id).hidden=!i.checked||(id==='masterplan'&&(!planUrl||p.plano_activo===false))||(id==='gallery'&&!photos.length)||(id==='partners'&&p.rep_activo===false)});paint();q('.mobile-views').hidden=!['inmersivo','plano'].includes(selector)||$('interactiveMap').hidden;blockComposition?.compose();syncActivePlanInfo();app.dataset.portadaVariant=blockComposition?.portadaVariant()||'';syncApprovedSelector();applyMiniwebBackground(app,config,p,safeUrl);
 }
 function setStyle(s){if(!STYLES.some(x=>x.id===s))return;if(designSync?.previewStyle&&DESIGN_STYLES.some(x=>x.id===s)){designSync.previewStyle(s);return}style=s;config.estilo=s;applyConfig();applyMedia();if(compare&&!editing)history.replaceState(null,'','#'+s)}
 function setScale(v,anchor){automaticFrame=false;const next=Math.max(1,Math.min(zoomLimit(),v)),ratio=next/scale;if(anchor){panX=anchor.x-(anchor.x-panX)*ratio;panY=anchor.y-(anchor.y-panY)*ratio}scale=next;mapTransform()}
 function restoreMapFrame(){if(parcelFraming){if(activeVector)vectorInitial=false;automaticFrame=true;fitMap()}else{panX=panY=0;setScale(1)}}
 function centerLot(l){automaticFrame=false;if(isParcelPlan && l){const center=shapeFor(l)?.center;if(center){panX=-(center[0]/843-.5)*(vectorLayout?.image.width||fitWidth)*scale;panY=-(center[1]/1500-.5)*(vectorLayout?.image.height||fitHeight)*scale;mapTransform()}return}if(!l||l.mapa_x==null||l.mapa_y==null)return;panX=-(Number(l.mapa_x)/100-.5)*fitWidth*scale;panY=-(Number(l.mapa_y)/100-.5)*fitHeight*scale;mapTransform()}
 let youtubePlayer;
 const mediaButton=label=>{const button=$('pauseHero');button.hidden=label==='Pausar video'||matchMedia('(prefers-reduced-motion: reduce)').matches;button.textContent=label;button.setAttribute('aria-label',label)};
 const heroFrame=()=>host.querySelector('[data-hero-youtube]');
 const heroCrop=()=>style==='inmersivo'&&config.bloques.find(b=>b.tipo==='portada')?.opciones.encuadreVideo==='cine'?1.34:1;
 const compactCoverVideo=matchMedia('(max-width:700px)');
 const coverVideoOnDemand=()=>compactCoverVideo.matches&&['estudio-vivo','relato'].includes(style)&&config.bloques.find(b=>b.tipo==='portada')?.opciones.medioMovil!=='video';
 compactCoverVideo.addEventListener('change',()=>{blockComposition?.refreshHero();applyMedia()},{signal});
 const clearYouTube=()=>{youtubePlayer?.destroy?.();youtubePlayer=null;heroFrame()?.remove();q('slot[name=hero-youtube]')?.remove()};
 async function applyMedia(play=false){if(selectorOnly)return;const crop=heroCrop();const v=$('heroVideo');v.style.scale=crop===1?'':String(crop);const source=blockComposition?blockComposition.heroVideo():videoUrl,wanted=coverMedium(config,{mobile:compactCoverVideo.matches})==='video'&&(videoEnabled||(compactCoverVideo.matches&&config.bloques.find(b=>b.tipo==='portada')?.opciones.medioMovil==='video'))&&source&&!$('inicio').hidden,active=wanted&&(play||config.bloques.find(b=>b.tipo==='portada')?.opciones.autoplay!=='no');$('pauseHero').hidden=true;v.hidden=!active;const hero=$('inicio');
  hero.dataset.coverMedium=coverMedium(config,{mobile:compactCoverVideo.matches});
  const poster=hero.querySelector('.hero-media>img')?.getAttribute('src');
  if(poster){if(v.getAttribute('poster')!==poster)v.setAttribute('poster',poster)}else v.removeAttribute('poster');
  const quiet=matchMedia('(prefers-reduced-motion: reduce)').matches;
  hero.dataset.videoCover=active&&!quiet?'pending':'inactive';
  if(coverVideoOnDemand()){
  v.pause();v.hidden=true;clearYouTube();hero.dataset.videoCover='inactive';
  if(style==='relato'&&wanted){const button=$('pauseHero');button.textContent='Ver video';button.setAttribute('aria-label','Ver video del proyecto');button.hidden=false}
  return
 }if(quiet){v.pause();v.hidden=true;clearYouTube();return}if(!active){v.pause();clearYouTube();if(wanted)mediaButton('Reproducir video');return}const embeddedVideo=youtubeEmbed(source),yt=embeddedVideo?[null,embeddedVideo.split('/').pop()]:null;if(yt){if(!play&&matchMedia('(prefers-reduced-motion: reduce)').matches){v.hidden=true;clearYouTube();mediaButton('Reproducir video');return}v.hidden=true;mediaButton('Reproducir video');let f=heroFrame();if(!f){f=document.createElement('iframe');f.title='Video del proyecto';f.id='miniweb-youtube-'+ ++youtubeSerial;f.dataset.heroYoutube='';f.slot='hero-youtube';f.style='position:absolute;left:50%;top:50%;width:max(100%,177.778svh);height:max(100%,56.25vw);transform:translate(-50%,-50%);border:0;pointer-events:none;opacity:0';f.allow='autoplay; encrypted-media';f.referrerPolicy='strict-origin-when-cross-origin';const slot=document.createElement('slot');slot.name='hero-youtube';q('.hero-media').append(slot);host.append(f)}f.style.transform=`translate(-50%,-50%) scale(${crop})`;const embed=`https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&controls=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;if(f.src!==embed){f.src=embed;loadYouTubeAPI().then(YT=>{if(!f.isConnected)return;youtubePlayer=new YT.Player(f,{events:{onReady:e=>{e.target.getIframe().style.transform=`translate(-50%,-50%) scale(${heroCrop()})`;e.target.getIframe().dataset.videoState='ready';e.target.mute();if(!document.hidden)e.target.playVideo()},onStateChange:e=>{const frame=e.target.getIframe();frame.style.transform=`translate(-50%,-50%) scale(${heroCrop()})`;frame.dataset.videoState=String(e.data);if(e.data===1){hero.dataset.videoCover='playing';frame.style.opacity='1';mediaButton('Pausar video')}else{if(style==='inmersivo')frame.style.opacity='0';if(e.data===2||e.data===0)mediaButton('Reproducir video')}},onError:e=>{hero.dataset.videoCover='error';const frame=e.target.getIframe();frame.dataset.videoState='error-'+e.data;frame.style.opacity='0';mediaButton('Reproducir video')},onAutoplayBlocked:e=>{hero.dataset.videoCover='blocked';const frame=e.target.getIframe();frame.dataset.videoState='autoplay-blocked';frame.style.opacity='0';mediaButton('Reproducir video')}}})}).catch(()=>{hero.dataset.videoCover='error';f.style.opacity='0';mediaButton('Reproducir video')})}else if(play){youtubePlayer?.mute?.();youtubePlayer?.playVideo?.();f.contentWindow?.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), 'https://www.youtube-nocookie.com')}return}v.muted=true;v.playsInline=true;v.autoplay=play||!matchMedia('(prefers-reduced-motion: reduce)').matches;if(v.getAttribute('src')!==source)v.src=source;try{if(v.autoplay){await v.play();hero.dataset.videoCover='playing';mediaButton('Pausar video')}else mediaButton('Reproducir video')}catch{hero.dataset.videoCover='error';v.hidden=true;mediaButton('Reproducir video');notify('No se pudo reproducir el video. Se conserva la foto.')}}
 function updateConsultAddress(id,openForm=false){
  if(!publicPage || compare || selectorOnly)return;
  const target=new URL(location.href);
  if(id)target.searchParams.set('lote',lotLinkId(config,id));
  else if(target.searchParams.has('lote'))target.searchParams.delete('lote');
  if(openForm)target.hash='consulta-lote';
  if(target.href!==location.href)history.replaceState(history.state,'',target);
 }
 function openConsult(id,options){
  const effectiveLot=id?lots.find(l=>l.id===id):null;
  if(id&&(!effectiveLot||hideLotInquiry(p.slug,effectiveLot)))return;
  if(selectorOnly){
   sheet.close();
   const target=new URL(location.href);
   target.searchParams.delete('solo');target.searchParams.delete('comparar');
   if(id)target.searchParams.set('lote',id);else target.searchParams.delete('lote');
   target.hash='consulta-lote';
   const event=new CustomEvent('miniweb-consulta',{detail:{lotId:id},cancelable:true});
   if(host.dispatchEvent(event))location.assign(target.href);
   return;
  }
  if(!options?.fromLink)updateConsultAddress(id,true);
  const l=effectiveLot;contactLot=l||null;sheet.close();$('contactTitle').textContent=l?.avisoZonaProximamente?'Avisarme cuando salga a la venta':l?'Consultar el lote '+lotNumber(l.numero):'Consultar el proyecto';$('contactMessage').value=l?.avisoZonaProximamente?'Quisiera que me avisen cuando salga a la venta el lote '+l.numero+' de '+localName+'.':l?`Quisiera información sobre ${lotPhrase(l)} de ${localName}.`:mensajeGeneral();$('contactLotLabel').hidden=!l;$('contactLotNumber').value=l?lotFieldShown(l):'';$('contactResult').textContent='';if(!blockComposition?.openContact(options))$('contactDialog').showModal()}
 root.addEventListener('miniweb-consulta',event=>{
  if(!publicPage||editing||compare||selectorOnly||!event.detail?.href)return;
  let destination;try{destination=new URL(event.detail.href,location.href)}catch{return}
  if(destination.origin!==location.origin||destination.pathname!=='/'+encodeURIComponent(p.slug)||destination.hash!=='#consulta-lote')return;
  const lot=findPublicLot(config,lots,destination.searchParams.get('lote'));
  if(!lot||hideLotInquiry(p.slug,lot))return;
  event.preventDefault();
  const stage=event.target;
  const reveal=()=>{
   if(signal.aborted)return;
   stage.dispatchEvent(new Event('miniweb-tour-collapse'));
   if(stage.classList?.contains('tour-expanded')){
    if(stage.hasAttribute('popover')){try{stage.hidePopover()}catch{}stage.removeAttribute('popover')}
    stage.classList.remove('tour-expanded');
   }
   const expand=stage.querySelector?.('.tour-expand');
   if(expand){expand.textContent='Pantalla completa';expand.setAttribute('aria-pressed','false')}
   openConsult(lot.id);
  };
  const fullscreen=root.fullscreenElement||document.fullscreenElement;
  if(fullscreen&&(fullscreen===host||fullscreen===stage||stage.contains(fullscreen)))document.exitFullscreen().then(reveal).catch(()=>notify('Salí de pantalla completa para abrir la consulta.'));
  else reveal();
 },{signal});
 app.addEventListener('click',e=>{
  const b=e.target.closest('button,[data-parcel]');if(!b)return;const d=b.dataset;
  if(skipMapClick&&b.closest('#mapStage')){e.preventDefault();e.stopImmediatePropagation();skipMapClick=false;return}
  if('salesZone'in d){salesZoneFilter=d.salesZone;manzanaSelect.value='';selected=null;chosenLotId=null;paint();return;}
  if(d.mapState){status=status===d.mapState?'todos':d.mapState;$('stateFilter').value=status;paint();return}
  if(d.mobileView){app.dataset.mobileView=d.mobileView;qa('[data-mobile-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));paint();return}
  if('hidePeek'in d){e.stopImmediatePropagation();mobilePeek=false;quickLot.hidden=true;return}if(d.expand&&b.closest('.mobile-lot-summary')){e.stopImmediatePropagation();showSheet(d.expand);return}if(d.lot){e.stopImmediatePropagation();const fromTable=!!b.closest('table');let id=d.lot;
   if(e.detail>0&&b.classList.contains('pin-compact')){const canvas=$('mapCanvas').getBoundingClientRect();let distance=Infinity;for(const pin of qa('#mapPins .map-pin')){const x=canvas.left+parseFloat(pin.style.left)/100*canvas.width,y=canvas.top+parseFloat(pin.style.top)/100*canvas.height,delta=Math.hypot(e.clientX-x,e.clientY-y);if(delta<distance){distance=delta;id=pin.dataset.lot}}}
   chosenLotId=selected=id;mobilePeek=false;paint();
   if(b.hasAttribute('data-parcel')){
    const list=q('.lote-list.scroll-lot-options');
    const row=list?.querySelector('[data-lot="'+CSS.escape(id)+'"]');
    if(row){const bounds=list.getBoundingClientRect(),rect=row.getBoundingClientRect();if(rect.top<bounds.top||rect.bottom>bounds.bottom)list.scrollTop+=rect.top-bounds.top;}
   }
   if(fromTable)centerLot(lots.find(l=>l.id===selected));
   showSheet(selected);return}

 },true);
 $('mapPins').addEventListener('keydown',e=>{
  const shape=e.target.closest('[data-parcel]');
  if(shape&&['Enter',' '].includes(e.key)){e.preventDefault();shape.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
 });
 const stage=$('mapStage'),pointers=new Map();let gesture=null;
 const parcelHint=document.createElement('output');parcelHint.className='parcel-hint';parcelHint.hidden=true;stage.append(parcelHint);
 stage.addEventListener('pointermove',e=>{
  const parcel=e.target.closest('[data-parcel]');
  if(!parcel || e.pointerType==='touch' || e.buttons){parcelHint.hidden=true;return}
  const text=parcel.querySelector('title')?.textContent||'';
  if(parcelHint.textContent!==text)parcelHint.textContent=text;
  parcelHint.hidden=false;
  const bounds=stage.getBoundingClientRect();
  parcelHint.style.left=Math.max(4,Math.min(bounds.width-parcelHint.offsetWidth-4,e.clientX-bounds.left+12))+'px';
  parcelHint.style.top=Math.max(4,Math.min(bounds.height-parcelHint.offsetHeight-4,e.clientY-bounds.top+12))+'px';
 });
 stage.addEventListener('pointerleave',()=>{parcelHint.hidden=true});
 stage.addEventListener('pointerdown',()=>{parcelHint.hidden=true});
 const point=e=>{const r=stage.getBoundingClientRect();return{x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2}};
 const startGesture=()=>{const a=[...pointers.values()];gesture=a.length>1?{kind:'pinch',distance:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),scale,center:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2},panX,panY}:{kind:'pan',start:a[0],panX,panY};};
 stage.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.mobile-lot-summary')||e.pointerType==='touch'&&stage.dataset.explore!=='true')return;pointers.set(e.pointerId,point(e));if(!e.target.closest('[data-lot]'))stage.setPointerCapture(e.pointerId);skipMapClick=false;startGesture()});
 stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;const cur=point(e);pointers.set(e.pointerId,cur);if(gesture.kind==='pinch'&&pointers.size>1){const a=[...pointers.values()],distance=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);scale=gesture.scale;panX=gesture.panX;panY=gesture.panY;setScale(gesture.scale*distance/Math.max(1,gesture.distance),gesture.center);skipMapClick=true}else if(gesture.start){const dx=cur.x-gesture.start.x,dy=cur.y-gesture.start.y;if(Math.hypot(dx,dy)>5){if(!stage.hasPointerCapture(e.pointerId))stage.setPointerCapture(e.pointerId);automaticFrame=false;skipMapClick=true;panX=gesture.panX+dx;panY=gesture.panY+dy;mapTransform()}}});
 const endPointer=e=>{pointers.delete(e.pointerId);if(pointers.size)startGesture();else{gesture=null;setTimeout(()=>{skipMapClick=false},0)}};stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',endPointer);stage.addEventListener('lostpointercapture',endPointer);
 if(activeVector){
  const zoomWheel=(delta,event)=>{if(delta)setScale(scale*(delta<0?1.12:1/1.12),point(event))};
  const unbridge=bridgeInlineWheel(stage,stage,{onZoom:zoomWheel,onHorizontal:delta=>{automaticFrame=false;panX-=delta;mapTransform()}});
  signal.addEventListener('abort',unbridge,{once:true});
  stage.addEventListener('wheel',e=>{if(!document.fullscreenElement&&!stage.matches(':fullscreen')&&!stage.classList.contains('tour-expanded'))return;e.preventDefault();zoomWheel(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX,e)},{passive:false,signal});
 }else stage.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setScale(scale*(e.deltaY<0?1.12:.89),point(e))},{passive:false});
 stage.addEventListener('keydown',e=>{if(e.target!==stage)return;const moves={ArrowLeft:[50,0],ArrowRight:[-50,0],ArrowUp:[0,50],ArrowDown:[0,-50]};if(moves[e.key]){e.preventDefault();automaticFrame=false;panX+=moves[e.key][0];panY+=moves[e.key][1];mapTransform()}else if(e.key==='+'||e.key==='='){e.preventDefault();setScale(scale+.25)}else if(e.key==='-'){e.preventDefault();setScale(scale-.25)}else if(e.key==='Home'){e.preventDefault();restoreMapFrame()}});
 function enableMapPan(active){
  stage.dataset.explore=String(active);
  $('mapTouch').setAttribute('aria-pressed',String(active));
  $('mapTouch').textContent=active?'Dejar de mover':'Mover mapa';
 }
 $('mapFit').onclick=()=>{if(activeVector)restoreMapFrame();else{panX=panY=0;setScale(1)}if(mobileParcelMap())enableMapPan(false)};
 $('mapFill').onclick=()=>{
  if(activeVector){vectorInitial=true;automaticFrame=true;fitMap();return}
  if(mobileParcelMap()){
   const parcel=q('.lot-parcels [aria-pressed="true"]');
   if(!parcel)return;
   const rect=parcel.getBoundingClientRect();
   const shortSide=Math.min(rect.width,rect.height)/scale;
   if(shortSide>0){setScale(Math.max(4,Math.ceil(48/shortSide)));centerLot(lots.find(lot=>lot.id===selected));enableMapPan(true)}
  }else if(fitWidth&&fitHeight){panX=panY=0;setScale(Math.max(stage.clientWidth/fitWidth,stage.clientHeight/fitHeight))}
 };
 $('mapTouch').onclick=()=>enableMapPan(stage.dataset.explore!=='true');
 function labelMapZoom(){
  const button=$('mapFill'),mobile=mobileParcelMap(),label=mobile?'Ampliar lotes':'Llenar vista';
  button.classList.toggle('parcel-zoom',mobile);
  button.setAttribute('aria-label',label);button.title=label;
  button.querySelector('.map-tool-label').textContent=label;
 }
 const mobileQuery=matchMedia('(max-width:700px)'),availabilityControl=q('.lot-filters>label');const arrangeControls=()=>{labelMapZoom();key.open=!mobileQuery.matches;filterPanel.open=true;if(mobileQuery.matches)searchFilters.prepend(availabilityControl);else q('.lot-filters').insertBefore(availabilityControl,views);fitMap()};arrangeControls();mobileQuery.addEventListener('change',arrangeControls,{signal});
 const filterBindings={lotSearch:v=>search=v.trim(),areaMin:v=>minArea=v,areaMax:v=>maxArea=v,priceMax:v=>maxPrice=v};for(const [id,set]of Object.entries(filterBindings))$(id).oninput=e=>{set(e.target.value);paint()};
 $('clearLotFilters').onclick=()=>{salesZoneFilter='';manzanaSelect.value='';search=minArea=maxArea=maxPrice='';zone='todas';status='todos';for(const id of Object.keys(filterBindings))$(id).value='';$('stateFilter').value='todos';paint()};
 app.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;if(b.tagName==='A'&&location.hostname==='staging.surpatagonian.com'&&b.href&&new URL(b.href).origin!==location.origin){e.preventDefault();notify('Salida externa deshabilitada en pruebas.');return}const d=b.dataset;if(d.lotPanos){
   const lot=lots.find(l=>l.id===d.lotPanos);if(!lot)return;
   if(!document.querySelector('link[data-lot-viewer]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/css/recorrido-medios.css';css.dataset.lotViewer='';document.head.append(css);}
   openMediaViewer(mediaList(config,lot.id).filter(item=>item.tipo==='panorama'),{title:'Lote '+lot.numero,context:'recorrido'});return;
  }if(d.styleChoice){const y=scrollY;setStyle(d.styleChoice);scrollTo({top:y,behavior:'instant'});return}if(d.display){config.selector=d.display;applyConfig();return}if(d.zone){zone=d.zone;paint();return}if(d.expand){if(config.ficha==='lateral'&&!b.closest('.lot-aside,.vfx-lot-table')){chosenLotId=selected=d.expand;paint();$('lotDetail').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}else{showSheet(d.expand)}return}if(d.lot){chosenLotId=selected=d.lot;paint();const modal=config.ficha==='modal'||(config.ficha==='auto'&&['tarjetas','sectores'].includes(selector));if(modal)showSheet(selected);else if(matchMedia('(max-width:700px)').matches)$('lotDetail').scrollIntoView({block:'start',behavior:'smooth'});return}if(d.sheetPhoto){sheet.querySelector('.sheet-photo').src=d.sheetPhoto;return}if(d.tour){const l=lots.find(l=>l.id===d.tour),url=l&&lotMedia(l).tour360;if(!url)return;const content=tour.querySelector('.tour-content');content.replaceChildren();const u=new URL(url),embed=['my.matterport.com','kuula.co','www.kuula.co'].includes(u.hostname);if(embed){const f=document.createElement('iframe');f.title='Vista 360 del lote '+l.numero;f.className='tour-frame';f.sandbox='allow-scripts allow-same-origin allow-pointer-lock allow-presentation';f.allow='fullscreen';f.src=url;content.append(f)}else{const p=document.createElement('p');p.textContent='La vista 360 se abre en el sitio del proveedor.';content.append(p)}const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='tour-link';a.textContent='Abrir vista 360 en otra pestaña';content.append(a);tour.showModal();return}if('consult'in d){openConsult(d.consultLot);return}if('close'in d){b.closest('dialog').close();return}if(d.image){$('expandedImage').src=d.image;$('expandedImage').alt=d.imageTitle||'Imagen del proyecto';$('imageTitle').textContent=d.imageTitle||'Imagen del proyecto';$('imageDialog').showModal();return}if(b.tagName==='A'&&b.getAttribute('href')?.startsWith('#')){const target=$(b.getAttribute('href').slice(1));if(target){e.preventDefault();if(target.matches('.contacto')){openConsult();return}target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}}});
 $('settingsTrigger').onclick=()=>{const open=$('previewSettings').hidden;$('previewSettings').hidden=!open;$('settingsTrigger').setAttribute('aria-expanded',String(open))};$('closeSettings').onclick=()=>{$('previewSettings').hidden=true;$('settingsTrigger').setAttribute('aria-expanded','false');$('settingsTrigger').focus()};
 const controlKeys={selectorChoice:'selector',sheetChoice:'ficha',introChoice:'presentacion',densityChoice:'densidad',alignChoice:'alineacion',heightChoice:'altura',columnsChoice:'columnas'};for(const [id,key]of Object.entries(controlKeys))$(id).onchange=e=>{config[key]=id==='columnsChoice'?Number(e.target.value):e.target.value;applyConfig()};
 $('displayChoice').onchange=e=>{config.selector=e.target.value;applyConfig()};
 $('stateFilter').onchange=e=>{status=e.target.value;paint()};$('zoomIn').onclick=()=>setScale(scale+.25);$('zoomOut').onclick=()=>setScale(scale-.25);$('zoomReset').onclick=restoreMapFrame;$('toggleList').onclick=()=>{listOpen=!listOpen;$('lotList').hidden=!(listOpen||selector==='lista');$('toggleList').setAttribute('aria-expanded',String(listOpen));$('toggleList').textContent=listOpen?'Ocultar lista comparativa':'Ver lista comparativa'};
 $('mediaChoice').value=media;$('videoEnabled').checked=videoEnabled;$('mediaChoice').onchange=e=>{media=e.target.value;const b=config.bloques.find(b=>b.tipo==='portada');if(b)b.opciones.medio=media;clearYouTube();applyMedia(true)};$('videoEnabled').onchange=e=>{videoEnabled=e.target.checked;clearYouTube();applyMedia(true)};$('playHero').onclick=()=>{
  if(coverVideoOnDemand()){
   const source=safeUrl(blockComposition?.heroVideo()||videoUrl);if(!source)return;
   const dialog=document.createElement('dialog');dialog.className='dialog image-dialog';
   dialog.innerHTML='<header><h2>Video del proyecto</h2><button type="button" class="close" data-close aria-label="Cerrar video">×</button></header>';
   const embed=youtubeEmbed(source),player=document.createElement(embed?'iframe':'video');
   if(embed){player.title='Video del proyecto';player.allow='autoplay; fullscreen';player.allowFullscreen=true;player.src=embed+'?autoplay=1&playsinline=1'}
   else{player.controls=true;player.autoplay=true;player.playsInline=true;player.src=source}
   player.className='studio-video-player';dialog.append(player);app.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();return
  }
  media='video';videoEnabled=true;$('mediaChoice').value='video';$('videoEnabled').checked=true;applyMedia(true)};$('pauseHero').onclick=()=>{if(coverVideoOnDemand()){$('playHero').click();return}const f=heroFrame(),v=$('heroVideo');if(f){if(f.dataset.videoState==='1'){youtubePlayer?.pauseVideo?.();f.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}), 'https://www.youtube-nocookie.com');mediaButton('Reproducir video')}else applyMedia(true)}else if(v.hidden||v.paused)applyMedia(true);else{v.autoplay=false;v.pause();mediaButton('Reproducir video')}};
 qa('[data-section]').forEach(i=>i.onchange=()=>{config.modulos[i.dataset.section]=i.checked;applyConfig()});
 const phone=document.createElement('label');phone.innerHTML='Teléfono<input name="telefono" type="tel" autocomplete="tel">';$('contactForm').querySelector('label').after(phone);const lotContext=document.createElement('label');lotContext.id='contactLotLabel';lotContext.hidden=true;lotContext.innerHTML='Lote seleccionado<input id="contactLotNumber" readonly aria-readonly="true">';phone.after(lotContext);$('contactForm').querySelector('p').textContent=demo||compare&&!onContact?'Vista local: esta consulta no se envía ni se guarda.':'Su consulta será recibida por Sur Patagonian.';$('contactForm').querySelector('button[type=submit]').textContent=demo||compare&&!onContact?'Probar consulta':'Enviar consulta';
 $('contactForm').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget, button=form.querySelector('[type=submit]');
  if(button.disabled)return;
  button.disabled=true;
  try{
   const fields=Object.fromEntries(new FormData(form));
   if(contactLot){
    fields.lote_id=contactLot.id;
    fields.lote_numero=contactLot.numero;
    fields.lote_sector=contactLot.tipo_lote||'';
    fields.mensaje='Consulta por lote '+contactLot.numero+(contactLot.tipo_lote?' / '+contactLot.tipo_lote:'')+'.\n\n'+fields.mensaje;
   }
   const consulta=validarConsulta(fields,'['+p.nombre+'] ');
   if(onContact)await onContact(consulta);
   $('contactResult').textContent=onContact?'Consulta enviada.':'Demostración: la consulta no se envió ni se guardó.';
  }catch(error){
   $('contactResult').textContent=errorConsulta(error);
  }finally{button.disabled=false}
 };
 $('showBrochure').onclick=()=>onPdf?onPdf():notify('El diseño del generador PDF se trabajará en otra etapa.');
 app.addEventListener('keydown',e=>{if(e.key==='Escape'){$('previewSettings').hidden=true;$('settingsTrigger').setAttribute('aria-expanded','false')}});
 window.addEventListener('hashchange',()=>{if(compare&&!editing&&STYLES.some(s=>s.id===location.hash.slice(1)))setStyle(location.hash.slice(1))},{signal});
 let resumeHeroOnVisible=false;document.addEventListener('visibilitychange',()=>{const v=$('heroVideo');const embedded=heroFrame();if(embedded&&(!matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden))embedded.contentWindow?.postMessage(JSON.stringify({event:'command',func:document.hidden?'pauseVideo':'playVideo',args:[]}), 'https://www.youtube-nocookie.com');if(document.hidden){resumeHeroOnVisible=!v.hidden&&(!v.paused||v.autoplay);v.pause()}else if(resumeHeroOnVisible&&!v.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){resumeHeroOnVisible=false;v.play().catch(()=>{})}},{signal});
 if(compare){designSync=mountDesignChooser({container:$('previewSettings'),config,project:p,lots,onChange:()=>{applyConfig();applyMedia();onConfigChange?.(structuredClone(config))}});$('previewSettings').querySelectorAll('.setting,.settings-group,.settings-note').forEach(n=>n.hidden=true);}
 const hash=location.hash.slice(1);if(compare&&STYLES.some(s=>s.id===hash))config.estilo=style=hash;
 function selectTourLot(publicId){
  const lot=findPublicLot(config,lots,publicId);
  if(lot && (lot.id!==selected||chosenLotId!==lot.id)){chosenLotId=selected=lot.id;paint()}
 }
 function mensajeGeneral(){
  const contacto=config.bloques?.find(b=>b.tipo==='contacto' && b.activo!==false);
  return contacto?.opciones?.formatoConsulta==='tarjeta'?'':`Quisiera información sobre ${localName}.`;
 }
 let lastLotMessage='';blockComposition=mountBlocks({app,root,config,hasMap,hasMapPhoto,hasGeometry:isParcelPlan,hasUnavailableLots:unavailableLots.length>0&&selectorEnabled(config,p,mapUrl),parcelKey,project:isParcelPlan?{...p,mapa_imagen_url:mapUrl}:p,lots,tourLots:sourceLots,compare,editing,visualEditor,previewDevice,uploadMedia,safeUrl,serviceLabels,onBrochure:onPdf?downloadLotBrochure:null,onTourLot:selectTourLot,getSelected:()=>contactSelection(lots.find(l=>l.id===selected)),onSelection:l=>{contactLot=l||null;const value=l?`Quisiera información sobre ${lotPhrase(l)} de ${localName}.`:mensajeGeneral();if(!$('contactMessage').value||$('contactMessage').value===lastLotMessage)$('contactMessage').value=value;lastLotMessage=value;$('contactLotNumber').value=l?lotFieldShown(l):'';},onChange:()=>{applyConfig();applyMedia();onConfigChange?.(structuredClone(config))}});
 if(manzanaSelect.options.length>1){
  const control=document.createElement('label');control.className='manzana-control';control.hidden=p.slug!=='aldea-los-huemules'&&salesZones(config).zonas.length>0;control.append('Manzana',manzanaSelect);
  q('.lotes-head').append(control);
 }
 const commercial=commercialPresentation(config)?await import('./terrazas-comercial.mjs'):null;
 app.dataset.presentacion=commercial?'comercial':'estilo';
 let destroyed=false;
 const destroy=()=>{if(destroyed)return;destroyed=true;previewSizer?.disconnect();lifecycle.abort();mapObserver.disconnect();$('heroVideo')?.pause();clearYouTube();clearTimeout(timer);approvedSelector?.destroy();blockComposition?.destroy();root.replaceChildren()};
 try{
 await Promise.all([stylesheetReady(css),stylesheetReady(designCSS),boundedReady(stylesheetReady(fontCSS),6000),syncEstudioCSS()]);
 applyConfig();fitMap();
 const fontLoads=[q('.hero h1'),q('.identity-name')].filter(Boolean).map(el=>{const computed=getComputedStyle(el);return document.fonts.load(`${computed.fontStyle} ${computed.fontWeight} 48px ${computed.fontFamily}`,el.textContent)});
 const fontsReady=boundedReady(Promise.all(fontLoads),6000);
 await applyMedia();
 await Promise.all([fontsReady,editing||selectorOnly?Promise.resolve():heroReady(q('.hero'),signal)]);
 if(signal.aborted)throw new Error('Presentación cancelada.');
 commercial?.presentarComercial(root,{...p,tema:{...parseTheme(p.tema),miniweb:config}},sourceLots,{signal});
 app.style.removeProperty('visibility');
 if (returningLot) {
  if (consultLink) openConsult(returningLot.id,{fromLink:true});
  else {
   const card=approvedHost?.shadowRoot.querySelector('.card:not([hidden])');
   const row=q('.lote-list [data-lot="'+CSS.escape(returningLot.id)+'"]');
   // The mobile sheet occupies the bottom of the map. Centering the sheet
   // alone pushes the selected parcel and map controls above the viewport.
   const mobilePlan=matchMedia('(max-width:900px)').matches && card?.closest('.sel:not([data-list-only=true])');
   const target=mobilePlan || card || (row?.getClientRects().length ? row : $('lotes'));
   if(mobilePlan){
    const nav=q('.project-nav');
    const inset=nav?Math.max(0,parseFloat(getComputedStyle(nav).top)||0)+nav.offsetHeight:0;
    approvedSelector?.setViewportInset?.(inset);
    scrollTo({top:scrollY+mobilePlan.getBoundingClientRect().top-inset,behavior:'instant'});
   }else if(card&&matchMedia('(min-width:901px)').matches&&approvedSelector?.whenReady){
    // The selector can finish its layout after the page itself is ready.
    // A new user gesture takes precedence over this pending return alignment.
    let cancelled=false;const cancel=()=>{cancelled=true};
    const gestures=['pointerdown','wheel','keydown'];
    for(const type of gestures)window.addEventListener(type,cancel,{capture:true,once:true,signal});
    approvedSelector.whenReady.then(ready=>{
     for(const type of gestures)window.removeEventListener(type,cancel,true);
     if(ready&&!cancelled&&!destroyed&&!signal.aborted)approvedHost?.shadowRoot.querySelector('.card:not([hidden])')?.scrollIntoView({block:'center',behavior:'instant'});
    });
   }else target.scrollIntoView({block:'center',behavior:'instant'});
  }
 } else {
  if(consultLink&&!selectorOnly&&(requestedLot!==null || (publicPage&&!compare)))openConsult(null,{fromLink:true});
  if(requestedLot!==null)notify('Ese lote ya no está disponible en este enlace.');
 }
 return {setStyle,updateConfig:async next=>{if(!visualEditor)throw Error('La actualización en memoria sólo está disponible en el editor visual');const normalized=normalizeMiniweb(next);for(const key of Object.keys(config))delete config[key];Object.assign(config,normalized);media=config.medio;videoEnabled=config.videoActivo;applyConfig();await estudioCSSReady;if(config.estilo==='estudio-vivo')applyConfig();await applyMedia()},inspect:(id,index)=>blockComposition?.inspect(id,index),isUploading:()=>blockComposition?.isUploading()||false,getConfig:()=>structuredClone({...config,estilo:style}),root,openEditor:()=>{$('previewSettings').hidden=false;$('settingsTrigger').setAttribute('aria-expanded','true')},destroy};
 }catch(error){destroy();throw error}
}
