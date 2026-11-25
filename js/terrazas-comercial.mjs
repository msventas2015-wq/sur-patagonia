import {rotularLotesTerrazas} from './ficha-lote-recorrido.mjs';

const estilos = `.miniweb[data-propuesta] .hero .hero-copy .hero-phrase{font:500 clamp(16px,1.5vw,21px)/1.45 var(--sans);max-width:40ch;text-wrap:balance;margin:16px auto 0}
    .miniweb[data-propuesta] .hero .hero-copy{text-shadow:0 1px 9px #12201dc7}
    .miniweb[data-propuesta] .hero .hero-media::after{background:linear-gradient(180deg,#101a1b50,transparent 25%,#0c181a40 53%,#0b171936)}
    .miniweb[data-propuesta] .cifras .shell{display:grid;grid-template-columns:1.12fr 1.05fr .86fr;gap:0;align-items:start}
    .miniweb[data-propuesta] .cifras .shell>div{min-width:0;padding:0 clamp(20px,3.8vw,70px);border:0;border-left:1px solid var(--line)}
    .miniweb[data-propuesta] .cifras .shell>div:first-child{border:0;padding-left:0}
    .miniweb[data-propuesta] .cifras .shell strong{font:400 clamp(38px,4.3vw,70px)/1.08 var(--display);letter-spacing:-.03em;color:var(--ink);white-space:nowrap}
    .miniweb[data-propuesta] .cifras .shell span{display:block;font:500 16px/1.45 var(--sans);color:var(--ink);letter-spacing:0;text-transform:none;margin:7px 0 0}
    .miniweb[data-propuesta] .enlace-financiacion{
      display:inline-flex;align-items:center;min-height:44px;color:var(--ink);font:600 16px/1.4 var(--sans);
      text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px
    }
    .miniweb[data-propuesta] .enlace-financiacion{margin-top:6px}
    .miniweb[data-propuesta] .pagos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;margin:28px 0 0}
    .miniweb[data-propuesta] .pagos div{padding-top:18px;border-top:1px solid var(--line)}
    .miniweb[data-propuesta] .pagos dt,.miniweb[data-propuesta] .pagos small{font:500 16px/1.5 var(--sans);color:var(--ink)}
    .miniweb[data-propuesta] .pagos dd{font:400 clamp(32px,3.4vw,54px)/1.15 var(--display);letter-spacing:-.025em;margin:7px 0}
    .miniweb[data-propuesta] .payment-summary{font:500 17px/1.55 var(--sans);margin:22px 0 0;color:var(--ink)}
    .miniweb[data-propuesta] .local-reglamento{font:400 17px/1.6 var(--sans);max-width:65ch}
    .miniweb[data-propuesta] .location-map{width:100%;min-height:300px;border:0}
    .miniweb[data-propuesta] :is(.enlace-financiacion,.hero-actions .primary):focus-visible{outline:2px solid currentColor;outline-offset:4px}
    @media(max-width:700px){
      .miniweb[data-propuesta] .cifras .shell{grid-template-columns:1.22fr 1fr;gap:20px 0}
      .miniweb[data-propuesta] .cifras .shell>div{padding:0 0 0 16px}
      .miniweb[data-propuesta] .cifras .shell>div:first-child{grid-column:1/-1;border-bottom:1px solid var(--line);padding-bottom:12px}
      .miniweb[data-propuesta] .cifras .shell>div:nth-child(2){border:0;padding:0 12px 0 0}
      .miniweb[data-propuesta] .cifras .shell strong{font-size:clamp(32px,8.2vw,40px);white-space:normal}
      .miniweb[data-propuesta] .cifras .shell>div:first-child strong{font-size:40px}
      .miniweb[data-propuesta] .pagos{grid-template-columns:1fr;gap:16px}
      .miniweb[data-propuesta] .pagos div{padding-top:14px}
    }

    #inicio .hero-copy .hero-phrase{color:#fff}
    #fotos-terrazas>figure:nth-child(n+4){display:none!important}
    @media(min-width:701px) and (max-width:800px){.miniweb.sale[data-propuesta] .nav-links>a[href="#lotes"]{display:inline-flex!important;align-items:center;min-height:44px}}
    #inicio[data-video-cover=pending] .hero-media>img{visibility:visible}

    #inicio .hero .scroll,#inicio .scroll{display:none!important}
    #inicio .hero-copy .hero-phrase{letter-spacing:.12em;text-transform:uppercase}
    #imageDialog .album-count{position:absolute;left:20px;top:18px;color:white;font:500 16px/1.4 var(--sans)}
    #fotos-terrazas{display:grid;grid-template-columns:2fr 1fr 1fr}
    @media(min-width:701px){#fotos-terrazas>figure:nth-child(-n+3) button{aspect-ratio:auto;height:clamp(220px,26vw,450px)}}
    @media(max-width:700px){#fotos-terrazas{grid-template-columns:1fr 1fr}}

    #fotos-terrazas>figure:nth-child(-n+3){grid-column:auto!important;margin:0!important}
    #fotos-terrazas img{width:100%;height:100%;object-fit:cover}
    #fotos-terrazas button{aspect-ratio:4/3;overflow:hidden}
    #fotos-terrazas{gap:4px}
    #imageDialog[data-album] #imageTitle{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    #imageDialog[data-album] header{justify-content:flex-end}
    @media(max-width:700px){
      #fotos-terrazas>figure:first-child{grid-column:1/-1!important}
      #fotos-terrazas>figure:first-child button{aspect-ratio:3/2}
    }
    @media(max-width:700px){
      .miniweb.sale[data-style][data-propuesta] .cifras .shell{
        grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)!important
      }
      .miniweb.sale[data-style][data-propuesta] .cifras .shell>div{min-width:0}
    }
    .miniweb[data-propuesta] .hero .scroll{display:none}
    @media(max-width:520px){
      .miniweb.sale[data-style][data-propuesta] .cifras .shell{grid-template-columns:1fr!important;gap:18px;width:calc(100% - 48px)}
      .miniweb.sale[data-style][data-propuesta] .cifras .shell>div{border:0;padding:0}
      .miniweb.sale[data-style][data-propuesta] .cifras .shell>div:first-child{padding-bottom:10px;border-bottom:1px solid var(--line)}
      .miniweb.sale[data-style][data-propuesta] .cifras .shell strong{white-space:nowrap}
      .miniweb.sale[data-style][data-propuesta] .cifras .shell>div:not(:first-child) span{margin-top:3px}
    }

    .miniweb.sale[data-palette][data-propuesta] .block-stream>[data-block-type=servicios]{
      min-height:0!important;padding-block:clamp(30px,4vw,58px) 12px!important
    }
    .miniweb.sale[data-propuesta] [data-block-type=servicios] h2{font-size:clamp(26px,2.5vw,38px);margin:0}
    .miniweb.sale[data-palette][data-propuesta] .block-stream>[data-block-type=ficha-tecnica]{
      min-height:0!important;padding-block:18px clamp(32px,4vw,64px)!important
    }
    .miniweb.sale[data-propuesta] [data-block-type=ficha-tecnica] h2{font-size:clamp(24px,2.1vw,34px);margin:0 0 12px}
    .miniweb.sale[data-propuesta] .local-reglamento{color:var(--ink)!important}
    .miniweb.sale[data-palette][data-propuesta] .block-stream>[data-block-type=financiacion]{padding-block:clamp(40px,5vw,74px)!important}
    .miniweb.sale[data-palette][data-propuesta] [data-block-type=financiacion]{
      background:#273637!important;color:#faf6ec!important;--ink:#faf6ec;--line:#8c9791}
    .miniweb.sale[data-palette][data-propuesta] [data-block-type=financiacion] :is(h2,dt,dd,.payment-summary){color:#faf6ec!important}
    .miniweb.sale[data-propuesta] .commerce-network .network-layout:has(>.network-principal:only-child){display:block}
    .miniweb.sale[data-propuesta] .commerce-network .network-principal:only-child{border:0;padding-inline:0}
    @media(max-width:700px){
      .miniweb.sale[data-propuesta] #lotes.selector-aprobado>.approved-selector-host:not([data-list-only=true]){
        --selector-height:clamp(440px,145vw,580px)!important;
        height:max(var(--selector-height),var(--selector-needed,0px))!important;min-height:0!important
      }
      .miniweb.sale[data-propuesta] #lotes.selector-aprobado>.approved-selector-host[data-mobile-sheet]:not([data-list-only=true]){
        height:auto!important;min-height:0!important;max-height:none!important
      }
      .miniweb.sale[data-propuesta] #lotes.selector-aprobado:has(>.approved-selector-host[data-mobile-sheet])>.interactive-section-heading{
        width:auto;margin:0 0 10px;padding:0 4px!important
      }
      .miniweb.sale[data-palette][data-propuesta] #lotes.selector-aprobado:has(>.approved-selector-host[data-wide-entry]){
        padding:0 0 clamp(40px,8vw,60px)!important
      }
      .miniweb.sale[data-palette][data-propuesta] #lotes.selector-aprobado:has(>.approved-selector-host[data-wide-entry])>.interactive-section-heading{
        display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;
        width:100%;margin:0;padding:46px clamp(18px,5vw,28px) 24px!important
      }
      .miniweb.sale[data-palette][data-propuesta] #lotes:has(>.approved-selector-host[data-wide-entry])>.interactive-section-heading h2{
        font-size:clamp(32px,8vw,44px)!important;line-height:1.08!important;letter-spacing:-.035em
      }
      .miniweb.sale[data-propuesta] .selector-available-count{font:600 14px/1.3 var(--sans);white-space:nowrap;color:inherit}
      .miniweb.sale[data-propuesta] #lotes:has(>.approved-selector-host[data-wide-entry])>.interactive-section-heading p{
        order:2;flex-basis:100%;margin:0
      }
    }
    @media(max-width:350px){
      .miniweb.sale[data-palette][data-propuesta] #lotes.selector-aprobado:has(>.approved-selector-host[data-wide-entry])>.interactive-section-heading{
        padding-block:34px 20px!important
      }
    }`;

const captions=[
      'El loteo y su entorno, al pie de la cordillera.',
      'El terreno y las laderas vistas desde el pastizal.',
      'Una de las calles internas del desarrollo.',
      'Vista aérea de las calles y los terrenos.',
      'El trazado de las calles, visto desde arriba.',
      'Vista amplia del valle de El Bolsón.',
      'Las calles paralelas y el bosque al fondo.',
      'El desarrollo y las viviendas de su entorno.',
      'El terreno, el bosque y el perfil de los cerros.'
    ];
// Composición aprobada por Mariano (referencia del 23-nov-2026). Se aplica UNA vez, desde el creador, sobre los
// bloques guardados del proyecto. Deja la marca recursos.cierreTerrazas='bloques'; después de eso, lo que se edite
// en el creador manda y esta función no vuelve a tocarlo. No lee ni cambia inventario, precios ni datos del proyecto.
// Referencia visual: la maqueta final aprobada por Mariano (docs/maquetas/terrazas-miniweb-claude.html, sin parámetros).
const COMPOSICION_ANTERIOR='2026-11-23-maqueta';
export const COMPOSICION_TERRAZAS='2026-11-23-maqueta-portada';
export const composicionTerrazasAplicada=config=>config?.recursos?.cierreTerrazas==='bloques';
// Al día: ya tiene esta misma referencia. Una composición aplicada con una referencia anterior se puede actualizar desde el creador.
export const composicionTerrazasAlDia=config=>composicionTerrazasAplicada(config)&&config.recursos.composicionTerrazas===COMPOSICION_TERRAZAS;
function ajustarDegradePortada(portada){
  const o=portada?.opciones;
  if(!o || o.degradeActivo==='no' || (o.degradeColor && o.degradeColor!=='negro'))return;
  if(Number(o.degradeAltura)===70 && Number(o.degradeArriba)===37 && Number(o.degradeAbajo)===14){
    Object.assign(o,{degradeAltura:55,degradeArriba:18,degradeAbajo:0});
  }
}
const ALBUMES_COMARCA=[
  ['Lagos y ríos',['c61ee28dead7c964','2980d1b50a912370','ac82dae29207022f','e2b9f604078ff8e5']],
  ['Montaña y nieve',['0be483c6d44d4d87','7b61fccdd4f0862d','5cc979b726b0eb41','0414b5cd3bd2d56e']],
  ['Pesca y aire libre',['a24a7211062faa15','2243e07b50dd79cf','bc5f75c516ca4648','45fd2312e0d4a358']],
  ['Bosque y fauna',['c318e4049325a195','e74a90a5fd1108a7','874a44205e1c833e']],
  ['Caminos y pueblos',['3c96aa7b32c90f79','2b1ef1c260b986b6','a0da53d3615df1df']],
  ['Sabores de la Comarca',['65d310a82343603a','d35c0164bb2fa940','9b4057fb27d52781']]
];
const TEXTO_PROYECTO=[
  'Terrazas del Piltriquitrón es un desarrollo residencial de 80 lotes ubicado sobre la calle Islas Malvinas, en el área céntrica de El Bolsón. A pocas cuadras de la avenida San Martín y de la Plaza Pagano, el barrio ofrece lotes con vista directa al cerro Piltriquitrón.',
  'La urbanización incluye la instalación subterránea de las redes de servicios (luz, gas, agua, cloacas y fibra óptica). El barrio cuenta con un código de edificación que ordena su crecimiento. Cada lote admite hasta dos unidades, para vivienda permanente, residencia familiar o inversión.',
  'Las obras se encuentran en marcha, con un avance aproximado del 70 %. El proyecto ofrece planes de financiación.'
].join('\n\n');
// La foto de «El proyecto» se busca por su clave dentro de las fotos del propio proyecto: cada entorno guarda sus medios en otra dirección.
// Es la misma fotografía con dos nombres: el del banco del proyecto en QA y en producción, y el del respaldo local.
const FOTO_PROYECTO=['1794711682075-xb77j4wkq4i','167e03b4495662fce04b1a82'];
export function aplicarComposicionTerrazas(original, project, contextPhotos=[]) {
  if(project?.slug!=='terrazas-del-piltri' || original?.estilo!=='inmersivo' || composicionTerrazasAlDia(original))return {config:original,aplicada:false,faltantes:[]};
  if(composicionTerrazasAplicada(original) && original.recursos.composicionTerrazas===COMPOSICION_ANTERIOR){
    const config=structuredClone(original);
    ajustarDegradePortada(config.bloques?.find(b=>b.tipo==='portada'));
    config.recursos.composicionTerrazas=COMPOSICION_TERRAZAS;
    return {config,aplicada:true,faltantes:[]};
  }
  const config=configuracionTerrazas(original,project),faltantes=[];
  const section=type=>config.bloques.find(b=>b.tipo===type && (type!=='panoramica360' || b.variante==='recorrido'));
  if(!section('experiencias'))config.bloques.push({id:'experiencias-comarca',tipo:'experiencias',variante:'albumes',activo:true,fuente:'editorial',contenido:{},opciones:{}});
  const order=['portada','foto-texto','cifras','financiacion','servicios','panoramica360','explorador','galeria','experiencias','ubicacion','contacto','comercializacion'];
  for(const type of order)if(!section(type))faltantes.push('bloque '+type);
  const active=order.map(section).filter(Boolean),inactive=config.bloques.filter(b=>!active.includes(b));
  for(const b of active){
    b.activo=true;b.opciones={...b.opciones};b.contenido={...b.contenido};
    if(!['portada','comercializacion'].includes(b.tipo))Object.assign(b.opciones,{tituloSeccion:44,espacioArriba:136,espacioAbajo:136,espacioArribaMovil:40,espacioAbajoMovil:40});
  }
  // En estas uniones, cada bloque aporta la mitad del espacio entre piezas del mismo tema.
  for(const [first,second] of [['cifras','financiacion'],['financiacion','servicios']]){
    if(!section(first)||!section(second))continue;
    Object.assign(section(first).opciones,{espacioAbajo:24,espacioAbajoMovil:16});
    Object.assign(section(second).opciones,{espacioArriba:24,espacioArribaMovil:16});
  }
  for(const b of inactive)b.activo=false;
  const last=active.find(b=>b.tipo==='comercializacion');
  config.bloques=[...active.filter(b=>b!==last),...inactive,...(last?[last]:[])];
  config.controlBloques=1;config.medio='video';config.videoActivo=true;
  const edit=(type,change)=>{const b=section(type);if(b)change(b)};
  edit('portada',b=>{Object.assign(b.opciones,{medio:'video',autoplay:'si'});ajustarDegradePortada(b);b.contenido.titulo='Lotes en El Bolsón, Río Negro'});
  edit('foto-texto',b=>{
    b.variante='foto-izquierda';
    Object.assign(b.opciones,{varianteManual:true,photoSize:50,enlaceLotes:'no',efectoFoto:'hover',efectoEntrada:'titulos',efectoDuracion:700});
    Object.assign(b.contenido,{titulo:'El proyecto:',texto:TEXTO_PROYECTO,alt:'Vista aérea del loteo y de la cordillera en El Bolsón',rotulo:''});
    const bank=[...(project.fotos||[]),...(project.media_bank||[]).map(item=>item?.url)].filter(url=>typeof url==='string');
    const photo=FOTO_PROYECTO.map(key=>bank.find(url=>url.includes(key))).find(Boolean);
    if(photo)b.contenido.imagen=photo;else faltantes.push('foto de «El proyecto» ('+FOTO_PROYECTO.join(' o ')+') en las fotos del proyecto');
  });
  edit('servicios',b=>{b.contenido={titulo:'Servicios',serviciosPropios:'Luz, Agua, Gas, Cloacas, Fibra óptica'};b.variante='fichas';b.opciones.varianteManual=true});
  edit('cifras',b=>{b.contenido.titulo='Precio y forma de pago';Object.assign(b.contenido,{rotulo_precio:'Precio',rotulo_superficies:'Superficie de los lotes'});b.opciones.cifras=['precio','superficies'];b.opciones.grupoOferta='si'});
  edit('financiacion',b=>{
    b.contenido.titulo='Financiación';
    // Pares editoriales aprobados sólo para la oferta con la que se aprobaron. Con otro texto de financiación no se escribe ningún importe.
    if(project.financiacion==='Entrega de USD 28.000 y saldo de USD 12.000 en 8 cuotas fijas de USD 1.500.')Object.assign(b.contenido,{planValor1:'USD 28.000',planEtiqueta1:'Entrega inicial',planValor2:'USD 1.500',planEtiqueta2:'8 cuotas fijas de',planValor3:'USD 12.000',planEtiqueta3:'Saldo financiado'});
    else faltantes.push('plan de pagos en cifras (el texto de financiación del proyecto no coincide con el aprobado)');
  });
  edit('panoramica360',b=>{b.contenido.titulo='Recorra el terreno en 360°';b.contenido.texto=''});
  edit('explorador',b=>{b.contenido.titulo='Elija su lote';b.opciones.estadosPlano='regla'});
  edit('galeria',b=>{b.contenido.titulo='“El loteo”';b.variante='album';Object.assign(b.opciones,{varianteManual:true,efectoFoto:'hover',efectoDuracion:700})});
  edit('experiencias',b=>{
    const bank=new Map(contextPhotos.map(photo=>[photo.id,photo])),photos=[];
    for(const [experiencia,ids] of ALBUMES_COMARCA)for(const id of ids){const photo=bank.get('contexto-'+id);if(photo)photos.push({url:photo.url,alt:photo.nombre,pie:photo.nombre,experiencia});else faltantes.push('foto de «'+experiencia+'» ('+id+')')}
    b.contenido={titulo:'Vivir en la Comarca',fotos:photos};
    Object.assign(b.opciones,{varianteManual:true,efectoFoto:'hover',efectoDuracion:700,cantidadFotos:photos.length});
  });
  // Cierre: primero «Dónde queda» con el mapa apaisado y debajo la consulta en tarjeta. Dos bloques independientes.
  const mapa=section('ubicacion'),contacto=section('contacto');
  if(mapa){mapa.variante='mapa';Object.assign(mapa.opciones,{varianteManual:true,formatoMapa:'apaisado'});mapa.contenido.titulo='Dónde queda';mapa.contenido.texto=mapa.contenido.texto||[project.ciudad,project.provincia].filter(Boolean).join(', ')}
  if(contacto)Object.assign(contacto.opciones,{formatoConsulta:'tarjeta',mapaContacto:'no'});
  if(mapa&&contacto&&config.bloques.indexOf(mapa)>config.bloques.indexOf(contacto)){config.bloques.splice(config.bloques.indexOf(mapa),1);config.bloques.splice(config.bloques.indexOf(contacto),0,mapa)}
  config.recursos={...config.recursos,cierreTerrazas:'bloques',composicionTerrazas:COMPOSICION_TERRAZAS};
  return {config,aplicada:true,faltantes};
}

// Presentación inicial de los bloques existentes. Los títulos y fotos editados
// en el creador tienen preferencia sobre los valores editoriales iniciales.
export function configuracionTerrazas(original, project) {
  if(original?.recursos?.presentacionLotes)return structuredClone(original);
  const config=structuredClone(original);
  const composicionAprobada=config.recursos?.cierreTerrazas==='bloques';
  const byId=new Map((config.bloques || []).map(block=>[block.id,block]));
  const block=id=>byId.get(id);
  const title=(id,value,previous='')=>{
    const b=block(id);
    if(b && (b.contenido.titulo || '')===previous)b.contenido.titulo=value;
  };
  title('portada-1','Lotes en El Bolsón, Río Negro');
  const cifras=block('cifras-1');
  if(cifras && !cifras.opciones.cifras)cifras.opciones.cifras=['precio','superficies','total'];
  title('bloque-58e67cf3','Recorra el terreno en 360°','RECORRIDO INMERSIVO');
  const recorrido=block('bloque-58e67cf3');
  if(recorrido && !composicionAprobada)recorrido.contenido.texto ||= 'El loteo está cerca del Arroyo Negro y tiene vistas a la cordillera.';
  title('explorador-1','Elija su lote');
  const selector=block('explorador-1');
  if(selector&&!Object.hasOwn(selector.contenido,'texto'))selector.contenido.texto='Elija un lote en el plano o en la lista para ver su precio y superficie.';
  title('galeria-1','“El loteo”');
  const gallery=block('galeria-1');
  const photos=project.fotos || [];
  if(gallery && !gallery.contenido.fotos?.length && photos.length){
    const order=photos.length===9?[2,3,1,0,4,7,8,5,6]:photos.map((_,i)=>i);
    gallery.contenido.fotos=order.map(i=>{
      const photo=typeof photos[i]==='string'?{url:photos[i]}:{...photos[i]};
      return {...photo,alt:photo.alt || (photos.length===9?captions[i]:'') || project.nombre,pie:'',mostrarPie:'no'};
    });
    Object.assign(gallery.opciones,{textosCabecera:'si',textosFotos:'ocultos',cantidadFotos:photos.length});
  }
  for(const id of ['foto-texto-1','ficha-tecnica-1','servicios-1']){
    const b=block(id);
    if(b && !b.contenido.titulo && !b.contenido.texto)b.activo=false;
  }
  title('financiacion-1','Financiación');
  title('contacto-1','Consulte a Sur Patagonian');
  // La disposición nueva adelanta sólo las cifras que estaban después del recorrido.
  const blocks=config.bloques;
  if(!composicionAprobada && cifras && recorrido && blocks.indexOf(cifras)>blocks.indexOf(recorrido)){
    blocks.splice(blocks.indexOf(cifras),1);
    blocks.splice(blocks.indexOf(recorrido),0,cifras);
  }
  return config;
}
    export function presentarComercial(root,project,lots,{signal}={}){
      const app=root.querySelector('.miniweb');
      if(!app||app.dataset.presentacion==='estilo'||app.hasAttribute('data-comercial-montada'))return;
      app.dataset.comercialMontada='';app.dataset.propuesta='';
      const style=document.createElement('style');
      style.textContent=estilos;root.append(style);
      const section=type=>app.querySelector('[data-block-type="'+type+'"]');
      const recorrido=section('panoramica360');
      const tourNav=section('portada')?.querySelector('.nav-links [data-aerial-tour],.nav-links a[href*="/recorrido"]');
      if(tourNav && recorrido){
        tourNav.href='#'+recorrido.id;
        tourNav.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();recorrido.scrollIntoView({block:'start'});});
      }
      const gallery=section('galeria');
      const grid=gallery?.querySelector('.photo-grid');
      if(grid)grid.id='fotos-terrazas';
      section('portada')?.querySelectorAll('.scroll,[data-scroll-cue]').forEach(cue=>cue.remove());
      const strip=section('cifras'),groups=strip?.querySelectorAll('.shell>div');
      const finance=section('financiacion');
      if(!strip?.hasAttribute('data-oferta') && groups?.length===3 && groups[0].querySelector('span')?.textContent.includes('precio') && groups[2].querySelector('span')?.textContent.includes('total')){

      if(Number(project.precio_desde)===Number(project.precio_hasta))groups[0].querySelector('span').textContent='por lote';
      groups[1].querySelector('span').textContent='Superficie de los lotes';
      groups[2].querySelector('strong').textContent='Financiación';
      groups[2].querySelector('span').remove();
      if(finance){
      const paymentLink=document.createElement('a');
      paymentLink.href='#'+finance.id;paymentLink.className='enlace-financiacion';
      paymentLink.textContent='Ver entrega y cuotas';
      groups[2].append(paymentLink);
      }
      }
      if(!finance?.querySelector('.finance-plan') && !finance?.hasAttribute('data-oferta') && finance?.querySelector('.finance-options') && project.financiacion?.trim()==='Entrega de USD 28.000 y saldo de USD 12.000 en 8 cuotas fijas de USD 1.500.' && Number(project.precio_desde)===40000 && Number(project.precio_hasta)===40000){
      const payments=document.createElement('dl');payments.className='pagos';
      for(const [title,value] of [['Entrega inicial','USD 28.000'],['8 cuotas fijas de','USD 1.500']]){
        const group=document.createElement('div'),label=document.createElement('dt'),amount=document.createElement('dd');
        label.textContent=title;amount.textContent=value;group.append(label,amount);
        payments.append(group);
      }
      const summary=document.createElement('p');
      summary.className='payment-summary';
      summary.textContent='USD 40.000 por lote · Saldo financiado USD 12.000';
      finance.querySelector('.finance-options').replaceWith(payments,summary);
      }
      instalarInteracciones(root,project,rotularLotesTerrazas(project.slug,lots),{signal});
      // The public renderer uses a shadow root. Direct these new links to that tree.
      app.addEventListener('click',event=>{
        const anchor=event.target.closest('a[href^="#"]');
        if(!anchor||!anchor.matches('.enlace-financiacion,.hero-actions .primary'))return;
        const target=root.getElementById(anchor.hash.slice(1));
        if(target){event.preventDefault();target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}
      });
    }
export const presentarTerrazas=presentarComercial;
function presentarFichaSelector(root,project,{signal,sheet,onConsult}={}){
  const observe=(callback,target,options)=>{const observer=new MutationObserver(callback);observer.observe(target,options);signal?.addEventListener('abort',()=>observer.disconnect(),{once:true});return observer};
  const selector = root.querySelector('.approved-selector-host')?.shadowRoot;
  if (selector) {
    const card = selector.querySelector('.card');
    const selectorHost = selector.host;
    const syncSheet = () => selectorHost.toggleAttribute('data-detail-open', Boolean(sheet?.open));
    if(sheet)observe(syncSheet,sheet,{attributes:true,attributeFilter:['open']});
    syncSheet();
    const selectorStyle = document.createElement('style');
    selectorStyle.textContent = `
      :host([data-detail-open]) .sel .card.show {visibility:hidden!important;pointer-events:none}
      .sel .chips [hidden] {display:none!important}
      .sel .card.show .top {display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 10px}
      .sel .card.show .top .x {position:static;grid-column:1;grid-row:1;justify-self:start;width:44px;height:44px}
      .sel .card .top .st {grid-column:2;grid-row:1;justify-self:end}
      .sel .card .st[data-available]{background:none;border:0;padding:0;color:#34d17f;font-size:20px;font-weight:800;letter-spacing:-.025em;text-transform:uppercase}
      .sel .card .st[data-available] i{display:none}
      .sel .card .acts .card-finance{grid-column:1/-1;margin:0;font-size:16px;font-weight:650}
      .sel .card .top .lot-name {grid-column:1;grid-row:2;min-width:0;margin:0;
        font-size:16px;font-weight:600;line-height:1.24;letter-spacing:-.02em}
      .sel .card .top .lot-area {grid-column:2;grid-row:2;text-align:right;
        font-size:16px;font-weight:600;line-height:1.24;white-space:nowrap}
      .sel .card .top .lot-zone {grid-column:1/-1;grid-row:3;width:max-content;margin:0}
      .sel .card .sale-metrics {display:flex;align-items:baseline;justify-content:space-between;gap:8px;
        flex-wrap:wrap;margin:14px 0 8px}
      .sel .card .sale-price {font-size:clamp(32px,3vw,40px);font-weight:750;letter-spacing:-.035em}
      .sel .card .sale-unit {font-size:14px}
      .sel .card .acts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0}
      .sel .card .acts [data-action="consult"] {grid-column:1/-1;min-height:50px;font-weight:700;font-size:19px}
      .sel .card .acts .reservation-note {grid-column:1/-1;font:inherit;font-size:14px;
        line-height:1.4;margin:0 0 4px;color:inherit}
      /* Caja y jerarquía aprobadas para las fichas del plano fotográfico. */
      .sel[data-estados=regla].photo-plan:not([data-list-only=true]) .card.show {
        --sheet-pad:32px;--sheet-height:469px;--sheet-secondary:50px;
        box-sizing:border-box;height:min(var(--sheet-height),calc(100% - 72px));max-height:none;
        width:min(480px,calc(100% - var(--list-width,0px) - 130px));padding:var(--sheet-pad);
        border:1px solid rgba(255,255,255,.12);border-radius:18px;
        background:rgba(14,19,17,.55);box-shadow:none;backdrop-filter:blur(26px) saturate(1.1);
        color:var(--ink);font:400 15px/1.4 Inter,system-ui,sans-serif;overflow:auto
      }
      .sel[data-estados=regla] .card.show .top {row-gap:14px;padding-bottom:24px;border-bottom:1px solid #ffffff24}
      .sel[data-estados=regla] .card.show .top .lot-name,
      .sel[data-estados=regla] .card.show .top .lot-area {font-size:clamp(17px,1.25vw,18px);font-weight:600}
      .sel[data-estados=regla] .card.show .top .st[data-available],
      .sel[data-estados=regla] .card.show:has([data-action="available"]) .top .st {
        color:#34d17f;font-size:clamp(22px,1.67vw,24px);font-weight:600;letter-spacing:-.025em;
        text-transform:uppercase;background:transparent;border:0;padding:0
      }
      .sel[data-estados=regla] .card.show:has([data-action="available"]) .top .st {color:#dc403c}
      .sel[data-estados=regla] .card.show:has([data-action="available"]) .st i {display:none}
      .sel[data-estados=regla] .card.show .sale-metrics {
        justify-content:space-between;flex-wrap:wrap;gap:8px;margin:24px 0 8px;padding:0;border:0
      }
      .sel[data-estados=regla] .card.show .sale-price {
        font-size:36px;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums
      }
      .sel[data-estados=regla] .card.show .sale-unit {font-size:15px;font-weight:400}
      .sel[data-estados=regla] .card.show .card-finance {margin:0 0 28px;font-size:15px;font-weight:400;line-height:1.4}
      .sel[data-estados=regla] .card.show .acts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .sel[data-estados=regla] .card.show .acts .btn {
        min-width:0;min-height:48px;height:var(--sheet-secondary,50px);justify-content:center;
        padding:0 16px;border-radius:10px;font:600 15px/1.2 Inter,system-ui,sans-serif;letter-spacing:0
      }
      .sel[data-estados=regla] .card.show .acts .btn.go {
        min-height:56px;height:56px;grid-column:1/-1;font-size:clamp(15px,4vw,16px);
        background:var(--pal-accion,var(--accent));border-color:var(--pal-accion,var(--accent));color:var(--pal-textoAccion,var(--accent-ink))
      }
      .sel[data-estados=regla] .card.show .acts [data-action="consult"] > :not(span) {display:none}
      .sel[data-estados=regla] .card.show .acts .btn:not(.go) {background:transparent;color:#ecedee;border:1px solid #ecedee99}
      .sel[data-estados=regla] .card.show .acts .btn:not(.go):hover {background:rgba(255,255,255,.1)}
      .sel[data-estados=regla] .card.show .acts [data-action="compare"] {display:none}
      .sel[data-estados=regla] .card.show .acts:not(:has([data-action="brochure"])) .btn:not([data-action]) {grid-column:1/-1}
      .sel[data-estados=regla] .card.show:has([data-action="available"]) {display:flex;flex-direction:column}
      .sel[data-estados=regla] .card.show:has([data-action="available"]) .acts {margin-top:auto;padding-bottom:calc(var(--sheet-secondary,50px) + 12px)}
      @media(max-width:900px) {
        .sel[data-estados=regla].photo-plan:not([data-list-only=true]) .card.show {
          --sheet-pad:18px;--sheet-height:450px;--sheet-secondary:48px;
          width:calc(100% - 24px);height:var(--sheet-height);max-height:none
        }
        .sel[data-estados=regla].photo-plan:is(:fullscreen,.tour-expanded):not([data-list-only=true]) .card.show {
          max-height:calc(100% - var(--selector-clear,24px))
        }
      }
      @media(max-width:365px) {
        .sel[data-estados=regla].photo-plan:not([data-list-only=true]) .card.show {--sheet-pad:12px;--sheet-height:474px}
        .sel[data-estados=regla] .card.show .acts .btn {padding-inline:6px}
      }
      @media(max-width:700px) {
        .sel[data-estados=regla] .card.show .top {grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 8px;padding-bottom:16px}
        .sel[data-estados=regla] .card.show .top .st {grid-column:2/-1}
        .sel[data-estados=regla] .card.show .top .lot-name {grid-column:1/4;font-size:14px}
        .sel[data-estados=regla] .card.show .top .lot-area {grid-column:4;font-size:14px}
        .sel[data-estados=regla] .card.show .top .st[data-available],
        .sel[data-estados=regla] .card.show:has([data-action="available"]) .top .st {font-size:18px}
        .sel[data-estados=regla] .card.show .sale-metrics {margin-top:16px}
        .sel[data-estados=regla] .card.show .sale-price {flex:0 0 auto;font-size:clamp(28px,8vw,32px);line-height:1.2}
        .sel[data-estados=regla] .card.show .sale-unit {flex:0 0 auto;font-size:13px;white-space:nowrap}
        .sel[data-estados=regla] .card.show .card-finance {font-size:14px;margin-bottom:20px}
        .sel[data-estados=regla] .card.show .acts .btn {font-size:14px;padding-inline:8px}
        .sel[data-estados=regla] .card.show .acts .btn.go {font-size:14px}
      }
      .sel[data-estados=regla] .card .solo-lectores {position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
        clip-path:inset(50%);white-space:nowrap}
      @media (max-width:900px) {
        .sel.photo-plan:not([data-list-only=true]) .card.show {max-height:calc(100% - var(--selector-clear,24px))}
        .sel.photo-plan .card.show .acts {display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media (max-width:365px) {
        .sel.photo-plan .card.show {padding:12px}
        .sel .card .acts .btn {min-width:0}
      }
    `;
    selector.append(selectorStyle);
    const chips = selector.querySelector('.chips');
    function showRelevantFilters() {
      chips.querySelectorAll('button[data-state]').forEach(button => {
        const count = Number(button.querySelector('b')?.textContent);
        button.hidden = Boolean(button.dataset.state) && count === 0;
      });
    }
    observe(showRelevantFilters,chips,{childList:true});
    showRelevantFilters();
    function improveSelection() {
      const action = card?.querySelector('[data-action="consult"]');
      const top = card?.querySelector('.top');
      if (!top || top.querySelector('.lot-name')) return;
      const identity = top.querySelector('h3').parentElement;
      const name = document.createElement('h3');
      name.className = 'lot-name';
      const rule = selector.querySelector('.sel')?.dataset.estados === 'regla';
      const block = identity.querySelector('h3').textContent, lotName = identity.querySelector('.big').textContent;
      name.textContent = (rule ? [lotName, block] : [block, lotName]).join(' · ');
      const zone = identity.querySelector('.zone-tag');
      // Maqueta final: bajo la regla, la ficha no repite la zona (ya está en la lista y en el plano).
      if (zone) { if (rule) zone.remove(); else { zone.classList.add('lot-zone'); top.append(zone); } }
      identity.replaceWith(name);
      const facts = card.querySelector('.kv');
      const sold = !!card.querySelector('[data-action="available"]');
      const values = [...facts.querySelectorAll('dd')].map(value => value.textContent);
      const [price, area, unit] = sold ? ['', values[0], ''] : values;
      const surface = document.createElement('strong');
      surface.className = 'lot-area';
      surface.textContent = area;
      surface.setAttribute('aria-label','Superficie: ' + area);
      top.append(surface);
      if (sold) { facts.remove(); return; }
      const metrics = document.createElement('div');
      metrics.className = 'sale-metrics';
      const amount = document.createElement('strong'), perMetre = document.createElement('span');
      amount.className = 'sale-price'; amount.textContent = price;
      amount.setAttribute('aria-label','Precio del lote: ' + price);
      perMetre.className = 'sale-unit'; perMetre.textContent = unit && unit !== '—' ? unit + ' / m²' : '';
      metrics.append(amount, perMetre); facts.replaceWith(metrics);
      if (!action || card.querySelector('.st')?.textContent.trim() !== 'Disponible') return;
      const availability = card.querySelector('.st');
      availability.dataset.available='';
      action.dataset.propuesta = 'reserva';
      action.querySelector('span').textContent = 'QUIERO RESERVAR ESTE LOTE';
      const note = document.createElement('p');
      note.className = 'reservation-note';
      note.id = 'selector-reservation-note';
      note.textContent = 'Se abre una consulta con Sur Patagonian para coordinar la reserva.';
      action.setAttribute('aria-describedby', note.id);
      const financing = document.createElement('p');
      financing.className = 'card-finance';
      // Maqueta final: la forma de pago va en una línea, arriba del botón; la aclaración queda sólo para lectores de pantalla.
      const plan = rule && /Entrega de (USD \d[\d.]*\d) y saldo de USD [\d.]+ en (\d+) cuotas fijas de (USD \d[\d.]*\d)/.exec(project?.financiacion || '');
      financing.textContent = plan ? 'Entrega ' + plan[1] + ' + ' + plan[2] + ' cuotas de ' + plan[3] : 'Con financiación';
      if (rule) { note.classList.add('solo-lectores'); metrics.after(financing); action.after(note); }
      else action.after(financing,note);
    }
    if (card) {
      observe(improveSelection,card,{childList:true});
      improveSelection();
    }
    selector.addEventListener('click', event => {
      const action = event.target.closest('[data-action="consult"], [data-compare-consult]');
      if (!action) return;
      // El selector nativo fija el ID público antes de enfocar el formulario.
      setTimeout(() => {
        onConsult?.(action.dataset.propuesta);
      }, 0);
    }, true);
  }
}

function instalarInteracciones(root, project, lots, {signal}={}) {
  const observe=(callback,target,options)=>{const observer=new MutationObserver(callback);observer.observe(target,options);signal?.addEventListener('abort',()=>observer.disconnect(),{once:true});return observer};
  const element = id => root.getElementById(id);
  const form = element('contactForm');
  const message = element('contactMessage');
  const inquiry = root.querySelector('[data-block-type="contacto"]');
  const byId = new Map(lots.map(lot => [lot.id, lot]));
  const theme = typeof project.tema === 'string' ? JSON.parse(project.tema) : project.tema;
  const publicIds = new Map(lots.map(lot => [theme?.miniweb?.lotes?.[lot.id]?.idEnlace || lot.id, lot]));
  const hasInquiry=Boolean(inquiry?.querySelector('.contact-side')&&inquiry.querySelector('.contact-invitation h2')&&form);
  const drafts = new Map();
  let activeLot = null;
  const sheet = root.querySelector('.lot-sheet');
  const style = document.createElement('style');
  style.textContent = `
    .miniweb.sale #imageDialog {position:fixed}
    .miniweb.sale #imageDialog .gallery-turn {
      position:absolute;top:55%;transform:translateY(-50%);display:grid;
      place-items:center;width:48px;height:48px;border:1px solid #ffffff70;
      border-radius:50%;background:#152624d9;color:white;cursor:pointer;
      font:400 28px/1 var(--sans)
    }
    .miniweb.sale #imageDialog .gallery-turn[hidden] {display:none}
    .miniweb.sale #imageDialog .gallery-turn.prev {left:12px}
    .miniweb.sale #imageDialog .gallery-turn.next {right:12px}
    .miniweb.sale .sheet-actions {align-items:center}
    .miniweb.sale .lot-sheet .sheet-actions>[data-consult] {
      background:var(--ink);border:1px solid var(--ink);color:var(--bg);
      font:650 15px/1.3 var(--sans);min-height:48px;padding:12px 22px;
      cursor:pointer
    }
    .miniweb.sale .sheet-inquiry-note {font:400 15px/1.5 var(--sans);margin:12px 0 0}
    @media(max-width:700px) {
      .miniweb.sale .lot-sheet .sheet-actions>[data-consult] {width:100%}
    }`;
  root.append(style);

  const lightbox = element('imageDialog');
  const counter=document.createElement('span');counter.className='album-count';
  counter.setAttribute('aria-live','polite');lightbox.append(counter);
  let touchStart=null;
  lightbox.addEventListener('touchstart',e=>{touchStart=e.touches.length===1?e.touches[0]:null},{passive:true});
  lightbox.addEventListener('touchend',e=>{
    if(!touchStart || !photos.length)return;
    const dx=e.changedTouches[0].clientX-touchStart.clientX,dy=e.changedTouches[0].clientY-touchStart.clientY;
    if(Math.abs(dx)>48 && Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);
    touchStart=null;
  },{passive:true});
  let photos = [];
  let index = 0;
  function step(delta) {
    if (photos.length < 2) return;
    index = (index + delta + photos.length) % photos.length;
    counter.textContent=(index+1)+' / '+photos.length;
    const button = photos[index];
    const caption = button.closest('figure')?.querySelector('figcaption')?.textContent.trim();
    const title = caption || button.dataset.imageTitle || project.nombre;
    element('expandedImage').src = button.dataset.image;
    element('expandedImage').alt = button.querySelector('img')?.alt || title;
    element('imageTitle').textContent = title;
  }
  const turns = [-1, 1].map(delta => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-turn ' + (delta < 0 ? 'prev' : 'next');
    button.setAttribute('aria-label', delta < 0 ? 'Foto anterior' : 'Foto siguiente');
    button.textContent = delta < 0 ? '‹' : '›';
    button.hidden = true;
    button.addEventListener('click', () => step(delta));
    lightbox.append(button);
    return button;
  });
  lightbox.addEventListener('keydown', event => {
    if (!photos.length || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  });
  lightbox.addEventListener('close', () => {
    photos = [];
    turns.forEach(button => { button.hidden = true; });
  });
  root.addEventListener('click', event => {
    const image = event.target.closest('[data-image]');
    if (!image) return;
    const gallery = image.closest('[data-block-type="galeria"], [data-block-type="asi-se-vive"]');
    photos = gallery ? Array.from(gallery.querySelectorAll('button[data-image]')) : [];
    lightbox.toggleAttribute('data-album', Boolean(gallery));
    index = photos.indexOf(image);
    counter.textContent=photos.length?(index+1)+' / '+photos.length:'';
    turns.forEach(button => { button.hidden = photos.length < 2; });
  }, true);

  function improveSheet() {
    const action = sheet.querySelector('.sheet-actions [data-consult-lot]');
    const lot = byId.get(action?.dataset.consultLot);
    if (!lot || lot.estado !== 'disponible' || action.dataset.propuesta) return;
    action.dataset.propuesta = 'reserva';
    action.textContent = 'QUIERO RESERVAR ESTE LOTE';
    action.parentElement.prepend(action);
    const note = document.createElement('p');
    note.className = 'sheet-inquiry-note';
    note.textContent = 'Se abre una consulta con Sur Patagonian para coordinar la reserva.';
    action.parentElement.after(note);
  }
  observe(improveSheet,sheet,{childList:true,subtree:true});
  improveSheet();
  if(!hasInquiry){presentarFichaSelector(root,project,{signal,sheet});return;}

  function showInquiryHeading() {
    const nav = root.querySelector('.project-nav');
    const navTop = nav ? parseFloat(getComputedStyle(nav).top) || 0 : 0;
    formHeading.style.scrollMarginTop = Math.max(0, navTop + (nav?.offsetHeight || 0)) + 16 + 'px';
    formHeading.scrollIntoView({block:'start', behavior:'instant'});
  }
  function startDraft(lot, goal) {
    activeLot = lot;
    const saved = drafts.get(lot.id);
    const nombre = inquiry.hasAttribute('data-consulta-tarjeta')
      ? String(lot.numero ?? '').replace(/^(Manzana [^·]+?)\s*·\s*(Lote .+)$/i,'$2 · $1') : lot.numero;
    formHeading.textContent = goal === 'reserva' ? 'Coordine su reserva' : 'Consulte por este lote';
    element('contactLotLabel').hidden = false;
    element('contactLotNumber').value = nombre;
    message.value = saved ?? (goal === 'reserva'
      ? 'Quisiera coordinar la reserva de ' + nombre + ' de ' + project.nombre + '.'
      : 'Quisiera información sobre ' + nombre + ' de ' + project.nombre + '.');
    check.checked = message.value.split('\n').includes(visitLine);
    showInquiryHeading();
  }
  message.addEventListener('input', () => drafts.set(activeLot?.id || '', message.value));
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-consult-lot]');
    if (button) {
      const lot = byId.get(button.dataset.consultLot);
      if (lot) setTimeout(() => startDraft(lot, button.dataset.propuesta), 0);
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link || !inquiry || link.hash !== '#' + inquiry.id) return;
    if (!activeLot && !drafts.has('')) {
      setTimeout(showInquiryHeading, 0);
      return;
    }
    // Volver al formulario conserva el lote y el borrador actual.
    event.preventDefault();
    event.stopPropagation();
    showInquiryHeading();
    form.elements.nombre.focus({preventScroll:true});
  }, true);

  presentarFichaSelector(root,project,{signal,sheet,onConsult:goal=>{
    const id=new URL(location.href).searchParams.get('lote');
    const lot=publicIds.get(id)||byId.get(id);
    if(lot)startDraft(lot,goal);
  }});

  // El proyecto recibe la consulta. La visita es una opción del mensaje.
  const panel = inquiry.querySelector('.contact-side');
  const formHeading = inquiry.querySelector('.contact-invitation h2');
  if (!formHeading.textContent.trim())formHeading.textContent = 'Consulte a Sur Patagonian';
  formHeading.id = 'titulo-consulta-terrazas';
  const help = document.createElement('p');
  help.className = 'contact-help';
  help.textContent = 'Sur Patagonian recibirá su consulta y hará el seguimiento.';
  const nativeTitle=panel.querySelector('.contact-form-title');
  if(nativeTitle)nativeTitle.hidden=true;
  panel.prepend(formHeading, help);
  inquiry.querySelector('.contact-invitation').remove();
  form.setAttribute('aria-labelledby',formHeading.id);
  form.prepend(element('contactLotLabel'));
  const phone=form.elements.telefono,email=form.elements.email;
  // El correo es obligatorio en todo formulario de consulta (regla 11 de las miniwebs, orden de Mariano): es la base del registro.
  phone.required=true;email.required=true;
  email.closest('label').firstChild.textContent='Correo electrónico';
  const visit = document.createElement('label');
  visit.className = 'visit-option';
  const check = document.createElement('input');
  check.type = 'checkbox';
  visit.append(check, document.createTextNode('Me interesa visitar este lote'));
  const visitLine = 'También quisiera coordinar una visita.';
  check.addEventListener('change', () => {
    const lines = message.value.split('\n').filter(line => line !== visitLine);
    message.value = lines.join('\n').trimEnd();
    if (check.checked) message.value += (message.value ? '\n\n' : '') + visitLine;
    message.dispatchEvent(new Event('input', {bubbles:true}));
  });
  message.addEventListener('input', () => { check.checked = message.value.split('\n').includes(visitLine); });
  message.closest('label').after(visit);

  const contactStyle = document.createElement('style');
  contactStyle.textContent = `
    .miniweb.sale[data-style-body][data-palette][data-propuesta] section.contacto {
      display:block;box-sizing:border-box;padding:clamp(32px,5vw,80px) var(--gutter)!important}
    .miniweb.sale[data-style-body][data-palette][data-propuesta] .contact-side {
      width:min(760px,100%);margin:auto;box-sizing:border-box;padding:clamp(20px,4vw,55px)!important}
    .miniweb.sale[data-style-body][data-palette][data-propuesta] .contact-side h2 {
      font:400 clamp(32px,3.5vw,56px)/1.09 var(--display);letter-spacing:-.03em;max-width:none;
      margin:0 0 12px;color:var(--ink);text-wrap:balance}
    .miniweb.sale[data-style-body][data-palette][data-propuesta] .contact-help {
      font:400 17px/1.5 var(--sans);margin:0 0 24px;max-width:54ch;color:var(--ink)}
    .miniweb.sale[data-propuesta] #contactForm .visit-option {display:flex;align-items:center;
      flex-direction:row;gap:10px;min-height:44px;cursor:pointer;text-transform:none;
      letter-spacing:normal;color:var(--ink);font:500 16px/1.4 var(--sans)}
    .miniweb.sale[data-propuesta] #contactForm .visit-option input {inline-size:19px;block-size:19px;
      min-height:0;flex:none;appearance:auto;accent-color:var(--ink);margin:0;padding:0}
    .miniweb.sale[data-propuesta] #contactLotLabel:not([hidden]) {display:grid}
    .miniweb.sale[data-propuesta] .interactive-section-heading .offer-summary {
      font:600 clamp(17px,1.4vw,21px)/1.4 var(--sans);color:var(--ink);margin:8px 0}
  `;
  root.append(contactStyle);
  root.addEventListener('miniweb-consulta', event => {
    const href = event.detail?.href;
    if (!href) return;
    const url = new URL(href, location.href);
    const lot = publicIds.get(url.searchParams.get('lote')) || byId.get(url.searchParams.get('lote'));
    if (lot && event.defaultPrevented) {
      const finish = () => startDraft(lot, lot.estado === 'disponible' ? 'reserva' : 'consulta');
      if (document.fullscreenElement) document.addEventListener('fullscreenchange', () => requestAnimationFrame(finish), {once:true});
      else setTimeout(finish, 0);
    }
  });

  const entry=new URL(location.href);
  if(entry.hash==='#consulta-lote'){
    const id=entry.searchParams.get('lote');
    const lot=publicIds.get(id)||byId.get(id);
    if(lot?.estado==='disponible' && !element('contactLotLabel').hidden)startDraft(lot,'reserva');
  }
}

export function presentarRecorridoTerrazas(doc, frame=null, root=null) {
    {
      const W = doc.defaultView;
      const initialStation = 'detalle-0323';
      const entry = new URL(frame?.src || doc.location.href, doc.location.href).searchParams;
      const parentEntry = frame && new URL(frame.ownerDocument.location.href).searchParams;
      const requestedView = entry.has('lote') || ['detalle','vista','revision'].some(key => entry.has(key) || parentEntry?.has(key));
      let entered = false;
      const css = doc.createElement('style');
      css.textContent = `
        .rg-tour .paso-visual {
          position:absolute; z-index:6; left:50%; transform:translateX(-50%);
          bottom:clamp(100px,17%,168px); display:flex; align-items:center; gap:12px;
          padding:11px 16px 11px 19px; min-height:48px; width:max-content;
          max-width:calc(100% - 40px); border-radius:2px; border:1px solid #ffffffa3;
          background:rgba(16,27,25,.92); color:white; cursor:pointer;
          font:600 16px/1.2 var(--tour-font,Inter,sans-serif); letter-spacing:0;
        }
        .rg-tour .paso-visual:focus-visible {outline:3px solid white; outline-offset:3px}
        .rg-tour .paso-visual:hover {background:#182925}
        .rg-tour .paso-visual:disabled, .rg-tour:has(.rg-card:not([hidden])) .paso-visual,
        .rg-tour:has(.rg-atlas:not([hidden])) .paso-visual,
        .rg-tour:has(.rg-locator:not([hidden])) .paso-visual {display:none}
        @media(max-width:760px){.rg-tour .paso-visual {bottom:clamp(104px,20%,140px);font-size:15px;min-height:46px}}
      `;
      css.textContent += `
        @media(min-width:761px){.rg-tour .rg-lot-card{width:min(380px,90%)}}
        .rg-tour .rg-lot-card .rg-card-heading{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:12px;padding-top:0}
        .rg-tour .rg-lot-card .rg-card-heading .rg-card-x{position:static;grid-column:1;grid-row:1;width:44px;height:44px;display:grid;place-items:center;margin:0;padding:0}
        .rg-tour .rg-lot-card .rg-card-heading .rg-availability{grid-column:2;grid-row:1;justify-self:end}
        .rg-tour .rg-lot-card .rg-availability[data-state=disponible]{background:none;border:0;padding:0;max-width:none;color:#176a40;text-transform:uppercase;font:800 20px/1.1 var(--tour-font)}
        html[data-photo-touch] .rg-tour .rg-lot-card .rg-availability[data-state=disponible]{color:#34d17f}
        .rg-tour .rg-lot-card .rg-availability::before{display:none}
        .rg-tour .rg-lot-card .rg-measures{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 0;margin:0}
        .rg-tour .rg-lot-card .rg-measures h3,.rg-tour .rg-lot-card .rg-measures .rg-area{font:600 16px/1.4 var(--tour-font);letter-spacing:0;margin:0;padding:0}
        .rg-tour .rg-lot-card .rg-measures h3 span{display:inline}
        .rg-tour .rg-lot-card .rg-measures h3 span+span::before{content:' '}
        .rg-tour .rg-lot-card .rg-measures .rg-area small{display:inline;color:inherit;font-size:1em}
        .rg-tour .rg-lot-card .rg-proposed-price{color:inherit;font:750 clamp(32px,3vw,40px)/1.1 var(--tour-font);letter-spacing:-.035em;margin:8px 0 12px}
        .rg-tour .rg-lot-card nav .rg-lot-inquiry{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;min-height:50px;font:700 19px/1.2 var(--tour-font)}
        html .rg-tour .rg-lot-card nav .rg-lot-inquiry{background:var(--rg-action,#d64218);color:var(--rg-action-text,#fff);border-color:var(--rg-action,#d64218)}
        .rg-tour .rg-lot-card nav .card-finance{font:650 16px/1.4 var(--tour-font);color:inherit;margin:8px 0 4px}
        .rg-tour .rg-lot-card .rg-card-visual{height:clamp(54px,10vh,90px)}
      `;
      css.textContent += ':root[data-photo-touch]:not([data-touch-exploring]) .rg-tour .paso-visual{visibility:hidden}';
      doc.head.append(css);

      function mountEntry() {
        const tour = doc.querySelector('.rg-tour');
        const selector = tour?.querySelector('footer select');
        const nativeNext = tour?.querySelector('footer [data-next]');
        if (!selector || !nativeNext || tour.hasAttribute('data-entrada-presentada')) return;
        tour.setAttribute('data-entrada-presentada','');
        let nativeState;
        if (!tour.hasAttribute('data-resumen-embebido')) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'paso-visual';
        button.innerHTML = 'Siguiente vista <svg aria-hidden="true" width="24" height="20" viewBox="0 0 24 20" fill="none"><path d="M2 10h19m-7-7 7 7-7 7" stroke="currentColor" stroke-width="1.7"/></svg>';
        button.addEventListener('click', () => nativeNext.click());
        // En móvil, la capa nativa que permite desplazar la página deja el iframe
        // inerte hasta el primer toque. El mismo control vive sobre esa capa.
        const hostStage = frame?.closest('.tour-embed');
        let mobileButton;
        if(hostStage && root){
        mobileButton = hostStage.ownerDocument.createElement('button');
        mobileButton.type = 'button';
        mobileButton.className = 'paso-visual-movil';
        mobileButton.innerHTML = button.innerHTML;
        hostStage.querySelector('.paso-visual-movil')?.remove();
        root.querySelector('style[data-paso-visual]') || (() => {
          const style = hostStage.ownerDocument.createElement('style');
          style.dataset.pasoVisual = '';
          style.textContent = `
            .miniweb .paso-visual-movil {display:none}
            .miniweb .tour-embed[data-touch-mode=page]>.paso-visual-movil:not(:disabled) {
              display:flex;align-items:center;gap:12px;position:absolute;z-index:9;left:50%;
              transform:translateX(-50%);bottom:clamp(104px,20%,140px);
              width:max-content;min-height:46px;padding:11px 16px 11px 19px;border-radius:2px;
              border:1px solid #ffffffa3;background:rgba(16,27,25,.92);color:white;
              font:600 15px/1.2 var(--sans,sans-serif);cursor:pointer;touch-action:manipulation
            }
            .miniweb .paso-visual-movil:focus-visible {outline:3px solid white;outline-offset:3px}
          `;
          root.append(style);
        })();
        mobileButton.addEventListener('click', () => nativeNext.click());
        hostStage.append(mobileButton);
        }
        const sync = () => {button.disabled=nativeNext.disabled;if(mobileButton)mobileButton.disabled=button.disabled};
        nativeState = new W.MutationObserver(sync);
        nativeState.observe(nativeNext, {attributes: true, attributeFilter: ['disabled']});
        sync();
        tour.append(button);
        }

        tour.addEventListener('close', () => nativeState?.disconnect(), {once:true});
        if (entered || requestedView || !Array.from(selector.options).some(option => option.value === initialStation)) return;
        entered = true;
        if (selector.value !== initialStation) {
          selector.value = initialStation;
          selector.dispatchEvent(new W.Event('change', {bubbles:true}));
        }
      }
      const arrival = new W.MutationObserver(mountEntry);
      arrival.observe(doc.body, {childList:true});
      mountEntry();
    }
    function presentTourCard(body) {
      const heading = body?.querySelector('.rg-card-heading');
      const close = body?.parentElement.querySelector(':scope > .rg-card-x');
      if (heading && close) heading.prepend(close);
      if (!body || body.querySelector('.rg-proposed-price')) return;
      const measures = body.querySelector('.rg-measures');
      if (!measures) return;
      const facts = body.querySelector('.rg-lot-facts');
      const label = facts && Array.from(facts.querySelectorAll('dt')).find(term => term.textContent === 'Precio');
      const source = label ? label.nextElementSibling : body.querySelector('details p');
      if (!source) return;
      const name = body.querySelector('.rg-card-heading h3');
      if (name) measures.prepend(name);
      const price = doc.createElement('p');
      price.className = 'rg-proposed-price';
      price.textContent = source.textContent;
      price.setAttribute('aria-label','Precio del lote: '+price.textContent);
      measures.after(price);
      label?.remove();
      source.remove();
      const action = body.querySelector('.rg-lot-inquiry');
      if (action && body.querySelector('.rg-availability')?.dataset.state === 'disponible') {
        action.textContent = 'QUIERO RESERVAR ESTE LOTE';
        const nav = action.parentElement;
        price.after(nav);
        const financing = doc.createElement('p');
        financing.className = 'card-finance';
        financing.textContent = 'Con financiación';
        action.after(financing);
      }
    }
    const watchedCards = new WeakSet();
    function watchCard(){
      const card=doc.querySelector('.rg-tour .rg-card');
      if(!card || watchedCards.has(card))return;
      watchedCards.add(card);
      const update=()=>{if(!card.hidden && card.classList.contains('rg-lot-card'))presentTourCard(card.querySelector('.rg-card-body'));};
      const observer=new MutationObserver(update);
      observer.observe(card,{childList:true});
      card.closest('.rg-tour').addEventListener('close',()=>observer.disconnect(),{once:true});
      update();
    }
    new MutationObserver(watchCard).observe(doc.body,{childList:true});
    watchCard();
  }
