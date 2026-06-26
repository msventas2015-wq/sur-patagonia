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

Reglas:

- No debe coincidir con colores reservados de KPIs.
- No debe coincidir con estados CRM.
- No debe coincidir con eventos/fuentes.
- La asignación debe ser determinística por `color_index` persistido en tabla `canales`.
- Debe evitar colisiones visibles mientras haya colores libres.

Paleta completa (54 colores, 25 familias) — ver `paleta-canales.md` para especificación completa con nombres, familias y algoritmo de asignación.

Orden de asignación (máxima separación perceptual):

```txt
#3a4eb8
#c0603e
#2a9d7a
#c040a0
#c08a2e
#1e5fa0
#7a1f2e
#3eb489
#7b3fb0
#b87333
#1d7a8c
#d20c5c
#8c7853
#1f4ed8
#a0c850
#d65d7a
#1a7a7a
#a86fb5
#dc143c
#a89878
#8a7d72
#5d2e5d
#d4ed00
#6b7a2c
#ff6b5b
#39ff14
#2c3e9c
#a8512f
#1f8473
#a82c8f
#cc9333
#2a6db5
#8b2236
#4fca9e
#6b3fa0
#c8843e
#0f6e80
#e0186b
#a0825d
#2e5cb8
#bcd96e
#c94869
#0d6b6b
#b87fc0
#e63946
#6b3470
#e6f23a
#7a8a3e
#e85a4f
#4dff4d
#4556a8
#3aa68a
#9c2740
#8a5fc4
```

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

## 19. SPORT / contador pasivo

Paleta SPORT disponible como acento visual:

```css
--sport-rojo-rush: #EA3341;
--sport-volt-sp: #CCFF00;
--sport-verde-toxico: #39FF14;
--sport-naranja-fusion: #FF5C00;
--sport-cyan-electrico: #0099E5;
--sport-magenta-hyper: #E0186B;
--sport-lima-neon: #74EE15;
--sport-amarillo-volt: #D4ED00;
```

Reglas:

- Puede usarse como acento de impacto visual.
- No debe significar comisión, dinero, éxito comercial ni cierre.
- No debe mezclarse con estados CRM.
- No debe reemplazar colores semánticos del sistema.

Estado operativo aprobado para contador pasivo:

```txt
#6EE89A
```

---

## 20. Logo y marca

Activos oficiales verificados:

| Archivo | Dimensión | Uso |
|---|---|---|
| `logohorizontal.png` / `.webp` | 1600×205 | Logo horizontal — fondo oscuro |
| `logohorizontalnegro.png` / `.webp` | 1600×205 | Logo horizontal — versión negra |
| `logovertical.png` / `.webp` | 1600×800 | Logo vertical — fondo oscuro |
| `logoverticalnegro.png` / `.webp` | 1046×444 | Logo vertical — versión negra |
| `picos.png` / `.webp` | 918×613 | Isotipo / picos |
| `assets/logohorizontalnegro.png` | 1600×205 | Duplicado en assets |
| `assets/logoverticalnegro.png` | 1046×444 | Duplicado en assets |
| `assets/PICOS.png` | 394×225 | Isotipo reducido |

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

## 21. Reglas de alcance para etapas visuales

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

## 22. Checklist de auditoría visual

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

## 23. Criterio de aprobación

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

## 24. Estado pendiente para formalización futura

Para convertir este documento en parte definitiva del sistema rector, queda pendiente:

- separar tokens oficiales de tokens legacy;
- definir qué colores SPORT quedan realmente autorizados;
- confirmar variantes de logo faltantes vs aprobadas;
- decidir si `#d76f3f` queda como accent de marca o uso comercial específico;
- revisar colores de paletas extensas contra accesibilidad;
- definir una fuente única de tokens compartidos para evitar duplicación entre HTMLs;
- crear checklist de implementación para Cloud / Zcode / Codex.

---

## Referencias cruzadas

- Paleta de identidad de canales (54 colores, 25 familias): `docs/gobernanza/paleta-canales.md`
- Stack técnico y flujo de deploy: `docs/gobernanza/deploy.md`
- Auditorías y briefs históricos: `docs/auditorias/`
