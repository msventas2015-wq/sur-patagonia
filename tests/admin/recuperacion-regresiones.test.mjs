import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Execute the real page handlers with synthetic DOM/database responses.
// These tests never connect to Supabase and do not prove server atomicity/RLS.
const read = name => fs.readFileSync(new URL('../../admin/' + name, import.meta.url), 'utf8')
const part = (name, start, end) => {
  const s = read(name), a = s.indexOf(start), b = s.indexOf(end, a + start.length)
  assert.ok(a >= 0 && b > a, name + ': handler boundaries')
  return s.slice(a, b)
}
const run = (source, context) => { vm.createContext(context); vm.runInContext(source, context); return context }
const plain = value => JSON.parse(JSON.stringify(value))
const elements = () => {
  const nodes = new Map()
  return id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, dataset: {}, style: {}, classList: { contains: () => false } })
    return nodes.get(id)
  }
}

for (const [label, crm, alq, confirmed, expected] of [
  ['CRM vinculado', { data: [{ id: 'event' }] }, { data: [] }, true, 0],
  ['Alquileres vinculado', { data: [] }, { data: [{ id: 'party' }] }, true, 0],
  ['lectura CRM falla', { error: { message: 'offline' } }, { data: [] }, true, 0],
  ['lectura Alquileres falla', { data: [] }, { error: { message: 'denied' } }, true, 0],
  ['cancelación', { data: [] }, { data: [] }, false, 0],
  ['sin vínculos y confirmado', { data: [] }, { data: [] }, true, 1],
]) test('Usuarios: ' + label, async () => {
  const calls = [], queries = [], ctx = {
    window: {}, console: { error() {} }, alert() {}, confirm: () => confirmed, cargarUsuarios() {},
    supabase: {
      from(table) { const q = { select() { return q }, eq(column, value) { queries.push([table, column, value]); return q }, limit: async () => table === 'crm_eventos' ? crm : alq }; return q },
      rpc: async (...args) => { calls.push(args); return {} },
    },
  }
  run(part('usuarios.html', 'window.eliminarUsuario =', '// ── Toggle activo'), ctx)
  await ctx.window.eliminarUsuario('user-test', 'synthetic@example.test')
  assert.equal(calls.length, expected)
  assert.deepEqual(queries, [['crm_eventos', 'actor_id', 'user-test'], ['alq_v_parte_usuario', 'auth_user_id', 'user-test']])
  if (expected) assert.deepEqual(plain(calls[0]), ['admin_eliminar_usuario', { p_user_id: 'user-test' }])
})

for (const file of ['nueva-propiedad.html', 'nuevo-canal.html']) test(file + ': ciudades canónicas, espacios y vacío', () => {
  const s = read(file), a = s.indexOf('const CIUDADES_CANONICAS'), end = s.indexOf(file === 'nuevo-canal.html' ? '  const payload = {' : '      const datos = {', a)
  const ctx = run(s.slice(a, end) + '\nthis.normalize = normalizarCiudad', {})
  for (const [value, expected] of [['  EL   BOLSON  ', 'El Bolsón'], ['epuyen', 'Epuyén'], ['el maitén', 'El Maitén'], ['lago  puelo', 'Lago Puelo'], ['  otra CIUDAD ', 'Otra Ciudad'], ['   ', '']]) assert.equal(ctx.normalize(value), expected)
})

test('Mapa QR: QR y link comparten universo; excluye navegación, manuales y otros puntos', async () => {
  const entries = [
    { canal_ref: 'a', canal_via: 'qr', origen: 'web' },
    { canal_ref: 'a', canal_via: 'link', origen: 'web' },
    { canal_ref: 'a', canal_via: null, origen: 'web' },
    { canal_ref: 'other', canal_via: 'qr', origen: 'web' },
  ]
  const contacts = [...entries, { canal_ref: 'a', canal_via: 'qr', origen: 'manual' }]
  const ctx = {
    state: { refs: [{ codigo: 'a' }], stats: new Map() }, hace30: () => '2026-09-02',
    supabase: { from(table) {
      let rows = table === 'visitas' ? entries : contacts
      const q = { select() { return q }, in(k, values) { rows = rows.filter(r => values.includes(r[k])); return q }, eq(k, value) { rows = rows.filter(r => r[k] === value); return q }, gte() { return q }, limit: async () => ({ data: rows }) }; return q
    } },
  }
  const predicate = read('mapa-qr.html').match(/^const esEntrada = .*$/m)[0]
  run(predicate + '\n' + part('mapa-qr.html', 'async function cargarMetricas()', 'function renderKpis()'), ctx)
  await ctx.cargarMetricas()
  assert.deepEqual(plain(ctx.state.stats.get('a')), { clics: 2, consultas: 2 })
})

for (const selected of ['', 'unknown']) test('Propietario: no envía con propiedad ' + (selected || 'vacía'), async () => {
  const $ = elements(), calls = []
  $('ncProp').value = selected; $('ncTexto').value = 'Consulta sintética'
  const ctx = { $, D: { prop: [{ id: 'allowed' }] }, sb: { rpc: async (...a) => { calls.push(a); return {} } }, toast() {}, cargar: async () => {} }
  run(part('alquileres-propietario.html', "$('btnNueva').onclick=", "$('btnLogin').onclick="), ctx)
  await $('btnNueva').onclick()
  assert.equal(calls.length, 0); assert.match($('msgNueva').textContent, /propiedad habilitada/)
})

for (const fail of [false, true]) test('Propietario: envío ' + (fail ? 'rechazado' : 'aceptado'), async () => {
  const $ = elements(), calls = []; let reloads = 0
  $('ncProp').value = 'allowed'; $('ncTexto').value = 'Consulta sintética'
  const ctx = { $, D: { prop: [{ id: 'allowed' }] }, sb: { rpc: async (...a) => { calls.push(a); return fail ? { error: { message: 'Rechazado' } } : {} } }, toast() {}, cargar: async () => { reloads++ } }
  run(part('alquileres-propietario.html', "$('btnNueva').onclick=", "$('btnLogin').onclick="), ctx)
  await $('btnNueva').onclick()
  assert.equal(calls.length, 1); assert.equal(calls[0][1].p_propiedad, 'allowed')
  assert.equal($('btnNueva').disabled, false); assert.equal(reloads, fail ? 0 : 1)
  assert.equal($('ncTexto').value, fail ? 'Consulta sintética' : '')
})

test('Propietario: render sin propiedades bloquea el formulario', () => {
  const $ = elements(), ctx = { $, D: { prop: [] } }
  run(part('alquileres-propietario.html', 'function render()', 'async function shaBlob('), ctx)
  ctx.render()
  for (const id of ['ncProp', 'ncTexto', 'btnNueva']) assert.equal($(id).disabled, true)
})

for (const search of ['?proyecto=test-id', '']) test('Mapa lotes: enlace heredado ' + (search || 'sin proyecto'), () => {
  const $ = elements(), redirects = [], links = []
  const ctx = { URL, URLSearchParams, location: { search, href: 'https://example.test/admin/mapa-lotes.html' + search, replace: u => redirects.push(String(u)) }, document: { getElementById: $, createElement: () => ({}), body: { appendChild: e => links.push(e) } } }
  run(read('mapa-lotes.html').match(/<script>([\s\S]*?)<\/script>/)[1], ctx)
  if (search) assert.deepEqual(redirects, ['https://example.test/admin/nuevo-proyecto.html?id=test-id&panel=mapa'])
  else { assert.equal(redirects.length, 0); assert.equal(links[0].href, 'proyectos.html') }
})

function editor({ id = 'project', duplicate = false, loaded = true, empty = false, result, mapActive = false } = {}) {
  const $ = elements(), rows = empty ? [] : [{ dataset: { origenId: duplicate ? '' : 'old-lot' } }], calls = [], alerts = []
  $('tabMapa').classList.contains = () => mapActive
  const ctx = {
    guardandoProyecto: false, modoDuplicar: duplicate, duplicacionLista: true, proyectoId: id, PUBLIC_HOST: 'https://example.test',
    getDatos: () => ({ proyecto: { nombre: 'Test', slug: 'test', estado: 'activo' }, lotes: empty ? [] : [{ origen_id: duplicate ? null : 'old-lot', numero: 'renamed' }] }),
    document: { getElementById: $, querySelectorAll: () => rows }, history: { replaceState() {} }, console: { error() {} },
    mostrarAlerta: (...a) => alerts.push(a),
    window: { _isMlCargado: () => loaded, _getMlPos: () => ({ 'old-lot': { x: 12, y: 34, tipo_lote: 'Bosque' } }), _getMlLotes: () => [{ id: 'old-lot' }] },
    supabase: { from() { throw new Error('No direct table writes allowed') }, rpc: async (name, payload) => { calls.push([name, payload]); return result ?? { data: { proyecto_id: id || 'new-project', creado: !id, lotes: empty ? 0 : 1, lote_ids: empty ? [] : ['new-lot'] } } } },
  }
  run(part('nuevo-proyecto.html', '  function mensajeErrorGuardado(', '  window.guardarBorrador ='), ctx)
  return { ctx, $, calls, alerts, rows }
}

test('G4: edición guarda con una RPC y relaciona mapa por origen aunque cambie número', async () => {
  const e = editor(); await e.ctx.guardar('borrador')
  assert.equal(e.calls.length, 1); assert.equal(e.calls[0][0], 'admin_guardar_proyecto_lotes')
  assert.deepEqual(plain(e.calls[0][1].p_lotes[0]), { origen_id: 'old-lot', numero: 'renamed', mapa_x: 12, mapa_y: 34, tipo_lote: 'Bosque' })
  assert.equal(e.rows[0].dataset.origenId, 'new-lot'); assert.equal(e.alerts[0][0], 'ok')
})

test('G4: mapa no cargado conserva los datos de servidor al omitir coordenadas', async () => {
  const e = editor({ loaded: false }); await e.ctx.guardar()
  assert.equal('mapa_x' in e.calls[0][1].p_lotes[0], false)
})

test('G4: alta duplicada empieza borrador y sin heredar mapa', async () => {
  const e = editor({ id: null, duplicate: true }); await e.ctx.guardar('activo')
  assert.equal(e.calls[0][1].p_proyecto.estado, 'borrador')
  assert.equal(e.calls[0][1].p_lotes[0].origen_id, null)
  assert.equal('mapa_x' in e.calls[0][1].p_lotes[0], false)
  assert.equal(e.ctx.proyectoId, 'new-project'); assert.equal(e.ctx.modoDuplicar, false)
})

test('G4: lista vacía se envía atómicamente', async () => {
  const e = editor({ empty: true }); await e.ctx.guardar()
  assert.equal(e.calls[0][1].p_lotes.length, 0); assert.equal(e.alerts[0][0], 'ok')
})

for (const result of [{ error: { message: 'E2_SLUG_VINCULADO_INMUTABLE' } }, { data: { proyecto_id: 'wrong' } }]) test('G4: error o respuesta incompleta no anuncia éxito ni borra como compensación', async () => {
  const e = editor({ result }); await e.ctx.guardar()
  assert.equal(e.calls.length, 1); assert.equal(e.alerts[0][0], 'error')
  assert.equal(e.rows[0].dataset.origenId, 'old-lot')
  assert.equal(e.$('btnGuardarBorrador').disabled, false)
})

test('G4: slug queda bloqueado si hay QR o falla la verificación', async () => {
  for (const result of [{ data: { qrs: 1 } }, { error: { message: 'offline' } }, { data: {} }, { data: { qrs: 0 } }]) {
    const $ = elements(), ctx = { document: { getElementById: $ }, supabase: { rpc: async () => result }, console: { error() {} }, SLUG_AYUDA_NORMAL: 'Normal' }
    run(part('nuevo-proyecto.html', '  function protegerSlugMientrasVerifica()', '  // Leer parámetros'), ctx)
    await ctx.actualizarProteccionSlug('project')
    assert.equal($('slug').readOnly, result.data?.qrs !== 0)
  }
})
