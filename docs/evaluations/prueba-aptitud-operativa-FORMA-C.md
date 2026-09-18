# Prueba de Aptitud Operativa — Forma C

Nombre del candidato: ______________________________   Fecha: ____________

Duración total: 45 minutos. Cada sección indica su tiempo sugerido.

## Antes de empezar

- Esta prueba no evalúa conocimiento previo de ninguna plataforma ni de
  ningún procedimiento de la empresa. Todas las reglas que necesita están
  escritas en la prueba.
- Los identificadores, montos y registros son ficticios y neutros.
- Marcar como error algo que está correcto **resta puntos**. No marque por
  sospecha: marque por verificación.
- Escriba solo en la HOJA DE RESPUESTAS de cada sección.
- Puede usar lápiz y papel para sus cálculos. No use calculadora ni teléfono.

---

## Sección A — Aplicación de regla y verificación de cálculo

Tiempo sugerido: 18 minutos.

### Reglas

1. `Pago Esperado = (Créditos Ganados - Créditos Apostados) + Bono`
2. `Bono = 10% de Créditos Ganados` cuando `Créditos Ganados >= 100`.
   En cualquier otro caso `Bono = 0`.
3. Hay **error** cuando `Pago Procesado` es distinto del `Pago Esperado`.
4. La columna `Bono Aplicado` muestra lo que el sistema aplicó. **No es
   autoridad**: el valor correcto siempre se calcula con la regla 2.
5. Un `Pago Esperado` negativo es valido y no constituye un error por sí mismo.

### Códigos de causa

- `C1` — Bono omitido (correspondía bono y se aplicó 0)
- `C2` — Bono incorrecto (el monto de bono no es el 10% de Créditos Ganados)
- `C3` — Bono indebido (se aplicó bono con Créditos Ganados menores a 100)
- `C4` — Resta incorrecta entre Créditos Ganados y Créditos Apostados

### Datos

**Tabla 1**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX001 | JUG607 | 30 | 90 | 60 | 0 |
| TX002 | JUG607 | 45 | 170 | 142 | 17 |
| TX003 | JUG695 | 20 | 140 | 134 | 14 |
| TX004 | JUG607 | 70 | 250 | 205 | 25 |

**Tabla 2**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX005 | JUG752 | 25 | 160 | 145 | 10 |
| TX006 | JUG752 | 25 | 110 | 96 | 11 |
| TX007 | JUG614 | 50 | 100 | 60 | 10 |
| TX008 | JUG634 | 85 | 75 | -10 | 0 |

**Tabla 3**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX009 | JUG752 | 80 | 150 | 70 | 0 |
| TX010 | JUG614 | 100 | 200 | 120 | 20 |
| TX011 | JUG607 | 45 | 80 | 35 | 0 |
| TX012 | JUG402 | 30 | 120 | 102 | 12 |

**Tabla 4**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX013 | JUG607 | 15 | 130 | 128 | 13 |
| TX014 | JUG725 | 65 | 220 | 176 | 22 |
| TX015 | JUG752 | 100 | 65 | -35 | 0 |
| TX016 | JUG644 | 15 | 170 | 155 | 0 |

**Tabla 5**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX017 | JUG614 | 60 | 80 | 28 | 8 |
| TX018 | JUG402 | 55 | 190 | 164 | 19 |
| TX019 | JUG695 | 60 | 180 | 138 | 18 |
| TX020 | JUG607 | 50 | 200 | 170 | 20 |

**Tabla 6**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX021 | JUG402 | 70 | 85 | 15 | 0 |
| TX022 | JUG402 | 50 | 95 | 45 | 0 |
| TX023 | JUG614 | 40 | 70 | 30 | 0 |
| TX024 | JUG402 | 25 | 200 | 195 | 20 |

### HOJA DE RESPUESTAS — Sección A

Para cada transacción marque `OK` o `ERROR`. Solo si marca `ERROR`, escriba
tambien el Pago Esperado correcto y el código de causa.

| ID | OK / ERROR | Pago Esperado correcto | Causa |
| --- | --- | --- | --- |
| TX001 |  |  |  |
| TX002 |  |  |  |
| TX003 |  |  |  |
| TX004 |  |  |  |
| TX005 |  |  |  |
| TX006 |  |  |  |
| TX007 |  |  |  |
| TX008 |  |  |  |
| TX009 |  |  |  |
| TX010 |  |  |  |
| TX011 |  |  |  |
| TX012 |  |  |  |
| TX013 |  |  |  |
| TX014 |  |  |  |
| TX015 |  |  |  |
| TX016 |  |  |  |
| TX017 |  |  |  |
| TX018 |  |  |  |
| TX019 |  |  |  |
| TX020 |  |  |  |
| TX021 |  |  |  |
| TX022 |  |  |  |
| TX023 |  |  |  |
| TX024 |  |  |  |

Resumen:

- Transacciones con error: ______
- Tablas que contienen al menos un error: ______
- Tablas completamente correctas: ______

---

## Sección B — Coincidencia exacta de identificadores

Tiempo sugerido: 8 minutos.

Para cada identificador solicitado, escriba el **número de fila** del registro
donde aparece **exactamente igual**, carácter por carácter. Si no aparece de
forma exacta, escriba `NO EXISTE`. Hay identificadores muy parecidos entre sí:
una sola diferencia de carácter significa que no es el mismo.

### Registro de cuentas

| Fila | Identificador |
| ---: | --- |
| 1 | `USR-5S3D-4462` |
| 2 | `USR-4F8K-2093` |
| 3 | `USR-1I9Q-6304` |
| 4 | `USR-9C1T-3O47` |
| 5 | `USR-5S3D-4460` |
| 6 | `USR-1L9Q-6304` |
| 7 | `USR-4F8K-2O93` |
| 8 | `USR-8G4W-7T12` |
| 9 | `USR-8G4W-7712` |
| 10 | `USR-7B2M-1150` |
| 11 | `USR-3K7V-2298` |
| 12 | `USR-9C1T-3047` |
| 13 | `USR-2H6R-8821` |
| 14 | `USR-6Z0N-5583` |
| 15 | `USR-2H6R-8812` |
| 16 | `USR-6Z0N-5S83` |

### HOJA DE RESPUESTAS — Sección B

| # | Identificador solicitado | Fila o NO EXISTE |
| ---: | --- | --- |
| 1 | `USR-9C1T-3047` |  |
| 2 | `USR-6Z0N-5583` |  |
| 3 | `USR-5S3D-4461` |  |
| 4 | `USR-1L9O-6304` |  |
| 5 | `USR-3K7V-2289` |  |
| 6 | `USR-2H6R-8812` |  |
| 7 | `USR-8G4W-7T12` |  |
| 8 | `USR-4F8K-2O93` |  |

---

## Sección C — Conciliación entre dos registros

Tiempo sugerido: 9 minutos.

Los dos registros siguientes describen los movimientos del mismo dia, tomados
de dos sistemas independientes. Deberian coincidir, pero no coinciden.
Compare ambos y complete la hoja de respuestas.

### Registro del juego

| Referencia | Jugador | Tipo | Monto |
| --- | --- | --- | ---: |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1050 | `USR-5S3D-4460` | Retiro | 60 |
| MOV-1042 | `USR-2H6R-8821` | Carga | 300 |
| MOV-1071 | `USR-1L9Q-6304` | Retiro | 45 |
| MOV-1090 | `USR-3K7V-2298` | Retiro | 95 |
| MOV-1084 | `USR-6Z0N-5583` | Carga | 140 |
| MOV-1015 | `USR-4F8K-2093` | Carga | 120 |
| MOV-1036 | `USR-9C1T-3047` | Retiro | 75 |
| MOV-1029 | `USR-7B2M-1150` | Carga | 250 |

### Registro del sistema

| Referencia | Jugador | Tipo | Monto |
| --- | --- | --- | ---: |
| MOV-1057 | `USR-2H6R-8812` | Carga | 180 |
| MOV-1029 | `USR-7B2M-1150` | Carga | 520 |
| MOV-1071 | `USR-1L9Q-6304` | Retiro | 45 |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1084 | `USR-6Z0N-5583` | Carga | 145 |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1050 | `USR-5S3D-4460` | Retiro | 60 |
| MOV-1090 | `USR-3K7V-2298` | Retiro | 95 |
| MOV-1036 | `USR-9C1T-3047` | Retiro | 75 |
| MOV-1015 | `USR-4F8K-2093` | Carga | 120 |

### HOJA DE RESPUESTAS — Sección C

Escriba únicamente las referencias que correspondan. Si una categoría está
vacía, escriba `NINGUNA`. Escribir referencias de más resta puntos.

| Categoría | Referencias |
| --- | --- |
| 1. Esta en el registro del juego pero falta en el del sistema |  |
| 2. Esta en el registro del sistema pero falta en el del juego |  |
| 3. Aparece registrada dos veces |  |
| 4. Aparece en ambos registros pero con monto distinto |  |

---

## Sección D — Decisión y motivo

Tiempo sugerido: 8 minutos.

Para cada caso elija **una** acción y **un** código de motivo.

Acciones posibles:

- `APROBAR` — la operación puede procesarse tal como está.
- `RECHAZAR` — la operación no debe procesarse y la razón ya es clara.
- `DETENER Y ESCALAR` — no hay información suficiente o confiable para decidir;
  se entrega el caso a un responsable sin ejecutar nada.

Códigos de motivo:

- `M1` — La identidad o la cuenta no coincide con la solicitud
- `M2` — El movimiento ya fue procesado (duplicado)
- `M3` — Saldo insuficiente para la operación solicitada
- `M4` — Evidencia ilegible, incompleta o ausente
- `M5` — Los datos disponibles se contradicen entre sí
- `M6` — Todo coincide, sin observaciones

### Casos

**Caso 1.** La solicitud pide cargar 150 créditos a USR-4F8K-2093. La cuenta encontrada en la plataforma es USR-4F8K-2093. El comprobante adjunto es legible e indica 150. No hay movimientos previos de ese monto para ese jugador hoy.

**Caso 2.** La solicitud escrita pide cargar 200 créditos a USR-8G4W-7712. El comprobante adjunto, legible, muestra 2000. La cuenta y la identidad coinciden.

**Caso 3.** Llega una solicitud de carga de 120 créditos para USR-7B2M-1150. El historial muestra una carga de 120 créditos para ese mismo jugador registrada hace 3 minutos, con el mismo número de comprobante.

**Caso 4.** La solicitud pide cargar 90 créditos a USR-6Z0N-5583. No se adjunto ningún comprobante y el registro no muestra evidencia del pago recibido.

**Caso 5.** La solicitud pide cargar 75 créditos a USR-3K7V-2298. En la lista de hoy la misma referencia MOV-1102 aparece dos veces, ambas ya marcadas como procesadas.

**Caso 6.** La solicitud pide retirar 45 créditos de USR-1L9Q-6304. La cuenta coincide, la identidad está verificada, el saldo es de 610 créditos y no hay retiros previos hoy para ese jugador.

### HOJA DE RESPUESTAS — Sección D

| Caso | Acción | Motivo |
| ---: | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |
| 4 |  |  |
| 5 |  |  |
| 6 |  |  |

---

## Sección E — Transcripción exacta

Tiempo sugerido: 2 minutos.

Copie cada identificador exactamente como aparece. Un solo carácter distinto
invalida la respuesta.

| # | Original | Su transcripción |
| ---: | --- | --- |
| 1 | `USR-8WRW-6958` |  |
| 2 | `USR-0B7K-7701` |  |
| 3 | `USR-1JT2-2059` |  |
| 4 | `USR-D4J7-1044` |  |
| 5 | `USR-XFB0-1958` |  |

---

Fin de la prueba. Revise que no haya dejado filas en blanco.
