# Inventario local de Edge Functions · ALQ F1-A

**Fecha:** 21 de agosto de 2026  
**Estado:** `INVENTARIO_LOCAL_SELLABLE · REMOTO_NO_RECONCILIADO · CERO_DEPLOY`  
**Alcance:** lectura de `supabase/functions/` y `supabase/config.toml`; sin red, CLI ni secretos

Este artefacto no afirma qué funciones están `ACTIVE` en Supabase. La actividad, versión y bytes
remotos no son deducibles del árbol local. F1-A sólo puede cerrarse cuando Cloud reconcilie el
inventario remoto con estas rutas y SHA; una función remota extra, ausente o con bytes distintos es
STOP. En esta construcción no se modifica ni despliega ninguna Edge Function.

## 1 · Configuración local observada

`supabase/config.toml` declara:

- `project_id = "sur-patagonia-main-2"`, etiqueta local que no demuestra el ref remoto;
- sólo una sección de función: `[functions.robot-facturas]`;
- `robot-facturas.verify_jwt = true` explícito.

Para las otras tres funciones `verify_jwt` queda `NO_DECLARADO_LOCAL`. No se infiere un default de
la plataforma ni se convierte ausencia de configuración en `true`. La reconciliación remota debe
registrar el valor efectivo de cada función.

## 2 · Fuentes locales exactas

| Función local | Fuente | SHA-256 | Líneas | Bytes | `verify_jwt` local | Dependencia importada | Lock/config de dependencias |
|---|---|---|---:|---:|---|---|---|
| `admin-actualizar-email` | `supabase/functions/admin-actualizar-email/index.ts` | `59c9209f2b09ad9bfd8cce22566f9979bfd798481438a956178a8faa0b65e5db` | 174 | 7628 | `NO_DECLARADO_LOCAL` | `https://esm.sh/@supabase/supabase-js@2.110.5` | no hay `deno.json`, import map ni lock local |
| `admin-crear-usuario` | `supabase/functions/admin-crear-usuario/index.ts` | `0a7bf5e88cfe8118486368259c3231747c508a5b4a0ddef16399807922b8fe85` | 277 | 11010 | `NO_DECLARADO_LOCAL` | `https://esm.sh/@supabase/supabase-js@2.110.5` | no hay `deno.json`, import map ni lock local |
| `admin-reset-password` | `supabase/functions/admin-reset-password/index.ts` | `aebd31c00f7d5973ffead9c46ae2c5b1a10c5884864e72056ac3d72910bd9e60` | 62 | 2455 | `NO_DECLARADO_LOCAL` | `https://esm.sh/@supabase/supabase-js@2` | versión sólo mayor; no hay lock local |
| `robot-facturas` | `supabase/functions/robot-facturas/index.ts` | `dcf7f6e102af62197b340d29912cba9a1dadbbfdf63450ae989195e49786d52a` | 20 | 642 | `true` explícito | ninguna | no aplica; stub sin imports |

Los hashes corresponden a los bytes locales inspeccionados el 2026-08-22. Si cambia una fuente,
esta tabla queda obsoleta y debe regenerarse antes del bundle lock.

## 3 · Capacidades y dependencias por función

| Función | Entrada/auth observada | Efectos privilegiados observados | Variables de entorno por nombre | Egreso/dependencias |
|---|---|---|---|---|
| `admin-actualizar-email` | `POST`; Bearer obligatorio; `auth.getUser()`; exige `app_metadata.rol=admin` | Auth Admin: lookup/list/update email; actualiza `public.canales`; intenta compensar Auth si falla el espejo | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth/Data API vía `supabase-js@2.110.5` |
| `admin-crear-usuario` | `POST`; Bearer obligatorio; `auth.getUser()`; exige `app_metadata.rol=admin` | Auth Admin create/delete; consulta `proyectos`; RPC `admin_guardar_usuario_perfil_2f` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth/Data API vía `supabase-js@2.110.5` |
| `admin-reset-password` | `POST`; Authorization presente; `auth.getUser()`; exige `app_metadata.rol=admin` | Auth Admin `updateUserById` para password | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth vía `supabase-js@2` no fijado a versión exacta |
| `robot-facturas` | cualquier método; no lee JWT aunque config exige verificación de plataforma | ninguno; siempre HTTP 410 `ALQ_F0_ROBOT_DESHABILITADO` | ninguna | ninguno; no red, Gmail, Storage, Postgres ni service role |

Sólo se inventarían nombres de variables —nunca valores— en un recibo. Tokens, llaves, headers de
autorización, correos, password y payloads quedan prohibidos.

## 4 · Hallazgos fail-closed

1. `admin-reset-password` usa `@supabase/supabase-js@2`, no una versión exacta. Es deuda de cadena
   de suministro; este paquete no la corrige porque Edge Functions están fuera del delta F1-A.
2. No existe lock de Deno/import map local para ninguna de las cuatro fuentes.
3. `verify_jwt` no está declarado localmente para las tres funciones admin. Hasta medir el valor
   remoto efectivo, el estado es `NO_VERIFICADO`, no PASS.
4. `admin-reset-password` valida presencia del header, pero no su forma Bearer antes de construir el
   cliente; la identidad se valida después con `getUser()`. Se registra como diferencia frente a
   las otras dos funciones admin, sin modificarla aquí.
5. CORS permite `Access-Control-Allow-Origin: *` en las tres funciones admin. La autorización sigue
   dependiendo del JWT verificado y de `app_metadata`, pero origen permitido y JWT son controles
   distintos.
6. `robot-facturas` está localmente neutralizada y no importa dependencias; no se afirma que esos
   bytes sean los desplegados hasta reconciliar el remoto.

Estos hallazgos no habilitan cambios laterales. Se trasladan a auditoría/plan propio si Cloud los
confirma en la superficie activa.

## 5 · Recibo remoto mínimo para cierre

Cloud debe emitir evidencia machine-readable sin secretos, con una fila por función activa:

```json
{
  "name": "nombre-exacto",
  "status": "ACTIVE",
  "source_path": "supabase/functions/nombre-exacto/index.ts",
  "local_sha256": "64-hex",
  "remote_source_sha256": "64-hex",
  "verify_jwt": true,
  "dependency_specifiers": ["specifier-sin-credenciales"],
  "dependency_lock_sha256": null
}
```

El recibo de conjunto debe ligar `target_ref=rsjwqmpseknvydistgfr`, negar producción sin incluir
secretos, enumerar exactamente el catálogo remoto completo y declarar `deployed=false` para esta
auditoría. `local_sha256 != remote_source_sha256`, una función activa extra o un `verify_jwt` no
reconciliado impiden `F1A_CERRADO_QA`.
