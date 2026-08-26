export const PANEL_VISUAL_VERSION = 1
export const PANEL_CONFIG_KEY = 'panel_visual_config'
export const PANEL_DEFAULT_URL = '../assets/camion-red-inmobiliaria.jpg'
export const PANEL_STORAGE_PREFIX = 'https://wajkfydxutptcvvfwrvq.supabase.co/storage/v1/object/public/imagenes/panel-fondo/'

export const PANEL_VISUAL_DEFAULT = Object.freeze({
  version: PANEL_VISUAL_VERSION,
  background: Object.freeze({
    url: PANEL_DEFAULT_URL,
    opacity: 0.11,
  }),
})

const esObjetoPlano = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function esUrlPanelValida(url) {
  if (typeof url !== 'string' || /[\x00-\x1f"'<>]/.test(url)) return false
  return url === PANEL_DEFAULT_URL || url.startsWith(PANEL_STORAGE_PREFIX)
}

export function esPanelFondo(url) {
  return typeof url === 'string' && url.startsWith(PANEL_STORAGE_PREFIX)
}

export function normalizarOpacidad(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return PANEL_VISUAL_DEFAULT.background.opacity
  return Math.max(0.03, Math.min(0.30, number))
}

export function validarConfigVisual(stored) {
  if (!esObjetoPlano(stored) || stored.version !== PANEL_VISUAL_VERSION) {
    return crearConfigVisual()
  }

  const background = esObjetoPlano(stored.background) ? stored.background : {}
  return crearConfigVisual(
    esUrlPanelValida(background.url) ? background.url : PANEL_DEFAULT_URL,
    normalizarOpacidad(background.opacity),
  )
}

export function crearConfigVisual(
  url = PANEL_DEFAULT_URL,
  opacity = PANEL_VISUAL_DEFAULT.background.opacity,
) {
  return {
    version: PANEL_VISUAL_VERSION,
    background: {
      url: esUrlPanelValida(url) ? url : PANEL_DEFAULT_URL,
      opacity: normalizarOpacidad(opacity),
    },
  }
}

export async function leerConfigVisual(supabase) {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', PANEL_CONFIG_KEY)
      .maybeSingle()

    if (error || !data?.value) return crearConfigVisual()
    return validarConfigVisual(JSON.parse(data.value))
  } catch {
    return crearConfigVisual()
  }
}

export function aplicarConfigVisual(config) {
  try {
    const validated = validarConfigVisual(config)
    const element = document.querySelector('.sp-bg-brand')
    if (!element) return
    element.style.backgroundImage = `url("${validated.background.url}")`
    element.style.opacity = String(validated.background.opacity)
  } catch {
    // El CSS local conserva el fondo predeterminado ante cualquier fallo.
  }
}
