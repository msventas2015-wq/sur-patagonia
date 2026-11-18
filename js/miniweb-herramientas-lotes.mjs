import {lotFacts,unitPrice,unitPriceLabel} from './lote-precio.mjs';
import {projectTourUrl} from './recorrido-enlaces.mjs';
import {mediaList} from './recorrido-medios.mjs';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=value=>value!=null && String(value).trim()!=='' && Number.isFinite(Number(value))?Number(value):null;
const states={disponible:'Disponible',reservado:'Reservado',vendido:'Vendido',proximamente:'Próximamente'};
const format=(value,unit)=>value==null?'—':(unit==='USD'?'USD ':'')+value.toLocaleString('es-AR',{maximumFractionDigits:1})+(unit==='m²'?' m²':'');
const specs=[
 ['Superficie','m²',l=>numeric(l.superficie_m2)],
 ['Precio','USD',l=>numeric(l.precio_usd)],
 [unitPriceLabel,'USD',l=>{const value=unitPrice(l);return value===null?null:Math.round(value)}]
];
function comparison(a,b,label){
 const rows=specs.map(([key,unit,read])=>{
  const first=read(a),second=read(b),delta=first!=null && second!=null?second-first:null;
  return '<tr><th scope="row">'+key+'</th><td>'+format(first,unit)+'</td><td>'+format(second,unit)+'</td><td>'+(delta>0?'+':'')+format(delta,unit)+'</td></tr>';
 }).join('');
 return '<div class="compare-scroll" tabindex="0"><table><caption>Comparación de lotes</caption><thead><tr><th scope="col">Dato</th><th scope="col">'+label(a)+'</th><th scope="col">'+label(b)+'</th><th scope="col">Diferencia</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
export function mountLotTools(container,{config,project,safeUrl,lotNumber}){
 let lot=null,choices=[],other='',tab='sector',options={};
 const label=l=>escapeHtml(lotNumber(l.numero));
 function render(){
  const showCard=options.fichaConMedios==='si',showCompare=options.compararLotes==='si'&&choices.length>1;
  container.hidden=!lot||(!showCard&&!showCompare);
  if(container.hidden){container.replaceChildren();return}
  const photos=mediaList(config,lot.id),files=photos.filter(x=>x.tipo==='foto'),panos=photos.filter(x=>x.tipo==='panorama');
  const tour=safeUrl(config.lotes?.[lot.id]?.tour360);
  const projectTour=projectTourUrl(project,config,lot.id);
  const goToLot=projectTour ? `<a class="lot-tour-link" href="${escapeHtml(projectTour)}">Ver este lote en el recorrido 360°</a>` : '';
  const imagePlan=config.recorrido?.escena?.imagePlan;
  const imageLots=imagePlan?.version===2?imagePlan.faces?.some(f=>f.lot&&!f.hidden):imagePlan?.version===1&&imagePlan.features?.some(f=>f.kind==='lot'&&!f.hidden);
  const hideEmpty360=imageLots&&!projectTour&&!panos.length&&!tour;
  if(hideEmpty360&&tab==='pano')tab='sector';
  let panel='';
  if(tab==='sector'){
   panel=`<dl>${lotFacts(lot).map(([name,value])=>`<div><dt>${name}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`+goToLot;
  }else if(tab==='fotos'){
   panel=files.length?files.map(f=>`<button type="button" class="lot-tool-photo" data-image="${escapeHtml(f.url)}" data-image-title="${escapeHtml(f.titulo||'Foto del lote')}"><img src="${escapeHtml(f.miniatura||f.url)}" alt="${escapeHtml(f.titulo||'Foto del lote')}" loading="lazy"></button>`).join(''):'<p>Este lote todavía no tiene fotos.</p>';
  }else{
   panel=goToLot+(panos.length?`<button type="button" data-lot-panos="${escapeHtml(lot.id)}">Abrir panorámicas del lote (${panos.length})</button>`:'')+(tour?`<button type="button" data-tour="${escapeHtml(lot.id)}">Abrir recorrido del lote</button>`:'');
   if(!panel)panel='<p>Este lote todavía no tiene una vista 360°.</p>';
  }
  const card=showCard?`<header><h3>${label(lot)}</h3><span>${states[lot.estado]||'Sin información'}</span></header><div class="lot-tool-tabs" role="group" aria-label="Contenido de la ficha">${[['sector','Sector'],['pano','Vista 360°'],['fotos','Fotos del lote']].filter(([key])=>!hideEmpty360||key!=='pano').map(([key,text])=>`<button type="button" data-lot-panel="${key}" aria-pressed="${key===tab}">${text}</button>`).join('')}</div><div class="lot-tool-panel">${panel}</div>`:'';
  const matches=choices.filter(row=>row.id!==lot.id),second=matches.find(row=>row.id===other);
  container.innerHTML=card+(showCompare?`<label>Comparar ${label(lot)} con<select data-lot-compare><option value="">Elegir otro lote</option>${matches.map(row=>`<option value="${escapeHtml(row.id)}" ${row===second?'selected':''}>${label(row)}</option>`).join('')}</select></label>${second?comparison(lot,second,label):''}`:'');
 }
 container.addEventListener('click',e=>{const button=e.target.closest('[data-lot-panel]');if(button){tab=button.dataset.lotPanel;render();container.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true})}});
 container.addEventListener('change',e=>{if(e.target.matches('[data-lot-compare]')){other=e.target.value;render();container.querySelector('select')?.focus({preventScroll:true})}});
 return (selection,visible,settings)=>{
  if(selection?.id!==lot?.id)tab='sector';
  if(!visible.some(row=>row.id===other)||other===selection?.id)other='';
  lot=selection;choices=visible;options=settings;render();
 };
}
