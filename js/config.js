// ============================================================
// SUR PATAGONIA — Configuración de Supabase
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wajkfydxutptcvvfwrvq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// URL pública del bucket de imágenes
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/imagenes/`

// ── Sistema de referidos (canales de venta) ──────────────────
// Captura ?ref= del URL y lo persiste 30 días en localStorage.
// Así la atribución sobrevive aunque el visitante navegue por el
// sitio o vuelva días después por otra vía.
const REF_KEY  = 'sp_ref'
const REF_DIAS = 30
const REF_RE   = /^[a-z0-9-]{2,80}$/

;(function capturarRef() {
  try {
    const ref = new URLSearchParams(location.search).get('ref')
    if (ref && REF_RE.test(ref)) {
      localStorage.setItem(REF_KEY, JSON.stringify({ ref, ts: Date.now() }))
    }
  } catch (e) { /* localStorage bloqueado: seguimos sin persistencia */ }
})()

// Devuelve el código de referido vigente (URL primero, después localStorage), o null.
export function getRef() {
  try {
    const urlRef = new URLSearchParams(location.search).get('ref')
    if (urlRef && REF_RE.test(urlRef)) return urlRef
    const raw = localStorage.getItem(REF_KEY)
    if (!raw) return null
    const { ref, ts } = JSON.parse(raw)
    if (!ref || !REF_RE.test(ref) || Date.now() - ts > REF_DIAS * 86400000) {
      localStorage.removeItem(REF_KEY)
      return null
    }
    return ref
  } catch (e) { return null }
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

  const nombre = `${carpeta}/${Date.now()}_${archivoOptimizado.name.replace(/\s/g, '_')}`
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
