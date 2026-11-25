import {leerInventarioCompleto} from './lotes-inventario.mjs';
import {projectSaleInventory} from './zonas-venta.mjs';

const categories = {
  loteo: 'Loteo residencial', loteo_rural: 'Loteo residencial rural', loteo_turistico: 'Loteo turístico',
  barrio_cerrado: 'Barrio cerrado', chacras: 'Chacras', desarrollo_mixto: 'Desarrollo mixto'
};
const characters = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => characters[character]);
const format = new Intl.NumberFormat('es-AR', {useGrouping: 'always'});
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const money = value => positive(value) ? 'USD ' + format.format(value) : '';

function publicUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function miniwebSettings(project) {
  try {
    const theme = typeof project.tema === 'string' ? JSON.parse(project.tema) : project.tema;
    return theme?.miniweb || {};
  } catch { return {}; }
}

export async function cardInventory(client, project) {
  try {
    const {data, error} = await leerInventarioCompleto(client, project.id, 'id,numero,estado');
    if (error) throw error;
    if (!data.length) return null;
    const {lots, total} = projectSaleInventory(project, data);
    const stageSize = Number(total ?? lots.length);
    const available = lots.filter(lot => lot.estado === 'disponible').length;
    if (!Number.isSafeInteger(stageSize) || stageSize < available) return null;
    return {total:stageSize, available};
  } catch (error) {
    console.warn('Disponibilidad de la ficha sin confirmar.', error);
    return null;
  }
}

function metric(label, value) {
  return value ? '<div><span class="pf-label">' + esc(label) + '</span><span class="pf-value">' + esc(value) + '</span></div>' : '';
}

function availability(inventory) {
  if (!inventory?.total) return '';
  const percent = 100 * inventory.available / inventory.total;
  const percentLabel = percent > 0 && percent < 1 ? '< 1' : percent > 99 && percent < 100 ? '> 99' : Math.round(percent);
  return `<div class="pf-meter"><div class="pf-meter-head"><span class="pf-label">Disponibilidad</span><b>${esc(percentLabel)} %</b></div>
    <div class="pf-track" aria-hidden="true"><i style="width:${percent}%"></i></div>
    <span>${format.format(inventory.available)} de ${format.format(inventory.total)} lotes disponibles</span></div>`;
}

function areaRange(project) {
  const min = project.sup_min_m2, max = project.sup_max_m2;
  if (positive(min) && positive(max) && Number(min) !== Number(max)) return format.format(min) + '–' + format.format(max) + ' m²';
  if (positive(min)) return (positive(max) ? '' : 'Desde ') + format.format(min) + ' m²';
  return positive(max) ? 'Hasta ' + format.format(max) + ' m²' : '';
}

export function projectCard(project, inventory, {listing = false, serviceName = String} = {}) {
  const config = miniwebSettings(project);
  const cover = config.bloques?.find(block => block.tipo === 'portada' && block.activo !== false);
  const name = cover?.contenido?.nombreVisible || project.nombre;
  const scene = config.recorrido?.escena;
  const photo = [scene?.raster?.url, project.mapa_imagen_url, project.foto_portada].map(publicUrl).find(Boolean);
  const section = [categories[project.categoria] || 'Proyecto', [project.ciudad, project.provincia].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const href = project.slug ? '/' + encodeURIComponent(project.slug) : listing ? '#contacto' : '/proyectos';
  const price = money(project.precio_desde);
  const details = [
    metric('Superficie', areaRange(project)),
    metric('Esta etapa', inventory ? format.format(inventory.total) + ' lotes' : ''),
    listing && metric('Predio', positive(project.hectareas_total) ? format.format(project.hectareas_total) + ' ha' : ''),
    metric('Reserva', money(project.monto_reserva))
  ].filter(Boolean).join('');
  const services = listing && Array.isArray(project.servicios) ? project.servicios : [];
  const video = listing && publicUrl(project.video_url);
  const plan = listing && publicUrl(project.masterplan_url);
  const meter = availability(inventory);
  // El navegador recibe una foto de fondo, sin enlace de descarga ni imagen arrastrable.
  const background = photo ? ' style="background-image:url(' + esc(JSON.stringify(photo)) + ')"' : '';
  return `<article class="pf-card"${listing ? ' id="proyecto-' + esc(project.id) + '"' : ''}>
    <div class="pf-photo"${background}${photo ? ' role="img" aria-label="' + esc('Vista de ' + name) + '"' : ''}></div>
    <div class="pf-info"><header><div class="pf-location">${esc(section)}</div><h3>${esc(name)}</h3></header>
      ${price ? '<div class="pf-price"><span class="pf-label">Desde</span><b>' + esc(price) + '</b></div>' : ''}
      ${project.financiacion?.trim() ? '<div class="pf-fin">' + metric('Financiación', project.financiacion.trim()) + '</div>' : ''}
      ${listing ? '' : meter}
      ${details ? '<div class="pf-data">' + details + '</div>' : ''}
      ${listing ? meter : ''}
      ${services.length ? '<div class="pf-services">' + services.map(s => '<span>' + esc(serviceName(s)) + '</span>').join('') + '</div>' : ''}
      <div class="pf-actions"><a class="pf-button" href="${esc(href)}">Ver el proyecto →</a>
        ${video ? '<button type="button" class="pf-link" data-video="' + esc(video) + '">Ver video</button>' : ''}
        ${plan ? '<a class="pf-link" target="_blank" rel="noopener" href="' + esc(plan) + '">Masterplan →</a>' : ''}
        ${listing ? '<a class="pf-link" href="#contacto">Consultar →</a>' : ''}</div>
    </div></article>`;
}
