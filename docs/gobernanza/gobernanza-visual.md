# Gobernanza Visual Sur Patagonia — v1.0

Documento base para formalizar el sistema visual usado en los paneles internos de Sur Patagonia.

Estado: borrador formal operativo.  
Uso previsto: referencia técnica para auditoría, implementación, revisión visual y futuras etapas de documentación de marca.

Todo agente (Codex, Cloud, ChatGPT) debe leer este archivo antes de tocar cualquier pieza visual.

---

## 1. Objetivo

Establecer una gobernanza visual común para los dashboards, paneles internos y módulos comerciales de Sur Patagonia, evitando inconsistencias de color, duplicación semántica, deformación de marca o cambios visuales no controlados.

El principio central es:

> Un color visible debe representar un único concepto visible.

Este documento consolida los criterios usados para auditar y aprobar cambios en:

- Panel activo de colaboradores.
- Panel pasivo de aliados / puntos físicos.
- Panel desarrollador.
- Gráficos, KPIs, funnel, pipeline, mapas y módulos comerciales.

---

## 2. Alcance

Aplica a:

- `colaboradores/index.html`
- `colaboradores/desarrollador.html`
- panel activo;
- panel pasivo;
- panel desarrollador;
- dashboards internos;
- gráficos Chart.js;
- mapas Leaflet;
- tablas;
- KPIs;
- badges;
- botones;
- filtros temporales;
- módulos comerciales;
- futuras vistas internas.

No reemplaza todavía el Manual de Marca institucional completo. Este documento formaliza el sistema visual operativo usado en producto digital.

---

## 3. Principio rector

### 3.1 Un HEX = un concepto visible

Un mismo color puede repetirse solo si representa exactamente el mismo concepto.

Ejemplos permitidos:

- QR en feed y QR físico usan el mismo verde.
- Link en feed y link compartido usan el mismo azul.
- Nuevo lead y nueva consulta pueden compartir color si representan el mismo concepto.
- Visualizaciones en KPI, gráfico y popup pueden compartir azul si son el mismo dato.

Ejemplos prohibidos:

- QR y Cerrado usando el mismo verde.
- Consultas y Oferta usando el mismo dorado.
- Visualizaciones y tipo de canal usando el mismo azul.
- Activo y QR usando el mismo verde si "Activo" funciona como estado distinto.
- Tipo de canal e identidad individual de canal usando el mismo color.

### 3.2 Convención documental de estado

Las reglas de este documento deben marcarse o interpretarse con una de estas categorías cuando haya riesgo de confusión entre criterio aprobado e implementación existente:

| Estado | Significado |
|---|---|
| VIGENTE | Regla aprobada y aplicable hoy. Debe usarse para auditar nuevas etapas. |
| OBJETIVO_PENDIENTE | Regla deseada o dirección aprobada, pero aún no aplicada en todas las pantallas o dependiente de una etapa futura. |

Ejemplos:

- `color_index` para identidad individual de canales: VIGENTE como regla del sistema; OBJETIVO_PENDIENTE en pantallas admin que todavía no lo consumen.
- Canal activo `#52d68c`: VIGENTE como significado visual; OBJETIVO_PENDIENTE donde todavía se use otro verde en tablas admin.
- Profundidad, glow y cards premium: VIGENTE como lenguaje visual de dashboards modernos; OBJETIVO_PENDIENTE en pantallas admin legacy.
- Logo real como `<img>`: VIGENTE como regla; OBJETIVO_PENDIENTE donde todavía exista logo reconstruido con texto.

---

## 4. Tipografías

### 4.1 Fuente principal de interfaz

Nombre:

```txt
Inter
```

Uso:

- cuerpo de interfaz;
- KPIs;
- tablas;
- botones;
- badges;
- filtros;
- tooltips;
- gráficos;
- labels;
- módulos comerciales.

Fallback:

```txt
system-ui, sans-serif
```

### 4.2 Fuente editorial / marca

Nombre:

```txt
Cormorant Garamond
```

Uso:

- logo textual cuando corresponda;
- títulos editoriales;
- acentos premium;
- monogramas o numeración editorial puntual.
- landing `proximamente.html` y páginas públicas del sitio.

### 4.3 Fuente de cuerpo en landing / marketing

Nombre:

```txt
Montserrat
```

Uso:

- body text del sitio público (`index.html`, `propiedades.html`, `proyectos.html`, `proximamente.html`);
- navegación pública;
- etiquetas y datos en páginas públicas.

> **Separación de contextos:** `Inter` para paneles internos (colaboradores, desarrollador, admin). `Montserrat` para páginas públicas del sitio. `Cormorant Garamond` para elementos de marca en ambos contextos.

### 4.4 Reglas tipográficas

- No reconstruir el logo con tipografía si existe un activo oficial.
- No cambiar tipografías en microajustes visuales salvo autorización explícita.
- Mantener el contraste entre interfaz funcional (`Inter`) y acento editorial (`Cormorant Garamond`).

---

## 5. Tokens base

| Concepto | Valor |
|---|---:|
| Fondo principal | `#0f0e0c` |
| Superficie / card | `#161513` |
| Borde base | `rgba(255,255,255,0.07)` |
| Blanco roto | `#f5f3f0` |
| Gris secundario | `#aaa` |
| Accent comercial / marca | `#d76f3f` |
| Dorado institucional | `#c9a84c` |
| Verde QR físico | `#50c878` |
| Rojo / error | `#e05c5c` |
| Azul visualizaciones | `#7aaeff` |

---

## 6. Colores semánticos reservados

Estos colores no deben ser usados para otro concepto visible.

| Concepto | Color |
|---|---:|
| Visualizaciones / clicks / interacciones | `#7aaeff` |
| Consultas / leads / registros | `#e8c96a` |
| QR físico / scan | `#50c878` |
| Link compartido / link digital | `#6495ed` |
| Accent comercial / marca | `#d76f3f` |
| Dorado institucional / UI estructural | `#c9a84c` |
| Conversión | `#3bbf88` |
| Error | `#e05c5c` |
| Propiedades activas | `#9aa7b2` |
| Canal activo dot | `#52d68c` |

---

## 7. Estados CRM

| Estado interno | Label público / visual | Color |
|---|---|---:|
| `nueva` | Nuevo lead / Sin avance | `#b39ddb` |
| `contactado` | Contactado | `#35c6b4` |
| `visita` | Visita coordinada / En visita | `#f29a5a` |
| `visita_realizada` | Visita realizada | `#7fd1c6` |
| `oferta` | Oferta enviada | `#d9a7ff` |
| `cerrado` | Cerrado / logro | `#a9dc7a` |
| `descartado` | Descartado | `#7b7f88` |
| vacío / sin dato | Vacío | `#6f6b72` |

Reglas:

- No usar verde QR para estados CRM.
- No usar dorado de consultas para Oferta si Oferta es una etapa distinta.
- No usar azul de visualizaciones para estados.
- No mostrar estados futuros si no existen como dato real.

---

## 8. Tipos de canal

Los tipos de canal usan una capa categórica independiente de:

- KPIs;
- estados CRM;
- eventos;
- QR;
- link;
- identidad individual del canal.

| Tipo de canal | Color |
|---|---:|
| Inmobiliaria | `#9fb7d9` |
| Particular | `#9cc9b5` |
| Punto de venta | `#d7a86e` |
| Campaña | `#c68bc8` |
| Evento | `#b88f75` |
| Otro | `#aaa` |

---

## 9. Paleta de identidad individual de canales

Uso:

- identificar canales individuales;
- badges de canal;
- series o marcas individuales.

Estado:

- VIGENTE: `paleta-canales.md` es la fuente única de verdad.
- VIGENTE: la paleta operativa correcta tiene **54 colores únicos** y 25 familias.
- OBJETIVO_PENDIENTE: que todas las pantallas admin consuman `color_index` real.

Reglas:

- No debe coincidir con colores reservados de KPIs.
- No debe coincidir con estados CRM.
- No debe coincidir con eventos/fuentes.
- La asignación debe ser determinística por `color_index` persistido en tabla `canales`.
- Debe evitar colisiones visibles mientras haya colores libres.
- No hardcodear identidad individual de canal en CSS puro si el dato depende de `color_index`.
- Si todavía no existe integración JS + CSS para color individual, usar neutro provisional y marcarlo como OBJETIVO_PENDIENTE.

Fuente única:

```txt
docs/gobernanza/paleta-canales.md
```

No duplicar arrays, conteos ni listas extensas de colores en este documento. Si hay conflicto documental, manda `paleta-canales.md`. No usar “65 colores” como número oficial.

---

## 10. Paleta de slots / propiedades

### 10.1 Colores reservados excluidos

| Concepto | Color |
|---|---:|
| Total general | `#f5f3f0` |
| Total gráfico / visualizaciones | `#7aaeff` |
| QR físico | `#50c878` |
| Link compartido | `#6495ed` |

### 10.2 Paleta de slots (versión aplicada en código)

```txt
#b56cff
#ff8a65
#4dd0e1
#ffb74d
#ba68c8
#81c784
#e57373
#f06292
#a1887f
#90a4ae
```

Reglas:

- Ningún slot puede usar colores reservados.
- La asignación debe ser determinística por `slot.codigo`.
- Evitar colores demasiado parecidos entre slots visibles.
- Mantener distancia visual mínima cuando sea posible.
- No rediseñar la estética general.

---

## 11. Inventario / lotes

| Estado | Color |
|---|---:|
| Disponible | `#4dc992` |
| Reservado | `#b8955a` |
| Vendido | `#993C1D` |
| Vendido / cobre auxiliar | `#c97060` / `#c4734a` |

Reglas:

- Disponible no debe usar verde QR `#50c878`.
- Reservado no debe usar dorado institucional `#c9a84c`.
- Vendido no debe usar rojo de error `#e05c5c`.

---

## 12. Termómetro / actividad

| Estado visual | Color |
|---|---:|
| Alta actividad | `#47d48a` |
| Activo | `#d4a84e` |
| En crecimiento | `#6ab4ec` |
| Actividad inicial | `#888` |
| Sin movimiento | `#444` / `#555` |

Reglas:

- Alta actividad no debe usar verde QR.
- En crecimiento no debe usar azul visualizaciones.
- Activo no debe usar color de lote reservado ni QR.

---

## 13. Funnel / pipeline comercial

| Concepto | Color |
|---|---:|
| Clicks / lecturas | `#7aaeff` |
| Leads generados | `#e8c96a` |
| Con atribución | `#c7ad6b` |
| Lotes disponibles | `#4dc992` |
| Lotes reservados | `#b8955a` |
| Lotes vendidos | `#993C1D` |

Reglas:

- El funnel puede usar colores semánticos si el concepto coincide.
- No usar dorado institucional para un dato visible distinto.
- No usar verde QR para disponibilidad, crecimiento o éxito.

---

## 14. Gráficos

### 14.1 Series principales

| Serie | Color |
|---|---:|
| Visualizaciones / clicks | `#7aaeff` |
| Consultas / leads | `#e8c96a` |
| QR físico | `#50c878` |
| Link compartido | `#6495ed` |

### 14.2 Tooltip

| Elemento | Valor |
|---|---|
| Fondo | `rgba(18,18,21,.96)` |
| Borde | `rgba(255,255,255,.12)` |
| Título | `#fff` |
| Cuerpo | `rgba(255,255,255,.76)` |
| Fuente | `Inter` |

### 14.3 Leyenda

Reglas:

- `usePointStyle: true`
- `pointStyle: circle`
- texto en `rgba(255,255,255,.7)`
- no usar leyendas que confundan slots con totales.

### 14.4 Ejes

| Elemento | Valor |
|---|---|
| Grilla | `rgba(255,255,255,.05)` |
| Ticks secundarios | `rgba(255,255,255,.35)` / `rgba(255,255,255,.4)` |

Reglas:

- No cambiar cálculos desde una etapa visual.
- No modificar datasets salvo autorización explícita.
- No duplicar canvas.
- No usar colores reservados para series que no correspondan.

---

## 15. Estructura visual premium

### 15.1 Fondo

- Oscuro cálido.
- No negro puro dominante.

### 15.2 Cards

Base recomendada:

```css
background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.02));
border: 1px solid rgba(255,255,255,.07);
border-top: 1px solid rgba(255,255,255,.12);
border-radius: 14px;
backdrop-filter: blur(4px);
```

### 15.3 Header

Base recomendada:

```css
background: rgba(15,14,12,.96);
backdrop-filter: blur(14px);
border-bottom: 1px solid var(--border);
```

### 15.4 Botones de período

Normal:

```css
background: rgba(255,255,255,.05);
border: 1px solid rgba(255,255,255,.09);
color: rgba(255,255,255,.5);
```

Activo:

```css
background: linear-gradient(135deg, rgba(201,168,76,.22), rgba(201,168,76,.08));
border-color: rgba(201,168,76,.42);
color: #e8c96a;
box-shadow: 0 0 14px rgba(201,168,76,.12);
```

### 15.5 KPIs

Reglas:

- Card premium con borde superior más claro.
- Número grande, peso liviano.
- Texto numérico con gradiente blanco.
- Barra lateral fina con color semántico.
- No cambiar el significado del KPI por color decorativo.

Base de número:

```css
background: linear-gradient(135deg, #fff, rgba(255,255,255,.7));
```

### 15.6 Badges

Reglas:

- Fondo con rgba del color semántico.
- Borde con rgba del color semántico.
- Texto uppercase cuando funciona como etiqueta de sistema.
- No usar badges con colores semánticos incorrectos.

### 15.7 Empty states

Base:

```css
color: rgba(255,255,255,.28);
```

Reglas:

- Deben ser sutiles.
- No deben parecer errores.
- No deben competir con KPIs o alertas.

### 15.8 Sistema de profundidad y layering

Estado:

- VIGENTE como lenguaje visual de dashboards modernos.
- OBJETIVO_PENDIENTE en pantallas admin legacy que aún se ven planas.

Reglas:

- No alcanza con copiar HEX: el sistema visual depende de profundidad, capas, bordes, sombras y opacidades.
- Las superficies principales deben separar fondo, card, borde superior y contenido.
- La profundidad debe ser sutil, no “neón” ni gamer.
- El contenido funcional siempre queda por encima de capas decorativas.
- No usar capas que bloqueen clicks, inputs, tablas, mapas, gráficos o acciones.

Orden conceptual:

```txt
fondo oscuro cálido
→ ambient background sutil
→ card / superficie
→ borde superior o glow fino
→ contenido funcional
→ badges / estados / acciones
```

### 15.9 Efectos: glow, blur, sombras

Estado:

- VIGENTE para cards premium, KPIs, headers y módulos destacados.

Reglas:

- Glow: permitido solo como énfasis suave de borde, estado activo o acento premium.
- Blur: permitido para fondos o cards con lectura clara; no debe reducir contraste.
- Sombras: deben reforzar jerarquía, no simular relieve excesivo.
- Gradientes: usar para profundidad y lectura premium, no para inventar significado semántico.
- No aplicar glow a colores reservados si eso cambia el significado visible del dato.

Base recomendada:

```css
box-shadow: 0 18px 52px rgba(0,0,0,.28);
backdrop-filter: blur(4px);
```

### 15.10 Ambient background

Estado:

- VIGENTE como criterio visual de paneles internos modernos.

Reglas:

- El fondo puede tener halos radiales muy sutiles para evitar plano negro.
- El ambient background no debe competir con KPIs, tablas ni gráficos.
- No usar paleta SPORT en dashboards/admin.
- No usar ambient con colores semánticos si el usuario puede interpretarlos como dato.
- El fondo base sigue siendo `#0f0e0c` o una variante oscura cálida compatible.

---

## 16. Mapa

### 16.1 Popup Leaflet

Base recomendada:

```css
background: rgba(8,8,8,.94);
border: 1px solid rgba(201,168,76,.22);
border-radius: 8px;
box-shadow: 0 8px 26px rgba(0,0,0,.42);
backdrop-filter: blur(6px);
```

Reglas:

- No usar colores de estados CRM si el punto representa ubicación, canal o proyecto.
- No usar verde QR para "activo" si no significa QR.
- El color del mapa debe responder al concepto que representa.

---

## 17. Panel pasivo: privacidad visual

El aliado / punto pasivo no debe ver:

- nombre;
- email;
- teléfono;
- mensaje;
- notas;
- `notas_log`;
- actores internos;
- timeline interno completo;
- `contacto_id`;
- `estado_anterior`;
- metadata interna.

Puede ver:

- métricas agregadas;
- estados públicos;
- mes de ingreso;
- movimiento comercial anónimo;
- cantidad por cohorte;
- canal de ingreso QR / link.

---

## 18. Estados públicos panel pasivo

| Estado interno | Label visible | Color |
|---|---|---:|
| `nueva` | Sin avance | `#b39ddb` |
| `contactado` | Contactado | `#35c6b4` |
| `visita` | En visita | `#f29a5a` |
| `descartado` | Descartado | `#7b7f88` |

Reglas:

- No mostrar "cerrado" si no existe dato real.
- No mostrar "conversión" si no existe cierre real.
- No prometer comisión, ganancia o cobro.

---

## 19. SPORT / Excepción Deportiva

### 19.1 Concepto

La "Excepción Deportiva" es un subsistema de color separado del sistema visual institucional. Su propósito es dotar a Sur Patagonia de lenguaje visual de alto impacto para contextos de running, trail, eventos deportivos y merchandising físico, sin contaminar la paleta institucional.

Fuente: análisis comparativo con Nike, Brooks, On Running, HOKA, Salomon y HEAD, realizado por Zcode. Referencia: `docs/auditorias/research-paleta-runner.html`.

### 19.2 Paleta SPORT (8 colores — Excepción Deportiva)

| Nombre | HEX | Referencia de industria |
|---|---:|---|
| Rojo Rush | `#EA3341` | Energía deportiva |
| Volt SP | `#CCFF00` | Signature Brooks / Nike |
| Verde Tóxico | `#39FF14` | Nike Neon Green / Matrix |
| Naranja Fusión | `#FF5C00` | Salomon Ranger Orange |
| Cyan Eléctrico | `#0099E5` | On Running Cerulean |
| Magenta Hyper | `#E0186B` | Nike Hyper Pink / HOKA Acid |
| Lima Neón | `#74EE15` | Verde lima performance |
| Amarillo Volt | `#D4ED00` | HOKA Supernova |

Tokens CSS:

```css
--sport-rojo-rush:      #EA3341;
--sport-volt-sp:        #CCFF00;
--sport-verde-toxico:   #39FF14;
--sport-naranja-fusion: #FF5C00;
--sport-cyan-electrico: #0099E5;
--sport-magenta-hyper:  #E0186B;
--sport-lima-neon:      #74EE15;
--sport-amarillo-volt:  #D4ED00;
```

### 19.3 Regla de uso — Excepción Deportiva

Permitido:

- remeras técnicas;
- gorras runner;
- números de carrera / dorsales;
- bidones y vasos térmicos;
- bandoleras;
- lonas de evento y stands;
- vallas de carrera;
- medallas y premios;
- stickers y parches;
- calzado co-branded;
- ploteos de vehículo en contexto deportivo;
- merchandising físico con perfil corredor.

Prohibido:

- logo institucional digital;
- web, paneles, dashboards;
- documentos internos;
- PDFs;
- propuestas comerciales;
- firma de email;
- tarjetas de presentación;
- facturación.

> En todos los contextos institucionales (web, paneles, documentos) siempre se usa la paleta institucional: `#0f0e0c` + `#c9a84c` + blanco/negro.

### 19.4 Colores SPORT excluidos de la paleta

| Color excluido | Motivo |
|---|---|
| `#C9A84C` Dorado SP | Luxury / institucional, no deportivo |
| `#7AAEFF` Azul visual | Reservado para visualizaciones |
| `#4DFF4D` Verde claro | Redundante con Verde Tóxico y Lima Neón |

### 19.5 Estado operativo — contador pasivo

Color operativo aprobado para el contador pasivo de actividad:

```txt
#6EE89A
```

Reglas adicionales:

- No debe significar comisión, dinero, éxito comercial ni cierre.
- No debe mezclarse con estados CRM.
- No debe reemplazar colores semánticos del sistema institucional.

---

## 20. Isotipo cromático — picos en color

### 20.1 Concepto

El isotipo "picos" puede aplicarse en variantes cromáticas sobre soportes físicos oscuros. Por su naturaleza de forma pura (sin texto), admite color sin perder identidad, similar a marcas como Nike Swoosh, Gymshark o Arc'teryx.

**Estado: exploración pendiente de aprobación vectorial. No oficial como sistema todavía.**

Fuente: análisis de Zcode. Referencia: `docs/auditorias/exploracion-picos-cromaticos.html`. Archivos PNG de muestra: `manual-marca-sp/picos-color/`.

### 20.2 Variantes cromáticas exploradas

Las variantes se evaluaron sobre dos fondos oscuros: negro profundo `#0f0e0c` y gris carbón `#211e1a`.

| Nombre | HEX | Lectura sobre negro | Lectura sobre carbón |
|---|---:|---|---|
| Rojo Intenso | `#EA3341` | ✓ Funciona | ✓ Funciona |
| Amarillo Flúor | `#D4ED00` | ✓ Funciona | ✓ Funciona |
| Verde Matrix | `#39FF14` | ✓ Funciona | ✓ Funciona |
| Dorado SP | `#C9A84C` | ✓ Funciona | ⚠ Flojo — preferir negro |
| Azul Visual | `#7AAEFF` | ✓ Funciona | ✓ Funciona |
| Magenta Neón | `#E0186B` | ✓ Funciona | ✓ Funciona |
| Verde Claro | `#4DFF4D` | ✓ Funciona | ✓ Funciona |

### 20.3 Reglas de aplicación física

- Sin glow, sin halo, sin degradado de luz — corte limpio entre color y fondo.
- Solo sobre fondos oscuros: `#0f0e0c` o `#211e1a`.
- No aplicar filtros CSS al logo institucional — los archivos cromáticos son PNG propios generados por separado.
- Para producción real: generar desde archivos vectoriales **SVG/EPS** aprobados por dirección.
- Dorado SP (`#C9A84C`) solo sobre negro profundo, no sobre carbón.

### 20.4 Contextos de uso

Permitido (cuando estén aprobadas variantes vectoriales):

- gorra bordada;
- remera serigrafiada;
- vaso térmico láser-grabado;
- ploteo de vehículo;
- lona de evento;
- tarjeta black premium;
- sticker y vidriera.

Prohibido:

- usar filtros CSS para recolorear el isotipo institucional en producción web;
- presentar variante cromática como oficial sin aprobación vectorial;
- aplicar más de un color por pieza (isotipo = un color por soporte).

---

## 21. Logo y marca

### 21.1 Carpeta organizada oficial — `assets/logos/`

Carpeta canonical para activos de logo organizados. Usar estos archivos como referencia primaria para implementaciones nuevas.

| Archivo | Variante | Uso recomendado |
|---|---|---|
| `assets/logos/logo-horizontal-blanco.png` | Horizontal blanco | Sobre fondos oscuros |
| `assets/logos/logo-horizontal-negro.png` | Horizontal negro | Sobre fondos claros |
| `assets/logos/logo-vertical-blanco.png` | Vertical blanco | Sobre fondos oscuros |
| `assets/logos/logo-vertical-negro.png` | Vertical negro | Sobre fondos claros |
| `assets/logos/picos-blanco.png` | Isotipo blanco | Sobre fondos oscuros |
| `assets/logos/picos-negro.png` | Isotipo negro | Sobre fondos claros |

### 21.2 Activos legacy verificados (raíz del proyecto)

Activos existentes en raíz — mantener compatibilidad con código actual que los referencia, pero no usar en implementaciones nuevas.

| Archivo | Dimensión | Estado |
|---|---|---|
| `logohorizontal.png` / `.webp` | 1600×205 | Legacy — mantener |
| `logohorizontalnegro.png` / `.webp` | 1600×205 | Legacy — mantener |
| `logovertical.png` / `.webp` | 1600×800 | Legacy — mantener |
| `logoverticalnegro.png` / `.webp` | 1046×444 | Legacy — mantener |
| `picos.png` / `.webp` | 918×613 | Legacy — mantener |
| `assets/logohorizontalnegro.png` | 1600×205 | Duplicado legacy |
| `assets/logoverticalnegro.png` | 1046×444 | Duplicado legacy |
| `assets/PICOS.png` | 394×225 | Isotipo reducido legacy |

> `assets/logo.png` = archivo de 1 byte. **No es imagen utilizable. No usar.**

Reglas:

- No deformar el logo.
- No cambiar color salvo variante autorizada.
- No cambiar filtro u opacidad salvo brief explícito.
- No reconstruir logo con texto si hay activo oficial.
- No inventar una variante oficial.
- No tocar fondo si el cambio autorizado era solo tamaño.
- Sobre fondo oscuro: `filter: brightness(0) invert(1)` para volverlo blanco. Opacidad: `0.88`.

---

## 22. Reglas de alcance para etapas visuales

En cambios visuales **no se debe tocar**:

- Supabase;
- queries;
- RLS;
- auth;
- tracking;
- QR logic;
- descargar QR;
- copiar link;
- rutas;
- Service Worker;
- `_headers`;
- KPIs funcionales;
- cálculos;
- datos productivos;
- módulos ajenos al brief.

Solo se puede tocar, si el brief lo autoriza:

- CSS visual;
- variables/tokens de color;
- datasets visuales de Chart.js;
- tooltips/ejes/leyendas;
- orden visual o layout explícitamente autorizado.

No se permite:

- refactor general;
- rediseño completo;
- cambiar semántica del dato;
- reutilizar un HEX para otro concepto;
- inventar estados;
- inventar métricas;
- mostrar datos personales donde no corresponde.

---

## 23. Checklist de auditoría visual

Antes de aprobar un cambio visual, verificar:

1. ¿Respeta "un HEX = un concepto visible"?
2. ¿Evita colores reservados para conceptos distintos?
3. ¿Mantiene Inter / Cormorant según el uso actual?
4. ¿Mantiene estética oscura premium?
5. ¿No toca datos, queries, Supabase, tracking ni lógica?
6. ¿No afecta paneles fuera del alcance?
7. ¿No introduce colores random?
8. ¿No inventa estados, métricas ni promesas comerciales?
9. ¿Mantiene QR, link, tracking y rutas intactos salvo brief específico?
10. ¿Pasa syntax check cuando corresponde?

---

## 24. Criterio de aprobación

Un cambio visual puede aprobarse si:

- es mínimo;
- respeta esta gobernanza;
- no altera lógica funcional;
- no rompe privacidad;
- no introduce ambigüedad semántica;
- no afecta módulos fuera del alcance;
- mantiene coherencia con el sistema visual actual.

Debe rechazarse si:

- mezcla colores semánticos;
- cambia datos o cálculos sin autorización;
- toca Supabase/tracking/rutas fuera del brief;
- expone datos personales;
- rompe QR/link canónico;
- genera una variante visual no gobernada;
- introduce colores no documentados.

---

## 25. Estado pendiente para formalización futura

Para convertir este documento en parte definitiva del sistema rector, queda pendiente:

- separar tokens oficiales de tokens legacy;
- confirmar variantes de logo faltantes vs aprobadas en `assets/logos/`;
- decidir si `#d76f3f` queda como accent de marca o uso comercial específico;
- revisar colores de paletas extensas contra accesibilidad;
- definir una fuente única de tokens compartidos para evitar duplicación entre HTMLs;
- crear checklist de implementación para Cloud / Zcode / Codex;
- aprobar variantes vectoriales SVG/EPS del isotipo cromático para producción física;
- confirmar qué variantes SPORT quedan autorizadas para cada tipo de soporte físico.

---

## 26. Referencias canónicas de implementación

Estado:

- VIGENTE como criterio de auditoría visual.

Referencias principales:

```txt
colaboradores/index.html = referencia canónica para panel activo y panel pasivo.
colaboradores/desarrollador.html = referencia canónica para panel desarrollador.
```

Reglas:

- No alcanza con copiar HEX.
- Al migrar estética entre paneles se debe copiar el tratamiento visual completo:
  - gradientes;
  - profundidad;
  - blur;
  - glow;
  - sombras;
  - bordes elevados;
  - opacidades;
  - jerarquía;
  - chips;
  - pills;
  - tooltips;
  - gráficos;
  - logo real.
- Cualquier pantalla nueva o migración admin debe auditarse contra esas referencias, sin alterar lógica ni datos.

---

## 27. Logo en paneles internos y admin

Estado:

- VIGENTE como regla de marca.
- OBJETIVO_PENDIENTE donde todavía exista logo reconstruido con texto.

Reglas:

- En paneles internos/admin, el logo debe ser activo real `<img>`, no texto reconstruido.
- Fuente de activos para implementaciones nuevas:

```txt
assets/logos/
```

- No inventar ubicación nueva.
- No deformar el logo.
- No cambiar color, filtro u opacidad salvo brief explícito.
- No reconstruir con HTML/texto si existe activo oficial.

No válido salvo excepción explícita ya autorizada:

```html
<div class="logo">SUR <span>PATAGONIA</span></div>
```

---

## 28. Identidad persistente de canal — reglas cross-panel

Estado:

- VIGENTE como regla del sistema.
- OBJETIVO_PENDIENTE en pantallas que todavía no consumen `color_index`.

Reglas:

- El color de identidad de un canal debe ser consistente en todos los paneles.
- Debe venir de `color_index` / `PALETA_CANALES`.
- No se hardcodea en CSS.
- Requiere JS + CSS cuando el color depende de datos.
- Si todavía no está implementado, usar neutro provisional.
- La fuente única para colores individuales de canal es `docs/gobernanza/paleta-canales.md`.

Prohibido:

- usar colores reservados para identidad de canal;
- mezclar identidad de canal con tipo de canal;
- mezclar identidad de canal con estado CRM;
- recalcular por hash visual si existe `color_index` persistido.

---

## 29. Estado activo de canal vs QR activo

Estado:

- VIGENTE.

Regla:

```txt
Canal activo ≠ QR activo.
```

Colores:

| Concepto | Color |
|---|---:|
| Canal activo | `#52d68c` |
| QR físico / scan / QR activo | `#50c878` |

Reglas:

- No usar `#50c878` para canal activo en tablas admin.
- No usar `#52d68c` para QR físico.
- Si una pantalla legacy usa verde QR para activo, marcar como deuda técnica y no replicar.

---

## 30. Chips y pills para gráficos comparativos

Estado:

- VIGENTE como patrón visual.
- OBJETIVO_PENDIENTE donde todavía no exista integración con `color_index`.

Reglas:

- Chips de canal usan `var(--ch)`, alimentado por `color_index`.
- Estado activo del chip usa `border-color: var(--ch)`.
- No usar colores reservados para chips de identidad de canal.
- Los chips pueden usar opacidad del color de canal para fondo, manteniendo lectura en oscuro.
- Si el color no está disponible desde datos, usar neutro provisional.

Ejemplo conceptual:

```css
.chip-canal {
  --ch: color-de-canal-desde-color-index;
  border-color: var(--ch);
  background: color-mix(in srgb, var(--ch) 14%, transparent);
}
```

No aplicar este ejemplo en producción sin verificar compatibilidad y alcance del browser objetivo.

---

## 31. Admin — reglas específicas de capa visual

Estado:

- VIGENTE para `ADMIN-VISUAL-GOV-01`.

Reglas:

- `css/admin-theme.css` es capa visual de override del admin.
- Debe cargarse después de `css/estilos.css` y después del `<style>` local de cada pantalla autorizada.
- No reemplaza `css/estilos.css`.
- No debe contener JS.
- No debe tener `@import`.
- No debe usar `!important` salvo autorización excepcional.
- La extensión a otras pantallas admin debe hacerse pantalla por pantalla.
- No se debe tocar `admin/crm.html`, `admin/contactos.html` ni `admin/canales.html` sin aprobación explícita de Mariano.

---

## 32. Separación de etapas CSS vs JS

Estado:

- VIGENTE como criterio de alcance técnico.

| Necesidad visual | Capa correcta |
|---|---|
| Profundidad, gradientes, glow, sombras | CSS puro |
| Ambient background | CSS puro |
| Cards premium, bordes, blur | CSS puro |
| Color individual de canal con `color_index` | JS + CSS |
| Canal activo por dato `activo:true` | JS + CSS |
| Chips por color de canal | JS + CSS |
| Chart.js datasets visuales | JS, solo con autorización explícita |

Reglas:

- No simular dato dinámico con CSS fijo.
- No resolver identidad de canal con un color hardcodeado global.
- Si una mejora requiere datos (`color_index`, `activo`, tipo de canal), documentar como OBJETIVO_PENDIENTE hasta tener etapa JS autorizada.

---

## 33. Deuda técnica visual conocida

Estado:

- OBJETIVO_PENDIENTE.
- Esta sección documenta deuda; no autoriza implementación.

### `admin/canales.html`

- Usa `#6495ed` para `tipo-inmobiliaria`, pero `#6495ed` es link compartido.
- Usa `#50c878` para `tipo-punto_venta`, pero `#50c878` es QR físico.
- Usa `#50c878` para `.activo`, pero canal activo debe ser `#52d68c`.
- Archivo con restricción absoluta; no tocar sin aprobación explícita.

### `admin/contactos.html`

- Pendiente homologar cards, tablas, chips y profundidad.
- Archivo con restricción absoluta; no tocar sin aprobación explícita.

### `admin/dashboard.html`

- Pendiente logo real si aún usa texto reconstruido.
- Color individual por canal con `color_index` queda para etapa futura.

### `css/admin-theme.css`

- Capa piloto.
- No extender a otras pantallas sin auditoría visual y técnica.

---

## Referencias cruzadas

- Paleta de identidad de canales (54 colores, 25 familias): `docs/gobernanza/paleta-canales.md`
- Stack técnico y flujo de deploy: `docs/gobernanza/deploy.md`
- Auditorías y briefs históricos: `docs/auditorias/`
