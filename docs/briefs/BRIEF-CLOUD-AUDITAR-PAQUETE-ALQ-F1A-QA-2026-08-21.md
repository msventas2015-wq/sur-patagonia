# Brief Cloud · auditar paquete ALQ F1-A · QA

**Estado:** paquete construido localmente; auditoría de bytes, sin ejecución remota.  
**Destino futuro único:** QA `rsjwqmpseknvydistgfr`.  
**Producción prohibida:** `wajkfydxutptcvvfwrvq`.  
**Este brief no concede ACK de ejecución.**

## Autoridad obligatoria

- Encargo F1-A: `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`.
- Adenda 2 F1-A/F1-B: `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7`.
- Auditoría Codex preconstrucción:
  `4a6d2a8462c0eeee9beb26c8fe64aca62b1a0d9aefa8e0fb782b8e49c859fe9f`.
- Sello Cloud del encargo:
  `d53bf9f8a5dc11d2dcab57582c18b9a26411700a9d74b79f46b9da6ada7439a0`.
- Fuente forward final:
  `d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701`.
- Baseline PostgreSQL 17.6 autocontenido:
  `c7234326fcd09470d513d4f5917fd9c653ce2c43a9621f02c498de8363e16068`.
- Coordinador offline:
  `3e53f9626f78e9f8cdb23b2ed2252d3b84cd34eae764fc14bd17eb6b4a8d894f`.

El bundle lock final y su SHA se entregan como input externo. No se embebe su SHA aquí porque el
lock hashea este brief y se produciría una dependencia circular.

## Evidencia local que Cloud debe reproducir

La fuente candidata fue aplicada con `psql -1` en un fixture oficial PostgreSQL 17.6, socket-only,
`server_version_num=170006`. La migración confirmó con:

- 17/17 rechazos exactos: 14 códigos `P0001` y TCTRL/RCTRL/ACTRL literales;
- ACTRL originado por `23514` y constraint `alq_aplicacion_moneda_ck`, sin `RAISE` sintético;
- 14/14 controles válidos adyacentes;
- 5/5 casos de state machine y 10/10 casos RLS/ACL;
- `cleanup_residual_rows=0`, assert global OK y secuencia de `alq_journal` sin cambio.

Después de esa corrida se aplicó un delta acotado, auditado como `0 P0 · 0 P1`: comandos nuevos
aplicar/cancelar sobre terminal rechazada, dos casos que fuerzan sus constraints y el contador
server-owned `conflictos_total`. Cloud debe ejecutar la fuente final completa, no inferir PASS del
candidato anterior.

Los tests offline de harnesses y UI emitieron `ALQ_F1A_OFFLINE_HARNESS_PASS` y
`ALQ_F1A_UI_OFFLINE_PASS`, ambos con `network:false`.

## Trabajo solicitado

1. Recalcular SHA, bytes, líneas y modos; exigir igualdad exacta con las 52 rutas de
   `REQUIRED_BUNDLE_PATHS`, sin faltantes ni extras. Confirmar que `99` tiene
   `will_execute=false` y que el manifiesto no se auto-hashea.
2. Verificar que `_sources` es la única autoridad forward; no contiene `BEGIN`, `COMMIT` ni
   `ROLLBACK` top-level. El espejo `<V>`, recibo de publicación, one-shot y ledger deben estar
   ausentes.
3. Auditar línea por línea source, baseline, SQL `00`–`04`/`99`, dos HTML, coordinador,
   harnesses, schemas, catálogos y runbooks. Reportar P0/P1/P2 con ruta y línea.
4. Trazar los 14 rojos a su defensa nominal y preservar TCTRL/RCTRL/ACTRL. Ejecutar los válidos
   adyacentes para excluir una solución que rechaza todo.
5. Revisar todos los writers, incluido DML privilegiado; constraint triggers, matriz exacta de
   efectos, contexto server-owned del dispatcher, locks ordenados/fail-fast, T02/legacy, depósito
   conservador y reversas acumuladas confirmadas.
6. Verificar state machine v2, TTL de 15 minutos, hecho/intentos, hashes separados, recibos
   append-only, command/operation request IDs, replay, cancelación, reintento, rechazo sin fila,
   deriva y propagación de errores técnicos.
7. Probar RLS/ACL con propietario, ajeno, sin vínculo, admin, owner+admin, anon y service_role;
   revisar owner, `SECURITY DEFINER`, `search_path`, grants y compatibilidad de las 45 operaciones.
8. Reproducir con el asset oficial Postgres.app v2.8.5/PG17.6 sellado, dos backends/PID distintos y
   barrera observada en `pg_locks`; PG18 o concurrencia secuencial no sustituyen esta compuerta.
9. Auditar el coordinador por AST: sin red, DB, subprocess ni credenciales; una tool call sólo puede
   acreditarse mediante transcript MCP real. Probar evidencia vieja, SHA/run_id errado, bundle
   truncado y respuesta perdida de apply.
10. Confirmar el protocolo future-scoped: schemas de `execute_sql`, `apply_migration` y
    `list_migrations` sin `project_id`; el MCP account-wide actual debe producir STOP.
11. Revisar cleanup por namespace+run_id derivado server-side, conteos/hashes PRE=POST, cero Auth,
    cero secuencias consumidas y cero borrado por IDs aportados por el caller.
12. Confirmar que rollback `99` jamás es automático, no usa `CASCADE`/`setval`, no borra historial y
    falla cerrado ante cualquier uso o dependencia posterior.

## Salida requerida

Crear únicamente `docs/auditorias/AUDITORIA-CLOUD-PAQUETE-ALQ-F1A-QA-2026-08-21.md` con:

- SHA propio y SHA del bundle lock auditado;
- tabla P0/P1/P2;
- matriz 14+3, válidos, state, RLS y concurrencia;
- evidencia PG17.6 y tests offline;
- lista exacta de bytes aprobados;
- dictamen `PASS_PARA_PUBLICAR_NO_EJECUTAR` o `FAIL`;
- confirmación de cero archivos del paquete/autoridad editados; la única escritura permitida es el
  informe de auditoría.

Un PASS sólo autoriza a Mariano a publicar exactamente esos bytes. Luego Cloud debe verificar
commit/ruta/blob/SHA y emitir un recibo JSON conforme a
`alq-f1a-publication-receipt.schema.json`, ligado al informe humano por ruta+SHA. Sólo ese recibo y
un ACK nuevo de Mariano, ligado a los SHA finales, pueden habilitar la ejecución futura en QA.
