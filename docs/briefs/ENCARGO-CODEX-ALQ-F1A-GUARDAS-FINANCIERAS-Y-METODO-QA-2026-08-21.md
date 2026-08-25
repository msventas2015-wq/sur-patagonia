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
deadlock, doble 