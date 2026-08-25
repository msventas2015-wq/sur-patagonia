# Matriz RLS y superficies de acceso · ALQ F1-A

**Fecha:** 21 de agosto de 2026  
**Estado:** `CONTRATO_FAIL_CLOSED · NO_EJECUTADO_EN_QA`  
**Actores:** seis mínimos + solapamiento propietario/admin

Esta matriz separa cuatro barreras que no son intercambiables: ACL de objeto, RLS, autorización de
negocio dentro del RPC y guardas financieras. Un `42501` por falta de grant no prueba una policy; un
`TO authenticated` no prueba autorización por propiedad; y un error Auth/ACL no satisface un vector
financiero nominal.

## 1 · Superficie estructural obligatoria

| Superficie | Contrato exacto posterior a F1-A |
|---|---|
| 46 tablas `alq` | owner `postgres`; RLS habilitada y forzada; políticas heredadas sin deriva |
| 2 tablas `alq_private` nuevas | `alq_hecho_idempotente_v2` y `alq_operacion_evento_v2`; owner `postgres`; RLS habilitada+forzada; cero policy API; cero ACL de tabla/columna no-owner |
| 27 vistas ALQ | 24 `public.alq_v_*` + 3 `alq.alq_v_*`; `security_invoker=true`; sólo `authenticated` con `SELECT`; `anon`/`service_role` sin acceso directo; cero ACL de columna |
| RPC v1 admin | `public.alq_admin_preparar` y `alq_admin_aplicar`; `authenticated` y `service_role` tienen EXECUTE, pero el core exige actor/admin vigente |
| RPC v1 propietario | `alq_prop_abrir_consulta` y `alq_prop_responder_consulta`; EXECUTE para `authenticated` y `service_role`; el core exige vínculo vigente y limita dos operaciones |
| RPC v2 públicos | preparar/aplicar/cancelar/reintentar; `SECURITY INVOKER`, `search_path=''`; EXECUTE sólo `authenticated` |
| Core v2 privado | cuatro firmas exactas; `SECURITY DEFINER`, owner `postgres`, `search_path=''`; sólo el grant nominal requerido por los wrappers; nunca `PUBLIC`, `anon` ni `service_role` |
| DML directo | ninguna escritura concedida a `anon`, `authenticated` o `service_role`; todo efecto pasa por writer nominal y sus triggers |

Las funciones `SECURITY DEFINER` no usan `user_metadata`: la identidad sale de `auth.uid()` y la
capacidad vigente de tablas server-owned. `service_role` no se considera un actor económico y su
atributo de bypass RLS no le concede por sí mismo ACL ni autorización de negocio.

## 2 · Vistas cubiertas

Tres vistas owner-scoped en `alq`:

- `alq_v_comunicados_propietario`;
- `alq_v_estado_cartera`;
- `alq_v_propiedades_propietario`.

Veinticuatro vistas API en `public`:

`alq_v_acceso_propiedad`, `alq_v_aplicacion`, `alq_v_cargo`, `alq_v_comunicado`,
`alq_v_comunicado_mensaje`, `alq_v_contrato`, `alq_v_contrato_version`,
`alq_v_cuenta_custodia`, `alq_v_documento`, `alq_v_factura_externa`, `alq_v_garantia`,
`alq_v_mandato`, `alq_v_mandato_version`, `alq_v_nota`, `alq_v_operacion`, `alq_v_parte`,
`alq_v_parte_usuario`, `alq_v_propiedad`, `alq_v_rendicion`, `alq_v_rendicion_linea`,
`alq_v_servicio_cuenta`, `alq_v_servicio_factura`, `alq_v_titularidad` y
`alq_v_transaccion_caja`.

El gate compara el conjunto completo y sus opciones; `27` con una vista sustituida es FAIL.

## 3 · Matriz por actor

`PROPIA` y `AJENA` son dos propiedades sintéticas distintas. “Admin RPC” comprende v1 y v2;
“Prop RPC” comprende únicamente abrir/responder consulta. Los errores nominales se verifican antes
de aceptar el caso como PASS.

| Actor | Rol/JWT de prueba | Lectura por vistas | Admin RPC v1/v2 | Prop RPC v1 | DML directo `alq` | Tablas v2 privadas |
|---|---|---|---|---|---|---|
| Admin vigente | `authenticated`, sub sintético con capacidad admin vigente | ve `PROPIA` y `AJENA`; 2/2 en fixture | permitido por negocio; payload inválido debe llegar al error nominal posterior, no a Auth | no se usa como bypass alternativo | `42501` | `42501` |
| Propietario vinculado | `authenticated`, vínculo vigente a `PROPIA` | ve sólo `PROPIA`; `AJENA` oculta | denegado por ausencia de capacidad admin | permitido sólo sobre `PROPIA` y comunicado visible | `42501` | `42501` |
| Propietario ajeno | `authenticated`, vínculo vigente únicamente a `AJENA` | ve sólo `AJENA`; objetivo `PROPIA` oculto | denegado por ausencia de capacidad admin | objetivo `PROPIA` denegado; su propia propiedad conserva acceso | `42501` | `42501` |
| Auth sin vínculo | `authenticated`, sub sintético sin fila ALQ | 0 filas en las 27 vistas | `ALQ_ACTOR_SIN_VINCULO`/rechazo nominal equivalente | `ALQ_PROPIETARIO_SIN_ACCESO` | `42501` | `42501` |
| `anon` | rol `anon`, sin sub | sin `SELECT`: `42501` | sin EXECUTE: `42501` | sin EXECUTE: `42501` | `42501` | `42501` |
| `service_role` | rol `service_role`, sin fila Auth ficticia | sin `SELECT`: `42501` | v2 sin EXECUTE; v1, aun con ACL heredada, no obtiene actor económico/admin | no se acepta como propietario | sin grant; nunca se acredita seguridad sólo por RLS | sin grant: `42501` |
| Propietario + admin | `authenticated`, mismo sub con vínculo a `PROPIA` y capacidad admin | precedencia admin: ve `PROPIA` y `AJENA`; 2/2 | permitido por capacidad admin vigente | no amplía ni reemplaza la ruta admin | `42501` | `42501` |

## 4 · Casos ejecutables mínimos

| ID | Prueba | PASS exacto |
|---|---|---|
| RLS01 | catálogo de las dos tablas privadas | 2 tablas, RLS+FORCE, 0 policies, 0 ACL no-owner |
| RLS02 | catálogo de vistas | 27 exactas, 27 invoker, 27 con `authenticated:SELECT`, 0 ACL inesperadas |
| RLS03 | catálogo de wrappers v2 | 4 invoker con `search_path=''`, 4 grants auth, 0 ACL inesperadas |
| RLS04 | propietario vinculado | 1 propia, 0 ajena; DML y tabla privada `42501` |
| RLS05 | propietario ajeno | 1 suya, 0 objetivo; DML y tabla privada `42501` |
| RLS06 | authenticated sin vínculo | 0/2; DML y tabla privada `42501` |
| RLS07 | admin | 2/2; DML/privada `42501`; v2 llega a `ALQ_F1A_COMANDO_REQUEST_REQUERIDO` con comando nulo |
| RLS08 | overlap propietario+admin | mismo resultado admin: 2/2; sin DML directo |
| RLS09 | anon | vista y privada `42501` |
| RLS10 | service_role | vista y privada `42501`; no se usa bypass como prueba de negocio |

Además, para cada actor se ejecutan smokes de las cuatro firmas v2 y de los wrappers v1 aplicables.
Un resultado que falle antes por cast, falta de fixture, firma, FK lateral o
`ALQ_CUSTODIADA_DESHABILITADA` no prueba autorización y queda `SONDA_INVALIDA`.

## 5 · Identidades sintéticas y secreto cero

- El único actor real permitido es el bootstrap admin resuelto server-side; su UUID, correo y datos
  personales no salen de la base.
- Propietario vinculado, ajeno, sin vínculo y overlap usan UUID del namespace reservado F1-A y
  filas mínimas en `auth.users` dentro de una subtransacción/transacción que termina en rollback.
- `anon` y `service_role` no reciben usuario Auth ficticio.
- Antes/después se comparan conteo+SHA de `auth.users` y de cada tabla ALQ tocada.
- Un UUID sintético preexistente, una FK deshabilitada, una identidad real reutilizada o una fila
  superviviente produce STOP.

Los recibos sólo serializan actor lógico, rol, conteos, SQLSTATE, código y hashes. No serializan
sub JWT, UUID de bootstrap, correo, documento, payload financiero completo ni credenciales.

## 6 · Anti-bypass privilegiado

El plano privilegiado no promete detener a un superuser que deshabilita guardas deliberadamente.
Sí debe demostrar, con triggers y constraints activos, que un writer privilegiado ordinario no
puede:

1. colgar un hijo de una operación preparada ajena a su tipo;
2. mutar o borrar hecho, evento append-only, identidad o estado terminal;
3. ligar un evento a una combinación operación/hecho/request ajena;
4. omitir la foto server-owned de cuenta o falsificar versión/timestamp;
5. superar topes agregados por concurrencia;
6. escribir un efecto financiero sin el contexto nominal del wrapper.

RLS/ACL, guardas financieras y anti-bypass deben pasar por separado. Ninguna sustituye a otra.
