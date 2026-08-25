# Reestimación · ALQ F1-A

Fecha: 2026-08-21  
Estado: estimación de construcción y auditoría; no compromiso de calendario  
Autoridad: encargo F1-A SHA-256
`5aec6c5adf5d6cdbe94d17783674fcdb3b67bd41376a81fdc9295d9583c2c583`

## 1 · Unidad de entrega

F1-A sigue siendo **un solo paquete instalable**. Puede construirse y auditarse en ondas internas,
pero no se autoriza una instalación parcial en QA. Los 14 rojos, los tres controles, las guardas
de escritores, el kernel v2, la seguridad, las dos adaptaciones UI y las pruebas forman una sola
frontera de ejecución.

## 2 · Estimación revisada

| Bloque | Esfuerzo estimado |
|---|---:|
| Autoridad, baseline, inventarios y guardas estáticas | 3–5 días-persona |
| Guardas financieras, writers, locks, T02 y compatibilidad v1 | 7–10 días-persona |
| Kernel v2, idempotencia por hecho, recibos, eventos y reintentos | 7–10 días-persona |
| ACL, RLS, wrappers y aislamiento | 3–4 días-persona |
| Fixture PG 17.6, regresión, state machine, RLS y concurrencia | 6–9 días-persona |
| Adaptación mínima y tests de los dos consumidores | 2–3 días-persona |
| Coordinador, postchecks, cleanup, recuperación y documentación | 3–5 días-persona |
| Auditoría, correcciones y cierre de evidencia | 4–6 días-persona |

Suma bruta: **35–52 días-persona**. Con solapamiento controlado entre SQL, harness y auditoría, el
rango operativo esperado es **30–45 días-persona**. Para una persona en secuencia equivale
aproximadamente a **6–9 semanas laborables**; con dos frentes realmente independientes, a **4–7
semanas**, sin contar esperas externas.

La confianza es media: el alcance está cerrado, pero el costo exacto depende de lo que revelen el
inventario de los 45 writers, el fixture PG17 y la reconciliación de consumidores remotos.

## 3 · Camino crítico

1. baseline reproducible y runtime PG 17.6 checksum-pinned;
2. guardas y orden total de locks;
3. kernel v2 y tablas privadas;
4. harness local completo y concurrencia;
5. seguridad/RLS y consumidores;
6. coordinador, recuperación y build-check;
7. auditoría independiente y publicación;
8. ACK nuevo y ejecución QA, fuera de esta etapa.

Las tareas de documentación, catálogos y tests UI pueden avanzar en paralelo después de fijar los
contratos SQL. La prueba concurrente no se adelanta al diseño de locks.

## 4 · Ondas internas sin instalación parcial

| Onda | Salida revisable | Compromiso remoto |
|---|---|---|
| A | alcance, inventarios, baseline y contratos de error | ninguno |
| B | fuente SQL, rollback y fixture local | ninguno |
| C | harnesses, matriz completa, catálogos RLS/45/Edge | ninguno |
| D | consumidores, coordinador, manifiesto y auditoría Codex | ninguno |
| E | auditoría Cloud y recibo de publicación | ninguno hasta ACK |
| F | ejecución one-shot completa en QA | una sola instalación, sólo con ACK nuevo |

Una onda interna puede fallar y volver a construcción sin cambiar QA. No se usa la separación para
instalar “la mitad segura” ni para postergar uno de los 14 rojos a F1-B.

## 5 · Esperas no incluidas

No se contabilizan en los días-persona:

- aprobación o provisión del runtime PG17 checksum-pinned;
- espera de auditoría Cloud;
- publicación y verificación del commit;
- decisión/ACK de Mariano;
- ventana operativa de QA ni reconciliación ante deriva externa.

## 6 · Disparadores de reestimación

Se detiene y reestima si aparece cualquiera de estos hechos:

- consumidor activo adicional;
- writer de alguna de las 45 operaciones fuera del inventario esperado;
- fuente Edge remota irreconciliable con bytes locales;
- baseline QA distinto sin reconciliación read-only;
- necesidad de cambiar una firma v1 distinta de la guarda de expiración autorizada;
- imposibilidad de reproducir PostgreSQL 17.6 con el activo aprobado;
- requisito nuevo de producto, datos reales o F1-B;
- concurrencia que exige cambiar el orden de locks o el modelo de idempotencia sellado.

La reestimación no amplía autoridad ni habilita una ejecución parcial.
