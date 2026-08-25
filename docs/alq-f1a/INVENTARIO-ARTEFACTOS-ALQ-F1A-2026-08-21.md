# Inventario de artefactos · ALQ F1-A

**Fecha:** 21 de agosto de 2026  
**Estado:** `52_RUTAS_MATERIALIZADAS · CONSTRUIDO_NO_EJECUTADO`

Este inventario fija nombres para las categorías que el encargo dejó genéricas. Fijar una ruta no
autoriza ejecutar el artefacto. El conjunto machine-readable normativo está codificado como las
**52 rutas exactas** de `REQUIRED_BUNDLE_PATHS` en
`docs/auditorias/pruebas-alq-f1a/alq_f1a_common.py`; el generador y el coordinador rechazan tanto
faltantes como extras. Las tablas humanas siguientes agrupan esas rutas y no reemplazan esa lista.

## 1 · Autoridad y documentación

| Ruta | Momento | Estado esperado |
|---|---|---|
| `docs/briefs/ADENDA-2-CODEX-PLAN-UNICO-ALQUILERES-V3-FRONTERA-F1A-F1B-2026-08-21.md` | entrada | sellado |
| `docs/briefs/ENCARGO-CODEX-ALQ-F1A-GUARDAS-FINANCIERAS-Y-METODO-QA-2026-08-21.md` | entrada | sellado |
| `docs/auditorias/alq-f1a/DECISION-ALCANCE-ALQ-F1A-F1B-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/RUNBOOK-COMPUERTAS-ALQ-F1A-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/INVENTARIO-ARTEFACTOS-ALQ-F1A-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/MATRIZ-PRUEBAS-ALQ-F1A-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/CONDICION-RETIRO-RPC-V1-ALQ-F1A-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/REESTIMACION-ALQ-F1A-2026-08-21.md` | construcción | documental |
| `docs/auditorias/alq-f1a/MANIFIESTO-BORRADOR-ALQ-F1A-2026-08-21.md` | construcción | sin auto-hash |
| `docs/auditorias/alq-f1a/AUDITORIA-CODEX-PRE-EJECUCION-ALQ-F1A-2026-08-21.md` | cierre construcción | materializado |
| `docs/briefs/BRIEF-CLOUD-AUDITAR-PAQUETE-ALQ-F1A-QA-2026-08-21.md` | cierre construcción | materializado |

## 2 · Autoridad SQL y baseline

| Ruta | Uso |
|---|---|
| `.gitignore` | Sólo recibe las cuatro excepciones nominales del encargo. |
| `supabase/baselines/alq_v1_qa_adoptado_20260821.sql` | Baseline schema-only autocontenido, reproducido en PostgreSQL 17.6 local; prohibido en QA existente. |
| `supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql` | Única autoridad forward. |
| `supabase/migrations/<V>_alq_f1a_guardas_financieras_y_metodo.sql` | Slot post-ejecución; no se crea durante construcción. |

## 3 · SQL de verificación y recuperación

Todos se ubican en `docs/auditorias/sql/`:

| Archivo | Ejecución permitida |
|---|---|
| `ALQ-F1A-00-PRECHECK-READONLY-QA-2026-08-21.sql` | Read-only futuro, antes del forward. |
| `ALQ-F1A-01-REGRESION-COMPLETA-LOCAL-2026-08-21.sql` | Sólo fixture local. |
| `ALQ-F1A-02-POSTCHECK-INSTALACION-READONLY-QA-2026-08-21.sql` | Read-only futuro, después del commit. |
| `ALQ-F1A-03-CALIFICACION-VIVA-Y-CLEANUP-QA-2026-08-21.sql` | Futuro; DML sintético allowlisted y cleanup exacto. |
| `ALQ-F1A-04-POSTCHECK-FINAL-READONLY-QA-2026-08-21.sql` | Read-only futuro, cierre. |
| `ALQ-F1A-99-ROLLBACK-QA-2026-08-21.sql` | Sellado, `will_execute=false`, requiere otra autorización. |

## 4 · Fixture y harnesses

La raíz única de pruebas es `docs/auditorias/pruebas-alq-f1a/`.

| Ruta fijada | Uso | Estado al cierre |
|---|---|---|
| `docs/auditorias/pruebas-alq-f1a/alq_f1a_common.py` | Utilidades fail-closed, lectura segura y validación de recibos. | PASS offline |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-SELLAR-RUNTIME-PG17-2026-08-21.py` | Sellar activo y binarios Postgres.app 2.8.5/PG17.6 ya provistos. | materializado |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-FIXTURE-PG17-SETUP-2026-08-21.py` | Crear fixture socket-only bajo `/private/tmp` desde el runtime sellado. | PASS local |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-FIXTURE-PG17-TEARDOWN-2026-08-21.py` | Detener y retirar sólo el fixture marcado. | PASS local |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-VALIDAR-RECIBO-2026-08-21.py` | Validar recibos estructurados sin red ni secretos. | PASS offline |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-GENERAR-BUNDLE-LOCK-2026-08-21.py` | Inventariar y sellar el conjunto exacto de bytes del paquete. | PASS offline |
| `docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-bundle-lock.schema.json` | Contrato estructural del lock de bundle. | JSON válido |
| `docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-concurrency-case-spec.schema.json` | Contrato de casos A/B concurrentes. | JSON válido |
| `docs/auditorias/pruebas-alq-f1a/schemas/alq-f1a-receipt-contract.schema.json` | Contrato de recibos del paquete. | JSON válido |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-HARNESS-LOCAL-2026-08-21.py` | Orquestar baseline, forward, suites, RLS y concurrencia local. | PASS offline; runtime reproducible |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-HARNESS-CONCURRENCIA-QA-OFFLINE-2026-08-21.py` | Validar plan y futuras transcripciones A/B MCP; no abre PostgreSQL. | PASS offline |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-TEST-COMPATIBILIDAD-UI-OFFLINE-2026-08-21.mjs` | Tests offline de los dos consumidores HTML. | PASS offline |

Ningún PASS offline autoriza ejecución. Los bytes exactos quedan fijados por el bundle lock.

## 5 · Catálogos de seguridad y operación

| Ruta fijada | Contenido |
|---|---|
| `docs/auditorias/alq-f1a/CATALOGO-45-OPERACIONES-ALQ-F1A-2026-08-21.md` | Operación, writers, idempotencia, estado v1/v2 y errores. |
| `docs/auditorias/alq-f1a/MATRIZ-RLS-ALQ-F1A-2026-08-21.md` | Seis actores, solapamiento, vistas, RPC y DML. |
| `docs/auditorias/alq-f1a/INVENTARIO-EDGE-FUNCTIONS-ALQ-F1A-2026-08-21.md` | Fuente, config, verify_jwt y dependencias; cero deploy. |

## 6 · Coordinación y evidencia

| Ruta fijada | Momento |
|---|---|
| `docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py` | Construcción; coordinador offline sin canal de red. |
| `docs/auditorias/pruebas-alq-f1a/ALQ-F1A-VALIDAR-RECIBO-2026-08-21.py` | Construcción; valida recibos sin red. |
| `docs/auditorias/alq-f1a/RECIBO-CLOUD-POST-PUBLICACION-ALQ-F1A-2026-08-21.json` | Externo, futuro y machine-readable; el informe humano Cloud queda en un `.md` distinto ligado por ruta+SHA dentro del JSON. |
| `docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.once` | Futuro; ausente hasta PRE aprobado. |
| `docs/auditorias/alq-f1a/ALQ-F1A-RUN-QA-2026-08-21.output.log` | Futuro; ausente hasta PRE aprobado. |

## 7 · Consumidores autorizados

- `admin/alquileres-admin-qa.html`;
- `admin/alquileres-franjas-qa.html`.

No se toca el respaldo histórico ni otra pantalla sin ampliar el allowlist mediante auditoría.

## 8 · Reglas de inventario

- El bundle lock externo enumera ruta, SHA-256, líneas, bytes, modo, rol y `will_execute` de todo
  artefacto materializado; el manifiesto humano resume el núcleo y referencia ese lock.
- El package spec debe coincidir por igualdad de conjuntos con las 52 rutas de
  `REQUIRED_BUNDLE_PATHS`; los diez SQL históricos absorbidos en el baseline autocontenido final
  **no** entran como rutas separadas al bundle.
- El manifiesto no contiene su propio SHA; su hash se entrega externamente.
- Un artefacto futuro se marca `PENDIENTE` y no recibe SHA ficticio.
- El slot `<V>`, el recibo Cloud JSON, one-shot y log no existen en el paquete pre-ejecución. Un
  `.md` nunca sustituye al recibo JSON; sólo puede ser el informe humano que éste liga por SHA.
- Ningún secreto, credencial, PII real o payload financiero completo entra al inventario.
