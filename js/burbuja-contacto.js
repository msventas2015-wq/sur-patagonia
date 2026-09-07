// ═══════════════════════════════════════════════════════════════════════════
// BURBUJA DE CONTACTO — Sur Patagonian
// Acceso rápido al formulario propio desde cualquier punto de la página.
// Un solo archivo para todas las páginas públicas: inyecta CSS + botón + panel.
// El envío usa EXACTAMENTE el mismo insert en `contactos` que el formulario del
// pie (nombre, email, telefono, mensaje, canal_ref, canal_via, fecha), así el
// mensaje entra con el canal del QR/link vigente. No registra visitas.
// Uso: <script type="module" src="js/burbuja-contacto.js"></script> antes de </body>.
// ═══════════════════════════════════════════════════════════════════════════
import { supabase, getRef, getRefVia } from './config.js'

if (!window.__SP_BURBUJA__) {
  window.__SP_BURBUJA__ = true

  const CSS = `
  .bc-btn { position: fixed; right: 1.25rem; bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)); z-index: 950;
    display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; height: 56px; padding: 0 1.6rem 0 1.3rem; border-radius: 100px;
    background: var(--gold, #c9a84c); color: var(--bg, #080808); border: none; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    font-family: 'Montserrat', sans-serif; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap;
    transition: background 0.2s, transform 0.3s, opacity 0.3s; }
  .bc-btn:hover { background: var(--gold-light, #e8c97a); transform: translateY(-2px); }
  .bc-btn svg { width: 22px; height: 22px; flex: none; }
  .bc-btn.bc-oculta { opacity: 0; pointer-events: none; transform: translateY(12px); }
  .bc-fondo { position: fixed; inset: 0; z-index: 960; background: rgba(8,8,8,0.72); opacity: 0; pointer-events: none; transition: opacity 0.3s; }
  .bc-panel { position: fixed; z-index: 970; left: 0; right: 0; bottom: 0; max-height: calc(100dvh - 4rem); overflow-y: auto; background: var(--surface, #111111); border-top: 1px solid var(--stroke, #2a2a2e);
    padding: 1.6rem 1.5rem calc(1.6rem + env(safe-area-inset-bottom, 0px)); transform: translateY(105%); transition: transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94); color: var(--text, #f0ede8); font-family: 'Montserrat', sans-serif; }
  body.bc-abierto .bc-fondo { opacity: 1; pointer-events: all; }
  body.bc-abierto .bc-panel { transform: translateY(0); }
  body.bc-abierto { overflow: hidden; }
  .bc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.4rem; }
  .bc-eyebrow { display: flex; align-items: center; gap: 1rem; font-size: 0.65rem; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: var(--gold, #c9a84c); margin-bottom: 0.7rem; }
  .bc-eyebrow::before { content: ''; display: block; width: 30px; height: 1px; background: var(--gold, #c9a84c); }
  .bc-titulo { font-family: 'Montserrat', sans-serif; font-size: 1.55rem; font-weight: 200; line-height: 1.1; letter-spacing: -0.02em; color: var(--text, #f0ede8); margin: 0; }
  .bc-titulo em { font-style: normal; font-weight: 300; color: var(--gold, #c9a84c); }
  .bc-cerrar { background: none; border: none; color: var(--text, #f0ede8); font-size: 1.3rem; line-height: 1; padding: 0.4rem; margin: -0.4rem -0.4rem 0 0; cursor: pointer; opacity: 0.7; }
  .bc-cerrar:hover { opacity: 1; }
  .bc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 0.8rem; }
  .bc-row.bc-full { grid-template-columns: 1fr; }
  .bc-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .bc-group label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text, #f0ede8); }
  .bc-group input, .bc-group textarea { background: rgba(255,255,255,0.03); border: 1px solid var(--stroke, #2a2a2e); color: var(--text, #f0ede8); padding: 0.8rem 1rem; font-family: 'Montserrat', sans-serif; font-size: 16px; font-weight: 300; outline: none; transition: border-color 0.2s; resize: vertical; width: 100%; box-sizing: border-box; border-radius: 0; -webkit-appearance: none; }
  .bc-group input:focus, .bc-group textarea:focus { border-color: var(--gold, #c9a84c); }
  .bc-submit { width: 100%; margin-top: 0.4rem; background: var(--gold, #c9a84c); color: var(--bg, #080808); padding: 0.95rem; font-family: 'Montserrat', sans-serif; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.3s; }
  .bc-submit:hover { background: var(--gold-light, #e8c97a); }
  .bc-submit:disabled { opacity: 0.7; cursor: default; }
  .bc-nota { font-size: 0.72rem; color: var(--muted, #777); margin: 0.9rem 0 0; line-height: 1.6; }
  .bc-alerta { padding: 0.8rem 1rem; margin-bottom: 0.9rem; font-size: 0.8rem; }
  .bc-alerta-ok { background: rgba(39,174,96,0.08); border-left: 3px solid #27ae60; color: #27ae60; }
  .bc-alerta-err { background: rgba(192,57,43,0.08); border-left: 3px solid #c0392b; color: #c0392b; }
  @media (min-width: 900px) {
    .bc-panel { left: auto; right: 1.25rem; bottom: calc(1.25rem + 56px + 0.9rem); width: 420px; max-height: calc(100vh - 8rem); border: 1px solid var(--stroke, #2a2a2e); padding: 1.8rem 1.8rem 1.6rem; transform: translateY(16px); opacity: 0; pointer-events: none; transition: transform 0.3s, opacity 0.3s; }
    body.bc-abierto .bc-panel { transform: translateY(0); opacity: 1; pointer-events: all; }
    .bc-fondo { background: rgba(8,8,8,0.35); }
  }
  @media (max-width: 899px) { .bc-row { grid-template-columns: 1fr; } }
  `

  const HTML = `
  <button class="bc-btn" id="bcBtn" type="button" aria-label="Enviar mensaje" aria-expanded="false" aria-controls="bcPanel">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v14H3z"/><path d="M3 7l9 6 9-6"/></svg>
    <span>Escribinos</span>
  </button>
  <div class="bc-fondo" id="bcFondo"></div>
  <div class="bc-panel" id="bcPanel" role="dialog" aria-modal="true" aria-labelledby="bcTitulo">
    <div class="bc-head">
      <div>
        <div class="bc-eyebrow">Escribinos</div>
        <h3 class="bc-titulo" id="bcTitulo">Estamos <em>para ayudarte</em></h3>
      </div>
      <button class="bc-cerrar" id="bcCerrar" type="button" aria-label="Cerrar">✕</button>
    </div>
    <div id="bcAlerta"></div>
    <form id="bcForm" novalidate="false">
      <div class="bc-row">
        <div class="bc-group"><label for="bcNombre">Nombre</label><input type="text" id="bcNombre" placeholder="Tu nombre" required autocomplete="name" /></div>
        <div class="bc-group"><label for="bcEmail">Email</label><input type="email" id="bcEmail" placeholder="tu@email.com" required autocomplete="email" /></div>
      </div>
      <div class="bc-row bc-full">
        <div class="bc-group"><label for="bcTelefono">Teléfono</label><input type="tel" id="bcTelefono" placeholder="+54 9 ..." autocomplete="tel" /></div>
      </div>
      <div class="bc-row bc-full">
        <div class="bc-group"><label for="bcMensaje">Mensaje</label><textarea id="bcMensaje" rows="4" placeholder="¿En qué te podemos ayudar?" required></textarea></div>
      </div>
      <button type="submit" class="bc-submit">Enviar mensaje</button>
    </form>
    <p class="bc-nota">Te respondemos a la brevedad. También podés escribirnos a contacto@surpatagonian.com</p>
  </div>`

  const style = document.createElement('style')
  style.id = 'bcStyle'
  style.textContent = CSS
  document.head.appendChild(style)
  const host = document.createElement('div')
  host.id = 'bcHost'
  host.innerHTML = HTML
  document.body.appendChild(host)

  const btn = document.getElementById('bcBtn')
  const fondo = document.getElementById('bcFondo')
  const cerrar = document.getElementById('bcCerrar')
  const form = document.getElementById('bcForm')
  const alerta = document.getElementById('bcAlerta')

  const abrir = () => {
    document.body.classList.add('bc-abierto')
    btn.setAttribute('aria-expanded', 'true')
    setTimeout(() => { const n = document.getElementById('bcNombre'); if (n) n.focus({ preventScroll: true }) }, 350)
  }
  const cerrarPanel = () => {
    if (!document.body.classList.contains('bc-abierto')) return
    document.body.classList.remove('bc-abierto')
    btn.setAttribute('aria-expanded', 'false')
    btn.focus({ preventScroll: true })
  }
  btn.addEventListener('click', () => document.body.classList.contains('bc-abierto') ? cerrarPanel() : abrir())
  fondo.addEventListener('click', cerrarPanel)
  cerrar.addEventListener('click', cerrarPanel)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarPanel() })

  // Se esconde cuando el formulario de contacto de la página está a la vista (ahí ya no hace falta)
  const contacto = document.getElementById('contacto') || document.getElementById('contacto-nuevo')
  if (contacto && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => entries.forEach(en => btn.classList.toggle('bc-oculta', en.isIntersecting)), { threshold: 0.15 }).observe(contacto)
  }

  // Cursor personalizado del sitio (si la página lo tiene)
  const cur = document.getElementById('cursor') || document.getElementById('cur')
  if (cur) {
    ;[btn, cerrar, form.querySelector('.bc-submit')].forEach(el => {
      el.addEventListener('mouseenter', () => cur.classList.add('big'))
      el.addEventListener('mouseleave', () => cur.classList.remove('big'))
    })
  }

  // Contexto: en propiedad.html?id=... el mensaje queda ligado a la propiedad (columna existente en `contactos`)
  const esPropiedad = /(^|\/)propiedad\.html$/i.test(location.pathname)
  const propiedadId = esPropiedad ? (new URLSearchParams(location.search).get('id') || null) : null

  form.addEventListener('submit', async function (e) {
    e.preventDefault()
    const submit = this.querySelector('.bc-submit')
    submit.textContent = 'Enviando...'
    submit.disabled = true
    try {
      const fila = {
        nombre: document.getElementById('bcNombre').value.trim(),
        email: document.getElementById('bcEmail').value.trim(),
        telefono: document.getElementById('bcTelefono').value.trim(),
        mensaje: document.getElementById('bcMensaje').value.trim(),
        canal_ref: getRef(),
        canal_via: getRefVia(),
        fecha: new Date().toISOString()
      }
      if (propiedadId) fila.propiedad_id = propiedadId
      const { error } = await supabase.from('contactos').insert([fila])
      if (error) throw error
      alerta.innerHTML = '<div class="bc-alerta bc-alerta-ok">¡Mensaje enviado! Te respondemos a la brevedad.</div>'
      this.reset()
    } catch (err) {
      console.warn('[burbuja contacto] error insert contactos', err)
      alerta.innerHTML = '<div class="bc-alerta bc-alerta-err">Error al enviar. Escribinos a contacto@surpatagonian.com</div>'
    } finally {
      submit.textContent = 'Enviar mensaje'
      submit.disabled = false
    }
  })
}
