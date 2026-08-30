# Manual de uso · Alquileres Admin

Marca: Sur Patagonian Real Estate  
Pantalla: `admin/alquileres-admin.html`  
Entorno: Producción

## La regla principal

El programa administra tres cuentas económicas distintas. Nunca deben sumarse:

1. **Obligaciones administradas:** alquiler, expensas y servicios que el inquilino debe pagar al propietario u otro beneficiario.
2. **Honorarios de administración:** importes que el propietario debe pagarle a Sur Patagonian Real Estate.
3. **Liquidación al propietario:** dinero efectivamente custodiado que la administración debe rendir o transferir al propietario.

Un pago del inquilino no cancela honorarios. Un pago directo al propietario no entra en la caja de la administración.

## Cómo orientarse

Al entrar, el filtro inicial es **Todas**. Ese filtro se aplica al tablero completo. Podés cambiarlo por:

- Obligaciones pendientes;
- Honorarios pendientes;
- Otros pendientes;
- Sin pendientes.

La barra superior lleva directamente a Resumen, Agenda, Propiedades, Facturas, Caja real, Pagos informados, Rendiciones y Comunicados.

El botón **＋ Alta completa** abre el formulario para cargar un alquiler nuevo desde cero. No hace falta completar tablas ni ejecutar SQL por separado.

El botón **ⓘ Cómo usar** recuerda la diferencia entre las tres cuentas.

## Cargar un alquiler nuevo

Entrá por **＋ Alta completa**. El alta reúne en una sola pantalla todo lo necesario para empezar a administrar un contrato:

1. **Propiedad:** elegí una publicación existente o escribí dirección, ciudad y provincia. Vincular una publicación no modifica su título, QR, enlaces ni seguimiento.
2. **Personas:** elegí propietario e inquilino existentes o cargá sus datos. La garantía permite elegir o crear también al garante.
3. **Mandato y honorarios:** ingresá la vigencia del mandato, porcentaje, mínimo, fijo adicional, inclusión de punitorios y tratamiento de impuestos. El honorario usa la misma moneda del alquiler: el panel lo muestra bloqueado para evitar una conversión sin regla. La generación mensual usa base devengada: el propietario lo debe aunque el inquilino todavía no haya pagado. Si marcás que los punitorios integran la base, al aplicar una mora el programa crea también el honorario porcentual sobre esa mora; si la condonás, no crea ninguno.
4. **Contrato:** cargá monto, moneda, fechas, días permitidos de pago, sistema y frecuencia de actualización, índice o porcentaje pactado, punitorio diario, días de gracia, prorrateo, redondeo y regla para otra moneda. Podés adjuntar el contrato firmado. IPC usa la serie oficial nacional de INDEC y el ICL la serie oficial del BCRA; también se puede definir otro índice con fuente verificable.
5. **Garantía:** es opcional. Permite tipo, garante, póliza, emisor, cobertura, moneda y documento.
6. **Depósito:** si ya fue recibido, cargá monto, moneda, custodio y comprobante obligatorio. Si todavía no fue recibido, dejalo desactivado y registralo después desde la propiedad.
7. **Servicios:** agregá las cuentas de electricidad, gas, agua, internet, expensas u otras, con su número de cliente y responsable contractual.

Abajo se muestra una proforma calculada por la base para el primer mes, con tres circuitos separados: obligaciones del inquilino, honorario de la administración y caja/liquidación. Si el contrato empieza o termina a mitad de mes, aplica exactamente la regla elegida —días reales, base 30 o importe completo—. El honorario sigue calculándose sobre el alquiler mensual contractual completo. Las expensas de esa proforma son sólo una estimación; el importe real se carga al generar cada mes.

Revisá el resumen, marcá la confirmación y tocá **Confirmar alta completa** una sola vez. La base crea personas, propiedad administrada, titularidad, mandato, contrato, garantía, depósito, documentos y servicios dentro de una única transacción. Si algo falla, no queda un contrato parcial. Ante una pérdida de respuesta, el mismo pedido se reintenta sin duplicar.

La distribución de una factura compartida se realiza después del alta, desde la pestaña **Servicios**. La cuenta se registra en el alta; cada factura decide a qué contratos corresponde y cómo se reparte.

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

Tocá su tarjeta. Se abren ocho pestañas:

### Calendario

Cada mes muestra por separado:

- obligaciones pendientes;
- honorarios pendientes.

Tocá un mes para ver deudor, acreedor, monto neto, saldo y estado de cada cargo.

### Cargos

Muestra la cuenta económica, concepto legible, respaldo disponible, deudor, acreedor, vencimiento, monto neto, saldo y estado.

Un cargo corregido totalmente mediante nota de crédito figura como **Anulado**, no como pagado.

### Contratos

Muestra las fechas, alquiler vigente, moneda, días de pago, prorrateo, redondeo, regla para pagos en otra moneda, ajuste, mora, documento vinculado, propietario y la configuración completa del honorario. Debajo muestra garantía, garante, cobertura, vigencia y documento. Es la lectura posterior del contrato: las decisiones tomadas en el alta no quedan escondidas.

Desde la misma pestaña se puede registrar una **continuación legal**, **renovar** o **rescindir** el contrato vigente.

La continuación legal se usa únicamente cuando terminó el plazo pactado, la ocupación continúa y todavía no existe un contrato nuevo firmado. Informá desde qué día continúa. El contrato conserva sus últimas condiciones, cambia a un estado visible de continuación legal y después todavía puede renovarse o rescindirse. No uses esta acción como reemplazo de una renovación ya acordada.

Para renovar, cargá las nuevas fechas, monto, moneda, días de pago, regla y frecuencia de actualización, índice o porcentaje, mora, prorrateo, redondeo, pago en otra moneda y honorarios. Podés adjuntar el contrato firmado y copiar la garantía. Debés confirmar expresamente que el mandato y la titularidad se extienden hasta el nuevo fin. La renovación crea un contrato nuevo ligado al anterior: no reescribe la historia.

Para rescindir, informá fecha de notificación, fecha efectiva, preaviso, causal, entrega de llaves y documento si existe. La rescisión no devuelve el depósito, no perdona saldos ni crea penalidades por sí sola; esas decisiones se registran por sus circuitos correspondientes.

### Notas

Conserva la historia. Diferencia las correcciones técnicas de las notas operativas y muestra fecha, autor y cargo afectado.

### Servicios

Permite:

- revisar las cuentas de servicios de la propiedad;
- agregar una cuenta;
- ver facturas vinculadas y sus documentos;
- cargar manualmente una factura.

Para cargar una factura se exige archivo, servicio, período, monto y vencimiento. Si se genera un cargo, queda ligado al documento. El mismo documento no se vuelve a cargar desde la pantalla.

Una factura puede cargarse para una sola unidad o repartirse entre varios contratos vigentes mediante tres reglas:

- **partes iguales**: la base divide el total y asigna cualquier diferencia de centavos en la última línea;
- **porcentaje**: los porcentajes deben sumar exactamente 100;
- **montos fijos**: los montos deben sumar exactamente el total de la factura.

Elegí también si cada cargo queda a favor del propietario de esa unidad o de la administración. Antes de guardar, tocá **Calcular reparto** y revisá cada deudor, acreedor, porcentaje y monto. Si cambiás cualquier dato, la vista previa queda invalidada y hay que recalcularla. Al confirmar se crean la factura, todos los cargos y el detalle histórico del reparto en una sola operación; un reintento no los duplica.

La factura compartida figura **saldada** únicamente cuando todos sus cargos están en cero. Si se revierte un pago y uno de esos cargos vuelve a tener saldo, la factura vuelve automáticamente a **pendiente**; cada propiedad muestra sólo la parte que le corresponde.

El ingreso automático por correo está apagado. Sólo se procesan los archivos elegidos o arrastrados manualmente.

### Liquidación

Prepara la liquidación mensual del propietario. El documento mantiene tres secciones independientes:

1. obligaciones del inquilino administradas;
2. pagos informados directamente entre las partes;
3. cuenta exclusiva entre el propietario y Sur Patagonian Real Estate.

Para emitirla:

1. Elegí el mes.
2. Tocá **Calcular borrador para revisar**.
3. Revisá deudores, acreedores, importes, pagos y el saldo anterior.
4. Si falta un gasto, crédito u otro concepto, no lo escribas en el PDF: registralo primero en **Operar** y volvé a calcular el borrador.
5. Descargá el PDF del borrador si querés hacer una revisión externa.
6. Tocá **Emitir y sellar esta versión** sólo cuando el contenido sea correcto.
7. Al emitir, el sistema guarda el PDF definitivo en el archivo privado y lo vincula a esa versión. **Descargar PDF guardado** baja siempre esos mismos bytes; no vuelve a generar el documento.
8. Tocá **Preparar email**, adjuntá el PDF en tu programa de correo y envialo.
9. Volvé al programa y registrá el resultado real: enviado, fallido o rebotado.

Una liquidación emitida no se edita. Si hay una corrección, elegí la versión anterior en **Tipo de emisión**, calculá un nuevo borrador y emití la sucesora. La versión vieja y su PDF permanecen en el historial; la corrección tiene otro PDF y otra huella.

El sello de contenido y el sello del PDF son distintos: el primero identifica los datos contables y el segundo los bytes exactos del archivo. Si el archivo guardado falta o no coincide con su sello, el programa debe mostrar el error y no regenerarlo silenciosamente. Sólo una liquidación histórica que nunca tuvo intento de envío puede reconstruirse antes de su primer envío; queda marcada como tal.

**Preparar email** abre el programa de correo, pero no puede adjuntar por sí solo. El operador debe bajar el PDF guardado, adjuntarlo y recién después registrar el resultado. Ese registro es una declaración manual de lo ocurrido; no prueba criptográficamente qué archivo fue adjuntado.

### Operar

Contiene las acciones que escriben información financiera.

#### Generar mes

Elegí mes y expensas. El programa crea cargos separados:

- alquiler y expensas: obligación del inquilino hacia el propietario;
- honorario: obligación del propietario hacia la administración.

Antes de confirmar muestra el cálculo exacto realizado por la base, incluidos prorrateo, período activo, vencimiento y honorario. En el primer mes el vencimiento nunca puede quedar antes del inicio del contrato. Si corresponde un ajuste contractual, el programa bloquea la generación y lleva primero a **Excepciones**. Si el mes ya existe, los importes se muestran en consulta y el botón queda deshabilitado.

#### Confirmar pago de obligaciones

Usalo para el pago del inquilino al propietario.

1. Marcá los cargos.
2. Verificá pagador y beneficiario.
3. Ingresá monto y fecha.
4. Elegí el medio correcto.
5. Adjuntá el comprobante.
6. Confirmá.

Si el inquilino paga de más, el excedente queda como crédito para sus obligaciones futuras.

Si el contrato permite pagar en otra moneda, el campo **Moneda recibida** queda habilitado. Escribí el código de tres letras —por ejemplo USD—, el monto efectivamente recibido y la tasa expresada como “1 moneda recibida = cuántas unidades de la moneda del cargo”. La pantalla muestra la fuente pactada y la base reparte el equivalente exacto entre los cargos seleccionados antes de habilitar la confirmación. Cada conversión conserva monto de origen, monto de destino, tasa, fuente, fecha, redondeo y comprobante. Un pago convertido no puede superar el saldo: el crédito por excedente sigue disponible sólo para pagos en la misma moneda.

#### Confirmar pago de honorarios

Usalo para el pago del propietario a Sur Patagonian Real Estate. Está separado del formulario anterior y no permite informar un monto superior al saldo seleccionado.

#### Emitir cargo

Ingresá concepto, monto, deudor, acreedor, vencimiento y detalle. Deudor y acreedor deben ser personas diferentes. Antes de confirmar, verificá siempre quién debe y quién cobra.

#### Emitir nota

Seleccioná el cargo, tipo, monto y motivo. La historia no se edita: la corrección se registra como una nota nueva.

### Excepciones

Esta pestaña concentra los meses que no siguen el circuito normal.

- **Mora:** elegí el cargo impago y la fecha hasta la cual querés calcular. El porcentaje diario y los días de gracia salen de la versión contractual que originó ese cargo; no se vuelven a escribir ni se pueden alterar desde esta pantalla. Se calcula sobre el saldo realmente pendiente. El primer botón genera sólo una propuesta. Después hay que escribir un motivo y elegir **Aplicar mora** o **Condonar**. Nunca se crea sola.
- **Ajuste contractual:** el programa determina cuándo corresponde, toma el porcentaje fijo pactado o los niveles del índice, muestra fórmula, fuentes y monto nuevo, y exige un motivo para aprobar. IPC e ICL pueden obtenerse automáticamente desde sus fuentes oficiales. Si esa consulta no responde, la misma pantalla permite cargar los valores publicados y sus URL oficiales de manera manual y verificable; los índices personalizados usan esa carga manual. El alquiler nuevo no se escribe a mano. La versión anterior se conserva y el ajuste debe aprobarse antes de generar el mes afectado.
- **Gasto a recuperar del propietario:** usalo cuando la administración pagó algo por cuenta del propietario. Exige comprobante y crea una obligación independiente del propietario hacia la administración; no se mezcla con lo que debe el inquilino.
- **Depósito:** registra que el dinero está en poder del propietario. Para cerrar el contrato, exige que no queden obligaciones del inquilino y un comprobante de la devolución total.
- **Pago parcial y pago de más:** se siguen cargando en **Operar → Pago de obligaciones administradas**. El parcial deja saldo; un pago posterior cancela primero lo anterior y el excedente queda como crédito.

## Caja y pagos directos

**Caja real de la administración** contiene únicamente movimientos de dinero custodiado.

**Pagos informados entre las partes** contiene pagos directos que la administración confirmó mediante comprobante, pero que nunca ingresaron en su caja.

## Rendiciones

La sección principal muestra las liquidaciones del Bloque 2, su versión, saldo anterior, saldo final y estado de envío. Las rendiciones anteriores permanecen plegadas como historia previa y no se mezclan con el nuevo circuito.

La liquidación es informativa: no es factura, recibo fiscal ni comprobante de ARCA. El registro de envío tampoco manda el correo por sí solo; conserva el resultado de un envío efectivamente realizado por la administración.

## Acciones que el programa debe impedir

- confirmar sin comprobante;
- usar un mismo comprobante para dos pagos;
- mezclar pagadores, beneficiarios, contratos o monedas en un pago;
- usar otra moneda si el contrato la prohíbe, cambiar la fuente pactada o confirmar una conversión que supere el saldo;
- generar dos veces un mismo mes;
- confirmar un pago sin cargos pendientes;
- emitir un cargo con deudor y acreedor iguales;
- cargar dos veces la misma factura desde la pantalla;
- confirmar una factura compartida sin vista previa exacta, con menos de dos contratos o con porcentajes/montos que no cierren;
- renovar un contrato sin revisar todas sus condiciones y extender expresamente el mandato;
- rescindir un contrato sin fecha efectiva, preaviso y causal;
- sumar obligaciones, honorarios y rendiciones como si fueran una sola deuda.
- modificar una liquidación ya emitida o reemplazarla sin conservar la versión anterior;
- registrar como enviado un email que todavía no fue enviado.
- convertir una propuesta de mora en cargo sin una decisión humana y su motivo;
- cambiar desde la pantalla el porcentaje o la gracia de mora de un cargo ya emitido;
- generar un mes con vencimiento anterior al inicio del contrato;
- ajustar un alquiler después de haber generado el mes afectado;
- cerrar un contrato con obligaciones del inquilino pendientes o sin devolver todo el depósito.

## Si algo no se entiende

No confirmes la operación. Cerrá el formulario, volvé a la pestaña Cargos y verificá la flecha **deudor → acreedor**. Esa relación determina a qué cuenta pertenece el movimiento.
