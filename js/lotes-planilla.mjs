import {meters} from './recorrido-geografia.mjs?v=20261116-bordes';

// Import/export stays in the browser. Existing UUIDs and geometry are never replaced.
export const fold=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const compact=value=>fold(String(value??'').normalize('NFKD')).replace(/[^a-z0-9]/g,'');
export function normalizeLotPart(value,block=false){
 let text=fold(value);
 text=block?text.replace(/^(?:manzana|mza|mz)(?:\s+|(?=\d))[-_.:]?\s*/i,'').replace(/^m[-_.:]?\s*(?=\d)/i,''):text.replace(/^(?:lote|lt|nro|numero)(?:\s+|(?=\d))[-_.:]?\s*/i,'').replace(/^l[-_.:]?\s*(?=\d)/i,'');
 text=text.replace(/\s+/g,' ').trim();
 return text.replace(/\d+/g,n=>String(Number(n)));
}
export function lotIdentity(value={}){
 const raw=String(value.lote??value.numero??'').trim(),combined=raw.match(/^(?:(?:manzana|mza|mz)\s*|m\s*(?=\d))(.+?)(?:\s*[·•|/–—-]\s*|\s+)(?:lote|lt|l)\s*[-.:]?\s*(.+)$/i);
 const block=normalizeLotPart(value.manzana??combined?.[1]??'',true),lot=normalizeLotPart(combined?.[2]??raw);
 return {block,lot,key:block+'\u001f'+lot,label:block?'Manzana '+block+' · Lote '+lot:'Lote '+lot};
}
export function normalizeLotState(value){
 const key=compact(value),states={disponible:'disponible',reservado:'reservado',reservada:'reservado',vendido:'vendido',vendida:'vendido',proximamente:'proximamente',noalaventa:'no_a_la_venta',sininformar:'',sin:''};
 if(!key)return '';if(!Object.hasOwn(states,key))throw Error('Estado desconocido: '+value+'.');
 return states[key];
}
export const lotStateText=value=>({disponible:'Disponible',reservado:'Reservado',vendido:'Vendido',proximamente:'Próximamente',no_a_la_venta:'No a la venta','':'Sin informar'})[normalizeLotState(value)];
const aliases={manzana:'manzana',mz:'manzana',mza:'manzana',lote:'lote',numero:'lote',nro:'lote',n:'lote',nlote:'lote',numerodelote:'lote',numerolote:'lote',nrolote:'lote',superficie:'superficie_m2',superficiem2:'superficie_m2',sup:'superficie_m2',m2:'superficie_m2',precio:'precio_usd',preciousd:'precio_usd',precioendolares:'precio_usd',price:'precio_usd',estado:'estado',notas:'notas',nota:'notas',observaciones:'notas',zona:'zona',zonacomercial:'zona',tipolote:'tipo_lote',sector:'tipo_lote',frenteagua:'frente_agua'};
const stripLotUnits=value=>String(value).trim().replace(/(?:USD|U\$S|US\$|\$|m²|m2)/gi,'').replace(/[\s\u00a0]/g,'');
const ambiguousGrouping=/^[1-9]\d{0,2}[.,]\d{3}$/;
export function parseLotNumber(value,key,decimalSeparator){
 if(typeof value==='number'){if(!Number.isFinite(value)||value<0||(key==='superficie_m2'&&value===0))throw Error('Valor no válido en '+key+'.');return value;}
 let text=String(value??'').trim();if(!text)return undefined;
 text=stripLotUnits(text);
 if(ambiguousGrouping.test(text)){
  if(!['.',','].includes(decimalSeparator))throw Error('Elegí el separador decimal de la hoja para interpretar «'+value+'».');
  text=text.includes(decimalSeparator)?text.replace(',','.'):text.replace(/[.,]/,'');
 }else if(/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(text)){
  text=text.replace(/,/g,'');
 }else if(/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/.test(text)){
  text=text.replace(/\./g,'').replace(',','.');
 }else if(/^\d+(?:[.,]\d+)?$/.test(text)){
  text=text.replace(',','.');
 }else throw Error('Número no válido en '+key+': '+value+'.');
 if(!/^\d+(?:\.\d+)?$/.test(text))throw Error('Número no válido en '+key+': '+value+'.');
 return parseLotNumber(Number(text),key);
}
function csvSeparator(text){
 const separators=[';',',','\t'];
 const lines=text.split(/\r\n?|\n/,101).filter(line=>line.trim());
 for(const line of lines){
  for(const separator of separators){
   const cells=line.split(separator);
   if(cells.length>1&&cells.some(cell=>aliases[compact(cell)]==='lote'))return separator;
  }
 }
 const first=lines[0]||'';
 return separators.sort((a,b)=>first.split(b).length-first.split(a).length)[0];
}
export function parseLotCSV(text){
 text=String(text).replace(/^\uFEFF/,'');let separator;
 const directive=text.match(/^sep=(.)\r?\n/i);if(directive){separator=directive[1];text=text.slice(directive[0].length);}
 if(!separator)separator=csvSeparator(text);
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const endField=()=>{row.push(field.trim());field='';closed=false;};
 const endRow=()=>{endField();if(row.some(v=>v!==''))rows.push(row);row=[];};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;}
 else if(c===separator)endField();else if(c==='\n'||c==='\r'){endRow();if(c==='\r'&&text[i+1]==='\n')i++;}
 else if(c==='"'&&!field.trim()&&!closed){field='';quoted=true;}else if(c==='"'||closed&&c.trim())throw Error('Revisá las comillas del archivo CSV.');else field+=c;}
 if(quoted)throw Error('Hay una celda con comillas sin cerrar.');endRow();return rows;
}
export function parseLotGrid(grid,{formulaErrors=[],rowOffset=0,decimalSeparator,readError}={}){
 if(readError)throw Error(readError);
 if(!grid.some(row=>row.some(v=>String(v??'').trim())))throw Error('La planilla está vacía.');
 // Reports can have a title/summary before the table. Prefer the strongest
 // recognized header row, without treating that introductory text as data.
 const candidates=grid.slice(0,100).map((row,index)=>{const headers=row.map(h=>aliases[compact(h)]||null);return {index,headers,score:headers.filter(Boolean).length};}).filter(c=>c.headers.includes('lote'));
 const leading=grid.findIndex(row=>row.some(v=>String(v??'').trim()));
 const candidate=candidates.find(c=>c.index===leading&&(c.score>1||grid[c.index].filter(v=>String(v??'').trim()).length>1))||candidates.find(c=>c.score>1)||candidates[0];
 if(!candidate)throw Error('Falta la columna Lote (también se acepta Número).');
 const first=candidate.index,headers=candidate.headers,known=headers.filter(k=>k&&k!=='lote'),raw=grid[first].map(compact),lotColumns=headers.flatMap((key,col)=>key==='lote'?[col]:[]);
 if(new Set(known).size!==known.length||new Set(lotColumns.map(col=>raw[col])).size!==lotColumns.length)throw Error('Hay encabezados repetidos para el mismo dato.');
 if(grid.length-first>10001)throw Error('La planilla supera los 10.000 lotes.');
 return grid.slice(first+1).map((values,index)=>{
  const line=rowOffset+first+index+2,data={},errors=[];if(!values.some(v=>String(v??'').trim()))return null;
  let ambiguousNumber='';
  if(values.length>headers.length&&values.slice(headers.length).some(v=>String(v??'').trim()))errors.push('Hay más celdas que encabezados.');
  for(const [col,key]of headers.entries()){if(!key||key==='lote')continue;const value=values[col];if(value==null||String(value).trim()==='')continue;
   try{
    if(key==='superficie_m2'||key==='precio_usd'){
     if(!ambiguousNumber&&typeof value==='string'&&ambiguousGrouping.test(stripLotUnits(value)))ambiguousNumber=stripLotUnits(value);
     data[key]=parseLotNumber(value,key,decimalSeparator);
    }else if(key==='estado')data[key]=normalizeLotState(value);
    else if(key==='frente_agua'){const v=compact(value);if(!['si','no','1','0','true','false'].includes(v))throw Error('Frente al agua debe ser Sí o No.');data[key]=['si','1','true'].includes(v);}
    else data[key]=String(value).trim();
   }catch(error){errors.push(error.message);}
  }
  const identities=lotColumns.filter(col=>values[col]!=null&&String(values[col]).trim()!=='').map(col=>({col,raw:String(values[col]).trim(),identity:lotIdentity({numero:values[col]})}));
  const preferred=identities.find(v=>raw[v.col]==='lote')||identities[0];if(preferred)data.lote=preferred.raw;
  const blocks=[...new Set([data.manzana?normalizeLotPart(data.manzana,true):'',...identities.map(v=>v.identity.block)].filter(Boolean))];
  if(new Set(identities.map(v=>v.identity.lot)).size>1)errors.push('Las columnas Número y Lote no coinciden en esta fila.');
  if(blocks.length>1)errors.push('La manzana de Número no coincide con la columna Manzana.');
  if(!data.manzana&&blocks.length===1)data.manzana=blocks[0];
  const identity=lotIdentity(data);if(!identity.lot)errors.push('Falta el número de lote.');
  for(const error of formulaErrors.filter(e=>e.line===line))errors.push(error.message);
  return {line,data,identity,errors,ambiguousNumber};
 }).filter(Boolean);
}
// Suggest whole square metres only when every fractional row already has
// that exact commercial area in the inventory. New records keep file precision.
export function prepareSheetAreas(rows,inventory,choice=null){
 const fractional=rows.filter(({data})=>Number.isFinite(data.superficie_m2)&&!Number.isInteger(data.superficie_m2));
 if(!fractional.length)return {items:rows,count:0,whole:false};
 const stored=new Map();
 for(const lot of inventory){
  const {key}=lotIdentity(lot);
  stored.set(key,stored.has(key)?NaN:Number(lot.superficie_m2||NaN));
 }
 const whole=choice??fractional.every(({identity,data})=>stored.get(identity.key)===Math.trunc(data.superficie_m2));
 const items=whole?rows.map(row=>{
  const area=row.data.superficie_m2;
  if(!Number.isFinite(area)||Number.isInteger(area))return row;
  if(area<1)return {...row,errors:[...row.errors,'La superficie es menor a 1 m². Conservá los decimales del archivo.']};
  return {...row,data:{...row.data,superficie_m2:Math.trunc(area)}};
 }):rows;
 return {items,count:fractional.length,whole,example:fractional[0].data.superficie_m2};
}
export function appendSheetAreaChoice(host,areas,onChange){
 if(!areas.count)return;
 const doc=host.ownerDocument,label=doc.createElement('label'),input=doc.createElement('input');
 input.type='checkbox';input.checked=areas.whole;
 input.onchange=()=>onChange(input.checked);
 const example=areas.example.toLocaleString('es-AR',{maximumFractionDigits:10});
 label.append(input,doc.createTextNode(' Usar metros enteros sin redondear ('+example+' → '+Math.trunc(areas.example)+' m²)'));
 host.append(label);
}
export function appendSheetNumberChoice(host,rows,sheet,onChange){
 const example=rows.find(row=>row.ambiguousNumber)?.ambiguousNumber;
 if(!example)return;
 const doc=host.ownerDocument,label=doc.createElement('label'),select=doc.createElement('select');
 label.append('Separador decimal para valores ambiguos de esta hoja',select);
 for(const [value,name] of [['','Elegí cómo leer «'+example+'»'],[',','Coma decimal'],['.','Punto decimal']]){
  const option=doc.createElement('option');
  option.value=value;
  option.textContent=value?name+' · '+example+' se lee '+String(parseLotNumber(example,'precio_usd',value)).replace('.',','):name;
  select.append(option);
 }
 select.value=sheet.decimalSeparator||'';
 select.onchange=()=>{sheet.decimalSeparator=select.value;onChange();};
 host.append(label);
}
export function planLotImport(imported,current,{zones=[]}={}){
 const exact=new Map(),byLot=new Map(),seen=new Set(),used=new Set(),updates=[],unmatched=[],problems=[];
 for(const row of current){const identity=lotIdentity(row),entry={row,identity};if(!identity.lot)continue;for(const [map,key]of [[exact,identity.key],[byLot,identity.lot]]){if(!map.has(key))map.set(key,[]);map.get(key).push(entry);}}
 const zoneNames=new Map(zones.map(z=>[fold(z.nombre),z]));
 for(const item of imported){const errors=[...item.errors],{data,identity}=item;
  if(seen.has(identity.key))errors.push('La manzana y el lote se repiten en la planilla.');seen.add(identity.key);
  let zone;if(data.zona){zone=zoneNames.get(fold(data.zona));if(!zone)errors.push('La zona «'+data.zona+'» no existe. Creala en Zonas o corregí su nombre.');}
  const candidates=exact.get(identity.key)||(identity.block?[]:byLot.get(identity.lot)||[]);
  if(candidates.length>1)errors.push('Coincide con más de un lote. Indicá la manzana.');
  const match=candidates.length===1?candidates[0]:null;if(match&&used.has(match.row))errors.push('Dos filas apuntan al mismo lote del inventario.');
  if(errors.length){problems.push({...item,errors});continue;}
  const patch={};for(const key of ['superficie_m2','precio_usd','estado','notas','tipo_lote','frente_agua'])if(Object.hasOwn(data,key))patch[key]=data[key];
  if(zone)patch.zonaVenta=zone.id;
  if(match){used.add(match.row);updates.push({...item,target:match.row,patch});}
  else unmatched.push({...item,patch,add:{...patch,numero:identity.block?identity.label:identity.lot}});
 }
 // Any duplicate file key blocks applying all rows, including its first occurrence.
 const counts=new Map();for(const row of imported)counts.set(row.identity.key,(counts.get(row.identity.key)||0)+1);
 for(let i=updates.length-1;i>=0;i--)if(counts.get(updates[i].identity.key)>1){used.delete(updates[i].target);problems.push({...updates[i],errors:['Identificación repetida en la planilla.']});updates.splice(i,1);}
 for(let i=unmatched.length-1;i>=0;i--)if(counts.get(unmatched[i].identity.key)>1){problems.push({...unmatched[i],errors:['Identificación repetida en la planilla.']});unmatched.splice(i,1);}
 const equal=(item)=>Object.entries(item.patch).every(([key,value])=>{const previous=item.target[key];if(['superficie_m2','precio_usd'].includes(key))return previous!=null&&previous!==''&&Number(previous)===value;if(key==='frente_agua')return !!previous===value;return String(previous??'')===String(value??'');});
 const same=updates.filter(equal);
 return {updates:updates.filter(item=>!same.includes(item)),same,unmatched,unchanged:current.filter(r=>!used.has(r)),problems};
}
// Three-way review: commercial rows, identified contours and existing cards.
// A spreadsheet never gives an unidentified polygon a number by row order.
export function planDXFImport(imported,current,features,{bindings=new Map(),zones=[],resolutions=new Map(),block=''}={}){
 const byKey=values=>{const map=new Map();for(const value of values){const identity=lotIdentity(value);if(!map.has(identity.key))map.set(identity.key,[]);map.get(identity.key).push(value);}return map;};
 const contours=features.filter(f=>f.kind==='lot').map(f=>({...f,numero:f.name})).filter(f=>{const i=lotIdentity(f);return i.block&&i.lot;}),inventory=byKey(current),shapes=byKey(contours),owners=new Map();
 for(const [id,key]of bindings)if(key){if(!owners.has(key))owners.set(key,[]);owners.get(key).push(id);}
 const active=imported.filter(item=>!resolutions.get(item.line)?.skip).map(item=>{const data={...item.data};if(!lotIdentity(data).block&&block)data.manzana=block;return {...item,data,identity:lotIdentity(data)};}),counts=new Map();
 for(const item of active)counts.set(item.identity.key,(counts.get(item.identity.key)||0)+1);
 const result={matches:[],creates:[],unmatched:[],conflicts:[],unchanged:[],skipped:imported.filter(i=>resolutions.get(i.line)?.skip)},used=new Set(),usedContours=new Set();
 for(const item of active){
  const errors=[...item.errors],choice=resolutions.get(item.line)||{},lots=inventory.get(item.identity.key)||[],faces=shapes.get(item.identity.key)||[];
  if(!item.identity.block)errors.push('Indicá la manzana para cruzar este lote con el plano.');
  if(counts.get(item.identity.key)>1)errors.push('Manzana y lote repetidos en la planilla. Excluí la fila duplicada o corregí el archivo.');
  const target=lots.length===1?lots[0]:lots.find(l=>l.id===choice.lotId),feature=faces.length===1?faces[0]:faces.find(f=>f.id===choice.featureId);
  if(lots.length>1&&!target)errors.push('Hay varias fichas con esta identificación. Elegí una.');
  if(faces.length>1&&!feature)errors.push('Hay varios contornos con esta identificación. Elegí uno y localizalo.');
  const previous=target&&bindings.get(target.id);
  if(previous&&(!feature||previous!==feature.id))errors.push('La ficha ya tiene otro contorno vinculado. Conservá ese vínculo o corregilo desde Lotes antes de reintentar.');
  if(feature&&(owners.get(feature.id)||[]).some(id=>id!==target?.id))errors.push('El contorno ya está vinculado a otra ficha. No se reemplaza esa asociación.');
  if(target&&used.has(target.id)||feature&&usedContours.has(feature.id))errors.push('Dos filas intentan usar la misma ficha o contorno.');
  const simple=planLotImport([item],target?[target]:[],{zones});for(const problem of simple.problems)errors.push(...problem.errors);
  if(errors.length){result.conflicts.push({...item,lots,faces,target,feature,errors:[...new Set(errors)]});continue;}
  const prepared=simple.updates[0]||simple.same[0]||simple.unmatched[0],patch=prepared.patch,needsLink=!!target&&!!feature&&!previous;
  const commercial=patch.superficie_m2??target?.superficie_m2;
  let measured=feature?.dxfMetrics?.area;
  // Older, already saved DXF divisions only carry their geographic ring.
  if(commercial>0&&measured==null&&feature?.dxfSplitFrom&&feature.points?.length>=3){
   const ring=feature.points.map(point=>meters(feature.points[0],point));
   measured=Math.abs(ring.reduce((sum,[x,y],i)=>{
    const next=ring[(i+1)%ring.length];return sum+x*next[1]-y*next[0];
   },0))/2;
  }
  const areaDifference=Number(commercial)>0&&Number(measured)>0&&Math.abs(measured-commercial)/commercial>.05+1e-10?{commercial:Number(commercial),measured:Number(measured)}:null;
  const row={...item,target,feature,patch,needsLink,same:!!simple.same.length&&!needsLink,areaDifference};
  if(target){used.add(target.id);result.matches.push(row);}else if(feature)result.creates.push(row);else result.unmatched.push(row);
  if(feature)usedContours.add(feature.id);
 }
 result.unchanged=current.filter(l=>!used.has(l.id));return result;
}

let spreadsheet;
export const loadSpreadsheet=()=>spreadsheet||=import('./vendor/xlsx.mjs');
export async function readLotFile(file){
 if(!/\.(csv|xlsx)$/i.test(file.name))throw Error('Elegí una planilla .csv o .xlsx.');
 if(file.size>20*1024*1024)throw Error('La planilla supera los 20 MB.');
 const bytes=await file.arrayBuffer();if(/\.csv$/i.test(file.name)){let text=new TextDecoder().decode(bytes);if(text.includes('\uFFFD'))text=new TextDecoder('windows-1252').decode(bytes);return [{name:'CSV',grid:parseLotCSV(text)}];}
 const XLSX=await loadSpreadsheet(),book=XLSX.read(bytes,{type:'array',cellFormula:true,sheetRows:10101}),sheets=[];
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name],errors=[];
  if(sheet['!fullref']){
   sheets.push({name,grid:[],readError:'La hoja supera el límite de 10.101 filas de lectura. Quitá las filas vacías sobrantes o dividí la hoja antes de importarla.'});
   continue;
  }
  for(const [cell,value]of Object.entries(sheet)){if(!cell.startsWith('!')&&value?.f&&(value.v==null||value.t==='e'))errors.push({line:XLSX.utils.decode_cell(cell).r+1,message:'La fórmula de '+cell+' no tiene un valor válido guardado. Recalculá y guardá el Excel.'});}
  const grid=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});if(grid.some(r=>r.some(v=>v!=='')))sheets.push({name,grid,formulaErrors:errors,rowOffset:XLSX.utils.decode_range(sheet['!ref']).s.r});
 }
 if(!sheets.length)throw Error('El Excel no tiene una hoja con datos.');return sheets;
}
export function templateLotGrid(current,zones=[]){
 const names=new Map(zones.map(z=>[z.id,z.nombre])),headers=['Manzana','Lote','Superficie (m²)','Precio (USD)','Estado','Notas','Zona'];
 return [headers,...current.map(row=>{const id=lotIdentity(row),state=normalizeLotState(row.estado||''),numeric=v=>v==null||v===''?'':Number(v);return [id.block,id.lot,numeric(row.superficie_m2),numeric(row.precio_usd),state==='no_a_la_venta'?'No a la venta':state==='proximamente'?'Próximamente':state,row.notas||'',names.get(row.zonaVenta)||''];})];
}
export async function lotTemplateBytes(current,zones=[]){
 const XLSX=await loadSpreadsheet(),grid=templateLotGrid(current,zones),sheet=XLSX.utils.aoa_to_sheet(grid);
 sheet['!cols']=[{wch:16},{wch:16},{wch:22},{wch:20},{wch:20},{wch:45},{wch:24}];sheet['!autofilter']={ref:'A1:G'+Math.max(1,grid.length)};
 for(let row=1;row<grid.length;row++)for(const col of [2,3]){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(cell?.t==='n')cell.z='#,##0.00';}
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Lotes');return XLSX.write(book,{type:'array',bookType:'xlsx',compression:true});
}
const fieldSelectors={numero:'.l-numero',superficie_m2:'.l-sup',precio_usd:'.l-precio',estado:'.l-estado',notas:'.l-notas',tipo_lote:'.l-tipo',frente_agua:'.l-agua'};
export function setupLotImport({input,trigger,download,preview,body,getZones=()=>[],getZone=()=>'',setZone=()=>{},onApply=()=>{},onError=()=>{}}){
 const doc=preview.ownerDocument,make=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const rows=()=>[...body.rows].map(ref=>{const row={ref,id:ref.dataset.origenId||'',zonaVenta:getZone(ref)};for(const [key,selector]of Object.entries(fieldSelectors)){const n=ref.querySelector(selector);row[key]=key==='frente_agua'?n.checked:n.value;}return row;});
 const snapshot=()=>JSON.stringify({rows:rows().map(({ref,...data})=>data),zones:getZones()});
 let sourceName='',sheets=[],index=0,allowAdd=false,revision='',pending=null,wholeArea=null;
 let readGeneration=0;
 const clear=()=>{
  readGeneration++;sheets=[];pending=null;
  trigger.disabled=false;preview.hidden=true;preview.replaceChildren();
 };
 function render(){
  let imported;try{imported=parseLotGrid(sheets[index].grid,sheets[index]);}catch(error){preview.hidden=false;preview.replaceChildren(make('p',error.message,'import-error'));if(sheets.length>1){const label=make('label','Hoja del Excel'),select=make('select');for(const [i,sheet]of sheets.entries())select.append(new Option(sheet.name,String(i)));select.value=String(index);select.onchange=()=>{index=Number(select.value);wholeArea=null;allowAdd=false;render();};label.append(select);preview.append(label);}const cancel=make('button','Cancelar','btn-secundario');cancel.type='button';cancel.onclick=clear;preview.append(cancel);return;}
  const inventory=rows(),areas=prepareSheetAreas(imported,inventory,wholeArea);
  pending=planLotImport(areas.items,inventory,{zones:getZones()});revision=snapshot();preview.hidden=false;preview.replaceChildren();
  const title=make('h3','Revisá la planilla antes de aplicar');title.tabIndex=-1;preview.append(title,make('p',sourceName+' · '+sheets[index].name));
  if(sheets.length>1){const label=make('label','Hoja del Excel'),select=make('select');select.id='inv-import-sheet';for(const [i,sheet]of sheets.entries()){const option=make('option',sheet.name);option.value=i;select.append(option);}select.value=index;select.onchange=()=>{index=Number(select.value);wholeArea=null;allowAdd=false;render();};label.append(select);preview.append(label);}
  preview.append(make('p','Las celdas vacías conservan el dato actual. Aplicar prepara la edición; después guardá el proyecto.','import-help'));
  appendSheetNumberChoice(preview,imported,sheets[index],()=>{wholeArea=null;render();});
  appendSheetAreaChoice(preview,areas,value=>{wholeArea=value;render();});
  const counts=make('div',null,'import-counts');counts.setAttribute('role','status');for(const [label,items]of [['Se actualizan',pending.updates],['Sin cambios',pending.same],['Sin lugar en el plano',pending.unmatched],['Quedan como están',pending.unchanged],['Para corregir',pending.problems]])counts.append(make('span',label+': '+items.length));preview.append(counts);
  const section=(title,items,describe)=>{const d=make('details'),s=make('summary',title+' '+items.length);d.open=items.length>0;d.append(s);if(items.length){const table=make('table'),head=table.createTHead().insertRow();for(const text of ['Lote','Detalle'])head.append(make('th',text));const tb=table.createTBody(),paintItems=all=>{tb.replaceChildren();for(const item of all?items:items.slice(0,5)){const tr=tb.insertRow();tr.insertCell().textContent=item.identity?.label||item.numero||'Sin número';tr.insertCell().textContent=describe(item);}};paintItems(false);d.append(table);if(items.length>5){const more=make('button','Ver todas ('+items.length+')','btn-secundario');let expanded=false;more.type='button';more.onclick=()=>{expanded=!expanded;paintItems(expanded);more.textContent=expanded?'Ver sólo 5':'Ver todas ('+items.length+')';};d.append(more);}}preview.append(d);return d;};
  const fields={superficie_m2:'Superficie',precio_usd:'Precio USD',estado:'Estado',notas:'Notas',zonaVenta:'Zona',tipo_lote:'Sector',frente_agua:'Frente al agua'};
  section('Se actualizan',pending.updates,item=>Object.entries(item.patch).map(([k,v])=>{const show=value=>k==='zonaVenta'?getZones().find(z=>z.id===value)?.nombre||'Sin zona':k==='estado'?lotStateText(value):value==null||value===''?'Sin informar':String(value);return fields[k]+': '+show(item.target[k])+' → '+show(v);}).join(' · ')||'Sin cambios en los datos.');
  section('Sin cambios',pending.same,()=> 'Ya coincide con la planilla. Se conserva sin cambios.');
  const missing=section('Sin lugar en el plano',pending.unmatched,item=>'Fila '+item.line+'. No se agrega por defecto.');
  if(pending.unmatched.length){const button=make('button',allowAdd?'No agregar las filas sin plano':'Agregarlas igual como lotes sin plano','btn-secundario');button.type='button';button.onclick=()=>{allowAdd=!allowAdd;render();};missing.append(button);if(allowAdd)missing.append(make('p','Al aplicar se agregarán '+pending.unmatched.length+' lotes sin plano.','import-warning'));}
  section('Quedan como están',pending.unchanged,()=> 'No viene en la planilla. Se conserva sin cambios.');
  if(pending.problems.length){const issues=section('Filas para corregir',pending.problems,item=>'Fila '+item.line+': '+item.errors.join(' '));issues.className='import-error';}
  const actions=make('div',null,'import-actions'),apply=make('button','Aplicar','btn-primario'),cancel=make('button','Cancelar','btn-secundario');apply.type=cancel.type='button';
  apply.disabled=!!pending.problems.length||(!pending.updates.length&&!(allowAdd&&pending.unmatched.length));cancel.onclick=clear;
  apply.onclick=()=>{if(snapshot()!==revision){render();preview.prepend(make('p','El inventario cambió. Revisá la vista previa actualizada.','import-warning'));return;}
   for(const item of pending.updates){for(const [key,value]of Object.entries(item.patch)){if(key==='zonaVenta'){setZone(item.target.ref,value);continue;}const n=item.target.ref.querySelector(fieldSelectors[key]);if(key==='frente_agua')n.checked=value;else n.value=value??'';}}
   if(allowAdd)for(const item of pending.unmatched){window.agregarLote(item.add,true);const row=body.lastElementChild;if(item.patch.zonaVenta)setZone(row,item.patch.zonaVenta);}
   const result={updated:pending.updates.length,added:allowAdd?pending.unmatched.length:0,kept:pending.unchanged.length};clear();onApply(result);
  };actions.append(apply,cancel);title.after(actions);title.focus({preventScroll:true});preview.scrollIntoView({block:'start'});
 }
 trigger.onclick=()=>input.click();
 input.onchange=async()=>{
  const file=input.files?.[0];input.value='';if(!file)return;
  clear();
  const generation=readGeneration;
  trigger.disabled=true;
  try{
   const loaded=await readLotFile(file);
   if(generation!==readGeneration)return;
   sheets=loaded;sourceName=file.name;wholeArea=null;allowAdd=false;
   index=Math.max(0,sheets.findIndex(sheet=>{try{parseLotGrid(sheet.grid,sheet);return true;}catch{return false;}}));
   render();
  }catch(error){
   if(generation===readGeneration){clear();onError(error.message);}
  }finally{
   if(generation===readGeneration)trigger.disabled=false;
  }
 };
 download.onclick=async()=>{download.disabled=true;try{const data=await lotTemplateBytes(rows(),getZones()),url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=doc.createElement('a');link.href=url;link.download='planilla-lotes.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){onError('No se pudo descargar el modelo: '+error.message);}finally{download.disabled=false;}};
 return {cancel:clear,rows};
}
