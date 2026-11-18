import {addMapRing} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {paletteTokens} from './miniweb-palettes.mjs';
import {lotCounts,lotRing,salesZones,salesZoneAppearance,paintSalesZone,publicSalesZoneColor,zoneLine,SALES_ZONE_STATES} from './zonas-venta.mjs?v=20261114-anillo7b';

export function tourZones(config,slug,lots){
  if(!config || ['alamos','aldea-los-huemules'].includes(slug))return null;
  const settings=salesZones(config);
  if(!settings.zonas.length)return null;
  const appearances=new Map();
  for(const lot of lots){
    const appearance=salesZoneAppearance(config,lot);
    if(appearance)appearances.set(lot.id,appearance);
    else if(lot.estado==='no_a_la_venta')appearances.set(lot.id,{effective:lot,unavailable:true});
  }
  return {
    settings,
    counts:lotCounts(lots.map(lot=>appearances.get(lot.id)?.effective||lot)),
    legend:tourZoneLegend(settings,lots.map(lot=>appearances.get(lot.id)),paletteTokens(config.paleta).texto),
    mark(parent,lot,points){
      const appearance=appearances.get(lot?.id);
      if(!appearance?.zone||appearance.unavailable)return null;
      const ring=lotRing(parent.ownerDocument,appearance.effective);
      if(points)addMapRing(parent,ring,lot,points);else if(ring)parent.append(ring);
      return ring;
    },
    get:lot=>appearances.get(lot?.id),
    paint(shape,lot,layer){
      if(appearances.get(lot?.id)?.zone)paintSalesZone(shape,config,lot,{},layer);
    }
  };
}

export function tourZoneLegend(settings,appearances,ink){
  const counts=new Map();
  for(const entry of appearances){
    if(entry?.hidden)continue;
    const id=entry?.zone?.id||'';
    counts.set(id,(counts.get(id)||0)+(entry?.unavailable?0:1));
  }
  const rows=settings.zonas.filter(z=>z.estado!=='oculta').map(z=>({
    label:z.nombre+(z.estado==='a_la_venta'?'':' ('+SALES_ZONE_STATES[z.estado]+')'),
    off:z.estado==='suspendida',color:zoneLine(publicSalesZoneColor(z,ink)),count:z.estado==='suspendida'?null:(counts.get(z.id)||0)
  }));
  if(counts.has(''))rows.push({label:'Sin zona',count:counts.get(''),color:null});
  return rows;
}

export const estados = {sin:'Sin informar', disponible:'Disponible', proximamente:'Próximamente', reservado:'Reservado', vendido:'Vendido',no_a_la_venta:'No a la venta'};
const baseColors = {sin:'#ffffff', disponible:'#71dba5', proximamente:'#71acff', reservado:'#efbc74', vendido:'#ff6269',no_a_la_venta:'#919799'};
const stageColors = ['#ffc761','#73f2c2','#8cbfff'];
const modes = {estado:'Disponibilidad', manzana:'Manzana', etapa:'Etapa', uniforme:'Color único'};
const validColor = value => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value);
const range = (value,min,max,fallback) => Number.isFinite(value) ? Math.max(min,Math.min(value,max)) : fallback;
export const blockName = feature => String(feature.block || feature.name?.match(/^Manzana\s+([^·•–—]+?)(?=\s*[·•–—]|\s+Lote\b)/i)?.[1] || '').trim();
const groupKey = (type,id) => id ? type+':'+id : 'base';
function groups(feature,style) {
  const block=blockName(feature);
  const stage=style.stages?.[groupKey('manzana',block)] || feature.stage;
  return {manzana:groupKey('manzana',block),etapa:groupKey('etapa',stage)};
}
function colors(style,key) {
  const [type,id]=key.split(':');
  let fallback='#ffffff';
  if(type==='estado') fallback=baseColors[id] || fallback;
  if(type==='etapa' && Number(id)>0) fallback=stageColors[(Number(id)-1)%stageColors.length] || fallback;
  const custom=style.colors?.[key];
  return {line:validColor(custom?.line)?custom.line:fallback,fill:validColor(custom?.fill)?custom.fill:fallback};
}
export function projectAvailability(config) {
  const sceneStyle=config.recorrido?.escena?.style;
  if(sceneStyle)return sceneStyle;
  const options=config.bloques?.find(block=>block.tipo==='explorador')?.opciones||{};
  const colors={};
  for(const state of Object.keys(baseColors)){
    const fill=options['color_'+state];
    if(validColor(fill))colors['estado:'+state]={fill};
  }
  return {colors,opacity:35};
}
export function availabilityColor(style, state) {
  return colors(style || {}, 'estado:' + state).fill;
}
export function paintLot(element,feature,lot,style={}) {
  const state=Object.hasOwn(estados,lot?.estado)?lot.estado:'sin';
  if(state==='no_a_la_venta'){
    element.dataset.sale=state;
    for(const [key,value] of Object.entries({'--lot-line':'#b7bcbd','--lot-line-opacity':'.9','--lot-fill':'#919799','--lot-opacity':'.26','--lot-focus-opacity':'.26','--lot-width':'1px','--lot-focus-width':'1px','--lot-dash':'3 3'}))element.style.setProperty(key,value);
    return {state,fill:'#919799',showsFill:true,lineLabel:'No a la venta',line:'#b7bcbd'};
  }
  const mode=style.mode || 'estado';
  const key=mode==='estado'?'estado:'+state:groups(feature,style)[mode] || 'base';
  const group=colors(style,key);
  const stateColors=colors(style,'estado:'+state);
  element.dataset.sale=state;
  const fill=state==='sin'?group.fill:stateColors.fill;
  const opacity=range(style.opacity,0,90,18);
  const width=range(style.width,0.5,5,1.25);
  const props={'--lot-line':state!=='sin' && opacity===0?stateColors.line:group.line,
    '--lot-line-opacity':range(style.lineOpacity,40,100,85)/100,'--lot-fill':fill,'--lot-opacity':(state==='sin'?0:opacity)/100,
    '--lot-focus-opacity':Math.min(.94,opacity/100+.22),
    '--lot-width':width+'px','--lot-focus-width':(width+1.4)+'px',
    '--lot-dash':style.dash==='dash'?'7 4':style.dash==='dot'?'1 4':'none'};
  for(const [key,value] of Object.entries(props))element.style.setProperty(key,String(value));
  const lineKey=state!=='sin' && opacity===0?'estado:'+state:key;
  const colon=lineKey.indexOf(':'), type=lineKey.slice(0,colon), id=lineKey.slice(colon+1);
  let lineLabel='Parcela';
  if(type==='estado')lineLabel=id==='sin'?'Sin información':estados[id];
  if(type==='manzana'||type==='etapa')lineLabel=modes[type]+' '+id;
  return {state,fill:state==='sin'?'transparent':fill,showsFill:opacity>0,lineLabel,line:props['--lot-line']};
}
export function mountLotStyle(box,scene,change){
  const style=scene.style ||= {};
  box.innerHTML='<label>Líneas por<select data-mode-style></select></label><label>Paleta de<select data-group></select></label><div class="rg-pair"><label>Color de línea<input type="color" data-color="line"></label><label>Color de sombreado<input type="color" data-color="fill"></label></div><p class="rg-style-note">El sombreado indica la disponibilidad cargada en Lotes.</p><div class="rg-pair"><label>Tipo de línea<select data-dash><option value="solid">Continua</option><option value="dash">Guiones</option><option value="dot">Puntos</option></select></label><label>Grosor<select data-width></select></label></div><label>Opacidad de la línea <output data-line-output></output><input aria-label="Opacidad de la línea" type="range" min="40" max="100" data-line-opacity></label><label>Opacidad del sombreado <output data-fill-output></output><input aria-label="Opacidad del sombreado" type="range" min="0" max="90" step="1" data-opacity></label><label>Rótulos de manzana<select data-labels><option value="alamos">Álamos · número y guía</option><option value="compact">Nombre compacto</option><option value="off">Ocultos</option></select></label><div data-stage-box><label>Manzana<select data-block></select></label><label>Etapa de la manzana<input data-stage maxlength="40" placeholder="Ej. 1"></label><button type="button" data-assign>Asignar etapa</button><p role="status" data-assigned></p></div>';
  const q=s=>box.querySelector(s),mode=q('[data-mode-style]'),group=q('[data-group]'),block=q('[data-block]');
  const width=q('[data-width]'),op=q('[data-opacity]'),lineOp=q('[data-line-opacity]'),dash=q('[data-dash]'),labels=q('[data-labels]'),stage=q('[data-stage]');
  for(const [k,v] of Object.entries(modes)) mode.add(new Option(v,k));
  mode.value=Object.hasOwn(modes,style.mode)?style.mode:'estado';
  for(const n of [.5,1,1.25,1.5,2,3,4,5]) width.add(new Option(n+' px',n));
  width.value=range(style.width,.5,5,1.25);op.value=range(style.opacity,0,90,18);lineOp.value=range(style.lineOpacity,40,100,85);
  dash.value=style.dash||'solid';labels.value=style.labels||'alamos';
  function swatches(){
    const palette=colors(style,group.value);
    for(const field of box.querySelectorAll('[data-color]'))field.value=palette[field.dataset.color];
  }
  function refresh(){
    const selected=group.value,prev=block.value;
    const lots=scene.features.filter(f=>f.kind==='lot');
    const blocks=[...new Set(lots.map(blockName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
    block.replaceChildren(...blocks.map(b=>new Option('Manzana '+b,b)));if(blocks.includes(prev))block.value=prev;
    const choices=new Map();
    if(mode.value!=='estado')choices.set('base','Base · sin grupo');
    for(const f of lots)if(['manzana','etapa'].includes(mode.value)){
      const key=groups(f,style)[mode.value];if(key!=='base')choices.set(key,modes[mode.value]+' '+key.split(':').slice(1).join(':'));
    }
    for(const [key,label] of Object.entries(estados))choices.set('estado:'+key,label);
    group.replaceChildren(...[...choices].map(([k,v])=>new Option(v,k)));
    if(choices.has(selected))group.value=selected;
    q('[data-stage-box]').hidden=mode.value!=='etapa'||!blocks.length;
    const stageValues=new Set(lots.filter(f=>blockName(f)===block.value).map(f=>f.stage).filter(Boolean));
    stage.value=style.stages?.[groupKey('manzana',block.value)] || (stageValues.size===1?[...stageValues][0]:'');
    q('[data-fill-output]').value=op.value+' %';q('[data-line-output]').value=lineOp.value+' %';swatches();
  }
  mode.onchange=()=>{style.mode=mode.value;refresh();change();};
  block.onchange=refresh;group.onchange=swatches;
  q('[data-assign]').onclick=()=>{
    const name=stage.value.trim(),selectedBlock=block.value;
    if(!selectedBlock)return;
    style.stages||={};style.stages[groupKey('manzana',selectedBlock)]=name;
    refresh();change();
    q('[data-assigned]').textContent=name?'Manzana '+selectedBlock+' · Etapa '+name:'Asignación de manzana retirada.';
  };
  for(const field of box.querySelectorAll('[data-color]'))field.oninput=()=>{
    style.colors||={};style.colors[group.value]={...style.colors[group.value],[field.dataset.color]:field.value};change();
  };
  for(const [input,key] of [[dash,'dash'],[labels,'labels'],[width,'width'],[op,'opacity'],[lineOp,'lineOpacity']])input.oninput=()=>{
    style[key]=input===width||input===op||input===lineOp?Number(input.value):input.value;q('[data-fill-output]').value=op.value+' %';q('[data-line-output]').value=lineOp.value+' %';change();
  };
  const palette=document.createElement('datalist');palette.id='rg-palette-'+crypto.randomUUID();
  for(const color of new Set([...Object.values(baseColors),...stageColors,'#154b58','#bd8ce5','#c5c9ce']))palette.append(new Option(color,color));
  box.append(palette);for(const field of box.querySelectorAll('[data-color]'))field.setAttribute('list',palette.id);
  box.closest('details').addEventListener('toggle',()=>{if(box.closest('details').open)refresh();});
  refresh();
  return (f,lot)=>{const key=groups(f,style)[mode.value] || (mode.value==='estado'?'estado:'+(lot?.estado||'sin'):'base');if([...group.options].some(o=>o.value===key)){group.value=key;swatches();}if(blockName(f)){block.value=blockName(f);refresh();}};
}
