// ============================================================
// SUR PATAGONIAN — Configuración de Supabase
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
import { pageviewIntent, releaseLandingAfterAck } from './qr-pageview-intent.mjs'

const SUPABASE_URL = 'https://wajkfydxutptcvvfwrvq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'

// Exportar credenciales para archivos que necesitan crear clientes auxiliares (ej: usuarios.html)
export { SUPABASE_URL, SUPABASE_KEY }

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// URL pública del bucket de imágenes
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/imagenes/`

// ── Dominio público canónico (FUENTE ÚNICA — no repetir el host en páginas) ──
// Migración jul-2026: surpatagonia.com.ar queda como dominio legado (redirección).
export const PUBLIC_BASE_URL = 'https://surpatagonian.com'
export const PUBLIC_HOST = 'surpatagonian.com'
export function buildPublicUrl(path = '/', params = null) {
  const url = new URL(path, PUBLIC_BASE_URL)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

// ── Blindaje QR v1 ───────────────────────────────────────────
// La identidad comercial ya no viaja por URL/localStorage ni la decide el
// navegador. Queda en cookies HttpOnly y se valida contra el ledger servidor.
const LEGACY_REF_KEY='sp_ref'
try { localStorage.removeItem(LEGACY_REF_KEY) } catch (e) {}
try { sessionStorage.removeItem(LEGACY_REF_KEY) } catch (e) {}
try { document.cookie=`${LEGACY_REF_KEY}=; Max-Age=0; Path=/; SameSite=Lax` } catch (e) {}

// Compatibilidad temporal de imports: nunca entrega identidad manipulable.
export function getRef() { return null }
export function getRefVia() { return null }

function contextoPagina(opciones={}) {
  const url=new URL(location.href)
  const path=url.pathname.replace(/\/$/,'')||'/'
  if(path==='/'||path==='/index.html') return {path:'/',propiedad_id:null,proyecto_slug:null}
  if(path==='/propiedades'||path==='/propiedades.html') return {path:'/propiedades',propiedad_id:null,proyecto_slug:null}
  if(path==='/proyectos'||path==='/proyectos.html') return {path:'/proyectos',propiedad_id:null,proyecto_slug:null}
  if(path==='/servicios'||path==='/servicios.html') return {path:'/servicios',propiedad_id:null,proyecto_slug:null}
  if(path==='/propiedad'||path==='/propiedad.html') return {path:'/propiedad',propiedad_id:opciones.propiedadId??url.searchParams.get('id'),proyecto_slug:null}
  const slug=opciones.proyectoSlug||opciones.pagina||url.searchParams.get('slug')||path.slice(1)
  return {path:'/proyecto-mini',propiedad_id:null,proyecto_slug:slug}
}

export async function registrarVisita(opciones={}) {
  try {
    const intent=pageviewIntent(window,contextoPagina(opciones),sessionStorage)
    const response=await fetch('/api/qr/pageview',{method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(intent)})
    if(!response.ok) throw new Error(`pageview_${response.status}`)
    const result=await response.json()
    if(result?.ok!==true) throw new Error('pageview_invalida')
    releaseLandingAfterAck(window)
    return {ok:true}
  } catch(error) { return {ok:false,error} }
}

export async function enviarContactoSeguro(datos) {
  const payload={version:1,request_id:crypto.randomUUID(),nombre:datos.nombre,
    email:datos.email||null,telefono:datos.telefono||null,mensaje:datos.mensaje,
    propiedad_id:datos.propiedad_id||null,proyecto_slug:datos.proyecto_slug||null,
    fuente:datos.fuente}
  const response=await fetch('/api/contacto',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  if(response.status!==201) throw new Error(`contacto_${response.status}`)
  const result=await response.json()
  if(result?.ok!==true) throw new Error('contacto_no_confirmado')
  return {ok:true}
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
