/*
 * COLOR-GOVERNANZA-CANONICA-01
 * Fuente única de color de identidad de canal.
 *
 * Gobernanza aprobada:
 * docs/propuestas/paleta-canales-100-propuesta.md
 *
 * Modelo correcto:
 * canal.codigo → canales.color_index → PALETA_CANALES[color_index]
 *
 * No usar esta paleta para QR / Link / Directo ni otros conceptos semánticos.
 */
(function () {
  const PALETA_CANALES = [
    '#3a4eb8','#2c3e9c','#4556a8','#1e5fa0','#2a6db5','#1f4ed8','#2e5cb8',
    '#7b3fb0','#6b3fa0','#8a5fc4',
    '#a86fb5','#b87fc0','#c040a0','#a82c8f','#d20c5c','#e0186b',
    '#d65d7a','#c94869','#ff6b5b','#e85a4f',
    '#dc143c','#e63946','#7a1f2e','#8b2236','#9c2740',
    '#5d2e5d','#6b3470','#c0603e','#a8512f','#b87333',
    '#c8843e','#8c7853','#a0825d','#c08a2e','#cc9333',
    '#a0c850','#bcd96e','#2a9d7a','#1f8473','#3aa68a',
    '#3eb489','#4fca9e','#1a7a7a','#0d6b6b','#1d7a8c','#0f6e80',
    '#a89878','#8a7d72','#6b7a2c','#7a8a3e',
    '#4a5568','#607080','#364152','#5d6571',
    '#3a7d6e','#4ba89a','#658e67','#2e6b5e',
    '#40e0d0','#26b8a8','#5ed4c4',
    '#7fb3d5','#9ec5de','#5e9ec5',
    '#2774ae','#1d5a8a','#3a8fce',
    '#8e9bff','#6f7fe8','#a3b0ff',
    '#8b5cf6','#7c3aed','#a78bfa',
    '#9bc534','#b6d44e','#84a728',
    '#c8d96f','#aab546','#d8e58a',
    '#6b4226','#8b4513','#5d3818',
    '#6b2c2c','#8b3a3a','#4d2020',
    '#ba2b2b','#c81e3c','#a02222',
    '#ea553b','#f06842','#d44528',
    '#b3a369','#9c8c5a','#c8b885',
    '#ff7e5f','#feb47b','#ff6b6b',
    '#a47864','#8b6552','#b88a76'
  ]

  const COLOR_VIA_QR = '#50c878'
  const COLOR_VIA_LINK = '#6495ed'
  const COLOR_VIA_DIRECTO = '#8a8a82'
  const COLOR_NEUTRO = '#8a8a82'

  function colorCssSeguro(color, fallback = COLOR_NEUTRO) {
    return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color) : fallback
  }

  function colorCanalDesdeIndex(colorIndex, fallback = COLOR_NEUTRO) {
    const n = Number(colorIndex)
    return Number.isInteger(n) && n >= 0 && n < PALETA_CANALES.length
      ? PALETA_CANALES[n]
      : fallback
  }

  function colorVia(canalVia, directo = false) {
    if (directo) return COLOR_VIA_DIRECTO
    const via = String(canalVia || '').trim().toLowerCase()
    if (via === 'qr') return COLOR_VIA_QR
    if (via === 'link') return COLOR_VIA_LINK
    if (via === 'directo' || via === 'directa') return COLOR_VIA_DIRECTO
    return COLOR_NEUTRO
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '')
    if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(255,255,255,${alpha})`
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  window.SPCanalColors = Object.freeze({
    PALETA_CANALES,
    COLOR_VIA_QR,
    COLOR_VIA_LINK,
    COLOR_VIA_DIRECTO,
    COLOR_NEUTRO,
    colorCssSeguro,
    colorCanalDesdeIndex,
    colorVia,
    hexToRgba
  })
})()
