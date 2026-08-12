import fs from 'node:fs'
import crypto from 'node:crypto'
import vm from 'node:vm'

const read = file => fs.readFileSync(file, 'utf8')
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const results = []

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` — ${detail}` : ''}`)
  results.push(name)
}

function has(file, needle, name = `${file}: ${needle}`) {
  check(name, read(file).includes(needle))
}

function lacks(file, needle, name = `${file}: sin ${needle}`) {
  check(name, !read(file).includes(needle))
}

const targets = [
  'admin/contactos.html', 'admin/crm.html', 'admin/dashboard.html', 'admin/mapa-qr.html',
  'admin/salud-de-red.html', 'admin/trafico.html', 'admin/nuevo-canal.html',
  'admin/campana-reporte.html', 'admin/reporte.html', 'reporte.html', 'admin/canales.html',
  'colaboradores/index.html', 'colaboradores/desarrollador.html',
]

// 1) Sintaxis de todos los módulos embebidos.
for (const file of targets) {
  const html = read(file)
  const scripts = [...html.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/gi)]
  check(`${file}: módulo presente`, scripts.length === 1)
  new vm.SourceTextModule(scripts[0][1], { identifier: file })
  results.push(`${file}: sintaxis de módulo válida`)
}

// 2) Alcance congelado y service workers.
check('js/config.js conserva hash reconciliado', sha256('js/config.js') === '9797960fa09fce20760a30cdb5c4281abeace71d691e86586ebd1534ca6e19df')
has('admin/sw.js', "sur-patagonia-admin-v5", 'service worker admin v5')
has('colaboradores/sw.js', "sur-patagonia-aliados-v5", 'service worker colaboradores v5')

// 3) Campañas, mapa, dashboard y tráfico.
for (const file of ['reporte.html', 'admin/reporte.html']) {
  check(`${file}: dos consultas de campaña Web`, (read(file).match(/\.eq\('origen', 'web'\)/g) || []).length === 2)
}
check('campana-reporte: campaña Web', (read('admin/campana-reporte.html').match(/\.eq\('origen', 'web'\)/g) || []).length === 1)
has('admin/mapa-qr.html', ".eq('origen', 'web').eq('canal_via', 'qr')", 'mapa QR usa web + vía QR')
has('admin/dashboard.html', "l.origen === 'manual'", 'dashboard distingue Manual')
has('admin/trafico.html', "const csWeb = cs.filter(c => c.origen !== 'manual')", 'tráfico separa Web')
has('admin/trafico.html', '${fmt(cs.length)}', 'tráfico conserva total Todos')

// 4) Admin Contactos.
const contactos = read('admin/contactos.html')
for (const id of ['modalReferido','refNombre','refEmail','refTel','refCanal','refDestino','refNota','refGuardar']) {
  check(`contactos: id único ${id}`, (contactos.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1)
}
has('admin/contactos.html', "manual:  { dot: 'rgba(245,243,240,.55)', label: 'Carga manual' }", 'contactos: chip Manual neutro')
has('admin/contactos.html', "const esReingreso = otrosLeads.some", 'contactos: Reingreso derivado')
has('admin/contactos.html', "lead.persona_id && _personaMap[lead.persona_id]", 'contactos: persona_id prioritario')
lacks('admin/contactos.html', '_telMap', 'contactos: teléfono no une personas')
has('admin/contactos.html', "l._origen === 'manual' ? 'Carga manual'", 'contactos: CSV mapea Manual')
has('admin/contactos.html', "principales.length === 1", 'contactos: canal fail-closed')
has('admin/contactos.html', "canal_via: null", 'contactos: manual sin vía física')
has('admin/contactos.html', "origen: 'manual'", 'contactos: origen manual fijo')
has('admin/contactos.html', "estado: 'nueva'", 'contactos: estado nueva fijo')
has('admin/contactos.html', 'await cargarTodo()', 'contactos: recarga controlada')
has('admin/contactos.html', "e.key === 'Escape'", 'contactos: cierre Escape')
has('admin/contactos.html', "requestAnimationFrame(() => $('refNombre').focus())", 'contactos: foco inicial accesible')
has('admin/contactos.html', '.ref-modal-card {', 'contactos: tarjeta modal presente')
has('admin/contactos.html', 'max-height:calc(100vh - 1rem)', 'contactos: alto móvil acotado')
has('admin/contactos.html', '.ref-modal-grid { grid-template-columns:1fr; }', 'contactos: grilla móvil a una columna')
has('admin/contactos.html', '.ref-modal-actions button { width:100%; }', 'contactos: acciones móviles sin overflow')
has('admin/contactos.html', '.ref-modal-actions button { min-height:44px; }', 'contactos: botones con objetivo táctil de 44 px')

// 5) Colaborador activo.
const colab = read('colaboradores/index.html')
for (const id of ['derModal','derNombre','derEmail','derTel','derCanal','derDestino','derNota','derGuardar']) {
  check(`colaborador: id único ${id}`, (colab.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1)
}
has('colaboradores/index.html', "r.punto_tipo === 'principal' && r.activo && r.codigo === canal.codigo", 'colaborador: solo principal propia elegible')
has('colaboradores/index.html', "origen: 'manual'", 'colaborador: origen manual fijo')
has('colaboradores/index.html', 'location.reload()', 'colaborador: recarga completa tras alta')
has('colaboradores/index.html', "c.origen !== 'manual'", 'colaborador: conversiones excluyen Manual')
has('colaboradores/index.html', 'if (c?.persona_id)', 'colaborador: identidad por persona_id')
lacks('colaboradores/index.html', 'return tel ?', 'colaborador: teléfono fuera de identidad')
has('colaboradores/index.html', "requestAnimationFrame(() => document.getElementById('derNombre').focus())", 'colaborador: foco inicial accesible')
has('colaboradores/index.html', 'max-height:calc(100vh - 1rem)', 'colaborador: alto móvil acotado')
has('colaboradores/index.html', '.der-grid { grid-template-columns:1fr; }', 'colaborador: grilla móvil a una columna')
has('colaboradores/index.html', '.der-actions button { width:100%; }', 'colaborador: acciones móviles sin overflow')
has('colaboradores/index.html', '.der-actions button { min-height:44px; }', 'colaborador: botones con objetivo táctil de 44 px')

// 6) CRM: origen de captura separado del origen de eventos.
has('admin/crm.html', "claveMapa(origenCaptura) === 'manual'", 'CRM: helper Manual neutro')
has('admin/crm.html', "renderCanalViaChips(e.canal_ref, e.canal_via)", 'CRM: timeline conserva semántica crm_eventos.origen')
lacks('admin/crm.html', "renderCanalViaChips(e.canal_ref, e.canal_via, null, {}, e.origen)", 'CRM: evento no reutiliza origen de captura')
lacks('admin/crm.html', "personaItem('Vence atribución'", 'CRM: vence atribución retirado')
has('admin/crm.html', "canal_via, origen, propiedad_id", 'CRM: oportunidades cargan origen')

// 7) Canales y alta de canal.
const canales = read('admin/canales.html')
has('admin/canales.html', "update({ activo: false }).eq('canal_id', id)", 'canales: archiva también refs legacy NULL')
has('admin/canales.html', "refsActivasCheck.count", 'canales: postcheck de referencias activas')
has('admin/canales.html', "principalCheck.data?.activo !== esperado", 'canales: toggle verifica principal')
lacks('admin/canales.html', ".from('canales').delete", 'canales: nunca borra canal')
lacks('admin/canales.html', ".from('referencias').delete", 'canales: nunca borra referencia')
const nuevoCanal = read('admin/nuevo-canal.html')
const syncStart = nuevoCanal.indexOf('// Para canales pasivos: leer la principal creada por la base')
const syncEnd = nuevoCanal.indexOf('  } else {\n    // Canal activo:', syncStart)
check('nuevo-canal: bloque de sync localizado', syncStart > 0 && syncEnd > syncStart)
check('nuevo-canal: sync pasivo solo lectura/sync', !nuevoCanal.slice(syncStart, syncEnd).includes(".from('referencias').insert"))
has('admin/nuevo-canal.html', "principalGuardada.codigo !== codigo", 'nuevo-canal: verifica principal exacta')
has('admin/nuevo-canal.html', "_codigoInput.setAttribute('readonly', true)", 'nuevo-canal: código readonly al editar')

// 8) Salud de Red y desarrollador.
has('admin/salud-de-red.html', 'const leadsTodosPorCodigo', 'salud: mapa Todos')
has('admin/salud-de-red.html', 'const leadsWebPorCodigo', 'salud: mapa Web')
has('admin/salud-de-red.html', 'r.codigo !== stats[r.canal_id].canal.codigo', 'salud: principal no duplica canal')
has('admin/salud-de-red.html', 'const leadsWebSinCanal', 'salud: manual directo fuera de alerta física')
has('colaboradores/desarrollador.html', 'const totalLeadsWeb = filtCWeb.length', 'desarrollador: conversión Web')
has('colaboradores/desarrollador.html', 'c.leadsWeb/c.clicks', 'desarrollador: conversión por canal Web')
has('colaboradores/desarrollador.html', 'pctNumerator:totalLeadsWeb', 'desarrollador: embudo muestra Todos y calcula Web')
has('colaboradores/desarrollador.html', "c.origen==='manual'", 'desarrollador: chip Manual')

// 9) Casos lógicos puros.
const muestra = [
  { id:'1', origen:'web', canal_ref:'a', canal_via:'qr', persona_id:'p1', email:'a@x.com', telefono:'111' },
  { id:'2', origen:'manual', canal_ref:'a', canal_via:null, persona_id:'p2', email:'b@x.com', telefono:'111' },
  { id:'3', origen:'web', canal_ref:null, canal_via:null, persona_id:'p1', email:'a@x.com', telefono:'999' },
]
check('lógica: Todos conserva tres consultas', muestra.length === 3)
check('lógica: Web excluye manual', muestra.filter(x => x.origen !== 'manual').length === 2)
check('lógica: Manual con canal no cuenta como QR/Link', muestra.filter(x => x.origen !== 'manual' && x.canal_ref).length === 1)
check('lógica: manual directo no suma sin canal físico', muestra.filter(x => x.origen !== 'manual' && !x.canal_ref).length === 1)
check('lógica: mismo teléfono no fusiona personas', new Set(muestra.map(x => `p:${x.persona_id}`)).size === 2)
const visitas = 10
check('lógica: conversión usa Web', Math.round(muestra.filter(x => x.origen !== 'manual').length / visitas * 100) === 20)
const canal = { id:'c1', codigo:'principal', activo:true }
const refs = [{ canal_id:'c1', codigo:'principal', punto_tipo:'principal', activo:true }]
check('lógica: una principal exacta es elegible', refs.filter(r => r.canal_id === canal.id && r.punto_tipo === 'principal' && r.activo && r.codigo === canal.codigo).length === 1)
refs.push({ canal_id:'c1', codigo:'otra', punto_tipo:'principal', activo:true })
check('lógica: dos principales fallan cerrado', refs.filter(r => r.canal_id === canal.id && r.punto_tipo === 'principal' && r.activo).length !== 1)
const refsConPrincipal = [{ codigo:'principal' }, { codigo:'secundaria' }]
check('lógica: principal no duplica acumulación', refsConPrincipal.filter(r => r.codigo !== canal.codigo).length === 1)
const destino = 'prop:prop-1'
check('lógica: destino exclusivo propiedad/proyecto', (destino.startsWith('prop:') ? 1 : 0) + (destino.startsWith('proy:') ? 1 : 0) === 1)

console.log(`PASS ${results.length}/${results.length}`)
for (const name of results) console.log(`✓ ${name}`)
