import {unitPriceLabel,unitPriceText} from './lote-precio.mjs';
import {mediaList,mediaURL} from './recorrido-medios.mjs';
import {openMediaViewer} from './recorrido-visor-medios.mjs';

export function lotTitle(lot) {
  if (/^Manzana /i.test(lot.numero)) return lot.numero;
  return 'Lote ' + String(lot.numero ?? '').replace(/^lote\s+/i, '');
}
const present = value => value != null && value !== '';
const formatted = value => Number(value).toLocaleString('es-AR');

export function appendLotInformation(container, lot, config, {local=false}={}) {
  const append = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    container.append(element);
    return element;
  };
  const status = {proximamente:'Próximamente',disponible:'Disponible', reservado:'Reservado', vendido:'Vendido'}[lot.estado];
  append('p',status || 'Disponibilidad sin informar');
  if (present(lot.superficie_m2)) append('p','Superficie: '+formatted(lot.superficie_m2)+' m²');
  append('p',present(lot.precio_usd) ? 'Precio: USD '+formatted(lot.precio_usd) : 'Precio a consultar');
  if (present(lot.precio_usd)) append('p',unitPriceLabel+' · '+unitPriceText(lot));
  if (lot.tipo_lote) append('p','Sector: '+lot.tipo_lote);
  if (lot.frente_agua) append('p','Frente al agua');
  if (lot.notas) append('p',lot.notas);
  const items = mediaList(config,lot.id,{local});
  const photo = items.find(item=>item.tipo==='foto');
  if (photo) {
    const cover = document.createElement('img');
    cover.alt = photo.titulo || lotTitle(lot);
    cover.src = photo.miniatura || photo.url;
    container.append(cover);
  }
  if (items.length) {
    const button = append('button','Ver fotos y vistas del lote');
    button.type='button';
    button.onclick=()=>openMediaViewer(items,{title:lotTitle(lot),context:'recorrido'});
  }
  const external = mediaURL(config.lotes?.[lot.id]?.tour360,{local});
  if (external) {
    const link = append('a','Abrir vista 360 del lote');
    link.href=external;link.target='_blank';link.rel='noopener noreferrer';
  }
}
