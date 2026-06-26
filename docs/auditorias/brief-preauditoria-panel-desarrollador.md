# Brief para ChatGPT — Preauditoría técnica Sur Patagonia

Necesito preparar una implementación posterior sobre el **panel de desarrolladores** de Sur Patagonia, reutilizando exactamente el sistema visual ya establecido en el **panel activo**.

No implementar todavía. Analizar este mapa técnico y proponer una implementación por etapas pequeñas, conservadora y sin romper lógica.

## Archivos principales

Panel activo / colaboradores:

`colaboradores/index.html`

Panel desarrollador:

`colaboradores/desarrollador.html`

Archivos relacionados:

- `colaboradores/login.html`
- `colaboradores/manifest.json`
- `colaboradores/sw.js`
- `js/panel-config.js`

## Librerías

Ambos paneles usan:

- Chart.js `4.4.0`
- Leaflet `1.9.4`
- Supabase JS v2
- Google Fonts: `Inter`, `Cormorant Garamond`

Solo el panel activo usa:

- `qrcode@1.5.3`

Ambos paneles son HTML monolíticos con CSS y JS inline.

## Objetivo

Adaptar el **panel de desarrolladores** para que reutilice la estética, jerarquía visual y sistema de interacción ya consolidado en el **panel activo**, sin cambiar Supabase, RLS, tracking, autenticación, rutas ni datos.

## Fuente visual de verdad: panel activo

Archivo:

`colaboradores/index.html`

### Tokens visuales exactos

```css
--bg: #0f0e0c;
--card: #161513;
--border: rgba(255,255,255,0.07);
--accent: #d76f3f;
--dorado: #c9a84c;
--verde: #50c878;
--gris: #aaa;
--blanco: #f5f3f0;
--rojo: #e05c5c;
```

### Colores funcionales

- Visualizaciones / total gráfico: `#7aaeff`
- Consultas en gráfico: `#e8c96a`
- QR físico: `#50c878`
- Link compartido: `#6495ed`
- Blanco roto / total textual: `#f5f3f0`
- Verde activo / alta actividad: `#50c878`
- Verde glow vivo: `#6ee89a`

### Colores reservados

No deben usarse para canales/slots individuales:

```js
const COLOR_TOTAL_GENERAL    = '#f5f3f0'
const COLOR_TOTAL_GRAFICO    = '#7aaeff'
const COLOR_QR_FISICO        = '#50c878'
const COLOR_LINK_COMPARTIDO  = '#6495ed'
```

Consultas, cuando sea serie propia, usa:

```js
#e8c96a
```

### Paleta de slots/canales individuales

```js
const SLOT_PALETTE = [
  '#ff4088',
  '#d030c0',
  '#8820c0',
  '#c890f0',
  '#8e1f63',
  '#ff4a5a',
  '#ff6830',
  '#b840e0',
]
```

La asignación es determinística por código usando `colorDeSlot(codigo)`.

## Componentes duplicados

Actualmente el panel activo y el panel desarrollador tienen componentes similares pero duplicados.

### Cards / KPIs

Activo:

- `.pv-kpi`
- `.pv-kpi-grid`
- `.pv-kpi-label`
- `.pv-kpi-n`
- `.pv-kpi-sub`

Desarrollador:

- `.kpi`
- `.kpi-row`
- `.kpi-lbl`
- `.kpi-n`
- `.kpi-m`

Recomendación: usar en desarrollador la misma jerarquía visual del activo.

### Botones de período

Activo:

- `.pv-flt-btn`
- `.pv-flt-custom`
- `.pv-fecha-input`
- `.pv-aplicar`

Desarrollador:

- `.btn-p`
- `.flt-btn`
- `.evol-fecha`
- `.evol-aplicar`

Recomendación: homologar estados, hover, activo, radios, padding y gradientes.

### Secciones / cards

Activo:

- `.pv-sec`
- `.pv-sec-head`
- `.pv-sec-titulo`
- `.pv-sec-sub`

Desarrollador:

- `.card`
- `.sec-blk`
- `.sec`
- `.sec-t`
- `.sec-b`

Recomendación: reutilizar gradientes, bordes, radios y opacidades del activo.

### Tablas

Activo:

- `.pv-tabla`
- `.tabla`

Desarrollador:

- `.canal-tbl`
- `.leads-tbl`

Recomendación: homologar encabezados, filas, hover, color de bordes y mobile.

### Pipeline

Activo:

- `.pv-pipeline`
- `.pv-pipe-step`
- `.pv-pipe-ico`
- `.pv-pipe-n`
- `.pv-pipe-label`

Desarrollador:

- `.pipeline`
- `.pipe-flow`
- `.pipe-stage`
- `.pipe-n`
- `.pipe-lbl`

Recomendación: copiar jerarquía visual del activo, sin cambiar la lógica CRM.

## Selector temporal

### Panel activo

Tiene:

- Hoy
- 7 días
- 30 días
- Personalizado

Funciones:

```js
pvSetPeriodo(btn)
pvAplicarFechas()
actualizarKpisActivo(desde, hasta)
actualizarSlotCards(desde, hasta)
renderSlotMiniCharts(desde, hasta, labelPeriodo)
renderGraficoPasivo(contactos, dias, desdeCustom, hastaCustom, opciones)
```

El personalizado usa fecha local correctamente:

```js
const fechaLocal = val => {
  const [y,m,d] = val.split('-').map(Number)
  return new Date(y, m-1, d)
}
```

### Panel desarrollador

Actualmente tiene selector general:

- 30 días
- 60 días
- 90 días
- Todo el tiempo

Función:

```js
setPeriodo(btn)
```

Y además el gráfico de evolución tiene selector propio:

- Diario
- Semanal
- Mensual
- 3 meses
- 6 meses
- Personalizado

Funciones:

```js
cambiarPeriodoEvolucion(periodo)
aplicarRangoEvolucion()
obtenerRangoEvolucion()
renderEvolucion()
```

### Estado actual del período en desarrollador

Responden al período general:

- KPIs
- Tabla de canales
- Bar chart Clicks/Leads
- Mapa territorial
- Pipeline CRM
- Últimas consultas

No responden al período general:

- Termómetro comercial: hardcodeado a últimos 30 días
- Feed actividad reciente: usa eventos globales recientes
- Evolución de actividad: tiene selector propio
- Lotes: inventario estático, no corresponde que responda al período

## Gráficos

### Evolución de actividad

Panel activo:

```js
renderGraficoPasivo()
```

Usa:

- Total / visualizaciones: `#7aaeff`
- Consultas: `#e8c96a`
- Slots: `colorDeSlot(codigo)`
- Tooltips oscuros premium
- Leyenda con `usePointStyle`
- Ejes sutiles
- Grid muy suave

Panel desarrollador:

```js
renderEvolucion()
```

Datos:

```js
dataV = _visitas
dataC = _contactos
```

Confirmación semántica:

- Clicks / lecturas / visualizaciones = registros de `visitas`
- Leads / consultas = registros de `contactos`

### Clicks/Leads por canal

Panel desarrollador:

```js
renderDynamic()
```

Chart actual:

```js
type: 'bar'
```

Datos:

```js
labels: top8.map(c => c.nombre?.length>14 ? c.nombre.slice(0,14)+'…' : c.nombre||'—')

Clicks:
data: top8.map(c => c.clicks)

Leads:
data: top8.map(c => c.leads)
```

Para convertir a barras horizontales sin cambiar datos:

```js
type: 'bar',
options: {
  indexAxis: 'y'
}
```

También conviene:

- quitar o ampliar truncado de nombres;
- aumentar altura del contenedor si hay muchos canales;
- mantener los mismos datasets;
- mantener tooltips y colores.

Problema actual: el gráfico vertical fuerza nombres cortados y puede generar espacios muertos visuales.

## Mapa territorial

Panel desarrollador:

```js
renderMapaArgentina()
```

Librería:

```js
Leaflet
```

Datos usados:

- `canales.latitud`
- `canales.longitud`
- `c.clicks`
- `c.leads`

Métrica de tamaño:

```js
actividad = c.clicks + c.leads
intensidad = actividad / maxActividad
size = Math.round(10 + (14 * intensidad))
```

Color actual: no usa color propio de canal. Calcula color por intensidad:

```js
const r = Math.round(100 + (101 * intensidad))
const g = Math.round(149 + (19 * intensidad))
const b = Math.round(237 - (161 * intensidad))
const color = `rgb(${r},${g},${b})`
```

Interacción actual:

- Hover escala el punto con `onmouseenter/onmouseleave`.
- Popup informativo usa `bindPopup()`, por lo tanto requiere clic.

Para tooltip hover, sin implementar todavía:

- opción conservadora: `bindTooltip(...)`;
- opción popup-hover: `mouseover -> openPopup()`, `mouseout -> closePopup()`.

Halo/pulso: ya existe `box-shadow` si hay actividad. Puede agregarse pulso suave solo para puntos activos, cuidando performance.

## Privacidad

### Panel activo

Trae contactos con:

```js
select('*')
```

Muestra:

- nombre codificado;
- extractos de `mensaje`.

Ejemplo: muestra `c.mensaje.slice(...)`.

### Panel desarrollador

Trae contactos con:

```js
select('id, created_at, nombre, canal_ref, estado')
```

No trae `mensaje`.

No muestra contenido de mensajes de consultas.

Para mantener privacidad sin romper Pipeline CRM, el panel desarrollador necesita solo:

- `id`
- `created_at`
- `canal_ref`
- `estado`
- opcionalmente `nombre` si se decide mostrarlo, idealmente anonimizado

Pipeline CRM necesita:

- `estado`
- `created_at`
- `canal_ref`

No necesita contenido del mensaje.

## Módulo de lotes

Panel desarrollador.

Funciones:

```js
renderInventario()
renderMapaLotesDash()
```

Datos desde `proyectos`:

```js
id
nombre
foto_fondo
mapa_imagen_url
mapa_activo
mapa_pin_estilo
```

Datos desde `lotes`:

```js
numero
tipo_lote
estado
mapa_x
mapa_y
```

Problemas detectados:

- mezcla inventario, zonas y mapa en una misma lógica;
- estados hardcodeados: `vendido`, `reservado`, `disponible`;
- `tipo_lote` se usa como zona;
- no hay normalización de estados alternativos;
- no hay superficie, precio, manzana, etapa ni orden explícito;
- colores de zonas usan otra paleta (`ZONA_COLORS` + `FALLBACK`);
- no responde al período, y está bien: es inventario estático.

No reconstruir todavía el módulo completo.

## Riesgos

Riesgos de regresión:

1. Fechas: evitar `new Date('YYYY-MM-DD')` por corrimiento de día. Usar fecha local.
2. Selectores: el desarrollador tiene selector general y selector propio de evolución. No mezclarlos sin decisión explícita.
3. Chart.js: destruir charts previos antes de crear nuevos para evitar `canvas already in use`.
4. Leaflet: destruir/remover mapa previo antes de recrear.
5. `_canalMap`: se muta en `renderDynamic()`. El mapa, tabla y gráficos dependen de ese recalculo.
6. Privacidad: no llevar `mensaje` al panel desarrollador.
7. Performance: el desarrollador carga `visitas.limit(50000)` y `contactos.limit(5000)`.
8. Upload manual: no mezclar cambios de `colaboradores/index.html` con cambios de `colaboradores/desarrollador.html`.

## Módulos que NO deben tocarse salvo etapa específica

- Supabase client
- RLS
- Auth/login
- Tracking
- Rutas
- Service worker
- Manifest
- QR
- Descargar QR
- Copiar link
- Queries base
- Datos productivos

## Propuesta de implementación por etapas pequeñas

### Etapa 1 — Tokens visuales

Copiar al panel desarrollador los tokens visuales exactos del panel activo:

- colores;
- fondos;
- bordes;
- radios;
- sombras;
- tipografías;
- opacidades;
- estados hover/activo.

No tocar lógica.

### Etapa 2 — Componentes visuales

Homologar en desarrollador:

- cards;
- KPIs;
- tablas;
- botones;
- filtros;
- badges;
- empty states;
- pipeline visual.

No cambiar datos ni cálculos.

### Etapa 3 — Selector temporal general

Cambiar selector del desarrollador a:

- Hoy
- 7 días
- 30 días
- 90 días
- Personalizado

Asegurar que usen el mismo período:

- KPIs;
- tabla canales;
- chart Clicks/Leads;
- mapa;
- pipeline;
- últimas consultas.

No tocar todavía evolución si se decide mantener selector propio.

### Etapa 4 — Evolución de actividad

Decidir una opción:

A. Mantener selector propio y aclararlo visualmente.

B. Hacer que responda al selector general.

No hacer ambas cosas ambiguas.

### Etapa 5 — Bar chart horizontal

Convertir Clicks/Leads por canal a barras horizontales:

```js
indexAxis: 'y'
```

Mantener datos, colores y tooltips.

Corregir truncado de nombres y altura del contenedor.

### Etapa 6 — Mapa

Agregar tooltip hover.

Evaluar:

- halo;
- pulso suave;
- color por canal;
- mantener tamaño por actividad.

No cambiar queries.

### Etapa 7 — Privacidad

Confirmar que el desarrollador no trae ni muestra `mensaje`.

Opcional: anonimizar nombre o mostrar solo metadatos.

### Etapa 8 — Lotes

Solo limpieza visual mínima.

No reconstruir completo todavía.

## Pruebas posteriores obligatorias

Después de implementar:

1. `node --check` OK.
2. Sin errores de Chart.js.
3. Sin errores de Leaflet.
4. No duplicar mapas.
5. No error `canvas already in use`.
6. Mobile OK.
7. Selector temporal probado:
   - Hoy
   - 7 días
   - 30 días
   - 90 días
   - personalizado
8. KPIs coinciden con período.
9. Bar chart coincide con tabla.
10. Mapa usa actividad del período.
11. Pipeline usa consultas del período.
12. Últimas consultas usa período.
13. Evolución no queda ambigua.
14. No se muestra contenido de mensajes en desarrollador.
15. No se modificó Supabase/RLS/auth/tracking/rutas.
