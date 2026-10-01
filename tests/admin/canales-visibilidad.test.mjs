import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const leer = archivo => fs.readFileSync(root + archivo, 'utf8')
const helpers = await import('data:text/javascript;base64,' + Buffer.from(leer('js/admin-canal-visibilidad.js') + '\nexport function agregarTestigoCatalogo(id) { huellasCanal.add(huella(id)) }').toString('base64'))
const { canalVisible, registroVisible, resumirContenidoVisible, crearLectorConCache, canalEnCatalogo, registroEnCatalogo, crearFiltroDeCatalogo } = helpers
const testigoExcluido = '00000000-0000-4000-8000-000000000001'
helpers.agregarTestigoCatalogo(testigoExcluido)
const canales = Object.freeze([
  Object.freeze({id:'viejo',nombre:'Archivado',codigo:'prueba-qr-varios',activo:false,tipo:'punto_venta',provincia:'Vieja',ciudad:'Antigua'}),
  Object.freeze({id:'uno',nombre:'Prueba vigente',codigo:'vigente',activo:true,tipo:'punto_venta',provincia:'Chubut',ciudad:'Trelew'}),
  Object.freeze({id:'dos',nombre:'Otro vigente',codigo:'otro',activo:true,tipo:'evento',provincia:'Santa Cruz',ciudad:'Gallegos'}),
  Object.freeze({id:'desconocido',nombre:'Sin estado',activo:null,tipo:'punto_venta'})
])
const tramo = (archivo, inicio, fin) => {
  const s=leer(archivo), a=s.indexOf(inicio), b=s.indexOf(fin,a+inicio.length)
  assert.ok(a>=0 && b>a, `${archivo}: límites del código a probar`)
  return s.slice(a,b)
}
const ids = filas => Array.from(filas, c => c.id || c.canal_id)

test('vigencia real, independiente del nombre de prueba y del rol comercial', () => {
  assert.deepEqual(ids(canales.filter(c=>canalVisible(c))),['uno','dos'])
  assert.deepEqual(ids(canales.filter(c=>canalVisible(c,'inactivo'))),['viejo'])
  assert.equal(canalVisible({activo:false,tipo_acceso:'activo'}),false)
  assert.equal(registroVisible(null),true)
  assert.equal(registroVisible(null,'inactivo'),false)
  assert.equal(registroVisible(canales[0]),false)
  assert.equal(registroVisible(canales[0],''),true)
  assert.equal(canales.length,4)
})

test('los contenedores declarados para los filtros existen en cada pantalla', () => {
  for(const archivo of ['admin/dashboard.html','admin/crm.html','admin/contactos.html','admin/monitoreo-qr.html','admin/salud-de-red.html']){
    const s=leer(archivo),html=s.slice(0,s.indexOf('<script type="module">'))
    for(const [,selector] of s.matchAll(/contenedor:\s*document\.querySelector\(['"]([^'"]+)['"]\)/g)){
      assert.ok(selector.startsWith('.'),archivo+' selector simple')
      const clase=selector.slice(1)
      assert.ok([...html.matchAll(/class=["']([^"']+)["']/g)].some(m=>m[1].split(/\s+/).includes(clase)),archivo+' contenedor '+selector)
    }
  }
})

test('Tráfico conserva los códigos no identificados y el estado real de los identificados', () => {
  const source=leer('admin/trafico.js'),a=source.indexOf('function resolveChannel('),b=source.indexOf('\nfunction ',a+10)
  const ctx={TEST_RE:/prueba/i};Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx)
  const maps={refsByCode:new Map(),channelsById:new Map(),channelsByCode:new Map(canales.map(c=>[c.codigo,c]))}
  assert.equal(ctx.resolveChannel('origen-no-identificado',maps).desconocido,true)
  assert.equal(ctx.resolveChannel('vigente',maps).activo,true)
  assert.equal(ctx.resolveChannel('prueba-qr-varios',maps).activo,false)
})

test('Canales aplica activos, archivados y Todos en el filtro real de la pantalla', () => {
  const ctx={_canales:canales,_filtrosCanales:{estado:'activo'},claseAccesoCanal:c=>c.tipo, TIPO_LABEL:{},campoFiltro:String}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/canales.html','function canalesFiltrados()','function renderCanalCard'),ctx)
  assert.deepEqual(ids(ctx.canalesFiltrados()),['uno','dos'])
  ctx._filtrosCanales.estado='inactivo';assert.deepEqual(ids(ctx.canalesFiltrados()),['viejo'])
  ctx._filtrosCanales.estado='';assert.equal(ctx.canalesFiltrados().length,4)
})

test('Mapa QR conserva el catálogo completo y no arranca con el testigo archivado', () => {
  const ctx={state:{canales,estadoCanales:'activo'}}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/mapa-qr.html','function canalesVisibles()','function renderCanalOptions'),ctx)
  assert.deepEqual(ids(ctx.canalesVisibles()),['uno','dos'])
  ctx.state.estadoCanales='inactivo';assert.deepEqual(ids(ctx.canalesVisibles()),['viejo'])
  ctx.state.estadoCanales='';assert.equal(ctx.canalesVisibles().length,4)
  assert.ok(!tramo('admin/mapa-qr.html','async function cargarCanales()','async function cargarCanalSeleccionado()').includes('select.value = testigo.id'))
})

test('Cambiar canal ofrece solo activos incluso al consultar un informe archivado', () => {
  const selector={opciones:[],set innerHTML(v){this.opciones=[]},appendChild(o){this.opciones.push(o)}}
  const ctx={state:{canales,canal:canales[0]},$:()=>selector,document:{createElement:()=>({})}}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/informe-canal.html','function renderSelector()','function renderHeader()'),ctx)
  ctx.renderSelector()
  assert.deepEqual(selector.opciones.filter(o=>!o.disabled).map(o=>o.value),['uno','dos'])
  assert.equal(selector.opciones[0].selected,true)
  assert.equal(selector.opciones.some(o=>o.value==='viejo'),false)
  ctx.state.canal=canales[1];ctx.renderSelector()
  assert.equal(selector.opciones.find(o=>o.value==='uno').selected,true)
})

test('Derivar excluye archivados aunque quede una principal activa de ese canal', () => {
  const ctx={canales,misSlots:canales.map(c=>({canal_id:c.id,punto_tipo:'principal',activo:true,codigo:c.codigo}))}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('colaboradores/index.html','    function canalesElegiblesParaDerivar()','    window.cerrarDerivar'),ctx)
  assert.deepEqual(Array.from(ctx.canalesElegiblesParaDerivar(),x=>x.canal.id),['uno','dos'])
  assert.equal(ctx.principalesElegiblesPropias().length,4)
})

test('los filtros de Consultas no ofrecen canales ni QR archivados por defecto', () => {
  const elementos=Object.fromEntries(['fCanal','lstCanal','lstRef','fProyecto','fCiudad'].map(id=>[id,{}]))
  const ctx={_metaCanalTodos:Object.fromEntries(canales.map(c=>[c.nombre,c])),_metaCanal:{},_leads:canales.filter(c=>c.codigo).map(c=>({_canal:c.nombre,canal_ref:c.codigo})),_canalEstadoPorRef:new Map(canales.map(c=>[c.codigo,c])),filtroEstadoCanal:{value:'activo'},registroVisible,$:id=>elementos[id],esc:String}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/contactos.html','function leadsDeCanalesVisibles(','function filtrosFecha()'),ctx)
  ctx.poblarFiltros()
  for(const id of ['fCanal','lstCanal']){
    assert.ok(elementos[id].innerHTML.includes('Prueba vigente'))
    assert.ok(!elementos[id].innerHTML.includes('Archivado'))
  }
  assert.ok(!elementos.lstRef.innerHTML.includes('prueba-qr-varios'))
  ctx.filtroEstadoCanal.value='';ctx.poblarFiltros()
  assert.ok(elementos.fCanal.innerHTML.includes('Archivado'))
})

test('Campañas: seleccionar por tipo respeta estado y provincia; al ocultar se elimina la selección', () => {
  const elementos=Object.fromEntries(['filtroEstado','filtroTipo','filtroProv','filtroBuscar','checkAll'].map(id=>[id,{value:'',checked:false}]))
  elementos.filtroEstado.value='activo'
  const ctx={canales,seleccionados:new Set(),window:{},document:{getElementById:id=>elementos[id]},renderTablaCanales(){},actualizarAccionBar(){},poblarFiltros(){}}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/campanas.html','  function canalesVisibles()','  function campanaActivaDeCanal'),ctx)
  vm.runInContext(tramo('admin/campanas.html','  window.seleccionarPorTipo =','  window.deseleccionarTodo'),ctx)
  vm.runInContext(tramo('admin/campanas.html','  window.filtrarCanales =','  function canalesVisibles()'),ctx)
  ctx.window.seleccionarPorTipo('punto_venta');assert.deepEqual([...ctx.seleccionados],['uno'])
  elementos.filtroEstado.value='';ctx.window.seleccionarPorTipo('punto_venta');assert.ok(ctx.seleccionados.has('viejo'))
  elementos.filtroEstado.value='activo';ctx.window.filtrarCanales();assert.deepEqual([...ctx.seleccionados],['uno'])
  elementos.filtroProv.value='Santa Cruz';ctx.window.filtrarCanales();assert.equal(ctx.seleccionados.size,0)
  ctx.window.seleccionarPorTipo('punto_venta');assert.equal(ctx.seleccionados.size,0)
})

test('Destinos QR filtra la tabla por canal_activo; cambiar estado o limpiar descarta selección oculta', () => {
  const elementos=Object.fromEntries(['buscar','estadoCanal','provincia','ciudad','destino','rubro','todosVisibles','limpiarSeleccion','limpiarFiltros'].map(id=>[id,{value:'',checked:false,handlers:{},addEventListener(e,fn){this.handlers[e]=fn}}]))
  elementos.estadoCanal.value='activo'
  const ctx={canales:canales.map(c=>({...c,canal_id:c.id,canal_nombre:c.nombre,canal_activo:c.activo})),seleccionados:new Set(['viejo','uno']),linksPorCanal:new Map(),$:id=>elementos[id],norm:s=>String(s).toLowerCase(),render(){},mostrarAccion(){},poblarFiltrosCanales(){}}
  Object.assign(ctx,{canalVisible,canalEnCatalogo,registroEnCatalogo});vm.createContext(ctx)
  vm.runInContext(tramo('admin/destinos-qr.html','function visibles()','function referenciasCanal'),ctx)
  assert.deepEqual(ids(ctx.visibles()),['uno','dos'])
  vm.runInContext(tramo('admin/destinos-qr.html',"for(const id of ['buscar','provincia'","$('prepararCambio').addEventListener"),ctx)
  elementos.buscar.handlers.input();assert.deepEqual([...ctx.seleccionados],['uno'])
  elementos.estadoCanal.value='inactivo';elementos.estadoCanal.handlers.change();assert.equal(ctx.seleccionados.size,0);assert.deepEqual(ids(ctx.visibles()),['viejo'])
  ctx.seleccionados.add('viejo');elementos.limpiarFiltros.handlers.click();assert.equal(elementos.estadoCanal.value,'activo');assert.equal(ctx.seleccionados.size,0)
})

test('Monitoreo: contenido mixto cuenta solo canales visibles y respeta QR inactivos e historia cerrada', () => {
  const catalogo=new Map(canales.map(c=>[c.id,c]))
  const fila=(r,c,activo,visitas,extra={})=>({asignacion_id:'asig-'+r,referencia_id:r,canal_id:c,canal_clase:'pasivo',provincia:c==='uno'?'Chubut':'Vieja',ciudad:c==='uno'?'Trelew':'Antigua',referencia_activa:activo,visitas,consultas:1,vigente_hasta:null,observado_desde:'2026-09-01',...extra})
  const data=Object.freeze([fila('r1','uno',true,3),fila('r2','viejo',false,90),fila('r3','uno',false,5),fila('r4','uno',true,100,{vigente_hasta:'2026-09-30'})])
  const base={contenido_nombre:'Mixto',puntos_qr:99,visitas:999}
  const visible=resumirContenidoVisible(base,data,catalogo)
  assert.equal(visible.canales,1);assert.equal(visible.puntos_qr,1);assert.equal(visible.puntos_qr_inactivos,1);assert.equal(visible.visitas,108)
  assert.deepEqual(visible.lista_provincias,['Chubut'])
  const all=resumirContenidoVisible(base,[...data,data[0]],catalogo,'')
  assert.equal(all.visitas,198);assert.equal(all.canales,2)
  const repetido=resumirContenidoVisible(base,[...data,data[0]],catalogo)
  assert.equal(repetido.visitas,108)
  assert.throws(()=>resumirContenidoVisible(base,[{...data[0],canal_id:'no-existe'}],catalogo),/contrato/)
  assert.throws(()=>resumirContenidoVisible(base,[{...data[0],referencia_activa:undefined}],catalogo),/contrato/)
  assert.throws(()=>resumirContenidoVisible(base,[{...data[0],consultas:undefined}],catalogo),/contrato/)
  assert.equal(data.length,4);assert.equal(base.visitas,999)
})

test('Monitoreo comparte lecturas, limita concurrencia y permite reintentar errores', async () => {
  const lector=crearLectorConCache(2), liberar=[]
  let enCurso=0,maximo=0,ejecuciones=0
  const tarea=()=>{ejecuciones++; enCurso++;maximo=Math.max(maximo,enCurso);return new Promise(resolve=>liberar.push(()=>{enCurso--;resolve(1)}))}
  const primera=lector('uno',tarea)
  assert.equal(lector('uno',tarea),primera)
  const segunda=lector('dos',tarea),tercera=lector('tres',tarea)
  await Promise.resolve();assert.equal(ejecuciones,2)
  liberar.shift()(); await primera
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(ejecuciones,3);assert.equal(maximo,2)
  liberar.splice(0).forEach(fn=>fn());await Promise.all([segunda,tercera])
  await assert.rejects(lector('fallo',()=>Promise.reject(new Error('lectura'))),/lectura/)
  assert.equal(await lector('fallo',()=>7),7)
})

test('historial y escrituras E2 permanecen idénticos a la base publicada', () => {
  const base=archivo=>execFileSync('git',['show','c0053440d384424feac2d73370bc8f7a4094e0b6:'+archivo],{cwd:root,encoding:'utf8'})
  const block=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)))
  for(const [file,a,b] of [
    ['admin/destinos-qr.html','function validarDestino(valor)','async function cargar()'],
    ['admin/canales.html','async function ejecutarActividadCanal','window.verQRBtn'],
    ['admin/campanas.html','  window.asignarMasivo','  window.abrirModal'],
    ['admin/contactos.html','function getPersonaLeads','cargarTodo()\n</script>'],
    ['colaboradores/index.html','    function principalesElegiblesPropias()','    window.cerrarDerivar']
  ]) {
    assert.ok(base(file).includes(a) && leer(file).includes(a),file+' protección encontrada')
    assert.equal(block(leer(file),a,b),block(base(file),a,b),file+' protección sin cambios')
  }
  for(const file of ['admin/destinos-qr.html','colaboradores/index.html']) {
    assert.ok(leer(file).includes("canales.filter(c=>c.canal_activo===true).length!==Number(inventario.canales_activos)") || leer(file).includes('canalIds = canales.map(c => c.id)'),file+' inventario completo')
  }
})

// Regresión de privacidad: una URL no puede habilitar controles internos.
test('los paneles externos no incluyen controles de archivo ni parámetros que los habiliten', () => {
  for (const file of ['colaboradores/index.html','colaboradores/desarrollador.html']) {
    const source = leer(file)
    assert.ok(!source.includes('Incluir canales archivados'), file)
    assert.ok(!source.includes('mostrarCanalesArchivados'), file)
    assert.ok(!source.includes("get('archivados')"), file)
    assert.ok(!source.includes('Podés consultar los archivados'), file)
    assert.ok(source.includes('canalVisible('), file)
    assert.ok(source.includes("storageKey: 'sp-colab-session'"), file)
  }
  assert.ok(leer('colaboradores/index.html').includes(".eq('user_id', userId)"))
  assert.ok(leer('colaboradores/desarrollador.html').includes("meta.tipo_acceso !== 'desarrollador'"))
})

test('los filtros originales del admin no reciben filas ni aclaraciones adicionales', () => {
  for (const file of ['admin/contactos.html','admin/crm.html','admin/dashboard.html','admin/monitoreo-qr.html','admin/salud-de-red.html']) {
    const source = leer(file)
    assert.ok(!source.includes('instalarFiltroEstadoCanal'), file)
    assert.ok(source.includes("const filtroEstadoCanal = { value: 'activo' }"), file)
  }
  assert.ok(!leer('js/admin-canal-visibilidad.js').includes('El historial se conserva'))
})


test('cada import del módulo de visibilidad corresponde a una exportación real', () => {
  for (const dir of ['admin','colaboradores']) {
    for (const name of fs.readdirSync(root + dir).filter(n => /\.(html|js)$/.test(n))) {
      const archivo = `${dir}/${name}`
      for (const match of leer(archivo).matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*admin-canal-visibilidad\.js(?:\?[^'"]*)?['"]/g)) {
        for (const entry of match[1].split(',')) {
          const nombre = entry.trim().split(/\s+as\s+/)[0]
          assert.ok(Object.hasOwn(helpers,nombre), `${archivo}: export inexistente ${nombre}`)
        }
      }
    }
  }
})


test('las 57 identidades del corte quedan fuera incluso al reactivarse o elegir Todos; un archivado futuro se conserva', () => {
  const evidencia = JSON.parse(fs.readFileSync(new URL('./fixtures/canales-catalogo-2026-10-01.json', import.meta.url)))
  assert.equal(evidencia.huellas_ids.length,57)
  assert.equal(evidencia.huellas_codigos.length,107)
  for (const id of [testigoExcluido]) {
    assert.equal(canalEnCatalogo(id),false)
    for (const activo of [true,false]) for (const estado of ['', 'activo', 'inactivo']) {
      assert.equal(canalVisible({id,activo},estado),false)
      assert.equal(registroVisible({id,activo},estado),false)
    }
  }
  for(const id of ['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'])assert.equal(canalVisible({id,nombre:'PRUEBA',activo:true}),true)
  const futuro = {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',activo:false}
  assert.equal(canalVisible(futuro,''),true);assert.equal(canalVisible(futuro,'inactivo'),true)
})

test('datos de una identidad excluida nunca se convierten en directos al filtrar el catálogo; se conserva la integridad de las fuentes', () => {
  const id=testigoExcluido
  const canales = Object.freeze([Object.freeze({id,codigo:'codigo-nuevo-del-excluido',activo:true}),Object.freeze({id:'real',codigo:'real',activo:true})])
  const referencias = Object.freeze([Object.freeze({canal_id:id,codigo:'referencia-nueva-del-excluido'}),Object.freeze({canal_id:'real',codigo:'qr-real'})])
  const filas = Object.freeze([{canal_ref:'codigo-nuevo-del-excluido'},{canal_ref:'referencia-nueva-del-excluido'},{canal_ref:'qr-real'},{canal_ref:null},{canal_ref:'no-resuelto'}])
  const filtrar = crearFiltroDeCatalogo(canales,referencias)
  assert.deepEqual(filas.filter(filtrar).map(f=>f.canal_ref),['qr-real',null,'no-resuelto'])
  assert.equal(canales.length,2);assert.equal(referencias.length,2);assert.equal(filas.length,5)
})

test('el resumen de contenido descarta una simulación aun en Todos sin quitar la historia de un archivado real', () => {
  const old=testigoExcluido
  const cat=new Map([[old,{id:old,activo:true}],['real',{id:'real',activo:false}]])
  const fila=(id,n)=>({canal_id:id,asignacion_id:id,referencia_id:id,referencia_activa:false,vigente_hasta:'2026-09-30',canal_clase:'pasivo',visitas:n,consultas:n})
  const data=Object.freeze([fila(old,900),fila('real',3)])
  const resumen=resumirContenidoVisible({visitas:903},data,cat,'')
  assert.equal(resumen.visitas,3);assert.equal(resumen.consultas,3);assert.equal(data.length,2)
})


test('la identidad del canal de una referencia prevalece sobre el UUID del QR', () => {
  const ref = {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',canal_id:testigoExcluido}
  assert.equal(canalEnCatalogo(ref),false)
})

test('las huellas coinciden con SHA-256 y el registro fijo no contiene nombres ni códigos públicos', async () => {
  const { createHash } = await import('node:crypto')
  const ctx = { TextEncoder };vm.createContext(ctx)
  vm.runInContext(leer('js/admin-canal-visibilidad.js').replaceAll('export function','function'),ctx)
  const evidencia = JSON.parse(leer('tests/admin/fixtures/canales-catalogo-2026-10-01.json'))
  for (const id of ['', 'abc', 'á b', 'a'.repeat(200), testigoExcluido]) {
    assert.equal(ctx.huella(id),createHash('sha256').update(id).digest('hex'))
  }
  for(const h of evidencia.huellas_ids) assert.equal(vm.runInContext(`huellasCanal.has('${h}')`,ctx),true)
  for(const h of evidencia.huellas_codigos) assert.equal(vm.runInContext(`huellasReferencia.has('${h}')`,ctx),true)
  assert.equal(vm.runInContext('huellasCanal.size',ctx),57)
  assert.equal(vm.runInContext('huellasReferencia.size',ctx),107)
})

test('los filtros reales de Canales, Mapa, Destinos y Campañas excluyen las identidades antiguas en todos sus estados', () => {
  const vieja={id:testigoExcluido,nombre:'vieja',activo:true}
  const real={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nombre:'real',activo:false}
  const activo={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',nombre:'vigente',activo:true}
  const canales=[vieja,real,activo]
  const estados=['activo','inactivo','']
  for (const estado of estados) {
    const ctx={_canales:canales,_filtrosCanales:{estado},claseAccesoCanal:()=>'',TIPO_LABEL:{},campoFiltro:String,state:{canales,estadoCanales:estado},canalVisible,canalEnCatalogo}
    vm.createContext(ctx)
    vm.runInContext(tramo('admin/canales.html','function canalesFiltrados()','function renderCanalCard'),ctx)
    vm.runInContext(tramo('admin/mapa-qr.html','function canalesVisibles()','function renderCanalOptions'),ctx)
    const esperados=estado==='activo'?[activo.id]:estado==='inactivo'?[real.id]:[real.id,activo.id]
    assert.deepEqual(ids(ctx.canalesFiltrados()),esperados)
    assert.deepEqual(ids(ctx.canalesVisibles()),esperados)
    const elementos={};const $=id=>elementos[id]||={value:id==='estadoCanal'||id==='filtroEstado'?estado:''}
    const destinos={canales:canales.map(c=>({...c,canal_id:c.id,canal_nombre:c.nombre,canal_activo:c.activo})),linksPorCanal:new Map(),$,norm:String,canalEnCatalogo}
    vm.createContext(destinos);vm.runInContext(tramo('admin/destinos-qr.html','function visibles()','function referenciasCanal'),destinos)
    assert.deepEqual(ids(destinos.visibles()),esperados)
    const camp={canales,document:{getElementById:$},canalEnCatalogo}
    vm.createContext(camp);vm.runInContext(tramo('admin/campanas.html','  function canalesVisibles()','  function campanaActivaDeCanal'),camp)
    assert.deepEqual(ids(camp.canalesVisibles()),esperados)
  }
})
