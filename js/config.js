// ============================================================
// SUR PATAGONIA — Configuración de Supabase
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://wajkfydxutptcvvfwrvq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RKpmv1VDwMOB25phyfFrog_OdI-wB8s'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// URL pública del bucket de imágenes
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/imagenes/`

// Función para subir imagen al storage
export async function subirImagen(archivo, carpeta = 'propiedades') {
  const nombre = `${carpeta}/${Date.now()}_${archivo.name.replace(/\s/g, '_')}`
  const { data, error } = await supabase.storage
    .from('imagenes')
    .upload(nombre, archivo)
  if (error) throw error
  return STORAGE_URL + data.path
}

// Función para eliminar imagen del storage
export async function eliminarImagen(url) {
  const path = url.replace(STORAGE_URL, '')
  await supabase.storage.from('imagenes').remove([path])
}
