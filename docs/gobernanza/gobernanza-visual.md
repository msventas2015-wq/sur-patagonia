# CANON VISUAL — Sur Patagonian / Netin

**Versión:** 03 · **Estado:** VIGENTE · **Firmado por Mariano:** 2 de septiembre de 2026
**Reemplaza y deroga:** la v02 (3-ago-2026, Mac) · la "Gobernanza Visual v1.0 borrador" (30-jun-2026, GitHub) · `docs/gobernanza/paleta-canales.md` · cualquier resumen de gobernanza en skills o configuraciones.

> **Único documento de gobernanza visual.** Vive en `docs/gobernanza/gobernanza-visual.md` en GitHub. Lo que no está acá, no existe. Toda orden visual a Codex o a Claude cita "canon v03".
>
> **No contiene tareas.** Lo pendiente y la deuda visual viven en §16 de este mismo archivo: no hay otro documento. Ningún agente ejecuta cambios de código a partir de este archivo sin autorización explícita y puntual de Mariano.

---

## 0. Principio rector — LEER PRIMERO

**La referencia visual del sistema es el panel de colaboradores tal como está en producción** (`colaboradores/index.html`, pasivo y activo, y `colaboradores/desarrollador.html`), aprobado por Mariano el 2-sep-2026. Este documento describe ese panel. Donde el documento y el panel difieran, **manda el panel** y se corrige el documento.

Cards, transparencia, botones, chips y jerarquía de todo panel nuevo o modificado (admin incluido) se copian de esa referencia: el tratamiento completo, no solo los HEX.

**Dos prohibiciones absolutas, sin excepción ni "énfasis suave":**

1. **Glow dorado, fondo dorado, radial naranja.** En ninguna superficie, borde, chip, línea de gráfico ni punto.
2. **Dorado como superficie o relleno en gráficos.** El dorado en un gráfico es solo una línea fina (consultas).

---

## 1. Contextos

| Contexto | Archivos | Tipografía | Primario |
|---|---|---|---|
| Sitio público | `index.html`, `propiedades.html`, `propiedad.html`, `proyectos.html`, `servicios.html`, `proximamente.html` | Cormorant Garamond (marca) + Montserrat (cuerpo) | Dorado `#c9a84c` |
| Paneles admin | `admin/*.html` | Inter | Accent `#d76f3f` |
| Paneles colaboradores | `colaboradores/*.html` | Inter + Cormorant en título del desarrollador, logo de texto y ranking | Dorado `#c9a84c` |

El primario naranja en admin y dorado en colaboradores es intencional. No se unifica. Los paneles de colaboradores son **la referencia**; admin adopta su receta de superficie (§4) conservando el naranja.

**Panel pasivo y panel activo son dos paneles distintos** dentro de `colaboradores/index.html`: el pasivo muestra negocios (canales) de un aliado; el activo muestra propiedades de un colaborador. No comparten datos ni lógica de series; comparten el dibujo (§9).

---

## 2. Tokens base

Los mismos diez en `colaboradores/index.html` y `colaboradores/desarrollador.html`:

```css
:root {
  --bg:#090909;                 /* fondo, siempre */
  --card:#141414;               /* sólido: solo modal y selects */
  --border:rgba(255,255,255,.07);
  --accent:#d76f3f;
  --dorado:#c9a84c;
  --verde:#50c878;              /* QR / scan */
  --rojo:#e05c5c;
  --azul:#7aaeff;               /* clics · interacciones */
  --gris:#aaa;                  /* secundario */
  --blanco:#f5f3f0;
}
```

Fuera de `:root`, de uso fijo: `#e8c96a` dorado claro (texto activo, hover, cifras de consultas) · `#6ee89a` verde menta (QR activo, "en vivo", botón Descargar QR, contador del hero) · `#3bbf88` conversión · `#6495ed` link e interacciones de KPI · `#8fb2ff` texto de botón azul · `#f8f6f2` número grande de titular y pipeline · `#9d4eff` rótulo "Red de aliados" del header.

**Jerarquía por opacidad del blanco:** .78 cuerpo de tabla · .67 feed · .55/.52 subtítulos · .42 kickers · .38/.36 sub de KPI · .3 sub y ticks · .28 vacíos · .25 fechas · .2 "descartadas".

`#fff` puro se usa como arranque del degradado de KPI y de título (`#fff → rgba(255,255,255,.7)`), nunca como color plano de texto.

---

## 3. Tipografía

Google Fonts de los paneles: `Inter 300–800` + `Cormorant Garamond 300/400/600`. Montserrat no se usa en paneles.

| Rol | Familia · peso · tamaño | Fuente |
|---|---|---|
| Título del pasivo/activo | Inter 800 · `clamp(1.8rem,4vw,2.8rem)` · uppercase · `-.03em` · degradado `#fff → .6` | `.pv-hero-title h1` |
| Título del desarrollador | Cormorant Garamond 300 · `2.6rem` · uppercase · `.07em` | `.hero h1` |
| Título de sección | Inter 700 · `.6rem` · uppercase · `.14em` · `--gris` | `.sec-t`, `.pv-sec-titulo` |
| Kicker de KPI | Inter 600 · `.58rem` · uppercase · `.22em` · `.42` | `.pv-kpi-label` |
| Número de KPI | Inter 300 · `2.45rem` | `.kpi-n`, `.pv-kpi-n` |
| Número de titular / pipeline | Inter 300 · `3rem` / `2.6rem` · `#f8f6f2` | `.pv-titular-n`, `.pv-pipe-n` |
| Cuerpo de tabla | Inter · `.73–.76rem` · `.78` | `td` |
| Logo de texto (desarrollador) | Cormorant 400 · `1.05rem` · `.18em` | `.logo` |

Cormorant permitido en: sitio público · h1 del desarrollador · logo de texto del header · posición del ranking. Prohibido en cualquier título de admin (firmado 5-jul-2026). El monograma `.pv-monogram` no existe en pantalla: CSS muerto, se borra.

---

## 4. Superficies — la receta del vidrio

Ninguna card tiene fondo sólido. Es un degradado de blanco translúcido sobre el negro, borde tenue con el borde superior más claro, y a veces blur. **Seis recetas, todas vigentes:**

| Pieza | Receta | Fuente |
|---|---|---|
| Card estándar | `linear-gradient(160deg,rgba(255,255,255,.055),rgba(255,255,255,.02))` · borde `.07` · borde-top `.12` · radio 14 · `backdrop-filter:blur(4px)` · padding 1.4rem | D `.card` `.sec-blk` · I `.seccion` `.qr-status` |
| Sección del panel | `155deg, .042 → .014` · borde `.07` · top `.12` · radio 12 · sin blur · padding 1.45/1.55rem | I `.pv-sec` `.pv-panel` |
| KPI pasivo/activo | `145deg, .052 → .018` · borde `.07` · top `.13` · radio 12 · barra 2px izquierda | I `.pv-kpi` |
| KPI desarrollador | `135deg, .06 → .02` · borde `.08` · top `.14` · radio 14 · barra 2px izquierda | D `.kpi` |
| Titular / slot | `155deg, .052 → .016` · top `.13` · radio 14 · barra 2px del color | I `.pv-titular-card` `.slot-full-card` |
| Paso de pipeline | `160deg, .048 → .015` · borde-top del color de etapa `.35` · radio 12 | I y D `.pv-pipe-step` |

**Regla general:** ángulo 135°–160°, blanco al 4–6 % arriba y 1,2–2 % abajo, borde 1px al 7–8 % con el superior al 12–14 %, radio 12 en piezas internas y 14 en contenedores, blur 4px solo en cards grandes. Sombra: ninguna, salvo el resumen "Ver más" (`0 18px 48px rgba(0,0,0,.28)`) y el modal.

**Otras piezas:**

- **Hero del pasivo/activo:** sin fondo, sin borde, sin glow; título, línea de estado y botones directo sobre el ghost.
- **Card de comercio** (`.pv-comercio-card`): borde-top 2px del color del canal · fondo `color-mix(var(--canal-color) 11%, #151515)` · halo del color del canal al 8 % con blur 20. Es el único halo permitido y lleva el color del canal, nunca dorado.
- **Resumen "Ver más"** (`.pv-detalle-summary`): borde `rgba(232,201,106,.2)` · top `.42` · fondo `135deg, rgba(232,201,106,.105) → .035 → rgba(255,255,255,.018)` · sombra oscura. Sin glow dorado.
- **Barra "en vivo"** (`.pv-live-bar`): `135deg, rgba(110,232,154,.08) → .02` · borde `rgba(110,232,154,.18)`.
- **Header:** `rgba(9,9,9,.96)` · `blur(14px)` · borde inferior `--border`.
- **Modal** (`.der-card`): `#141414` sólido · borde `.12` · radio 16 · sombra `0 24px 70px rgba(0,0,0,.55)` · overlay `rgba(0,0,0,.78)` + `blur(5px)`.
- **Ghost de marca** (`.sp-bg-brand`): `assets/camion-red-inmobiliaria.jpg`, fijo, `grayscale(1) brightness(.75)`, `opacity:.11`, máscara 12 % → 82 %. Todo panel interno lo lleva.

**CSS muerto a borrar de `colaboradores/index.html`** (ningún elemento lo usa): `.pv-hero` (L302, borde dorado + radial naranja), `.pasivo-hero` (L85), `.pv-monogram` (L310), `.pv-carta-stat-main` (L672).

---

## 5. KPI

Número fino en degradado blanco, barra vertical de 2px a la izquierda con el color del concepto, kicker muy espaciado.

- **Número:** Inter 300 · `2.45rem` · `linear-gradient(135deg,#fff,rgba(255,255,255,.7))` con `background-clip:text`. Excepciones del pasivo: consultas en dorado (`#c9a84c → #e8c96a`) y propiedades en verde menta (`#6ee89a → #a8f5c4`).
- **Barra `::before`:** 2px · opacidad 1 · del color del concepto · en I del 10 % al 20 %, en D del 20 % al 20 %.
- **Colores de barra en uso:** interacciones `#6495ed` · escaneos `#89b4f7` · consultas `#c9a84c` · conversión `#3bbf88` · propiedades `#9aa7b2` · canales `#b88fd6` · lecturas `#7aaeff`.
- **Delta (firmado 2-sep):** un solo par para los dos paneles, el del pasivo: positivo `#47d48a`, negativo `#d9825b`. El desarrollador migra de `#6ee89a` / `#f0956a`.
- **Contador flip del hero:** dígitos con `--sport-counter-accent:#6EE89A` (es el verde menta del sistema, no la paleta SPORT).

Prohibido: número con peso 700 · color por posición (`nth-child`) · barra con gradiente difuminado.

---

## 6. Badges y chips — un formato por concepto

| Concepto | Forma | Fuente |
|---|---|---|
| Estado CRM (firmado 2-sep: la del pasivo, en los dos paneles) | pill 999 · fondo del color `.18–.2` · borde `.28–.35` · `.6rem` 700 uppercase | I `.estado-badge` |
| Tipo de canal | rect 5px · borde del color `.35` · fondo `.09` · `.6rem` 600 uppercase | D `.tipo-badge` |
| Canal | texto del color · borde `.44` · fondo `.13` · radio 7 · desde `colorCanalDesdeIndex(color_index)` | D `.canal-bdg` |
| Vía | cuadradito 8px con borde (hueco) + texto · QR `#50c878` 600 · link `#6495ed` | I `.pv-via` |
| Tipo de evento en feed | pill · lead `#b39ddb` · scan `#50c878` · link `#6495ed` | D `.feed-kind` |
| Origen / leyenda | pill 999 · dot con glow del propio color · fondo `.025–.04` | I `.pv-origin-chip` `.pv-legend-chip` |
| Estado del QR | pill 999 · fondo `rgba(0,0,0,.45)` + blur 6 · activo `#6ee89a` · campaña `#e8c96a` · inactivo `.45` | I `.qr-slot-estado-badge` |
| Filtro de período | ver §10 | I `.pv-flt-btn` |

Se quitan del pasivo los estados legacy `en_contacto` (dorado) y `en_negociacion` (naranja): no existen en la base (firmado 2-sep).

---

## 7. Colores por concepto

### 7.1 Estados CRM

`nueva #b39ddb` · `contactado #35c6b4` · `visita #f29a5a` · `visita_realizada #7fd1c6` · `oferta #d9a7ff` · `cerrado #a9dc7a` · `descartado #7b7f88` · vacío `#6f6b72`.

### 7.2 Tipos de canal

`inmobiliaria #9fb7d9` · `particular #9cc9b5` · `punto_venta #d7a86e` · `campaña #c68bc8` · `evento #b88f75` · `otro --gris`.

### 7.3 Dos embudos, a propósito (firmado 2-sep)

- **Pasivo** (`.pv-pipe-step` en I): p0 interacciones neutro `.16` · p1 consultas `#e8c96a` · p2 contactado `#35c6b4` · p3 visita `#f29a5a` · p4 oferta `#d9a7ff` · p5 cerrado `#a9dc7a`.
- **Desarrollador** (D): p0 nueva `#b39ddb` · p1 contactado `#35c6b4` · p2 visita `#f29a5a` · p3 visita realizada `#7fd1c6` · oferta `#d9a7ff` · cierre con logro `#a9dc7a` (glow verde y número en degradado, único KPI con color) · cierre vacío `#6f6b72` punteado.

### 7.4 Lotes y termómetro (D)

Lotes: disponible `#4dc992` · reservado `#b8955a` · vendido `#993C1D` (popup `#c97060`) · otro `#666` · complejo `#a09b8c`. Termómetro: alto `#47d48a` · activo `#d4a84e` · creciendo `#6ab4ec` · inicial `#888` · sin movimiento `#444`. Barra de provincias `#78aad8` · barra de conversión `#3bbf88`.

### 7.5 Reservados de sistema

Interacciones/clics `#7aaeff` · consultas `#e8c96a` · QR `#50c878` · link `#6495ed` · directo/neutro `#8a8a82` · activo/en vivo `#6ee89a` · conversión `#3bbf88` · error `#e05c5c` · WhatsApp (solo envío directo) `#25d366`.

---

## 8. Paletas de identidad

### 8.1 Canales — `js/paleta-canales.js` · 103 colores

Fuente única. `canal.codigo → canales.color_index → PALETA_CANALES[color_index]`. Prohibido definir arrays de canal en otro archivo. Los índices 100, 101 y 102 (`#a47864 #8b6552 #b88a76`) quedan registrados (firmado 2-sep); ningún canal los usa.

**Regla de asignación (firmada 2-sep):**

1. El color se asigna **una sola vez, al crear el canal**, se guarda en `canales.color_index` y no se recalcula nunca.
2. **Nunca correlativo, nunca al azar, nunca a mano.** Se elige el índice libre cuyo color quede más lejos de **todos** los ya asignados (distancia Lab, no contra el último).
3. **Distancia mínima 20** contra todos los asignados, y **prohibido el índice vecino** (n−1 / n+1) de cualquier canal existente aunque cumpla la distancia. Entre los que cumplen, el más lejano.
4. Si ninguno llega a 20: se asigna el más lejano igual y el alta muestra aviso ("color parecido a …"). El canal se crea.
5. **Un canal archivado libera su color.** Los 57 simulados, al archivarse, devuelven el suyo.
6. Cargas masivas, scripts y pruebas usan la **misma función** (`siguienteColorIndex`, `admin/nuevo-canal.html`). Prohibido asignar por contador, por orden de fila o por hash.
7. Dos canales activos que se vean iguales en cualquier lista son un bug, aunque tengan índices distintos.

Estado real (2-sep): la función ya elige el más lejano (falta el umbral, el veto al vecino y la liberación). Los índices 0/1/2 (tres azules) quedan como están (firmado 2-sep).

### 8.2 Propiedades — `PALETA_PROPIEDADES` en `colaboradores/index.html` · 25 colores

`#ff4088 #ccff00 #8820c0 #ff9500 #8e1f63 #7dff36 #ff6830 #00c8ff #d030c0 #ffd428 #c890f0 #00ffd5 #ff4a5a #9d4eff #eaff5c #b840e0 #00e676 #ff6bd6 #ff3d3d #14e6e6 #0097a7 #155e5e #ff6d00 #d4a017 #e574a0`

Asignación estable por propiedad, distancia mínima 80 entre vecinos. **Solo en el panel de colaboradores, y a propósito:** es lo que ve el cliente (propiedades, líneas por propiedad, leyenda), no información interna; por eso tiene paleta propia y no reutiliza ni colores de canal ni semánticos internos. Firmada 6-jul, confirmada 2-sep. También la usa `admin/mapa-qr.html` para puntos QR (`punto_orden % 25`); nunca se ven en la misma pantalla.

### 8.3 Zonas de loteo — `ZONA_COLORS` + `FALLBACK` en `colaboradores/desarrollador.html` · 10 colores

Laguna `#7ec8d4` · Bosque `#8aab78` · Río `#6aabb4` · Complejo turístico `#c8bfa8` · reserva `#c070c0 #e08060 #9b7fcc #e87090 #8a9fd4 #e0a860`. Alcance: solo el desarrollador. Restaurados por PR #8 tras la violación de G6.

### 8.4 Tipos de servicio del módulo de alquileres — paleta v2, firmada 17-ago-2026

Sin cambios respecto de la v02 §8.2.a: Alquiler `#1e5fa0` · Electricidad `#26b8a8` · Gas `#0f6e80` · Agua `#7fb3d5` · Internet `#6f7fe8` · Expensas `#1f8473` · Municipal `#7a8a3e` · Otros `#8a8a82`. Estados: vencido `#c81e3c` · en mora `#7a1f2e` · deuda `#c94869` · pagado `#3bbf88` · sin cargar transparente. Letras blancas en las franjas; la identidad apagada, el estado domina.

---

## 9. Gráficos

### 9.1 Gráfico de actividad — regla por panel (firmada 2-sep)

Consultas en una línea y clics en otra, **siempre, en los dos paneles**. Después:

- **Panel pasivo:** si el aliado tiene **dos o más negocios** (canales), una línea más por negocio, con el color de su canal (`colorCanalDesdeIndex`). Con un solo negocio, nada más. **Nunca líneas por punto QR.**
- **Panel activo:** si el colaborador tiene **dos o más propiedades**, una línea más por propiedad, con su color de §8.2. Con una sola, nada más.
- En cada panel, **el mismo dibujo en Hoy, 7 días, 30 días y personalizado**: mismas líneas, mismo suavizado, misma leyenda de chips debajo (cada chip se apaga y prende). "Hoy" agrega la barra de rango horario y el punto que late: el mismo gráfico con un dato más, no otro gráfico.

### 9.2 Series

Clics `#7aaeff` · 2px · relleno azul bajo la curva (`.32 → 0`). Consultas `#e8c96a` · **1.6px · sin relleno** · punto dorado solo donde hay dato. Conversión diaria `#ffa050`. Grid `rgba(255,255,255,.05)` · ticks `.35–.4` Inter 10 · tooltip `rgba(18,18,21,.96)` borde `.12`.

**Prohibido:** glow sobre cualquier línea (hoy `pluginGoldGlow`), banda dorada en el pico (`pluginPeakMark`), relleno dorado, barras doradas, cualquier superficie dorada en un gráfico.

### 9.3 Mapa

Fondo `#0b0b0d` · capa `basemaps.cartocdn.com/dark_all/` · zoom `#c9a84c` / hover `#e8c96a` · popup `rgba(8,8,8,.94)` con borde `rgba(201,168,76,.22)` y radio 8 · mini mapa del pasivo con borde `rgba(201,168,76,.25)`. El punto del canal lleva su color de canal, sin glow dorado.

---

## 10. Botones e inputs

Los botones son chips tintados: borde y fondo del color al 28 % / 15 % → 5 %, texto del color claro, uppercase chico, sin íconos.

| Botón | Receta | Fuente |
|---|---|---|
| Filtro de período | reposo fondo `.05`, borde `.09`, texto `.5` · hover borde dorado `.35`, texto dorado · activo `135deg, rgba(201,168,76,.22) → .08`, borde `.42`, texto `#e8c96a`. **Sin glow.** | I `.pv-flt-btn` · D `.btn-p` |
| Actualizar · Link | azul link `rgba(100,149,237)` `.28` / `.15 → .05` · texto `#8fb2ff` · hover borde `.45`, texto blanco | I `.pv-btn-refresh` `.pv-btn-link-canal` |
| Descargar QR | verde QR `rgba(80,200,120)` · texto `#6ee89a` | I `.pv-btn-qr-dl` |
| Aplicar (desarrollador) | gradiente `#c9a84c → #e8c96a` · texto `#0c0c0e` | D `.evol-aplicar` |
| Aplicar (pasivo) | `#c9a84c` sólido · texto `#15130e` | I `.pv-aplicar` |
| Responder (mensajes) | `#d76f3f` relleno · texto blanco · único botón naranja | I `.btn-reply` |
| Salir | ghost gris, hover rojo | D `.btn-salir` |
| Cerrar sesión | card glass `160deg, .055 → .018`, hover rojo `.42` | I `.pv-logout-card` |
| Inputs | fondo `#111113` o blanco `.04–.05` · borde `.1` · radio 6–8 · foco dorado `.45` + anillo `.08` (fechas) o naranja `.5` (respuesta) | D `.evol-fecha` · I `.reply-input` |

---

## 11. Tablas, feed, mensajes, vacíos

- **Tabla:** th `.54–.58rem` 600 uppercase al `.3`, borde `.06` · td `.73–.76rem` al `.78`, borde `.04` · hover `.02` · última fila sin borde.
- **Feed pasivo:** dot 6px con glow del color de la vía · texto `.67` · fecha `.25`.
- **Feed desarrollador:** fila con degradado horizontal, borde izquierdo dorado `.28` (naranja `.42` si es lead), pill de tipo al inicio.
- **Mensajes:** card blanco `.025` con borde izquierdo dorado `.28`, punto de no leído dorado; respuesta del colaborador sobre naranja `.07`.
- **Vacíos:** `.28`; el pasivo con anillo dorado `.28` arriba.

---

## 12. Privacidad del panel pasivo

Sin cambios respecto de la v02 §13: el aliado no ve nombre, email, teléfono, mensaje, notas, actores internos ni `contacto_id`. Estados públicos: nueva → "Sin avance", contactado, visita → "En visita", descartado. No mostrar "cerrado" ni "conversión" sin dato real. No prometer comisión, ganancia ni cobro.

---

## 13. Logo y paleta SPORT

Logo: activo real `<img>` de `assets/logos/`, `brightness(0) invert(1)`, opacidad `.88–.96`. Nunca texto reconstruido, nunca deformado. El header del pasivo lleva además "Red de aliados" en `#9d4eff` con glow.

Paleta SPORT (8: `#EA3341 #CCFF00 #39FF14 #FF5C00 #0099E5 #E0186B #74EE15 #D4ED00`): solo soportes físicos deportivos. Prohibida en web, paneles, admin y documentos. `#6EE89A` no es SPORT: es el verde menta del sistema (§2).

---

## 14. Prohibidos y derogados

| Ítem | Estado |
|---|---|
| Glow dorado, fondo dorado, radial naranja, en cualquier lugar | **PROHIBIDO, absoluto** (2-sep) |
| Dorado como superficie o relleno en gráficos; glow sobre líneas; banda en el pico | **PROHIBIDO** (2-sep) |
| Líneas por punto QR en el gráfico de actividad; mezclar lógica de pasivo y activo | **PROHIBIDO** (2-sep) |
| Dos formatos de gráfico para el mismo bloque según el período | **PROHIBIDO** (2-sep) |
| Estados `en_contacto` / `en_negociacion` en el pasivo | **DEROGADO** (2-sep) |
| CSS muerto `.pv-hero` `.pasivo-hero` `.pv-monogram` `.pv-carta-stat-main` | **A BORRAR** (2-sep) |
| Color de canal por contador, hash, array local o posición | **PROHIBIDO** |
| Índice de canal vecino (n±1) de otro canal | **PROHIBIDO** (2-sep) |
| `#161513` como superficie · `#9aa7b2` como gris de canal | **PROHIBIDO** — vigentes en `css/admin-theme.css` y `admin/canales.html`: deuda |
| Cormorant en títulos de admin | **DEROGADO** 5-jul |
| Canal sólido con texto negro · botón con borde pelado y letra blanca · fill plano en barras | **DEROGADO** 5-jul |
| Paleta SPORT en web/paneles/admin/documentos | **PROHIBIDO** |
| Halos cálidos, sombras cromáticas, plugins de glow, estética neón | **PROHIBIDO** |

**Derogado de la v02 porque el panel manda:** `--gris:#888` · "nunca #fff" en degradados · KPI con número del color del concepto y barra `.75` · tipo de canal en pill 8px con glow · Cormorant "solo en monograma" · vía con cuadradito relleno · glass en "dos tiers".

---

## 15. Decisiones firmadas el 2-sep-2026

1. Delta: un par para los dos paneles, el del pasivo (`#47d48a` / `#d9825b`).
2. Estado CRM: la píldora del pasivo en los dos paneles; se quitan los dos estados legacy.
3. Embudos: son dos, uno por panel, a propósito.
4. Paleta de canales: se registran los 103 y todo color en uso no registrado.
5. Asignación de color de canal: regla de §8.1 (distancia 20, veto al vecino, aviso sin bloquear, archivados liberan).
6. Los tres azules 0/1/2 quedan como están.
7. Gráfico de actividad: regla de §9.1 (pasivo por negocios, activo por propiedades, mismo dibujo en todos los períodos).

---

## 16. Pendiente de firma y deuda visual

**Pendiente de firma de Mariano** (no resolver por cuenta propia):

| # | Punto |
|---|---|
| 1 | `#d76f3f`: ¿accent de marca permanente o uso comercial específico? (abierto desde la v02) |
| 2 | Variantes vectoriales SVG/EPS del isotipo cromático para producción física |
| 3 | Admin: `css/admin-theme.css` y `admin/canales.html` usan `#161513` y `#aaa`; adoptar la receta de §4 es un lote propio, con brief, sobre archivos con restricción absoluta |

**Deuda visual** (código que hoy no cumple este canon; se corrige solo con brief y autorización puntual):

| # | Archivo | Qué | Estado |
|---|---|---|---|
| D1 | `colaboradores/index.html` | CSS muerto `.pv-hero` `.pasivo-hero` `.pv-monogram` `.pv-carta-stat-main` | brief 2-sep |
| D2 | `colaboradores/index.html` · `desarrollador.html` | glow dorado residual: chip de período activo, anillos de alianza, resumen "Ver más", punto de campaña, punto del canal en el mapa | brief 2-sep |
| D3 | `colaboradores/index.html` | gráfico de actividad: dos formatos, fuente de líneas mezclada entre pasivo y activo, `pluginGoldGlow`, `pluginPeakMark` | brief 2-sep |
| D4 | `colaboradores/index.html` | estados legacy `en_contacto` / `en_negociacion` | brief 2-sep |
| D5 | `colaboradores/desarrollador.html` | delta `#6ee89a`/`#f0956a` → `#47d48a`/`#d9825b`; estado CRM en rect → píldora | brief 2-sep |
| D6 | `admin/nuevo-canal.html` | asignación de color: falta umbral 20, veto al vecino, aviso y liberación de archivados | brief 2-sep |
| D7 | `css/admin-theme.css` · `admin/canales.html` | `#161513`, `#aaa`, `#9aa7b2` prohibidos en uso | sin brief (pendiente 3) |

---

## 17. Alcance de un cambio visual

Sin cambios respecto de la v02: no se toca Supabase, queries, RLS, auth, tracking, lógica de QR, descargar QR, copiar link, rutas, Service Worker, `_headers`, KPIs funcionales, cálculos ni datos productivos. Se puede tocar CSS visual, tokens, datasets visuales de Chart.js, tooltips, ejes, leyendas y layout autorizado. Prohibido: refactor general, rediseño, cambiar la semántica de un dato, reutilizar un HEX para otro concepto, inventar estados o métricas.

**Archivos con restricción absoluta** (nunca sin aprobación explícita y puntual de Mariano): `admin/crm.html` · `admin/contactos.html` · `admin/canales.html`.

**Ningún color cambia sin aprobación explícita y puntual de Mariano, aunque un brief lo mencione.**

---

## 18. Checklist antes de aprobar un cambio visual

- [ ] ¿Se copió la receta del panel de colaboradores (§4), no solo los HEX?
- [ ] ¿Sin glow dorado, sin fondo dorado, sin radial naranja?
- [ ] ¿Dorado en gráfico solo como línea fina de consultas?
- [ ] ¿`--gris:#aaa`, fondo `#090909`, ghost de marca presente?
- [ ] ¿Un HEX = un concepto? ¿Ningún reservado usado para otra cosa?
- [ ] ¿Canal desde `colorCanalDesdeIndex(color_index)`, sin array local?
- [ ] ¿Estado CRM en píldora? ¿Tipo de canal en rect 5px? ¿Vía en cuadradito hueco?
- [ ] ¿KPI con número blanco degradado, peso 300, barra 2px opacidad 1?
- [ ] ¿Gráfico igual en todos los períodos? ¿Pasivo por negocios, activo por propiedades?
- [ ] ¿Botones como chips tintados, sin íconos?
- [ ] ¿Sin tocar Supabase, tracking, QR, rutas ni los tres archivos restringidos?
- [ ] ¿Consola sin errores?

---

## 19. Referencias

| Qué | Dónde |
|---|---|
| Referencia visual del sistema | `colaboradores/index.html` · `colaboradores/desarrollador.html` (main, 2-sep-2026) |
| Color de canal | `js/paleta-canales.js` · asignación en `admin/nuevo-canal.html` (`siguienteColorIndex`) · persistencia en `canales.color_index` |
| Paleta de propiedades | `colaboradores/index.html` (`PALETA_PROPIEDADES`) |
| Zonas de loteo | `colaboradores/desarrollador.html` (`ZONA_COLORS`, `FALLBACK`) |
| Canon renderizado (maqueta de verificación) | artefacto "Mapa del Canon Visual", 2-sep-2026 |
