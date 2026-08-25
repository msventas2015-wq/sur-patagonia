# Runbook de compuertas · ALQ F1-A

**Fecha:** 21 de agosto de 2026  
**Modalidad actual:** construcción local y QA read-only  
**Este documento no autoriza ejecución.**

## 1 · Estados reconocidos

| Estado | Significado |
|---|---|
| `F1A_EN_CONSTRUCCION_LOCAL` | Se crean artefactos; QA no se muta. |
| `F1A_CONSTRUIDO_NO_EJECUTADO` | Bytes completos, pruebas locales y build-check aprobados. |
| `F1A_PUBLICADO_PENDIENTE_ACK_EJECUCION` | Cloud verificó la publicación exacta; falta ACK nuevo. |
| `COMMIT_DESCONOCIDO` | La llamada a `apply_migration` perdió o no confirmó su resultado. |
| `FORWARD_COMMIT_CONFIRMADO_CALIFICACION_FALLO` | El forward quedó confirmado y falló una compuerta posterior. |
| `INSTALADO_QA_PENDIENTE_ESPEJO_MIGRACION` | QA instalado; aún falta publicar y sellar el espejo `<V>`. |
| `F1A_CERRADO_QA` | Espejo publicado, historia reconciliada y sello final emitido. |

## 2 · Dos modos offline del coordinador

La verificación offline se divide explícitamente para no exigir antes de tiempo un recibo que sólo
puede existir después de la publicación.

### 2.1 · `build-check`

Se usa durante la construcción y antes de la auditoría Cloud del paquete.

Debe:

- operar con `network:false`;
- validar rutas, SHA-256, líneas, bytes, sintaxis y allowlist local;
- validar que la fuente `_sources` es la única autoridad forward;
- confirmar que el espejo `<V>` todavía no existe;
- exigir ausencia del recibo Cloud post-publicación;
- exigir ausencia de ledger, log y one-shot;
- verificar estáticamente que `99` tiene `will_execute=false`;
- no crear ningún archivo de ejecución.

Salida exitosa exacta de estado: `F1A_CONSTRUIDO_NO_EJECUTADO`.

### 2.2 · `execution-readiness`

Se usa sólo después de Cloud PASS, publicación de Mariano y verificación remota de esos mismos bytes.

Debe:

- seguir operando con `network:false`;
- volver a validar todos los SHA locales;
- exigir un recibo Cloud post-publicación real y sellado;
- verificar en ese recibo commit, ruta, blob y SHA de `_sources` y de los artefactos publicados;
- ligar el SHA del recibo al ACK futuro de ejecución;
- exigir todavía ausencia de ledger, log y one-shot;
- rechazar placeholders, recibos sintéticos o un recibo de otro commit.

Salida exitosa exacta de estado: `F1A_PUBLICADO_PENDIENTE_ACK_EJECUCION`.

## 3 · Compuerta C0 · Autoridad de construcción

Antes de escribir:

1. recalcular los SHA del encargo, Adenda 2, auditoría Codex pre-construcción y sello Cloud;
2. comprobar el ACK literal de construcción;
3. comprobar que no existe un ACK de ejecución reutilizado;
4. comprobar que producción no figura como destino permitido;
5. fijar el allowlist local de rutas.

Fallo: `STOP_AUTORIDAD_CONSTRUCCION`.

## 4 · Compuerta C1 · Foto read-only

La construcción puede medir QA sólo con `project_id='rsjwqmpseknvydistgfr'` literal en el MCP
amplio. No se ejecuta SQL mutante ni se consulta producción.

Se sella como mínimo:

- identidad de base, usuario, versión y marca positiva QA;
- 46 tablas, 27 vistas y 45 operaciones;
- 112 operaciones aplicadas y cero preparadas;
- 12 transacciones de caja, siete custodiadas, cero transferencias y una cuenta activa;
- 46 filas de migraciones y ausencia del nombre F1-A;
- secuencias, SHAs de funciones/triggers/constraints/ACL y cero violaciones financieras;
- baseline QR de QA reconciliado read-only el 2026-08-25: 117 referencias, cero sin canal y huella
  `df0919b2477e1c010bc2bd62ae5c2e199c0ed950aea2a794ed075e71294a92ce`, sólo como prueba de no
  deriva. El anterior 115/`9db8d6cf…` pertenecía a producción y no es autoridad para QA.

Cualquier diferencia no reconciliada produce `STOP_DERIVA_BASELINE`.

## 5 · Compuerta C2 · Fixture PostgreSQL 17.6

1. descargar únicamente el asset oficial autorizado a `/private/tmp`;
2. registrar URL, arquitectura, tamaño y SHA-256;
3. no instalarlo ni moverlo a `/Applications`;
4. iniciar el servidor sólo por socket Unix, con `listen_addresses=''`;
5. usar base `alq_f1a_fixture`, data dir `/private/tmp/alq-f1a-pg17-*` y marca local sellada;
6. comprobar `server_version_num=170006`;
7. aplicar baseline → forward y correr todas las suites locales;
8. detener el servidor y ejecutar el teardown verificado.

PG18 no sustituye esta compuerta. Fallo: `STOP_FIXTURE_PG17`.

## 6 · Compuerta C3 · Suite local

Debe aprobar, como unidad:

- 14 rechazos nominales y 3 controles heredados;
- casos válidos adyacentes;
- escritores directos y alternativos;
- prepare/apply en transacciones separadas;
- state machine, TTL, cancelación, deriva y reintento;
- idempotencia por hecho y por comando;
- carreras reales con sesiones distintas;
- RLS de seis actores y solapamiento;
- compatibilidad de los dos consumidores HTML;
- cero residuos y asserts finales.

No se acepta falso verde por Auth, ACL, FK genérica, cast o `custodiada`.

## 7 · Compuerta C4 · Paquete local

Antes de Cloud:

1. completar inventario y manifiesto sin auto-hash;
2. verificar que ningún archivo D0 cambió;
3. verificar que no existe el espejo `<V>`;
4. ejecutar `build-check`;
5. emitir auditoría Codex con P0/P1/P2;
6. confirmar cero mutación QA y cero contacto con producción.

## 8 · Compuertas externas previas a ejecución

1. Cloud audita los bytes y emite PASS.
2. Mariano publica exactamente `_sources` y los artefactos auditados.
3. Cloud verifica commit, rutas, blobs y SHA; luego emite el recibo post-publicación.
4. Se ejecuta `execution-readiness`.
5. Mariano emite un ACK nuevo ligado a fuente, coordinador, manifiesto y recibo.
6. Se habilita un conector MCP project-scoped exclusivamente a QA.

El conector debe ocultar tools account-wide y sus schemas no deben aceptar `project_id`. Si esto no
se demuestra, `STOP_CANAL_MUTANTE_NO_ACOTADO`.

## 9 · Secuencia futura de ejecución

Sólo después de todas las compuertas anteriores:

1. validar offline todos los bytes y el recibo;
2. ejecutar PRE read-only sellado;
3. crear ledger/log con `O_EXCL`, `fsync` y modo `0600`;
4. llamar una sola vez a `apply_migration` con nombre y bytes exactos;
5. reconciliar inmediatamente objetos, fila de migración y estado de commit;
6. ejecutar postcheck de instalación read-only;
7. ejecutar calificación viva QA acotada y cleanup allowlisted;
8. ejecutar postcheck final read-only;
9. consultar `list_migrations` y la fila remota para obtener `V` y hash canónico de statements;
10. crear localmente el espejo `<V>` byte-idéntico;
11. Mariano publica el espejo y Cloud verifica el cierre.

## 10 · Fallos y recuperación

- Error antes del commit tool-owned: el endpoint revierte todo.
- Timeout o respuesta perdida de `apply_migration`: `COMMIT_DESCONOCIDO`, cero retry y sólo
  reconciliación read-only.
- Fallo después de commit confirmado: fail-forward; nunca rollback automático.
- Residuo sintético: queda identificado por `run_id` y se limpia sólo con runbook sellado.
- `99` requiere foto nueva, autorización nueva y se aplica como una migración nueva; jamás borra la
  fila histórica ni usa `CASCADE` o `setval`.

## 11 · Prohibiciones permanentes del runbook

- No usar CLI, dashboard, `psql`, `db push` o proyecto linked para el forward.
- No ejecutar el forward con `execute_sql`.
- No reintentar automáticamente una mutación o un resultado desconocido.
- No crear el espejo antes de conocer `V`.
- No almacenar contraseñas, tokens, payloads sensibles o PII real en recibos.
- No declarar una tool call que no haya ocurrido.
