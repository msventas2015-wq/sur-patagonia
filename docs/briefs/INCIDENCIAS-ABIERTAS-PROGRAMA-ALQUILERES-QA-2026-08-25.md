# Incidencias abiertas · Programa de alquileres QA

Fecha de relevamiento: 2026-08-25  
Método: recorrido visual del programa QA con los datos ya existentes.  
Alcance: lista única de defectos; no es un banco de pruebas ni autoriza cambios en producción.

## Estado de la corrección integrada

Fecha de corrección: 2026-08-25. Archivo principal: `admin/alquileres-admin-qa.html`.

- **Primera publicación:** commit `4bfbcb270a537bfe4ae18ee2dd585e17b30fb9ac`.
- **Corregidas en el programa:** ALQ-001 a ALQ-018 y ALQ-021 a ALQ-033.
- **Corrección posterior preparada para publicación:** invalidación explícita de la imagen de marca con URL versionada, service workers v9, KPI monetario adaptable y reintento automático de lecturas transitorias.
- **ALQ-019, avance parcial:** las rendiciones ya tienen una vista imprimible que puede guardarse como PDF. Sigue faltando el circuito completo del Bloque 2: borrador previo a emisión, saldo anterior arrastrado y envío.
- **ALQ-020, mitigación local:** la pantalla sigue exigiendo autenticación y ahora declara `noindex`, `nofollow` y `noarchive`. Retirar o aislar físicamente la ruta pública requiere una decisión de publicación y no se ejecutó en este cambio local.

La corrección local incluye, entre otros puntos:

- tres cuentas económicas visibles y nunca sumadas entre sí;
- filtro inicial `Piloto activo`, aplicado a todo el tablero para apartar datos históricos;
- caja custodiada separada de pagos directos informados;
- formularios de pago separados por cuenta, con medios y beneficiarios coherentes;
- cargos anulados calculados por monto neto y no como pagos ordinarios;
- calendario de altura fija, dos renglones por día, indicador `+N más` y detalle completo al tocar la fecha;
- factura manual con documento obligatorio, identidad estable y rechazo de documento ya cargado;
- meses ya generados en modo de consulta y acciones inválidas deshabilitadas;
- trazabilidad ampliada en cargos, facturas, contratos y notas;
- navegación rápida, guía de uso y ayudas contextuales;
- robot de correo retirado de la operación y sin ejecución automática.

La primera publicación no ejecutó SQL ni modificó QA o producción. La corrección posterior debe publicarse y verificarse visualmente antes de cerrar esta etapa.

## Bloqueantes contables

### ALQ-001 · Circuitos económicos mezclados

La interfaz suma como una sola "deuda" obligaciones que no pertenecen a la misma cuenta:

- obligaciones del inquilino administradas por la inmobiliaria (alquiler, expensas y servicios);
- importes que el propietario debe pagarle a Sur Patagonian Real Estate (honorarios);
- futura liquidación o saldo que la administración deba entregarle al propietario.

Nunca debe existir un total que sume esos tres circuitos.

### ALQ-002 · KPI y agenda calculados sobre la bolsa mezclada

`Deuda viva`, `A cobrar`, `Cobrado` y `Pendiente` agregan cargos sin separar deudor, acreedor ni circuito. El valor mostrado no representa una cuenta contable utilizable.

### ALQ-003 · Estado de la propiedad y filtros ambiguos

Las tarjetas, los filtros `Con deuda` / `Al día` y el encabezado de Ñancos derivan un único estado sumando todos los saldos de la propiedad. Deben existir estados separados, como mínimo:

- obligaciones del inquilino;
- cuenta del propietario con la administración;
- liquidación al propietario, cuando exista.

### ALQ-004 · Calendario mensual mezcla relaciones distintas

El calendario presenta un único total mensual y un único estado. En septiembre de Ñancos mostró `$1.222.116` como `Pagado`, sumando alquiler, expensas, honorario y dos cargos de gas duplicados.

### ALQ-005 · La sección Caja contiene pagos que nunca ingresaron a caja

La tabla `Caja` muestra como `ENTRADA · DIRECTO` los `$510.000` que Tomás transfirió directamente al propietario. Ese dinero no ingresó en la caja de la administración y no debe aparecer allí.

### ALQ-006 · Pago del honorario clasificado con dirección incorrecta

El pago de `$36.000` del propietario a la administración quedó registrado con el medio `transferencia_directa_al_propietario`. La dirección económica es la opuesta y necesita un flujo propio.

### ALQ-007 · Formulario único para pagos diferentes

La pestaña `Operar` muestra en una misma lista obligaciones del inquilino y honorarios del propietario. El motor impide combinar deudores o acreedores distintos, pero la interfaz no debe ofrecerlos como si fueran el mismo tipo de cobro.

## Datos y trazabilidad

### ALQ-008 · Factura de gas duplicada

Existen dos cargos de `$338.058` correspondientes a la misma factura. El alta de facturas no es idempotente por identidad documental y el calendario incorporó ambos al total.

### ALQ-009 · Falta el acreedor en las vistas de cargos

La tabla mensual muestra deudor, monto y saldo, pero no informa quién recibe el dinero. Sin deudor y acreedor visibles no se puede identificar la relación económica.

### ALQ-010 · Servicios sin identificación suficiente

Los cargos aparecen como `servicio` sin exhibir proveedor, período, número de factura ni documento asociado.

### ALQ-011 · Datos históricos de prueba mezclados con el piloto

La misma pantalla muestra Ñancos junto con propiedades, movimientos, rendiciones y comunicados de pruebas anteriores. Un usuario nuevo no puede distinguir con claridad qué pertenece al piloto vigente.

## Usabilidad

### ALQ-012 · Robot de correo ofrecido aunque está apagado

La pantalla dice que el robot lee las facturas y ofrece `Revisar casilla ahora`, pero termina en `Failed to send a request to the Edge Function`. El robot fue apagado deliberadamente y no debe presentarse como una función disponible.

### ALQ-013 · Navegación excesivamente larga

Propiedades, bandeja, caja, rendiciones y comunicados están apilados en una sola página sin menú ni acceso rápido. Durante el primer recorrido fue difícil volver a las tarjetas de propiedades.

### ALQ-014 · No existe ayuda contextual

Faltan manual permanente, recorrido inicial y botones informativos `ⓘ` que expliquen cada indicador, pestaña y acción que modifica dinero.

### ALQ-015 · Etiquetas insuficientes en pagos y calendario

Los eventos dicen solamente `pago $...` y no identifican pagador, beneficiario, cuenta ni concepto completo.

## Pendientes ya corregidos localmente pero no publicados

### ALQ-016 · Fondo con marca anterior todavía visible en el sitio

El sitio todavía muestra `Sur Patagonia Propiedades`. El reemplazo por la imagen suministrada de `Sur Patagonian Real Estate`, con QR ilustrativo y dominio nuevo, está preparado localmente pero falta publicación/invalidación de caché.

### ALQ-017 · Convención de fecha civil

La corrección local evita mostrar, agrupar o vencer los cargos un día antes. Falta publicar y verificarla en el sitio.

### ALQ-018 · KPI Propiedades invisible

La corrección local de `--accent` a `var(--accent)` está preparada; falta publicación.

## Función todavía inexistente

### ALQ-019 · Liquidación del propietario

Todavía no existe la vista previa ni el PDF de liquidación revisable para el propietario, con saldo anterior, conceptos, honorarios y saldo final.

## Operación y publicación

### ALQ-020 · Panel QA accesible desde el dominio público

La ruta `/admin/alquileres-admin-qa.html` está publicada en el dominio público aunque el propio archivo indica que no debe subirse. La pantalla usa QA, pero debe definirse y aplicar una política de acceso/publicación adecuada.

## Segunda recorrida · Ventana de Ñancos

### ALQ-021 · Los cargos anulados siguen inflando el total mensual

La nota de crédito confirma que uno de los cargos de gas de `$338.058` fue anulado por duplicado. Sin embargo, septiembre sigue mostrando `$1.222.116` como total pagado porque el calendario suma el monto original de todos los cargos y no considera las notas de crédito/débito. El total mensual bruto no representa la obligación real.

### ALQ-022 · La pestaña Cargos expone códigos internos y carece de trazabilidad

Conceptos como `alquiler_periodo` y `honorario_administracion` no son etiquetas para un usuario. Además faltan acreedor, período, proveedor, factura/documento, fecha de creación y vínculo con sus ajustes.

### ALQ-023 · Facturas y cargos de servicios no coinciden

La pestaña Servicios informa `Sin facturas cargadas`, pero Cargos contiene varios servicios por `$58.163`, `$338.058` y `$354.964`. No existe una trazabilidad visible entre la factura, el servicio y el cargo resultante.

### ALQ-024 · Carga manual de factura sin documento visible

El formulario manual permite cargar período, monto y vencimiento, pero dentro de la propiedad no exige ni muestra el PDF o comprobante de la factura. Una obligación de servicio debe conservar y exhibir su documento de origen.

### ALQ-025 · Mes ya generado se ofrece nuevamente con datos contradictorios

`Operar` muestra septiembre de 2026, expensas `0` y el botón `Generar alquiler, expensas y honorario`, aunque la tabla inferior confirma que septiembre ya fue generado con expensas `$60.000`. Pulsarlo produciría un replay conflictivo o un error derivado. Un mes existente debe mostrarse en modo consulta y no ofrecer una generación contradictoria.

### ALQ-026 · Acciones habilitadas aunque no hay nada para operar

La pantalla informa `No hay cargos con saldo en esta propiedad`, pero mantiene activos monto, fecha, medio, comprobante y `Confirmar pago`. Deben quedar deshabilitados cuando no existe una obligación seleccionable.

### ALQ-027 · Emitir cargo propone deudor y acreedor idénticos

El formulario aparece inicialmente con `Mariano` como deudor y `Mariano` como acreedor. Esa relación carece de sentido económico y no debería poder enviarse. El programa debe exigir partes diferentes y explicar el circuito que se está creando.

### ALQ-028 · Contratos no muestra las condiciones necesarias

La pestaña sólo presenta inquilino, estado y fechas. Faltan propietario, alquiler vigente, moneda, día de pago, mecanismo de ajuste, depósito, honorario/mandato y documentos. Además aparecen un contrato cerrado después de un mes y otro vigente consecutivo; esa secuencia debe validarse como dato de piloto o corregirse.

### ALQ-029 · Notas técnicas mezcladas con la operación cotidiana

La pestaña muestra textos internos como `Reconciliación del fixture anterior` y `bug de UI corregido`. La historia debe conservarse, pero la vista operativa necesita diferenciar correcciones técnicas, anulaciones de factura y notas comerciales, con fecha, autor y cargo afectado.

### ALQ-030 · Generación mensual agrupa dos circuitos en un solo botón

El botón `Generar alquiler, expensas y honorario` presenta como una única acción las obligaciones administradas del inquilino y la cuenta de honorarios del propietario con la administración. Aunque se creen cargos separados, la interfaz debe exponer claramente los dos resultados y nunca tratarlos como una misma cuenta.

### ALQ-031 · El calendario no controla días con muchos eventos

Todos los cargos y pagos de una fecha se apilan dentro de la misma celda, sin máximo, agrupación ni enlace `+N más`. La celda y toda la fila semanal crecen indefinidamente; los textos individuales se recortan con puntos suspensivos. Con actividad normal el calendario se volverá alto e ilegible. Debe mostrar un resumen acotado por día y abrir el detalle completo al tocar la fecha.

### ALQ-032 · El KPI Obligaciones recorta importes grandes

El importe `$1.085.000` desborda el ancho útil de la tarjeta y se percibe como `$1.085.0`. El número debe reducir su tipografía de forma automática, permanecer en una sola línea y conservar el valor completo como ayuda emergente.

### ALQ-033 · Un fallo transitorio deja el tablero vacío

Una lectura inicial puede fallar con mensajes transitorios como `JWT issued at future`. La pantalla no debe quedar detenida: debe renovar la sesión cuando corresponda, reintentar automáticamente hasta tres veces y ofrecer un botón manual si los tres intentos fallan.

## Precisión importante

La base sí conserva `deudor_parte_id` y `acreedor_parte_id` por cargo, y el aplicador de pagos rechaza combinar cargos con pagadores o beneficiarios diferentes. El defecto principal confirmado hasta ahora está en la presentación, las agregaciones y la clasificación del flujo de honorarios; no corresponde concluir que todos los registros subyacentes estén fusionados.
