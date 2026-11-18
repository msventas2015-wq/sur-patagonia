const referenceHosts = new Set(['staging.surpatagonian.com', 'localhost', '127.0.0.1', '[::1]']);

export function isReferencePreviewHost(hostname = globalThis.location?.hostname) {
  return referenceHosts.has(hostname);
}

export function isAlamosReferenceProject(project, hostname = globalThis.location?.hostname) {
  if (!isReferencePreviewHost(hostname) || project?.slug !== 'alamos') return false;
  return project.id === 'c7bdb818-d0d7-4291-bd7b-f219d5e2ee15'
    || (hostname !== 'staging.surpatagonian.com' && project.id === 'local:alamos');
}

// Public links identify the inventory row. Geometry is resolved by each viewer.
export function lotLinkId(config,id) {
  return config.lotes?.[id]?.idEnlace || id;
}

export function findPublicLot(config,lots,id) {
  if(!id)return null;
  const matches=lots.filter(lot=>lot.id===id || lotLinkId(config,lot.id)===id);
  return matches.length===1?matches[0]:null;
}

export function projectTourUrl(project, config, lotId) {
  if (!project.slug || !project.id) return '';
  const tour = config.recorrido;
  const original = isAlamosReferenceProject(project);
  if (!original && (!tour?.escena?.enabled || tour.proyectoId !== project.id)) return '';
  const query = new URLSearchParams();
  if (!original) query.set('proyecto', project.slug);
  if (lotId != null) {
    const card = config.lotes?.[lotId];
    if (card?.fichaEnRecorrido === false || tour?.proyectoId !== project.id) return '';
    if (original ? card?.recorrido?.plano?.id !== 'alamos' : !card?.elementoRecorrido) return '';
    query.set('lote', lotLinkId(config,lotId));
  }
  const route = original ? '/recorrido-aereo-alamos' : '/recorrido';
  return query.size ? route + '?' + query : route;
}

export function lotReturnUrl(slug, id, consult = false) {
  return '/' + encodeURIComponent(slug) + '?' + new URLSearchParams({lote:id}) + (consult ? '#consulta-lote' : '#lotes');
}

// Callers pass the lot as shown to the visitor, including its zone status.
export function hideLotInquiry(slug, lot) {
  return lot?.estado === 'vendido' || lot?.estado === 'no_a_la_venta' || lot?.zonaOculta === true;
}

export function appendLotReturnLinks(container, slug, lotId, lot) {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Acciones del lote');
  nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 16px;margin-block:12px';
  for (const [label, consult] of [['Volver a la ficha',false],['Consultar este lote',true]]) {
    if (consult && hideLotInquiry(slug, lot)) continue;
    const link = document.createElement('a');
    link.href = lotReturnUrl(slug, lotId, consult);
    link.target = '_top';
    link.textContent = label;
    link.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;font:inherit;color:inherit;text-decoration:underline';
    nav.append(link);
  }
  container.append(nav);
}
