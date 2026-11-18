import {unitPriceLabel,unitPriceText} from './lote-precio.mjs';

// PostgREST puede devolver menos filas que el rango solicitado. Reanudar desde
// la cantidad recibida y exigir el total antes de presentar el inventario.
export async function leerInventarioCompleto(client, proyectoId, columnas='*') {
 const data = [], ids = new Set();
 let total;
 do {
  const options = total === undefined ? {count:'exact'} : {};
  const page = await client.from('lotes').select(columnas,options).eq('proyecto_id',proyectoId)
   .order('numero').order('id').range(data.length,data.length+499);
  if (page.error) return {error:page.error};
  total ??= page.count;
  if (!Number.isInteger(total) || !Array.isArray(page.data) || (!page.data.length && data.length<total))
   return {error:new Error('La lectura del inventario quedó incompleta.')};
  for (const lote of page.data) {
   if (!lote.id || ids.has(lote.id)) return {error:new Error('El inventario cambió durante la carga.')};
   ids.add(lote.id);
   data.push(lote);
  }
 } while (data.length<total);
 return data.length===total ? {data} : {error:new Error('El inventario cambió durante la carga.')};
}
// Comparar identificadores sin modificar el nombre comercial guardado.
function searchWords(value) {
 const plain=value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/\b(?:manzana|mza|mz|m)[-\s]*(\d+[a-z]?)(?=l(?:ote)?\d|\b)/g,'manzana $1 ')
  .replace(/\b(?:lote|lt|l)[-\s]*(\d+[a-z]?)\b/g,'lote $1')
  .replace(/\b0+(?=\d)/g,'');
 return plain.split(/[^\p{L}\d]+/u).filter(Boolean);
}

export function lotSearchMatcher(query) {
 const identifierWords=value=>searchWords(value.trim().replace(/^(\d+[a-z]?)\s*[-/]\s*(\d+[a-z]?)$/i,'manzana $1 lote $2'));
 const tokens=identifierWords(query);
 return (name,sector)=>{
  const words=identifierWords(name), all=[...words,...searchWords(sector)];
  for(let i=0;i<tokens.length;i++){
   const token=tokens[i],next=tokens[i+1];
   if((token==='manzana'||token==='lote') && /^\d+[a-z]?$/.test(next||'')){
    if(!words.some((word,index)=>word===token && words[index+1]===next))return false;
    i++;
   }else if(!all.some(word=>/^\d+$/.test(token)?word===token:word.startsWith(token)))return false;
  }
  return true;
 };
}

// Una sola fila editable por lote. La lista es una vista de lectura de esas filas.
export function inventarioLotes({media, onSelect, getMedia, canLeave}) {
 const $=id=>document.getElementById(id),body=$('lotesBody'),list=$('inv-list'),detail=$('inv-detail'),fields=$('inv-fields'),results=$('inv-results'),search=$('inv-query'),filter=$('inv-filter');
 const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''});
 const collator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
 let active=null,page=0,scheduled=false;const limit=12;
 const rows=()=>[...body.rows],name=r=>r.querySelector('.l-numero').value.trim();
 const lotLabel=r=>name(r)||'Nuevo lote';
 function listData(){
  const matches=lotSearchMatcher(search.value);
  return rows().map(r=>{const val=c=>r.querySelector(c).value;const lot=getMedia(r.dataset.origenId)||{},pics=Math.max(lot.fotos?.length||0,lot.recorrido?.medios?.filter(m=>m.tipo==='foto').length||0);return {r,n:lotLabel(r),type:val('.l-tipo'),sup:val('.l-sup'),price:val('.l-precio'),state:val('.l-estado'),pics};})
   .filter(x=>matches(x.n,x.type)&&(!filter.value||({estado:!x.state,precio:!x.price,foto:!x.pics})[filter.value])).sort((a,b)=>collator.compare(a.n,b.n));
 }
 function updateFicha(row){
  $('inv-title').textContent=lotLabel(row);
  const price=row.querySelector('.l-precio'),area=row.querySelector('.l-sup');
  let output=price.parentElement.querySelector('output');
  if(!output){
   const label=el('label',unitPriceLabel);
   output=el('output');output.id=price.id+'-m2';label.htmlFor=output.id;
   output.setAttribute('for',price.id+' '+area.id);price.parentElement.append(label,output);
  }
  output.value=unitPriceText({precio_usd:price.value,superficie_m2:area.value});
 }
 function render(){
  scheduled=false;if(active?.isConnected){updateFicha(active);return;}active=null;
  const data=listData();page=Math.max(0,Math.min(page,Math.ceil(data.length/limit)-1));results.replaceChildren();
  const table=el('table'),head=table.createTHead().insertRow();table.className='inv-table';
  for(const t of ['Lote','Superficie','Precio (USD)',unitPriceLabel,'Estado','']){const th=el('th',t||'Ficha');th.scope='col';head.append(th);}
  const tb=table.createTBody();for(const x of data.slice(page*limit,(page+1)*limit)){const tr=tb.insertRow();
   for(const [i,t] of [x.n,x.sup?Number(x.sup).toLocaleString('es-AR')+' m²':'—',x.price?Number(x.price).toLocaleString('es-AR'):'—',unitPriceText({precio_usd:x.price,superficie_m2:x.sup}),x.r.querySelector('.l-estado').selectedOptions[0]?.textContent || 'Sin informar'].entries()){const td=tr.insertCell();td.textContent=t;if(i>0&&['—','Sin informar'].includes(t))td.className='inv-muted';if(!i&&x.type)td.append(el('small',x.type));}
   const b=el('button','Ficha');b.type='button';b.className='btn-secundario';b.dataset.forRow=x.r.dataset.id;b.setAttribute('aria-label','Ficha de '+x.n);b.onclick=()=>open(x.r);tr.insertCell().append(b);
  }
  if(data.length)results.append(table);else results.append(el('p',body.rows.length?'No hay lotes con ese filtro.':'Todavía no cargaste lotes. Agregá uno o importá una planilla.'));
  $('inv-count').textContent=data.length?((page*limit+1)+'–'+Math.min((page+1)*limit,data.length)+' de '+data.length+(data.length===1?' lote':' lotes')):'0 lotes';
  $('inv-prev').disabled=!page;$('inv-next').disabled=(page+1)*limit>=data.length;
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(render);}}
 function open(row,focus=true){if(!row)return;if(active&&row!==active&&!canLeave())return;
  if(active)active.removeAttribute('data-ficha');active=row;active.dataset.ficha='';list.hidden=true;detail.hidden=fields.hidden=$('inv-remove').hidden=false;
  const names=['Manzana / N° de lote','Tipo o sector','Superficie (m²)','Precio (USD)','Estado','Frente al agua','Notas públicas'];
  for(const [i,label] of names.entries()){const cell=row.cells[i+1],control=cell.querySelector('input,select,textarea');if(cell.querySelector('label'))continue;control.id='inv-'+row.dataset.id+'-'+i;const l=el('label',label);l.htmlFor=control.id;cell.prepend(l);}
  updateFicha(row);media.hidden=false;onSelect(row);
  if(focus){$('inv-title').focus({preventScroll:true});detail.scrollIntoView({block:'start'});}
 }
 function back(){if(!canLeave())return;const old=active;active?.removeAttribute('data-ficha');active=null;onSelect(null);media.hidden=true;detail.hidden=fields.hidden=$('inv-remove').hidden=true;list.hidden=false;render();
  const button=old&&[...results.querySelectorAll('button')].find(b=>b.dataset.forRow===old.dataset.id);(button||search).focus();}
 $('inv-delete').onclick=()=>{if(active&&canLeave()){const r=active;back();window.eliminarLote(r.querySelector('.btn-del-lote'));}};
 $('inv-back').onclick=back; window._revelarFilaLote=r=>{if(r)open(r,false);};
 $('inv-add').onclick=()=>{window.agregarLote({estado:''});open(body.lastElementChild);body.lastElementChild.querySelector('.l-numero').focus();};
 $('inv-prev').onclick=()=>{page--;render();};$('inv-next').onclick=()=>{page++;render();};
 search.oninput=filter.onchange=()=>{page=0;render();};body.addEventListener('input',schedule);
 new MutationObserver(()=>{if(active&&!active.isConnected)back();else schedule();}).observe(body,{childList:true});
 document.addEventListener('miniweb-change',schedule);document.addEventListener('proyecto-cargado',schedule);render();
 return {active:()=>active,open,refresh:schedule};
}

// Los pines y la imagen emplean la misma transformación norte-arriba.
// Se toma un punto interior del polígono, incluso si la parcela es cóncava.
export function proyectarParcelas(features,links) {
 const lots=features.filter(f=>f.kind==='lot');
 let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
 for(const f of lots)for(const [x,y] of f.points){if(!Number.isFinite(x+y))throw Error('Coordenada no válida.');west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}
 if(!lots.length||east<=west||north<=south||east-west>180)throw Error('Revisá la extensión del plano.');
 const lonScale=Math.cos((south+north)*Math.PI/360),dx=(east-west)*lonScale,dy=north-south,scale=1500/Math.max(dx,dy),w=Math.max(400,Math.ceil(dx*scale)+80),h=Math.max(400,Math.ceil(dy*scale)+80);
 const xy=([x,y])=>[(w-dx*scale)/2+(x-west)*lonScale*scale,(h-dy*scale)/2+(north-y)*scale];
 const shapes=lots.map(f=>({id:f.id,points:f.points.map(xy)})),pins=[];
 const byKey=new Map(shapes.map(f=>[f.id,f]));
 for(const {id,key} of links){
   const poly=byKey.get(key)?.points;if(!poly)throw Error('Hay lotes sin contorno. Vinculalos antes de generar el mapa.');
   let yMin=Infinity,yMax=-Infinity;for(const [,y] of poly){yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);}
   let best=0,pin;for(const slice of [.5,.375,.625,.25,.75,.125,.875]){
     const y=yMin+(yMax-yMin)*slice,xs=[];let a=poly.at(-1);
     for(const b of poly){if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));a=b;}
     xs.sort((a,b)=>a-b);for(let i=1;i<xs.length;i+=2){const width=xs[i]-xs[i-1];if(width>best){best=width;pin={id,x:(xs[i]+xs[i-1])*50/w,y:y*100/h};}}
   }
   if(!pin)throw Error('Hay una parcela sin superficie dibujada. Revisá el plano.');pins.push(pin);
 }
 return {w,h,shapes,pins};
}
export async function dibujarPlano(plan){
 const c=document.createElement('canvas');c.width=plan.w;c.height=plan.h;const ctx=c.getContext('2d');
 ctx.fillStyle='#182025';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#354841';ctx.strokeStyle='#c4d0c7';ctx.lineWidth=1.4;
 for(const {points} of plan.shapes){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();}
 const blob=await new Promise(res=>c.toBlob(res,'image/png'));if(!blob)throw Error('No se pudo dibujar el plano.');
 return new File([blob],'plano-parcelas.png',{type:'image/png'});
}
