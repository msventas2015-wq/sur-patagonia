import {unitPriceLabel,unitPriceText} from './lote-precio.mjs';
import {lotReturnUrl,hideLotInquiry,lotLinkId} from './recorrido-enlaces.mjs';
import {availabilityColor,projectAvailability,estados} from './recorrido-estilo.mjs';
import {readPublishedMedia,isLocalMediaHost,mediaList,mediaURL} from './recorrido-medios.mjs';
import {lotTitle} from './ficha-lote-recorrido.mjs';
import {effectiveSaleLot} from './zonas-venta.mjs';
import {openMediaViewer} from './recorrido-visor-medios.mjs';

// Foto de dron B-5, sin grafismos. Registro del centro de tres cruces de calles
// (noroeste, cruce central sur y acceso este), en WGS84; orden de esquinas del constructor.
export const alamosCenital={
  url:'/assets/recorridos/alamos/cenital.webp',name:'Cenital de Álamos',
  corners:[[-71.53267315,-41.98632040],[-71.53404416,-41.99219488],[-71.53854571,-41.98553238]]
};
// Sistema local del CAD de Álamos al WGS84 de sus estaciones.
function planGPS([east,north]){
  return [-71.535586408+east*.00001206741535-north*.00000006532159,
          -41.985536903+east*.00000004873527+north*.00000900278718];
}
let planPromise;
export function alamosPlan() {
  if (!planPromise) planPromise = (async()=>{
    const response=await fetch('/assets/recorridos/alamos/plano-sur.json');
    if(!response.ok)throw Error('No se pudo leer el plano de Álamos.');
    const bytes=await response.arrayBuffer();
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    const version=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    const lots=JSON.parse(new TextDecoder().decode(bytes)).lots;
    const coords=lots.flatMap(l=>l.p);
    const left=Math.floor(Math.min(...coords.map(p=>p[0])))-20,top=Math.floor(Math.min(...coords.map(p=>-p[1])))-20;
    const width=Math.ceil(Math.max(...coords.map(p=>p[0])))+20-left,height=Math.ceil(Math.max(...coords.map(p=>-p[1])))+20-top;
    const parcels=lots.map(l=>({
      x:(l.c[0]-left)*100/width,y:(-l.c[1]-top)*100/height,block:l.m,number:l.n,stage:String(l.e),points:l.p.map(planGPS), vertices:l.p.map(([x,y])=>[x,y]),key:l.m+'-'+l.n,name:'Manzana '+l.m+' · Lote '+l.n,area:l.a
    })).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
    if(new Set(parcels.map(p=>p.key)).size!==parcels.length || parcels.some(p=>p.area<=0||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('El plano tiene parcelas repetidas o incompletas.');
    return {version,parcels};
  })().catch(error=>{planPromise=null;throw error;});
  return planPromise;
}

let inventoryRequest;
export function alamosInventory(){
  inventoryRequest ||= readPublishedMedia('alamos').catch(error=>{inventoryRequest=null;throw error});
  return inventoryRequest;
}

export function connectAlamosCards() {
  if(isLocalMediaHost() || customElements.get('alamos-ficha'))return;
  const source=Promise.all([alamosPlan(),alamosInventory()]).catch(()=>null);
  source.then(data=>{
    const legend=document.querySelector('.hz-legend');
    if(!legend||!data?.[1])return;
    const [plan,project]=data;
    const counts=new Map();
    for(const lot of project.lots){
      const ref=project.config.lotes?.[lot.id]?.recorrido?.plano;
      if(ref?.id!=='alamos'||ref.version!==plan.version)continue;
      const state=Object.hasOwn(estados,lot.estado)?lot.estado:'sin';
      counts.set(state,(counts.get(state)||0)+1);
    }
    legend.querySelectorAll('.hz-lg').forEach(el=>el.remove());
    const stages=legend.querySelector('.hz-lg-e');
    for(const state of ['disponible','reservado','vendido','proximamente','sin']){
      if(!counts.has(state))continue;
      const label=document.createElement('span'),dot=document.createElement('i'),count=document.createElement('small');
      label.className='hz-lg';
      dot.style.background=state==='sin'?'#b2b6b6':availabilityColor(projectAvailability(project.config),state);
      count.textContent=counts.get(state);
      label.append(dot,state==='sin'?'Sin informar':estados[state],count);legend.insertBefore(label,stages);
    }
  });
  customElements.define('alamos-ficha',class extends HTMLElement {
    static observedAttributes=['manzana','lote'];
    connectedCallback(){this.refresh();}
    attributeChangedCallback(){if(this.isConnected)this.refresh();}
    async refresh(){
      const data=await source;
      if(!this.isConnected)return;
      const parent=this.closest('.hz-lot-card');
      if(!parent)return;
      const block=/^Manzana (\d+)$/.exec(this.getAttribute('manzana')||'');
      const num=/^Lote (\d+)$/.exec(this.getAttribute('lote')||'');
      const key=block&&num?Number(block[1])+'-'+Number(num[1]):'';
      const [plan,project]=data||[];
      const matches=project?.lots.filter(l=>{
        const ref=project.config.lotes?.[l.id]?.recorrido?.plano;
        return ref?.id==='alamos'&&ref.version===plan.version&&ref.lote===key;
      })||[];
      const lot=matches.length===1?effectiveSaleLot(project.config,matches[0]):null;
      if(this.rendered===lot?.id && this.ready)return;
      this.ready=true;this.rendered=lot?.id;
      this.replaceChildren();
      parent.toggleAttribute('data-linked-card',!!lot);
      parent.toggleAttribute('data-card-disabled',!!lot && project.config.lotes[lot.id].fichaEnRecorrido===false);
      if(!lot)return;
      const visual=parent.querySelector(':scope > .hz-lot-visual').cloneNode(true);
      const body=parent.querySelector(':scope > .hz-lot-body').cloneNode(true);
      const items=mediaList(project.config,lot.id);
      const photo=items.find(item=>item.tipo==='foto');
      if(photo){
        visual.querySelector('img').src=photo.url;
        visual.querySelector('img').alt=photo.titulo||lotTitle(lot);
        visual.querySelector('.hz-sector').textContent='Foto del lote';
      }
      visual.querySelector('.hz-media-empty').remove();
      visual.querySelector('.hz-x').onclick=()=>parent.querySelector(':scope > .hz-lot-visual .hz-x').click();
      const tabs=visual.querySelector('.hz-media-tabs');tabs.replaceChildren();
      for(const [kind,label] of [['foto','Fotos del lote'],['panorama','Vista 360°']]){
        const group=items.filter(item=>item.tipo===kind);
        if(!group.length)continue;
        const button=document.createElement('button');button.type='button';button.textContent=label;
        button.onclick=()=>openMediaViewer(group,{title:lotTitle(lot),context:'recorrido'});tabs.append(button);
      }
      const external=mediaURL(project.config.lotes[lot.id].tour360);
      if(external){const link=document.createElement('a');link.href=external;link.textContent='Vista externa';link.target='_blank';link.rel='noopener noreferrer';tabs.append(link);}
      body.querySelector('h3').textContent=lotTitle(lot);
      const badge=body.querySelector('.hz-availability'),state=estados[lot.estado];
      badge.className='hz-availability hz-st-'+(state?(lot.estado==='disponible'?'disponible':'no_disponible'):'sin');
      badge.replaceChildren(document.createElement('i'),document.createTextNode(state||'Sin informar'));
      if(state)badge.querySelector('i').style.background=availabilityColor(projectAvailability(project.config),lot.estado);
      const area=body.querySelector('.hz-big');
      area.replaceChildren(document.createTextNode(lot.superficie_m2==null?'—':Number(lot.superficie_m2).toLocaleString('es-AR')+' '),area.querySelector('small'));
      body.querySelector('.hz-locate').onclick=()=>parent.querySelector(':scope > .hz-lot-body .hz-locate').click();
      const details=body.querySelector('details');const summary=details.querySelector('summary');details.replaceChildren(summary);
      for(const [label,value] of [['Manzana',Number(block[1])],['Número de plano',Number(num[1])],['Tipo o sector',lot.tipo_lote||'Sin informar'],['Precio',lot.precio_usd==null?'Consultar':'USD '+Number(lot.precio_usd).toLocaleString('es-AR')],...(lot.precio_usd!=null?[[unitPriceLabel,unitPriceText(lot)]]:[]),['Frente al agua',lot.frente_agua?'Sí':''],['Notas públicas',lot.notas]]){
        if(!value)continue;
        const row=document.createElement('div');row.className='hz-row';
        const term=document.createElement('span');term.textContent=label;
        const definition=document.createElement('b');definition.textContent=value;row.append(term,definition);details.append(row);
      }
      body.querySelector('.hz-src').textContent='Datos de la ficha del lote. Etapa según el plano.';
      if(!hideLotInquiry('alamos',lot)){
        const consult=document.createElement('a');
        consult.className='hz-consult';consult.href=lotReturnUrl('alamos',lotLinkId(project.config,lot.id),true);consult.target='_top';
        consult.textContent='CONSULTAR POR ESTE LOTE';
        body.querySelector('.hz-locate').before(consult);
      }
      this.append(visual,body);
    }
  });
}

export async function mountAlamosDirectory(section,{getConfig,onAdd,onEdit,onPlan}) {
  const {version,parcels}=await alamosPlan();
  section.innerHTML='<h4 class="form-bloque-titulo">Parcelas del plano de Álamos</h4><label>Manzana y lote del plano<select data-parcel></select></label><p data-status></p><label>Estado al dar de alta<select data-state><option value="">Elegí el estado comercial</option><option value="disponible">Disponible</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option></select></label><button class="btn-secundario" type="button"></button>';
  const select=section.querySelector('[data-parcel]'),state=section.querySelector('[data-state]'),button=section.querySelector('button');
  for(const parcel of parcels)select.add(new Option(parcel.name+' · '+parcel.area+' m²',parcel.key));
  function current(){
    const parcel=parcels.find(p=>p.key===select.value);
    const rows=[...document.querySelectorAll('#lotesBody tr')];
    const row=rows.find(r=>r.dataset.parcelaPendiente===parcel.key || (getConfig().lotes?.[r.dataset.origenId]?.recorrido?.plano?.lote===parcel.key));
    return {parcel,row};
  }
  function refresh(){
    const {row}=current();
    const known=new Set([...document.querySelectorAll('#lotesBody tr')].map(r=>r.dataset.parcelaPendiente || getConfig().lotes?.[r.dataset.origenId]?.recorrido?.plano?.lote));
    const missing=parcels.filter(p=>!known.has(p.key)).length;
    section.hidden=!missing;
    document.getElementById('inv-plan-status').textContent=(parcels.length-missing)+' de '+parcels.length+' parcelas vinculadas al plano de Álamos';
    section.querySelector('[data-status]').textContent=row?'Ya está en el inventario.':missing+' parcelas pendientes.';
    state.parentElement.hidden=!!row;
    button.textContent=row?'Editar lote':'Agregar a la tabla de lotes';
    button.disabled=!row&&!state.value;
  }
  const bulk=document.createElement('button');bulk.type='button';bulk.className='btn-secundario';const actions=document.createElement('div');actions.className='inv-actions';section.append(actions);actions.append(button,bulk);
  bulk.textContent='Incorporar parcelas pendientes';
  bulk.onclick=async()=>{
    bulk.disabled=true;
    try {
      const rows=[...document.querySelectorAll('#lotesBody tr')];
      if(rows.some(r=>!r.dataset.parcelaPendiente && !getConfig().lotes?.[r.dataset.origenId]?.recorrido?.plano?.lote))throw Error('Hay filas sin identificar en el plano. Vinculalas en Ficha antes de completar el inventario.');
      const seen=new Set(rows.map(r=>r.dataset.parcelaPendiente || getConfig().lotes?.[r.dataset.origenId]?.recorrido?.plano?.lote));
      const missing=parcels.filter(p=>!seen.has(p.key));
      if(!missing.length){section.querySelector('[data-status]').textContent='Todas las parcelas ya tienen una fila.';return;}
      await onPlan();
      for(const parcel of missing)onAdd(parcel,'',version,true);
      const quantity=document.getElementById('cantidad_lotes');
      if(quantity)quantity.value=document.querySelectorAll('#lotesBody tr').length;
      document.getElementById('lotesBody').dispatchEvent(new Event('input',{bubbles:true}));
      section.querySelector('[data-status]').textContent=missing.length+' filas preparadas con superficie y posición del plano. Guardá el proyecto.';
    }catch(error){section.querySelector('[data-status]').textContent=error.message;}
    finally{bulk.disabled=false;}
  };
  select.onchange=state.onchange=refresh;
  button.onclick=async()=>{
    const {parcel,row}=current();
    if(row)onEdit(row);
    else if(state.value){
      try{await onPlan();onAdd(parcel,state.value,version);}catch(error){section.querySelector('[data-status]').textContent=error.message;return;}
      state.value='';
    }
    refresh();
  };
  section.addEventListener('focusin',refresh);
  document.addEventListener('miniweb-change',refresh);
  new MutationObserver(refresh).observe(document.getElementById('lotesBody'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-origen-id','data-parcela-pendiente']});
  refresh();
}
