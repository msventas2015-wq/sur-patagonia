# Decisión de alcance · ALQ F1-A / F1-B

**Fecha:** 21 de agosto de 2026  
**Estado:** `CONSTRUCCION_LOCAL_AUTORIZADA · QA_SOLO_LECTURA · NO_EJECUTADO`  
**Destino futuro único:** QA `rsjwqmpseknvydistgfr`  
**Producción prohibida:** `wajkfydxutptcvvfwrvq`

## 1 · Autoridad

Esta decisión materializa, sin ampliar su fondo:

- Plan Único V3 `aa55c471fc50d1354f32583d786f3970766c99edfdd1b8eabb577bab30dab641`;
- Adenda V3 O1–O6 `bfd93b829244d08ea45a6059b43253aefca8d0e891ef932196737d83d4de0738`;
- Adenda 2 F1-A/F1-B `c186bb0920a505526542d3aa6fccb66688948eaa72949529a79d3d6a2ee7f1f7`;
- encargo F1-A `5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`;
- sello Cloud del encargo, que lo declaró apto para construir;
- ACK literal de construcción emitido por Mariano.

El SQL y resultado D0 permanecen congelados. Son evidencia de partida, no una migración ni una
suite que se vuelva a ejecutar.

## 2 · Entra en F1-A

F1-A construye un único paquete auditable que contiene:

1. las guardas server-side que convierten los 14 rojos D0 en rechazos financieros nominales;
2. la preservación byte-semántica de TCTRL, RCTRL y ACTRL;
3. constraints, constraint triggers, validadores privados y asserts que cubren RPC v1/v2 y todos
   los escritores privilegiados con triggers activos;
4. orden total de locks, relectura posterior al lock y pruebas reales de concurrencia;
5. snapshot server-owned T02 para toda nueva transacción de caja, sin backfill falso sobre legado;
6. idempotencia por hecho para ocho operaciones, separada de intentos y comandos;
7. cuatro RPC públicos v2: preparar, aplicar, cancelar y reintentar;
8. TTL de 15 minutos, rechazo persistido por deriva, reintento sólo explícito y cero retry
   automático;
9. eventos técnicos append-only, recibos idempotentes y vínculo físico evento → intento → hecho;
10. cambios mínimos en los dos consumidores QA autorizados;
11. RLS, ACL, grants nominales, observabilidad, restore, rollback, manifiesto y contrato de
    reconciliación;
12. fixture local PostgreSQL 17.6 y todas las suites previas a cualquier mutación futura de QA.

Las ocho operaciones v2 son:

- `nota_emitir`;
- `credito_consumir`;
- `transferencia_interna`;
- `deposito_evento_registrar`;
- `deposito_liquidar_y_devolver`;
- `reversa_con_reapertura`;
- `cargo_manual_emitir`;
- `pago_multimoneda`.

## 3 · Permanece en F1-B o después

No se construye en este paquete:

- factura compartida y reparto entre unidades;
- derivación funcional server-owned de relaciones, montos, estados y fuentes;
- cálculo de períodos, ajustes, cargos y rendiciones;
- cadena original/corrección/fuente de rendición;
- operaciones funcionales faltantes;
- parser, decimales, cuotas y ciclo contractual de F2;
- importación u operación real de F3;
- robot v7;
- rediseño o publicación del portal;
- datos reales.

La factura compartida sigue en el plan general, pero no bloquea el primer piloto Ñancos 52 · D 001.

## 4 · Decisiones de construcción

- Se construye **un solo paquete de instalación**. Puede organizarse en ondas internas, pero no se
  autoriza una instalación parcial en QA.
- La autoridad forward es un único archivo `_sources`; ningún SQL de auditoría es una segunda copia
  ejecutable de la migración.
- La compatibilidad v1 se conserva durante F1-A. Su condición de retiro queda documentada por
  separado y no se ejecuta en esta ventana.
- Las nuevas tablas privadas no se exponen a roles API y llevan RLS habilitada y forzada.
- El baseline reproducible es schema-only y nunca se aplica sobre QA existente.
- El espejo con versión remota `<V>` no se crea antes de que `apply_migration` asigne esa versión.

## 5 · Autoridad vigente durante esta etapa

Está autorizado:

- crear y modificar sólo los artefactos locales enumerados por el inventario F1-A;
- ejecutar pruebas totalmente locales;
- descargar a `/private/tmp` el único asset oficial permitido de Postgres.app 2.8.5 con PG 17.6;
- hacer mediciones read-only en QA con el ref literal.

Sigue prohibido:

- DDL o DML en QA;
- cualquier acceso a producción;
- `apply_migration`, `psql`, Supabase CLI, dashboard o proyecto linked;
- commit, push, deploy o publicación;
- credenciales dentro de artefactos, logs o chat;
- editar o reejecutar D0.

## 6 · Resultado de esta decisión

La salida de construcción será `F1A_CONSTRUIDO_NO_EJECUTADO`. Sólo Cloud puede auditar los bytes;
sólo Mariano puede publicarlos y emitir después un ACK diferente de ejecución. Este documento no es
un runner ni autoriza una mutación remota.
