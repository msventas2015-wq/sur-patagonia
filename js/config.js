// ============================================================
// SUR PATAGONIA — Configuración de Supabase
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wajkfydxutptcvvfwrvq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'

// Exportar credenciales para archivos que necesitan crear clientes auxiliares (ej: usuarios.html)
export { SUPABASE_URL, SUPABASE_KEY }

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// URL pública del bucket de imágenes
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/imagenes/`

// ── Sistema de referidos (canales de venta) ──────────────────
// Captura ?canal= o ?ref= del URL y lo persiste 30 días en localStorage.
// Así la atribución sobrevive aunque el visitante navegue por el sitio.
const REF_KEY       = 'sp_ref'
const REF_DIAS      = 30
const REF_RE        = /^[a-z0-9-]{2,80}$/
const VISITA_KEY    = 'sp_ultima_visita'
const VISITA_DEDUPE = 10000

// Defensa central: cualquier archivo viejo que todavía haga
// supabase.from('visitas').insert(...) pasa por este filtro.
const supabaseFrom = supabase.from.bind(supabase)
supabase.from = function(table) {
  const query = supabaseFrom(table)
  if (table !== 'visitas' || !query?.insert) return query

  const insertOriginal = query.insert.bind(query)
  query.insert = function(values, options) {
    const fila = Array.isArray(values) ? values[0] : values
    if (fila && esVisitaDuplicada(claveVisita(fila))) {
      return Promise.resolve({ data: null, error: null, count: null, status: 200, statusText: 'OK', skipped: true })
    }
    return insertOriginal(values, options)
  }
  return query
}

function normalizarRef(ref) {
  const clean = String(ref || '').trim().toLowerCase()
  return REF_RE.test(clean) ? clean : null
}

function leerRefUrl() {
  try {
    const p = new URLSearchParams(location.search)
    const ref = normalizarRef(p.get('canal') || p.get('ref'))
    if (!ref) return null
    return { ref, via: p.get('via') === 'qr' ? 'qr' : 'link' }
  } catch (e) { return null }
}

function leerRefGuardado() {
  try {
    const raw = localStorage.getItem(REF_KEY)
    if (!raw) return null
    const { ref, via, ts } = JSON.parse(raw)
    const clean = normalizarRef(ref)
    if (!clean || Date.now() - ts > REF_DIAS * 86400000) {
      localStorage.removeItem(REF_KEY)
      return null
    }
    return { ref: clean, via: via === 'qr' ? 'qr' : 'link', ts }
  } catch (e) { return null }
}

;(function capturarRef() {
  try {
    const actual = leerRefUrl()
    if (actual) localStorage.setItem(REF_KEY, JSON.stringify({ ...actual, ts: Date.now() }))
  } catch (e) { /* localStorage bloqueado: seguimos sin persistencia */ }
})()

// Devuelve el código de referido vigente (URL primero, después localStorage), o null.
export function getRef() {
  return leerRefUrl()?.ref || leerRefGuardado()?.ref || null
}

// Devuelve cómo llegó el referido: 'qr', 'link', o null si no hay ref vigente.
export function getRefVia() {
  return leerRefUrl()?.via || leerRefGuardado()?.via || null
}

function paginaActual() {
  const limpia = window.location.pathname.replace(/\/$/, '')
  return limpia.split('/').pop() || 'home'
}

function dispositivoActual() {
  const ua = navigator.userAgent
  if (/Mobi|Android/i.test(ua)) return 'mobile'
  if (/Tablet|iPad/i.test(ua)) return 'tablet'
  return 'desktop'
}

function referrerActual() {
  try {
    return document.referrer ? new URL(document.referrer).hostname : 'directo'
  } catch (e) { return 'directo' }
}

function valorClave(v) {
  return v == null ? '' : String(v)
}

function claveVisita(v) {
  return JSON.stringify({
    pagina: valorClave(v.pagina),
    propiedad_id: valorClave(v.propiedad_id),
    canal_ref: valorClave(v.canal_ref),
    canal_via: valorClave(v.canal_via),
  })
}

function esVisitaDuplicada(key) {
  const now = Date.now()
  if (window.__spVisitKey === key) return true
  window.__spVisitKey = key
  try {
    const prev = JSON.parse(sessionStorage.getItem(VISITA_KEY) || 'null')
    if (prev?.key === key && now - prev.ts < VISITA_DEDUPE) return true
    sessionStorage.setItem(VISITA_KEY, JSON.stringify({ key, ts: now }))
  } catch (e) {}
  return false
}

export async function registrarVisita(opciones = {}) {
  try {
    const params = new URLSearchParams(window.location.search)
    const pagina = opciones.pagina || paginaActual()
    const propiedadId = opciones.propiedadId ?? params.get('id') ?? null
    const canalRef = getRef()
    const canalVia = getRefVia()
    const visita = {
      pagina,
      propiedad_id: propiedadId,
      referrer: referrerActual(),
      dispositivo: dispositivoActual(),
      canal_ref: canalRef,
      canal_via: canalVia,
    }

    const { data, error } = await supabase.from('visitas').insert(visita)
    if (error) throw error
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error }
  }
}

// ── Caché de site_config ──────────────────────────────────────
// Evita múltiples queries a la misma tabla cuando el usuario navega
// entre páginas en la misma sesión del browser.
const SITE_CONFIG_KEY = 'sp_site_config'
export async function getSiteConfig() {
  try {
    const cached = sessionStorage.getItem(SITE_CONFIG_KEY)
    if (cached) return JSON.parse(cached)
    const { data } = await supabase.from('site_config').select('key, value')
    if (!data) return {}
    const cfg = {}
    data.forEach(r => cfg[r.key] = r.value)
    sessionStorage.setItem(SITE_CONFIG_KEY, JSON.stringify(cfg))
    return cfg
  } catch (e) { return {} }
}

// ── Auto-optimizador de imágenes ──────────────────────────────
// Convierte cualquier imagen a WebP, redimensiona si supera el máximo,
// y mantiene la mejor calidad posible para web.
export async function optimizarImagen(archivo, opciones = {}) {
  const {
    maxAncho = 1920,   // px máximo en el lado más largo
    maxAlto  = 1920,
    calidad  = 0.92,   // 0–1, 0.92 = alta calidad con buen peso
  } = opciones

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calcular nuevas dimensiones respetando aspect ratio
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > maxAncho || h > maxAlto) {
        const ratio = Math.min(maxAncho / w, maxAlto / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }

      // Downscale en múltiples pasos si la reducción es >50% en cualquier eje
      // (evita el blur que produce el canvas al escalar en un solo paso)
      let srcW = img.naturalWidth
      let srcH = img.naturalHeight
      let currentImg = img

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      while (srcW > w * 2 || srcH > h * 2) {
        const stepW = Math.max(Math.round(srcW / 2), w)
        const stepH = Math.max(Math.round(srcH / 2), h)
        canvas.width  = stepW
        canvas.height = stepH
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(currentImg, 0, 0, stepW, stepH)
        // Reusar canvas como fuente del siguiente paso
        const stepCanvas = document.createElement('canvas')
        stepCanvas.width  = stepW
        stepCanvas.height = stepH
        stepCanvas.getContext('2d').drawImage(canvas, 0, 0)
        currentImg = stepCanvas
        srcW = stepW
        srcH = stepH
      }

      canvas.width  = w
      canvas.height = h
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(currentImg, 0, 0, w, h)

      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('No se pudo convertir la imagen')); return }
        // Renombrar con extensión .webp
        const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.webp'
        const webpFile = new File([blob], nombre, { type: 'image/webp' })
        resolve(webpFile)
      }, 'image/webp', calidad)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

// Función para subir imagen al storage (optimiza automáticamente antes de subir)
export async function subirImagen(archivo, carpeta = 'propiedades') {
  // Las fotos 360° necesitan más resolución para verse bien en el visor panorámico
  const es360 = carpeta.includes('360')
  const archivoOptimizado = await optimizarImagen(archivo, {
    maxAncho: es360 ? 4096 : 1920,
    maxAlto:  es360 ? 2048 : 1920,
    calidad:  0.92,
  })

  // Sanitizar nombre: quitar tildes, ñ, paréntesis y cualquier carácter inválido
  // Supabase Storage solo acepta letras, números, guiones, puntos y barras
  const nombreLimpio = archivoOptimizado.name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes (á→a, é→e, ñ→n…)
    .replace(/[^a-zA-Z0-9._-]/g, '_')                // reemplazar todo lo demás con _
    .replace(/_+/g, '_')                              // colapsar múltiples _ seguidos
    .replace(/^_|_$/g, '')                            // quitar _ al inicio y final
  const nombre = `${carpeta}/${Date.now()}_${nombreLimpio}`
  const { data, error } = await supabase.storage
    .from('imagenes')
    .upload(nombre, archivoOptimizado)
  if (error) throw error
  return STORAGE_URL + data.path
}

// Función para eliminar imagen del storage
export async function eliminarImagen(url) {
  const path = url.replace(STORAGE_URL, '')
  await supabase.storage.from('imagenes').remove([path])
}
