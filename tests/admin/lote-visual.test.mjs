import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const root = new URL('../../', import.meta.url)
function tramo(archivo, inicio, fin) {
  const s = fs.readFileSync(new URL(archivo, root), 'utf8')
  const a = s.indexOf(inicio), b = s.indexOf(fin, a + inicio.length)
  assert.ok(a >= 0 && b > a, archivo + ': código operativo encontrado')
  return s.slice(a, b)
}
const ctx = (source, fixtures = {}) => {
  const c = vm.createContext(fixtures)
  vm.runInContext(source, c)
  return c
}
const historial = tramo('admin/nuevo-canal.html', 'async function leerHistorialCompleto(', '// ── Historial de destinos')
const scans = tramo('admin/informe-canal.html', 'const SAT_PAGINA', 'let _satSeq')

const horario = tramo('admin/informe-canal.html', 'function horaNegocio(', 'function renderConsultas(')
function interfazHorario(tipo) {
  const elementos = new Map(['horarioSection', 'hourGrid', 'hourEmpty'].map(id => [id, {hidden: true, innerHTML: ''}]))
  const document = {
    getElementById: id => elementos.get(id),
    createElement: () => ({remove() { elementos.delete(this.id) }})
  }
  elementos.get('hourGrid').before = el => elementos.set(el.id, el)
  const c = ctx(horario, {document, $: id => elementos.get(id),
    TZ_NEGOCIO: 'America/Argentina/Buenos_Aires', numero: String,
    esActivo: () => tipo === 'inmobiliaria' || tipo === 'particular'})
  return {c, elementos}
}
const escaneosHorario = [
  {canal_via: 'qr', created_at: '2026-10-05T15:00:00Z'},
  {canal_via: 'qr', created_at: '2026-10-05T15:30:00Z'},
  {canal_via: 'qr', created_at: '2026-10-05T03:00:00Z'},
  {canal_via: 'link', created_at: '2026-10-05T22:00:00Z'}
]
for (const tipo of ['inmobiliaria', 'particular', 'punto_venta']) {
  test('Horarios visible con QR del canal ' + tipo + ', hora argentina y sin sumar links', () => {
    const {c, elementos: e} = interfazHorario(tipo)
    c.renderHorario(escaneosHorario)
    assert.equal(e.get('horarioSection').hidden, false)
    assert.equal(e.get('hourGrid').hidden, false)
    assert.equal(e.get('hourEmpty').hidden, true)
    assert.equal((e.get('hourGrid').innerHTML.match(/class="hour-item/g) || []).length, 24)
    assert.match(e.get('hourResumen').innerHTML, /las 12 h/)
    assert.match(e.get('hourResumen').innerHTML, /67%/)
    assert.equal(c.horaNegocio('2026-10-05T03:00:00Z'), 0)
  })
}
test('Horarios vacío conserva sección y descarta barras/resumen del período anterior', () => {
  const {c, elementos: e} = interfazHorario('punto_venta')
  c.renderHorario(escaneosHorario)
  c.renderHorario([{canal_via: 'link', created_at: '2026-10-05T22:00:00Z'}])
  assert.equal(e.get('horarioSection').hidden, false)
  assert.equal(e.get('hourEmpty').hidden, false)
  assert.equal(e.get('hourGrid').hidden, true)
  assert.equal(e.get('hourGrid').innerHTML, '')
  assert.equal(e.has('hourResumen'), false)
  c.renderHorario(escaneosHorario)
  assert.equal(e.get('hourEmpty').hidden, true)
  assert.equal(e.get('hourGrid').hidden, false)
  assert.match(e.get('hourResumen').innerHTML, /las 12 h/)
})

function apiPaginada(filas, {tope = 7, ignoraRango = false, count = filas.length, cambiaConteo = false} = {}) {
  const llamadas = []
  function consulta(nombre, campos, opciones) {
    const filtros = []
    let desde = 0, hasta = Infinity
    const q = {in(...args) { filtros.push(['in', ...args]); return q },
      eq(...args) { filtros.push(['eq', ...args]); return q },
      gte(...args) { filtros.push(['gte', ...args]); return q },
      lt(...args) { filtros.push(['lt', ...args]); return q }, order() { return q },
      range(a, b) { desde = a; hasta = b; return q },
      then(resolve) {
        const n = llamadas.length
        llamadas.push({nombre, campos, opciones, desde, hasta, filtros})
        const inicio = ignoraRango ? 0 : desde
        return Promise.resolve({count: cambiaConteo && n ? count + 1 : count,
          data: opciones?.head ? null : filas.slice(inicio, Math.min(inicio + tope, hasta + 1)), error: null}).then(resolve)
      }}
    return q
  }
  return {llamadas, rpc: (n, args, opts) => consulta(n, args, opts),
    from: n => ({select: (campos, opts) => consulta(n, campos, opts)})}
}
const filas = Array.from({length: 23}, (_, i) => ({id: i, asignacion_id: 'a' + i, referencia_id: 'r' + i}))

test('Historial acepta 23 filas completas aunque el servidor limite cada página a 7', async () => {
  const api = apiPaginada(filas), c = ctx(historial, {supabase: api})
  assert.equal((await c.leerHistorialCompleto('canal')).length, 23)
  assert.deepEqual(api.llamadas.map(l => l.desde), [0, 7, 14, 21])
  assert.ok(api.llamadas.every(l => l.opciones.count === 'exact' && l.nombre === 'admin_monitoreo_canal_detalle'))
})
for (const [nombre, opciones] of [['rango ignorado', {ignoraRango: true}], ['conteo ausente', {count: null}], ['conteo distinto', {count: 30}], ['conteo cambia', {cambiaConteo: true}]]) {
  test('Historial rechaza una lectura parcial: ' + nombre, async () => {
    const c = ctx(historial, {supabase: apiPaginada(filas, opciones)})
    await assert.rejects(c.leerHistorialCompleto('canal'), e => e.incompleto === true)
  })
}
test('Historial vacío comprobado es válido', async () => {
  const c = ctx(historial, {supabase: apiPaginada([])})
  assert.equal((await c.leerHistorialCompleto('canal')).length, 0)
})
test('Ventana de escaneos pagina por lo recibido y aplica QR, códigos y fechas fijas en cada lectura', async () => {
  const api = apiPaginada(filas), c = ctx(scans, {supabase: api})
  const desde = new Date('2026-01-01Z'), hasta = new Date('2026-03-01Z')
  assert.equal((await c.leerEscaneosVentana(['qr-a', 'qr-b'], desde, hasta)).length, 23)
  assert.deepEqual(api.llamadas.slice(1).map(l => l.desde), [0, 7, 14, 21])
  assert.ok(api.llamadas[0].opciones.head)
  for (const l of api.llamadas) {
    assert.equal(JSON.stringify(l.filtros), JSON.stringify([['in','canal_ref',['qr-a','qr-b']],['eq','canal_via','qr'],['gte','created_at',desde.toISOString()],['lt','created_at',hasta.toISOString()]]))
  }
})
for (const [nombre, opciones] of [['rango ignorado', {ignoraRango: true}], ['conteo ausente', {count: null}], ['conteo distinto', {count: 30}]]) {
  test('Escaneos rechaza números parciales: ' + nombre, async () => {
    const c = ctx(scans, {supabase: apiPaginada(filas, opciones)})
    await assert.rejects(c.leerEscaneosVentana(['qr'], new Date(0), new Date()), e => e.incompleto === true)
  })
}

function interfazQR(ejecutar, recargar = async () => {}) {
  const elementos = new Map()
  const documento = {activeElement: null, body: {}, contains: () => true}
  function elemento(id) {
    const eventos = new Map()
    return {id, disabled: false, classList: {add() {}, remove() {}},
      addEventListener(n, f) { if (!eventos.has(n)) eventos.set(n, new Set()); eventos.get(n).add(f) },
      removeEventListener(n, f) { eventos.get(n)?.delete(f) },
      emitir(n, datos = {}) { for (const f of [...(eventos.get(n) || [])]) f({target: this, ...datos}) },
      focus() { documento.activeElement = this }, closest: () => null}
  }
  for (const id of ['cfOverlay','cfOk','cfCancelar','cfX','cfTitulo','cfTexto','cfAclara','A','B']) elementos.set(id, elemento(id))
  Object.assign(documento, elemento('document'), {getElementById: id => elementos.get(id)})
  const avisos = []
  const c = ctx(tramo('admin/nuevo-canal.html', 'let _cfQrAbierta', '// ── Modal QR'), {
    window: {}, document: documento, alert: a => avisos.push(a), console: {error() {}},
    _referenciasPorId: new Map(['A','B'].map(id => [id, {id, nombre: id, codigo: 'qr-' + id, activo: true}])),
    ejecutarOperacionE2: ejecutar, cargarReferencias: recargar, e2MensajeError: String})
  return {toggle: c.window.toggleRefActivo, elementos, documento, avisos}
}
for (const accion of ['Cancelar', 'X', 'Fondo', 'Escape']) {
  test('Cancelar por ' + accion + ' no ejecuta E2 y permite la siguiente confirmación', async () => {
    let llamadas = 0
    const ui = interfazQR(async () => { llamadas++ })
    const b = ui.elementos.get('A'); b.focus()
    const p = ui.toggle('A', b)
    assert.ok(b.disabled)
    if (accion === 'Escape') ui.documento.emitir('keydown', {key: 'Escape', preventDefault() {}})
    else ui.elementos.get({Cancelar:'cfCancelar', X:'cfX', Fondo:'cfOverlay'}[accion]).emitir('click')
    await p
    assert.equal(llamadas, 0); assert.equal(b.disabled, false); assert.equal(ui.documento.activeElement, b)
    const segundo = ui.toggle('A', b); ui.elementos.get('cfCancelar').emitir('click'); await segundo
  })
}
test('Otro QR se ignora durante el RPC y la recarga; al terminar se libera', async () => {
  let terminarE2, terminarRecarga, llamadas = 0, recargas = 0
  const ui = interfazQR(async () => { llamadas++; await new Promise(r => { terminarE2 = r }) },
    async () => { recargas++; await new Promise(r => { terminarRecarga = r }) })
  const p = ui.toggle('A', ui.elementos.get('A'))
  await ui.toggle('B', ui.elementos.get('B'))
  ui.elementos.get('cfOk').emitir('click'); await Promise.resolve()
  assert.equal(llamadas, 1)
  await ui.toggle('B', ui.elementos.get('B')); assert.equal(llamadas, 1)
  terminarE2(); await new Promise(setImmediate)
  assert.equal(recargas, 1); assert.ok(ui.elementos.get('A').disabled)
  await ui.toggle('B', ui.elementos.get('B')); assert.equal(llamadas, 1)
  terminarRecarga(); await p
  assert.equal(ui.elementos.get('A').disabled, false)
  const otro = ui.toggle('B', ui.elementos.get('B')); ui.elementos.get('cfCancelar').emitir('click'); await otro
})
test('Fallo de operación y recarga produce avisos, libera y no deja rechazo pendiente', async () => {
  const ui = interfazQR(async () => { throw Error('operación') }, async () => { throw Error('recarga') })
  const p = ui.toggle('A', ui.elementos.get('A')); ui.elementos.get('cfOk').emitir('click'); await p
  assert.equal(ui.avisos.length, 2); assert.equal(ui.elementos.get('A').disabled, false)
  const otro = ui.toggle('B', ui.elementos.get('B')); ui.elementos.get('cfCancelar').emitir('click'); await otro
})
test('Un destino con porcentaje mal formado conserva tipo y ruta sin romper el catálogo', () => {
  const c = ctx(tramo('admin/canales.html', 'function decodificarSeguro(', 'function renderCanalCard'), {
    BASE_URL: 'https://staging.surpatagonian.com', _propiedadesPorId: new Map([['123','Casa']]), _proyectosPorSlug: new Map([['sur','Sur']])})
  assert.equal(c.destinoDeCanal({destino:'/%E0%A4%A'}).nombre, 'Página del sitio')
  assert.equal(c.destinoDeCanal({destino:'/propiedad.html?id=%ZZ'}).nombre, 'Propiedad')
  assert.equal(c.destinoDeCanal({destino:'/propiedad.html?id=123'}).nombre, 'Propiedad · CASA')
  assert.equal(c.destinoDeCanal({destino:'/sur'}).nombre, 'Proyecto · SUR')
})
