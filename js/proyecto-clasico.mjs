export function montarProyectoClasico(cargando) {
  cargando.insertAdjacentHTML('afterend', `
<div id="bgTextura"></div>
<!-- LIGHTBOX -->
<div id="lightbox" onclick="if(event.target===this)closeLightbox()">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <button class="lb-nav lb-prev" id="lbPrev" onclick="lbNavigate(-1)">&#8592;</button>
  <img id="lbImg" alt="" />
  <button class="lb-nav lb-next" id="lbNext" onclick="lbNavigate(1)">&#8594;</button>
  <div class="lb-counter" id="lbCounter"></div>
</div>

<!-- NAV -->
<nav id="nav">
  <a href="/index.html" class="nav-brand">
    <div class="nav-brand-nombre" id="navBrandNombre">—</div>
    <div class="nav-brand-by">by Sur <span>Patagonian</span></div>
  </a>
  <div class="nav-links">
    <a href="#presentacion" class="nav-link">Proyecto</a>
    <a href="#plano" class="nav-link">Plano</a>
    <a href="#disponibilidad" class="nav-link">Lotes</a>
    <a href="#galeria" class="nav-link">Galería</a>
    <a href="#contacto" class="nav-cta" id="navWsp">Consultar</a>
  </div>
</nav>

<!-- ══ HERO ══════════════════════════════════════════════════════════════ -->
<section id="hero">
  <div class="hero-video-wrap" id="heroMedia"></div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-eyebrow" id="heroEyebrow">Sur Patagonian · Proyectos</p>
    <h1 class="hero-title" id="heroTitle">&nbsp;</h1>
    <p class="hero-tagline" id="heroTagline"></p>
    <div class="hero-stats" id="heroStats"></div>
  </div>
  <div class="hero-scroll">
    <span>Scroll</span>
    <div class="hero-scroll-line"></div>
  </div>
</section>

<!-- ══ ATMÓSFERA ══════════════════════════════════════════════════════════ -->
<section id="atmosfera" style="display:none;">
  <div class="atm-bg" id="atmBg"></div>
  <div class="atm-overlay"></div>
  <div class="atm-content">
    <div class="atm-linea"></div>
    <h2 class="atm-quote" id="atmQuote"></h2>
    <p class="atm-sub" id="atmSub"></p>
  </div>
</section>

<!-- ══ PRESENTACIÓN ════════════════════════════════════════════════════ -->
<section id="presentacion">
  <div class="pres-left">
    <p class="pres-eyebrow" id="presEyebrow">El desarrollo</p>
    <h2 class="pres-titulo" id="presTitulo">&nbsp;</h2>
    <div class="pres-linea"></div>
    <p class="pres-desc" id="presDesc"></p>
    <div id="presStats"></div>
  </div>
  <div class="pres-right">
    <div class="pres-lote-wrap" id="presLote"></div>
  </div>
</section>

<!-- ══ PLANO ══════════════════════════════════════════════════════════ -->
<section id="plano">
  <div class="plano-header" id="planoHeader">
    <div>
      <p class="plano-eyebrow">Plano de mensura</p>
      <h2 class="plano-titulo" id="planoTitulo">&nbsp;</h2>
    </div>
    <div class="plano-legend">
      <div class="plano-leg"><div class="leg-dot leg-disp"></div>Disponible</div>
      <div class="plano-leg"><div class="leg-dot leg-res"></div>Reservado</div>
      <div class="plano-leg"><div class="leg-dot leg-vend"></div>Vendido</div>
    </div>
  </div>
  <div class="plano-img-wrap" id="planoWrap" style="display:none;" onclick="openLightbox(this.querySelector('img').src)">
    <img id="planoImg" alt="Plano del proyecto" />
    <div class="plano-watermark" id="planoMarca"></div>
  </div>
  <div class="plano-hint" id="planoHint" style="display:none;">
    <span>↗ Hacé clic</span> en el plano para verlo en pantalla completa
  </div>
</section>

<!-- ══ MAPA INTERACTIVO DE LOTES ══════════════ -->
<section id="mapa-lotes" style="display:none;">
  <div class="ml-header">
    <p class="ml-eyebrow">Mapa interactivo</p>
    <h2 class="ml-titulo">Elegí <em>tu lugar</em></h2>
    <p class="ml-sub">Hacé clic en cualquier lote para ver superficie, precio y disponibilidad</p>
  </div>
  <div class="ml-counters" id="mlCounters"></div>
  <div class="ml-map-wrap" id="mlMapWrap">
    <img alt="Plano del proyecto" class="ml-map-img" id="mlMapImg" />
    <svg class="ml-svg-overlay" id="mlSvg" viewBox="0 0 1400 1145" preserveAspectRatio="xMidYMid meet"></svg>
    <div class="ml-popup" id="mlPopup"></div>
  </div>
  <div class="ml-leyenda"></div>
</section>

<!-- ══ DISPONIBILIDAD ══════════════════════════════════════════════════ -->
<section id="disponibilidad">
  <div class="disp-head" id="dispHead">
    <div>
      <p class="disp-eyebrow">Disponibilidad en tiempo real</p>
      <h2 class="disp-titulo">Lotes disponibles</h2>
    </div>
    <div class="disp-filtros">
      <button class="disp-filtro activo" data-f="todos">Todos</button>
      <button class="disp-filtro" data-f="disponible">Disponibles</button>
      <button class="disp-filtro" data-f="reservado">Reservados</button>
    </div>
  </div>
  <div class="disp-tabla-wrap" id="dispTabla">
    <table class="disp-tabla">
      <thead>
        <tr>
          <th>N° Lote</th><th>Superficie</th><th>Precio</th>
          <th>Frente agua</th><th>Estado</th><th></th>
        </tr>
      </thead>
      <tbody id="lotesBody">
        <tr><td colspan="6" class="disp-empty">Cargando...</td></tr>
      </tbody>
    </table>
  </div>
</section>

<!-- ══ GALERÍA ══════════════════════════════════════════════════════════ -->
<section id="galeria" style="display:none;">
  <div class="gal-head" id="galHead">
    <p class="gal-eyebrow">Fotografía del proyecto</p>
    <h2 class="gal-titulo">Nuestro <em>entorno</em></h2>
  </div>
  <div class="gal-grid" id="galeriaGrid"></div>
</section>

<!-- ══ INFO + SERVICIOS ════════════════════════════════════════════════ -->
<section id="info">
  <div class="info-foto-col" id="infoFotoCol" style="display:none;">
    <img id="infoFotoImg" alt="" />
  </div>
  <div class="info-data-col">
    <div class="info-wrap">
      <div id="infoLeft">
        <p class="info-col-label">Información del proyecto</p>
        <div id="infoItems"></div>
      </div>
      <div id="infoRight">
        <p class="info-col-label">Servicios e infraestructura</p>
        <div class="chips" id="serviciosChips"></div>
        <div id="condicionesBlq" style="display:none; margin-top:2.5rem;">
          <p class="info-lbl" style="margin-bottom:0.7rem;">Condiciones de venta</p>
          <p style="font-size:0.83rem; line-height:1.95; color:var(--muted);" id="condicionesText"></p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══ UBICACIÓN ════════════════════════════════════════════════════════ -->
<section id="ubicacion" style="display:none;">
  <div class="ubic-header" id="ubicHeader">
    <p class="ubic-eyebrow">Ubicación</p>
    <h2 class="ubic-titulo" id="ubicTitulo"></h2>
    <p class="ubic-desc" id="ubicDesc"></p>
  </div>
  <div class="ubic-mapa" id="ubicMapa"></div>
</section>

<!-- ══ CONTACTO ════════════════════════════════════════════════════════ -->
<section id="contacto">
  <div id="contactoInner">
    <p class="cta-eyebrow">Reservá tu lote</p>
    <h2 class="cta-titulo">Hablemos<br>de tu <em>lugar</em></h2>
    <p class="cta-sub">Nuestro equipo te asesora sin compromiso sobre disponibilidad, precios y condiciones.</p>
    <div class="cta-btns">
      <a id="btnWsp" href="#" class="btn-wsp" target="_blank" rel="noopener" style="display:none;">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.964-1.405A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.031-1.09l-.29-.172-2.947.835.797-2.877-.189-.295A7.962 7.962 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/></svg>
        WhatsApp
      </a>
      <a id="btnMail" href="#" class="btn-mail" style="display:none;">
        <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
        Enviar email
      </a>
      <button class="btn-brochure" id="btnBrochure">
        <svg viewBox="0 0 24 24"><path d="M12 15V3m0 12l-4-4m4 4l4-4M3 21h18"/></svg>
        Descargar Brochure
      </button>
    </div>
    <div class="cta-form">
      <p>O escribinos directamente</p>
      <form id="formContacto">
        <div id="fContextoLote" hidden>
          <span id="fLote" aria-live="polite"></span>
          <button type="button" id="fQuitarLote">Quitar lote</button>
        </div>
        <input type="text"  id="fNombre" placeholder="Tu nombre" required />
        <input type="tel"   id="fTel"    placeholder="Tu WhatsApp" />
        <input type="email" id="fEmail"  placeholder="Tu email" />
        <textarea id="fMsg" placeholder="¿Qué querés saber sobre este proyecto?"></textarea>
        <button type="submit" id="fBtn">Enviar consulta</button>
        <p id="fMsg2"></p>
      </form>
    </div>
  </div>
</section>

<!-- ══ REPRESENTANTES ════════════════════════════════════════════════════ -->
<section id="representantes" style="display:none;">
  <div class="rep-pub-inner">
    <div class="rep-pub-main">
      <span class="rep-pub-main-label">Comercializado por</span>
      <img class="rep-pub-main-logo" src="/logovertical.png" alt="Sur Patagonian" />
    </div>
    <div class="rep-pub-divider"></div>
    <div class="rep-pub-right">
      <span class="rep-pub-right-label">Representantes por zona</span>
      <div class="rep-pub-grid" id="repPubGrid"></div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-brand">Sur <em>Patagonian</em> · Propiedades</div>
  <a href="/index.html" class="footer-back">← Volver al sitio</a>
</footer>
`)
}
