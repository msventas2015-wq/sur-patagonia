# Manifiesto final de construcción · ALQ F1-A

**Nombre histórico del archivo:** `MANIFIESTO-BORRADOR`  
**Corte:** 22 de agosto de 2026  
**Estado:** `CONSTRUIDO_NO_EJECUTADO · PENDIENTE_AUDITORIA_CLOUD`  
**Destino futuro único:** QA `rsjwqmpseknvydistgfr`  
**Producción:** denegada (`wajkfydxutptcvvfwrvq`)

Este documento no contiene su propio SHA. El bundle lock offline, generado después de congelar los
bytes, enumera las 52 rutas exactas con SHA-256, bytes, líneas, modo, rol y `will_execute`.

## 1 · Autoridad

| Artefacto | SHA-256 |
|---|---|
| Adenda F1-A/F1-B | `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7` |
| Encargo ejecutable | `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583` |
| Auditoría preconstrucción | `4a6d2a8462c0eeee9beb26c8fe64aca62b1a0d9aefa8e0fb782b8e49c859fe9f` |
| Sello Cloud del encargo | `d53bf9f8a5dc11d2dcab57582c18b9a26411700a9d74b79f46b9da6ada7439a0` |

ACK de construcción recibido:
`AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821`.

Ese ACK no es el ACK futuro de ejecución.

## 2 · Núcleo congelado

| Ruta | SHA-256 | Líneas | Bytes | Canal futuro |
|---|---|---:|---:|---|
| `supabase/baselines/alq_v1_qa_adoptado_20260821.sql` | `c7234326fcd09470d513d4f5917fd9c653ce2c43a9621f02c498de8363e16068` | 7139 | 252897 | local solamente |
| `supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql` | `d05e853bf1447e9df3493eea1fd8c2893f8b535b940ff091646ec35c0293f701` | 6020 | 319266 | `apply_migration`, una vez |
| `docs/auditorias/sql/ALQ-F1A-01-REGRESION-COMPLETA-LOCAL-2026-08-21.sql` | `23c36d55fab60cc69b28bb194625d30501f45853cb72fe0e44ffe457c4eae48d` | 2350 | 115735 | local solamente |
| `docs/auditorias/sql/ALQ-F1A-COORDINADOR-OFFLINE-QA-2026-08-21.py` | `3e53f9626f78e9f8cdb23b2ed2252d3b84cd34eae764fc14bd17eb6b4a8d894f` | 764 | 36933 | offline; nunca abre red/DB |
| `admin/alquileres-admin-qa.html` | `2f5f7d26b0912f5f76302212445f4755e161d1f876c52d72c773eca6a1834554` | 1202 | 76035 | publicación previa a QA |
| `admin/alquileres-franjas-qa.html` | `df389521a65aa79db6c7fc5f1138c092cb0e201bc6a1f490194a30f80edd8ae2` | 1066 | 63093 | publicación previa a QA |

## 3 · SQL de control y recuperación

| Ruta | SHA-256 | Modo |
|---|---|---|
| `docs/auditorias/sql/ALQ-F1A-00-PRECHECK-READONLY-QA-2026-08-21.sql` | `6a429c49a3fe1e7a8754b5892113c9b01291a3e119f1ef0a131b543f54ae54eb` | read-only futuro |
| `docs/auditorias/sql/ALQ-F1A-02-POSTCHECK-INSTALACION-READONLY-QA-2026-08-21.sql` | `7c8d7139e9464d111a750811d4870465fd0ba65bfa04232d952afa4a8bab9694` | read-only futuro |
| `docs/auditorias/sql/ALQ-F1A-04-POSTCHECK-FINAL-READONLY-QA-2026-08-21.sql` | `f215ba65948b965c13a01735b3c8913dd050305e63a3e853f5fa37699196c0d3` | read-only futuro |
| `docs/auditorias/sql/ALQ-F1A-99-ROLLBACK-QA-2026-08-21.sql` | `8aaffa14a42d60a914cb208cf124e59ed0a56d8e7d6beaebdfbda9981ad86149` | `will_execute=false` |

El SQL 03, los dos case-specs de concurrencia, los harnesses, ocho schemas y el resto de la
documentación quedan sellados por sus bytes reales en el bundle lock final. No se duplican aquí
para evitar dos inventarios normativos divergentes.

## 4 · Runtime y evidencia local

- Postgres.app v2.8.5 / PostgreSQL 17.6 / `170006`, arquitectura `arm64`.
- Asset oficial: 119011324 bytes, SHA-256
  `ac33180158d2b977f7a795c63fef348a2126139b5441eb9f9e0463fff007f7eb`.
- Node `v24.19.0`, SHA del binario
  `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`.
- Última corrida integral previa al delta final: 17/17 rojos, 14/14 válidos, 5/5 estados,
  10/10 RLS, cleanup cero, assert OK y journal identity sin deriva.
- Delta final re-auditado: `PASS · 0 P0 · 0 P1`.
- Harnesses offline: PASS, `network=false`; compatibilidad UI: PASS en ambos consumidores.

## 5 · Inventario exacto

La lista normativa de rutas vive en `REQUIRED_BUNDLE_PATHS` de
`docs/auditorias/pruebas-alq-f1a/alq_f1a_common.py`. El generador exige igualdad exacta de conjuntos
y crea, con `O_EXCL`, el lock externo:

`docs/auditorias/alq-f1a/ALQ-F1A-BUNDLE-LOCK-OFFLINE-2026-08-21.json`.

El lock no se auto-incluye. Este manifiesto sí queda incluido y recibe su SHA sólo allí.

## 6 · Artefactos futuros obligatoriamente ausentes

- espejo `supabase/migrations/<V>_alq_f1a_guardas_financieras_y_metodo.sql`;
- recibo Cloud post-publicación JSON y su informe humano;
- `ALQ-F1A-RUN-QA-2026-08-21.once`;
- `ALQ-F1A-RUN-QA-2026-08-21.output.log`.

## 7 · Estado y siguiente autoridad

La construcción no abrió red ni ejecutó SQL en QA o producción. El paquete sólo puede avanzar tras:

1. PASS Cloud sobre el bundle exacto y reproducción PG17 del SHA final;
2. publicación byte-idéntica y recibo de commit/blob/SHA;
3. MCP project-scoped exclusivo a QA;
4. nuevo ACK literal de ejecución ligado a esos bytes.

Hasta entonces el único resultado válido es `F1A_CONSTRUIDO_NO_EJECUTADO`.
