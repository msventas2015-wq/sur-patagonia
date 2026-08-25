# Auditoría Codex · autoridad ALQ F1-A · pre-construcción

**Fecha:** 21 de agosto de 2026  
**Destino futuro único:** QA `rsjwqmpseknvydistgfr`  
**Estado:** `LISTO_PARA_AUDITORIA_CLOUD · NO_AUTORIZADO_A_CONSTRUIR · NO_EJECUTADO`

## 1 · Corte auditado

| Artefacto | SHA-256 |
|---|---|
| `docs/briefs/ADENDA-2-CODEX-PLAN-UNICO-ALQUILERES-V3-FRONTERA-F1A-F1B-2026-08-21.md` | `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7` |
| `docs/briefs/ENCARGO-CODEX-ALQ-F1A-GUARDAS-FINANCIERAS-Y-METODO-QA-2026-08-21.md` | `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583` |
| `docs/briefs/BRIEF-CLOUD-AUDITAR-ENCARGO-ALQ-F1A-QA-2026-08-21.md` | `ae4ce95642929265f18f3fb91014be4bf05bf74171f2eefdfa3fcd805dd84b08` |

La cadena anterior Plan V3 → Adenda V3 → F0 → D0 fue recalculada y coincide con los SHA declarados
en el encargo. D0 permanece byte-inmutable y no fue reejecutado.

## 2 · Decisión de alcance

**PASS.** La contradicción quedó resuelta sin mover toda F1-B:

- F1-A incorpora los 14 rojos D0 como validación e integridad server-side sobre las ocho rutas
  existentes;
- F1-B conserva la derivación funcional server-owned de relaciones, montos, períodos, ajustes,
  factura compartida y rendiciones;
- D0 es evidencia congelada, no una tarea de F1-A;
- los tres controles heredados conservan SQLSTATE, mensaje y constraint exactos.

## 3 · Resultado técnico

Auditorías independientes sobre el SHA final del encargo:

- matriz financiera y regresión D0: `PASS · 0 P0 · 0 P1`;
- arquitectura, writers, locks, idempotencia y recuperación: `PASS · 0 P0 · 0 P1`;
- alcance, RLS, protocolo físico, MCP y transacción: `PASS · 0 P0 · 0 P1`;
- consistencia Adenda/Encargo/Brief Cloud: `PASS · 0 P0 · 0 P1`.

Quedaron sellados, entre otros:

- 14 rechazos nominales + TCTRL/RCTRL/ACTRL exactos + casos válidos adyacentes;
- reversas acumulativas sólo sobre estados confirmados y depósito con fórmula única;
- T02 con versión/timestamp server-owned, tupla histórica inmutable y legado sin backfill falso;
- prevalidación antes de crear el hecho; rechazo inicial = 0 hecho, 0 operación, 1 recibo;
- separación entre `operacion_request_id` y `comando_request_id`, recibos append-only y FK compuesta
  evento → operación → hecho;
- hecho idempotente separado de intentos, reintento explícito y cero retry automático;
- writers alternativos, fuentes mutables, orden total de locks y relectura después del lock;
- 45 operaciones v1 compatibles, v2 acotado a ocho rutas y dos adaptadores HTML mínimos;
- fixture local PostgreSQL 17.6, regresión local completa y calificación QA sin hecho financiero;
- dos tablas privadas nuevas con RLS forzada, cero policy/grant API y funciones privadas allowlisted;
- cleanup QA por namespace+`run_id`, orden FK y postcheck final de cero residuo;
- migración `apply_migration` tool-owned, sin control transaccional top-level ni reparación manual de
  `supabase_migrations`;
- fuente `_sources` publicada antes de QA y espejo `<V>` creado sólo después de que el servidor
  asigne la versión.

## 4 · Mediciones read-only de QA

Las mediciones usadas para falsar el contrato dieron:

- `current_database=postgres`, `current_user=postgres`, `server_version_num=170006` y marca QA
  positiva;
- 112 operaciones aplicadas y 0 preparadas;
- 12 transacciones de caja: 7 `custodiada`, 0 transferencias;
- 1 cuenta de custodia activa;
- 46 filas en `supabase_migrations.schema_migrations` al corte;
- producción no fue consultada ni tocada durante esta preparación.

Son señales a revalidar, no constantes actualizables por conveniencia.

## 5 · Compuertas pendientes, intencionales

No son defectos del encargo; impiden avanzar sin autoridad:

1. Cloud debe auditar los tres documentos y emitir `PASS · 0 P0 · 0 P1`;
2. recién entonces Mariano puede dar el ACK de **construcción**:

   ```text
   AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821
   ```

3. el PostgreSQL 17.6 local no se descarga ni usa antes de ese ACK;
4. el MCP disponible hoy sigue siendo account-wide y queda prohibido para mutar. Una ejecución
   futura exige otro conector project-scoped exclusivamente a QA, PASS de los bytes publicados y un
   ACK de ejecución distinto.

## 6 · Veredicto

**PASS DE AUTORIDAD PRE-CONSTRUCCIÓN · 0 P0 · 0 P1.**

Se crearon únicamente los tres documentos de autoridad y este informe. No se implementó motor,
SQL, migración, RPC, trigger, constraint, UI ni runner. No hubo DDL/DML, deploy, commit, push ni
mutación en QA o producción.
