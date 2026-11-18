import {syncMapRings} from './zonas-anillos.mjs?v=20261114-anillo7b';
import {imagePolygonIssue,imagePlanIssue,snapImagePoint,orderImageCorners,imageInside,imagePlanV2,imageLots,facePoints,faceLabelPoint,addLooseLot,addBlock,divideBlock,identifyFace,renameLot,nextLotNumber,finishBlock,moveGraphVertices,insertGraphPoint,removeGraphPoint,lineVertexIds,divisionRemoval,removeDivision} from './recorrido-grilla.mjs?v=20261116-plano6';
export {imagePolygonIssue,imagePlanIssue,snapImagePoint,orderImageCorners,imagePlanV2,imageLots};
const svg=(tag,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9;
export function mountImageTracer({root,controls,getPlan,appearance=()=>null,paintZone=()=>{},markZone=()=>null,onChange,onState=()=>{},isLinked=()=>false}){
 let selected='',blockId='',mode='block',draft=null,zoom=1,svgRoot,drag=null,ignoreClickUntil=0,lineId='',retired=[],history=[],pendingMerge=null;
 controls.classList.add('rg-calco-controls');
 controls.innerHTML=`<div class="rg-grid-modes" role="group" aria-label="Cómo dibujar"><button type="button" data-grid-mode="loose">Lote suelto</button><button type="button" data-grid-mode="block" aria-pressed="true">Manzana con divisiones</button><button type="button" data-grid-mode="adjust">Acomodar</button></div>
 <section class="rg-grid-step" data-grid-draw><h3>1 · Dibujá el contorno</h3><p data-grid-help>Tocá las esquinas en cualquier orden. Arrastrá un punto para corregirlo; tocá el primero para cerrar. Podés marcar más de cuatro.</p><div class="rg-pair"><label>Manzana<input data-image-block maxlength="60" value="1"></label><label data-loose-number>Número de lote<input data-image-number maxlength="60" value="1"></label></div><div class="rg-load-actions"><button type="button" data-image-new>Nueva manzana</button><button type="button" data-image-close>Cerrar contorno</button><button type="button" data-image-cancel>Cancelar dibujo</button></div></section>
 <section class="rg-grid-step" data-grid-divide><h3>2 · Dividila</h3><div class="rg-pair"><label>Lotes por fila<input data-grid-cols type="number" min="1" max="30" value="4"></label><label>Filas<input data-grid-rows type="number" min="1" max="20" value="2"></label></div><button type="button" data-grid-divide-action>Dividir</button></section>
 <section class="rg-grid-step" data-grid-identify><h3>3 · Tocá cada espacio</h3><p>Un clic lo convierte en lote y le da el siguiente número libre. Los espacios que no tocás no cuentan.</p><p data-grid-count></p><button type="button" data-grid-finish>Terminar manzana</button></section>
 <section class="rg-grid-step" data-grid-adjust><h3>Acomodar puntos y líneas</h3><p>Arrastrá un punto: mueve todos los lotes que lo comparten. Arrastrá una división para moverla entera. Doble clic en una línea agrega un punto; doble clic en un punto agregado lo quita.</p><button type="button" data-grid-remove-line>Quitar división seleccionada</button><p data-grid-line-note class="rg-load-note">Tocá una línea interna para seleccionarla.</p></section>
 <div class="rg-load-actions"><button type="button" data-image-undo>Deshacer último</button></div>
 <section class="rg-grid-step" data-grid-selected hidden><h3>Lote seleccionado</h3><p data-grid-selected-name></p><label>Corregir número<input data-grid-edit-number maxlength="60"></label><button type="button" data-image-name>Guardar número</button><button type="button" data-image-hide>Ocultar este lote del calco</button></section>
 <section class="rg-grid-confirm" data-grid-confirm hidden role="group" aria-label="Revisar unión de lotes"><h3>Revisá antes de quitar la división</h3><div data-grid-merge-choices></div><p>Las fichas que no elijas se retiran al guardar el proyecto. Sus datos no se suman automáticamente. Podés cancelar o deshacer antes de guardar.</p><div class="rg-load-actions"><button type="button" data-grid-merge-ok>Confirmar unión</button><button type="button" data-grid-merge-cancel>Cancelar unión</button></div></section>
 <details class="rg-load-advanced"><summary>Lotes existentes y ajuste al vecino</summary><label>Lote del calco<select data-image-list></select></label><label><input type="checkbox" data-image-snap checked> Pegar al borde del vecino</label><label><input type="checkbox" data-image-show-hidden> Ver lotes ocultos</label><p data-image-hidden-note></p></details><p data-image-status role="status" aria-live="polite"></p>`;
 const q=s=>controls.querySelector(s);
 function plan(){const p=getPlan();if(p?.version===1){const migrated=imagePlanV2(p);for(const k of Object.keys(p))delete p[k];Object.assign(p,migrated);}return p;}
 const face=()=>plan()?.faces.find(f=>f.id===selected),block=()=>plan()?.blocks.find(b=>b.id===blockId);
 const tell=t=>{q('[data-image-status]').textContent=t;onState();};
 const safe=fn=>e=>{try{fn(e);}catch(error){tell(error.message);}};
 function snapshot(){return {plan:structuredClone(plan()),draft:structuredClone(draft),selected,blockId,mode,lineId,retired:structuredClone(retired),blockValue:q('[data-image-block]').value,number:q('[data-image-number]').value};}
 function checkpoint(s=snapshot()){history.push(s);if(history.length>150)history.shift();}
 function replace(next){const p=getPlan();for(const k of Object.keys(p))delete p[k];Object.assign(p,next);}
 function applied(next,message,before){checkpoint(before);replace(next);pendingMerge=null;onChange();tell(message);render();}
 function setMode(next){if(draft?.points.length)throw Error('Cerrá el contorno o cancelá el dibujo antes de cambiar de modo.');mode=next;draft=null;pendingMerge=null;render();tell(next==='adjust'?'Arrastrá un punto o una división. Tocá un lote para corregir su número.':next==='loose'?'Elegí Nuevo lote y marcá sus esquinas.':'Elegí Nueva manzana y marcá su contorno.');}
 for(const b of controls.querySelectorAll('[data-grid-mode]'))b.onclick=safe(()=>setMode(b.dataset.gridMode));
 function select(id){selected=id;const f=face();if(f?.blockId)blockId=f.blockId;if(f?.lot){q('[data-grid-edit-number]').value=f.lot.number;q('[data-image-block]').value=f.lot.block;}render();tell(f?.lot?f.lot.name+' seleccionado. Podés corregir su número.':'Espacio seleccionado.');}
 function closeContour(){
  if(!draft)throw Error('Elegí Nueva manzana o Nuevo lote para empezar.');
  const points=orderImageCorners(draft.points),name=q('[data-image-block]').value,number=q('[data-image-number]').value;
  const before=snapshot(),result=draft.kind==='block'?addBlock(plan(),points,name):addLooseLot(plan(),points,name,number),kind=draft.kind;
  draft=null;selected=kind==='loose'?result.id:'';if(kind==='block')blockId=result.id;
  if(kind==='loose')q('[data-grid-edit-number]').value=number;
  applied(result.plan,kind==='block'?'Contorno cerrado. Elegí lotes por fila y filas; después tocá Dividir.':'Lote cerrado. Su ficha se incorpora al guardar.',before);
 }
 q('[data-image-new]').onclick=safe(()=>{
  if(!plan())throw Error('Subí una imagen primero.');if(draft?.points.length)throw Error('Cerrá el dibujo actual o cancelalo antes de empezar otro.');
  if(block()&&!block().finished&&mode==='block')throw Error('Terminá esta manzana antes de empezar otra.');
  checkpoint();selected='';lineId='';draft={kind:mode==='loose'?'loose':'block',points:[]};
  if(draft.kind==='block'){blockId='';const used=new Set(plan().blocks.map(b=>b.name));let n=1;while(used.has(String(n)))n++;if(used.has(q('[data-image-block]').value.trim()))q('[data-image-block]').value=String(n);}
  tell('Marcá las esquinas en cualquier orden. Tocá el primer punto o Cerrar contorno para terminar.');render();
 });
 q('[data-image-close]').onclick=safe(closeContour);
 q('[data-image-cancel]').onclick=()=>{checkpoint();draft=null;tell('Dibujo cancelado. Los contornos cerrados se conservan.');render();};
 q('[data-image-undo]').onclick=()=>{
  const prev=history.pop();if(!prev)return;replace(prev.plan);({draft,selected,blockId,mode,lineId,retired}=prev);pendingMerge=null;q('[data-image-block]').value=prev.blockValue;q('[data-image-number]').value=prev.number;q('[data-grid-edit-number]').value=face()?.lot?.number||'';onChange();tell('Último paso deshecho.');render();
 };
 q('[data-grid-divide-action]').onclick=safe(()=>{const p=divideBlock(plan(),blockId,Number(q('[data-grid-cols]').value),Number(q('[data-grid-rows]').value));selected='';lineId='';applied(p,'División preparada. Tocá cada espacio en el orden de numeración que quieras.');});
 q('[data-grid-finish]').onclick=safe(()=>{const p=finishBlock(plan(),blockId);applied(p,'Manzana terminada, lista para guardar. Podés empezar otra o agregar un lote suelto.');});
 q('[data-image-name]').onclick=safe(()=>applied(renameLot(plan(),selected,q('[data-image-block]').value,q('[data-grid-edit-number]').value),'Número actualizado.'));
 q('[data-image-hide]').onclick=safe(()=>{const p=structuredClone(plan()),f=p.faces.find(f=>f.id===selected);if(!f?.lot)return;f.hidden=!f.hidden;const issue=imagePlanIssue(p);if(issue)throw Error(issue);applied(p,f.hidden?'Lote oculto. Su ficha se conserva.':'Lote visible otra vez.');});
 q('[data-image-show-hidden]').onchange=render;q('[data-image-list]').onchange=e=>select(e.target.value);
 function chooseRemoval(){
  const groups=divisionRemoval(plan(),lineId),affected=groups.flatMap(ids=>ids.map(id=>plan().faces.find(f=>f.id===id))).filter(f=>f.lot);
  if(!affected.length){const result=removeDivision(plan(),lineId);lineId='';applied(result.plan,'División quitada. Los espacios vecinos se unieron.');return;}
  pendingMerge={lineId,groups};const box=q('[data-grid-merge-choices]');box.replaceChildren();
  for(const ids of groups){const assigned=ids.map(id=>plan().faces.find(f=>f.id===id)).filter(f=>f.lot);if(!assigned.length)continue;const label=document.createElement('label');label.append('Se unen '+assigned.map(f=>f.lot.name+(isLinked(f.id)?' (con ficha)':'')).join(', ')+'. Conservar:');const select=document.createElement('select');select.dataset.mergeGroup=ids[0];select.append(new Option('Elegí qué lote conservar',''),...assigned.map(f=>new Option(f.lot.name,f.id)));label.append(select);box.append(label);}
  render();q('[data-grid-confirm]').scrollIntoView({block:'nearest'});tell('La división afecta lotes identificados. Elegí qué ficha conservar en cada unión.');
 }
 q('[data-grid-remove-line]').onclick=safe(chooseRemoval);
 q('[data-grid-merge-cancel]').onclick=()=>{pendingMerge=null;render();tell('Unión cancelada. No se cambió ningún lote.');};
 q('[data-grid-merge-ok]').onclick=safe(()=>{
  if(!pendingMerge)return;const choices=Object.fromEntries([...q('[data-grid-merge-choices]').querySelectorAll('select')].map(s=>{if(!s.value)throw Error('Elegí qué lote conservar en cada unión.');return [s.dataset.mergeGroup,s.value];})),before=snapshot(),result=removeDivision(plan(),pendingMerge.lineId,choices);
  retired.push(...result.retired);selected='';lineId='';applied(result.plan,'Unión confirmada en el dibujo. Se aplica al inventario al guardar el proyecto.',before);
 });
 function point(e,snap=true){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svgRoot.getScreenCTM().inverse()),v=[Math.max(0,Math.min(1,p.x/plan().width)),Math.max(0,Math.min(1,p.y/plan().height))];if(!snap||!q('[data-image-snap]').checked)return v;const scale=svgRoot.getScreenCTM();return snapImagePoint(v,imageLots(plan()).filter(f=>f.id!==selected),plan().width*Math.hypot(scale.a,scale.b),plan().height*Math.hypot(scale.c,scale.d));}
 const coords=(p,points)=>points.map(v=>[v[0]*p.width,v[1]*p.height].join(',')).join(' ');
 function activateFace(f){
  if(appearance(f.id)?.unavailable)return;
  if(draft){tell('Ya hay un lote o una manzana en ese lugar. Marcá fuera de su contorno. No se agregó ningún punto.');return;}
  if(pendingMerge)throw Error('Confirmá o cancelá la unión primero.');
  lineId='';
  if(!f.lot){blockId=f.blockId;const b=block();if(!b?.divided)throw Error('Tocá Dividir antes de marcar los lotes.');const next=identifyFace(plan(),f.id);selected=f.id;q('[data-grid-edit-number]').value=next.faces.find(n=>n.id===f.id).lot.number;applied(next,'Lote '+q('[data-grid-edit-number]').value+' marcado. Tocá el siguiente espacio o Terminá la manzana.');}
  else select(f.id);
 }
 function clickSpace(e){
  if(draft)return false;
  const p=point(e,false),f=plan().faces.find(f=>!f.hidden&&imageInside(p,facePoints(plan(),f)));
  if(!f)return false;activateFace(f);return true;
 }
 function onLine(e,edge){
  const p=point(e,false),a=plan().vertices[edge.a],b=plan().vertices[edge.b],A=[a[0]*plan().width,a[1]*plan().height],B=[b[0]*plan().width,b[1]*plan().height],P=[p[0]*plan().width,p[1]*plan().height],dx=B[0]-A[0],dy=B[1]-A[1],t=Math.max(0,Math.min(1,((P[0]-A[0])*dx+(P[1]-A[1])*dy)/(dx*dx+dy*dy))),m=svgRoot.getScreenCTM();
  return Math.hypot(P[0]-A[0]-t*dx,P[1]-A[1]-t*dy)*Math.hypot(m.a,m.b)<=1.25;
 }
 function selectLine(id){lineId=id||'';for(const el of svgRoot.querySelectorAll('.rg-grid-edge'))el.classList.toggle('selected',!!lineId&&plan().edges.find(e=>e.id===el.dataset.edgeId)?.lineId===lineId);updateControls();tell(lineId?'División seleccionada. Arrastrala para moverla o usá Quitar división seleccionada.':'Borde seleccionado. Doble clic agrega un punto.');}
 function syncScreenGeometry(p=plan()){
  syncMapRings(svgRoot);
  const m=svgRoot?.getScreenCTM();if(!p||!m)return;const scale=Math.hypot(m.a,m.b);if(!scale)return;
  const anchor=(el,v)=>el.setAttribute('transform','translate('+v[0]*p.width+' '+v[1]*p.height+') scale('+1/scale+')');
  for(const el of svgRoot.querySelectorAll('[data-label-id]')){const f=p.faces.find(f=>f.id===el.dataset.labelId);if(f)anchor(el,faceLabelPoint(p,f));}
  for(const el of svgRoot.querySelectorAll('[data-vertex-id]')){const v=p.vertices[el.dataset.vertexId];if(v)anchor(el,v);}
  for(const el of svgRoot.querySelectorAll('[data-draft-index]')){const v=draft?.points[Number(el.dataset.draftIndex)];if(v)anchor(el,v);}
 }
 const resizeObserver=new ResizeObserver(()=>syncScreenGeometry());resizeObserver.observe(root);
 function updatePositions(p){
  for(const el of svgRoot.querySelectorAll('[data-face-id]')){const f=p.faces.find(f=>f.id===el.dataset.faceId);if(f)el.setAttribute('points',coords(p,facePoints(p,f)));}
  for(const el of svgRoot.querySelectorAll('[data-edge-id]')){const e=p.edges.find(e=>e.id===el.dataset.edgeId);if(e){const A=p.vertices[e.a],B=p.vertices[e.b];for(const [k,v] of Object.entries({x1:A[0]*p.width,y1:A[1]*p.height,x2:B[0]*p.width,y2:B[1]*p.height}))el.setAttribute(k,v);}}
  syncScreenGeometry(p);
 }
 function beginDrag(e,{ids=[],draftIndex=null,line=null,edge=null}){
  e.preventDefault();e.stopPropagation();drag={ids,draftIndex,line,edge,start:point(e,false),x:e.clientX,y:e.clientY,moved:false,before:snapshot()};e.currentTarget.setPointerCapture(e.pointerId);
 }
 function dragMove(e){
  if(!drag)return;e.stopPropagation();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;if(!drag.moved)return;const at=point(e,false),delta=[at[0]-drag.start[0],at[1]-drag.start[1]];
  if(drag.draftIndex!=null){draft.points[drag.draftIndex]=at;const polygon=svgRoot.querySelector('.rg-calco-draft');polygon?.setAttribute('points',coords(plan(),orderImageCorners(draft.points)));syncScreenGeometry();}
  else{const p=structuredClone(drag.before.plan);for(const id of drag.ids)p.vertices[id]=[p.vertices[id][0]+delta[0],p.vertices[id][1]+delta[1]];updatePositions(p);}drag.delta=delta;
 }
 function dragEnd(e){
  if(!drag)return;e.preventDefault();e.stopPropagation();const d=drag;drag=null;
  if(!d.moved){if(d.draftIndex===0&&draft?.points.length>=3)closeContour();else if(!draft&&!clickSpace(e)&&d.edge&&onLine(e,plan().edges.find(edge=>edge.id===d.edge)))selectLine(d.line);return;}
  ignoreClickUntil=Date.now()+180;
  if(d.draftIndex!=null){const issue=draft.points.length>=3?imagePolygonIssue(orderImageCorners(draft.points),plan().faces.filter(f=>!f.hidden).map(f=>({points:facePoints(plan(),f),name:f.lot?.name||'la manzana'}))):'';if(issue){draft=d.before.draft;render();throw Error(issue+' El punto volvió a su lugar.');}checkpoint(d.before);render();tell('Punto movido. Tocá el primero para cerrar.');}
  else{try{const p=moveGraphVertices(d.before.plan,d.ids,d.delta);applied(p,d.ids.length>1?'División movida con todos sus cruces.':'Punto movido en todos los lotes que lo comparten.',d.before);}catch(error){render();throw Error(error.message+' La corrección no se aplicó.');}}
 }
 function attachDrag(el,info){el.onpointerdown=e=>beginDrag(e,info);el.onpointermove=dragMove;el.onpointerup=safe(dragEnd);el.onpointercancel=()=>{if(drag?.draftIndex!=null)draft=drag.before.draft;drag=null;render();};}
 function render(){
  const p=plan();if(!p)return;root.replaceChildren();
  const s=svgRoot=svg('svg',{viewBox:[p.width*(1-1/zoom)/2,p.height*(1-1/zoom)/2,p.width/zoom,p.height/zoom].join(' '),'aria-label':'Calcar lotes y manzanas sobre la imagen',role:'group',class:'rg-calco-svg'});s.append(svg('image',{href:p.url,x:0,y:0,width:p.width,height:p.height,preserveAspectRatio:'none'}));root.append(s);
  const shown=p.faces.filter(f=>!appearance(f.id)?.hidden&&(!f.hidden||q('[data-image-show-hidden]').checked)),faceIds=new Set(shown.map(f=>f.id)),shownVertexIds=new Set(shown.flatMap(f=>f.vertices));
  for(const f of shown){
   const name=f.lot?.name||'Espacio sin lote de Manzana '+p.blocks.find(b=>b.id===f.blockId)?.name,g=svg('polygon',{points:coords(p,facePoints(p,f)),class:'rg-grid-face'+(f.lot?' is-lot':'')+(f.id===selected?' selected':'')+(f.hidden?' hidden-lot':''),'data-face-id':f.id,'aria-label':name,tabindex:0,role:'button'});
   paintZone(g,f.id,s);
   if(appearance(f.id)?.unavailable){g.removeAttribute('tabindex');g.setAttribute('aria-disabled','true');s.append(g);continue;}
   const pick=safe(()=>{if(Date.now()<ignoreClickUntil)return;activateFace(f);});
   g.onclick=e=>{e.stopPropagation();pick(e);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e);}};s.append(g);markZone(s,f.id,facePoints(p,f).map(([x,y])=>[x*p.width,y*p.height]));
  }
  for(const edge of p.edges){
   if(!shownVertexIds.has(edge.a)||!shownVertexIds.has(edge.b)||!shown.some(f=>faceIds.has(f.id)&&f.vertices.some((v,i)=>v===edge.a&&f.vertices[(i+1)%f.vertices.length]===edge.b||v===edge.b&&f.vertices[(i+1)%f.vertices.length]===edge.a)))continue;
   const A=p.vertices[edge.a],B=p.vertices[edge.b],at={x1:A[0]*p.width,y1:A[1]*p.height,x2:B[0]*p.width,y2:B[1]*p.height,'data-edge-id':edge.id};s.append(svg('line',{...at,class:'rg-grid-edge-shadow'}),svg('line',{...at,class:'rg-grid-edge'+(edge.lineId===lineId?' selected':'')}));
   const hit=svg('line',{...at,class:'rg-grid-hit',tabindex:0,role:'button','aria-label':edge.lineId?'División interna: arrastrar para mover o doble clic para agregar punto':'Borde: doble clic para agregar punto'});s.append(hit);
   hit.onclick=safe(e=>{e.stopPropagation();if(draft||Date.now()<ignoreClickUntil)return;if(clickSpace(e))return;if(onLine(e,edge))selectLine(edge.lineId);});
   hit.ondblclick=safe(e=>{e.preventDefault();e.stopPropagation();if(draft||!onLine(e,edge))return;const result=insertGraphPoint(plan(),edge.id,point(e,false));applied(result.plan,'Punto agregado. Arrastralo para quebrar la línea.');});
   if(edge.lineId&&!draft)attachDrag(hit,{ids:lineVertexIds(p,edge.lineId),line:edge.lineId,edge:edge.id});
   hit.onkeydown=safe(e=>{if(e.key==='Enter'){e.preventDefault();lineId=edge.lineId||'';updateControls();tell('División seleccionada.');}});
  }
  for(const f of shown.filter(f=>f.lot&&!f.hidden&&!appearance(f.id)?.zone)){const text=svg('text',{x:0,y:0,class:'rg-grid-number','data-label-id':f.id});text.textContent=f.lot.number;s.append(text);}
  if(draft?.points.length)s.append(svg('polygon',{points:coords(p,orderImageCorners(draft.points)),class:'rg-calco-draft'}));
  const handles=draft?draft.points.map((v,i)=>({v,index:i})):Object.entries(p.vertices).filter(([id])=>shownVertexIds.has(id)).map(([id,v])=>({v,id}));
  for(const {index,id} of handles){const first=!!draft&&index===0,h=svg('g',{class:'rg-calco-handle',tabindex:0,role:'button','aria-label':first?'Primer punto: tocar para cerrar o arrastrar para mover':id&&p.addedVertices.includes(id)?'Punto agregado: arrastrar o doble clic para quitar':'Punto compartido: arrastrar para mover',...(id?{'data-vertex-id':id}:{'data-draft-index':index})});
   h.append(svg('circle',{cx:0,cy:0,r:9,class:'rg-calco-grab'}),svg('circle',{cx:0,cy:0,r:4,class:'rg-calco-corner'+(first?' first-corner':'')+(id&&p.addedVertices.includes(id)?' added-corner':''),'pointer-events':'none'}));
   s.append(h);h.onclick=e=>{e.preventDefault();e.stopPropagation();};attachDrag(h,draft?{draftIndex:index}:{ids:[id]});
   h.ondblclick=safe(e=>{e.preventDefault();e.stopPropagation();if(draft)return;applied(removeGraphPoint(plan(),id),'Punto quitado. La línea quedó recta entre sus vecinos.');});
   h.onkeydown=safe(e=>{if(e.key==='Enter'&&first){closeContour();return;}const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!dirs[e.key]||draft)return;e.preventDefault();const d=dirs[e.key],step=e.shiftKey?10:1;applied(moveGraphVertices(plan(),[id],[d[0]*step/p.width,d[1]*step/p.height]),'Punto movido.');});
  }
  s.onclick=safe(e=>{if(!draft||Date.now()<ignoreClickUntil)return;const v=point(e),occupied=p.faces.find(f=>!f.hidden&&imageInside(v,facePoints(p,f)));if(occupied)throw Error('Ya hay un lote o una manzana en ese lugar. No se agregó ningún punto.');if(draft.points.some(q=>near(q,v)))throw Error('Ese punto ya existe. Arrastralo para moverlo.');checkpoint();draft.points.push(v);const issue=draft.points.length>=3?imagePolygonIssue(orderImageCorners(draft.points),shown.filter(f=>!f.hidden).map(f=>({points:facePoints(p,f),name:f.lot?.name||'otra manzana'}))):'';tell(issue||draft.points.length+' puntos. Tocá el primero o Cerrar contorno para terminar.');render();});
  syncScreenGeometry(p);updateControls();
 }
 function updateControls(){
  const p=plan(),b=block(),f=face(),loose=mode==='loose';for(const el of controls.querySelectorAll('[data-grid-mode]'))el.setAttribute('aria-pressed',String(el.dataset.gridMode===mode));
  q('[data-grid-draw]').hidden=mode==='adjust';q('[data-grid-divide]').hidden=loose||mode==='adjust';q('[data-grid-identify]').hidden=loose||mode==='adjust';q('[data-loose-number]').hidden=!loose;
  q('[data-image-new]').textContent=loose?'Nuevo lote':'Nueva manzana';q('[data-image-new]').disabled=!!draft||(!loose&&!!b&&!b.finished);q('[data-image-close]').disabled=!draft||draft.points.length<3;q('[data-image-cancel]').hidden=!draft;
  q('[data-grid-divide-action]').disabled=!b||!!draft||p.faces.some(f=>f.blockId===blockId&&f.lot);q('[data-grid-finish]').disabled=!b||!!draft||b.finished||!p.faces.some(f=>f.blockId===blockId&&f.lot);
  q('[data-grid-finish]').textContent=b?.finished?'Manzana terminada':'Terminar manzana';q('[data-grid-count]').textContent=b?imageLots(p).filter(f=>p.faces.find(n=>n.id===f.id)?.blockId===b.id).length+' '+(imageLots(p).filter(f=>p.faces.find(n=>n.id===f.id)?.blockId===b.id).length===1?'lote marcado':'lotes marcados')+' en Manzana '+b.name:'Cerrá el contorno y dividilo para empezar.';
  q('[data-image-undo]').disabled=!history.length;q('[data-grid-remove-line]').disabled=!lineId||!!draft;q('[data-grid-selected]').hidden=!f?.lot||!!draft;q('[data-grid-selected-name]').textContent=f?.lot?.name||'';q('[data-image-hide]').textContent=f?.hidden?'Volver a mostrar este lote':'Ocultar este lote del calco';q('[data-grid-confirm]').hidden=!pendingMerge;
  const shown=imageLots(p).filter(f=>!f.hidden||q('[data-image-show-hidden]').checked),sel=q('[data-image-list]');sel.replaceChildren(new Option('Elegí un lote',''),...shown.map(f=>new Option(f.name+(f.hidden?' · oculto':''),f.id)));sel.value=selected;
  const n=imageLots(p).filter(f=>f.hidden).length;q('[data-image-hidden-note]').textContent=n?n+' '+(n===1?'lote oculto':'lotes ocultos')+'. Sus fichas se conservan.':'';
 }
 return {render,zoom(factor){zoom=Math.max(1,Math.min(12,zoom*factor));render();},fit(){zoom=1;render();},destroy(){resizeObserver.disconnect();},issue(){if(draft)return 'Terminá el contorno o cancelá su dibujo antes de guardar.';if(pendingMerge)return 'Confirmá o cancelá la unión de lotes antes de guardar.';if(face()?.lot&&q('[data-grid-edit-number]').value.trim()!==face().lot.number)return 'Guardá el número corregido antes de guardar el proyecto.';if(plan()?.blocks.some(b=>!b.finished))return 'Usá Terminar manzana antes de guardar el proyecto.';return plan()?imagePlanIssue(plan()):'';},inventoryChanges(){return structuredClone(retired);},reset(){selected='';blockId='';draft=null;history=[];retired=[];lineId='';zoom=1;render();}};
}
