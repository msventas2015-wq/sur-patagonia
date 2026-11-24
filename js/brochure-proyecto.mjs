import {LOT_PLAN_KEY,lotPlanKeyEntries} from './miniweb-design.mjs?v=20261117-cierre-venta1'

// Generador v4.3 recuperado: una implementación para página y vista previa.
// Los llamadores suministran su inventario público y su referencia existente.
export function createBrochureGenerator(getContext) {
  const pending = new Map()
  return function generate(request) {
    if (request !== undefined && (!request || typeof request.lotId !== 'string' || !request.lotId)) return Promise.resolve(false)
    const key = request?.lotId ?? null
    if (pending.has(key)) return pending.get(key)
    const active = Promise.resolve().then(async () => {
      const context = getContext()
      const btn = request ? null : context.button
      const content = btn ? [...btn.childNodes] : []
      if (btn) { btn.classList.add('loading'); btn.disabled = true; btn.textContent = 'Generando...' }
      try { return await renderBrochure(context, request) }
      finally {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; btn.replaceChildren(...content) }
      }
    }).catch(error => {
      console.error('Brochure error:', error)
      alert('Error al generar el PDF. Intentá de nuevo.')
      return false
    }).finally(() => pending.delete(key))
    pending.set(key, active)
    return active
  }
}

async function renderBrochure({project, config, lots:sourceLots, gallery = [], reference = '',
  fallbackPhone = '5492944791799', fallbackEmail = 'contacto@surpatagonian.com'}, request) {
  if (!Array.isArray(sourceLots)) {
    alert('No se pudo verificar la disponibilidad de los lotes. Volvé a cargar la página para descargar el brochure.')
    return false
  }
  try {
    await ensureBrochureV43Deps()
    const { jsPDF } = window.jspdf
    const g = brochureDoc(jsPDF)
    const { doc, W, H, M } = g
    const p = project || {}
    // Terrazas: el PDF usa el mismo número comercial y el mismo orden que la web.
    const { rotularLotesTerrazas } = await import('/js/ficha-lote-recorrido.mjs')
    const lotes = rotularLotesTerrazas(p.slug, sourceLots)
    const numeroComercial = l => Number(String(l.numero || '').match(/Lote\s+(\d+)/)?.[1])
    const disponibles = lotes.filter(l => l.estado === 'disponible')
    if (lotes !== sourceLots) disponibles.sort((a, b) => (numeroComercial(a) || 0) - (numeroComercial(b) || 0))
    const selected = request && disponibles.find(lot => String(lot.id) === request.lotId)
    if (request && !selected) throw Error('El lote seleccionado no está disponible')
    const totalDeclarado = Number(p.cantidad_lotes) || lotes.length
    let projectServices = p.servicios
    if (!request) {
      const theme = typeof p.tema === 'string' && p.tema.trimStart().startsWith('{') ? JSON.parse(p.tema) : p.tema
      const serviceBlock = (config || theme?.miniweb)?.bloques?.find(b => b.tipo === 'servicios' && b.activo !== false)
      if (serviceBlock) {
        const {developmentServices} = await import('./miniweb-blocks.mjs?v=20261117-cierre-venta1')
        projectServices = developmentServices(serviceBlock, p)
      }
    }
    const servicios = request ? request.services : (Array.isArray(projectServices) ? projectServices : [])
      .filter(Boolean)
      .map(k => BROCHURE_SERVICE_LABELS[k] || brochureHumanLabel(k))
    const { PUBLIC_BASE_URL, PUBLIC_HOST } = await import('/js/config.js?v=20261118-miniweb')
    // S6 cambia solo esta línea cuando exista el QR con canal.
    const codigo = reference
    const publicUrl = `${PUBLIC_BASE_URL}/${encodeURIComponent(p.slug || '')}`
      + (codigo ? `?canal=${encodeURIComponent(codigo)}&via=qr` : '')
    const logo = await brochureLogo()

    doc.setProperties({
      title: `${p.nombre || 'Proyecto'} · ${request?.label || 'Brochure digital'}`,
      subject: 'Brochure público de proyecto',
      author: 'Sur Patagonian · Red Inmobiliaria',
      creator: 'Sur Patagonian',
    })

    // ── Portada e información del proyecto ───────────────────────────
    let y = brochureHeader(g, logo, 68, 14)
    g.filete(y, true); y += 13

    g.titulo(25); g.tinta()
    const nombreLines = doc.splitTextToSize(p.nombre || 'Proyecto', W - 2*M)
    doc.text(nombreLines, W/2, y, { align:'center', lineHeightFactor:1.03 })
    y += nombreLines.length * 7.8 + 3

    const loc = [p.ciudad, (p.provincia || '').replace(/_/g,' ')].filter(Boolean).join(' · ')
    if (loc) {
      doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(6.2, true)
      g.tracked(loc.toUpperCase(), W/2, y, 1.25, 'center'); y += 8
    }

    if (p.foto_portada) {
      try {
        const hero = await loadImageCover(p.foto_portada, W - 2*M, 74, 200)
        doc.addImage(hero, 'JPEG', M, y, W - 2*M, 74, '', 'FAST')
        y += 84
      } catch (e) {
        console.warn('Brochure: no se pudo cargar la foto de portada', e)
      }
    }

    if (p.descripcion) {
      y = brochureEnsure(g, logo, y, 18)
      g.rotulo('EL LOTEO', M, y); y += 7
      doc.setTextColor(...BROCHURE_V43.TEXTO); g.sans(8.2)
      y = brochureParagraph(g, logo, p.descripcion, y, 'EL LOTEO') + 8
    }

    const areas = lotes.map(lote => Number(lote.superficie_m2)).filter(area => Number.isFinite(area) && area > 0)
    const extremos = areas.length ? [Math.min(...areas), Math.max(...areas)] : [p.sup_min_m2, p.sup_max_m2]
    const cifras = extremos.map(Number).filter(area => Number.isFinite(area) && area > 0)
    const rango = cifras.length ? [...new Set(cifras)].map(area => area.toLocaleString('es-AR')).join(' a ') + ' m²' : '—'
    y = brochureEnsure(g, logo, y, 31)
    g.filete(y, true); y += 9
    brochureMetric(g, M, y, rango, 'SUPERFICIES')
    brochureMetric(g, W/2 + 4, y, `${disponibles.length} de ${totalDeclarado}`, 'LOTES DISPONIBLES')
    y += 22

    if (servicios.length) {
      y = brochureEnsure(g, logo, y, 18)
      g.rotulo('SERVICIOS', M, y); y += 7
      doc.setTextColor(...BROCHURE_V43.TEXTO); g.sans(8.2)
      y = brochureParagraph(g, logo, servicios.join('   ·   '), y, 'SERVICIOS') + 8
    }

    if (String(p.financiacion || '').trim()) {
      y = brochureEnsure(g, logo, y, 18)
      g.rotulo('FINANCIACIÓN', M, y); y += 7
      doc.setTextColor(...BROCHURE_V43.TEXTO); g.sans(8.2)
      brochureParagraph(g, logo, p.financiacion, y, 'FINANCIACIÓN')
    }

    if (selected) {
      doc.addPage()
      y = brochureHeader(g, logo, 44, 13)
      g.filete(y, true); y += 13
      g.rotulo('LOTE SELECCIONADO', M, y); y += 11
      g.titulo(21); g.tinta()
      const titleLines = doc.splitTextToSize(request.label, W - 2*M)
      doc.text(titleLines, M, y); y += 9 * titleLines.length + 4
      const {lotFacts} = await import('./lote-precio.mjs')
      const facts = new Map(lotFacts(selected))
      brochureMetric(g, M, y, facts.get('Superficie'), 'SUPERFICIE')
      brochureMetric(g, W/2 + 4, y, facts.get('Precio'), 'PRECIO')
      y += 19
      brochureMetric(g, M, y, 'Disponible', 'ESTADO')
      brochureMetric(g, W/2 + 4, y, facts.get('USD / m²'), 'USD / M²')
      y += 20
      await brochureLotPlan(g, request.plan, selected.id, y)
    } else {
      // ── Todos y solo los lotes disponibles, sin precio ───────────────
      doc.addPage()
      y = brochureHeader(g, logo, 44, 13)
      g.filete(y, true); y += 12
      g.titulo(20); g.tinta(); doc.text('Lotes disponibles', M, y); y += 8
      doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(7.2)
      doc.text(`${disponibles.length} ${disponibles.length === 1 ? 'disponible' : 'disponibles'} de ${totalDeclarado}`, M, y); y += 10
      y = brochureLotsHeader(g, y)

      if (!disponibles.length) {
        doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(8)
        doc.text('No hay lotes disponibles cargados en este momento.', M, y + 5)
      } else {
        disponibles.forEach((l, i) => {
          if (y + 9 > g.bottom) {
            doc.addPage()
            y = brochureHeader(g, logo, 44, 13)
            g.filete(y, true); y += 10
            g.rotulo('LOTES DISPONIBLES · CONTINUACIÓN', M, y); y += 8
            y = brochureLotsHeader(g, y)
          }
          if (i % 2 === 0) {
            doc.setFillColor(247, 246, 243)
            doc.rect(M, y - 1.5, W - 2*M, 8.5, 'F')
          }
          g.tinta(); g.sans(8.4, true)
          doc.text(String(l.numero ?? '—'), M + 3, y + 4)
          g.sans(8)
          doc.text(brochureM2(l.superficie_m2) || '—', W - M - 3, y + 4, { align:'right' })
          y += 8.5
        })
        g.filete(y, true)
      }
    }

    // ── Galería, contacto, QR público y cierre legal ─────────────────
    doc.addPage()
    y = brochureHeader(g, logo, 44, 13)
    g.filete(y, true); y += 11

    const fotos = (Array.isArray(gallery) ? gallery : [])
      .filter(Boolean)
      .filter((url, i, arr) => arr.indexOf(url) === i && url !== p.foto_portada)
      .slice(0, 4)
    if (fotos.length) {
      g.rotulo('GALERÍA', M, y); y += 7
      const gap = 4, fw = (W - 2*M - gap) / 2, fh = 45
      for (let i = 0; i < fotos.length; i++) {
        const x = M + (i % 2) * (fw + gap)
        const iy = y + Math.floor(i / 2) * (fh + gap)
        try {
          const foto = await loadImageCover(fotos[i], fw, fh, 180)
          doc.addImage(foto, 'JPEG', x, iy, fw, fh, '', 'FAST')
        } catch (e) {
          console.warn(`Brochure: no se pudo cargar la foto ${i + 1}`, e)
        }
      }
      y += Math.ceil(fotos.length / 2) * (fh + gap) + 4
    }

    const contactoNombre = String(p.contacto_nombre || 'Sur Patagonian').trim()
    const contactoWsp = String(p.contacto_whatsapp || fallbackPhone).trim()
    const contactoEmail = String(p.contacto_email || fallbackEmail).trim()
    const qrSize = 24, qrX = W - M - qrSize
    const contactoAncho = qrX - M - 12
    g.titulo(14)
    const nombreContactoLines = doc.splitTextToSize(contactoNombre, contactoAncho)
    g.sans(8.2)
    const emailLines = doc.splitTextToSize(contactoEmail, contactoAncho)
    const cierreAlto = 8 + Math.max(nombreContactoLines.length * 6 + 7.5 + emailLines.length * 4.2, qrSize + 7) + 15
    if (y + cierreAlto > H - 55) {
      doc.addPage()
      y = brochureHeader(g, logo, 44, 13)
      g.filete(y, true); y += 11
    }

    g.rotulo('CONTACTO', M, y); y += 8
    const qrY = y - 2
    g.titulo(14); g.tinta()
    doc.text(nombreContactoLines, M, y, { lineHeightFactor:1.05 })
    y += nombreContactoLines.length * 6 + 2
    doc.setTextColor(...BROCHURE_V43.TEXTO); g.sans(8.2)
    doc.text(brochurePhone(contactoWsp), M, y); y += 5.5
    doc.text(emailLines, M, y, { lineHeightFactor:1.15 })
    y += emailLines.length * 4.2

    const qr = await brochureLocalQR(publicUrl)
    doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize)
    doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.4, true)
    g.tracked('VER PROYECTO', qrX + qrSize/2, qrY + qrSize + 5, 0.7, 'center')
    doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.8)
    const urlY = Math.max(y + 7, qrY + qrSize + 9)
    const urlLines = doc.splitTextToSize(publicUrl.replace(/^https?:\/\//, ''), W - 2*M)
    doc.text(urlLines, M, urlY, { lineHeightFactor:1.15 })

    brochureLegal(g)
    brochureFooter(g, PUBLIC_HOST)

    const filenameParts = [p.nombre || p.slug || 'proyecto', request?.label, 'brochure'].filter(Boolean)
    const fname = filenameParts.map(brochureSlug).join('-') + '.pdf'
    doc.save(fname)

    return true
  } catch (error) {
    console.error('Brochure error:', error)
    alert('Error al generar el PDF. Intentá de nuevo.')
    return false
  }
}

const BROCHURE_V43 = {
  W: 210, H: 297, M: 20,
  TINTA:  [26, 26, 26],
  GRIS:   [94, 90, 85],
  LIN:    [206, 202, 195],
  TEXTO:  [42, 40, 37],
  DORADO: [176, 142, 60],
  LOGO:   '/assets/logos/logo-vertical-negro.png',
  LEGAL_NOMBRE: 'Mariana Ayelén García · Martillera y Corredora Pública',
  LEGAL_MAT:    'Mat. 271-RP-18 · F°350 T°II · El Bolsón, Río Negro, Argentina',
  LEGAL_NOTA:   'Documento informativo. Los precios y condiciones pueden variar sin previo aviso; la operación se perfecciona por escrito.',
}

const BROCHURE_SERVICE_LABELS = {
  agua_corriente: 'Agua corriente',
  luz_electrica: 'Luz eléctrica',
  gas_natural: 'Gas natural',
  cloaca: 'Red cloacal',
  wifi: 'Wi-Fi / fibra óptica',
  porteria: 'Portería 24hs',
  senderos: 'Senderos peatonales',
  muelle: 'Muelle / acceso al agua',
  cancha: 'Cancha deportiva',
  piscina: 'Piscina',
  agua: 'Agua potable',
  luz: 'Electricidad',
  gas: 'Gas natural',
  cloacas: 'Cloacas',
  internet: 'Internet / Fibra',
  seguridad: 'Seguridad 24hs',
  acceso_pavimentado: 'Acceso pavimentado',
  laguna: 'Laguna artificial',
  quincho: 'Quincho / SUM',
  bosque: 'Reserva de bosque',
  vista_lago: 'Vista al lago',
}

let _brochureLogoCache = null

const brochureDependencyLoads = new Map()
function brochureLoadScript(src, ready) {
  if (ready()) return Promise.resolve()
  const href = new URL(src, location.href).href
  if (brochureDependencyLoads.has(href)) return brochureDependencyLoads.get(href)
  const existing = Array.from(document.scripts).find(script => script.src === href)
  const script = existing || document.createElement('script')
  const job = new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed) }
    const loaded = () => { cleanup(); ready() ? resolve() : reject(new Error('La dependencia PDF no quedó disponible')) }
    const failed = () => { cleanup(); reject(new Error(`No se pudo cargar ${src}`)) }
    const timer = setTimeout(failed, 15000)
    script.addEventListener('load', loaded, {once:true})
    script.addEventListener('error', failed, {once:true})
    if (!existing) { script.src = src; document.head.appendChild(script) }
  }).catch(error => {
    brochureDependencyLoads.delete(href)
    script.remove()
    throw error
  })
  brochureDependencyLoads.set(href, job)
  return job
}

async function ensureBrochureV43Deps() {
  await Promise.all([
    brochureLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => !!window.jspdf?.jsPDF),
    brochureLoadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode),
    brochureLoadScript('/js/gpdf-fuentes.js', () => !!window.GPDF_FUENTES),
  ])
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Imagen HTTP ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function loadImageCover(url, targetWmm, targetHmm, dpi = 150) {
  const twPx = Math.round(targetWmm * dpi / 25.4)
  const thPx = Math.round(targetHmm * dpi / 25.4)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = twPx; canvas.height = thPx
      const ctx = canvas.getContext('2d')
      const scale = Math.max(twPx / img.width, thPx / img.height)
      const sw = twPx / scale, sh = thPx / scale
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, twPx, thPx)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = url
  })
}

function brochureLogoLimpio(base64) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const t = document.createElement('canvas')
      t.width = img.naturalWidth; t.height = img.naturalHeight
      const tx = t.getContext('2d'); tx.drawImage(img, 0, 0)
      let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0
      try {
        const data = tx.getImageData(0, 0, t.width, t.height).data
        for (let yy = 0; yy < t.height; yy++) for (let xx = 0; xx < t.width; xx++) {
          if (data[(yy * t.width + xx) * 4 + 3] > 16) {
            if (xx < x0) x0 = xx; if (xx > x1) x1 = xx
            if (yy < y0) y0 = yy; if (yy > y1) y1 = yy
          }
        }
      } catch (e) { x0 = 0; y0 = 0; x1 = t.width - 1; y1 = t.height - 1 }
      if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = t.width - 1; y1 = t.height - 1 }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1
      const scale = Math.min(1, 1000 / bw)
      const c = document.createElement('canvas')
      c.width = Math.round(bw * scale); c.height = Math.round(bh * scale)
      const cx = c.getContext('2d')
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height)
      cx.drawImage(img, x0, y0, bw, bh, 0, 0, c.width, c.height)
      resolve({ uri:c.toDataURL('image/jpeg', 0.92), ratio:c.height/c.width })
    }
    img.onerror = () => resolve(null)
    img.src = base64
  })
}

async function brochureLogo() {
  if (_brochureLogoCache) return _brochureLogoCache
  try {
    _brochureLogoCache = await brochureLogoLimpio(await fetchImageAsBase64(BROCHURE_V43.LOGO))
  } catch (e) { _brochureLogoCache = null }
  return _brochureLogoCache
}

function brochureDoc(jsPDF) {
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress:true })
  const F = window.GPDF_FUENTES
  if (F) {
    doc.addFileToVFS('Corm-SB.ttf', F.cormSB); doc.addFont('Corm-SB.ttf', 'Cormorant', 'bold')
    doc.addFileToVFS('Mont-R.ttf', F.montR); doc.addFont('Mont-R.ttf', 'Sans', 'normal')
    doc.addFileToVFS('Mont-SB.ttf', F.montSB); doc.addFont('Mont-SB.ttf', 'Sans', 'bold')
  }
  const tieneFuentes = !!F
  const g = {
    doc,
    ...BROCHURE_V43,
    bottom: BROCHURE_V43.H - 28,
    titulo: size => { doc.setFont(tieneFuentes ? 'Cormorant' : 'times', 'bold'); doc.setFontSize(size) },
    sans: (size, bold=false) => { doc.setFont(tieneFuentes ? 'Sans' : 'helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size) },
    tinta: () => doc.setTextColor(...BROCHURE_V43.TINTA),
    tracked: (text, anchor, y, spacing, align='left') => {
      doc.setCharSpace(0)
      const width = doc.getTextWidth(text) + spacing * Math.max(0, text.length - 1)
      const x = align === 'center' ? anchor - width/2 : align === 'right' ? anchor - width : anchor
      doc.setCharSpace(spacing); doc.text(text, x, y); doc.setCharSpace(0)
    },
    rotulo: (text, x, y, align='left') => {
      doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.8, true)
      g.tracked(text, x, y, 0.8, align)
    },
    filete: (y, strong=false) => {
      doc.setDrawColor(...(strong ? BROCHURE_V43.TINTA : BROCHURE_V43.LIN))
      doc.setLineWidth(strong ? 0.4 : 0.2)
      doc.line(BROCHURE_V43.M, y, BROCHURE_V43.W - BROCHURE_V43.M, y)
    },
  }
  return g
}

function brochureHeader(g, logo, width=44, top=13) {
  const { doc, W } = g
  if (logo) {
    doc.addImage(logo.uri, 'JPEG', W/2 - width/2, top, width, width * logo.ratio)
    return top + width * logo.ratio + 5
  }
  g.tinta(); g.sans(10, true); g.tracked('SUR PATAGONIAN', W/2, top + 8, 2.2, 'center')
  doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.8)
  g.tracked('RED INMOBILIARIA', W/2, top + 14, 1.8, 'center')
  return top + 19
}

function brochureEnsure(g, logo, y, needed) {
  if (y + needed <= g.bottom) return y
  g.doc.addPage()
  const next = brochureHeader(g, logo, 44, 13)
  g.filete(next, true)
  return next + 11
}

function brochureParagraph(g, logo, text, y, continuedLabel) {
  const { doc, W, M } = g
  const lines = doc.splitTextToSize(String(text).replace(/\s+/g, ' ').trim(), W - 2*M)
  const lineH = 4.5
  lines.forEach((line, i) => {
    if (y + lineH > g.bottom) {
      doc.addPage()
      y = brochureHeader(g, logo, 44, 13)
      g.filete(y, true); y += 11
      if (continuedLabel) { g.rotulo(`${continuedLabel} · CONTINUACIÓN`, M, y); y += 7 }
      doc.setTextColor(...BROCHURE_V43.TEXTO); g.sans(8.2)
    }
    doc.text(line, M, y)
    y += lineH
  })
  return y
}

function brochureMetric(g, x, y, value, label) {
  const { doc } = g
  g.tinta(); g.sans(12, true); doc.text(String(value), x, y)
  doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.5, true)
  g.tracked(label, x, y + 6, 0.8)
}

async function brochureLotPlan(g, plan, selectedId, y) {
  if (!plan) return
  const { doc, M, W } = g
  const shapes = plan.rows.filter(row => row.points || row.pin)
  if (!shapes.length && !plan.image) return
  const regionWidth = W - 2*M
  const regionHeight = Math.min(plan.stateRule ? 120 : 106, g.bottom - y - 19)
  let photo
  if (plan.image) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = plan.image
    try { await img.decode(); photo = img } catch (error) {
      if (!shapes.length) throw error
    }
  }
  const ratio = photo ? photo.naturalWidth / photo.naturalHeight : (plan.width / plan.height || 1)
  const points = shapes.flatMap(row => row.points || [row.pin])
  if (photo) points.push([0,0],[1,1])
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
  const scale = Math.min((regionWidth-5) / Math.max(.001,(right-left)*ratio), (regionHeight-5) / Math.max(.001,bottom-top))
  const dx = M + (regionWidth-(right-left)*ratio*scale)/2
  const dy = y + 6 + (regionHeight-(bottom-top)*scale)/2
  const project = ([x,v]) => [dx+(x-left)*ratio*scale, dy+(v-top)*scale]
  g.rotulo('PLANO DEL LOTEO', M, y)
  if (photo) {
    const canvas = document.createElement('canvas')
    const factor = Math.min(1, 1400 / Math.max(photo.naturalWidth,photo.naturalHeight))
    canvas.width = Math.max(1,Math.round(photo.naturalWidth*factor))
    canvas.height = Math.max(1,Math.round(photo.naturalHeight*factor))
    canvas.getContext('2d').drawImage(photo,0,0,canvas.width,canvas.height)
    doc.addImage(canvas.toDataURL('image/jpeg', .86),'JPEG',...project([0,0]),ratio*scale,scale)
  } else if (plan.stateRule) {
    doc.setFillColor(102,111,107)
    doc.rect(M,y+6,regionWidth,regionHeight,'F')
  }
  const colors = {disponible:[36,130,82], vendido:[169,56,46], reservado:[170,116,24]}
  const layer = row => row.id===selectedId ? 2 : plan.stateRule && row.unavailable ? 0 : 1
  // Transparency in the plan requires PDF 1.4 or later.
  if ((plan.stateRule || shapes.some(row=>row.id===selectedId)) && Number(doc.__private__.getPdfVersion())<1.4) doc.__private__.setPdfVersion('1.4')
  for (const row of [...shapes].sort((a,b) => layer(a)-layer(b))) {
    const chosen = row.id === selectedId
    let paint = row.points ? 'S' : 'FD'
    if (chosen || plan.stateRule) doc.saveGraphicsState()
    if (chosen) {
      doc.setGState(new doc.GState({opacity:row.points ? .46 : .64, 'stroke-opacity':.86}))
      doc.setFillColor(LOT_PLAN_KEY.seleccionado.color)
      if (photo) doc.setDrawColor(165,205,233)
      else doc.setDrawColor(64,113,151)
      doc.setLineWidth(.45)
      doc.setLineJoin('round')
      paint='FD'
    } else if (plan.stateRule) {
      const style=LOT_PLAN_KEY[row.lot.estado] || LOT_PLAN_KEY.sin
      doc.setDrawColor(255)
      doc.setFillColor(style.color)
      doc.setGState(new doc.GState({opacity:row.lot.estado==='vendido' ? .45 : .42, 'stroke-opacity':row.unavailable ? .7 : .9}))
      doc.setLineWidth(row.unavailable ? .10 : .17)
      doc.setLineJoin('round')
      paint=row.unavailable?'S':'FD'
    } else {
      const color = colors[row.lot.estado] || [45,45,45]
      doc.setDrawColor(...color); doc.setFillColor(...color); doc.setLineWidth(.32)
    }
    if (row.points) {
      const polygon = row.points.map(project)
      const deltas = polygon.slice(1).map(([x,v],i) => [x-polygon[i][0],v-polygon[i][1]])
      doc.lines(deltas,...polygon[0],[1,1],paint,true)
    } else doc.circle(...project(row.pin),chosen?1.8:.9,paint)
    if (chosen || plan.stateRule) doc.restoreGraphicsState()
  }
  const hasSelection=shapes.some(row => row.id === selectedId)
  if (plan.stateRule && shapes.length) {
    await brochureParcelLabels(g,shapes,project,ratio,scale)
    brochurePlanKey(g,lotPlanKeyEntries(shapes,hasSelection),y+regionHeight+12)
  } else if (hasSelection) {
    doc.setTextColor(52,79,99); g.sans(7.4,true)
    doc.text('Lote seleccionado en azul',M,y+regionHeight+12)
  }
}

async function brochureParcelLabels(g,rows,project,ratio,scale) {
  const {selectorLotLabel}=await import('./miniweb-selector.mjs?v=20261117-cierre-venta1')
  const {doc}=g
  const worldHeight=843/ratio, pixelsPerMm=8, pointsPerMm=doc.internal.scaleFactor
  const viewport={worldHeight,view:[0,0,843,worldHeight],width:ratio*scale*pixelsPerMm,height:scale*pixelsPerMm}
  const area=new Intl.NumberFormat('es-AR',{maximumFractionDigits:1})
  doc.setTextColor(255)
  for(const row of rows) {
    if(!row.points || row.unavailable)continue
    const {estado,superficie_m2}=row.lot
    if(estado!=='disponible' || !(Number(superficie_m2)>0))continue
    const caption=area.format(superficie_m2)+' m²'
    let label
    for(const size of [3.3,3]) {
      g.sans(size)
      const textWidth=doc.getTextWidth(caption)
      // Incluir 0,35 mm libres de cada lado de la tinta, también al rotar.
      const captionBox={width:(textWidth+.70)*pixelsPerMm,height:(size/pointsPerMm+.70)*pixelsPerMm}
      const layout=selectorLotLabel(row,{...viewport,caption,captionSize:size*pixelsPerMm/pointsPerMm,captionBox})
      if(!layout)continue
      if(!label || !layout.angle)label={layout,size,textWidth}
      if(!layout.angle)break
    }
    if(!label)continue
    const {layout,size,textWidth}=label
    g.sans(size)
    const [cx,cy]=project([layout.x/843,layout.y/worldHeight])
    const radians=layout.angle*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians)
    // Posicionar el inicio de la línea en el eje de la parcela antes de rotar el texto.
    const halfWidth=textWidth/2, baseline=.35*size/pointsPerMm
    doc.text(caption,cx-halfWidth*cos-baseline*sin,cy-halfWidth*sin+baseline*cos,{angle:-layout.angle})
  }
}

function brochurePlanKey(g, entries, y) {
  const {doc,W,M}=g
  g.sans(8)
  const entriesWidth=entries.reduce((sum,[,{label}])=>sum+5+doc.getTextWidth(label),0)
  const gap=Math.min(9,(W-2*M-entriesWidth)/(entries.length-1))
  let x=(W-entriesWidth-gap*(entries.length-1))/2
  for (const [key,{label,color}] of entries) {
    if (key==='no_a_la_venta') {
      // A dark backing keeps the hollow white symbol legible on paper.
      doc.setFillColor(64,74,70);doc.roundedRect(x-.5,y-3.2,3.8,3.8,.5,.5,'F')
      doc.setDrawColor(color);doc.setLineWidth(.16);doc.rect(x+.35,y-2.35,2.1,2.1,'S')
    } else {
      doc.setFillColor(color);doc.roundedRect(x,y-2.7,2.8,2.8,.35,.35,'F')
    }
    g.tinta();doc.text(label,x+5,y)
    x+=5+doc.getTextWidth(label)+gap
  }
}

function brochureLotsHeader(g, y) {
  const { doc, W, M } = g
  doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.8, true)
  g.tracked('LOTE', M + 3, y, 0.8)
  g.tracked('SUPERFICIE', W - M - 3, y, 0.8, 'right')
  y += 3; g.filete(y, true)
  return y + 3
}

function brochureLegal(g) {
  const { doc, W, H, M } = g
  const y = H - 48
  doc.setDrawColor(...BROCHURE_V43.TINTA); doc.setLineWidth(0.4); doc.line(M, y, W-M, y)
  g.tinta(); g.sans(6.6, true)
  doc.text(BROCHURE_V43.LEGAL_NOMBRE, W/2, y + 7, { align:'center' })
  doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(6)
  doc.text(BROCHURE_V43.LEGAL_MAT, W/2, y + 12, { align:'center' })
  g.sans(5.4)
  doc.text(BROCHURE_V43.LEGAL_NOTA, W/2, y + 17, { align:'center' })
}

function brochureFooter(g, host) {
  const { doc, W, H, M } = g
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page++) {
    doc.setPage(page)
    doc.setDrawColor(...BROCHURE_V43.LIN); doc.setLineWidth(0.2); doc.line(M, H-20, W-M, H-20)
    doc.setTextColor(...BROCHURE_V43.GRIS); g.sans(5.8)
    doc.text('SUR PATAGONIAN · RED INMOBILIARIA', M, H-14)
    doc.text(`${host} · ${String(page).padStart(2,'0')} / ${String(total).padStart(2,'0')}`, W-M, H-14, { align:'right' })
  }
}

function brochureLocalQR(data) {
  return new Promise((resolve, reject) => {
    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:180px;height:180px;background:#fff;padding:8px'
    document.body.appendChild(holder)
    try {
      new QRCode(holder, { text:data, width:180, height:180, colorDark:'#000000', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M })
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const canvas = holder.querySelector('canvas')
        const img = holder.querySelector('img')
        const finish = value => { holder.remove(); value ? resolve(value) : reject(new Error('El QR local no generó imagen')) }
        if (canvas) finish(canvas.toDataURL('image/png'))
        else if (img?.complete) finish(img.src)
        else if (img) { img.onload = () => finish(img.src); img.onerror = () => finish(null) }
        else finish(null)
      }))
    } catch (e) { holder.remove(); reject(e) }
  })
}

function brochureM2(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('es-AR')} m²` : ''
}

function brochureHumanLabel(value) {
  const text = String(value || '').replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

function brochurePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('549')) {
    return `+54 9 ${digits.slice(3,7)} ${digits.slice(7)}`
  }
  return String(value || '—')
}

function brochureSlug(value) {
  return String(value || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
