# Clave y rúbrica — Prueba de Aptitud Operativa, Forma E

**Documento interno. No entregar al candidato.**

Generado con: `node scripts/generate-operations-aptitude-test.mjs E`

## Sección A — clave

| ID | Apostados | Ganados | Bono correcto | Pago Esperado | Pago Procesado | Veredicto | Causa |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| TX001 (T1) | 25 | 200 | 20 | 195 | 195 | OK | — |
| TX002 (T1) | 70 | 85 | 0 | 15 | 15 | OK | — |
| TX003 (T1) | 50 | 100 | 10 | 60 | 60 | OK | — |
| TX004 (T1) | 50 | 200 | 20 | 170 | 170 | OK | — |
| TX005 (T2) | 55 | 190 | 19 | 154 | 164 | **ERROR** | C4 |
| TX006 (T2) | 100 | 65 | 0 | -35 | -35 | OK | — |
| TX007 (T2) | 30 | 120 | 12 | 102 | 102 | OK | — |
| TX008 (T2) | 15 | 130 | 13 | 128 | 128 | OK | — |
| TX009 (T3) | 85 | 75 | 0 | -10 | -10 | OK | — |
| TX010 (T3) | 45 | 170 | 17 | 142 | 142 | OK | — |
| TX011 (T3) | 70 | 250 | 25 | 205 | 205 | OK | — |
| TX012 (T3) | 60 | 180 | 18 | 138 | 138 | OK | — |
| TX013 (T4) | 20 | 140 | 14 | 134 | 134 | OK | — |
| TX014 (T4) | 15 | 170 | 17 | 172 | 155 | **ERROR** | C1 |
| TX015 (T4) | 60 | 80 | 0 | 20 | 28 | **ERROR** | C3 |
| TX016 (T4) | 100 | 200 | 20 | 120 | 120 | OK | — |
| TX017 (T5) | 30 | 90 | 0 | 60 | 60 | OK | — |
| TX018 (T5) | 45 | 80 | 0 | 35 | 35 | OK | — |
| TX019 (T5) | 80 | 150 | 15 | 85 | 70 | **ERROR** | C1 |
| TX020 (T5) | 25 | 110 | 11 | 96 | 96 | OK | — |
| TX021 (T6) | 25 | 160 | 16 | 151 | 145 | **ERROR** | C2 |
| TX022 (T6) | 50 | 95 | 0 | 45 | 45 | OK | — |
| TX023 (T6) | 65 | 220 | 22 | 177 | 176 | **ERROR** | C4 |
| TX024 (T6) | 40 | 70 | 0 | 30 | 30 | OK | — |

Resumen correcto:

- Transacciones con error: **6** de 24
- Tablas con al menos un error: **4** de 6
- Tablas completamente correctas: **2**

Causas presentes en esta forma:

- C1 — Bono omitido (correspondía bono y se aplicó 0) — 2 caso(s)
- C2 — Bono incorrecto (el monto de bono no es el 10% de Créditos Ganados) — 1 caso(s)
- C3 — Bono indebido (se aplicó bono con Créditos Ganados menores a 100) — 1 caso(s)
- C4 — Resta incorrecta entre Créditos Ganados y Créditos Apostados — 2 caso(s)

## Sección B — clave

| # | Solicitado | Respuesta correcta | Trampa |
| ---: | --- | --- | --- |
| 1 | `USR-4F8K-2O93` | 7 | `USR-4F8K-2093` (1 carácter) |
| 2 | `USR-6Z0N-5583` | 13 | `USR-6Z0N-5S83` (1 carácter) |
| 3 | `USR-3K7V-2289` | NO EXISTE | `USR-3K7V-2298` (2 carácteres) |
| 4 | `USR-2H6R-8812` | 6 | `USR-2H6R-8821` (2 carácteres) |
| 5 | `USR-1L9O-6304` | NO EXISTE | `USR-1L9Q-6304` (1 carácter), `USR-1I9Q-6304` (2 carácteres) |
| 6 | `USR-9C1T-3047` | 5 | `USR-9C1T-3O47` (1 carácter) |
| 7 | `USR-5S3D-4461` | NO EXISTE | `USR-5S3D-4460` (1 carácter), `USR-5S3D-4462` (1 carácter) |
| 8 | `USR-8G4W-7T12` | 15 | `USR-8G4W-7712` (1 carácter) |

## Sección C — clave

1. Falta en el sistema: MOV-1042
2. Falta en el juego: MOV-1057
3. Duplicada: MOV-1063
4. Monto distinto: MOV-1029, MOV-1084 (250 vs 520 y 140 vs 145)

Total: 5 discrepancias. Cualquier referencia adicional es un falso positivo.

## Sección D — clave

| Caso | Acción correcta | Motivo | Crítico |
| ---: | --- | --- | --- |
| 1 | RECHAZAR | M3 | no |
| 2 | RECHAZAR | M2 | no |
| 3 | APROBAR | M6 | no |
| 4 | DETENER Y ESCALAR | M4 | **sí** |
| 5 | APROBAR | M6 | no |
| 6 | DETENER Y ESCALAR | M5 | **sí** |

Un caso marcado como crítico es aquel en el que la evidencia no permite
actuar. Responder `APROBAR` en un caso crítico es una falla crítica.

## Sección E — clave

1. `USR-D7F7-5006`
2. `USR-XLHF-7848`
3. `USR-WWH9-2499`
4. `USR-WDLF-4068`
5. `USR-QUY6-2343`

Se acepta solo la coincidencia exacta, carácter por carácter.

## Rúbrica de puntaje

| Sección | Concepto | Puntos |
| --- | --- | ---: |
| A | Clasificación OK/ERROR correcta (1 por transacción) | 24 |
| A | Pago Esperado correcto en cada fila con error (1 c/u) | 6 |
| A | Código de causa correcto en cada fila con error (1 c/u) | 6 |
| A | **Penalización:** marcar ERROR en una fila correcta | −1 c/u |
| B | Fila correcta o NO EXISTE correcto (2 por item) | 16 |
| C | Discrepancia correcta en la categoría correcta (2 c/u) | 10 |
| C | **Penalización:** referencia listada de más | −2 c/u |
| D | Acción correcta (2) + motivo correcto (1), por caso | 18 |
| E | Transcripción exacta (1 c/u) | 5 |
| | **Total** | **85** |

El resumen al final de la Sección A no suma puntos: se usa solo para detectar
a quien encontro las filas correctas pero no supo consolidarlas.

Ningun puntaje de sección baja de 0 por penalizacion.

## Perfil de habilidades

Registre los cuatro subpuntajes por separado. El total solo no sirve para
decidir en que necesita apoyo la persona durante el entrenamiento.

| Perfil | Secciones | Máximo | Habilidad del simulador que anticipa |
| --- | --- | ---: | --- |
| Precisión de cálculo y regla | A | 36 | Aplicar políticas de bono, saldo y monto sin desviarse |
| Coincidencia exacta | B + E | 21 | Buscar y pegar el jugador exacto; no confundir cuentas parecidas |
| Conciliación cruzada | C | 10 | Leer historial del juego contra historial del backend; detectar duplicados |
| Juicio y parada segura | D | 18 | Verificar antes de mutar; detenerse con evidencia insuficiente |

## Falla crítica

Responder `APROBAR` en cualquier caso crítico de la Sección D invalida el
resultado, sin importar el puntaje total. Una persona que procesa una
operación con evidencia contradictoria o identidad que no coincide genera una
pérdida real; ningún acierto aritmético compensa eso.

## Umbrales sugeridos

**PROPUESTOS — pendientes de aprobación de Trez.** No presentar estos cortes
como decisión final hasta que se validen contra resultados reales de cohortes.

| Resultado | Condición |
| --- | --- |
| Apto | Total >= 80% y cada perfil >= 70% y 0 fallas críticas |
| Apto con observaciones | Total 65–79% y 0 fallas críticas |
| No apto | Total < 65% o cualquier falla crítica |

Un "apto con observaciones" no es un rechazo: indica en que perfil debe
reforzarse a la persona durante los primeros módulos.
