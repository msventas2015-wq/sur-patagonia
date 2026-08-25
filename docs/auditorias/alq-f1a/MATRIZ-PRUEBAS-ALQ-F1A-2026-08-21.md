# Matriz de pruebas · ALQ F1-A

Fecha: 2026-08-21  
Estado: diseño de prueba construido; cero ejecución en QA  
Autoridad: encargo F1-A SHA-256
`5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`

Esta matriz no reemplaza el SQL ni el harness. Fija qué debe demostrar cada plano y evita un
falso verde por autenticación, ACL, cast, FK genérica, modo `custodiada` u oráculo posterior.

## 1 · Plano de integridad: 14 rojos

En estos 14 vectores la superficie PostgreSQL debe rechazar al validar, mutar o forzar constraints,
con SQLSTATE `P0001` y el código nominal exacto. La API v2 puede traducir ese rechazo a un envelope
`ok=false` transportado con SQLSTATE `00000`; esa traducción se prueba aparte y no satisface esta
tabla.

| ID | Operación | Construcción inválida mínima | Resultado obligatorio |
|---|---|---|---|
| N01 | `nota_emitir` | nota y cargo con monedas distintas | `P0001` · `ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE` |
| C01 | `credito_consumir` | crédito/consumo/cargo con moneda incompatible | `P0001` · `ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE` |
| C02 | `credito_consumir` | contrato, parte o propiedad del crédito no coincide con el cargo | `P0001` · `ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE` |
| T01 | `transferencia_interna` | pierna o par de cuentas con moneda incompatible | `P0001` · `ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE` |
| T02 | `transferencia_interna` | una cuenta inactiva al crear la operación | `P0001` · `ALQ_F1A_T02_CUENTA_INACTIVA` |
| D01 | `deposito_evento_registrar` | consumo nuevo supera el saldo global disponible | `P0001` · `ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE` |
| D02 | `deposito_liquidar_y_devolver` | líneas cubiertas más devolución superan el saldo | `P0001` · `ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO` |
| R01 | `reversa_con_reapertura` | reversa aplicada sin reapertura acumulada suficiente por cargo | `P0001` · `ALQ_F1A_R_REAPERTURA_INSUFICIENTE` |
| R02 | `reversa_con_reapertura` | reapertura parcial menor que lo efectivamente desimputado | `P0001` · `ALQ_F1A_R_REAPERTURA_INSUFICIENTE` |
| J01 | `cargo_manual_emitir` | propiedad del cargo distinta de la del contrato | `P0001` · `ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE` |
| J02 | `cargo_manual_emitir` | período ajeno al contrato del cargo | `P0001` · `ALQ_F1A_J02_PERIODO_CONTRATO_INCOMPATIBLE` |
| J03 | `cargo_manual_emitir` | deudor distinto del inquilino en `alquiler_periodo` | `P0001` · `ALQ_F1A_J03_DEUDOR_NO_ELEGIBLE` |
| J04 | `pago_multimoneda` | pagador no es deudor ni garante vigente del contrato | `P0001` · `ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE` |
| J05 | `pago_multimoneda` | beneficiario distinto del acreedor histórico del cargo | `P0001` · `ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE` |

Criterios comunes: `14/14`; `SONDA_INVALIDA=0`; ningún `00000`; código exacto; la mutación queda
revertida; el rechazo ocurre dentro de la autoridad de integridad y no por una condición lateral.

## 2 · Plano de integridad: tres controles heredados

| ID | Vector | Resultado literal obligatorio |
|---|---|---|
| TCTRL | misma cuenta como origen y destino | SQLSTATE `P0001`; `ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO` |
| RCTRL | reapertura 41 sobre reversa 40 | SQLSTATE `P0001`; `ALQ_T1_REAPERTURAS_SUPERAN_REVERSA` |
| ACTRL | aplicación ARS→USD sin conversión | SQLSTATE `23514`; constraint `alq_aplicacion_moneda_ck`; mensaje `new row for relation "alq_aplicacion" violates check constraint "alq_aplicacion_moneda_ck"` |

ACTRL debe llegar a la constraint real; un `RAISE` que imite su texto es fallo. El control por
reapertura excesiva se evalúa antes del nuevo control por reapertura insuficiente.

## 3 · Controles válidos adyacentes

Cada caso verifica el efecto financiero exacto, los saldos y el estado final; que no haya error no
alcanza.

| Familia | Casos válidos y de frontera obligatorios |
|---|---|
| N | nota y cargo en la misma moneda |
| C | crédito, consumo y cargo coherentes en moneda, contrato, propiedad y parte |
| T | dos cuentas distintas, activas y de igual moneda; snapshot server-owned de versión/timestamp |
| D | evento exactamente por el saldo; dos eventos acumulados exactamente por el saldo; liquidación más devolución exactamente por el saldo; `constitucion`/`actualizacion` aportan cero; sucesor válido e inválido; moneda compatible e incompatible; todo `cargo_residual_id` no nulo falla con `ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO` |
| R | reapertura exacta de pago totalmente aplicado; parte no imputada que no se reabre; múltiples reversas confirmadas acumuladas; reversas pendientes/rechazadas excluidas y sin reaperturas |
| J | grafo propiedad/contrato/período/deudor coherente; paga el deudor; paga garante vigente; beneficiario es el acreedor histórico aun tras cambio de titularidad |

Vector R acumulativo sellado: original 100, aplicación 60, primera reversa confirmada 20 con
reapertura 0; segunda reversa 50 rechaza reapertura 10 y acepta reapertura 30. También se prueba que
una reversa no confirmada no altera ningún `SUM` y no admite filas de reapertura.

Para rutas `custodiada`, primero debe ejecutarse la guarda financiera nominal y después
`ALQ_CUSTODIADA_DESHABILITADA`. En los casos válidos se demuestra que el validador financiero pasó
y que la ruta operativa real continúa deshabilitada.

## 4 · T02 y legado

| Vector | Resultado esperado |
|---|---|
| caller fuerza versión/timestamp sobre cuenta inactiva | el servidor no confía en el payload y rechaza por T02 |
| caller fuerza versión/timestamp sobre cuenta activa | el servidor sobrescribe con `version=1` y timestamp propio |
| cuenta se desactiva después | la historia no se reescribe ni invalida |
| UPDATE de ámbito, cuenta, moneda, versión o timestamp en fila nueva | rechazo |
| el mismo UPDATE en fila legacy | rechazo |
| UPDATE permitido fuera de la tupla histórica | éxito sin alterar la tupla |
| fila legacy | conserva literalmente ambos `NULL`; no se fabrica validación histórica |

La foto PRE sella IDs/hash de las siete transacciones `custodiada` legacy y el resto del corte.

## 5 · API v2, estado e idempotencia

Los cuatro RPC tienen las firmas exactas del encargo. Los ocho nombres permitidos son
`nota_emitir`, `credito_consumir`, `transferencia_interna`, `deposito_evento_registrar`,
`deposito_liquidar_y_devolver`, `reversa_con_reapertura`, `cargo_manual_emitir` y
`pago_multimoneda`; las otras 37 operaciones no entran a v2.

Pruebas mínimas:

- preparar y aplicar en transacciones distintas;
- prevalidación inválida: `ok=false`, `estado=rechazada_sin_fila`, cero hecho, cero operación y un
  único recibo append-only; replay del mismo comando devuelve el mismo envelope;
- corrección del payload con la misma clave y nuevo comando: nueva preparación posible;
- preparar A → aplicar B → replay B; preparar C → cancelar D → replay D;
- cada acción usa `comando_request_id` propio; reutilizarlo con otro hash, acción, actor o argumentos
  da conflicto; eventos sucesivos comparten `operacion_request_id` sin colisionar;
- misma clave canónica y mismo `payload_sha256`: mismo hecho/resultado o intento activo; misma clave
  y payload distinto: conflicto; dos sesiones sobre la misma clave: un solo hecho;
- deriva al aplicar: subbloque financiero revertido, intento terminal `rechazada`, evento y envelope
  `ok=false`; sin efecto financiero;
- preparación vence exactamente a los 15 minutos; v1 y v2 niegan aplicar desde `expires_at`;
- cancelación sólo por preparador o supervisor vigente; estado final no se transiciona dos veces;
- rechazo con hecho → reintento explícito con comando nuevo; revalidación que vuelve a fallar;
  carrera entre dos comandos de reintento; hecho aplicado devuelve el resultado original;
- `40P01`, `40001`, `57014`, `42501`, conexión y errores fuera de allowlist se propagan como fallos
  técnicos y nunca se traducen a `ok=false` ni se reintentan automáticamente;
- FK compuesta impide ligar evento a combinación operación/hecho/request ajena; CHECK, UNIQUE, FK e
  índices se verifican literalmente;
- la consulta de preparadas activas/vencidas y el saneamiento privado son server-owned e
  idempotentes; no se finge cron ni alerta push.

## 6 · Compatibilidad v1 y consumidores

- Las 45 operaciones v1 conservan firma, retorno, grants y semántica de excepción.
- Las ocho rutas v1 quedan protegidas por las mismas guardas.
- El único cambio transversal permitido en `alq_admin_aplicar_core_v1` es la guarda de expiración.
- Se ejecutan smokes sanitizados de las siete ondas históricas y se compara el catálogo completo.
- Sólo `admin/alquileres-admin-qa.html` y `admin/alquileres-franjas-qa.html` eligen v2 para las ocho
  rutas, exigen `ok === true` y respetan el ciclo UUID por click/replay/pérdida de respuesta.
- Un consumidor activo adicional en repo o remoto produce STOP y requiere ampliar el allowlist con
  auditoría.

## 7 · Matriz RLS y bypass

Actores mínimos: admin vigente, propietario vinculado, propietario ajeno, `authenticated` sin
vínculo, `anon`, `service_role` y el solapamiento propietario+admin. Para cada identidad se prueban
vistas, RPC v1/v2 y DML directo. Lectura owner-scoped se conserva; toda mutación sin wrapper nominal
se niega.

Pruebas estructurales:

- 46 tablas preexistentes y las dos tablas privadas nuevas con RLS habilitada y forzada;
- 27 vistas `security_invoker=true`; sólo `authenticated` conserva `SELECT` directo;
- tablas privadas sin policy para roles API, sin grant directo y accesibles sólo por funciones
  privadas allowlisted;
- funciones `SECURITY DEFINER` con owner, `search_path=''`, objetos calificados y grants nominales;
- bypass privilegiado negativo para constraints, triggers, FK compuesta e inmutabilidad;
- usuarios Auth sintéticos sólo dentro de transacción/subtransacción con rollback; cero UUID, correo
  o dato personal real en SQL, log o recibo.

## 8 · Planos físicos y criterio anti-falso-verde

| Plano | Qué ejecuta | Persistencia permitida |
|---|---|---|
| Fixture local PG 17.6 | 17 vectores, válidos, v1/v2, consumidores, RLS y concurrencia real | sólo en `/private/tmp`; teardown completo |
| Forward QA futuro | pruebas single-session visibles dentro del DDL no confirmado | cero; subtransacciones revertidas antes del commit tool-owned |
| Calificación viva QA futura | rechazo sin hecho, preparar/cancelar, preparar/deriva/rechazo, A/B concurrente, wrappers/grants/JWT/RLS | sólo recibos/filas sintéticas enumeradas hasta cleanup allowlisted |
| Postcheck final QA futuro | hashes, conteos, secuencias, asserts y cero residuo | lectura únicamente |

La construcción actual sólo produce bytes y puede ejecutar el fixture local aprobado. No autoriza
ninguna llamada remota ni mutación en QA. En QA futuro, el cleanup borra exclusivamente el conjunto
enumerado por namespace+`run_id`, en orden eventos → intentos/operaciones → hechos → fuente
sintética; cualquier hijo financiero, ID ajeno o residuo produce STOP.

## 9 · Criterio de PASS

PASS exige simultáneamente: 14/14 rojos nominales, 3/3 controles literales, todos los válidos con
efecto exacto, state machine/idempotencia/concurrencia completas, matriz RLS completa,
`SONDA_INVALIDA=0`, hashes y conteos estables, asserts OK, delta cero de secuencias y cero residuo.
Un caso que falle por una defensa distinta de la que se intenta medir es FAIL, aunque también haya
impedido la escritura.
