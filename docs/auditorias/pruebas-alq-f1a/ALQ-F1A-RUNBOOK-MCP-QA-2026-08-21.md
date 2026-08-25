# Runbook operativo MCP · ALQ F1-A · QA

Fecha: 2026-08-21  
Estado: construido para auditoría; **no autoriza ejecución**  
Destino futuro único: QA `rsjwqmpseknvydistgfr`  
Producción denegada: `wajkfydxutptcvvfwrvq`

## 1. Separación de responsabilidades

El coordinador es offline: valida archivos, arma el one-shot y encadena evidencia. No tiene código
de red y no puede invocar ni simular una tool MCP. Codex realiza las futuras llamadas mediante el
conector Supabase project-scoped; cada respuesta real se copia a un envelope local, se hashea y se
ingiere. Cloud verifica bytes y publicación. Mariano emite el ACK de ejecución sólo después.

No se usa CLI, dashboard, `psql`, proyecto linked ni `execute_sql` para el forward. El único canal
DDL es una llamada a `apply_migration` con nombre
`alq_f1a_guardas_financieras_y_metodo` y los bytes exactos de
`supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql`.

## 2. Compuertas antes de cualquier conexión mutante

1. Ejecutar el fixture PG 17.6 local y su teardown; validar el recibo `local`.
   La ejecución queda fail-closed mientras el baseline no sea autocontenido y no tenga el literal
   `ALQ_F1A_BASELINE_CONTRACT: MATERIALIZED_LOCAL_PG17_V1`; el baseline compositivo con `\ir` y
   guardas históricas de QA no satisface esta compuerta.
2. Generar el bundle lock desde el package spec final. Recalcular todos sus SHA.
3. Ejecutar `build-check`. Debe devolver exactamente `F1A_CONSTRUIDO_NO_EJECUTADO`,
   `network:false`, no crear one-shot/log y confirmar que el espejo `<V>` no existe.
4. Cloud audita el paquete completo y emite PASS.
5. Mariano publica exactamente esos bytes.
6. Cloud verifica commit, ruta, blob y SHA de **cada** artifact y entrega el recibo JSON conforme a
   `schemas/alq-f1a-publication-receipt.schema.json`.
7. El conector se reabre project-scoped a QA. Se materializa una atestación conforme a
   `schemas/alq-f1a-connector-attestation.schema.json`: tools account-wide ausentes y los schemas de
   `apply_migration`, `execute_sql` y `list_migrations` presentes y sin parámetro `project_id`.
   Puede haber otras tools project-scoped; no puede haber ninguna tool account-wide.
8. Mariano emite una autorización JSON conforme a
   `schemas/alq-f1a-execution-authorization.schema.json`; liga ACK, fuente, bundle, coordinador,
   publicación y atestación por SHA.
9. Ejecutar `execution-readiness`. Debe devolver
   `F1A_PUBLICADO_PENDIENTE_ACK_EJECUCION` y seguir con `network:false`.

Cualquier diferencia produce STOP. No se “actualiza” una constante para que pase.

## 3. PRE y armado durable

1. Copiar los bytes sellados de `ALQ-F1A-00-PRECHECK-READONLY-QA-2026-08-21.sql` a una llamada
   `execute_sql` del conector scoped.
2. Guardar la salida completa, sin PII ni secretos. Debe contener un solo
   `ALQ_F1A_PRE_RECEIPT|{...}` PASS. El recibo debe traer `source_sha256`, `run_id` de evidencia y
   `captured_utc`; se valida aportando explícitamente `--expected-source-sha256`,
   `--expected-run-id` y `--not-before-utc` (el `issued_utc` de la autorización). El `run_id` de
   evidencia es el literal del case-spec QA sellado y no es el one-shot aleatorio del coordinador.
3. Recién entonces ejecutar `coordinador ... arm` con el ACK literal autorizado y esa evidencia.
   El coordinador crea, con `O_EXCL`, `fsync`, owner local y modo `0600`:
   - `docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.once`;
   - `docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.output.log`.
4. Copiar el `run_id` devuelto. Un archivo preexistente es STOP; nunca se borra para rearmar.

## 4. Único intento de forward

1. Ejecutar `coordinador ... mark-apply-attempt --run-id <RUN_ID>`.
2. Comprobar `ALQ_F1A_APPLY_ATTEMPT_RECORDED` y
   `durability=FSYNC_BEFORE_EXTERNAL_TOOL_CALL` en el log.
3. Sólo ahora llamar **una vez**:

   ```text
   apply_migration(
     name = "alq_f1a_guardas_financieras_y_metodo",
     query = <bytes exactos de _sources>
   )
   ```

4. Copiar la respuesta real a un envelope conforme a
   `schemas/alq-f1a-apply-transcript.schema.json`. `raw_response_sha256` es el SHA-256 del JSON
   canónico de `raw_response`; el coordinator lo recalcula. `origin` debe ser literalmente
   `MCP_TRANSCRIPT_COPIED_BY_CODEX`. El envelope además lleva el `source_sha256`, el `run_id`
   one-shot devuelto al armar y un `captured_utc` no anterior a `created_utc` del one-shot.
5. Ingerir como `--step apply_response`.

Clasificación:

- éxito explícito: `SUCCESS_CONFIRMED`;
- rechazo explícito anterior al commit: `ERROR_DEFINITE` y STOP, sin retry;
- timeout, canal cortado o respuesta ambigua: `RESULT_UNKNOWN` → `COMMIT_DESCONOCIDO`, cero retry y
  sólo reconciliación read-only.

## 5. Reconciliación y compuertas posteriores

La secuencia de evidencia es rígida:

1. `reconcile`: objetos esperados + exactamente una fila de migración. Si confirma presencia,
   emite `ALQ_F1A_RECONCILE_COMMIT_CONFIRMED`; si el resultado sigue ambiguo no se continúa.
2. `post_install`: ejecutar `02` por `execute_sql` read-only y validar conteos, siete snapshots
   legacy nulos, dos tablas privadas y assert global.
3. `qualification`: ejecutar `03` sólo con namespace/run_id sintético. Las dos carreras A/B se
   disparan como **dos tool calls simultáneas**, cada una en backend distinto, con la barrera SQL
   sellada. Guardar ambas respuestas, PIDs y evidencia de barrera. Cleanup exacto antes del PASS.
4. `final`: ejecutar `04` read-only; exige cero fixture, cero preparada sintética, delta de
   secuencias cero, hashes restaurados y assert global.
5. `migration`: ejecutar `list_migrations` y, aparte, la consulta read-only sellada sobre
   `supabase_migrations.schema_migrations`. El listado aporta `V` y nombre; sólo la consulta aporta
   el hash canónico de `statements`. Exige una fila y fuente SHA exacta.

Cada salida se valida primero con el verificador de recibos y luego se ingiere con
`coordinador ... ingest --step ...`. El coordinador acepta el orden anterior una sola vez.
Todos los recibos read-only/calificación deben repetir el mismo `source_sha256` y `run_id` de
evidencia sellados; `captured_utc` debe ser posterior al `created_utc` del one-shot. Esto impide
reusar un PASS de otra versión o de una corrida anterior. El validador además limita la antigüedad
a 15 minutos y tolera como máximo 120 segundos de deriva futura de reloj.

## 6. Cierre y espejo

`coordinador ... finalize` sólo acepta seis evidencias completas, un único `APPLY_ATTEMPTED`,
reconciliación confirmada y todos los recibos PASS. Emite
`INSTALADO_QA_PENDIENTE_ESPEJO_MIGRACION`; todavía no declara F1-A cerrado.

Con `V` remoto conocido se crea localmente
`supabase/migrations/<V>_alq_f1a_guardas_financieras_y_metodo.sql` byte-idéntico a `_sources`.
Mariano publica ese único espejo y Cloud verifica commit/blob/SHA e historia local↔remota. Recién
entonces puede emitirse `F1A_CERRADO_QA`.

## 7. Fallos que nunca se transforman en PASS

- un solo backend, una barrera declarada pero no observada o carreras secuenciales;
- rechazo por Auth, ACL, cast, FK lateral o `custodiada` en lugar del código financiero nominal;
- suite que rechaza también los casos válidos;
- receipt duplicado, texto humano sin JSON estructurado o evidencia con PII/secreto;
- fuente copiada/re-renderizada en vez de los mismos bytes `_sources`;
- DDL por `execute_sql`, retry automático, borrado del one-shot/log o creación anticipada de `<V>`;
- cleanup parcial, secuencias movidas, fixture residual o `apply_migration` ambiguo no reconciliado.

## 8. Sintaxis exacta del coordinador

Todos los comandos se ejecutan desde la raíz publicada del repo. Los nombres entre `<...>` son
rutas/valores sellados que existen recién en la etapa indicada; no son defaults silenciosos.

```text
python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  build-check --bundle-lock <BUNDLE_LOCK_JSON>

python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  execution-readiness --bundle-lock <BUNDLE_LOCK_JSON> \
  --publication-receipt <PUBLICATION_RECEIPT_JSON> \
  --connector-attestation <CONNECTOR_ATTESTATION_JSON> \
  --execution-authorization <EXECUTION_AUTHORIZATION_JSON>

python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  arm --bundle-lock <BUNDLE_LOCK_JSON> \
  --publication-receipt <PUBLICATION_RECEIPT_JSON> \
  --connector-attestation <CONNECTOR_ATTESTATION_JSON> \
  --execution-authorization <EXECUTION_AUTHORIZATION_JSON> \
  --pre-evidence <PRE_RAW_OUTPUT> --ack '<ACK_LITERAL_SELLADO>'

python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  mark-apply-attempt --run-id <RUN_ID>

python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  ingest --run-id <RUN_ID> --step <STEP> --evidence <EVIDENCE_FILE>

python3 docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py \
  finalize --run-id <RUN_ID> --output <FINAL_RECEIPT_JSON>
```

`<STEP>` recorre, sin omitir ni repetir:
`apply_response`, `reconcile`, `post_install`, `qualification`, `final`, `migration`.
