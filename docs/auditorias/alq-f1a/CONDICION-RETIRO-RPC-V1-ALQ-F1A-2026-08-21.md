# Condición de retiro de RPC v1 · ALQ F1-A

Fecha: 2026-08-21  
Estado: regla de gobernanza; no ejecutada  
Autoridad: encargo F1-A SHA-256
`5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`

## 1 · Decisión

F1-A **no revoca ni elimina ningún RPC v1**. Conserva firma, retorno, grants y semántica de
excepción para las 45 operaciones; agrega v2 sólo a la allowlist de ocho y protege ambas versiones
con las mismas guardas de integridad.

El retiro no ocurre por fecha, por haber publicado una pantalla ni por completar una migración. La
ausencia o ambigüedad de telemetría se interpreta como uso posible y bloquea el retiro.

## 2 · Revisión obligatoria

La primera revisión formal de retiro se hace al cierre de F3, después del piloto operativo. Antes
de eso, v1 permanece disponible y auditado. La revisión no autoriza por sí sola una modificación:
cualquier retiro requiere un encargo, migración, rollback y ACK propios.

## 3 · Retiro por operación de las ocho rutas v2

Una ruta v1 de las ocho sólo es elegible si se demuestra todo lo siguiente:

1. todos los consumidores activos del repositorio usan v2 para esa operación;
2. Edge Functions, jobs, integraciones, scripts y otros consumidores remotos fueron inventariados y
   ninguno llama la firma v1;
3. v2 completó al menos un ciclo operativo entero del piloto sin regresión P0/P1 abierta;
4. la ventana de evidencia acordada registra cero llamadas v1 de esa operación y cubre los horarios
   y actores reales; “no tenemos medición” no equivale a cero;
5. no existen preparaciones v1 activas o vencidas pendientes de saneamiento;
6. no hay dependencia de rollback, recuperación o soporte que aún necesite la firma v1;
7. firma, grants, callers y dependencias PostgreSQL se vuelven a fotografiar inmediatamente antes
   de la migración de retiro;
8. Cloud emite PASS sobre bytes y evidencia, y Mariano entrega un ACK literal nuevo.

El retiro es nominal por operación: que una de las ocho cumpla no arrastra a las demás.

## 4 · Retiro completo de la superficie v1

La superficie v1 completa sólo puede retirarse cuando, además de §3:

- las 45 operaciones fueron migradas, reemplazadas o declaradas obsoletas una por una;
- no existe dependencia en repo, Edge Functions, cron, políticas, funciones, triggers ni procesos
  externos;
- la ventana de rollback de la última migración que depende de v1 está cerrada;
- el catálogo final prueba cero caller y especifica la alternativa vigente de cada operación;
- una migración separada usa `RESTRICT`, nunca `CASCADE`, y tiene recuperación fail-forward.

## 5 · Consumidores de F1-A

Durante F1-A sólo pueden adaptarse:

- `admin/alquileres-admin-qa.html`;
- `admin/alquileres-franjas-qa.html`.

Ambos seleccionan v2 únicamente para las ocho operaciones, exigen `ok === true` y conservan v1
para las otras 37. Este cambio de consumidores no constituye evidencia suficiente para retirar v1.
Un consumidor adicional detectado produce STOP y debe incorporarse mediante nueva auditoría.

## 6 · Evidencia mínima del futuro encargo de retiro

- catálogo 45/45 con estado por operación;
- inventario de consumidores local y remoto con hashes;
- métricas de uso y ventana temporal declarada;
- foto de preparadas activas/vencidas y saneamiento;
- dependencias de `pg_depend`, firmas, ACL y definiciones;
- pruebas de compatibilidad y recuperación;
- SQL forward/rollback sellado, recibo de publicación, PASS independiente y ACK.

Hasta que esa evidencia exista, el estado obligatorio es `RPC_V1_VIGENTE`.
