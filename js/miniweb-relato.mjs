// Relato adapts the live block elements. Lot selection, media and contact stay
// connected to the same handlers in the editor, the preview and the public page.
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function jumpLink(target, label, className) {
  const link = element('a', className, label);
  link.href = '#' + target.id;
  return link;
}

function setupCover(context, section, next, cleanups) {
  const nav = context.app.querySelector('.project-nav');
  if (!nav) return;
  // The header belongs to the cover so it scrolls away with the photograph.
  const previousParent = nav.parentNode;
  const previousNext = nav.nextSibling;
  section.prepend(nav);
  cleanups.push(() => previousParent.insertBefore(nav, previousNext?.parentNode === previousParent ? previousNext : null));
  const navigation = nav.querySelector('.nav-links');
  const tour = navigation?.querySelector('[data-aerial-tour]');
  if (navigation) {
    const original = [...navigation.childNodes];
    const routes = [['intro','El proyecto'],['explorador','Lotes'],['ubicacion','Dónde queda']];
    navigation.replaceChildren(...routes.flatMap(([type,label]) => {
      const block = context.active.find(({b}) => b.tipo === type);
      return block ? [jumpLink(block.node,label)] : [];
    }));
    if (tour) navigation.append(tour);
    const contact = context.active.find(({b}) => b.tipo === 'contacto');
    const contactLink = contact && jumpLink(contact.node,'Consultar','relato-contact-link');
    if (contactLink) nav.append(contactLink);
    cleanups.push(() => {navigation.replaceChildren(...original);contactLink?.remove()});
  }
  if (next) {
    const link = jumpLink(next,'↓','relato-down');
    link.setAttribute('aria-label','Seguir leyendo');
    section.append(link);
    cleanups.push(() => link.remove());
  }
}

function setupReading(node, motion, cleanups) {
  const paragraph = node.querySelector(':scope > p');
  if (!paragraph) return;
  const originals = [...paragraph.childNodes];
  const words = [];
  for (const child of originals) {
    // Preserve inline emphasis supplied by the author.
    const container = child.nodeType === 3 ? document.createDocumentFragment() : child.cloneNode(false);
    for (const piece of child.textContent.split(/(\s+)/)) {
      if (!piece.trim()) container.append(piece);
      else {
        const word = element('span','relato-word',piece);
        words.push(word);
        container.append(word);
      }
    }
    child.replaceWith(container);
  }
  motion.push((height, calm) => {
    const rect = paragraph.getBoundingClientRect();
    const progress = (height * .85 - rect.top) / (rect.height + height * .35);
    words.forEach((word,i) => word.classList.toggle('read',calm || i < progress * words.length));
  });
  cleanups.push(() => paragraph.replaceChildren(...originals));
}

function setupGallery(node, block, motion, cleanups) {
  const grid = node.querySelector('.photo-grid');
  if (!grid) return;
  const figures = [...grid.querySelectorAll(':scope > figure')];
  if (block.variante === 'editorial') {
    node.dataset.relatoLayout = 'trio';
    return;
  }
  if (block.variante !== 'mosaico' || figures.length < 3) return;
  node.dataset.relatoLayout = 'apertura';
  const opening = element('div','relato-open');
  const stage = element('div','relato-stage');
  grid.before(opening);
  opening.append(stage);
  stage.append(...figures.slice(0,6));
  motion.push((height,calm) => {
    if (calm || window.innerWidth <= 820) return;
    const rect = opening.getBoundingClientRect();
    const progress = Math.max(0,Math.min(1,-rect.top / Math.max(1,rect.height-height)));
    stage.style.setProperty('--relato-open-scale', .36 + .64 * progress);
    stage.style.setProperty('--relato-out-opacity', Math.max(0,1 - 1.6 * progress));
    stage.style.setProperty('--relato-out-scale', 1 + .5 * progress);
  });
  cleanups.push(() => {grid.prepend(...stage.children);opening.remove()});
}

function setupChapters(node, signal, cleanups) {
  const existing = node.querySelector('.chapter-block');
  const figures = [...node.querySelectorAll('.chapter-visual > figure')];
  const chapters = [...node.querySelectorAll('.chapter-texts > article')];
  if (!existing || !figures.length || !chapters.length) return;
  const panel = element('div','relato-fold');
  const picture = element('figure');
  const items = element('div','relato-fold-items');
  const header = node.querySelector(':scope > .media-heading');
  if (header) items.append(header);
  function show(index) {
    if (figures[index]) picture.replaceChildren(...[...figures[index].childNodes].map(child => child.cloneNode(true)));
  }
  chapters.forEach((chapter,index) => {
    const details = element('details');
    details.name = 'relato-' + node.dataset.blockId;
    const heading = chapter.querySelector('h2');
    const alt = figures[index]?.querySelector('img')?.alt;
    const summary = element('summary','',heading?.textContent || alt || 'Vista ' + (index + 1));
    details.append(summary,...[...chapter.querySelectorAll(':scope > p')].map(p => p.cloneNode(true)));
    details.open = index === 0;
    details.addEventListener('toggle',() => {if (details.open) show(index)},{signal});
    items.append(details);
  });
  show(0);
  panel.append(picture,items);
  existing.before(panel);
  existing.hidden = true;
  cleanups.push(() => {if(header) node.insertBefore(header,existing);existing.hidden = false;panel.remove()});
}

function setupBar(node, explorer, motion, cleanups) {
  if (!explorer) return;
  const values = [...node.querySelectorAll(':scope > .shell > div')];
  if (!values.length) return;
  const bar = element('aside','relato-bar');
  bar.setAttribute('aria-label','Resumen de lotes');
  const list = element('ul');
  values.forEach(item => {
    const amount = item.querySelector('strong')?.textContent || '';
    const label = item.querySelector('span')?.textContent || '';
    const caption = label === 'precio desde' ? 'Desde ' + amount : /lotes del desarrollo|total de lotes/.test(label) ? amount + ' lotes' : /^superficies/.test(label) ? amount : [amount,label].filter(Boolean).join(' ');
    list.append(element('li','',caption));
  });
  const progress = element('i','relato-progress');
  progress.setAttribute('aria-hidden','true');
  bar.append(progress,element('span','','Lotes'),list,jumpLink(explorer,'Ver los lotes','relato-bar-link'));
  node.append(bar);
  motion.push(() => {
    const root = node.closest('.miniweb');
    const rect = root.getBoundingClientRect();
    const ratio = Math.max(0,Math.min(1,-rect.top / Math.max(1,rect.height-window.innerHeight)));
    progress.style.width = String(100 * ratio) + '%';
  });
  cleanups.push(() => bar.remove());
}

function setupLocation(node, contact, cleanups) {
  const card = node.querySelector('.card');
  if (!card || !contact || node.querySelector('.location-map')) return;
  const link = jumpLink(contact,'Cómo llegar','relato-visit');
  card.append(link);
  cleanups.push(() => link.remove());
}

function setupContact(node,block,cleanups) {
  const invitation = node.querySelector('.contact-invitation');
  if (!invitation) return;
  const defaultMessage = !block.contenido?.texto && invitation.querySelector(':scope > p');
  if (defaultMessage) defaultMessage.hidden = true;
  const ways = invitation.querySelector('.ways');
  if (!ways) return;
  const more = element('details','relato-contact-more');
  more.append(element('summary','','Más opciones de consulta'));
  ways.before(more);
  more.append(ways);
  cleanups.push(() => {
    if (defaultMessage) defaultMessage.hidden = false;
    more.replaceWith(ways);
  });
}

export function mountRelato(stream,context) {
  const {app,active} = context;
  if (app.dataset.selectorOnly || app.dataset.styleBody !== 'relato') return () => {};
  const controller = new AbortController();
  const {signal} = controller;
  const cleanups = [];
  const motion = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  app.dataset.approvedRelato = '';
  const explorer = active.find(({b}) => b.tipo === 'explorador')?.node;
  const contact = active.find(({b}) => b.tipo === 'contacto')?.node;
  for (const [index,{b,node}] of active.entries()) {
    switch(b.tipo) {
      case 'portada': setupCover(context,node,active[index + 1]?.node,cleanups); break;
      case 'intro':
        if (b.variante === 'izquierda' || b.opciones?.presentacionRelato === 'nota') node.dataset.relatoLayout = 'nota';
        else {node.dataset.relatoLayout = 'lectura';setupReading(node,motion,cleanups)}
        break;
      case 'galeria':
      case 'asi-se-vive': setupGallery(node,b,motion,cleanups); break;
      case 'capitulos': if(b.variante === 'lectura') setupChapters(node,signal,cleanups); break;
      case 'ubicacion': setupLocation(node,contact,cleanups); break;
      case 'contacto': setupContact(node,b,cleanups); break;
      case 'cifras': if(b.variante === 'barra') setupBar(node,explorer,motion,cleanups); break;
    }
  }
  const scrollRoot = stream.closest('.editor-preview-canvas') || window;
  let frame = 0;
  function update() {
    frame = 0;
    for (const paint of motion) paint(window.innerHeight,reduced.matches);
  }
  const schedule = () => {if (!frame) frame = requestAnimationFrame(update)};
  scrollRoot.addEventListener('scroll',schedule,{passive:true,signal});
  window.addEventListener('resize',schedule,{passive:true,signal});
  reduced.addEventListener('change',schedule,{signal});
  update();
  return () => {
    controller.abort();
    cancelAnimationFrame(frame);
    cleanups.reverse().forEach(dispose => dispose());
    active.forEach(({node}) => delete node.dataset.relatoLayout);
    delete app.dataset.approvedRelato;
  };
}
