import {ringIdentity} from './zonas-anillos.mjs?v=20261114-anillo7b';
// Excepción de revisión: nunca habilita el recorrido ni cambia el estado del proyecto.
export const TERRAZAS_QA_ID = '29f8203d-fbd2-4bbb-8187-62464333a0b3';
export const terrazasTourQA = (slug, host = globalThis.location?.hostname) =>
  host === 'staging.surpatagonian.com' && slug === 'terrazas-del-piltri';

export function simulatedSales(slug) {
  if (!terrazasTourQA(slug)) return false;
  const params = new URLSearchParams(location.search);
  if (params.get('simulacion') === 'estados') return true;
  if (params.get('integrado') !== '1' || window.parent === window) return false;
  try {
    const parent = new URL(window.parent.location.href);
    return parent.origin === location.origin && parent.pathname.replace(/\/$/,'') === '/terrazas-del-piltri' && parent.searchParams.get('simulacion') === 'estados';
  } catch { return false; }
}

const simulation = new Map([
  ['900-1','reservado'], ['900-2','vendido'], ['901-3','vendido'],
  ['910-4','vendido'], ['911-5','vendido'], ['911-2','reservado']
]);

export function simulateLotStates(lots) {
  return lots.map(lot => {
    const {block,number} = ringIdentity(lot);
    const state = simulation.get(block + '-' + number);
    return state && lot.estado === 'disponible' ? {...lot,estado:state} : lot;
  });
}
