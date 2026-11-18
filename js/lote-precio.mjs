export const unitPriceLabel = 'USD / m²';

function numberOrNull(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Conservar la precisión para ordenar; redondear sólo al presentar.
export function unitPrice(lot) {
  const price = numberOrNull(lot.precio_usd);
  const area = numberOrNull(lot.superficie_m2);
  if (price === null || !(area > 0)) return null;
  return numberOrNull(price / area);
}

export function unitPriceText(lot) {
  const value = unitPrice(lot);
  return value === null ? '—' : Math.round(value).toLocaleString('es-AR');
}

export function lotFacts(lot) {
  const price = numberOrNull(lot.precio_usd);
  const area = numberOrNull(lot.superficie_m2);
  const block = /\b(?:manzana|mz\.?)\s+([\p{L}\d]+)(?=\s|[·,/-]|$)/iu.exec(lot.numero || '');
  return [
    ['Precio', price === null ? 'A consultar' : 'USD ' + price.toLocaleString('es-AR')],
    ...(block ? [['Manzana', block[1]]] : []),
    ['Tipo de lote', lot.tipo_lote || '—'],
    ['Superficie', area === null ? '—' : area.toLocaleString('es-AR') + ' m²'],
    [unitPriceLabel, unitPriceText(lot)]
  ];
}
