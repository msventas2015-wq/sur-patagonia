# Catálogo canónico de 45 operaciones · ALQ F1-A

**Fecha:** 21 de agosto de 2026  
**Estado:** `CONSTRUIDO_DESDE_BASELINE_Y_FORWARD · NO_EJECUTADO`  
**Autoridad de nombres:** `alq_private.alq_operaciones_v1()` del baseline adoptado  
**Autoridad F1-A:** `supabase/migrations/_sources/alq_f1a_guardas_financieras_y_metodo.sql`

Este catálogo describe la superficie vigente; no habilita datos reales ni reemplaza las guardas de
base. `v1` conserva firma, retorno y excepciones para las 45 operaciones. `v2` entra sólo en las
ocho filas marcadas `F1A_V2`. Las restantes 37 no pueden entrar por los wrappers v2.

## 1 · Convenciones

- **HE:** hecho externo. Para operar hechos reales necesita una clave externa canónica. Si la fila
  no está migrada a v2, su estado de gobernanza es `PENDIENTE_HECHO_V2`, aunque el RPC v1 siga
  existiendo técnicamente.
- **TA:** transición administrativa sobre una raíz existente.
- **CO:** operación compuesta; crea o cambia más de un efecto coordinado.
- **Writer v1:** `public.alq_admin_preparar(text,jsonb)` →
  `public.alq_admin_aplicar(uuid,text,text,jsonb)`. Los dos wrappers de propietario indicados son
  la única excepción nominal.
- **F1A_V2:** también admite `public.alq_admin_preparar_v2`, `aplicar_v2`, `cancelar_v2` y
  `reintentar_v2`; cada acción lleva su propio `comando_request_id`.
- **Idempotencia v1:** el replay de un `request_id` ya aplicado no duplica el efecto, pero una nueva
  preparación no equivale a una clave de hecho externo.

Errores comunes v1, aplicables a todas las filas: `ALQ_OPERACION_NO_PERMITIDA`,
`ALQ_PAYLOAD_NO_ES_OBJETO`, `ALQ_REQUEST_NO_PREPARADO`,
`ALQ_FIRMA_O_PAYLOAD_NO_COINCIDE`, `ALQ_ACTOR_DISTINTO_AL_PREPARADOR`,
`ALQ_OPERACION_NO_APLICABLE` y `ALQ_OPERACION_SIN_IMPLEMENTACION`. Los errores listados abajo son
los nominales adicionales más cercanos a cada rama; constraints/FK pueden aportar rechazos
estructurales sin sustituir una guarda financiera que la matriz exija observar.

## 2 · Las 45 filas exactas

| # | Operación | Clase | Efecto principal | Writers nominales | Idempotencia / estado | Errores estables adicionales |
|---:|---|:---:|---|---|---|---|
| 1 | `parte_alta` | TA | `alq_parte` | v1 admin | `V1_REQUEST_ID` | constraints de `alq_parte` |
| 2 | `parte_editar` | TA | `alq_parte` | v1 admin | `V1_REQUEST_ID` | constraints de `alq_parte` |
| 3 | `propiedad_alta` | TA | `alq_propiedad` | v1 admin | `V1_REQUEST_ID` | constraints/FK de propiedad |
| 4 | `titularidad_asignar` | TA | `alq_titularidad` | v1 admin | `V1_REQUEST_ID` | exclusión/unique de titularidad vigente |
| 5 | `mandato_alta` | TA | `alq_mandato` | v1 admin | `V1_REQUEST_ID` | `ALQ_MANDATO_TITULARIDAD_NO_COINCIDE` |
| 6 | `mandato_baja_avanzar` | TA | estado/vigencia de `alq_mandato` | v1 admin | `V1_REQUEST_ID` | `ALQ_MANDATO_TRANSICION_INVALIDA`, `ALQ_MANDATO_EXPORT_NO_ENTREGADO` |
| 7 | `contrato_alta` | TA | `alq_contrato` | v1 admin | `V1_REQUEST_ID` | unique de contrato vigente y FK |
| 8 | `contrato_version_agregar` | TA | `alq_contrato_version` | v1 admin | `V1_REQUEST_ID` | exclusión de vigencia y checks de versión |
| 9 | `contrato_renovar` | CO | cierra predecesor y crea sucesor | v1 admin | `V1_REQUEST_ID` | constraints de continuidad/contrato |
| 10 | `contrato_rescindir` | CO | `alq_rescision` + estado de contrato | v1 admin | `V1_REQUEST_ID` | constraints/FK de rescisión |
| 11 | `contrato_continuacion_marcar` | TA | estado/fecha de contrato | v1 admin | `V1_REQUEST_ID` | `ALQ_CONTRATO_NO_VIGENTE` |
| 12 | `garantia_alta` | TA | `alq_garantia` | v1 admin | `V1_REQUEST_ID` | constraints de garantía/vigencia |
| 13 | `deposito_evento_registrar` | HE | `alq_deposito_evento` | v1 admin + F1A v2 | `F1A_V2 · alq.deposito_evento/evento_ref` | `ALQ_F1A_D01_DEPOSITO_SALDO_INSUFICIENTE`, guardas de moneda/sucesor |
| 14 | `deposito_liquidar` | TA | `alq_deposito_liquidacion` | v1 admin | `V1_REQUEST_ID` | guardas de depósito; sin devolución compuesta |
| 15 | `cargo_manual_emitir` | TA | `alq_cargo` | v1 admin + F1A v2 | `F1A_V2 · alq.cargo_manual/cargo_fuente_ref` | `ALQ_F1A_J01_PROPIEDAD_CONTRATO_INCOMPATIBLE`, `J02_PERIODO_CONTRATO_INCOMPATIBLE`, `J03_DEUDOR_NO_ELEGIBLE` |
| 16 | `nota_emitir` | TA | `alq_nota` + proyección de cargo | v1 admin + F1A v2 | `F1A_V2 · alq.nota/nota_ref` | `ALQ_F1A_N01_NOTA_MONEDA_INCOMPATIBLE`, `ALQ_CARGO_SALDO_NEGATIVO` |
| 17 | `transaccion_registrar` | HE | `alq_transaccion_caja` | v1 admin | `PENDIENTE_HECHO_V2` | `ALQ_REVERSA_CON_APLICACIONES_REQUIERE_OPERACION_COMPUESTA`; guardas I1/I3 |
| 18 | `aplicacion_asignar` | TA | `alq_aplicacion` + saldos | v1 admin | `V1_REQUEST_ID` | `ALQ_APLICACION_*`, `ALQ_I1_APLICACIONES_SUPERAN_TRANSACCION`, `alq_aplicacion_moneda_ck` |
| 19 | `conversion_registrar` | HE | `alq_conversion_moneda` | v1 admin | `PENDIENTE_HECHO_V2` | `ALQ_CONVERSION_ARITMETICA_INVALIDA`, `ALQ_REGLA_REDONDEO_NO_SOPORTADA` |
| 20 | `ajuste_calcular` | CO | `alq_ajuste` + observaciones | v1 admin | `V1_REQUEST_ID` | constraints de fórmula/observaciones |
| 21 | `ajuste_aprobar` | TA | estado/aprobador de ajuste | v1 admin | `V1_REQUEST_ID` | `ALQ_AJUSTE_NO_CALCULADO` |
| 22 | `ajuste_aplicar` | TA | estado/timestamp de ajuste | v1 admin | `V1_REQUEST_ID` | `ALQ_AJUSTE_NO_APROBADO` |
| 23 | `servicio_cuenta_alta` | TA | `alq_servicio_cuenta` | v1 admin | `V1_REQUEST_ID` | constraints/FK de cuenta de servicio |
| 24 | `servicio_factura_registrar` | HE | `alq_servicio_factura` | v1 admin | `PENDIENTE_HECHO_V2` | `ALQ_SERVICIO_CARGO_NO_COINCIDE` |
| 25 | `rendicion_emitir` | CO | rendición + líneas + saldo final | v1 admin | `V1_REQUEST_ID` | `ALQ_RENDICION_MANDATO_NO_COINCIDE`, `ALQ_I10_RENDICION_MEZCLA_MONEDA` |
| 26 | `giro_registrar` | CO | transacción + aplicación a rendición | v1 admin | `V1_REQUEST_ID` | `ALQ_RENDICION_NO_EMITIDA`, `ALQ_GIROS_SUPERAN_SALDO_RENDICION`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 27 | `rendicion_corregir` | CO | rendición sucesora + líneas | v1 admin | `V1_REQUEST_ID` | `ALQ_I10_CORRECCION_MEZCLA_MONEDA` |
| 28 | `factura_externa_registrar` | HE | `alq_factura_externa` | v1 admin | `PENDIENTE_HECHO_V2` | constraints/FK de factura externa |
| 29 | `comunicado_abrir` | HE | comunicado + primer mensaje | v1 admin; `alq_prop_abrir_consulta` | `PENDIENTE_HECHO_V2` | `ALQ_PROPIETARIO_SIN_ACCESO` en writer propietario |
| 30 | `comunicado_responder` | HE | `alq_comunicado_mensaje` | v1 admin; `alq_prop_responder_consulta` | `PENDIENTE_HECHO_V2` | `ALQ_COMUNICADO_NO_ABIERTO`, `ALQ_PROPIETARIO_SIN_ACCESO` |
| 31 | `comunicado_resolver` | TA | estado de comunicado | v1 admin | `V1_REQUEST_ID` | `ALQ_COMUNICADO_NO_ABIERTO` |
| 32 | `documento_registrar` | HE | `alq_documento` | v1 admin | `PENDIENTE_HECHO_V2` | constraints de hash/storage metadata |
| 33 | `export_baja_generar` | CO | `alq_export_baja` + payload de cierre | v1 admin | `V1_REQUEST_ID` | `ALQ_MANDATO_NO_ESTA_EN_SALDO_FINAL` |
| 34 | `export_baja_entregar` | TA | entrega de export | v1 admin | `V1_REQUEST_ID` | transición/identidad de export |
| 35 | `acceso_revocar` | TA | cierre de vigencia de acceso | v1 admin | `V1_REQUEST_ID` | `ALQ_ACCESO_NO_ACTIVO` |
| 36 | `transferencia_interna` | CO | par exacto de transacciones | v1 admin + F1A v2 | `F1A_V2 · alq.transferencia/transferencia_ref` | `ALQ_F1A_T01_CUENTA_MONEDA_INCOMPATIBLE`, `ALQ_F1A_T02_CUENTA_INACTIVA`, `ALQ_I9_TRANSFERENCIA_NO_ES_PAR_EXACTO`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 37 | `reversa_con_reapertura` | CO | reversa + reaperturas | v1 admin + F1A v2 | `F1A_V2 · alq.reversa/reversa_ref` | `ALQ_F1A_R_REAPERTURA_INSUFICIENTE`, `ALQ_T1_REAPERTURAS_SUPERAN_REVERSA`, T2–T4, `ALQ_CUSTODIADA_DESHABILITADA` |
| 38 | `pago_multimoneda` | CO | transacción + conversiones + aplicaciones | v1 admin + F1A v2 | `F1A_V2 · alq.pago/pago_fuente_ref` | `ALQ_F1A_J04_PAGADOR_NO_ELEGIBLE`, `ALQ_F1A_J05_BENEFICIARIO_NO_ELEGIBLE`, `alq_aplicacion_moneda_ck`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 39 | `credito_devolver` | CO | salida + aplicación de crédito | v1 admin | `V1_REQUEST_ID` | `ALQ_CREDITO_SALDO_NEGATIVO`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 40 | `credito_consumir` | CO | consumo + proyecciones de crédito/cargo | v1 admin + F1A v2 | `F1A_V2 · alq.credito_consumo/consumo_ref` | `ALQ_F1A_C01_CREDITO_MONEDA_INCOMPATIBLE`, `ALQ_F1A_C02_CREDITO_AMBITO_INCOMPATIBLE` |
| 41 | `deposito_liquidar_y_devolver` | CO | liquidación + líneas + devolución + evento | v1 admin + F1A v2 | `F1A_V2 · alq.deposito_liquidacion/liquidacion_ref` | `ALQ_F1A_D02_LIQUIDACION_SUPERA_DEPOSITO`, `ALQ_F1A_D_CARGO_RESIDUAL_NO_SOPORTADO`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 42 | `giro_a_propietario` | CO | salida + aplicación a rendición | v1 admin | `V1_REQUEST_ID` | `ALQ_GIROS_SUPERAN_SALDO_RENDICION`, `ALQ_CUSTODIADA_DESHABILITADA` |
| 43 | `parte_usuario_vincular` | TA | `alq_parte_usuario` | v1 admin | `V1_REQUEST_ID` | `ALQ_PARTE_INEXISTENTE`, `ALQ_AUTH_USER_INEXISTENTE` |
| 44 | `acceso_otorgar` | TA | `alq_acceso_propiedad` | v1 admin | `V1_REQUEST_ID` | `ALQ_PROPIEDAD_INEXISTENTE`, `ALQ_ACCESO_PARTE_USUARIO_NO_VIGENTE`, `ALQ_ACCESO_REQUIERE_TITULARIDAD_VIGENTE` |
| 45 | `mandato_version_agregar` | TA | `alq_mandato_version` | v1 admin | `V1_REQUEST_ID` | `ALQ_MANDATO_INEXISTENTE`, `ALQ_MANDATO_NO_ACTIVO` |

## 3 · Contrato v2 de las ocho filas F1-A

| Operación | Campo de referencia canónica | Namespace físico | Guardas nominales F1-A |
|---|---|---|---|
| `nota_emitir` | `nota_ref` | `alq.nota` | N01 |
| `credito_consumir` | `consumo_ref` | `alq.credito_consumo` | C01, C02 |
| `transferencia_interna` | `transferencia_ref` | `alq.transferencia` | T01, T02; control heredado TCTRL |
| `deposito_evento_registrar` | `evento_ref` | `alq.deposito_evento` | D01 + grafo moneda/sucesor |
| `deposito_liquidar_y_devolver` | `liquidacion_ref` | `alq.deposito_liquidacion` | D02 + residual no soportado |
| `reversa_con_reapertura` | `reversa_ref` | `alq.reversa` | R01/R02 + controles T1–T4 |
| `cargo_manual_emitir` | `cargo_fuente_ref` | `alq.cargo_manual` | J01, J02, J03 |
| `pago_multimoneda` | `pago_fuente_ref` | `alq.pago` | J04, J05 + ACTRL |

En v2 la unicidad física del hecho es `(namespace, clave_version, clave_sha256)`; la identidad del
comando es `comando_request_id` con `comando_sha256`. Un rechazo de prevalidación persiste un único
evento técnico y deja cero hecho/cero operación. No se capturan como negocio `40P01`, `40001`,
`57014`, `42501`, errores de conexión ni códigos fuera de la allowlist.

## 4 · Gates machine-checkable del catálogo

El PRE/POST debe exigir simultáneamente:

1. igualdad de arrays —no sólo cardinalidad— contra las 45 filas, en este orden;
2. `cardinality(alq_private.alq_f1a_operaciones_v2())=8` y conjunto exacto de §3;
3. las ocho son subconjunto de las 45 y las otras 37 quedan fuera de v2;
4. ambos writers de propietario sólo materializan `comunicado_abrir` y
   `comunicado_responder`;
5. cero writer DML directo concedido a `anon`, `authenticated` o `service_role`.

Un conteo 45 con sustitución de nombres, duplicados o reordenamiento es deriva y produce STOP.
