# Auditoría Codex pre-ejecución · ALQ F1-A

**Corte:** 22 de agosto de 2026  
**Estado:** `CONSTRUIDO_NO_EJECUTADO · LISTO_PARA_AUDITORIA_CLOUD`  
**Destino futuro exclusivo:** QA `rsjwqmpseknvydistgfr`  
**Producción denegada:** `wajkfydxutptcvvfwrvq`

## 1 · Autoridad

- Adenda F1-A/F1-B: `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7`.
- Encargo ejecutable: `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`.
- Auditoría de autoridad preconstrucción: `4a6d2a8462c0eeee9beb26c8fe64aca62b1a0d9aefa8e0fb782b8e49c859fe9f`.
- Sello Cloud del encargo: `d53bf9f8a5dc11d2dcab57582c18b9a26411700a9d74b79f46b9da6ada7439a0`.
- ACK recibido: `AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821`.

El ACK recibido autoriza construcción local. No autoriza aplicar el paquete en QA.

## 2 · Bytes principales auditados

| Artefacto | SHA-256 | Resultado |
|---|---|---|
| Baseline PG17 autocontenido | `c7234326fcd09470d513d4f5917fd9c653ce2c43a9621f02c498de8363e16068` | 46 tablas, 27 vistas y 45 operaciones; sin datos de negocio |
| Fuente forward única | `d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701` | auditoría final `0 P0 · 0 P1` |
| Regresión local | `23c36d55fab60cc69b28bb194625d30501f45853cb72fe0e44ffe457c4eae48d` | bloque forward idéntico a la fuente |
| Coordinador offline | `3e53f9626f78e9f8cdb23b2ed2252d3b84cd34eae764fc14bd17eb6b4a8d894f` | sin red, DB ni subprocess |
| Consumidor admin | `2f5f7d26b0912f5f76302212445f4755e161d1f876c52d72c773eca6a1834554` | adaptador v2 + fallback v1 |
| Consumidor franjas | `df389521a65aa79db6c7fc5f1138c092cb0e201bc6a1f490194a30f80edd8ae2` | adaptador v2 + fallback v1 |

El bloque `ALQ_F1A_FORWARD_SINGLE_SESSION_SUITE` es byte-idéntico entre fuente y regresión:
SHA-256 `dfedd1bca209ffa0aa3964fef3d6bd6c650e75fa2f253835100db58479811ff3`.

## 3 · Evidencia local

- Runtime oficial Postgres.app v2.8.5 / PostgreSQL 17.6 (`server_version_num=170006`),
  asset de 119011324 bytes y SHA-256
  `ac33180158d2b977f7a795c63fef348a2126139b5441eb9f9e0463fff007f7eb`.
- La última corrida integral previa al delta final aplicó el forward en un cluster descartable,
  socket-only, y cerró `17/17` rechazos exactos, `14/14` válidos adyacentes, `5/5` estados,
  `10/10` RLS, cleanup cero, assert global OK y secuencia de journal sin deriva.
- El delta final agregó recibos durables para comandos nuevos sobre terminal rechazada y el
  contador server-owned `conflictos_total`; fue re-auditado estáticamente con veredicto
  `PASS · 0 P0 · 0 P1`.
- Autoprueba del plumbing offline: `ALQ_F1A_OFFLINE_HARNESS_PASS`, 11 scripts y 8 schemas,
  `network=false`.
- Compatibilidad UI offline: `ALQ_F1A_UI_OFFLINE_PASS` para los dos consumidores, con allowlist
  exacta, referencias estables, estado durable, retry explícito y fallback v1.

La reproducción independiente del SHA final completo queda deliberadamente como compuerta de
Cloud; esta auditoría no convierte evidencia estática en evidencia runtime.

## 4 · Controles de seguridad y operación

- La fuente no contiene `BEGIN`, `COMMIT` ni `ROLLBACK` top-level; la transacción pertenece a
  `apply_migration`.
- Los SQL 00, 02 y 04 son read-only y fallan cerrados; el SQL 03 sólo admite fixtures sintéticos,
  namespace/run_id reservado y cleanup exacto.
- El rollback 99 queda sellado con `will_execute=false`, autorización física falsa antes de todo
  DDL, `RESTRICT`, cero `CASCADE`, cero `setval` y cero edición del historial remoto.
- El coordinador no abre red ni base, no simula MCP y no puede repetir un apply ambiguo.
- El inventario machine-readable exige igualdad exacta con 52 rutas; ni un bundle recortado ni un
  artefacto extra pueden autodeclararse completos.
- Producción está en denylist literal. El MCP account-wide actual continúa siendo un `STOP`; una
  futura ejecución requiere conector project-scoped y tools sin `project_id` seleccionable.

## 5 · Ausencias verificadas

Antes del cierre se verificó la ausencia de:

- espejo `supabase/migrations/<V>_alq_f1a_guardas_financieras_y_metodo.sql` inventado;
- recibo Cloud post-publicación;
- archivo one-shot de ejecución;
- log de ejecución;
- mutaciones en QA o producción.

## 6 · Compuertas que siguen fuera de esta autorización

1. Auditoría Cloud sobre los bytes exactos y reproducción PG17 del SHA final.
2. Publicación de esos mismos bytes y recibo machine-readable ligado al commit/blob/SHA.
3. Reconexión MCP exclusivamente a QA y atestación de sus tres tools.
4. Nuevo ACK literal de ejecución ligado al bundle publicado.
5. Sólo entonces: PRE, apply único, reconciliación, post-install, calificación+cleanup y post-final.

## 7 · Veredicto

El paquete queda `CONSTRUIDO_NO_EJECUTADO` y apto para el control independiente de Cloud. Esta
conclusión no afirma instalación en QA, no autoriza ejecución y no adelanta el espejo `<V>`.
