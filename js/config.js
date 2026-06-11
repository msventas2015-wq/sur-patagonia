// ============================================================
// SUR PATAGONIA — Configuración de Supabase
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wajkfydxutptcvvfwrvq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// URL pública del bucket de imágenes
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/imagenes/`

// ── Auto-optimizador de imágenes ──────────────────────────────
// Convierte cualquier imagen a WebP, redimensiona si supera el máximo,
// y mantiene la mejor calidad posible para web.
export async function optimizarImagen(archivo, opciones = {}) {
  const {
    maxAncho = 1920,   // px máximo en el lado más largo
    maxAlto  = 1920,
    calidad  = 0.85,   // 0–1, 0.85 = excelente calidad / peso óptimo
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

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

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
    calidad:  0.85,
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
