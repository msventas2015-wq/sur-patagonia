import { supabase } from '../js/config.js'

const GA4_PROPERTY_ID = '553717417'
const GA4_MEASUREMENT_ID = 'G-EWLCEV4Y6Q'
const GA4_URL = 'https://analytics.google.com/analytics/web/#/a407668318p553717417/realtime/overview'
const PAGE_SIZE = 1000
const MAX_PAGES = 200
const TZ = 'America/Argentina/Buenos_Aires'
const SELF_HOSTS = new Set(['surpatagonian.com', 'surpatagonia.com.ar'])
const TEST_RE = /(?:^|[\s_-])(prueba|test|demo|varios)(?:$|[\s_-])/i

const $ = (id) => document.getElementById(id)
const state = {
  range: null,
  preset: 30,
  charts: {},
  map: null,
  layers: [],
  catalogs: null,
  lastData: null,
  hideTests: true,
}

const fmt = (value, maximumFractionDigits = 0) => Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits })
const pct = (num, den, digits = 1) => den > 0 ? Number((num / den * 100).toFixed(digits)) : 0
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

function dateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function dateLabel(key) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
    .format(new Date(`${key}T12:00:00Z`))
}

function addDaysKey(key, amount) {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

function argentinaDayStart(key) {
  return new Date(`${key}T03:00:00.000Z`)
}

function presetRange(days) {
  const today = dateKey(new Date())
  const fromKey = addDaysKey(today, -(days - 1))
  const from = argentinaDayStart(fromKey)
  const to = new Date()
  const previousTo = from
  const previousFrom = argentinaDayStart(addDaysKey(fromKey, -days))
  return {
    from, to, previousFrom, previousTo,
    fromKey, toKey: today,
    label: days === 1 ? 'Hoy' : `Últimos ${days} días`,
    days,
  }
}

function customRange(fromKey, toKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromKey) || !/^\d{4}-\d{2}-\d{2}$/.test(toKey) || fromKey > toKey) {
    throw new Error('Elegí un rango de fechas válido.')
  }
  const from = argentinaDayStart(fromKey)
  const requestedTo = argentinaDayStart(addDaysKey(toKey, 1))
  const to = new Date(Math.min(requestedTo.getTime(), Date.now()))
  if (from >= to) throw new Error('El rango elegido todavía no comenzó.')
  const days = Math.round((argentinaDayStart(toKey) - from) / 86400000) + 1
  if (days > 366) throw new Error('El rango máximo es de 366 días.')
  const previousTo = from
  const previousFrom = new Date(from.getTime() - days * 86400000)
  return {
    from, to, previousFrom, previousTo,
    fromKey, toKey,
    label: `${dateLabel(fromKey)} — ${dateLabel(toKey)}`,
    days,
  }
}

function rangeKeys(range) {
  const keys = []
  for (let key = range.fromKey; key <= range.toKey; key = addDaysKey(key, 1)) keys.push(key)
  return keys
}

function delta(current, previous, suffix = '%') {
  if (!previous) return `<span class="traffic-delta is-flat">sin base previa</span>`
  const value = (current - previous) / previous * 100
  const cls = value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat'
  const sign = value > 0 ? '+' : ''
  return `<span class="traffic-delta ${cls}">${sign}${fmt(value, 1)}${suffix}</span>`
}

function secondsLabel(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`
}

function showStatus(message, type = 'info') {
  const el = $('trafficStatus')
  el.className = `traffic-status is-visible${type === 'error' ? ' is-error' : ''}`
  el.innerHTML = message
}

function hideStatus() {
  $('trafficStatus').className = 'traffic-status'
  $('trafficStatus').textContent = ''
}

async function fetchPaged(buildQuery) {
  const rows = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
  throw new Error(`La consulta superó el límite de seguridad de ${fmt(PAGE_SIZE * MAX_PAGES)} filas.`)
}

async function exactCount(table, from, to) {
  const { count, error } = await supabase.from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
  if (error) throw error
  return Number(count || 0)
}

function visitQuery(from, to) {
  return supabase.from('visitas')
    .select('id,pagina,propiedad_id,dispositivo,referrer,canal_ref,canal_via,created_at')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false })
}

function contactQuery(from, to) {
  return supabase.from('contactos')
    .select('id,origen,estado,propiedad_id,proyecto_slug,canal_ref,canal_via,created_at')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false })
}

async function loadRange(from, to) {
  const [visits, visitCount, contacts, contactCount] = await Promise.all([
    fetchPaged(() => visitQuery(from, to)),
    exactCount('visitas', from, to),
    fetchPaged(() => contactQuery(from, to)),
    exactCount('contactos', from, to),
  ])
  return {
    visits, contacts, visitCount, contactCount,
    visitsComplete: visits.length === visitCount,
    contactsComplete: contacts.length === contactCount,
  }
}

async function loadCatalogs() {
  if (state.catalogs) return state.catalogs
  const [properties, projects, channels, references] = await Promise.all([
    fetchPaged(() => supabase.from('propiedades').select('id,titulo').order('titulo')),
    fetchPaged(() => supabase.from('proyectos').select('id,nombre,slug,estado').order('nombre')),
    fetchPaged(() => supabase.from('canales').select('id,nombre,codigo,tipo,color_index,activo').order('nombre')),
    fetchPaged(() => supabase.from('referencias').select('id,codigo,canal_id,nombre,punto_tipo,punto_ubicacion,activo').order('codigo')),
  ])
  state.catalogs = { properties, projects, channels, references }
  return state.catalogs
}

async function loadGa4(range) {
  try {
    const { data, error } = await supabase.functions.invoke('ga4-admin-report', {
      body: { desde: range.fromKey, hasta: range.toKey },
    })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.error || 'GA4 no devolvió datos.')
    return { status: 'ready', ...data }
  } catch (error) {
    return {
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'La integración segura con GA4 no está disponible.',
    }
  }
}

function normalizePage(row, projectSlugs) {
  let raw = String(row.pagina || '').trim().toLowerCase()
  raw = raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0]
  raw = raw.replace(/^\/+|\/+$/g, '')
  if (!raw || raw === 'home' || raw === 'index' || raw === 'index.html') return { key: 'home', label: 'Inicio', known: true }
  if (raw === 'propiedades' || raw === 'propiedades.html') return { key: 'properties', label: 'Listado de propiedades', known: true }
  if (raw === 'propiedad' || raw === 'propiedad.html' || row.propiedad_id) return { key: 'property', label: 'Fichas de propiedades', known: true }
  if (raw === 'proyectos' || raw === 'proyectos.html') return { key: 'projects', label: 'Listado de desarrollos', known: true }
  if (raw === 'servicios' || raw === 'servicios.html') return { key: 'services', label: 'Servicios', known: true }
  if (raw === 'tour' || raw.includes('tour360')) return { key: 'tour', label: 'Tour 360°', known: true }
  if (raw === 'url_personalizada') return { key: 'custom', label: 'Destino externo instrumentado', known: true }
  if (projectSlugs.has(raw)) return { key: `project:${raw}`, label: projectSlugs.get(raw), group: 'project', known: true }
  return { key: `other:${raw || 'sin-pagina'}`, label: raw || 'Sin página', known: false }
}

function pageSummary(visits, catalogs) {
  const projectSlugs = new Map(catalogs.projects.map(p => [String(p.slug || '').toLowerCase(), p.nombre || p.slug]))
  const map = new Map()
  for (const visit of visits) {
    const page = normalizePage(visit, projectSlugs)
    const item = map.get(page.key) || { ...page, views: 0 }
    item.views += 1
    map.set(page.key, item)
  }
  return [...map.values()].sort((a, b) => b.views - a.views)
}

function normalizeHost(value) {
  let host = String(value || '').trim().toLowerCase()
  if (!host || host === 'directo') return 'directo'
  try { if (/^https?:\/\//.test(host)) host = new URL(host).hostname } catch (_) {}
  return host.replace(/^www\./, '').replace(/:\d+$/, '')
}

function sourceType(host) {
  const clean = normalizeHost(host)
  if (clean === 'directo') return 'direct'
  if (SELF_HOSTS.has(clean)) return 'internal'
  if (/(^|\.)google\.|(^|\.)bing\.com$|(^|\.)yahoo\.|duckduckgo\.com$/.test(clean)) return 'search'
  if (/instagram\.com$|facebook\.com$|t\.co$|twitter\.com$|linkedin\.com$|youtube\.com$/.test(clean)) return 'social'
  if (/localhost|127\.0\.0\.1|^\d{1,3}(?:\.\d{1,3}){3}$/.test(clean)) return 'invalid'
  return 'referral'
}

function sourceSummary(visits) {
  const categories = new Map([
    ['direct', { key: 'direct', label: 'Directo / sin referencia', count: 0, color: '#8a8a82' }],
    ['search', { key: 'search', label: 'Buscadores', count: 0, color: '#7aaeff' }],
    ['social', { key: 'social', label: 'Redes sociales', count: 0, color: '#b39ddb' }],
    ['referral', { key: 'referral', label: 'Otros sitios', count: 0, color: '#50c878' }],
    ['internal', { key: 'internal', label: 'Navegación interna', count: 0, color: '#6495ed' }],
    ['invalid', { key: 'invalid', label: 'Técnico / posible spam', count: 0, color: '#d9825b' }],
  ])
  const domains = new Map()
  for (const visit of visits) {
    const host = normalizeHost(visit.referrer)
    const type = sourceType(host)
    categories.get(type).count += 1
    if (!['direct', 'internal'].includes(type)) domains.set(host, (domains.get(host) || 0) + 1)
  }
  return {
    categories: [...categories.values()].sort((a, b) => b.count - a.count),
    domains: [...domains.entries()].map(([host, count]) => ({ host, count, type: sourceType(host) })).sort((a, b) => b.count - a.count),
  }
}

function buildCatalogMaps(catalogs) {
  const channelsById = new Map(catalogs.channels.map(c => [c.id, c]))
  const channelsByCode = new Map(catalogs.channels.map(c => [c.codigo, c]))
  const refsByCode = new Map(catalogs.references.map(r => [r.codigo, r]))
  return { channelsById, channelsByCode, refsByCode }
}

function resolveChannel(code, maps) {
  if (!code) return null
  const ref = maps.refsByCode.get(code)
  const channel = ref ? maps.channelsById.get(ref.canal_id) : maps.channelsByCode.get(code)
  if (!channel) return { key: code, code, name: code, type: 'sin identificar', ref: null, test: TEST_RE.test(code) }
  const point = ref?.nombre || ref?.punto_ubicacion || ref?.punto_tipo || ''
  const haystack = `${channel.nombre || ''} ${channel.codigo || ''} ${ref?.nombre || ''}`
  return {
    key: channel.id,
    code,
    name: channel.nombre || channel.codigo || code,
    type: channel.tipo || 'otro',
    point,
    ref,
    test: TEST_RE.test(haystack),
  }
}

function channelSummary(visits, contacts, catalogs) {
  const maps = buildCatalogMaps(catalogs)
  const grouped = new Map()
  const ensure = (code) => {
    const resolved = resolveChannel(code, maps)
    if (!resolved) return null
    if (!grouped.has(resolved.key)) grouped.set(resolved.key, { ...resolved, qr: 0, link: 0, unknown: 0, visits: 0, contacts: 0 })
    return grouped.get(resolved.key)
  }
  visits.filter(v => v.canal_ref).forEach(v => {
    const row = ensure(v.canal_ref)
    if (!row) return
    row.visits += 1
    if (v.canal_via === 'qr') row.qr += 1
    else if (v.canal_via === 'link') row.link += 1
    else row.unknown += 1
  })
  contacts.filter(c => c.origen !== 'manual' && c.canal_ref).forEach(c => {
    const row = ensure(c.canal_ref)
    if (row) row.contacts += 1
  })
  return [...grouped.values()]
    .map(row => ({ ...row, conversion: pct(row.contacts, row.visits) }))
    .sort((a, b) => b.visits - a.visits)
}

function contentRankings(visits, contacts, catalogs) {
  const propertyNames = new Map(catalogs.properties.map(p => [p.id, p.titulo || p.id]))
  const properties = new Map()
  visits.filter(v => v.propiedad_id).forEach(v => {
    const id = v.propiedad_id
    const row = properties.get(id) || { id, name: propertyNames.get(id) || `Propiedad ${String(id).slice(0, 8)}`, views: 0, contacts: 0 }
    row.views += 1
    properties.set(id, row)
  })
  contacts.filter(c => c.origen !== 'manual' && c.propiedad_id).forEach(c => {
    const id = c.propiedad_id
    const row = properties.get(id) || { id, name: propertyNames.get(id) || `Propiedad ${String(id).slice(0, 8)}`, views: 0, contacts: 0 }
    row.contacts += 1
    properties.set(id, row)
  })

  const projectNames = new Map(catalogs.projects.map(p => [p.slug, p.nombre || p.slug]))
  const projects = new Map()
  const pageRows = pageSummary(visits, catalogs).filter(row => row.group === 'project')
  pageRows.forEach(row => {
    const slug = row.key.slice('project:'.length)
    projects.set(slug, { slug, name: row.label, views: row.views, contacts: 0 })
  })
  contacts.filter(c => c.origen !== 'manual' && c.proyecto_slug).forEach(c => {
    const slug = c.proyecto_slug
    const row = projects.get(slug) || { slug, name: projectNames.get(slug) || slug, views: 0, contacts: 0 }
    row.contacts += 1
    projects.set(slug, row)
  })
  return {
    properties: [...properties.values()].sort((a, b) => b.views - a.views),
    projects: [...projects.values()].sort((a, b) => b.views - a.views),
  }
}

function coreMetrics(data, catalogs) {
  const pages = pageSummary(data.visits, catalogs)
  const byKey = new Map(pages.map(row => [row.key, row.views]))
  const projectViews = pages.filter(row => row.group === 'project').reduce((sum, row) => sum + row.views, 0)
  const digitalContacts = data.contacts.filter(c => c.origen !== 'manual')
  return {
    views: data.visitCount,
    home: byKey.get('home') || 0,
    property: byKey.get('property') || 0,
    projects: (byKey.get('projects') || 0) + projectViews,
    contacts: digitalContacts.length,
    conversion: pct(digitalContacts.length, data.visitCount),
    mobile: data.visits.filter(v => v.dispositivo === 'mobile').length,
    mobileShare: pct(data.visits.filter(v => v.dispositivo === 'mobile').length, data.visits.length),
    pages,
  }
}

function kpi(label, value, sub, color) {
  return `<article class="traffic-kpi" style="--kpi-color:${color}">
    <div class="traffic-kpi-label">${esc(label)}</div>
    <div class="traffic-kpi-value">${value}</div>
    <div class="traffic-kpi-sub">${sub}</div>
  </article>`
}

function renderKpis(current, previous) {
  $('trafficKpis').innerHTML = [
    kpi('Cargas de página', fmt(current.views), `${state.range.label} ${delta(current.views, previous.views)}`, '#7aaeff'),
    kpi('Inicio', fmt(current.home), `${pct(current.home, current.views)}% de las cargas ${delta(current.home, previous.home)}`, '#6495ed'),
    kpi('Fichas de propiedades', fmt(current.property), `${pct(current.property, current.views)}% de las cargas ${delta(current.property, previous.property)}`, '#9aa7b2'),
    kpi('Consultas digitales', fmt(current.contacts), `Excluye carga manual ${delta(current.contacts, previous.contacts)}`, '#e8c96a'),
    kpi('Conversión digital', `${fmt(current.conversion, 1)}%`, `Consultas digitales ÷ cargas`, '#3bbf88'),
    kpi('Tráfico mobile', `${fmt(current.mobileShare)}%`, `${fmt(current.mobile)} cargas desde móvil`, '#b39ddb'),
  ].join('')
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { labels: { color: 'rgba(255,255,255,.56)', usePointStyle: true, boxWidth: 7, font: { family: 'Inter', size: 10 } } },
      tooltip: { backgroundColor: 'rgba(18,18,21,.96)', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1, titleColor: '#f5f3f0', bodyColor: 'rgba(255,255,255,.7)' },
    },
    scales: {
      x: { ticks: { color: 'rgba(255,255,255,.34)', maxTicksLimit: 12, font: { family: 'Inter', size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' } },
      y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,.34)', precision: 0, font: { family: 'Inter', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } },
    },
  }
}

function replaceChart(key, canvas, config) {
  state.charts[key]?.destroy()
  state.charts[key] = new Chart(canvas, config)
}

function renderActivity(visits, contacts) {
  const keys = rangeKeys(state.range)
  const views = new Map(keys.map(key => [key, 0]))
  const leads = new Map(keys.map(key => [key, 0]))
  visits.forEach(v => { const key = dateKey(new Date(v.created_at)); if (views.has(key)) views.set(key, views.get(key) + 1) })
  contacts.filter(c => c.origen !== 'manual').forEach(c => { const key = dateKey(new Date(c.created_at)); if (leads.has(key)) leads.set(key, leads.get(key) + 1) })
  replaceChart('activity', $('trafficActivityChart'), {
    type: 'line',
    data: {
      labels: keys.map(dateLabel),
      datasets: [
        { label: 'Cargas', data: keys.map(k => views.get(k)), borderColor: '#7aaeff', backgroundColor: 'rgba(122,174,255,.16)', borderWidth: 2, fill: true, tension: .34, pointRadius: keys.length > 31 ? 0 : 2 },
        { label: 'Consultas', data: keys.map(k => leads.get(k)), borderColor: '#e8c96a', backgroundColor: 'transparent', borderWidth: 1.6, fill: false, tension: .34, pointRadius: ctx => ctx.raw ? 2.5 : 0 },
      ],
    },
    options: chartBaseOptions(),
  })
}

function renderDevices(visits) {
  const counts = { mobile: 0, desktop: 0, tablet: 0, other: 0 }
  visits.forEach(v => { const key = counts[v.dispositivo] == null ? 'other' : v.dispositivo; counts[key] += 1 })
  replaceChart('devices', $('trafficDeviceChart'), {
    type: 'doughnut',
    data: {
      labels: ['Mobile', 'Desktop', 'Tablet', 'Sin identificar'],
      datasets: [{ data: [counts.mobile, counts.desktop, counts.tablet, counts.other], backgroundColor: ['#7aaeff', '#8a8a82', '#b39ddb', 'rgba(255,255,255,.12)'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,.48)', usePointStyle: true, boxWidth: 7, padding: 14, font: { family: 'Inter', size: 10 } } } } },
  })
}

function renderList(target, rows, { name, meta, value, color = () => '#7aaeff', empty = 'Sin datos en el período.' }) {
  const max = Math.max(1, ...rows.map(value))
  $(target).innerHTML = rows.length ? rows.map(row => `<div class="traffic-list-row">
    <div class="traffic-list-name">${esc(name(row))}${meta ? `<span class="traffic-list-meta">${esc(meta(row))}</span>` : ''}</div>
    <div class="traffic-list-track"><span class="traffic-list-fill" style="--bar:${value(row) / max * 100}%;--bar-color:${color(row)}"></span></div>
    <div class="traffic-list-value">${fmt(value(row))}</div>
  </div>`).join('') : `<div class="traffic-empty">${esc(empty)}</div>`
}

function renderPages(metrics) {
  renderList('trafficPages', metrics.pages.slice(0, 12), {
    name: row => row.label,
    meta: row => row.known ? 'Página agrupada' : 'Revisar clasificación',
    value: row => row.views,
    color: row => row.known ? '#7aaeff' : '#d9825b',
  })
}

function renderSources(visits) {
  const sources = sourceSummary(visits)
  renderList('trafficSources', sources.categories.filter(row => row.count), {
    name: row => row.label,
    meta: row => `${pct(row.count, visits.length)}% de las cargas`,
    value: row => row.count,
    color: row => row.color,
  })
  renderList('trafficReferrers', sources.domains.slice(0, 10), {
    name: row => row.host,
    meta: row => row.type === 'invalid' ? 'Revisar / posible spam' : 'Referencia externa',
    value: row => row.count,
    color: row => row.type === 'invalid' ? '#d9825b' : '#50c878',
    empty: 'Todavía no hay referencias externas identificadas.',
  })
  return sources
}

function renderChannels(rows) {
  const visible = rows.filter(row => !(state.hideTests && row.test)).slice(0, 30)
  $('trafficChannels').innerHTML = visible.length ? `<div class="traffic-table-wrap"><table class="traffic-table">
    <thead><tr><th>Canal</th><th>Medio registrado</th><th class="is-number">Cargas</th><th class="is-number">Consultas</th><th class="is-number">Conversión</th></tr></thead>
    <tbody>${visible.map(row => `<tr>
      <td><span class="traffic-name">${esc(row.name)}</span><span class="traffic-secondary">${esc(row.type)}${row.point ? ` · ${esc(row.point)}` : ''}</span>${row.test ? '<span class="traffic-warning-badge">posible prueba</span>' : ''}</td>
      <td><span class="traffic-via traffic-via--qr">${fmt(row.qr)} QR</span><span class="traffic-via traffic-via--link">${fmt(row.link)} link</span>${row.unknown ? `<span class="traffic-via traffic-via--unknown">${fmt(row.unknown)} sin medio</span>` : ''}</td>
      <td class="is-number">${fmt(row.visits)}</td><td class="is-number">${fmt(row.contacts)}</td><td class="is-number">${fmt(row.conversion, 1)}%</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="traffic-empty">Sin actividad atribuida a canales en el período.</div>'
  const hidden = rows.filter(row => row.test).length
  $('trafficTestCount').textContent = hidden ? `${hidden} canal${hidden === 1 ? '' : 'es'} marcado${hidden === 1 ? '' : 's'} como posible prueba` : 'No se detectaron nombres de prueba'
}

function renderRankings(visits, contacts, catalogs) {
  const ranks = contentRankings(visits, contacts, catalogs)
  renderList('trafficProperties', ranks.properties.slice(0, 10), {
    name: row => row.name,
    meta: row => `${fmt(row.contacts)} consulta${row.contacts === 1 ? '' : 's'} digital${row.contacts === 1 ? '' : 'es'}`,
    value: row => row.views,
    color: () => '#9aa7b2',
    empty: 'Sin fichas de propiedades vistas en el período.',
  })
  renderList('trafficProjects', ranks.projects.slice(0, 10), {
    name: row => row.name,
    meta: row => `${fmt(row.contacts)} consulta${row.contacts === 1 ? '' : 's'} digital${row.contacts === 1 ? '' : 'es'}`,
    value: row => row.views,
    color: () => '#b39ddb',
    empty: 'Sin miniwebs de desarrollos vistas en el período.',
  })
}

function renderQuality(current, metrics, sources, channels) {
  const pageKnown = metrics.pages.filter(row => row.known).reduce((sum, row) => sum + row.views, 0)
  const attributed = current.visits.filter(v => v.canal_ref).length
  const mediumKnown = current.visits.filter(v => v.canal_ref && ['qr', 'link'].includes(v.canal_via)).length
  const testVisits = channels.filter(row => row.test).reduce((sum, row) => sum + row.visits, 0)
  const rowsComplete = current.visitsComplete && current.contactsComplete ? 100 : pct(current.visits.length, current.visitCount)
  const items = [
    { label: 'Lectura completa', detail: `${fmt(current.visits.length)} de ${fmt(current.visitCount)} cargas`, value: rowsComplete, color: rowsComplete === 100 ? '#47d48a' : '#d9825b' },
    { label: 'Páginas clasificadas', detail: `${fmt(pageKnown)} de ${fmt(current.visitCount)}`, value: pct(pageKnown, current.visitCount), color: '#7aaeff' },
    { label: 'Medio conocido', detail: attributed ? `${fmt(mediumKnown)} de ${fmt(attributed)} atribuidas` : 'Sin cargas atribuidas', value: attributed ? pct(mediumKnown, attributed) : 100, color: attributed && mediumKnown < attributed ? '#d9825b' : '#50c878' },
    { label: 'Datos comerciales', detail: testVisits ? `${fmt(testVisits)} cargas en posibles pruebas` : 'Sin pruebas obvias', value: current.visitCount ? Math.max(0, 100 - pct(testVisits, current.visitCount)) : 100, color: testVisits ? '#e8c96a' : '#47d48a' },
  ]
  $('trafficQuality').innerHTML = items.map(item => `<div class="quality-row">
    <div class="quality-row-top"><strong>${esc(item.label)}</strong><span>${esc(item.detail)}</span></div>
    <div class="quality-bar" style="--quality:${item.value}%;--quality-color:${item.color}"><i></i></div>
  </div>`).join('') + `<div class="quality-note">“Cargas” son aperturas de páginas, no personas. La audiencia real —usuarios y sesiones— se obtiene exclusivamente de GA4.</div>`
}

const CITY_COORDS = new Map(Object.entries({
  'el bolson':[-41.964,-71.535], 'san carlos de bariloche':[-41.134,-71.31], 'bariloche':[-41.134,-71.31],
  'lago puelo':[-42.067,-71.615], 'el hoyo':[-42.061,-71.519], 'epuyen':[-42.221,-71.371],
  'esquel':[-42.91,-71.319], 'neuquen':[-38.951,-68.059], 'buenos aires':[-34.604,-58.382],
  'cordoba':[-31.417,-64.184], 'rosario':[-32.946,-60.639], 'mendoza':[-32.89,-68.845],
  'salta':[-24.783,-65.411], 'san miguel de tucuman':[-26.808,-65.217], 'ushuaia':[-54.801,-68.303],
  'comodoro rivadavia':[-45.864,-67.496], 'puerto madryn':[-42.769,-65.038], 'san martin de los andes':[-40.157,-71.353],
}))

const REGION_COORDS = new Map(Object.entries({
  'buenos aires':[-36.3,-60.2], 'ciudad autonoma de buenos aires':[-34.604,-58.382], 'catamarca':[-28.47,-65.78],
  'chaco':[-27.45,-58.99], 'chubut':[-43.3,-65.1], 'cordoba':[-31.4,-64.2], 'corrientes':[-27.47,-58.83],
  'entre rios':[-31.74,-60.52], 'formosa':[-26.18,-58.18], 'jujuy':[-24.19,-65.3], 'la pampa':[-36.62,-64.29],
  'la rioja':[-29.41,-66.86], 'mendoza':[-32.89,-68.85], 'misiones':[-27.37,-55.9], 'neuquen':[-38.95,-68.06],
  'rio negro':[-40.81,-63.0], 'salta':[-24.78,-65.41], 'san juan':[-31.54,-68.52], 'san luis':[-33.3,-66.34],
  'santa cruz':[-51.62,-69.22], 'santa fe':[-31.63,-60.7], 'santiago del estero':[-27.79,-64.26],
  'tierra del fuego':[-54.8,-68.3], 'tucuman':[-26.81,-65.22],
}))

const COUNTRY_COORDS = new Map(Object.entries({
  'argentina':[-38.42,-63.62], 'chile':[-33.45,-70.67], 'uruguay':[-32.52,-55.77], 'brazil':[-14.24,-51.93],
  'brasil':[-14.24,-51.93], 'united states':[39.5,-98.35], 'estados unidos':[39.5,-98.35], 'spain':[40.46,-3.75],
  'espana':[40.46,-3.75], 'mexico':[23.63,-102.55], 'colombia':[4.57,-74.3], 'peru':[-9.19,-75.02],
}))

function geoKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function geoCoordinates(row) {
  return CITY_COORDS.get(geoKey(row.city)) || REGION_COORDS.get(geoKey(row.region)) || COUNTRY_COORDS.get(geoKey(row.country)) || null
}

function renderGa4(ga) {
  const panel = $('trafficGaPanel')
  if (ga.status !== 'ready') {
    panel.classList.add('is-unavailable')
    $('trafficGaStatus').textContent = 'Integración pendiente de despliegue'
    $('trafficGaSummary').innerHTML = ['Usuarios', 'Sesiones', 'Vistas GA4', 'Interacción'].map(label => `<div class="traffic-ga-stat"><span>${label}</span><strong>—</strong></div>`).join('')
    $('trafficGaNote').innerHTML = `La propiedad <strong>${GA4_MEASUREMENT_ID}</strong> ya recibe datos. Para mostrarlos dentro de este panel falta desplegar la función protegida <strong>ga4-admin-report</strong> y configurar su cuenta de servicio. Ninguna credencial se expondrá en el navegador.`
    $('trafficGeoRows').innerHTML = '<div class="traffic-empty">El mapa se completará con ciudad, provincia/región y país estimados por GA4.</div>'
    ;['trafficGaAcquisition', 'trafficGaPages', 'trafficGaEvents'].forEach(id => {
      $(id).innerHTML = '<div class="traffic-empty">Disponible cuando se active la conexión segura con GA4.</div>'
    })
    renderGeoMap([])
    return
  }
  panel.classList.remove('is-unavailable')
  $('trafficGaStatus').textContent = `GA4 · propiedad ${GA4_PROPERTY_ID}`
  const current = ga.summary || {}
  const previous = ga.previous || {}
  const stats = [
    ['Usuarios', fmt(current.totalUsers), delta(current.totalUsers, previous.totalUsers)],
    ['Sesiones', fmt(current.sessions), delta(current.sessions, previous.sessions)],
    ['Vistas GA4', fmt(current.screenPageViews), delta(current.screenPageViews, previous.screenPageViews)],
    ['Interacción', `${fmt(Number(current.engagementRate || 0) * 100, 1)}%`, `${secondsLabel(current.averageSessionDuration)} promedio`],
  ]
  $('trafficGaSummary').innerHTML = stats.map(([label, value, sub]) => `<div class="traffic-ga-stat"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('')
  $('trafficGaNote').textContent = `Audiencia medida por GA4 para ${state.range.label.toLowerCase()}. Los datos geográficos son estimaciones de red y pueden diferir de la ubicación física de la persona.`
  renderGeoRows(ga.geo || [])
  renderGeoMap(ga.geo || [])
  renderGaDetails(ga)
}

function friendlyEvent(value) {
  const labels = {
    page_view: 'Vista de página', session_start: 'Inicio de sesión', first_visit: 'Primera visita',
    user_engagement: 'Interacción', enviar_consulta: 'Consulta enviada', click_whatsapp: 'Clic en WhatsApp',
    ver_contacto: 'Ver contacto', descargar_brochure: 'Brochure descargado',
  }
  return labels[value] || String(value || 'Sin nombre').replaceAll('_', ' ')
}

function renderGaDetails(ga) {
  renderList('trafficGaAcquisition', (ga.acquisition || []).slice(0, 8), {
    name: row => `${row.sessionSource || '(direct)'} / ${row.sessionMedium || '(none)'}`,
    meta: row => `${fmt(row.activeUsers)} usuario${Number(row.activeUsers) === 1 ? '' : 's'}`,
    value: row => Number(row.sessions || 0),
    color: () => '#d76f3f',
    empty: 'GA4 todavía no registró fuentes en este período.',
  })
  renderList('trafficGaPages', (ga.pages || []).slice(0, 8), {
    name: row => row.pageTitle || row.pagePath || 'Sin título',
    meta: row => `${fmt(row.activeUsers)} usuario${Number(row.activeUsers) === 1 ? '' : 's'} · ${row.pagePath || '/'}`,
    value: row => Number(row.screenPageViews || 0),
    color: () => '#7aaeff',
    empty: 'GA4 todavía no registró páginas en este período.',
  })
  renderList('trafficGaEvents', (ga.events || []).slice(0, 8), {
    name: row => friendlyEvent(row.eventName),
    meta: row => row.eventName || 'evento',
    value: row => Number(row.eventCount || 0),
    color: row => ['enviar_consulta', 'click_whatsapp', 'ver_contacto', 'descargar_brochure'].includes(row.eventName) ? '#e8c96a' : '#b39ddb',
    empty: 'GA4 todavía no registró eventos en este período.',
  })
}

function renderGeoRows(rows) {
  const sorted = rows.slice().sort((a, b) => Number(b.activeUsers || 0) - Number(a.activeUsers || 0)).slice(0, 14)
  $('trafficGeoRows').innerHTML = sorted.length ? `<div class="traffic-table-wrap"><table class="traffic-table">
    <thead><tr><th>Ciudad</th><th>Provincia / región</th><th>País</th><th class="is-number">Usuarios</th><th class="is-number">Sesiones</th></tr></thead>
    <tbody>${sorted.map(row => `<tr><td class="traffic-name">${esc(row.city || 'Sin identificar')}</td><td>${esc(row.region || '—')}</td><td>${esc(row.country || '—')}</td><td class="is-number">${fmt(row.activeUsers)}</td><td class="is-number">${fmt(row.sessions)}</td></tr>`).join('')}</tbody>
  </table></div>` : '<div class="traffic-empty">GA4 todavía no devolvió ubicaciones para este período.</div>'
}

function renderGeoMap(rows) {
  if (typeof L === 'undefined') return
  if (!state.map) {
    state.map = L.map('trafficGeoMap', { zoomControl: true, scrollWheelZoom: false }).setView([-38.4, -63.6], 3)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(state.map)
  }
  state.layers.forEach(layer => layer.remove())
  state.layers = []
  const plotted = []
  rows.forEach(row => {
    const coords = geoCoordinates(row)
    if (!coords) return
    const users = Number(row.activeUsers || 0)
    const marker = L.circleMarker(coords, {
      radius: Math.max(5, Math.min(18, 4 + Math.sqrt(users) * 2.2)),
      color: '#7aaeff', weight: 1.5, fillColor: '#6495ed', fillOpacity: .32,
    }).addTo(state.map)
    marker.bindPopup(`<strong>${esc(row.city || row.region || row.country || 'Ubicación')}</strong><br>${esc([row.region, row.country].filter(Boolean).join(' · '))}<br>${fmt(users)} usuarios · ${fmt(row.sessions)} sesiones`)
    state.layers.push(marker)
    plotted.push(coords)
  })
  if (plotted.length) state.map.fitBounds(plotted, { padding: [28, 28], maxZoom: 7 })
  else state.map.setView([-38.4, -63.6], 3)
  setTimeout(() => state.map?.invalidateSize(), 50)
}

function updateInputs(range) {
  $('trafficFrom').value = range.fromKey
  $('trafficTo').value = range.toKey
}

function setLoading(isLoading) {
  document.querySelectorAll('.traffic-period,.traffic-action').forEach(el => { el.disabled = isLoading })
  $('trafficRefresh').textContent = isLoading ? 'Cargando…' : 'Actualizar'
}

async function loadDashboard() {
  setLoading(true)
  showStatus('<strong>Actualizando datos reales.</strong> Se recorren todas las páginas de resultados; el panel no toma una muestra limitada.')
  try {
    const [catalogs, current, previous, ga] = await Promise.all([
      loadCatalogs(),
      loadRange(state.range.from, state.range.to),
      loadRange(state.range.previousFrom, state.range.previousTo),
      loadGa4(state.range),
    ])
    const currentMetrics = coreMetrics(current, catalogs)
    const previousMetrics = coreMetrics(previous, catalogs)
    const sources = renderSources(current.visits)
    const channels = channelSummary(current.visits, current.contacts, catalogs)
    state.lastData = { catalogs, current, previous, ga, currentMetrics, previousMetrics, sources, channels }
    renderKpis(currentMetrics, previousMetrics)
    renderActivity(current.visits, current.contacts)
    renderDevices(current.visits)
    renderPages(currentMetrics)
    renderChannels(channels)
    renderRankings(current.visits, current.contacts, catalogs)
    renderQuality(current, currentMetrics, sources, channels)
    renderGa4(ga)
    $('trafficRangeLabel').textContent = state.range.label
    $('trafficUpdated').textContent = `Actualizado ${new Intl.DateTimeFormat('es-AR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`
    if (!current.visitsComplete || !current.contactsComplete) {
      showStatus('<strong>Datos incompletos.</strong> La cantidad descargada no coincide con el conteo exacto. No uses estos indicadores para decisiones.', 'error')
    } else if (ga.status !== 'ready') {
      showStatus(`<strong>Histórico web completo:</strong> ${fmt(current.visitCount)} cargas y ${fmt(current.contacts.filter(c => c.origen !== 'manual').length)} consultas digitales. La audiencia y el mapa de GA4 quedarán activos al desplegar su función segura.`)
    } else {
      hideStatus()
    }
  } catch (error) {
    console.error('[Tráfico] No se pudo cargar el panel', error)
    showStatus(`<strong>No se pudieron verificar los datos.</strong> ${esc(error instanceof Error ? error.message : 'Error inesperado.')} El panel no reemplaza el fallo por ceros.`, 'error')
  } finally {
    setLoading(false)
  }
}

function selectPreset(days) {
  state.preset = days
  state.range = presetRange(days)
  document.querySelectorAll('.traffic-period').forEach(btn => btn.classList.toggle('is-active', Number(btn.dataset.days) === days))
  updateInputs(state.range)
  loadDashboard()
}

document.querySelectorAll('.traffic-period').forEach(btn => btn.addEventListener('click', () => selectPreset(Number(btn.dataset.days))))
$('trafficApply').addEventListener('click', () => {
  try {
    state.preset = null
    state.range = customRange($('trafficFrom').value, $('trafficTo').value)
    document.querySelectorAll('.traffic-period').forEach(btn => btn.classList.remove('is-active'))
    loadDashboard()
  } catch (error) {
    showStatus(`<strong>Rango inválido.</strong> ${esc(error.message)}`, 'error')
  }
})
$('trafficRefresh').addEventListener('click', loadDashboard)
$('trafficHideTests').addEventListener('change', (event) => {
  state.hideTests = event.target.checked
  if (state.lastData) renderChannels(state.lastData.channels)
})
$('trafficGaLink').href = GA4_URL

const { data: { session } } = await supabase.auth.getSession()
if (!session) {
  window.location.href = 'login.html'
  throw new Error('Sesión requerida')
}
if (session.user.app_metadata?.rol !== 'admin') {
  window.location.href = 'login.html'
  throw new Error('Permiso de administrador requerido')
}
$('btnLogout').addEventListener('click', async (event) => {
  event.preventDefault()
  await supabase.auth.signOut()
  window.location.href = 'login.html'
})

selectPreset(30)
