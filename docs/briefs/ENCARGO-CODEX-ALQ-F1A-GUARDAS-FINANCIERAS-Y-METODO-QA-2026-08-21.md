# Encargo Codex · ALQ F1-A · guardas financieras y método · QA

**Fecha:** 21 de agosto de 2026  
**Modalidad actual:** preparar la autoridad de construcción; **cero implementación y cero ejecución**  
**Destino futuro único:** QA `rsjwqmpseknvydistgfr`  
**Producción prohibida:** `wajkfydxutptcvvfwrvq`

## 0 · Compuerta actual

Este documento todavía **no autoriza** crear o modificar SQL, funciones, constraints, triggers,
RPC, HTML/JS, `.gitignore`, migraciones, runners ni datos. Tampoco autoriza conexiones mutantes,
deploy, commit, push o publicación.

La construcción empieza únicamente después de:

1. PASS de Cloud sobre este encargo y la adenda de frontera; y
2. ACK literal de Mariano:

```text
AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821
```

Ese ACK autoriza **construir artefactos y hacer mediciones read-only en QA**. Autoriza también
descargar a `/private/tmp` —sin instalar ni mover a `/Applications`— un único asset oficial de
Postgres.app v2.8.5 que contenga PostgreSQL 17.6, exclusivamente para el fixture local; URL, tamaño
y SHA-256 quedan en el manifiesto. No autoriza ningún otro paquete, CLI o credencial. No autoriza
aplicar la migración. La ejecución futura requerirá otro PASS de Cloud ligado a los SHA finales y
otro ACK literal, distinto, que recién se sellará con la fuente, el coordinador y el manifiesto.

## 1 · Autoridad y cadena

Este encargo deriva de:

- Plan Único V3: `aa55c471fc50d1354f32583d786f3970766c99edfdd1b8eabb577bab30dab641`;
- Adenda V3 O1–O6: `bfd93b829244d08ea45a6059b43253aefca8d0e891ef932196737d83d4de0738`;
- auditoría Cloud del plan: `c39e05edd07a2dec9489b61d41994af64c97f139cdba7de33b9f859e62109cf3`;
- cierre Cloud F0: `2b20d8de4e50d968ace163619d5fa22a4bd9a8dfe706f3a8fb2472a7ec421da1`;
- adenda de 27 vistas y piloto Ñancos 52 · D 001:
  `cf8a85a238cfe8fa9fe65e645880f5533d606560f9698c4abc797c995ccb415f`;
- informe D0: `8b0ab2dd137522fd6b180a0aef1bb9eb38315c4f7f514639939d557132f7bd9a`;
- manifiesto D0: `941177d611ebe132de16e7176d50f6002faac2c88249204c5ad99357dcf429f0`;
- resultado D0: `8af80c8fc5541495def056de899a5c73398cd7ce2b1ef65ba747c7af0b5230e2`;
- SQL de evidencia D0: `f9ce4b38b71b04e1ae5de79dcfff2a9601e8e191bcf6b3f1be061917412251f5`;
- postcheck fresco D0: `135ee355d5bcea52b75ed0f60e6d69f3420ba9254e5e508b789a1f51023cc4c7`;
- sello Cloud D0: `c1b86a348612c4eb40fb9afe473690f73127274db48882a4972dad02fe3d9495`;
- Adenda 2 de frontera F1-A/F1-B:
  `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7`.

El encargo productivo de higiene `SECURITY DEFINER` sigue siendo una ventana separada. No se
encadena como mutación ni se ejecuta dentro de F1-A.

## 2 · Decisión cerrada de alcance

**Los 14 rojos de D0 entran en F1-A.** Cloud tiene razón: son defectos de integridad que hoy
impiden administrar dinero real y no deben esperar una fase funcional intermedia.

La frontera es:

- **F1-A:** validación server-side, integridad, atomicidad, concurrencia, idempotencia, método,
  seguridad, observabilidad y contrato de despliegue/recuperación;
- **F1-B:** derivación funcional server-owned de relaciones, montos, estados, períodos, ajustes,
  facturas compartidas, operaciones faltantes y rendiciones.

F1-A puede consultar la verdad de la base para validar un candidato; no convierte al payload del
cliente en fuente de verdad. Las futuras operaciones de F1-B deberán derivar sus hechos y volver a
pasar por las mismas invariantes de F1-A.

D0 está terminado y sellado. Sus archivos no se editan, no se copian como migración y no se vuelven
a ejecutar.

## 3 · Objetivo de F1-A

Entregar un paquete versionable que:

1. convierta los 14 vectores aceptados por D0 en rechazos financieros deterministas;
2. conserve exactamente los tres controles que ya funcionan;
3. pruebe casos válidos para impedir un falso verde por “rechazar todo”;
4. proteja los RPC y todos los caminos DML permitidos con triggers activos; no promete proteger a
   un superuser que deshabilita deliberadamente las guardas;
5. ofrezca para las ocho operaciones una ruta v2 que valida antes de crear una operación preparada
   y revalida bajo locks al aplicar, sin cambiar silenciosamente el contrato v1 de las 45;
6. elimine residuos financieros y fixtures en rutas de error, cancelación y concurrencia, y
   distinga de ellos los registros técnicos de rechazo que se conserven intencionalmente;
7. incorpore el método F1-A completo: migración canónica, suite, idempotencia, observabilidad,
   aislamiento, privilegios, restore, rollback y manifiesto;
8. deje F1-B y toda operación con datos reales fuera de esta instalación.

## 4 · Matriz financiera obligatoria

Los códigos siguientes son parte de la **superficie de integridad PostgreSQL**: validadores,
constraint triggers, DML directo permitido y compatibilidad v1 los emiten con SQLSTATE `P0001`,
salvo los tres controles heredados de §4.2. La API v2 traduce esos resultados a un envelope
estructurado según §5.2; que el transporte v2 complete con SQLSTATE `00000` no convierte el rechazo
en éxito. Ningún error de autenticación, formato, FK genérica, ACL o modo `custodiada` puede
sustituir la guarda financiera nominal.

### 4.1 · Los 14 rojos que deben cerrarse

| Caso | Operación | Invariante | Error nominal nuevo |
|---|---|---|---|
| N01 | `nota_emitir` | nota y cargo en la misma moneda | `ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE` |
| C01 | `credito_consumir` | crédito, consumo y cargo en la misma moneda | `ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE` |
| C02 | `credito_consumir` | `credito.contrato_id=cargo.contrato_id`, `credito.parte_id=cargo.deudor_parte_id` y la propiedad del contrato coincide con `cargo.propiedad_id` | `ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE` |
| T01 | `transferencia_interna` | cada pierna coincide con la moneda de su cuenta; ambas cuentas comparten moneda | `ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE` |
| T02 | `transferencia_interna` | las dos cuentas están activas al momento de la operación | `ALQ_F1A_T02_CUENTA_INACTIVA` |
| D01 | `deposito_evento_registrar` | el nuevo consumo no supera el saldo global disponible | `ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE` |
| D02 | `deposito_liquidar_y_devolver` | líneas cubiertas más devolución no superan el saldo disponible | `ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO` |
| R01 | `reversa_con_reapertura` | una reversa aplicada exige reapertura suficiente por cargo | `ALQ_F1A_R_REAPERTURA_INSUFICIENTE` |
| R02 | `reversa_con_reapertura` | una reapertura parcial inferior a lo desimputado también falla | `ALQ_F1A_R_REAPERTURA_INSUFICIENTE` |
| J01 | `cargo_manual_emitir` | la propiedad del cargo coincide con la del contrato | `ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE` |
| J02 | `cargo_manual_emitir` | el período pertenece al contrato del cargo | `ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE` |
| J03 | `cargo_manual_emitir` | para `alquiler_periodo`, `cargo.deudor_parte_id=contrato.inquilino_parte_id` | `ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE` |
| J04 | `pago_multimoneda` | paga el deudor o existe garantía del mismo contrato con ese `garante_parte_id` y `transaccion.fecha <@ garantia.vigencia` | `ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE` |
| J05 | `pago_multimoneda` | el beneficiario coincide con el acreedor histórico fijado en el cargo | `ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE` |

Reglas semánticas selladas:

- el modelo actual sólo tiene `contrato.inquilino_parte_id`: co-locatarios quedan fuera hasta que
  F1-B los modele expresamente;
- un garante que cumple el predicado exacto de J04 puede pagar, pero no reemplaza al deudor de J03;
- J05 no consulta al titular “actual”: usa el acreedor ya fijado en el cargo;
- R01/R02 usan una invariante acumulativa sobre cada transacción original `O`. En moneda origen:

  ```text
  aplicado_neto(O)
    = SUM(alq_aplicacion.importe_origen WHERE transaccion_id=O.id)
      - SUM(alq_aplicacion_reversa.importe_origen_revertido
            JOIN alq_transaccion_caja R
              ON R.id=alq_aplicacion_reversa.reversa_transaccion_id
            WHERE R.reversa_de=O.id AND R.estado='confirmada')

  fondos_netos(O)
    = O.monto
      - SUM(alq_transaccion_caja.monto
            WHERE reversa_de=O.id AND estado='confirmada')

  aplicado_neto(O) <= fondos_netos(O)
  ```

  Equivale a exigir una reapertura acumulada mínima en moneda origen de
  `greatest(0, SUM(aplicado_original)+SUM(reversado_confirmado)-O.monto)`. El payload elige qué
  aplicaciones desimputa, pero siempre bajo T1–T4. Ejemplo sellado: pago 100, aplicado 60 y nueva
  reversa 50 exige reabrir por lo menos 10; dinero nunca imputado no genera reapertura;
- todos los saldos/asserts usan ese mismo filtro de reversa `confirmada`. Una fila
  `alq_aplicacion_reversa` sólo puede pertenecer a una reversa confirmada; una reversa
  pendiente/rechazada no lleva reaperturas ni altera ningún lado de la fórmula. Con reaperturas
  ligadas, `estado`, `reversa_de`, monto, moneda, dirección y cuenta quedan inmutables; toda
  transición permitida revalida la fórmula bajo lock;
- el control por reapertura excesiva se evalúa antes del control nuevo por insuficiencia, para
  conservar la evidencia de RCTRL;
- los locks se toman sobre raíces financieras en orden determinista antes de sumar saldos o validar
  relaciones; un cálculo sin lock y una escritura posterior no alcanza.

Para T01/T02, `alq_transaccion_caja.moneda` es el snapshot monetario. Toda nueva transacción suma
`cuenta_validacion_version=1` server-owned; si es `custodiada`, también incorpora
`cuenta_validada_activa_at`, fijado sólo después de bloquear la cuenta y verificar `activa=true` y
moneda coincidente. Si es `externa_informativa`, el timestamp queda `NULL`. La moneda de una cuenta
ya referenciada es inmutable; `activa` puede cambiar después sin volver inválida la historia.

Las filas pre-F1-A conservan `cuenta_validacion_version IS NULL` y
`cuenta_validada_activa_at IS NULL`: no se inventa una validación histórica. Una constraint
`NOT VALID` distingue literalmente legado `(version IS NULL AND timestamp IS NULL)` de fila nueva
validada `(version=1 y timestamp coherente con ambito)`. El `BEFORE INSERT` siempre sobrescribe lo
enviado por el caller con versión/timestamp server-owned. Un `BEFORE UPDATE` rechaza cualquier delta
en la tupla histórica (`ambito`,`cuenta_custodia_id`,`moneda`,`cuenta_validacion_version`,
`cuenta_validada_activa_at`), tanto en filas nuevas como legacy; sólo siguen posibles las
transiciones server-owned de otros campos ya admitidas. Así un UPDATE de estado en una fila legacy
no obliga a fabricar timestamp y tampoco puede cambiarle cuenta, moneda o ámbito. Las siete
custodiadas legacy y el resto del corte se sellan por IDs/hash en el PRE.

La suite prueba timestamp/versión forjados sobre cuenta inactiva, timestamp+versión server-owned
sobre cuenta activa, desactivación posterior sin reescribir historia y UPDATE de cuenta, moneda,
ámbito, versión o timestamp en fila nueva y legacy. También prueba una transición permitida fuera
de esa tupla y la preservación literal de los `NULL` legacy.

### 4.2 · Los tres controles heredados, byte-semántica estable

| Control | Resultado exacto que no puede cambiar |
|---|---|
| TCTRL · misma cuenta origen/destino | SQLSTATE `P0001`; `ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO` |
| RCTRL · reapertura 41 sobre reversa 40 | SQLSTATE `P0001`; `ALQ_T1_REAPERTURAS_SUPERAN_REVERSA` |
| ACTRL · ARS→USD sin conversión | SQLSTATE `23514`; constraint `alq_aplicacion_moneda_ck`; mensaje literal `new row for relation "alq_aplicacion" violates check constraint "alq_aplicacion_moneda_ck"` |

### 4.3 · Depósito: fórmula conservadora de F1-A

Para no inventar en F1-A la derivación funcional que corresponde a F1-B/F3, la fórmula queda
literalmente sellada:

```text
saldo_disponible = alq_deposito.monto_constituido
  - SUM(alq_deposito_evento.monto
        WHERE tipo IN ('aplicacion','devolucion','transferencia_a_sucesor'))
  - SUM(alq_deposito_liquidacion_linea.monto
        WHERE liquidacion.estado IN ('aprobada','pagada'))
```

Los `SUM` vacíos valen cero. Eventos `constitucion` y `actualizacion` aportan cero: no vuelven a
sumar ni amplían `monto_constituido` en F1-A. `alq_aplicacion` no participa de esta fórmula y no se
duplica con el evento de depósito.

- todos los términos y la nueva operación deben tener la moneda del depósito;
- todo `cargo_residual_id IS NOT NULL` falla en F1-A con
  `ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO`; no sólo cuando haya exceso. Su semántica queda para F1-B;
- toda línea pertenece al depósito fuente y a su contrato/propiedad/moneda;
- `transferencia_a_sucesor` exige literalmente
  `contrato_sucesor.predecesor_id = deposito.contrato_id` y
  `contrato_sucesor.propiedad_id = contrato_origen.propiedad_id`.

El paquete debe probar saldo individual, suma acumulada, doble intento y dos consumos concurrentes.

## 5 · Arquitectura de las guardas

### 5.1 · Autoridad única

- No se agregan ramas nuevas al `CASE` monolítico.
- Se amplían validadores privados existentes y se agregan validadores privados versionados donde
  hoy no existen.
- Las invariantes que deben cubrir escritores privilegiados se respaldan con constraint triggers
  diferidos y/o constraints reales; no quedan sólo dentro de un RPC.
- El ejecutor sigue forzando `SET CONSTRAINTS ALL IMMEDIATE` antes de declarar una operación
  aplicada.
- Un assert financiero versionado se incorpora al assert global y detecta datos incompatibles ya
  persistidos, sin “repararlos” automáticamente.
- Se inventariarán todos los escritores de `alq_nota`, `alq_credito_consumo`,
  `alq_transaccion_caja`, `alq_aplicacion`, `alq_deposito_evento`,
  `alq_deposito_liquidacion(_linea)`, `alq_aplicacion_reversa`, `alq_cargo` y `alq_operacion`. Para
  esta última se cubren preparar/aplicar v1/v2, cancelar, sanear, propietario directo, DML
  privilegiado y toda transición/constraint de estado, expiración, key/hash y actor. La matriz incluye
  caminos alternativos como `transaccion_registrar` + `aplicacion_asignar`, `credito_devolver`,
  `deposito_liquidar` y DML privilegiado con triggers activos; una prueba sólo por los ocho nombres
  compuestos no demuestra cierre.
- Se inventariarán también todos los escritores de `alq_private.alq_hecho_idempotente_v2` y
  `alq_private.alq_operacion_evento_v2`: preparar, lookup, aplicar, cancelar, reintentar, sanear,
  cleanup QA allowlisted y DML privilegiado. En el hecho quedan inmutables
  `namespace`, `clave_version`, `clave_sha256`, `payload_sha256` y actor original; sólo la transición
  server-owned puede fijar `aplicada_operacion_id`. FK, índice único parcial y trigger/assert
  garantizan a lo sumo una operación aplicada por hecho. Todo writer bloquea primero la fila/clave
  del hecho y la suite prueba bypass y carreras.
- También se inventariarán los escritores de las fuentes mutables que determinan esas guardas:
  `alq_contrato`, `alq_periodo`, `alq_garantia`, `alq_cuenta_custodia`, `alq_deposito` y
  `alq_credito`, además de `alq_conversion_moneda`. El catálogo declara cuáles campos raíz quedan
  inmutables una vez referenciados, cuáles admiten transición y qué lock/revalidación exige cada
  cambio. En una conversión referenciada, importes, monedas, tasa, fuente, timestamp y regla de
  redondeo quedan inmutables o se versionan; una `UPDATE` privilegiada no puede reescribir historia.

#### Orden total de locks

Toda operación toma una foto inicial del conjunto de raíces, adquiere advisory/row locks en este
orden global —nunca en el orden del payload— y vuelve a consultar las relaciones. Si el conjunto
releído difiere de la foto, aborta sin mutar; no continúa con un grafo descubierto antes del lock:

1. clave idempotente;
2. propiedad;
3. contrato, período y garantía;
4. cuenta de custodia;
5. depósito;
6. transacción original o ya existente;
7. cargo;
8. crédito;
9. aplicación;
10. conversión y liquidación.

Dentro de una clase, UUID ascendente. Relaciones inmutables se leen con el lock mínimo suficiente;
saldos, estados y cuentas mutables llevan `FOR UPDATE`. Una operación que necesite varias clases
respeta siempre el mismo ranking. La suite debe demostrar dos órdenes de llegada opuestos sin
deadlock, doble consumo ni lectura perdida. Todo escritor de una aplicación bloquea primero su
transacción raíz; así, después de bloquear una transacción, no puede aparecer una aplicación nueva
fuera del conjunto revalidado.

### 5.2 · Preparar y aplicar son dos transacciones

La regresión D0 llamó ambos RPC dentro de una misma subtransacción; el producto real no. La decisión
de compatibilidad queda cerrada así:

1. los RPC v1 conservan firma, retorno y semántica de excepción para las 45 operaciones;
2. las constraints/guardas nuevas hacen que v1 falle cerrado en las ocho rutas, pero no se cambia
   una excepción por JSON ni se revoca v1 dentro de este paquete;
3. se agregan `alq_admin_preparar_v2`/`alq_admin_aplicar_v2` sólo para la allowlist de ocho
   operaciones de §4.1; ninguna de las otras 37 entra por v2;
4. `preparar_v2` bloquea/busca la clave sin insertarla y ejecuta prevalidación financiera antes de
   insertar `alq_hecho_idempotente_v2` y `alq_operacion`. Un rechazo inicial crea sólo el recibo
   técnico del comando: cero hecho y cero operación. No duplica ni falsifica constraints heredadas:
   ACTRL sigue siendo probado por la constraint real;
5. `aplicar_v2` bloquea raíces, revalida y muta dentro de un subbloque. Si hay deriva, el subbloque
   revierte efectos financieros; la transacción exterior marca la operación `rechazada` y devuelve
   `{ "ok": false, "codigo": "...", "operacion_request_id": "...",
   "comando_request_id": "..." }` sin lanzar después un error que revierta ese registro;
6. éxito v2 devuelve `{ "ok": true, "resultado": {...}, "operacion_request_id": "...",
   "comando_request_id": "..." }`; todo consumidor debe exigir `ok === true`;
7. `preparar_v2` directo inválido puede devolver `ok=false` sin crear operación. La superficie de
   integridad subyacente conserva los SQLSTATE/códigos de §4;
8. toda preparación tiene `expires_at = preparada_at + interval '15 minutes'`. V1 y v2 niegan
   aplicación desde ese instante. “Expirada” es estado efectivo derivado; no se agrega un valor
   inexistente al CHECK de `estado`;
9. cancelación v2 y rechazo por deriva transicionan `preparada → rechazada` mediante retorno normal;
   sólo el actor preparador o un supervisor vigente pueden cancelar;
10. una fila v1 que quedó preparada por una excepción es inoperable al vencer. El paquete expone
    una consulta server-owned de preparadas activas/vencidas y una función privada idempotente de
    saneamiento; no promete una alerta push ni un cron que este paquete no instala;
11. baseline conocido: cero preparadas. No se migran filas legacy por conveniencia;
12. repetir el mismo comando aplicar/cancelar devuelve su recibo; otro comando sobre un estado final
    devuelve el resultado final coherente o un código estable, sin nueva transición.

`aplicar_v2` sólo captura como rechazo de negocio los códigos financieros `P0001` y las
constraints nominales incluidos en una allowlist sellada. `40P01` (deadlock), `40001`
(serialización), `57014` (timeout/cancelación), `42501` (privilegio), errores de conexión y toda
excepción no catalogada se propagan como fallo técnico: no se convierten en `ok=false`, no se marca
la operación como rechazada y nunca se reintentan automáticamente. ACTRL puede traducirse en v2
sólo identificando SQLSTATE `23514` **y** constraint `alq_aplicacion_moneda_ck`; la regresión de
integridad sigue llegando a la constraint PostgreSQL real.

Firmas públicas exactas nuevas:

- `public.alq_admin_preparar_v2(uuid,text,jsonb) returns jsonb` —
  `(p_comando_request_id,p_operacion,p_payload)`;
- `public.alq_admin_aplicar_v2(uuid,uuid,text,text,jsonb) returns jsonb` —
  `(p_operacion_request_id,p_comando_request_id,p_operacion,p_firma,p_payload)`;
- `public.alq_admin_cancelar_v2(uuid,uuid,text) returns jsonb` —
  `(p_operacion_request_id,p_comando_request_id,p_motivo)`;
- `public.alq_admin_reintentar_v2(uuid,uuid,text) returns jsonb` —
  `(p_hecho_id,p_comando_request_id,p_motivo)`.

Envelope de preparación exitosa: `ok=true`, `estado=preparada`, `comando_request_id`,
`operacion_request_id`, `operacion_id`, `hecho_id`, `operacion`, `firma`, `expires_at`. Rechazo
inicial sin hecho ni operación: `ok=false`, `estado=rechazada_sin_fila`, `comando_request_id`,
`codigo`, `reintentable=false`, `requiere_nueva_preparacion=true`; no inventa IDs ni puede llamar
`reintentar_v2`. Aplicación/cancelación final: `ok`, `estado`, ambos request IDs, `codigo` cuando
corresponda y `resultado` sólo si existe. El esquema JSON completo y sus tipos se sellan en el
catálogo; no se agregan campos secretos ni se refleja el payload.

La única modificación transversal admitida en `alq_admin_aplicar_core_v1` es la guarda de
`expires_at` antes del dispatcher. Las otras 37 operaciones conservan semántica. La suite compara
firmas, grants, catálogo y contrato de las 45, y ejecuta smoke tests sanitizados de las operaciones
ya cubiertas por las siete ondas históricas. Cualquier otro delta al core v1 es STOP.

Los únicos consumidores activos autorizados para el cambio de contrato son:

- `admin/alquileres-admin-qa.html`;
- `admin/alquileres-franjas-qa.html`.

Se actualizan de forma mínima para elegir v2 sólo en las ocho operaciones y verificar `ok=true`.
Cada click de preparar, aplicar, cancelar o reintentar genera su propio `comando_request_id` UUID y
lo persiste hasta obtener el recibo; `operacion_request_id` identifica el intento y nunca se usa
como identidad única del comando.
Un `rechazada_sin_fila` muestra el código y, si `requiere_nueva_preparacion=true`, vuelve al mismo
borrador para corregirlo; un click posterior genera un comando nuevo a `preparar_v2` con la misma
clave. Sólo cuando existe `hecho_id` y el servidor devuelve un rechazo terminal
`reintentable=true`, muestran la acción explícita “Reintentar”; nunca la disparan por timeout,
reload ni automáticamente. Esa
acción genera un UUID por click, lo conserva durable hasta recibir un envelope terminal y llama
`alq_admin_reintentar_v2` sólo después del click del actor/supervisor. Doble click, reload o pérdida
de respuesta reutilizan ese UUID; después de un rechazo terminal confirmado, un click posterior
genera otro UUID y reutilizar el anterior sólo repite su recibo. Los tests cubren todo ese ciclo. No se toca el
respaldo histórico. Antes de construir se repite el inventario de consumidores del repo y del
catálogo remoto; un consumidor activo adicional es STOP y amplía el allowlist sólo con auditoría.
El resto de la UI, su diseño y su publicación quedan fuera.

### 5.3 · Idempotencia por hecho

Las ocho rutas v2 exigen una identidad estable del hecho, separada tanto del
`operacion_request_id` como del `comando_request_id`:

| Operación | Namespace fijo | Campo de clave |
|---|---|---|
| `nota_emitir` | `alq.nota` | `nota_ref` |
| `credito_consumir` | `alq.credito_consumo` | `consumo_ref` |
| `transferencia_interna` | `alq.transferencia` | `transferencia_ref` |
| `deposito_evento_registrar` | `alq.deposito_evento` | `evento_ref` |
| `deposito_liquidar_y_devolver` | `alq.deposito_liquidacion` | `liquidacion_ref` |
| `reversa_con_reapertura` | `alq.reversa` | `reversa_ref` |
| `cargo_manual_emitir` | `alq.cargo_manual` | `cargo_fuente_ref` |
| `pago_multimoneda` | `alq.pago` | `pago_fuente_ref` |

La referencia usa el identificador inmutable del proveedor/documento/staging cuando existe. Para
una acción manual sin fuente externa, es el UUID de un borrador creado una sola vez **antes del
primer request** y persistido por la pantalla en almacenamiento durable del navegador, bajo una
clave acotada por `auth.user.id + namespace + slot_de_borrador`. Debe sobrevivir reload, crash y
pérdida de respuesta; sólo se elimina al confirmar un estado terminal o al descartar expresamente
el borrador. Nunca se regenera dentro de cada reintento. La API permite consultar/reanudar por esa
referencia. Es identidad del proceso de negocio, no ninguno de los request IDs, no contiene datos
sensibles y nunca se comparte entre usuarios.

Una referencia externa desnuda como `"123"` no es global. La clave canónica versionada es:

```text
{
  "v": 1,
  "tipo_fuente": "proveedor_externo|documento_interno|staging|manual",
  "autoridad_fuente": <id server-owned del proveedor/sistema>,
  "cuenta_fuente": <id server-owned de cuenta/convenio>,
  "id_inmutable": <id externo, UUID interno o UUID de borrador>
}
```

El servidor deriva `tipo/autoridad/cuenta` desde la integración, documento o staging autenticado;
no acepta que el cliente invente esos campos. Cada adaptador sella normalización y límite de bytes,
rechaza vacío, controles y ambigüedad; para UUID interno/manual exige representación UUID canónica.
La serialización `jsonb` canónica de esa identidad se hashea como `clave_sha256`; el payload
normalizado de la operación se hashea por separado como `payload_sha256`. La unicidad física del
hecho es `(namespace, clave_version, clave_sha256)`. Se conserva evidencia suficiente no sensible
para diagnosticar una colisión sin guardar credenciales.

El servidor fija el namespace, valida la referencia y calcula ambos hashes. Adquiere el lock y
busca `(namespace, clave_version, clave_sha256)` **antes** de volver a validar el estado financiero:
un hecho ya aplicado con el mismo `payload_sha256` devuelve su resultado original aunque el mundo
haya cambiado; sólo una clave nueva o un intento todavía preparado se revalida. La unicidad atómica
del hecho produce:

- misma clave canónica + mismo `payload_sha256`: mismo hecho/resultado o mismo intento activo;
- misma clave canónica + `payload_sha256` distinto: conflicto cerrado;
- dos solicitudes simultáneas: un solo hecho;
- pérdida de respuesta: consulta/reanudación por la misma clave;
- clave nueva: hecho distinto, incluso si monto/fecha coinciden legítimamente.

Si la clave todavía no existe, el lock no autoriza insertarla antes de tiempo: primero se ejecuta la
prevalidación. Un rechazo inicial persiste sólo el recibo técnico del `comando_request_id` con
namespace, ambos hashes y envelope; deja cero `alq_hecho_idempotente_v2` y cero `alq_operacion`.
Un comando nuevo con la misma clave y payload corregido puede volver a prevalidar y crear el hecho;
repetir el comando viejo devuelve su rechazo original. La suite prueba exactamente
`0 hecho / 0 operación / 1 recibo`, corrección con clave conservada y replay del rechazo viejo.

Una deriva de negocio no puede envenenar para siempre una referencia externa válida. Se separa el
hecho idempotente de sus intentos: una tabla privada `alq_hecho_idempotente_v2` posee la clave única,
`payload_sha256`, actor económico original y, si existe, la operación aplicada; cada intento es una
fila distinta de `alq_operacion` ligada al hecho, con número creciente y unicidad
`(hecho_id,intento)`. Existe como máximo un intento `aplicada` por hecho. Una fila `rechazada` es
terminal e idempotente para ese intento y nunca se reabre ni se sobrescribe.

Un nuevo intento requiere llamada explícita
`public.alq_admin_reintentar_v2(p_hecho_id uuid,p_comando_request_id uuid,p_motivo text) returns jsonb`, por
el actor original o un supervisor vigente. Sólo se admite si el intento anterior quedó
`rechazada`, no produjo efecto financiero y no existe intento activo/aplicado; vuelve a validar
todo bajo los mismos locks, incrementa el intento y agrega evento de auditoría. No es retry
automático. Un hecho ya aplicado jamás genera otro intento, y un payload distinto jamás reutiliza
la clave.

Contrato exacto de reintento:

- misma `p_comando_request_id` se resuelve primero contra el recibo append-only del evento y devuelve
  byte-semánticamente el mismo envelope; nunca duplica ni reevalúa;
- si la revalidación previa vuelve a fallar, crea exactamente un nuevo intento terminal
  `rechazada` sin efecto financiero, registra el recibo/evento y devuelve `ok=false`,
  `estado=rechazada`, `codigo`, `hecho_id`, `operacion_id`, `intento`, `reintentable` y
  `operacion_request_id` y `comando_request_id`;
- si pasa, crea exactamente un nuevo intento `preparada` y devuelve `ok=true`, `estado=preparada`,
  `hecho_id`, `operacion_id`, `operacion_request_id`, `comando_request_id`, `operacion`, `firma`,
  `intento` y `expires_at`;
- otro `p_comando_request_id` mientras hay intento activo devuelve `ok=false`,
  `estado=preparada`, `codigo=ALQ_F1A_REINTENTO_YA_ACTIVO` y la referencia del intento activo;
- si el hecho ya está aplicado, devuelve el resultado aplicado original con `ok=true` y no crea
  intento; si el último intento está rechazado, `preparar_v2` con la misma clave+payload devuelve
  ese rechazo con `hecho_id`, `operacion_id`, `intento`, `reintentable=true` y nunca reintenta
  implícitamente;
- aplicar/cancelar el nuevo intento conserva los envelopes y reglas generales de §5.2.

La suite cubre rechazo inicial sin hecho→corrección→nueva preparación, rechazo de intento con
hecho→reintento explícito, revalidación que vuelve a fallar, repetición del mismo comando, carrera
de dos comandos distintos y pérdida de respuesta.

El actor económico original queda sellado en el hecho. Otro actor no puede apropiárselo: sólo un
supervisor vigente puede consultar o reanudar administrativamente una referencia ajena, sin cambiar
actor, contraparte ni beneficiario. `alq_operacion.actor_parte_usuario_id` permanece como actor
original inmutable. Cada transición v2 persistida agrega en
`alq_private.alq_operacion_evento_v2` un evento append-only con
`namespace`, `clave_version`, `clave_sha256`, `payload_sha256`, `run_id` cuando sea fixture,
`hecho_id`, `operacion_id` y
`operacion_request_id` —no único— opcionales bajo un CHECK sellado, tipo/acción, actor efectivo,
rol/capacidad snapshot, timestamp, código, `comando_request_id` nullable,
`comando_sha256` y el envelope no sensible devuelto. Un índice único parcial sobre
`comando_request_id WHERE comando_request_id IS NOT NULL` hace idempotente cada invocación sin
impedir los eventos sucesivos preparar→aplicar/cancelar del mismo intento. Antes de ejecutar un
comando v2 se busca `comando_request_id`: mismo hash+acción+actor autorizado devuelve el envelope
almacenado; hash, acción o actor incompatibles son conflicto. Eventos automáticos sin comando pueden
dejar ese campo `NULL`. Así una cancelación/reanudación por supervisor no se atribuye falsamente al
preparador y también quedan idempotentes comandos que no crean intento —por ejemplo hecho ya
aplicado o intento activo—. El evento no guarda payload ni secretos y su writer/ACL entra en el
inventario.

Las formas físicas admitidas son exactas: rechazo inicial sin hecho tiene los tres IDs de
hecho/operación en `NULL`; todo evento ligado a un intento tiene los tres no nulos. No alcanza un
CHECK para probar pertenencia entre tablas: `alq_operacion` incorpora la clave única
`(id,hecho_id,request_id)` y el evento una FK compuesta
`(operacion_id,hecho_id,operacion_request_id)` a esa clave. Así un DML privilegiado no puede ligar
un envelope al hecho o request equivocado. La suite incluye el bypass negativo y el postcheck sella
CHECK, UNIQUE, FK e índices literales.

“Append-only” rige para todas las rutas de negocio y RPC. La única excepción es el cleanup
operativo de la calificación QA: SQL directo sellado, ejecutado como `postgres`, con guarda positiva
de QA y allowlist exacta por namespace+`run_id`, puede limpiar el conjunto previamente enumerado
después de hashear la evidencia. Primero exige cero hijo financiero y cero ID fuera del conjunto;
luego borra, en orden FK, eventos → intentos/`alq_operacion` →
`alq_hecho_idempotente_v2` → fuente/staging sintética allowlisted. Un padre, clave o borrador
sintético residual es fallo. No existe RPC ni función permanente de borrado, no acepta IDs aportados
fuera de la enumeración y no toca eventos ni hechos no sintéticos. El recibo externo conserva los
hashes y respuestas A/B. En producción esa excepción de cleanup no existe.

Además se entrega un catálogo de las 45 operaciones vigentes que clasifica cada una como hecho
externo, transición administrativa o compuesta, identifica sus escritores y declara su estrategia
idempotente. F1-A implementa el kernel y las ocho filas anteriores; la migración gradual de otras
operaciones permitida por el Plan no habilita datos reales: cualquier hecho externo que el catálogo
marque `PENDIENTE` queda fuera de operación real hasta su propia migración. Esa última frase es una
regla de gobernanza en QA, no una barrera técnica falsa sobre los RPC v1 todavía existentes; la
única barrera técnica general incorporada aquí es `ALQ_CUSTODIADA_DESHABILITADA` donde corresponda.

## 6 · Método técnico F1-A

### 6.1 · Migración canónica

La autoridad forward será un único archivo de contenido inmutable bajo
`supabase/migrations/_sources/`, y la ejecución enviará **esos mismos bytes** al MCP de Supabase
acotado al proyecto QA. No se mantiene una copia divergente en `docs/auditorias/sql/`.

El canal DDL futuro queda cerrado así:

1. no se instala ni autentica Supabase CLI y no se usa un proyecto “linked”;
2. no se ejecuta el forward por `psql` ni por `execute_sql`;
3. tras PASS, publicación y ACK de ejecución, Codex usa exclusivamente
   `apply_migration(name='alq_f1a_guardas_financieras_y_metodo', query=<bytes sellados>)` en un
   conector cuya configuración inyecta `project_ref=rsjwqmpseknvydistgfr`;
4. el tool oficial registra la migración en `supabase_migrations.schema_migrations`; el PRE exige
   que ese nombre no exista y el POST exige exactamente una fila nueva;
5. no se inserta, edita, borra ni “repara” manualmente esa tabla.

Estado conocido al redactar: el MCP disponible el 2026-08-21 todavía expone herramientas
account-wide (`list/create/pause/restore project`, organización/costos y branching), por lo que
**no está project-scoped y no queda autorizado para mutar**. Esto no bloquea la construcción local
ni probes QA read-only con `project_id` literal; sí bloquea el futuro `apply_migration`. Antes del
ACK de ejecución debe reconectarse con `project_ref=rsjwqmpseknvydistgfr` y, preferentemente,
`features=database,docs`; el inventario debe demostrar que desaparecieron las herramientas de
cuenta y de mutación sobre otros proyectos. En ese modo scoped, el proyecto se inyecta y el schema
de las tools **no acepta `project_id`**: no se falsifica un argumento que ya no existe. Si no puede
demostrarse, STOP y nueva decisión de
autoridad: no se cae automáticamente a CLI, dashboard ni al MCP amplio.

El MCP actual acepta `name` y `query`, pero no un `version` elegido por el cliente: genera el
timestamp remoto al aplicar. Para no fingir una correspondencia que aún no existe, se usa este
protocolo de dos nombres:

- **antes de QA:** Mariano publica la fuente sellada en
  `supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql`; Cloud verifica ruta y
  SHA, y `_sources/` queda fuera del patrón ejecutable de `db push`;
- **después de aplicar:** `list_migrations` entrega la versión remota `V`; Codex crea por copia
  byte-idéntica —sin editar SQL—
  `supabase/migrations/V_alq_f1a_guardas_financieras_y_metodo.sql`;
- Mariano publica ese espejo y Cloud verifica nombre, SHA igual al de `_sources`, versión/nombre
  remotos y SHA de la serialización canónica de `statements`;
- hasta ese último paso el estado es
  `INSTALADO_QA_PENDIENTE_ESPEJO_MIGRACION`; no se declara F1-A cerrado ni se avanza a F1-B.

Antes de habilitar en el futuro cualquier CLI, una prueba con la versión exacta elegida debe
demostrar que sólo escanea `supabase/migrations/*.sql` y no desciende a `_sources/`. Si una versión
futura incorpora recursión, la fuente se mueve a una ruta no ejecutable mediante enmienda; jamás se
permite que fuente y espejo se apliquen dos veces.

No se inventa hoy un timestamp local que el MCP no puede respetar. Tampoco se usa una reparación de
historial para ocultar el problema. Si Cloud demuestra antes de ejecutar un canal project-scoped
que permite fijar `V` sin ampliar acceso, puede reemplazar este protocolo sólo mediante una enmienda
auditada; nunca por conveniencia durante la corrida.

Como QA ya existe y sus DDL históricos no nacieron en esa carpeta, F1-A adopta un corte explícito:

- snapshot **schema-only**, sin datos ni secretos, bajo `supabase/baselines/`;
- inventario de cada DDL histórico y SHA que compone el corte adoptado;
- prueba local desde cero: baseline → migración F1-A → suites;
- en QA existente, el baseline nunca se ejecuta: el PRE demuestra igualdad de catálogo y recién
  entonces corre sólo la migración delta F1-A;
- el baseline no se presenta como historial de migraciones ni se inserta en
  `supabase_migrations.schema_migrations`; es una fuente reproducible del corte adoptado.

La construcción autorizada deberá modificar `.gitignore` con cuatro excepciones nominales:

- `!supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql`;
- `!supabase/migrations/*_alq_f1a_guardas_financieras_y_metodo.sql`;
- `!supabase/baselines/alq_v1_qa_adoptado_20260821.sql`;
- `!docs/auditorias/sql/ALQ-F1A-*.sql`.

No se liberan los SQL históricos. Esta carpeta local no tiene worktree Git: Codex no inicializa uno
ni afirma tracking. La secuencia obligatoria es **construir → Cloud PASS sobre bytes → Mariano
publica exactamente esos bytes → Cloud verifica commit/rutas/SHA remotos → ACK de ejecución → QA**.
No se ejecuta primero para publicar después: la fuente `_sources` siempre está publicada. El espejo
con `V` sólo materializa después el identificador que el servidor recién asigna al aplicar.

### 6.2 · Seguridad y aislamiento

- objetos internos en `alq_private`;
- toda función `SECURITY DEFINER`: necesidad justificada, owner sellado, `search_path=''`, objetos
  totalmente calificados y control explícito de actor cuando corresponda;
- en la misma migración: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated, service_role` y luego
  sólo los `GRANT` nominales mínimos demostrados;
- wrappers públicos mínimos, preferentemente `SECURITY INVOKER`;
- no se modifican `ALTER DEFAULT PRIVILEGES`;
- 27 vistas: `security_invoker=true`; `authenticated` sólo `SELECT`; `anon` y `service_role` sin
  privilegios directos; cero ACL de columna no-owner;
- las 46 tablas ALQ preexistentes conservan RLS habilitada y forzada. Las dos tablas privadas nuevas
  (`alq_hecho_idempotente_v2`, `alq_operacion_evento_v2`) también llevan RLS habilitada/forzada,
  cero policy para roles API y cero grant directo; sólo acceden las funciones privadas allowlisted;
- ninguna escritura directa nueva para roles API;
- ninguna función nueva queda expuesta por accidente a Data API o GraphQL.

La migración debe probar que sólo cambian los objetos ALQ expresamente allowlisted y que QR, E2,
Auth, Storage, CRM y producción quedan fuera.

La suite RLS contiene como mínimo seis actores: admin vigente, propietario vinculado, propietario
ajeno, `authenticated` sin vínculo, `anon` y `service_role`; agrega el solapamiento
propietario+admin. Para cada uno prueba vistas, RPC v1/v2 y DML directo. El resultado esperado
preserva lectura owner-scoped y niega toda mutación que no pase por el wrapper nominal.

La identidad de esos actores no se improvisa. `alq.alq_parte_usuario.auth_user_id` tiene una FK
inmediata a `auth.users`, y hoy no existe un propietario ALQ vinculado que sirva como fixture. La
ruta queda cerrada así:

- el admin de las pruebas separadas preparar/cancelar es el único bootstrap QA ya vigente; se lo
  resuelve dentro de la base y su UUID, correo y datos personales no salen en SQL, logs ni recibos;
- propietario vinculado, propietario ajeno, `authenticated` sin vínculo y propietario+admin usan
  usuarios Auth sintéticos con UUID deterministas del namespace reservado F1-A. Sus filas mínimas
  en `auth.users` y todos los vínculos ALQ se crean **sólo** dentro de la subtransacción o
  transacción de prueba que termina en `ROLLBACK`; nunca se confirman ni se crean por Admin API;
- `anon` y `service_role` no reciben fila Auth ficticia;
- cada prueba sella conteo+SHA de `auth.users` y de las tablas ALQ afectadas antes y después. Un
  actor sintético preexistente, una FK deshabilitada, un usuario real usado como propietario o una
  fila Auth que sobreviva al rollback es `SONDA_INVALIDA`/STOP.

Ésta es una excepción probatoria estricta, no una mutación funcional de Auth. No se cambian
usuarios, configuración, políticas ni código de Auth.

F1-A también entrega inventario versionado de todas las Edge Functions activas, fuente, config,
`verify_jwt` y dependencias/lock. No modifica ni despliega ninguna Edge Function en este paquete;
si una fuente remota no puede reconciliarse con bytes locales, F1-A no se declara cerrado. Salvo el
admin bootstrap resuelto server-side y no serializado, los fixtures son sintéticos y no contienen
correos, documentos, UUID reales ni datos personales reales.

### 6.3 · Observabilidad

Cada preparación creada, aplicación, rechazo persistido, expiración efectiva, conflicto idempotente
y resultado desconocido debe poder correlacionarse sin registrar secretos ni payloads sensibles
completos. Un rechazo de prevalidación no crea `alq_operacion`, pero sí su único recibo técnico
append-only en `alq_operacion_evento_v2`, ligado al `comando_request_id` aportado a `preparar_v2`;
así el mismo comando es idempotente sin sobrecargar el `operacion_request_id`. No se inventa un
efecto financiero ni una segunda tabla de log. Como mínimo:

- ambos request IDs cuando existan, operación, actor, estado, timestamps y código estable;
- clave/hash del hecho, nunca credenciales;
- latencia y causa de rechazo;
- consulta/contador server-owned para preparadas vencidas y conflictos; una alerta push o cron se
  declara deuda de operación y no se finge instalada;
- ledger/journal consistente con la decisión final.

## 7 · Suite y compuertas probatorias

### 7.1 · Nueva regresión F1-A

El SQL D0 permanece congelado. La prueba se divide en dos planos que no se confunden:

**Plano de integridad, 17 vectores:**

- 14/14 rechazos por SQLSTATE `P0001` y código financiero nominal de §4.1;
- 3/3 controles con el resultado literal de §4.2;
- `00000` prohibido sólo en esos 17 ensayos de la superficie de integridad;
- `SONDA_INVALIDA=0`;
- el rechazo ocurre al validar/mutar o forzar constraints, nunca en un oráculo posterior;
- Auth, ACL, cast, FK genérica o `custodiada` no cuentan como éxito;
- ACTRL llega a `alq_aplicacion_moneda_ck`; no se imita su texto con `RAISE`.

**Plano v2/state machine:**

- `ok=false` con transporte SQLSTATE `00000` es el resultado correcto para prevalidación, deriva,
  cancelación, expiración y conflicto estructurado; no se mezcla con los 17 de arriba;
- preparación y aplicación ocurren en transacciones distintas;
- se prueban reintento explícito, pérdida de respuesta, misma clave canónica+`payload_sha256`,
  conflicto por `payload_sha256` distinto y estados finales;
- se prueban preparar con comando A → aplicar con comando B → replay B, preparar con comando C →
  cancelar con comando D → replay D, y reutilizar un `comando_request_id` con otra acción, actor o
  argumentos; los eventos sucesivos comparten `operacion_request_id` sin colisionar;
- dos sesiones realmente distintas prueban la carrera idempotente y cada tope global.

**Controles válidos adyacentes, no sólo uno por familia:**

- N: nota y cargo de igual moneda;
- C: moneda, contrato, propiedad y parte coherentes;
- T: dos cuentas distintas, activas y de la misma moneda;
- D: evento exactamente en el saldo; dos eventos acumulados exactamente en el saldo; liquidación
  más devolución exactamente en el saldo; `constitucion/actualizacion` aportan cero; cargo residual
  no nulo falla; sucesor válido/inválido y moneda compatible/incompatible;
- R: reapertura exacta de un pago totalmente aplicado y caso con parte no imputada donde sólo se
  reabre lo efectivamente desimputado; múltiples reversas acumuladas y estados no confirmados;
- J: grafo propiedad/contrato/período/deudor coherente; pago por deudor; pago por garante vigente;
  beneficiario acreedor histórico incluso después de un cambio de titularidad.

Cada válido verifica el efecto financiero esperado, no sólo ausencia de error. También se prueba la
guarda general `ALQ_CUSTODIADA_DESHABILITADA`: se evalúa **después** de las guardas nominales para no
enmascararlas; los válidos de custodia ejercitan el validador financiero y luego demuestran que la
ruta operativa real sigue deshabilitada.

Vector acumulativo R obligatorio: `O=100`, aplicado original `60`, primera reversa confirmada `20`
con reapertura `0`; una segunda reversa `50` debe rechazar reapertura `10` y aceptar reapertura `30`.
Una reversa pendiente/rechazada no entra en ninguno de los dos SUM y no puede tener filas de
reapertura. Esta pareja impide que una implementación por-reversa pase como si fuera acumulativa.

### 7.2 · Protocolo físico de pruebas

PostgreSQL no permite que conexiones distintas vean DDL todavía no confirmado. Por eso:

1. **antes de QA**, un fixture PostgreSQL `17.6` (`server_version_num=170006`) exclusivamente local
   y descartable aplica baseline+migración y ejecuta los 17, todos los válidos, prepare/apply
   separados, consumidores, RLS y concurrencia. PostgreSQL 18 no sustituye esta compuerta;
2. el fixture local escucha sólo por socket Unix (`listen_addresses=''`), usa base
   `alq_f1a_fixture`, `data_directory` bajo `/private/tmp/alq-f1a-pg17-*` y una marca local sellada.
   La rama local del guard exige simultáneamente esas cuatro pruebas; ningún GUC elegido por el
   cliente habilita por sí solo el modo local. La rama QA exige la marca/ref positiva de QA. En
   producción ambas ramas deben ser falsas;
3. setup, baseline, runtime/imagen con versión+SHA, harness y teardown son artefactos auditados. No
   se instala un paquete global. Si no existe un runtime PG17 aprobado y checksum-pinned, la
   construcción hace STOP: no se declara PASS local con PG18;
4. **dentro del forward QA**, en la misma transacción que ve el DDL nuevo, se ejecutan los 17 sobre
   constraints/validadores, controles válidos directos y smokes de wrappers v2/RLS que no crean
   journal ni llaman `nextval`. Usa UUID explícitos, subtransacciones y fixtures sintéticos;
5. `apply_migration` conserva la transacción y hace su `COMMIT` tool-owned sólo si esas pruebas
   single-session pasan;
6. **después del COMMIT**, una conexión nueva ejecuta un postcheck `READ ONLY` de instalación;
7. luego corre una **calificación viva QA** acotada: prevalidación inválida sin hecho ni operación
   y con sólo el recibo técnico; preparación válida y cancelación en transacciones distintas;
   preparación válida, deriva controlada y `aplicar_v2` rechazado; Codex orquesta dos llamadas
   `execute_sql` simultáneas A/B sobre el MCP
   scoped, con SQL, barrera y `run_id` sellados, para la misma clave/hash; matriz de
   wrapper/grants/JWT/RLS en transacciones con rollback. No ejecuta ninguna aplicación financiera
   exitosa ni supera `ALQ_CUSTODIADA_DESHABILITADA`;
8. las filas sintéticas de esa calificación llevan namespace+`run_id` reservados, se enumeran
   antes, se eliminan en orden FK exacto y el cleanup sólo puede tocar ese allowlist. Las respuestas
   A/B crudas se encadenan al ledger. Los hashes de filas de las 46 tablas preexistentes, las tablas
   nuevas, secuencias y catálogos deben volver al corte postmigración;
9. una última conexión `READ ONLY` ejecuta el postcheck final. La concurrencia completa y los
   caminos financieros exitosos siguen probándose localmente; QA prueba en vivo el contrato
   transaccional sin consumir el journal.

Si cualquier postcheck/calificación falla después de un `COMMIT` confirmado, el estado es
`FORWARD_COMMIT_CONFIRMADO_CALIFICACION_FALLO`: STOP y fail-forward, nunca rollback automático. Un
residuo sintético por interrupción queda identificado por `run_id`; su limpieza requiere el runbook
sellado y reconciliación, no un reintento del forward.

### 7.3 · Cero residuo y secuencias

- En QA, cada caso interno del forward es atómico. La calificación viva puede confirmar
  transitoriamente operaciones técnicas `preparada/rechazada`, nunca un hecho financiero; el
  cleanup allowlisted las elimina y el postcheck final exige cero fixture, operación de prueba,
  journal, saldo o fila preparada/aplicada residual.
- Se comparan las 46 tablas preexistentes por conteo y SHA canónico antes y después; las tablas
  nuevas tienen el contenido técnico exacto esperado y cero fila de prueba residual.
- Los postchecks de instalación y final corren en conexiones distintas y transacciones
  `READ ONLY`.
- Se mide `alq_journal_id_seq` y cualquier otra secuencia antes/después. En QA el delta esperado es
  cero para forward+calificación+cleanup; los válidos QA no atraviesan el journal. Las ejecuciones
  financieras RPC exitosas ocurren sólo en el fixture local descartable.
- Nunca se usa `setval` para ocultar consumo de secuencia.
- `alq_assert_global_v1()` y el nuevo assert financiero deben devolver OK.

### 7.4 · Baseline y destino

El futuro paquete debe medir y sellar de nuevo, no asumir por este papel:

- durante construcción, toda tool read-only del MCP amplio lleva argumento literal QA
  `project_id='rsjwqmpseknvydistgfr'`; durante ejecución, el conector scoped inyecta ese ref y el
  schema ya no expone `project_id`. Dentro de la base siempre se exige
  `current_database()='postgres'`, `current_user='postgres'`, marca positiva, sesión esperada y
  PostgreSQL 17.6 (`server_version_num=170006`);
- producción `wajkfydxutptcvvfwrvq` negada y marca positiva de QA;
- 46 tablas, 27 vistas y catálogo vigente de operaciones;
- 112 operaciones aplicadas, cero preparadas en el corte conocido, con tolerancia cero a deriva no
  reconciliada antes de ejecutar;
- `supabase_migrations.schema_migrations`: 46 filas en la medición read-only de 2026-08-21; el
  nombre `alq_f1a_guardas_financieras_y_metodo` ausente antes de ejecutar;
- 12 transacciones de caja, siete `custodiada`, cero transferencias y una cuenta activa en el corte
  medido. Las siete custodiadas legacy se sellan como excepción histórica de snapshot; no se les
  atribuye retroactivamente una validación que no fue registrada;
- secuencia journal 157 y máximo persistido 129 en el corte D0 conocido; el hueco +28 se conserva y
  no se “corrige”;
- 115 destinos QR y huella
  `9db8d6cf2fb22511af5f6b1374d0d4f460f6177eae61ef52599f2fbce7410d35`;
- SHAs vivos de ejecutor, validadores, asserts, triggers, vistas, ACL y objetos a reemplazar;
- cero violaciones persistidas de las 14 invariantes antes del forward.

Los números de este apartado son señales conocidas, no una licencia para actualizar constantes por
conveniencia. Una diferencia viva produce STOP y reconciliación read-only.

## 8 · Artefactos autorizables después del ACK de construcción

El manifiesto final debe enumerar rutas, SHA-256, líneas y bytes. Inventario mínimo:

1. esta Adenda 2 y este encargo;
2. excepción acotada en `.gitignore`;
3. baseline schema-only adoptado bajo `supabase/baselines/`, nunca ejecutable en QA existente;
4. fuente forward canónica
   `supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql`; el manifiesto declara el
   slot post-ejecución `supabase/migrations/<V>_alq_f1a_guardas_financieras_y_metodo.sql`, pero ese
   archivo no se crea ni se finge antes de que `apply_migration` asigne `V`;
5. `ALQ-F1A-00-PRECHECK-READONLY-QA-2026-08-21.sql`;
6. `ALQ-F1A-01-REGRESION-COMPLETA-LOCAL-2026-08-21.sql`, nunca ejecutada por el protocolo QA;
7. setup y teardown del fixture PostgreSQL 17.6 local, con runtime/imagen+SHA y guardas físicas;
8. harness local de prepare/apply, RLS y concurrencia con conexiones y barreras explícitas;
9. `ALQ-F1A-02-POSTCHECK-INSTALACION-READONLY-QA-2026-08-21.sql`;
10. `ALQ-F1A-03-CALIFICACION-VIVA-Y-CLEANUP-QA-2026-08-21.sql` más su harness concurrente;
11. `ALQ-F1A-04-POSTCHECK-FINAL-READONLY-QA-2026-08-21.sql`;
12. `ALQ-F1A-99-ROLLBACK-QA-2026-08-21.sql`, sellado pero fuera del flujo normal;
13. catálogo de las 45 operaciones, idempotencia, escritores y errores estables;
14. matriz RLS de los seis actores y solapamiento;
15. inventario de Edge Functions/fuentes/config/dependencias, sin deploy;
16. coordinador offline one-shot, runbook de llamadas MCP y generador/verificador de recibo; el
    coordinador no simula que invocó tools MCP por subprocess;
17. manifiesto, runbook, auditoría Codex pre-ejecución y brief de auditoría Cloud;
18. cambios mínimos y tests de compatibilidad en
    `admin/alquileres-admin-qa.html` y `admin/alquileres-franjas-qa.html`.

Ningún artefacto D0 se modifica. Ningún archivo fuera de este inventario puede entrar por arrastre:
si aparece una necesidad nueva, se declara y se audita antes de editarla.

## 9 · Migración, coordinador y recuperación

### 9.1 · Forward

- `apply_migration` es dueño de una única transacción remota y revierte la migración completa si una
  sentencia falla. El SQL fuente no contiene `BEGIN`, `COMMIT` ni `ROLLBACK` top-level; un gate
  estático lo exige. Los subbloques PL/pgSQL de prueba pueden usar subtransacciones por
  `BEGIN … EXCEPTION`, sin tomar control del commit exterior;
- locks y timeouts explícitos;
- guardas de destino y baseline repetidas dentro de la transacción;
- creación/reemplazo de validadores, constraints/triggers y RPC versionados;
- los 17 ensayos del sustrato y los válidos directos single-session de §7.2 antes del commit
  tool-owned; concurrencia y state machine ya pasaron en el fixture local, no se intentan desde otra
  sesión invisible a DDL no confirmado;
- sin DML persistente sobre datos reales; fixtures internos quedan en subtransacciones revertidas;
- sin retry automático.

### 9.2 · Protocolo MCP y coordinador one-shot

El coordinador local no contiene credenciales ni abre PostgreSQL. Su dry-run offline es el default y
valida SHA, sintaxis, un **recibo Cloud post-publicación** sellado —commit, ruta, blob y SHA— y
ausencia de ledger/log. No intenta verificar Git por red. El SHA de ese recibo queda ligado al ACK
futuro de ejecución. Tras ese ACK, la secuencia exacta es:

1. verificación offline de todos los bytes y del recibo de publicación de `_sources`;
2. PRE remoto read-only con `execute_sql(query=<PRE sellado>)` sobre el conector scoped;
3. sólo después del PRE, armado local `O_EXCL` y `fsync` de ledger/log modo `0600`;
4. una llamada `apply_migration` con el nombre y bytes exactos de §6.1;
5. reconciliación read-only inmediata: objetos, fila remota de migración y estado de commit;
6. postcheck de instalación, calificación viva+cleanup y postcheck final de §7.2;
7. `list_migrations()`, lectura read-only directa de la nueva fila de
   `supabase_migrations.schema_migrations`, recibo final y creación local del espejo `<V>`
   byte-idéntico. `list_migrations` aporta versión/nombre; el SHA canónico de `statements` se obtiene
   con `execute_sql(query=<consulta read-only sellada>)`, no se le atribuye al listado.

Guardas obligatorias:

- el conector MCP debe estar project-scoped a QA: su config/endpoint contiene el ref exacto, las
  tools account-wide no aparecen y los schemas de `execute_sql`, `apply_migration` y
  `list_migrations` **no exponen `project_id`** porque el servidor lo inyecta. Cualquier diferencia
  es STOP;
- producción `wajkfydxutptcvvfwrvq` no aparece como destino permitido en ningún artefacto y las
  guardas SQL internas la niegan;
- no se instala CLI, no se usa dashboard, `psql`, `db push`, un proyecto linked ni una sesión que
  alcance otros proyectos;
- sólo `apply_migration` ejecuta DDL; `execute_sql` se limita a PRE/POST y al DML sintético de la
  calificación expresamente allowlisted;
- la respuesta de cada tool se guarda cruda, sin datos sensibles, se hashea y se encadena al
  ledger. El coordinador no puede declarar una tool call que no recibió como evidencia;
- error/timeout o respuesta perdida de `apply_migration`: estado `COMMIT_DESCONOCIDO`, STOP, cero
  retry y reconciliación read-only por objetos+historial;
- SHA de todo artefacto se valida antes de red; locks locales/advisory, señales, timeout y
  clasificación de cleanup no pueden ocultar un commit confirmado o desconocido;
- llaves dobladas en todo `f-string`/`rf-string`, con barrido AST de cualquier SQL renderizado;
- rollback `99` se verifica por SHA pero `will_execute=false`.

### 9.3 · Recuperación

- antes del commit tool-owned, cualquier error hace que el endpoint revierta la migración completa;
- resultado de commit desconocido: STOP, cero retry y reconciliación read-only;
- después del `COMMIT`, ningún rollback automático;
- `99` exige foto PRE, identidad exacta de objetos y autorización nueva;
- `99` hace STOP si existe cualquier hecho creado por v2, uso de las nuevas claves/snapshots,
  preparación/rechazo no sintético o dependencia posterior de funciones/columnas F1-A. No borra
  evidencia para forzar compatibilidad;
- si se autorizara, `99` se convertiría en una **nueva** migración fail-forward aplicada por
  `apply_migration`, con su propia versión remota; nunca se ejecuta como SQL directo ni se borra la
  fila histórica de F1-A;
- si restaurar las definiciones anteriores reabre los 14 rojos, el camino preferido es fail-forward;
  el riesgo debe quedar explícito antes de cualquier rollback;
- nunca `CASCADE`, nunca `setval`, nunca borrar ledger/log ni “normalizar” una deriva.

## 10 · Fuera de alcance

- D0 y sus resultados sellados;
- factura compartida, diferida después de F3 para el piloto Ñancos 52 · D 001;
- derivación funcional de períodos, ajustes, cargos y rendiciones;
- lector/parser/decimales/cuotas y ciclo contractual de F2;
- importación y operación real de F3;
- robot v7, rediseño de UI/portal y publicación; sólo entran los dos adaptadores RPC enumerados en
  §8, sin deploy;
- datos reales, producción, CRM, QR, E2, cambios funcionales de Auth, Storage y el encargo
  productivo `SECURITY DEFINER`; la única excepción Auth es el fixture transaccional con rollback
  total de §6.2;
- commit, push y deploy durante la construcción local.

## 11 · Definición de terminado

El paquete construido queda listo para auditoría, no para ejecución, sólo si:

- la matriz 14+3 y los casos válidos están totalmente mapeados a objetos y errores;
- la simulación PostgreSQL 17.6 local con runtime/imagen sellado y los checks offline pasan;
- el dry-run del coordinador declara `network:false` y no crea one-shot/log;
- Cloud puede recalcular todos los SHA y reproducir las pruebas permitidas;
- la autoridad forward es única y versionable;
- no existe deriva lateral fuera del allowlist;
- Codex entrega auditoría propia con P0/P1/P2 explícitos;
- sigue sin haber ninguna mutación en QA.

Después habrá cuatro compuertas separadas:

1. Cloud audita los bytes construidos y emite PASS;
2. Mariano publica la fuente `_sources` y todos los artefactos; Cloud verifica commit, rutas y SHA;
3. Mariano autoriza la ejecución con un ACK nuevo ligado a los SHA finales de fuente, coordinador y
   manifiesto.
4. después de QA, Mariano publica el espejo `<V>` byte-idéntico y Cloud verifica el cierre del
   historial local↔remoto.

Antes de la tercera, el estado es `F1A_CONSTRUIDO_NO_EJECUTADO`. Entre la tercera y la cuarta puede
ser `INSTALADO_QA_PENDIENTE_ESPEJO_MIGRACION`. La ejecución QA nunca precede a la publicación de la
fuente canónica verificada.
