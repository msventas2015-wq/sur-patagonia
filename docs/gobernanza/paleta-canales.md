# Paleta de Canales — Sur Patagonia
**Fuente de verdad para colores de identidad de canal.**
Creada por Zcode · Análisis visual v2 · 25 familias · 50 colores.

Todo agente debe leer este archivo antes de asignar, modificar o renderizar colores de canal.

---

## Colores reservados — zona prohibida para canales

Estos 11 colores tienen significado semántico fijo en el sistema. **No pueden usarse para identidad de canal bajo ninguna circunstancia.** La paleta de identidad los evita con margen de ±15° de matiz y ±8% de luminosidad.

| Hex | Uso exclusivo |
|---|---|
| `#7aaeff` | Visualizaciones |
| `#e8c96a` | Consultas |
| `#50c878` | QR físico / estado activo |
| `#6495ed` | Link compartido |
| `#d76f3f` | Conversión |
| `#e05c5c` | Error |
| `#b39ddb` | Nuevo lead (CRM) |
| `#35c6b4` | Contactado (CRM) |
| `#f29a5a` | Visita coordinada (CRM) |
| `#7b7f88` | Descartado (CRM) |

*(10 colores listados — el sistema original define 11; verificar si hay actualización pendiente)*

---

## Paleta de identidad · 50 colores · 25 familias

Distribución: 2 colores por familia en promedio; Índigo, Violeta, Borgoña y Jade admiten 3 por riqueza de sub-tonos.

| # | Nombre | Hex | Familia |
|---|---|---|---|
| 0 | Índigo Profundo | `#3a4eb8` | Índigo |
| 1 | Azul Medianoche | `#2c3e9c` | Índigo |
| 2 | Azul Naval | `#4556a8` | Índigo |
| 3 | Cerúleo Oscuro | `#1e5fa0` | Cerúleo |
| 4 | Azul Acero | `#2a6db5` | Cerúleo |
| 5 | Cobalto Vivo | `#1f4ed8` | Cobalto |
| 6 | Cobalto Real | `#2e5cb8` | Cobalto |
| 7 | Violeta Real | `#7b3fb0` | Violeta |
| 8 | Violeta Imperial | `#6b3fa0` | Violeta |
| 9 | Lavanda Profunda | `#8a5fc4` | Violeta |
| 10 | Malva Premium | `#a86fb5` | Malva |
| 11 | Malva Cálido | `#b87fc0` | Malva |
| 12 | Magenta Premium | `#c040a0` | Magenta |
| 13 | Púrpura Bizantino | `#a82c8f` | Magenta |
| 14 | Frambuesa Premium | `#d20c5c` | Frambuesa |
| 15 | Fr. Neón Premium | `#e0186b` | Frambuesa |
| 16 | Rosa Bordeaux | `#d65d7a` | Rosa Óxido |
| 17 | Rosa Viejo | `#c94869` | Rosa Óxido |
| 18 | Coral Premium | `#ff6b5b` | Coral |
| 19 | Coral Vivo | `#e85a4f` | Coral |
| 20 | Carmesí Intenso | `#dc143c` | Rojo intenso |
| 21 | Rojo Premium | `#e63946` | Rojo intenso |
| 22 | Borgoña Profundo | `#7a1f2e` | Borgoña |
| 23 | Vino Tinto | `#8b2236` | Borgoña |
| 24 | Granate | `#9c2740` | Borgoña |
| 25 | Ciruela Profunda | `#5d2e5d` | Ciruela |
| 26 | Ciruela Real | `#6b3470` | Ciruela |
| 27 | Terracota Premium | `#c0603e` | Terracota |
| 28 | Ladrillo Viejo | `#a8512f` | Terracota |
| 29 | Cobre Clásico | `#b87333` | Cobre |
| 30 | Cobre Claro | `#c8843e` | Cobre |
| 31 | Bronce Antiguo | `#8c7853` | Bronce |
| 32 | Bronce Arena | `#a0825d` | Bronce |
| 33 | Ámbar Quemado | `#c08a2e` | Ámbar |
| 34 | Mostaza Antigua | `#cc9333` | Ámbar |
| 35 | Limón Eléctrico | `#d4ed00` | Amarillo fósforo |
| 36 | Chartreuse Neón | `#e6f23a` | Amarillo fósforo |
| 37 | Pistacho Premium | `#a0c850` | Pistacho |
| 38 | Pistacho Claro | `#bcd96e` | Pistacho |
| 39 | Verde Neón | `#39ff14` | Verde fósforo |
| 40 | Verde Matrix | `#4dff4d` | Verde fósforo |
| 41 | Menta Premium | `#3eb489` | Menta |
| 42 | Menta Cristal | `#4fca9e` | Menta |
| 43 | Jade Profundo | `#2a9d7a` | Jade |
| 44 | Esmeralda Apagada | `#1f8473` | Jade |
| 45 | Jade Mar | `#3aa68a` | Jade |
| 46 | Teal Profundo | `#1a7a7a` | Teal |
| 47 | Verde Petróleo | `#0d6b6b` | Teal |
| 48 | Cyan Oxidado | `#1d7a8c` | Cyan oscuro |
| 49 | Cyan Profundo | `#0f6e80` | Cyan oscuro |
| — | Arena Dorada | `#a89878` | Arena cálida |
| — | Gris Taupe | `#8a7d72` | Gris cálido |
| — | Oliva Clásica | `#6b7a2c` | Oliva |
| — | Oliva Dorada | `#7a8a3e` | Oliva |

> **Nota:** Arena cálida, Gris cálido y Oliva son las 4 últimas entradas (índices 50–53 si se amplía el pool a 54). El array de asignación usa los índices 0–49 por defecto.

---

## Algoritmo de asignación canal → color

### Reglas del sistema

**1. Orden fijo de la paleta.**
Los 50 colores tienen un índice `0..49` ordenados para máxima separación perceptual: familias alternadas, nunca dos de la misma familia seguidos en el array de asignación.

**2. Mapa determinístico persistente.**
En la creación del canal se asigna `colorIndex = siguienteColorLibre()`. Se persiste en la columna `color_index` de la tabla `canales`. **No se recalcula nunca**, porque el usuario asocia visualmente el canal a ese color.

**3. "Libre" = no usado por canal activo visible.**
Si dos canales comparten vista (ej: Últimas Consultas) y uno fue eliminado, su color vuelve al pool. `siguienteColorLibre()` excluye los índices en uso por canales con `activo = true` en la misma vista.

**4. Más de 50 canales activos simultáneos.**
Cuando el pool se agota, se generan colores nuevos con la regla `H = (baseHue + 7°) mod 360`, saltando familias reservadas (azul ~220°, verde ~145°, dorado ~45°). Es la única situación donde se permite un color "extra-paleta", y se marca como derivado.

**5. Migración desde el sistema anterior.**
Si ya hay canales con colores viejos, se ejecuta una pasada única que reasigna índices por orden de `created_at`. **Esto cambia colores existentes una sola vez** y debe comunicarse a los usuarios antes de deployar.

### Columna en base de datos

```sql
-- Tabla: canales
color_index INTEGER  -- índice 0..49 de la paleta, asignado al crear el canal
```

### Uso en código

```js
// Array de 50 colores en orden de asignación (máxima separación perceptual)
const PALETA_CANALES = [
  '#3a4eb8', '#dc143c', '#2a9d7a', '#c040a0', '#c08a2e',
  '#1f4ed8', '#7a1f2e', '#3eb489', '#d20c5c', '#b87333',
  '#7b3fb0', '#e85a4f', '#1a7a7a', '#a82c8f', '#cc9333',
  '#1e5fa0', '#9c2740', '#4fca9e', '#e0186b', '#8c7853',
  '#4556a8', '#5d2e5d', '#3aa68a', '#c94869', '#c8843e',
  '#2c3e9c', '#8b2236', '#1f8473', '#ff6b5b', '#a0825d',
  '#6b3fa0', '#c0603e', '#0d6b6b', '#d65d7a', '#a0c850',
  '#2a6db5', '#a8512f', '#1d7a8c', '#e63946', '#bcd96e',
  '#8a5fc4', '#b87fc0', '#0f6e80', '#6b3470', '#d4ed00',
  '#2e5cb8', '#a86fb5', '#39ff14', '#4dff4d', '#e6f23a',
]

// Obtener color de un canal
const colorCanal = (canal) => PALETA_CANALES[canal.color_index ?? 0]
```

---

## Inspiración de diseño

Paletas de referencia: Linear, Vercel, Stripe, Arc Browser, Framer, Notion AI, Cursor. El sistema prioriza colores que se lean bien sobre fondo oscuro (`#080808`–`#111111`) en tamaños pequeños (badge 7px, dot 8px).
