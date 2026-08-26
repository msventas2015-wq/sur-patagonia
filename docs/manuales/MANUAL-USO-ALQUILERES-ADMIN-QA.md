# Manual de uso · Alquileres Admin QA

Marca: Sur Patagonian Real Estate  
Pantalla: `admin/alquileres-admin-qa.html`  
Entorno: QA

## La regla principal

El programa administra tres cuentas económicas distintas. Nunca deben sumarse:

1. **Obligaciones administradas:** alquiler, expensas y servicios que el inquilino debe pagar al propietario u otro beneficiario.
2. **Honorarios de administración:** importes que el propietario debe pagarle a Sur Patagonian Real Estate.
3. **Liquidación al propietario:** dinero efectivamente custodiado que la administración debe rendir o transferir al propietario.

Un pago del inquilino no cancela honorarios. Un pago directo al propietario no entra en la caja de la administración.

## Cómo orientarse

Al entrar, el filtro inicial es **Piloto activo**. Ese filtro se aplica al tablero completo. Podés cambiarlo por:

- Todas;
- Obligaciones pendientes;
- Honorarios pendientes;
- Sin pendientes.

La barra superior lleva directamente a Resumen, Agenda, Propiedades, Facturas, Caja real, Pagos informados, Rendiciones y Comunicados.

El botón **ⓘ Cómo usar** recuerda la diferencia entre las tres cuentas.

## Qué muestra el resumen

- **Propiedades:** unidades incluidas en el filtro actual.
- **Obligaciones:** saldos pendientes de inquilinos y servicios.
- **Honorarios:** saldos que los propietarios deben a la administración.
- **En caja:** sólo dinero realmente custodiado.
- **Girado a propietarios:** transferencias ligadas a rendiciones.

No existe un indicador de “deuda total” porque mezclaría cuentas diferentes.

## Agenda mensual

Cada fecha muestra como máximo dos renglones. Cuando hay más movimientos aparece **+N más**.

Tocá el casillero para ver la lista completa del día: propiedad, cuenta, concepto, partes, monto y estado. La altura del calendario no cambia aunque aumente la actividad.

## Abrir una propiedad

Tocá su tarjeta. Se abren seis pestañas:

### Calendario

Cada mes muestra por separado:

- obligaciones pendientes;
- honorarios pendientes.

Tocá un mes para ver deudor, acreedor, monto neto, saldo y estado de cada cargo.

### Cargos

Muestra la cuenta económica, concepto legible, respaldo disponible, deudor, acreedor, vencimiento, monto neto, saldo y estado.

Un cargo corregido totalmente mediante nota de crédito figura como **Anulado**, no como pagado.

### Contratos

Muestra las fechas, alquiler vigente, moneda, días de pago, ajuste, mora, documento vinculado, propietario y honorario de administración disponible.

### Notas

Conserva la historia. Diferencia las correcciones técnicas de las notas operativas y muestra fecha, autor y cargo afectado.

### Servicios

Permite:

- revisar las cuentas de servicios de la propiedad;
- agregar una cuenta;
- ver facturas vinculadas y sus documentos;
- cargar manualmente una factura.

Para cargar una factura se exige archivo, servicio, período, monto y vencimiento. Si se genera un cargo, queda ligado al documento. El mismo documento no se vuelve a cargar desde la pantalla.

El ingreso automático por correo está apagado. Sólo se procesan los archivos elegidos o arrastrados manualmente.

### Operar

Contiene las acciones que escriben información financiera.

#### Generar mes

Elegí mes y expensas. El programa crea cargos separados:

- alquiler y expensas: obligación del inquilino hacia el propietario;
- honorario: obligación del propietario hacia la administración.

Si el mes ya existe, los importes se muestran en consulta y el botón queda deshabilitado.

#### Confirmar pago de obligaciones

Usalo para el pago del inquilino al propietario.

1. Marcá los cargos.
2. Verificá pagador y beneficiario.
3. Ingresá monto y fecha.
4. Elegí el medio correcto.
5. Adjuntá el comprobante.
6. Confirmá.

Si el inquilino paga de más, el excedente queda como crédito para sus obligaciones futuras.

#### Confirmar pago de honorarios

Usalo para el pago del propietario a Sur Patagonian Real Estate. Está separado del formulario anterior y no permite informar un monto superior al saldo seleccionado.

#### Emitir cargo

Ingresá concepto, monto, deudor, acreedor, vencimiento y detalle. Deudor y acreedor deben ser personas diferentes. Antes de confirmar, verificá siempre quién debe y quién cobra.

#### Emitir nota

Seleccioná el cargo, tipo, monto y motivo. La historia no se edita: la corrección se registra como una nota nueva.

## Caja y pagos directos

**Caja real de la administración** contiene únicamente movimientos de dinero custodiado.

**Pagos informados entre las partes** contiene pagos directos que la administración confirmó mediante comprobante, pero que nunca ingresaron en su caja.

## Rendiciones

La pantalla muestra líneas, saldo rendido y transferencias vinculadas. El botón **Vista imprimible / guardar PDF** abre el documento emitido para revisión o guardado mediante la función de impresión del navegador.

El flujo completo de borrador previo, saldo anterior y envío corresponde al Bloque 2 y todavía no debe considerarse cerrado.

## Acciones que el programa debe impedir

- confirmar sin comprobante;
- usar un mismo comprobante para dos pagos;
- mezclar pagadores, beneficiarios, contratos o monedas en un pago;
- generar dos veces un mismo mes;
- confirmar un pago sin cargos pendientes;
- emitir un cargo con deudor y acreedor iguales;
- cargar dos veces la misma factura desde la pantalla;
- sumar obligaciones, honorarios y rendiciones como si fueran una sola deuda.

## Si algo no se entiende

No confirmes la operación. Cerrá el formulario, volvé a la pestaña Cargos y verificá la flecha **deudor → acreedor**. Esa relación determina a qué cuenta pertenece el movimiento.
