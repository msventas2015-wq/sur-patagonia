import {addMapRing,syncMapRings} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {allowedZoneColor,zoneLine,zoneSurface,zoneCountText,zoneLotState,lotCounts,lotRing,salesZoneInterior,publicSalesZoneColor,salesZones,salesZoneColor,salesZoneBoundaries,salesZoneIntersectsBox,nextSalesZoneColor,SALES_ZONE_LABELS,SALES_ZONE_COLORS,SALES_ZONE_STATES} from './zonas-venta.mjs?v=20261114-anillo7b';
import {lotIdentity,fold} from './lotes-planilla.mjs?v=20261113-operativo4';
import {imagePlanMap} from './miniweb-image-plan.mjs?v=20261113-imageplan1';
import {tourMapGeometry} from './miniweb.mjs?v=20261117-cierre-venta1';
import {meters} from './recorrido-geografia.mjs';
import {paletteTokens} from './miniweb-palettes.mjs';
export function mountSalesZones({host,getConfig,setSettings,getRows,getZone,setZone,safeUrl,isReady=()=>true}){
 const doc=host.ownerDocument,make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const ns='http://www.w3.org/2000/svg',svg=(tag,attrs={})=>{const n=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const details=make('details',null,'sales-zones'),summary=make('summary','Zonas'),content=make('div');details.append(summary,content);host.append(details);
 let selected=new Set(),activeZone='',mode='zona',mapNode,status;
 const settings=()=>salesZones(getConfig()),ink=()=>paletteTokens(getConfig().paleta).texto;
 const notify=text=>{if(status)status.textContent=text;};
 const ready=()=>{if(!isReady())throw Error('Esperá a que termine de cargar el proyecto.');};
 const commit=value=>{ready();setSettings(value);};
 const action=callback=>event=>{try{callback(event);}catch(error){notify(error.message);}};
 function chooseZone(id){activeZone=id;selected.clear();refresh();}
 function paintRows(rows,remove=false){
  ready();if(!activeZone)throw Error('Elegí o creá una zona antes de pintarla.');
  for(const row of rows){
   if(remove&&getZone(row)!==activeZone)continue;
   setZone(row,remove?'':activeZone);
   if(remove)selected.delete(row);else selected.add(row);
  }
  renderSelection();drawMap();notify('Zona actualizada. Guardá el proyecto para conservarla.');
 }
 function assign(zoneId){ready();if(!selected.size)throw Error('Elegí uno o más lotes en el plano o en la lista.');for(const row of selected)setZone(row,zoneId);selected.clear();refresh();}
 function mapData(){
  const config=getConfig(),scene=config.recorrido?.escena,plan=scene?.planoActivo==='vectorial'?null:scene?.imagePlan,map=plan?imagePlanMap(plan,safeUrl):tourMapGeometry(scene,scene?.planoActivo==='vectorial'?{lotIds:getRows().map(row=>row.dataset.elementoPendiente||config.lotes?.[row.dataset.origenId]?.elementoRecorrido).filter(Boolean)}:{});
  if(!map)return null;const shapes=[];
  for(const row of getRows()){const card=config.lotes?.[row.dataset.origenId]||{},key=plan?(row.dataset.imagenPendiente||card.elementoImagen):(row.dataset.elementoPendiente||card.elementoRecorrido),shape=map.shapes.get(key);if(!shape)continue;
   shapes.push({row,points:shape.points.trim().split(/\s+/).map(pair=>pair.split(',').map(Number))});
  }
  const data={base:map.base,shapes,width:plan?.width||map.width||843,height:plan?.height||map.height||1500,hasPhoto:map.hasPhoto,photoHeight:1500};
  if(plan||!map.hasPhoto)return data;
  let left=0,top=0,right=1,bottom=1;
  for(const shape of shapes)for(const [x,y] of shape.points){
   left=Math.min(left,x/843);right=Math.max(right,x/843);
   top=Math.min(top,y/1500);bottom=Math.max(bottom,y/1500);
  }
  if(left>=-1e-6&&top>=-1e-6&&right<=1+1e-6&&bottom<=1+1e-6)return data;

  // Keep the photo and every linked contour in the same calibrated plane.
  const [origin,east,south]=scene.raster.corners;
  const photoHeight=843*Math.hypot(...meters(origin,south))/Math.hypot(...meters(origin,east));
  if(!Number.isFinite(photoHeight)||photoHeight<=0)return data;
  for(const shape of shapes){
   shape.beyondPhoto=shape.points.some(([x,y])=>x<0||x>843||y<0||y>1500);
   shape.points=shape.points.map(([x,y])=>[x,y*photoHeight/1500]);
  }
  const x=left*843,y=top*photoHeight;
  const width=(right-left)*843,height=(bottom-top)*photoHeight;
  const pad=.02*Math.max(width,height);
  return {...data,photoHeight,width:width+2*pad,height:height+2*pad,viewBox:[x-pad,y-pad,width+2*pad,height+2*pad].join(' ')};
 }
 function drawMap(){
  if(!mapNode)return;mapNode.replaceChildren();const data=mapData();
  if(!data){mapNode.append(make('p','Cargá el plano desde Mapa y recorrido 360°. Mientras tanto podés asignar zonas desde la lista de lotes.'));return;}
  if(!data.shapes.length)mapNode.append(make('p','El plano está cargado. Todavía no hay lotes del inventario vinculados a sus contornos.'));
  const map=svg('svg',{viewBox:data.viewBox||'0 0 843 1500',preserveAspectRatio:data.viewBox?'xMidYMid meet':'none',role:'group','aria-label':'Elegir o pintar zonas del loteo'});map.style.aspectRatio=data.width+'/'+data.height;
  if(data.hasPhoto)map.append(svg('image',{href:safeUrl(data.base),width:843,height:data.photoHeight,preserveAspectRatio:'none'}));
  if(data.viewBox||!data.hasPhoto)map.style.background='#fff';map.style.setProperty('--zone-map-ink',data.hasPhoto?'#fff':'#243b30');const zones=settings().zonas,mapInk=data.hasPhoto?'#ffffff':'#243b30';
  for(const item of data.shapes){const zone=zones.find(z=>z.id===getZone(item.row)),lotInk=item.beyondPhoto?'#243b30':mapInk,poly=svg('polygon',{points:item.points.map(p=>p.join(',')).join(' '),fill:zone?publicSalesZoneColor(zone,ink()):lotInk,'fill-opacity':zone?(zone.estado==='a_la_venta'?.24:0):data.hasPhoto&&!item.beyondPhoto?.5:.08,stroke:lotInk,'stroke-width':selected.has(item.row)?2.5:1.5,'vector-effect':'non-scaling-stroke',tabindex:0,role:'button','aria-pressed':selected.has(item.row),'aria-label':item.row.querySelector('.l-numero').value+(zone?' · '+zone.nombre:' · Sin zona')});
   const activate=event=>{if(mode==='zona'){if(zone)chooseZone(zone.id);else{selected=new Set([item.row]);renderSelection();drawMap();notify('Este lote está sin zona. Elegí una zona y usá Pintar zona o Asignar elegidos.');}}else if(mode==='pintar')paintRows([item.row],!!event.altKey);};
   poly.addEventListener('click',action(activate));poly.addEventListener('keydown',action(event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();activate(event);}}));map.append(poly);
   if(zone){const lot=zoneLotState(zone,{id:item.row.dataset.origenId,numero:item.row.querySelector('.l-numero').value,estado:item.row.querySelector('.l-estado')?.value});
    const off=lot.estado==='no_a_la_venta';
    zoneSurface(poly,zone.color,off);
    if(off&&item.beyondPhoto)poly.style.stroke=lotInk;
    if(!off){poly.style.stroke=zoneLine(zone.color);poly.style.strokeWidth='1.8px';}
    addMapRing(map,lotRing(doc,lot),lot,item.points);}
  }
  const chosen=data.shapes.filter(item=>getZone(item.row)===activeZone);if(chosen.length){const edges=salesZoneBoundaries(chosen.map(item=>item.points.map(([x,y])=>[x/843,y/1500])));map.append(svg('path',{d:edges.map(([a,b])=>'M'+a[0]*843+' '+a[1]*1500+'L'+b[0]*843+' '+b[1]*1500).join(' '),fill:'none',stroke:data.viewBox?'#243b30':mapInk,'stroke-width':4,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
  const boxInk=data.viewBox?'#243b30':mapInk;
  const rect=svg('rect',{fill:boxInk,'fill-opacity':.15,stroke:boxInk,'stroke-width':2,'vector-effect':'non-scaling-stroke',visibility:'hidden'});map.append(rect);
  const point=event=>{
   const local=new DOMPoint(event.clientX,event.clientY).matrixTransform(map.getScreenCTM().inverse());
   return [local.x,local.y];
  };
  let drag=null;
  function dragBounds(event){
   if(drag?.id!==event.pointerId)return null;
   // Screen pixels keep a click or a one-dimensional gesture from painting adjacent lots.
   if(Math.abs(event.clientX-drag.clientX)<4||Math.abs(event.clientY-drag.clientY)<4)return null;
   const [x,y]=point(event);
   return [Math.min(x,drag.x),Math.min(y,drag.y),Math.max(x,drag.x),Math.max(y,drag.y)];
  }
  function endDrag(event){
   if(drag?.id!==event.pointerId)return;
   drag=null;rect.setAttribute('visibility','hidden');
  }
  map.onpointerdown=action(event=>{
   if(drag||mode!=='recuadro'||event.button!==0)return;
   if(!activeZone)throw Error('Elegí una zona antes de usar el recuadro.');
   event.preventDefault();map.setPointerCapture(event.pointerId);
   const [x,y]=point(event);
   drag={id:event.pointerId,x,y,clientX:event.clientX,clientY:event.clientY};
  });
  map.onpointermove=event=>{
   if(drag?.id!==event.pointerId)return;
   const bounds=dragBounds(event);
   rect.setAttribute('visibility',bounds?'visible':'hidden');
   if(!bounds)return;
   const [left,top,right,bottom]=bounds;
   for(const [key,value] of Object.entries({x:left,y:top,width:right-left,height:bottom-top}))rect.setAttribute(key,value);
  };
  map.onpointerup=action(event=>{
   const bounds=dragBounds(event);endDrag(event);
   if(!bounds)return;
   const items=data.shapes.filter(item=>salesZoneIntersectsBox(item.points,bounds));
   if(items.length)paintRows(items.map(item=>item.row),!!event.altKey);
  });
  map.onpointercancel=endDrag;map.onlostpointercapture=endDrag;mapNode.append(map);syncMapRings(map);
 }
 function renderSelection(){const count=content.querySelector('[data-selection]');if(count)count.textContent=selected.size+' '+(selected.size===1?'lote elegido':'lotes elegidos');for(const input of content.querySelectorAll('[data-row-key]'))input.checked=selected.has(getRows().find(r=>r.dataset.id===input.dataset.rowKey));}
 function refresh(){
  if(doc.activeElement?.dataset.zoneName&&content.contains(doc.activeElement))return;
  const data=settings(),rows=getRows(),live=new Set(rows);selected=new Set([...selected].filter(r=>live.has(r)));if(!data.zonas.some(z=>z.id===activeZone))activeZone=data.zonas[0]?.id||'';
  const previousTarget=content.querySelector('.zone-assignment select');
  const keepTarget=previousTarget?.dataset.paintZone===activeZone&&data.zonas.some(zone=>zone.id===previousTarget.value);
  let top=content.querySelector('.zone-top');if(top){for(const child of [...content.children])if(child!==top)child.remove();}else{top=make('div',null,'zone-top');content.append(top);top.append(make('p','Las zonas agrupan el loteo y le dan color al plano. El precio, la superficie y el estado propio se editan por lote.'));
  const controls=make('div',null,'zone-controls');
  for(const [title,key,options]of [['Llamar a los grupos','rotulo',SALES_ZONE_LABELS.map(v=>[v,v])]]){
   const label=make('label',title),select=make('select');for(const [value,text]of options){const option=make('option',text);option.value=value;select.append(option);}select.value=data[key];select.dataset.zoneSetting=key;select.onchange=action(()=>{commit({...settings(),[key]:select.value});refresh();});label.append(select);controls.append(label);
  }top.append(controls);
  const create=make('div',null,'zone-create'),newName=make('input'),newColor=make('input'),add=make('button','Crear zona','btn-secundario');newName.placeholder='Nombre de la zona';newName.setAttribute('aria-label','Nombre de la nueva zona');newColor.type='color';newColor.value=nextSalesZoneColor(data.zonas);newColor.setAttribute('aria-label','Color de la nueva zona');add.type='button';add.onclick=action(()=>{const nombre=newName.value.trim();if(!allowedZoneColor(newColor.value))throw Error('Elegí un azul, celeste o violeta. Los colores de disponibilidad están reservados.');if(!nombre)throw Error('Escribí un nombre para la zona.');if(settings().zonas.some(z=>fold(z.nombre)===fold(nombre)))throw Error('Ya existe una zona con ese nombre.');const id=crypto.randomUUID();commit({...settings(),zonas:[...settings().zonas,{id,nombre,color:newColor.value,estado:'a_la_venta'}]});activeZone=id;mode='zona';selected.clear();newName.value='';refresh();newColor.value=nextSalesZoneColor(settings().zonas);});create.append(newName,newColor,add);top.append(create);}
  for(const select of top.querySelectorAll('[data-zone-setting]'))select.value=data[select.dataset.zoneSetting];
  const workspace=make('div',null,'zone-workspace'),side=make('div',null,'zone-sidebar'),main=make('div',null,'zone-main');workspace.append(side,main);content.append(workspace);
  for(const zone of data.zonas){const button=make('button',null,'zone-pick'),dot=make('i'),text=make('span');button.type='button';button.dataset.zonePick=zone.id;button.setAttribute('aria-pressed',zone.id===activeZone);dot.style.background=salesZoneColor(zone,ink());text.append(make('strong',zone.nombre),make('small',SALES_ZONE_STATES[zone.estado]+' · '+rows.filter(r=>getZone(r)===zone.id).length+' lotes'));button.append(dot,text);button.onclick=()=>chooseZone(zone.id);const entry=make('div',null,'zone-switch-row'),toggle=make('button');toggle.type='button';toggle.className='zone-switch';
   const on=zone.estado==='a_la_venta';toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(on));toggle.setAttribute('aria-label','Venta de '+zone.nombre);
   toggle.title=on?'Apagar '+zone.nombre:'Prender '+zone.nombre;
   toggle.onclick=action(()=>{commit({...settings(),zonas:settings().zonas.map(z=>z.id===zone.id?{...z,estado:on?'suspendida':'a_la_venta'}:z)});refresh();content.querySelectorAll('[role=switch]')[data.zonas.indexOf(zone)]?.focus({preventScroll:true});});
   entry.append(button,toggle);side.append(entry);}
  const byId=new Map(data.zonas.map(z=>[z.id,z]));
  const active=lotCounts(rows.map(row=>zoneLotState(byId.get(getZone(row)),{estado:row.querySelector('.l-estado')?.value})));
  side.append(make('p',zoneCountText(active),'zone-help'));
  const zone=data.zonas.find(z=>z.id===activeZone);
  if(zone){
   const fields=make('div',null,'zone-data'),nameLabel=make('label','Nombre'),name=make('input');name.value=zone.nombre;name.dataset.zoneName=zone.id;nameLabel.append(name);name.onchange=action(()=>{const nombre=name.value.trim();if(!nombre||settings().zonas.some(z=>z.id!==zone.id&&fold(z.nombre)===fold(nombre)))throw Error('El nombre está vacío o se repite.');commit({...settings(),zonas:settings().zonas.map(z=>z.id===zone.id?{...z,nombre}:z)});});
   const colorLabel=make('label','Color de la zona'),colors=make('select'),picker=make('input');for(const [i,value]of SALES_ZONE_COLORS.entries()){const option=make('option',['Azul profundo','Celeste glaciar','Violeta','Azul andino','Lila','Azul laguna'][i]);option.value=value;colors.append(option);}colors.append(new Option('Personalizado','custom'));colors.value=SALES_ZONE_COLORS.includes(salesZoneColor(zone,ink()))?salesZoneColor(zone,ink()):'custom';picker.type='color';picker.value=salesZoneColor(zone,ink());picker.setAttribute('aria-label','Color libre de '+zone.nombre);const recolor=value=>{if(!allowedZoneColor(value)){picker.value=salesZoneColor(zone);throw Error('Elegí un azul, celeste o violeta. Los colores de disponibilidad están reservados.');}commit({...settings(),zonas:settings().zonas.map(z=>z.id===zone.id?{...z,color:value}:z)});drawMap();};colors.onchange=action(()=>{if(colors.value==='custom')picker.click();else{picker.value=salesZoneColor({color:colors.value},ink());recolor(colors.value);}});picker.onchange=action(()=>{colors.value='custom';recolor(picker.value);});colorLabel.append(colors,picker);
   const remove=make('button','Borrar zona','btn-secundario');remove.type='button';remove.onclick=action(()=>{const count=rows.filter(r=>getZone(r)===zone.id).length;if(count&&!confirm('¿Borrar '+zone.nombre+'? Sus '+count+' lotes quedarán sin zona y mantendrán sus estados.'))return;for(const row of rows)if(getZone(row)===zone.id)setZone(row,'');commit({...settings(),zonas:settings().zonas.filter(z=>z.id!==zone.id)});activeZone='';selected.clear();refresh();});
   fields.append(nameLabel,colorLabel,remove);main.append(fields);
   if(zone.estadoAnterior)main.append(make('p','Estado anterior conservado: '+SALES_ZONE_STATES[zone.estadoAnterior]+'.','zone-help'));
  }else main.append(make('p','Creá la primera zona para marcar sus lotes.'));
  const assignment=make('div',null,'zone-assignment'),target=make('select');target.setAttribute('aria-label','Zona para los lotes elegidos');target.append(new Option('Elegí una zona',''));for(const z of data.zonas)target.append(new Option(z.nombre,z.id));
  target.dataset.paintZone=activeZone;target.value=keepTarget?previousTarget.value:activeZone;
  const apply=make('button','Asignar elegidos','btn-secundario');apply.type='button';apply.onclick=action(()=>{if(!target.value)throw Error('Elegí una zona de destino.');assign(target.value);});
  const clear=make('button','Quitar zona a elegidos','btn-secundario');clear.type='button';clear.onclick=action(()=>assign(''));const count=make('span');count.dataset.selection='';assignment.append(target,apply,clear,count);main.append(assignment);
  const tools=make('div',null,'zone-tools');for(const [value,text]of [['zona','Elegir zona'],['pintar','Pintar zona'],['recuadro','Pintar con recuadro']]){const button=make('button',text,'btn-secundario');button.type='button';button.setAttribute('aria-pressed',mode===value);button.onclick=()=>{mode=value;refresh();};tools.append(button);}
  const blocks=[...new Set(rows.map(r=>lotIdentity({numero:r.querySelector('.l-numero').value}).block).filter(Boolean))],whole=make('select');whole.setAttribute('aria-label','Elegir toda una manzana');whole.append(new Option('Toda la manzana…',''));for(const b of blocks)whole.append(new Option(b,b));whole.onchange=()=>{selected=new Set(rows.filter(r=>lotIdentity({numero:r.querySelector('.l-numero').value}).block===whole.value));whole.value='';renderSelection();drawMap();};tools.append(whole);main.append(tools,make('p','Elegí una zona en la lista o tocando cualquiera de sus lotes. En Pintar, tocá lotes o usá el recuadro. Alt/Opción quita lotes de la zona elegida.','zone-help'));
  mapNode=make('div',null,'zone-map');main.append(mapNode);const list=make('details',null,'zone-lot-list');list.append(make('summary','Elegir lotes desde la lista'));
  if(zone&&rows.some(row=>getZone(row)===zone.id)){
   const chooseMembers=make('button','Elegir todos los lotes de '+zone.nombre,'btn-secundario');
   chooseMembers.type='button';
   chooseMembers.onclick=()=>{selected=new Set(getRows().filter(row=>getZone(row)===zone.id));renderSelection();drawMap();};
   list.append(chooseMembers);
  }
  for(const row of rows){const label=make('label'),box=make('input');box.type='checkbox';box.dataset.rowKey=row.dataset.id;box.checked=selected.has(row);box.onchange=()=>{if(box.checked)selected.add(row);else selected.delete(row);renderSelection();drawMap();};label.append(box,make('span',row.querySelector('.l-numero').value));list.append(label);}main.append(list,make('p','Los lotes sin zona mantienen su estado individual. Guardá el proyecto para conservar los cambios.','zone-help'));status=make('p');status.setAttribute('role','status');main.append(status);renderSelection();drawMap();
 }
 details.addEventListener('toggle',()=>{if(details.open)refresh();});let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(details.open){refresh();return;}const data=settings(),rows=getRows();for(const button of content.querySelectorAll('[data-zone-pick]')){const zone=data.zonas.find(z=>z.id===button.dataset.zonePick);if(zone)button.querySelector('small').textContent=SALES_ZONE_STATES[zone.estado]+' · '+rows.filter(row=>getZone(row)===zone.id).length+' lotes';}});};
 doc.addEventListener('proyecto-cargado',schedule);doc.addEventListener('miniweb-change',schedule);doc.getElementById('lotesBody').addEventListener('input',schedule);new MutationObserver(schedule).observe(doc.getElementById('lotesBody'),{childList:true});refresh();
 return {refresh,schedule,clearPending(){for(const row of getRows())delete row.dataset.zonaVentaPendiente;refresh();}};
}
