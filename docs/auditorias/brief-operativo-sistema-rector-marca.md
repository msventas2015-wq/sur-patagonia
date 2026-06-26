# Brief operativo — Sistema Rector de Marca, Comunicación y Experiencia Digital de Sur Patagonia

## Estado

Brief madre leído y procesado.  
Este documento convierte el pedido general en un plan técnico-operativo para avanzar sin improvisar marca, sin tocar producción y sin crear variantes visuales no aprobadas.

No se modificó código.  
No se modificó Supabase.  
No se modificaron rutas, autenticación, tracking, RLS ni datos.

## Objetivo del proyecto

Construir un **Manual de Marca y Sistema Visual v1.0** que funcione como única fuente de verdad para:

- sitio web;
- panel activo;
- panel desarrollador;
- admin;
- miniwebs;
- mapas;
- gráficos;
- documentos;
- PDFs;
- presentaciones;
- propuestas comerciales;
- piezas con QR;
- señalética;
- indumentaria;
- merchandising;
- comunicaciones internas y externas;
- trabajos hechos por personas o inteligencias artificiales.

El resultado no debe ser solo un PDF visual. Debe convertirse también en:

- reglas;
- tokens;
- activos organizados;
- componentes reutilizables;
- criterios de gobernanza;
- plantillas;
- protocolo para IA y colaboradores.

## Fuente de verdad, en orden de prioridad

1. Activos oficiales de marca.
2. Decisiones expresamente aprobadas.
3. Sistema visual de los paneles más recientes.
4. Valores técnicos verificados en el código.
5. Contenido histórico del sitio solo si no contradice lo anterior.

## Referencias visuales canónicas actuales

Las referencias visuales principales son:

1. Últimos cambios implementados en el panel activo.
2. Reglas actualmente definidas para el panel desarrollador.
3. Activos oficiales de logo suministrados.
4. Decisiones aprobadas durante este proceso.

Las partes antiguas del sitio pueden usarse para entender contenido y funcionalidad, pero no como referencia visual principal.

## Archivos revisados como fuente técnica inicial

Panel activo:

`/Users/marianosylvester/Downloads/sur-patagonia-main 2/colaboradores/index.html`

Panel desarrollador:

`/Users/marianosylvester/Downloads/sur-patagonia-main 2/colaboradores/desarrollador.html`

Config visual compartida:

`/Users/marianosylvester/Downloads/sur-patagonia-main 2/js/panel-config.js`

Activos de marca detectados:

```text
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logohorizontal.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logohorizontal.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logohorizontalnegro.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logohorizontalnegro.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logovertical.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logovertical.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logoverticalnegro.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/logoverticalnegro.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/picos.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/picos.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/logohorizontalnegro.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/logohorizontalnegro.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/logoverticalnegro.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/logoverticalnegro.webp
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/PICOS.png
/Users/marianosylvester/Downloads/sur-patagonia-main 2/assets/PICOS.webp
```

## Hallazgo sobre activos de logo

Variantes válidas detectadas:

| Archivo | Dimensión | Estado |
|---|---:|---|
| `logohorizontal.png` | 1600 × 205 | válido |
| `logohorizontalnegro.png` | 1600 × 205 | válido |
| `logovertical.png` | 1600 × 800 | válido |
| `logoverticalnegro.png` | 1046 × 444 | válido |
| `picos.png` | 918 × 613 | válido |
| `assets/logohorizontalnegro.png` | 1600 × 205 | válido |
| `assets/logoverticalnegro.png` | 1046 × 444 | válido |
| `assets/PICOS.png` | 394 × 225 | válido |

Archivo problemático:

| Archivo | Estado |
|---|---|
| `assets/logo.png` | archivo de 1 byte; no es una imagen utilizable |

Recomendación:

- No usar `assets/logo.png` como fuente oficial.
- Marcarlo como activo defectuoso o placeholder.
- Confirmar cuáles variantes son oficialmente aprobadas antes de documentarlas como oficiales.

## Tokens visuales verificados en código

Desde panel activo y panel desarrollador:

```css
--bg: #0f0e0c;
--accent: #d76f3f;
--dorado: #c9a84c;
--verde: #50c878;
--blanco: #f5f3f0;
```

Desde panel activo:

```css
--card: #161513;
--border: rgba(255,255,255,0.07);
--gris: #aaa;
--rojo: #e05c5c;
```

Desde panel desarrollador:

```css
--card: rgba(255,255,255,0.025);
--card2: rgba(255,255,255,0.04);
--border: rgba(255,255,255,0.07);
--azul: #7aaeff;
--gris: #aaa;
--gris2: #666;
--rojo: #993C1D;
--rojo-v: #e05c5c;
```

## Colores semánticos verificados

| Uso | Color |
|---|---|
| Fondo digital principal | `#0f0e0c` |
| Blanco roto | `#f5f3f0` |
| Naranja / consultas / leads | `#d76f3f` |
| Dorado institucional | `#c9a84c` |
| Verde activo / positivo | `#50c878` |
| Azul visualizaciones / actividad principal | `#7aaeff` |
| Link compartido reservado | `#6495ed` |
| Consultas como serie propia en gráfico | `#e8c96a` |
| Verde glow vivo | `#6ee89a` |

## Colores reservados del panel activo

```js
const COLOR_TOTAL_GENERAL    = '#f5f3f0'
const COLOR_TOTAL_GRAFICO    = '#7aaeff'
const COLOR_QR_FISICO        = '#50c878'
const COLOR_LINK_COMPARTIDO  = '#6495ed'
```

Regla:

- Ninguna propiedad, canal, loteo, desarrollo o URL individual debe usar colores reservados.
- Consultas, cuando actúe como serie propia, debe mantenerse diferenciada con `#e8c96a`.

## Paleta individual de slots/canales detectada

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

Regla:

- La asignación debe ser determinística por código.
- No debe solaparse con total, QR físico, link compartido ni consultas.
- No debe crear pares visualmente demasiado parecidos cuando aparecen juntos.

## Tipografías verificadas

```text
Inter
Cormorant Garamond
```

Uso actual:

- `Inter`: interfaz, paneles, KPIs, tablas, gráficos, documentos digitales.
- `Cormorant Garamond`: recurso de marca, monogramas, algunos títulos o acentos institucionales.

Recomendación:

- El sistema rector debe definir cuándo usar cada una.
- No reconstruir el logo con tipografía similar.
- La tipografía no reemplaza al activo oficial de logo.

## Reglas obligatorias para logo

No reconstruir “SUR PATAGONIA” escribiéndolo con una tipografía parecida cuando corresponda usar el logo.

Regular:

- logo horizontal;
- logo vertical;
- isotipo / picos;
- versión blanca;
- versión negra;
- versión monocromática;
- versión para fondo claro;
- versión para fondo oscuro;
- versión sobre fotografía;
- tamaños mínimos;
- área de protección;
- proporciones;
- usos permitidos;
- usos prohibidos.

Prohibido:

- deformar;
- estirar;
- inclinar;
- recortar;
- alterar espaciado;
- aplicar sombras no aprobadas;
- aplicar contornos no aprobados;
- aplicar degradados no aprobados;
- cambiar colores arbitrariamente;
- reconstruir desde captura.

Si una variante no existe, debe figurar como faltante o candidata para aprobación. No debe presentarse como oficial.

## Componentes que deben normalizarse

Sistema digital:

- cards;
- KPIs;
- botones;
- filtros temporales;
- inputs;
- badges;
- tablas;
- estados vacíos;
- tooltips;
- leyendas;
- gráficos;
- mapas;
- marcadores;
- QR;
- documentos;
- PDFs;
- presentaciones.

## Módulos técnicos relacionados

Panel activo:

- `pvSetPeriodo`
- `pvAplicarFechas`
- `actualizarKpisActivo`
- `actualizarSlotCards`
- `renderSlotMiniCharts`
- `renderGraficoPasivo`
- `renderPanelesActivos`
- `colorDeSlot`

Panel desarrollador:

- `setPeriodo`
- `cambiarPeriodoEvolucion`
- `aplicarRangoEvolucion`
- `obtenerRangoEvolucion`
- `renderEvolucion`
- `renderMapaArgentina`
- `renderMapaLotesDash`
- `renderInventario`
- `renderDynamic`

## Entregables finales esperados

1. Manual de Marca visual.
2. Sistema Visual Digital.
3. Manual de uso de logos.
4. Matriz para elegir el logo correcto.
5. Paleta institucional y paleta semántica.
6. Tipografías y jerarquías.
7. Sistema de gráficos y visualización de datos.
8. Sistema de mapas y marcadores.
9. Normas para documentos y PDFs.
10. Normas para presentaciones.
11. Normas para redes y piezas con QR.
12. Normas para merchandising e indumentaria.
13. Ejemplos correctos e incorrectos.
14. Protocolo obligatorio para IA y colaboradores.
15. Tokens CSS y JSON.
16. Biblioteca organizada de activos.
17. Plantillas reutilizables.
18. Sistema de versiones y registro de cambios.

## Aplicaciones visuales que deberán mostrarse

- logo horizontal sobre fondo claro y oscuro;
- logo vertical sobre fondo claro y oscuro;
- picos sobre fondo claro y oscuro;
- uso sobre fotografías;
- usos incorrectos;
- gorra clara;
- gorra oscura;
- remera;
- campera;
- cartel;
- vehículo;
- tarjeta;
- portada de documento;
- página interior de PDF;
- informe de métricas;
- presentación;
- firma de correo;
- publicación digital;
- panel;
- gráfico;
- mapa;
- pieza con código QR.

## Reglas para documentos y PDFs

Todo PDF futuro debe definir y respetar:

- logo correcto;
- ubicación del logo;
- márgenes;
- portada;
- encabezado;
- pie de página;
- numeración;
- tipografías;
- títulos;
- subtítulos;
- tablas;
- gráficos;
- uso de colores;
- fondos permitidos;
- estilo de fotografías;
- datos de versión;
- fecha.

No debe cambiar de identidad según la herramienta usada.

## Gobernanza

Ninguna IA ni colaborador puede crear libremente una variante visual nueva.

Cuando no exista una regla:

1. documentar el caso;
2. derivar una solución del sistema vigente;
3. presentarla para aprobación;
4. incorporarla como regla oficial solo después de aprobarla.

## Propuesta de ejecución por etapas

### Etapa 0 — Inventario y validación de fuentes

Objetivo:

- confirmar activos oficiales;
- separar activos válidos, duplicados, antiguos, defectuosos y candidatos;
- validar logo horizontal, vertical y picos;
- definir qué variantes faltan.

Salida:

- inventario de activos;
- matriz de estado;
- lista de faltantes;
- primera decisión de “fuente oficial”.

No diseñar todavía.

### Etapa 1 — Tokens fundacionales

Objetivo:

- consolidar paleta institucional;
- consolidar paleta semántica;
- consolidar tipografías;
- consolidar radios, bordes, sombras, fondos, opacidades y gradientes.

Salida:

- `brand-tokens.css`;
- `brand-tokens.json`;
- tabla humana de tokens.

No cambiar producción todavía.

### Etapa 2 — Manual de uso de logos

Objetivo:

- definir usos correctos e incorrectos;
- documentar variantes;
- tamaños mínimos;
- área de seguridad;
- matriz de elección por soporte.

Salida:

- capítulo de logos;
- carpeta organizada de logos aprobados;
- lista de variantes faltantes.

### Etapa 3 — Sistema visual digital

Objetivo:

- normalizar UI para paneles, dashboards, mapas y gráficos.

Salida:

- componentes base;
- reglas para cards, filtros, botones, KPIs, tablas, tooltips y gráficos;
- reglas para colores de series y slots.

### Etapa 4 — Documentos, PDFs y presentaciones

Objetivo:

- que todos los documentos tengan identidad consistente.

Salida:

- portada tipo;
- página interior tipo;
- informe de métricas;
- plantilla de presentación;
- firma de correo.

### Etapa 5 — Aplicaciones físicas y comerciales

Objetivo:

- extender la identidad a piezas con QR, señalética, indumentaria y merchandising.

Salida:

- ejemplos de gorra, remera, campera, cartel, vehículo, tarjeta y pieza QR.

### Etapa 6 — Protocolo para IA y colaboradores

Objetivo:

- impedir derivaciones visuales libres;
- fijar un proceso de aprobación.

Salida:

- protocolo de uso;
- checklist;
- reglas para prompts;
- changelog de versiones.

## Riesgos

- Tomar partes antiguas del sitio como referencia visual principal.
- Usar `assets/logo.png`, que actualmente no es imagen utilizable.
- Reconstruir el logo con tipografía.
- Crear una segunda paleta.
- Usar colores semánticos para elementos individuales.
- Mezclar colores de QR/link/total/consultas con propiedades o canales.
- Crear ejemplos visuales como oficiales sin aprobación.
- Publicar cambios visuales en producción sin autorización.

## Siguiente paso recomendado

Antes de diseñar el PDF final, ejecutar **Etapa 0 — Inventario y validación de fuentes**.

Pedido sugerido para la próxima ejecución:

> “Auditar en modo solo lectura todos los activos de marca de Sur Patagonia, separar oficiales, duplicados, defectuosos y faltantes, y preparar la matriz de logos aprobables para el Manual de Marca v1.0. No modificar archivos.”

