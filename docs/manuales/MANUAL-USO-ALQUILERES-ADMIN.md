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

La barra superior permite volver al panel administrativo, abrir **Calendario global · Franjas** y llevar directamente a Resumen, Agenda, Propiedades, Facturas, Caja real, Pagos informados, Rendiciones y Comunicados.

El botón **＋ Alta completa** abre el formulario para cargar un alquiler nuevo desde cero. No hace falta completar tablas ni ejecutar SQL por separado.

El botón **ⓘ Cómo usar** recuerda la diferencia entre las tres cuentas.

## Cargar un alquiler nuevo

Entrá por **＋ Alta completa**. El alta reúne en una sola pantalla todo lo necesario para empezar a administrar un contrato:

1. **Propiedad:** elegí una publicación existente o escribí dirección, ciudad y provincia. Vincular una publicación no modifica su título, QR, enlaces ni seguimiento.
2. **Personas:** elegí propietario e inquilino existentes o cargá sus datos. La garantía permite elegir o crear también al garante.
3. **Mandato y honorarios:** ingresá la vigencia del mandato, porcentaje, mínimo, fijo adicional, inclusión de punitorios y tratamiento de impuestos. El honorario usa la misma moneda del alquiler: el panel lo muestra bloqueado para evitar una conversión sin regla. La generación mensual usa base devengada: el propietario lo debe aunque el inquilino todavía no haya pagado. Si marcás que los punitorios integran la base, al aplicar una mora el programa crea también el honorario porcentual sobre esa mora; si la condonás, no crea ninguno.
4. **Contrato:** cargá monto, moneda, fechas, días permitidos de pago, sistema y frecuencia de actualización, índice o porcentaje pactado, punitorio diario, días de gracia, prorrateo, redondeo y regla para otra moneda. Podés adjuntar el contrato firmado. IPC usa la serie oficial nacional de INDEC y el ICL la variable 40 de la API oficial BCRA v4; también se puede definir otro índice con fuente verificable.
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
- **Girado a propietarios:** giros confirmados, aunque su rendición formal todavía esté pendiente.

No existe un indicador de “deuda total” porque mezclaría cuentas diferentes.

Todos los acumulados se muestran separados por código de moneda —por ejemplo, `ARS` y `USD`—. El programa nunca suma importes de monedas distintas para producir un solo total.

## Agenda mensual

Cada fecha muestra como máximo dos renglones. Cuando hay más movimientos aparece **+N más**.

Tocá el casillero para ver la lista completa del día: propiedad, cuenta, concepto, partes, monto y estado. La altura del calendario no cambia aunque aumente la actividad.

## Abrir una propiedad

Tocá **Gestionar** en su tarjeta —o la tarjeta completa—. Se abren nueve pestañas:

### Calendario

Cada mes muestra por separado:

- obligaciones pendientes;
- honorarios pendientes.

Tocá un mes para ver deudor, acreedor, monto neto, saldo y estado de cada cargo.

### Cargos

Muestra la cuenta económica, concepto legible, respaldo disponible, deudor, acreedor, vencimiento, monto neto, saldo y estado.

Un cargo corregido totalmente mediante nota de crédito figura como **Anulado**, no como pagado.

### Contratos

Muestra las fechas, alquiler vigente, moneda, días de pago, prorrateo, redondeo, regla para pagos en otra moneda, ajuste, mora, documento vinculado, propietario y la configuración completa del honorario. Debajo muestra garantía, garante, cobertura, vigencia y documento. Es la lectura posterior del contrato: las decisiones tomadas en el alta no quedan escondidas. Una versión programada para el futuro no se presenta como vigente; en contratos cerrados, la última versión se rotula expresamente como histórica.

Los documentos del contrato, de las garantías y del depósito se descargan desde esta pestaña. Antes de entregar el archivo, el panel vuelve a calcular su SHA-256 y lo compara con la huella registrada; si no coincide, frena la descarga y avisa.

También se puede agregar una garantía después del alta, eligiendo un garante existente o creando uno dentro de la misma operación, con documento opcional. El cambio de comisión del mandato se programa únicamente desde el primer día de un mes futuro no generado: primero se calcula la vista previa y después se confirma con motivo obligatorio. La versión anterior no se reescribe.

Desde la misma pestaña se puede registrar una **continuación legal**, **renovar** o **rescindir** el contrato vigente.

La continuación legal se usa únicamente cuando terminó el plazo pactado, la ocupación continúa y todavía no existe un contrato nuevo firmado. Informá desde qué día continúa. El contrato conserva sus últimas condiciones, cambia a un estado visible de continuación legal y después todavía puede renovarse o rescindirse. No uses esta acción como reemplazo de una renovación ya acordada.

Para renovar, cargá las nuevas fechas, monto, moneda, días de pago, regla y frecuencia de actualización, índice o porcentaje, mora, prorrateo, redondeo, pago en otra moneda y honorarios. Podés adjuntar el contrato firmado y copiar la garantía. Debés confirmar expresamente que el mandato y la titularidad se extienden hasta el nuevo fin. La renovación crea un contrato nuevo ligado al anterior: no reescribe la historia.

Para rescindir, informá fecha de notificación, fecha efectiva, preaviso, causal, entrega de llaves y documento si existe. La rescisión no devuelve el depósito, no perdona saldos ni crea penalidades por sí sola; esas decisiones se registran por sus circuitos correspondientes.

### Personas

Permite editar teléfono, email de contacto y notas de cualquier persona registrada. El email de contacto no cambia el email de inicio de sesión.

Desde la misma pestaña se verifica, otorga o revoca el acceso del propietario a esa propiedad. Sólo se vincula un usuario de acceso ya existente y con el mismo email. Si no existe, tocá **Abrir Usuarios**, crealo con **Rol Colaborador** y **Tipo Propietario**, volvé a Alquileres y verificá nuevamente. El panel no muestra un botón de invitación que todavía no existe.

Los botones **Abrir portal del propietario** y **Copiar enlace** permiten comprobar el recorrido real sin tener que adivinar la URL. El portal exige el inicio de sesión del propietario y sólo muestra las propiedades para las que conserva acceso vigente.

### Notas

Conserva la historia. Diferencia las correcciones técnicas de las notas operativas y muestra fecha, autor y cargo afectado.

### Servicios

Permite:

- revisar las cuentas de servicios de la propiedad;
- agregar una cuenta;
- ver facturas vinculadas y sus documentos;
- cargar manualmente una factura.

Para cargar una factura se exige archivo, servicio, período, monto, moneda y vencimiento. Si se genera un cargo, queda ligado al documento. El mismo documento no se vuelve a cargar desde la pantalla.

Una factura puede cargarse para una sola unidad o repartirse entre varios contratos vigentes mediante tres reglas:

- **partes iguales**: la base divide el total y asigna cualquier diferencia de centavos en la última línea;
- **porcentaje**: los porcentajes deben sumar exactamente 100;
- **montos fijos**: los montos deben sumar exactamente el total de la factura.

Elegí también si cada cargo queda a favor del propietario de esa unidad o de la administración. Antes de guardar, tocá **Calcular reparto** y revisá cada deudor, acreedor, porcentaje y monto. Si cambiás cualquier dato, la vista previa queda invalidada y hay que recalcularla. Al confirmar se crean la factura, todos los cargos y el detalle histórico del reparto en una sola operación; un reintento no los duplica.

La factura compartida figura **saldada** únicamente cuando todos sus cargos están en cero. Si se revierte un pago y uno de esos cargos vuelve a tener saldo, la factura vuelve automáticamente a **pendiente**; cada propiedad muestra sólo la parte que le corresponde.

El programa no recibe facturas por correo. Sólo procesa los archivos elegidos o arrastrados manualmente.

La función remota histórica `robot-facturas` no forma parte del producto y debe permanecer eliminada de QA y producción. Su stub fail-closed y su bloque de configuración se conservan sin desplegar únicamente como evidencia de la contención F0 ya sellada.

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

1. En **Modalidad del cobro del inquilino**, elegí primero el contrato y la moneda. La modalidad se guarda para esa pareja exacta: un mismo contrato puede tener una decisión distinta por moneda. Elegí si paga directamente al propietario o si el dinero ingresa en una cuenta custodiada por la administración. Si es custodiado, elegí una cuenta activa de esa misma moneda y guardá la modalidad.
2. Marcá los cargos.
3. Verificá pagador y beneficiario.
4. Ingresá monto y fecha.
5. Elegí el medio correcto y adjuntá el comprobante.
6. Tocá **Calcular pago**. Revisá modalidad, cuenta, imputaciones por vencimiento y eventual crédito.
7. Recién entonces tocá **Confirmar este pago**.

Un cobro custodiado crea una entrada real en Caja; un pago directo queda sólo como información entre las partes. La pantalla nunca convierte uno en el otro por omisión. Si cambia cualquier dato después de calcular, la confirmación se bloquea hasta recalcular.

Un contrato cerrado o rescindido no borra su deuda. Mientras conserve cargos pendientes, aparece en el selector **Contrato y moneda** y el pago se confirma contra ese contrato histórico. Los cargos se presentan en lotes que comparten contrato, moneda, pagador y beneficiario; no hay que desmarcar manualmente cargos incompatibles.

Si el inquilino paga de más, el excedente queda como crédito para sus obligaciones futuras.

Si el contrato permite pagar en otra moneda, el campo **Moneda recibida** queda habilitado. Escribí el código de tres letras —por ejemplo USD—, el monto efectivamente recibido y la tasa expresada como “1 moneda recibida = cuántas unidades de la moneda del cargo”. La pantalla muestra la fuente pactada y la base reparte el equivalente exacto entre los cargos seleccionados antes de habilitar la confirmación. Cada conversión conserva monto de origen, monto de destino, tasa, fuente, fecha, redondeo y comprobante. Un pago convertido no puede superar el saldo: el crédito por excedente sigue disponible sólo para pagos en la misma moneda.

#### Confirmar pago de honorarios

Usalo para el pago del propietario a Sur Patagonian Real Estate. Está separado del formulario anterior y no permite informar un monto superior al saldo seleccionado.

#### Emitir cargo

Ingresá concepto, monto, moneda, deudor, acreedor, vencimiento y detalle. Deudor y acreedor deben ser personas diferentes. Antes de confirmar, verificá siempre quién debe y quién cobra.

Emitir un cargo crea una obligación **externa** entre las partes. No inventa una entrada de caja. Si el dinero ingresó realmente a la administración, registralo mediante el cobro custodiado o mediante **Caja real → Registrar movimiento e imputación**.

#### Emitir nota

Seleccioná el cargo, tipo, monto y motivo. La historia no se edita: la corrección se registra como una nota nueva.

### Excepciones

Esta pestaña concentra los meses que no siguen el circuito normal.

- **Mora:** elegí el cargo impago y la fecha hasta la cual querés calcular. El porcentaje diario y los días de gracia salen de la versión contractual que originó ese cargo; no se vuelven a escribir ni se pueden alterar desde esta pantalla. Se calcula sobre el saldo realmente pendiente. El primer botón genera sólo una propuesta. Después hay que escribir un motivo y elegir **Aplicar mora** o **Condonar**. Nunca se crea sola.
- **Ajuste contractual:** el programa determina cuándo corresponde, toma el porcentaje fijo pactado o los niveles del índice, muestra fórmula, fuentes y monto nuevo, y exige un motivo para aprobar. IPC e ICL pueden obtenerse automáticamente desde sus fuentes oficiales. Si esa consulta no responde, la misma pantalla permite cargar los valores publicados y sus URL oficiales de manera manual y verificable; los índices personalizados usan esa carga manual. El alquiler nuevo no se escribe a mano. La versión anterior se conserva y el ajuste debe aprobarse antes de generar el mes afectado.
- **Gasto a recuperar del propietario:** usalo cuando la administración pagó algo por cuenta del propietario. Exige comprobante y crea una obligación independiente del propietario hacia la administración; no se mezcla con lo que debe el inquilino.
- **Depósito:** muestra siempre la persona que realmente lo custodia. El alta rápida de esta pestaña registra un depósito en poder del propietario; el alta integral permite elegir propietario, inquilino o administración. Para un depósito fuera de la caja administrativa, el cierre exige que no queden obligaciones del inquilino y un comprobante de la devolución total.
- **Depósito custodiado por la administración:** primero se registra su ingreso real desde **Caja real → Registrar movimiento e imputación**, contra el evento de constitución o actualización. Con las obligaciones en cero, **Previsualizar devolución del depósito** verifica todas las fuentes y permite devolver el saldo total con comprobante. Si el contrato ya está cerrado o rescindido, registra sólo la salida y la liquidación del depósito. Si sigue vigente pero ya pasó su fin pactado, la misma confirmación cierra el contrato en esa fecha y registra la devolución real de manera atómica: no puede quedar una mitad sin la otra.
- **Pago parcial y pago de más:** se siguen cargando en **Operar → Pago de obligaciones administradas**. El parcial deja saldo; un pago posterior cancela primero lo anterior y el excedente queda como crédito.

## Caja y pagos directos

**Caja real de la administración** contiene únicamente movimientos de dinero custodiado.

Desde **Configurar cuentas** se puede crear una cuenta, activarla o desactivarla. Una cuenta con saldo distinto de cero o usada por un contrato custodiado no puede desactivarse.

**Registrar movimiento e imputación** es el circuito manual atómico: primero se elige el destino —cargo, crédito custodiado o evento de depósito—, la cuenta y el monto; la base muestra dirección, máximo imputable e impacto para el propietario; al confirmar exige comprobante y crea el movimiento y su imputación juntos. No se usa como reemplazo del formulario normal de cobro ni para devolver un crédito directo.

La columna **Acción** permite descargar y verificar el comprobante guardado de cada movimiento. En un pago reversible muestra, además, el botón de reversa.

Todo pago confirmado que todavía no fue girado muestra **Revertir pago**. El motivo es obligatorio. La vista previa enumera cada deuda y el importe exacto que se reabre. En pagos en otra moneda separa el dinero que sale de caja en la moneda originalmente recibida del saldo que vuelve a cada deuda en su moneda contractual; no mezcla ambos totales. También muestra cuánto crédito se neutraliza. La reversa es total; si el crédito ya fue usado, si el pago ya fue girado o si la situación cambió después del cálculo, la base la bloquea.

Las liquidaciones y el portal muestran cada evento en **Reversiones registradas · no computadas como cobro adicional**, con fecha, motivo, importe y deuda reabierta. Si la reversa fue parcial, el pago sigue además en cobros vigentes únicamente por su importe neto y queda marcado como parcialmente revertido. Si fue total, sale de los cobros vigentes y permanece sólo en la historia de reversiones.

**Pagos informados entre las partes** contiene pagos directos que la administración confirmó mediante comprobante, pero que nunca ingresaron en su caja.

Todos los créditos, incluso los de contratos cerrados, pueden devolverse desde **Operar → Créditos del inquilino**. La devolución se hace exclusivamente con **Devolver crédito**; no se reemplaza con un movimiento manual. Se puede devolver todo o una parte y el comprobante es obligatorio. Si el crédito nació de un cobro custodiado, registra una salida de la misma cuenta. Si nació de un pago directo, registra una devolución informativa entre las partes, con impacto cero en Caja.

## Rendiciones

La sección principal muestra las liquidaciones, los giros y las rendiciones formales. Después de emitir y archivar el PDF de la liquidación:

1. Tocá **Registrar giro al propietario**.
2. Elegí la cuenta custodiada, fecha, medio y comprobante.
3. Tocá **Calcular giro**. La base toma sólo aplicaciones custodiadas de los cargos incluidos en la liquidación y excluye fondos ya girados.
4. Confirmá el giro.
5. Podés descargar y verificar el comprobante exacto del giro.
6. Tocá **Emitir rendición formal**. Revisá el contenido sellado y emití el PDF.

Una liquidación puede recibir varios giros incrementales. Si después del primer giro aparecen nuevos cobros custodiados elegibles, el panel conserva el giro anterior y muestra **Registrar giro adicional**; la base excluye las fuentes ya giradas. Cada giro tiene su propio identificador, fecha, medio, comprobante y conjunto de fuentes.

Cada giro inicia su propia cadena de rendiciones en versión 1. La rendición conserva su propia huella de contenido y la huella de los bytes del PDF. El panel guarda el archivo privado, lo vuelve a descargar y compara su SHA-256 antes de emitir. Si la liquidación contiene reversiones, la rendición las informa como historia separada y no las suma como cobros adicionales ni como dinero girado. Una corrección crea una versión sucesora dentro de ese mismo giro, con motivo obligatorio; no reemplaza ni borra la anterior.

El portal del propietario muestra también los giros que todavía no tienen rendición. Agrupa cada cadena por giro y la identifica por propiedad, período, moneda, fecha e identificador corto, para que dos giros del mismo mes no aparezcan como dos documentos indistinguibles llamados “v1”. Las descargas incluyen esos datos en el nombre y verifican nuevamente la huella.

Las rendiciones históricas anteriores permanecen plegadas como historia previa y no se mezclan con el circuito vigente.

La liquidación es informativa: no es factura, recibo fiscal ni comprobante de ARCA. El registro de envío tampoco manda el correo por sí solo; conserva el resultado de un envío efectivamente realizado por la administración.

## Comunicados

La sección permite abrir un comunicado nuevo eligiendo propiedad y escribiendo el mensaje inicial. Los comunicados abiertos conservan sus botones de responder y resolver; cada acción queda en el historial.

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

## Instalación técnica F4

El orden canónico de instalación y recuperación es de **cuatro** migraciones, siempre completo y sin invertir pasos:

1. `alq_f4_alta_integral_panel.sql` — historial `20260829230952`;
2. `alq_f4_condiciones_contractuales_operativas.sql` — historial `20260829230953`;
3. `alq_f4_facturas_compartidas_y_ciclo_contrato.sql` — historial `20260829230954`;
4. `alq_f4_icl_bcra_variable_40.sql` — historial `20260830020556`.

La cuarta migración es obligatoria: reemplaza la variable BCRA discontinuada por la variable ICL 40 y conserva el validador exacto de IPC. El test F4 se ejecuta recién después de las cuatro. Luego se despliega `alq-indices-oficiales` con verificación JWT activa y, por último, se publican juntos `admin/alquileres-admin.html` y `admin/alquileres-franjas.html`. Nunca se debe reinstalar sólo una migración anterior ni publicar los paneles antes de completar y verificar la base y la función.

## Decisiones de producto y funciones sin pantalla

Estas reglas son deliberadas y no deben interpretarse como campos olvidados:

- El honorario del mandato se devenga cuando nace la obligación: la base es **sólo devengado**.
- Una factura compartida se reparte por **partes iguales**, por **porcentaje** —implementado como coeficientes que deben sumar 100— o por **monto fijo**. No existe un cuarto modo implícito.
- El porcentaje fijo de actualización del contrato se define en el alta o en la renovación. No se cambia a mitad de una versión contractual.

Las siguientes operaciones del motor quedan expresamente **sin pantalla por ahora**. Si fueran necesarias, se ejecutan por SQL con Codex y con una autorización puntual: `titularidad_asignar`, `transferencia_interna`, `conversion_registrar`, `factura_externa_registrar`, `deposito_evento_registrar`, `mandato_baja_avanzar` y `export_baja_*`. No deben aparecer como botones falsos ni darse por operables desde el panel.

## Instalación técnica F5 · orden completo

F5 se instala y prueba como una única cadena acumulativa. El orden obligatorio es:

1. `alq_f5_tanda2_ab_caja_cobro_reversa.sql`;
2. test `alq_f5_tanda2_ab_caja_cobro_reversa.sql` de `supabase/tests/`;
3. `alq_f5_tanda2_cd_giro_rendicion_credito_deposito.sql`;
4. test `alq_f5_tanda2_cd_giro_rendicion_credito_deposito.sql` de `supabase/tests/`;
5. `alq_f5_tanda3_gestion_y_portal.sql`;
6. test `alq_f5_tanda3_gestion_y_portal.sql` de `supabase/tests/`.

Cada migración debe pasar sus comprobaciones internas y su test antes de avanzar a la siguiente. Las pantallas de cuenta, modalidad, cobro custodiado, reversa, giro, rendición formal, movimiento manual, devolución de crédito y devolución de depósito dependen de AB y CD; la gestión diaria y el acceso ampliado del propietario dependen además de Tanda 3.

El panel administrativo y el portal del propietario se publican juntos únicamente después de instalar y verificar **AB → CD → Tanda 3**. No se publica uno sin el otro: la rendición formal emitida por el administrador debe quedar visible y descargable para su propietario en la misma ventana.

## Si algo no se entiende

No confirmes la operación. Cerrá el formulario, volvé a la pestaña Cargos y verificá la flecha **deudor → acreedor**. Esa relación determina a qué cuenta pertenece el movimiento.
