# Brief de devolución — ETAPA 2 rechazada
## Sur Patagonia · Panel activo de colaboradores

**Fecha:** 22/06/2026  
**Auditor:** Codex (modo lectura)  
**Veredicto:** ❌ RECHAZADO

---

## Qué revisó Codex

Se auditó únicamente el parche de ETAPA 2 aplicado sobre `colaboradores/index.html` en `/Users/marianosylvester/Downloads/sur-patagonia-main 2`.

Para aislar el diff, Codex reconstruyó una base esperada con ETAPA 1 + ETAPA 1B ya aplicadas y comparó esa base contra el archivo actual.

---

## Qué encontró

El diff está contenido en el alcance declarado:

1. Bloque HTML de KPI superiores.
2. Nueva función `actualizarKpisActivo(desde, hasta)`.
3. Llamada inicial al cargar el panel activo.
4. Llamada desde `pvSetPeriodo`.
5. Llamada desde `pvAplicarFechas`.

No se detectaron cambios en:

- `renderGraficoPasivo`
- `datosEvolucionPasivo`
- panel pasivo
- `renderSlotCards`
- ranking
- funnel
- origen
- paneles inferiores
- zoom / pan
- Supabase
- tracking
- autenticación
- rutas

---

## Motivo del rechazo

Hay una desalineación de período en los KPI para botones no personalizados (`7 días`, `30 días`).

El gráfico principal calcula el inicio así:

```js
new Date(hasta.getTime()-(dias-1)*86400000)
```

Pero ETAPA 2 calcula el inicio de los KPI así:

```js
desde.setTime(hasta.getTime() - dias * 86400000)
```

Luego `actualizarKpisActivo` normaliza `desde` a medianoche. Resultado: los KPI pueden incluir un día calendario extra respecto del gráfico principal.

Ejemplo: para `7 días`, el gráfico usa hoy + 6 días previos; los KPI pueden usar hoy + 7 días previos.

---

## Línea problemática

`colaboradores/index.html`, línea 2317:

```js
if (dias === 0) { desde.setHours(0,0,0,0) } else { desde.setTime(hasta.getTime() - dias * 86400000) }
```

---

## Instrucción para Claude / GPT

Corregir solo la línea de cálculo de `desde` en `pvSetPeriodo` para que los KPI usen exactamente el mismo rango que `renderGraficoPasivo` para períodos no personalizados.

No tocar otras funciones ni avanzar a etapas posteriores.
