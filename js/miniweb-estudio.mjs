// The approved Estudio composition uses the same block nodes, lot explorer and contact form
// as the editor. Only its editorial navigation, cover and photographs are styled here.
const noop = () => {};
const number = new Intl.NumberFormat('es-AR');

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function linkTo(document, target, label, className) {
  const link = element(document, 'a', className, label);
  link.href = '#' + target.id;
  return link;
}

function editorialNavigation(active) {
  const groups = [
    ['El proyecto', ['intro', 'foto-texto']],
    ['El lugar', ['perspectivas', 'foto-frase', 'par-fotos']],
    ['Lotes', ['explorador']],
    ['Dónde queda', ['ubicacion', 'galeria', 'asi-se-vive']]
  ];
  return groups.flatMap(([label, types]) => {
    const entry = types.map(type => active.find(({b}) => b.tipo === type)).find(Boolean);
    return entry ? [{label, target: entry.node}] : [];
  });
}

function addCover({node, b}, project, lots, explorer, append, coverMode) {
  const doc = node.ownerDocument;
  const text = b.contenido;
  const overlay = element(doc, 'div', 'estudio-cover');
  overlay.dataset.coverMedia = b.opciones?.medio || coverMode;
  const title = element(doc, 'h1', 'estudio-title');
  title.setAttribute('aria-label', project.nombre || '');
  const words = String(project.nombre || '').trim().split(/\s+/);
  // Like the reference, a two-word name has a deliberate two-line title.
  const split=words.length>1?Math.ceil(words.length/2):words.length;
  for (const part of words.length>1?[words.slice(0,split).join(' '),words.slice(split).join(' ')]:[words.join(' ')]) {
    const line=element(doc,'span','estudio-title-line');line.setAttribute('aria-hidden','true');line.append(element(doc,'span','estudio-title-word',part));title.append(line);
  }
  if (['degradeArriba','degradeAbajo','degradeAltura'].some(key => b.opciones?.[key] != null)) {
    overlay.dataset.customShade = 'true';
  }
  overlay.append(title);
  const actions = element(doc, 'div', 'estudio-cover-actions');
  if (explorer) actions.append(linkTo(doc, explorer, text.botonPrincipal || 'Ver los lotes disponibles', 'estudio-action'));
  overlay.append(actions);
  const details = element(doc, 'div', 'estudio-cover-details');
  const phrase = (text.titulo && text.titulo !== project.nombre ? text.titulo : project.tagline) || '';
  if (phrase) details.append(element(doc, 'p', 'estudio-phrase', phrase));
  const prices = lots.map(l => Number(l.precio_usd)).filter(n => n > 0);
  const areas = lots.map(l => Number(l.superficie_m2)).filter(n => n > 0);
  const from = Number(project.precio_desde) || (prices.length ? Math.min(...prices) : 0);
  const stats = element(doc, 'p', 'estudio-facts');
  if (from > 0) stats.append(element(doc, 'strong', '', 'desde USD ' + number.format(from)));
  const count = Number(project.cantidad_lotes) || lots.length;
  const min = areas.length ? Math.min(...areas) : Number(project.sup_min_m2);
  const max = areas.length ? Math.max(...areas) : Number(project.sup_max_m2);
  const range = min > 0 ? ' de ' + number.format(min) + (max > min ? ' a ' + number.format(max) : '') + ' m²' : '';
  const factText = count ? number.format(count) + (count === 1 ? ' lote' : ' lotes') + range : '';
  if (factText) stats.append(doc.createTextNode(factText));
  if (stats.textContent) details.append(stats);
  overlay.append(details);
  // On small screens the native player opens in its own dialog. Desktop uses
  // the renderer's existing pause/resume button for the inline video.
  const video = node.querySelector('#playHero');
  if (video && overlay.dataset.coverMedia === 'video') {
    const button = element(doc, 'button', 'estudio-video-action', 'Ver video');
    button.type = 'button';
    button.addEventListener('click', () => video.click());
    overlay.append(button);
  }
  append(node, overlay);
}

export function mountEstudio(app, {active, project, lots, media, editing = false, coverMode = 'foto'}) {
  if (app.dataset.styleBody !== 'estudio-vivo' || app.dataset.selectorOnly === 'true' || project.slug === 'aldea-los-huemules') return noop;
  app.classList.add('estudio-aprobado');app.dataset.estudioEditing=editing?'si':'no';
  const document = app.ownerDocument;
  const win = document.defaultView;
  const controller = new AbortController();
  const {signal} = controller;
  const added = [];
  const append = (parent, child) => { parent.append(child); added.push(child); };
  const hero = active.find(({b}) => b.tipo === 'portada');
  const explorer = active.find(({b}) => b.tipo === 'explorador')?.node;
  const widePhotos = active.filter(({b}) => b.tipo === 'foto-frase').map(({node}) => node);
  const destinations = editorialNavigation(active);
  if (hero) addCover(hero, project, lots, explorer, append, coverMode);

  const nav = app.querySelector('.project-nav');
  const links = nav?.querySelector('.nav-links');
  const partner=nav?.querySelector('.nav-partner');
  if(partner){
    const signature=element(document,'span','estudio-nav-signature'),mark=element(document,'img');
    mark.src='/assets/logos/picos-blanco.png';mark.alt='';mark.setAttribute('aria-hidden','true');
    signature.append(mark,element(document,'span','estudio-nav-wordmark','Sur Patagonian'));append(partner,signature);
  }
  const navName=nav?.querySelector('.identity-name'),nameSize=navName?.style.fontSize;
  const fitNavName=()=>{
    if(!navName)return;navName.style.removeProperty('font-size');
    if(win.innerWidth<=820&&navName.clientWidth>0&&navName.scrollWidth>navName.clientWidth){
      const size=parseFloat(win.getComputedStyle(navName).fontSize);
      navName.style.fontSize=(size*navName.clientWidth/navName.scrollWidth*.98)+'px';
    }
  };
  win.addEventListener('resize',fitNavName,{passive:true,signal});
  fitNavName();document.fonts?.ready.then(()=>{if(!signal.aborted)fitNavName()});
  if (links) {
    // The renderer owns the tour and contact destinations.
    const actions = [...links.children].filter(a => a.matches('.btn,[data-aerial-tour]'));
    links.replaceChildren(...destinations.map(({target, label}) => linkTo(document, target, label)), ...actions);
  }
  for (const {node, b} of active) {
    if (b.tipo === 'intro') {
      const photo = media(b.contenido.imagen);
      if (photo) {
        const figure = element(document, 'figure', 'estudio-intro-figure');
        const image = element(document, 'img');
        image.src = photo;
        image.loading = 'lazy';
        image.alt = b.contenido.alt || '';
        figure.append(image);
        if (b.contenido.pie) figure.append(element(document, 'figcaption', '', b.contenido.pie));
        append(node, figure);
      }
    }
    if (b.tipo === 'lista-fotografica') {
      const index = node.querySelector('.index-links');
      if (index) index.replaceChildren(...destinations.map(({target, label}, i) => {
        const link = linkTo(document, target, '', 'estudio-index-link');
        const number = element(document, 'span', 'estudio-index-no', String(i + 1).padStart(2, '0'));
        number.setAttribute('aria-hidden', 'true');
        const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
        arrow.setAttribute('class','estudio-index-arrow');arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('aria-hidden','true');path.setAttribute('d','M4 12h16m-6-6 6 6-6 6');arrow.append(path);
        link.append(number, element(document, 'span', '', label),arrow);
        return link;
      }));
    }
    if (b.tipo === 'foto-frase' && explorer) {
      append(node, linkTo(document, explorer, b.contenido.boton || 'Ver los lotes en el plano', 'estudio-action estudio-wide-action'));
    }
    if (b.tipo === 'contacto') {
      const ways = node.querySelector('.ways');
      if (ways?.childElementCount) {
        const details = element(document, 'details', 'estudio-contact-options');
        details.append(element(document, 'summary', '', 'Más opciones de contacto'));
        ways.before(details);
        details.append(ways);
      }
      // The editor's optional copy is preserved when the title stands alone.
      if (!b.contenido.texto) node.querySelector('.contact-invitation > p')?.remove();
    }
  }
  const reduced = win.matchMedia('(prefers-reduced-motion:reduce)');
  const heroOptions=hero?.b.opciones||{};
  for(const [attr,key] of [['estudioTitleMotion','estudioTituloMovimiento'],['estudioNavMotion','estudioBarraMovimiento'],['estudioLinkMotion','estudioSubrayadoMovimiento'],['estudioButtonMotion','estudioBotonMovimiento']])app.dataset[attr]=heroOptions[key]==='no'?'no':'si';
  const decorateAction=button=>{
    const circle=element(document,'span','estudio-action-circle');circle.setAttribute('aria-hidden','true');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');path.setAttribute('d','M4 12h16m-6-6 6 6-6 6');svg.append(path);circle.append(svg);append(button,circle);
  };
  app.querySelectorAll('.estudio-action,.contacto .form button[type=submit]').forEach(decorateAction);
  const reveal = new win.IntersectionObserver(entries => {
    for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('estudio-wide-open');reveal.unobserve(entry.target)}
  },{threshold:.35});
  for(const {b,node} of active.filter(({b})=>b.tipo==='foto-frase')){
    node.dataset.estudioRevealMotion=b.opciones?.estudioAperturaMovimiento==='no'?'no':'si';
    if(editing||reduced.matches||node.dataset.estudioRevealMotion==='no')node.classList.add('estudio-wide-open');else reveal.observe(node);
  }
  const fades=[];
  for(const {b,node} of active){
    for(const group of node.querySelectorAll('.perspective-block')){
      const tabs=[...group.querySelectorAll('[data-perspective-go]')],panels=[...group.querySelectorAll('[data-perspective-panel]')];let animation,serial=0,alive=true;
      group.dataset.estudioTabs='true';
      const choose=async button=>{
        const token=++serial,index=Number(button.dataset.perspectiveGo),next=panels[index],previous=panels.find(p=>!p.hidden&&p!==next);
        if(!next)return;animation?.cancel();tabs.forEach(t=>t.setAttribute('aria-pressed',String(t===button)));
        const image=next.querySelector('img');if(image){image.loading='eager';try{await image.decode()}catch{}}
        if(!alive||token!==serial)return;
        panels.forEach(p=>{p.hidden=p!==next&&p!==previous;p.toggleAttribute('data-estudio-leaving',p===previous)});next.hidden=false;
        if(previous&&image&&!editing&&!reduced.matches&&b.opciones?.estudioVistasMovimiento!=='no'){
          image.style.zIndex='2';animation=image.animate([{opacity:0},{opacity:1}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'});try{await animation.finished}catch{}
        }
        if(!alive||token!==serial)return;
        panels.forEach(p=>{p.hidden=p!==next;p.removeAttribute('data-estudio-leaving');p.querySelector('img')?.style.removeProperty('z-index')});
      };
      group.addEventListener('click',event=>{const button=event.target.closest('[data-perspective-go]');if(button)choose(button)},{signal});
      reduced.addEventListener('change',()=>{if(reduced.matches)try{animation?.finish()}catch{}},{signal});
      fades.push(()=>{alive=false;serial++;animation?.cancel();delete group.dataset.estudioTabs});
    }
  }
  for(const {b,node} of active)if(b.tipo==='ubicacion'&&!b.contenido.rotulo)node.querySelector('.card > .label')?.remove();
  let last = win.scrollY;
  const updateNav = () => {
    const past = !hero || hero.node.getBoundingClientRect().bottom < (nav?.offsetHeight || 0);
    nav?.classList.toggle('estudio-solid', past);
    nav?.classList.toggle('estudio-away', !editing && app.dataset.estudioNavMotion!=='no' && past && win.scrollY > last && !nav.matches(':focus-within'));
    last = win.scrollY;
  };
  win.addEventListener('scroll', updateNav, {passive:true,signal});
  win.addEventListener('resize', updateNav, {passive:true,signal});
  updateNav();
  const firstFrame = win.requestAnimationFrame(updateNav);
  return () => {
    win.cancelAnimationFrame(firstFrame);
    controller.abort();
    if(navName){if(nameSize)navName.style.fontSize=nameSize;else navName.style.removeProperty('font-size')}
    reveal.disconnect();
    for (const photo of widePhotos) photo.classList.remove('estudio-wide-open');
    for (const dispose of fades) dispose();
    for(const key of ['estudioTitleMotion','estudioNavMotion','estudioLinkMotion','estudioButtonMotion'])delete app.dataset[key];
    for(const photo of widePhotos)delete photo.dataset.estudioRevealMotion;
    for (const node of added) node.remove();
    nav?.classList.remove('estudio-solid', 'estudio-away');
    app.classList.remove('estudio-aprobado');delete app.dataset.estudioEditing;
  };
}
