# SELLO CLOUD · ENCARGO ALQ F1-A · QA · 21-ago-2026

**Sella los cuatro documentos entregados por Codex:**

```
ADENDA-2-CODEX-PLAN-UNICO-ALQUILERES-V3-FRONTERA-F1A-F1B-2026-08-21.md   c186bb09…  OK
ENCARGO-CODEX-ALQ-F1A-GUARDAS-FINANCIERAS-Y-METODO-QA-2026-08-21.md      5aec6c5a…  OK
BRIEF-CLOUD-AUDITAR-ENCARGO-ALQ-F1A-QA-2026-08-21.md                     ae4ce956…  OK
AUDITORIA-CODEX-AUTORIDAD-ALQ-F1A-PRE-CONSTRUCCION-2026-08-21.md         4a6d2a84…  OK
```

# VEREDICTO: SELLADO CON DOS OBSERVACIONES

**Apto para construir.** Las observaciones son de gestión y de deuda futura; **ninguna bloquea.**

## 1 · Lo que Cloud verificó contra la base

**La fórmula del depósito de §4.3 está sellada literalmente. Cloud la contrastó contra el esquema
vivo de QA, término por término:**

```
alq_deposito.monto_constituido                                    EXISTE
alq_deposito_evento.tipo IN (aplicacion, devolucion,
                             transferencia_a_sucesor)             los 3 están en el CHECK
alq_deposito_liquidacion.estado IN (aprobada, pagada)             los 2 están en el CHECK
alq_deposito_liquidacion_linea.monto · cargo_residual_id          EXISTEN
alq_deposito_evento.contrato_sucesor_id                           EXISTE
```

`[Seguro]` **La fórmula compila.** No hay nombres inventados ni valores de enum inexistentes.

**Hallazgo que refuerza el diseño:** ya existe `alq_deposito_evento_sucesor_ck`, que exige
`contrato_sucesor_id` presente si y solo si el tipo es `transferencia_a_sucesor`. **Respalda la
regla que el encargo agrega en §4.3** — no hay conflicto entre lo nuevo y lo que ya está.

**Los 14 códigos de D0 están los 14** en la matriz de §4.1: N01 · C01 · C02 · T01 · T02 · D01 · D02 ·
R01 · R02 · J01 · J02 · J03 · J04 · J05.

## 2 · Decisiones que Cloud ratifica

```
frontera F1-A/F1-B     los 14 rojos entran en F1-A. Codex aceptó la posición de Cloud
                       con fundamento propio y la dejó escrita. Cerrado.
guardas en el motor    constraint triggers y constraints reales, NO solo dentro del RPC
                       → cubre v1, DML directo y escritores privilegiados
inventario de escritores  de las ~16 tablas financieras, no solo de los ocho nombres compuestos
casos válidos obligatorios  para impedir el falso verde de "rechazar todo" ← muy bien visto
honestidad de alcance  "no promete proteger a un superuser que deshabilita las guardas"
D0 no se repite        sellado, no se edita, no se copia como migración
```

## 3 · Observaciones

### OB1 · `[Riesgo]` La ruta v2 no tiene fecha de defunción de v1

El encargo crea una **ruta v2 para ocho operaciones** y conserva *"el contrato v1 de las 45"*.
La convivencia está bien mitigada —los constraint triggers protegen v1 igual—, **pero el encargo no
dice cuándo v1 se retira.**

**Sin fecha de defunción, v2 no reemplaza a v1: se suma.** Queda una superficie doble que hay que
mantener, probar y auditar indefinidamente, y dos formas de hacer lo mismo con contratos distintos.

**Acción pedida:** que el encargo declare la condición de retiro de v1 —aunque sea *"al cerrar F3"* o
*"cuando las 45 estén migradas"*—. No hace falta hacerlo ahora; hace falta que esté escrito ahora.

### OB2 · `[Riesgo]` El alcance creció respecto de lo estimado — hay que re-estimar

`[Seguro]` La adenda del Plan V3 estimó **F1-A en 1 a 2 semanas**, y esa estimación se escribió
**antes de saber que D0 encontraría 14 defectos**.

Lo que este encargo pide, en un solo paquete:

```
14 guardas financieras nuevas, cada una con su error nominal
ruta v2 para 8 operaciones (preparar y aplicar en dos transacciones, revalidación bajo locks)
tabla nueva de idempotencia por hecho + su tabla de eventos
inventario de escritores de ~16 tablas financieras y sus caminos alternativos
migración canónica, suite de regresión, observabilidad, aislamiento, restore, rollback, manifiesto
```

**Eso no entra en dos semanas.** No es una crítica al encargo —el contenido es correcto y ninguna
pieza sobra— es una advertencia de planificación: **Mariano está contando los días con el número
viejo.**

**Acción pedida:** re-estimar F1-A antes de que arranque, y decir si conviene partirlo en dos
entregas (guardas financieras primero, método después) o si va entero.

## 4 · Qué autoriza este sello

```
AUTORIZADO     construir el paquete F1-A con el ACK:
               AUTORIZO_ALQ_F1A_CONSTRUIR_PAQUETE_GUARDAS_FINANCIERAS_Y_METODO_EN_QA_20260821

NO AUTORIZADO  instalar, migrar o ejecutar nada. Los bytes construidos requieren
               auditoría de Cloud, ACK de instalación de Mariano y sello del estado POST.
               producción, datos reales, F1-B, F2 y F3 quedan fuera.
```

## 5 · Lo que Cloud no tocó

```
QA           solo lectura: esquema de depósitos y sus constraints
producción   no se consultó
repositorio  ningún archivo salvo este documento
GitHub       ni commit, ni push, ni deploy
```
