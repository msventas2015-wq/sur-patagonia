# Herramientas offline de prueba · ALQ F1-A

Estas herramientas no autorizan ni ejecutan QA. El fixture usa únicamente PostgreSQL 17.6 por
socket Unix bajo `/private/tmp`; el coordinador sólo valida y encadena archivos locales.

## Componentes

- `ALQ-F1A-SELLAR-RUNTIME-PG17-2026-08-21.py`: verifica asset/runtime ya descargados y sus SHA.
- `ALQ-F1A-FIXTURE-PG17-SETUP-2026-08-21.py`: crea el cluster descartable con ACK local.
- `ALQ-F1A-FIXTURE-PG17-TEARDOWN-2026-08-21.py`: destruye sólo el root marcado y sellado.
- `ALQ-F1A-HARNESS-LOCAL-2026-08-21.py`: baseline → mismos bytes forward → SQL → UI → carreras.
- `ALQ-F1A-HARNESS-CONCURRENCIA-LOCAL-2026-08-21.py`: dos procesos `psql`, dos PIDs y barrera real;
  el SQL A/B vive inline en un único case-spec sellado, no en archivos laterales.
- `ALQ-F1A-HARNESS-CONCURRENCIA-QA-OFFLINE-2026-08-21.py`: valida plan y transcripciones A/B
  reales; no llama MCP.
- `ALQ-F1A-TEST-COMPATIBILIDAD-UI-OFFLINE-2026-08-21.mjs`: sintaxis y contrato v2 de dos HTML.
- `ALQ-F1A-GENERAR-BUNDLE-LOCK-2026-08-21.py`: hashes/bytes/líneas/modo desde spec explícita.
- `ALQ-F1A-VALIDAR-RECIBO-2026-08-21.py`: valida recibos estructurados sin texto humano.
- `ALQ-F1A-TEST-HARNESSES-OFFLINE-2026-08-21.py`: AST, schemas, O_EXCL, receipts y hash-chain.
- `schemas/`: contratos machine-readable para bundle, publicación, conector, autorización y recibos.

## Contrato del baseline local (fail-closed)

El baseline quedó materializado como un único DDL schema-only PostgreSQL 17.6, derivado del corte
V1 local previo al forward. No usa `\i`/`\ir`, no contiene transacciones históricas top-level y no
carga filas de negocio. Conserva sólo cinco filas técnicas deterministas (`A/B/C/D/PRE`) y crea
vacío el stub de plataforma que el forward consulta para discriminar QA del fixture.

Antes de ejecutar, el harness exige simultáneamente:

- el literal `ALQ_F1A_BASELINE_CONTRACT: MATERIALIZED_LOCAL_PG17_V1`;
- la marca física `alq_f1a_local.fixture_marca` ligada al data directory y socket del recibo;
- el stub vacío escrito como `private."qa_marca_descartable"`, nunca una marca QA poblada;
- el recibo `ALQ_F1A_BASELINE_READY|PG17.6|46_TABLES|27_VIEWS|45_OPERATIONS|NO_BUSINESS_DATA`;
- una regresión que materialice resultados para los 14 válidos adyacentes, la máquina de estados
  y RLS/ACL con cambios reales de rol, y emita una sola línea `ALQ_F1A_LOCAL_SQL_RECEIPT|` ligada
  al `RUN_ID`; ese valor liga exclusivamente la suite full del fixture local. El bloque byte-copiable
  `ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE` crea su propio UUID fijo reservado, no consume variables
  psql, no ejecuta un apply exitoso y exige `last_value/is_called` idénticos en la identity del
  journal antes/después. Los contadores y booleanos de ambos recibos se calculan desde filas
  observadas, no se declaran. Fuera de ese bloque, sólo en el cluster descartable, dos casos V1
  mínimos ejecutan `giro_registrar` y `giro_a_propietario`: derivan el evento esperado desde la
  operación y prueban que ambos producen exactamente el journal canónico `giro_a_propietario`.

Cualquier include, transacción top-level, literal de guarda QA, marker físico ausente o recibo
incompleto produce `BASELINE_LOCAL_REPRODUCIBLE_NO_SELLADO`; no se degrada a una prueba parcial.

## Guardas relevantes

- no host, URL, contraseña ni project ref remoto en los harnesses locales;
- PG17.6 físico (`server_version_num=170006`), socket-only y binarios por SHA;
- Node de tests UI por versión y SHA del binario en el bundle, no sólo por `PATH`;
- `O_EXCL`, owner local, modo `0600` y `fsync` en recibos/ledger;
- un resultado desconocido nunca se reintenta;
- el teardown valida root, marker, uid, `run_id`, SHA de `pg_ctl` y ausencia del proceso antes de
  borrar;
- todo recibo sensible, duplicado o fuera del destino exacto produce STOP.
- todo recibo remoto liga `source_sha256`, el `run_id` de evidencia sellado y `captured_utc`; una
  salida anterior al armado de la corrida, con más de 15 minutos, futura por más de 120 segundos o
  de otra fuente queda rechazada.
- el inventario exacto del bundle está codificado en `REQUIRED_BUNDLE_PATHS`; una spec truncada o
  con rutas extra no puede autodeclararse completa.
- el case-spec local debe cubrir por nombre idempotencia, crédito, aplicación/cargo, dos topes de
  depósito, reversa global, doble reintento y ambos órdenes de locks; QA admite sólo la carrera
  misma clave/hash sin efecto financiero.
