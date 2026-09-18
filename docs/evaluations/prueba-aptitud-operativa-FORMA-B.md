# Prueba de Aptitud Operativa — Forma B

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
| TX001 | JUG809 | 50 | 100 | 60 | 10 |
| TX002 | JUG698 | 60 | 180 | 138 | 18 |
| TX003 | JUG201 | 15 | 170 | 155 | 0 |
| TX004 | JUG809 | 30 | 90 | 60 | 0 |

**Tabla 2**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX005 | JUG201 | 20 | 140 | 134 | 14 |
| TX006 | JUG832 | 40 | 70 | 30 | 0 |
| TX007 | JUG788 | 80 | 150 | 70 | 0 |
| TX008 | JUG201 | 55 | 190 | 164 | 19 |

**Tabla 3**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX009 | JUG698 | 70 | 250 | 205 | 25 |
| TX010 | JUG809 | 15 | 130 | 128 | 13 |
| TX011 | JUG809 | 50 | 200 | 170 | 20 |
| TX012 | JUG788 | 45 | 80 | 35 | 0 |

**Tabla 4**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX013 | JUG267 | 65 | 220 | 176 | 22 |
| TX014 | JUG809 | 50 | 95 | 45 | 0 |
| TX015 | JUG809 | 100 | 200 | 120 | 20 |
| TX016 | JUG809 | 45 | 170 | 142 | 17 |

**Tabla 5**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX017 | JUG809 | 25 | 110 | 96 | 11 |
| TX018 | JUG201 | 25 | 200 | 195 | 20 |
| TX019 | JUG267 | 100 | 65 | -35 | 0 |
| TX020 | JUG277 | 30 | 120 | 102 | 12 |

**Tabla 6**

| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |
| --- | --- | ---: | ---: | ---: | ---: |
| TX021 | JUG832 | 25 | 160 | 145 | 10 |
| TX022 | JUG267 | 70 | 85 | 15 | 0 |
| TX023 | JUG698 | 60 | 80 | 28 | 8 |
| TX024 | JUG365 | 85 | 75 | -10 | 0 |

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
| 1 | `USR-6Z0N-5S83` |
| 2 | `USR-7B2M-1150` |
| 3 | `USR-5S3D-4460` |
| 4 | `USR-9C1T-3O47` |
| 5 | `USR-2H6R-8821` |
| 6 | `USR-8G4W-7712` |
| 7 | `USR-4F8K-2O93` |
| 8 | `USR-1L9Q-6304` |
| 9 | `USR-2H6R-8812` |
| 10 | `USR-9C1T-3047` |
| 11 | `USR-6Z0N-5583` |
| 12 | `USR-3K7V-2298` |
| 13 | `USR-4F8K-2093` |
| 14 | `USR-5S3D-4462` |
| 15 | `USR-8G4W-7T12` |
| 16 | `USR-1I9Q-6304` |

### HOJA DE RESPUESTAS — Sección B

| # | Identificador solicitado | Fila o NO EXISTE |
| ---: | --- | --- |
| 1 | `USR-3K7V-2289` |  |
| 2 | `USR-6Z0N-5583` |  |
| 3 | `USR-5S3D-4461` |  |
| 4 | `USR-8G4W-7T12` |  |
| 5 | `USR-1L9O-6304` |  |
| 6 | `USR-4F8K-2O93` |  |
| 7 | `USR-9C1T-3047` |  |
| 8 | `USR-2H6R-8812` |  |

---

## Sección C — Conciliación entre dos registros

Tiempo sugerido: 9 minutos.

Los dos registros siguientes describen los movimientos del mismo dia, tomados
de dos sistemas independientes. Deberian coincidir, pero no coinciden.
Compare ambos y complete la hoja de respuestas.

### Registro del juego

| Referencia | Jugador | Tipo | Monto |
| --- | --- | --- | ---: |
| MOV-1036 | `USR-9C1T-3047` | Retiro | 75 |
| MOV-1029 | `USR-7B2M-1150` | Carga | 250 |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1071 | `USR-1L9Q-6304` | Retiro | 45 |
| MOV-1015 | `USR-4F8K-2093` | Carga | 120 |
| MOV-1090 | `USR-3K7V-2298` | Retiro | 95 |
| MOV-1042 | `USR-2H6R-8821` | Carga | 300 |
| MOV-1050 | `USR-5S3D-4460` | Retiro | 60 |
| MOV-1084 | `USR-6Z0N-5583` | Carga | 140 |

### Registro del sistema

| Referencia | Jugador | Tipo | Monto |
| --- | --- | --- | ---: |
| MOV-1015 | `USR-4F8K-2093` | Carga | 120 |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1063 | `USR-8G4W-7712` | Carga | 200 |
| MOV-1090 | `USR-3K7V-2298` | Retiro | 95 |
| MOV-1036 | `USR-9C1T-3047` | Retiro | 75 |
| MOV-1084 | `USR-6Z0N-5583` | Carga | 145 |
| MOV-1057 | `USR-2H6R-8812` | Carga | 180 |
| MOV-1071 | `USR-1L9Q-6304` | Retiro | 45 |
| MOV-1029 | `USR-7B2M-1150` | Carga | 520 |
| MOV-1050 | `USR-5S3D-4460` | Retiro | 60 |

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

**Caso 1.** La solicitud pide retirar 45 créditos de USR-1L9Q-6304. La cuenta coincide, la identidad está verificada, el saldo es de 610 créditos y no hay retiros previos hoy para ese jugador.

**Caso 2.** La solicitud escrita pide cargar 200 créditos a USR-8G4W-7712. El comprobante adjunto, legible, muestra 2000. La cuenta y la identidad coinciden.

**Caso 3.** La solicitud pide cargar 150 créditos a USR-4F8K-2093. La cuenta encontrada en la plataforma es USR-4F8K-2093. El comprobante adjunto es legible e indica 150. No hay movimientos previos de ese monto para ese jugador hoy.

**Caso 4.** La solicitud pide cargar créditos a USR-5S3D-4460. La imagen del comprobante está cortada: se distingue el nombre del jugador pero el monto no se puede leer con certeza.

**Caso 5.** La solicitud pide retirar 500 créditos de USR-9C1T-3047. El saldo visible en la plataforma para esa cuenta es de 320 créditos. La identidad está verificada.

**Caso 6.** Llega una solicitud de carga de 120 créditos para USR-7B2M-1150. El historial muestra una carga de 120 créditos para ese mismo jugador registrada hace 3 minutos, con el mismo número de comprobante.

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
| 1 | `USR-XLAD-8838` |  |
| 2 | `USR-Q54T-2040` |  |
| 3 | `USR-VMGQ-3907` |  |
| 4 | `USR-PBHD-4591` |  |
| 5 | `USR-D7SP-0196` |  |

---

Fin de la prueba. Revise que no haya dejado filas en blanco.
