# Adenda 2 Codex al Plan Único Alquileres V3 · frontera F1-A / F1-B

**Fecha:** 21 de agosto de 2026  
**Modalidad:** decisión de alcance; **cero implementación y cero ejecución**  
**Destino futuro:** sólo QA `rsjwqmpseknvydistgfr`; producción `wajkfydxutptcvvfwrvq` prohibida

Esta adenda complementa, sin reescribir ni invalidar, estos documentos sellados:

- Plan V3 `aa55c471fc50d1354f32583d786f3970766c99edfdd1b8eabb577bab30dab641`;
- Adenda V3 O1–O6 `bfd93b829244d08ea45a6059b43253aefca8d0e891ef932196737d83d4de0738`;
- cierre Cloud F0 `2b20d8de4e50d968ace163619d5fa22a4bd9a8dfe706f3a8fb2472a7ec421da1`;
- adenda de 27 vistas y piloto Ñancos 52 · D 001
  `cf8a85a238cfe8fa9fe65e645880f5533d606560f9698c4abc797c995ccb415f`;
- sello Cloud D0 `c1b86a348612c4eb40fb9afe473690f73127274db48882a4972dad02fe3d9495`.

## 1 · Contradicción resuelta

**Coincidimos con Cloud: los 14 defectos reproducidos por D0 pertenecen a F1-A.**

La frase “fuentes server-owned” tenía dos sentidos distintos y los documentos los mezclaron:

1. **validación server-side:** el servidor consulta relaciones, monedas, saldos, vigencias y topes
   reales y rechaza un candidato inválido;
2. **derivación funcional server-owned:** el servidor decide o calcula desde fuentes canónicas qué
   relación, monto, estado, período, ajuste, factura o línea de rendición corresponde producir.

F1-A incorpora el primer sentido. F1-B conserva el segundo. Validar ahora los ocho caminos ya
existentes no autoriza al cliente a convertirse en fuente de verdad y tampoco adelanta a F1-A las
funciones constructivas de F1-B.

## 2 · Qué entra en F1-A

### 2.1 · Los 14 rojos de D0

- `N01` — moneda de nota contra cargo;
- `C01` — moneda de crédito/consumo/cargo;
- `C02` — crédito contra contrato/propiedad incompatibles;
- `T01` — moneda de las piernas contra moneda de las cuentas;
- `T02` — cuenta inactiva;
- `D01` — consumo superior al saldo de depósito;
- `D02` — liquidación más devolución superior al saldo de depósito;
- `R01` — reversa sin reapertura suficiente;
- `R02` — reversa con reapertura parcial insuficiente;
- `J01` — propiedad del cargo distinta de la del contrato;
- `J02` — período ajeno al contrato;
- `J03` — deudor ajeno al contrato;
- `J04` — pagador ajeno al deudor o a una garantía vigente;
- `J05` — beneficiario ajeno al acreedor histórico del cargo.

Son guardas relacionales y límites globales. Deben proteger las ocho operaciones existentes y los
escritores directos privilegiados mediante validadores/transacciones/constraints adecuados; no
alcanza con esconder botones en la interfaz.

### 2.2 · Método y seguridad que ya asignaba la Adenda V3 a F1-A

- migración canónica y versionable;
- suite de invariantes, casos válidos, RLS y concurrencia;
- idempotencia por hecho de negocio, no sólo por intento;
- observabilidad, aislamiento, privilegios mínimos, restore, rollback y manifiesto;
- contrato de despliegue y de reconciliación ante resultado desconocido.

D0 ya está terminado y sellado: es antecedente y evidencia, no una tarea que F1-A vuelva a ejecutar.

## 3 · Qué permanece en F1-B

- factura compartida y reparto entre unidades;
- generación o derivación funcional de relaciones, montos, estados y fuentes canónicas;
- operaciones funcionales faltantes;
- cálculo de ajustes, períodos/cargos y rendiciones desde hechos elegibles;
- cadena original/corrección/fuente de rendición;
- demás fundaciones funcionales que no sean necesarias para rechazar los 14 vectores existentes.

La factura compartida sigue reprogramada después de F3 para el primer piloto porque Ñancos 52 ·
D 001 tiene cuentas individuales de electricidad y gas. No desaparece del plan general.

## 4 · Reglas anti-falso-verde

- El SQL D0 sellado no se edita ni se vuelve a ejecutar.
- F1-A crea una regresión nueva, derivada de los mismos 17 vectores.
- Cada rojo debe fallar por su guarda financiera nominal; un rechazo previo de Auth, ACL, formato,
  `custodiada` deshabilitada o FK ajena no cuenta.
- Los tres controles verdes conservan exactamente SQLSTATE, mensaje y constraint vigentes.
- Debe existir al menos un caso válido por familia. “Rechazar todo” es fallo, no seguridad.
- R01/R02 comparan contra la porción efectivamente aplicada que la reversa deshace; no imponen una
  igualdad ingenua con dinero nunca aplicado.
- J03 mantiene al inquilino como deudor del alquiler. Una garantía vigente puede pagar J04, pero no
  cambia retroactivamente quién era el deudor.
- J05 usa el acreedor fijado en el cargo, no el titular actual de una propiedad que pudo venderse.

## 5 · Estado que habilita esta decisión

Esta adenda sólo permite preparar el encargo F1-A. No autoriza crear SQL, modificar el motor,
conectar con permisos mutantes, ejecutar D0, publicar, hacer commit, push ni deploy.

F1-A tampoco queda “cerrado” sólo porque la base pase los 17 rechazos: esta copia no es un worktree
Git, no existe hoy `supabase/migrations/` y `.gitignore` excluye `*.sql`. El cierre exige además que
los artefactos canónicos queden publicables y que Mariano publique los mismos bytes auditados.

