# Brief para Cloud · auditar autoridad de construcción ALQ F1-A · QA

**Fecha:** 21 de agosto de 2026  
**Modalidad:** auditoría documental, estática y mediciones read-only; **cero implementación y cero ejecución mutante**

## 0 · Corte exacto

Auditar:

1. `docs/briefs/ADENDA-2-CODEX-PLAN-UNICO-ALQUILERES-V3-FRONTERA-F1A-F1B-2026-08-21.md`  
   SHA-256 `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7`;
2. `docs/briefs/ENCARGO-CODEX-ALQ-F1A-GUARDAS-FINANCIERAS-Y-METODO-QA-2026-08-21.md`  
   SHA-256 `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`.

Autoridad anterior obligatoria:

- Plan V3 `aa55c471fc50d1354f32583d786f3970766c99edfdd1b8eabb577bab30dab641`;
- Adenda V3 `bfd93b829244d08ea45a6059b43253aefca8d0e891ef932196737d83d4de0738`;
- auditoría Cloud del plan `c39e05edd07a2dec9489b61d41994af64c97f139cdba7de33b9f859e62109cf3`;
- cierre Cloud F0 `2b20d8de4e50d968ace163619d5fa22a4bd9a8dfe706f3a8fb2472a7ec421da1`;
- adenda 27 vistas/piloto `cf8a85a238cfe8fa9fe65e645880f5533d606560f9698c4abc797c995ccb415f`;
- D0 informe `8b0ab2dd137522fd6b180a0aef1bb9eb38315c4f7f514639939d557132f7bd9a`;
- D0 manifiesto `941177d611ebe132de16e7176d50f6002faac2c88249204c5ad99357dcf429f0`;
- D0 resultado `8af80c8fc5541495def056de899a5c73398cd7ce2b1ef65ba747c7af0b5230e2`;
- D0 SQL `f9ce4b38b71b04e1ae5de79dcfff2a9601e8e191bcf6b3f1be061917412251f5`;
- D0 postcheck `135ee355d5bcea52b75ed0f60e6d69f3420ba9254e5e508b789a1f51023cc4c7`;
- sello Cloud D0 `c1b86a348612c4eb40fb9afe473690f73127274db48882a4972dad02fe3d9495`.

Sólo QA `rsjwqmpseknvydistgfr` puede recibir probes read-only. Producción
`wajkfydxutptcvvfwrvq` queda prohibida. No ejecutar D0, SQL mutante ni artefactos SQL del paquete,
migraciones, coordinadores, deploy, commit, push o publicación; sólo se admiten los probes
read-only de auditoría expresamente acotados a QA.

## 1 · Frontera F1-A/F1-B

Confirmar o rechazar esta decisión:

- los 14 rojos D0 entran en F1-A como validación/integridad server-side;
- F1-B conserva la derivación funcional server-owned de relaciones, montos, estados, períodos,
  ajustes, factura compartida, operaciones faltantes y rendiciones;
- D0 queda congelado y no se repite;
- F1-A incluye además método, migraciones, suite, idempotencia, observabilidad, seguridad y
  recuperación.

Marcar cualquier defecto D0 postergado a F1-B o cualquier función constructiva de F1-B adelantada
sin necesidad.

## 2 · Matriz financiera

Comparar caso por caso con D0:

- rojos exactos: `N01`, `C01`, `C02`, `T01`, `T02`, `D01`, `D02`, `R01`, `R02`, `J01`, `J02`,
  `J03`, `J04`, `J05`;
- controles exactos:
  - TCTRL: `P0001` + `ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO`;
  - RCTRL: `P0001` + `ALQ_T1_REAPERTURAS_SUPERAN_REVERSA`;
  - ACTRL: `23514`, constraint `alq_aplicacion_moneda_ck`, mensaje PostgreSQL literal sellado;
- 14/14 deben llegar a su error financiero nominal; Auth, ACL, formato, FK genérica o
  `custodiada` no pueden producir falsos verdes;
- el plano de integridad conserva SQLSTATE/constraint; el envelope v2 `ok=false` no los confunde
  con éxito ni con un error técnico.

Auditar especialmente:

1. reversa acumulativa por transacción original: ambos SUM consideran sólo reversas
   `estado='confirmada'`; pendientes/rechazadas no llevan reaperturas ni afectan saldos;
2. vector `100/60`, primera reversa `20/0`, segunda `50`: reapertura `10` rechaza y `30` acepta;
3. snapshot T02 server-owned con `cuenta_validacion_version`; caller no puede falsificarlo y la
   tupla ámbito/cuenta/moneda/versión/timestamp queda inmutable por INSERT/UPDATE; una transición
   ajena a la tupla sigue posible y el legado conserva NULL sin backfill falso;
4. depósito: fórmula exacta, `alq_aplicacion` excluida, `constitucion/actualizacion` suman cero,
   cargo residual no nulo falla y sucesor/moneda están acotados;
5. predicados exactos de C02/J03/J04/J05 y acreedor histórico;
6. válidos adyacentes por cada rama impiden aprobar una solución que rechaza todo.

## 3 · Arquitectura, estado e idempotencia

Verificar que el encargo sea implementable sin inventar decisiones:

- inventario completo de escritores directos/compuestos y de fuentes mutables, incluida
  `alq_conversion_moneda`;
- roots fotografiados, lock global en el orden sellado, transacción original antes que
  cargo/crédito/aplicación y relectura del grafo después del lock;
- campos históricos inmutables o versionados; todas las rutas de aplicación bloquean primero su
  transacción raíz;
- v1 conserva firma/excepciones para 45 operaciones; v2 sólo admite las ocho del D0;
- firmas v2 exactas: preparar recibe `comando_request_id`; aplicar/cancelar reciben por separado
  `operacion_request_id` y `comando_request_id`; reintentar recibe hecho+comando+motivo;
- `preparar_v2` prevalida; `aplicar_v2` revalida y sólo captura errores financieros allowlisted;
  deadlock, serialización, timeout, ACL, conexión y excepciones inesperadas se propagan;
- expiración derivada a 15 minutos, cancelación/rechazo coherentes y cero promesa imposible de
  persistir un UPDATE seguido por RAISE;
- identidad durable del hecho sobrevive reload/crash/pérdida de respuesta; lock/lookup ocurre antes
  de revalidar un hecho ya aplicado; actor económico no cambia al reanudar;
- `clave_sha256` identifica la fuente canónica y `payload_sha256` identifica el contenido; la
  unicidad física usa `(namespace,clave_version,clave_sha256)` y nunca confunde ambos hashes;
- para una clave inexistente se prevalida antes de insertar el hecho: rechazo inicial deja sólo un
  recibo de comando, 0 hecho/0 operación; corregir payload con la misma clave y comando nuevo puede
  preparar, mientras repetir el comando viejo repite su rechazo;
- un hecho privado admite intentos separados: un rechazo no envenena la clave, pero sólo
  `alq_admin_reintentar_v2(uuid,uuid,text)` puede crear un intento nuevo, sin retry automático ni
  segundo aplicado; auditar su envelope exacto, repetición de request, intento activo, rechazo
  repetido, hecho ya aplicado y el comportamiento de `preparar_v2` ante un rechazo terminal;
- todo comando v2 queda idempotente por `comando_request_id`+`comando_sha256` en el evento
  append-only, incluso si no crea intento; distinguir `operacion_request_id` no único de
  `comando_request_id` con UNIQUE parcial. La misma acción+comando+hash devuelve su envelope;
  cambiar hash/acción/actor falla, sin guardar el payload ni impedir preparar→aplicar/cancelar;
- evento ligado a intento exige los tres IDs no nulos y una FK compuesta a
  `alq_operacion(id,hecho_id,request_id)`; rechazo inicial exige los tres nulos. Un CHECK solo no
  alcanza: auditar UNIQUE, FK, bypass negativo y postcheck literal;
- misma clave+payload devuelve el mismo resultado, payload distinto falla y la carrera produce un
  solo hecho; rechazo→corrección→reintento y dos reintentos concurrentes están probados;
- eventos v2 son append-only por toda ruta de negocio; la única excepción es el SQL de cleanup QA
  sellado, directo y acotado a namespace+run_id, con orden eventos→intentos→hecho→fuente sintética,
  cero hijo financiero, sin RPC permanente ni borrado de eventos/hechos reales;
- operaciones `PENDIENTE` son restricción de gobernanza declarada, no enforcement inexistente;
- los dos consumidores HTML listados exigen `ok===true` y sólo ofrecen reintento tras click
  explícito con request durable cuando existe `hecho_id`; `rechazada_sin_fila` exige corregir y
  lanzar una preparación nueva, nunca llamar reintentar; sin retry automático, rediseño ni deploy.

## 4 · Pruebas físicas

Auditar:

- fixture local exacto PostgreSQL 17.6, socket Unix, sin listener TCP, base/data directory/marker
  local simultáneos y runtime oficial checksum-pinned; PG18 no vale;
- baseline schema-only y delta reproducibles; modo local no habilitable con un GUC del cliente;
- dentro del forward QA: 17 vectores, válidos y smokes sin journal/`nextval` antes del commit
  único, propiedad de `apply_migration`; el SQL no lleva control transaccional top-level;
- postcommit: postcheck read-only, calificación viva con prepare/cancel/deriva/concurrencia/RLS,
  cleanup allowlisted por namespace+run_id y postcheck final read-only;
- la matriz RLS no falsifica la FK a `auth.users`: usa el admin bootstrap sólo server-side y actores
  Auth sintéticos únicamente dentro de transacciones que terminan `ROLLBACK`, con SHA PRE=POST;
- cero aplicación financiera exitosa en QA, cero secuencia consumida y hashes tabulares de vuelta al
  corte postmigración;
- un fallo postcommit queda `FORWARD_COMMIT_CONFIRMADO_CALIFICACION_FALLO`, nunca rollback/retry
  automático;
- local sí prueba caminos exitosos y concurrencia completa; QA sí prueba wrappers/RLS/transacciones
  reales, no sólo catálogo.

## 5 · Migración y canal Supabase

Confirmar expresamente:

- el MCP disponible hoy es account-wide y **no está autorizado a mutar**; un PASS documental no
  cambia ese hecho;
- ejecución futura exige reconectar MCP con `project_ref=rsjwqmpseknvydistgfr`, inventario sin
  herramientas account-wide; en ese modo los schemas omiten `project_id` porque el servidor lo
  inyecta, por lo que `execute_sql`, `apply_migration` y `list_migrations` se llaman sin ese campo;
- cero fallback a CLI, dashboard, psql, proyecto linked o MCP amplio;
- DDL sólo por `apply_migration`; PRE/POST y DML sintético allowlisted por `execute_sql`;
- fuente publicada byte-inmutable bajo `supabase/migrations/_sources/` antes de QA;
- como el MCP no permite fijar `version`, captura `V` después de aplicar y crea un espejo top-level
  byte-idéntico; hasta publicar/verificar ese espejo, F1-A queda pendiente;
- cero INSERT/UPDATE/DELETE/repair manual sobre `supabase_migrations.schema_migrations`;
- nombre remoto ausente en PRE y exactamente una fila nueva en POST, con hash canónico de
  `statements`;
- baseline no se ejecuta en QA existente y no se hace pasar por historial remoto.

Si Cloud conoce un canal project-scoped que permita fijar `V`, debe proponerlo como enmienda antes
de ejecución, no cambiarlo durante la corrida.

## 6 · Seguridad, rollback y alcance

Verificar:

- `SECURITY DEFINER` privadas, `search_path=''`, nombres calificados, actor explícito, REVOKE de
  `PUBLIC/anon/authenticated/service_role` y grants nominales mínimos;
- wrappers públicos mínimos; default privileges intactos;
- 27 vistas y 46 tablas preexistentes sin regresiones; las dos tablas privadas nuevas con RLS
  habilitada/forzada, cero policy/grant API y writers privados allowlisted;
- matriz admin/owner vinculado/owner ajeno/auth sin vínculo/anon/service_role y solapamiento;
- inventario de Edge Functions reconciliado, sin modificación/deploy;
- allowlist de archivos exacta; D0, F1-B, producción, QR, E2, CRM y Storage fuera; Auth sólo admite
  las filas sintéticas transaccionales con rollback de la matriz RLS, nunca una mutación confirmada;
- `99` no corre en flujo normal y hace STOP si ya existen hechos v2 o dependencias post-F1-A; una
  reversión autorizada sería una migración nueva, nunca borrado del historial;
- commit desconocido y cleanup local preservan la clasificación remota;
- no `CASCADE`, no `setval`, no retry automático, no secretos, datos personales serializados ni
  mutaciones sobre datos reales; el admin bootstrap sólo se resuelve dentro de DB.

## 7 · Autoridad

El único ACK del encargo:

```text
AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821
```

autoriza construcción, probes QA read-only y el único asset oficial PG17.6 a `/private/tmp` en los
términos exactos del encargo. No autoriza DDL, DML QA, deploy ni ejecución. Después se requieren
PASS de bytes, publicación/verificación y un ACK de ejecución distinto.

## 8 · Resultado exigido

Entregar `docs/auditorias/AUDITORIA-CLOUD-ENCARGO-ALQ-F1A-QA-2026-08-21.md` con:

- SHA propio y SHA recalculado de ambos documentos;
- tabla 14+3;
- veredictos separados para alcance, finanzas, estado/idempotencia, pruebas, migración MCP,
  seguridad y recuperación;
- P0/P1/P2 explícitos;
- confirmación de cero archivos del paquete/autoridad editados y cero mutaciones; la única escritura
  permitida a Cloud es su propio informe de auditoría;
- `PASS · 0 P0 · 0 P1`, o `NO-GO` con cambio mínimo exacto.

El PASS sólo habilita a Mariano a dar el ACK de **construcción**. No habilita construir ni ejecutar
por sí solo.
