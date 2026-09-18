#!/usr/bin/env node
// Genera la Prueba de Aptitud Operativa (cuadernillo del candidato + clave del
// evaluador) de forma determinista a partir de una letra de forma.
//
//   node scripts/generate-operations-aptitude-test.mjs A
//
// El contenido evaluado es NEUTRO a propósito: no contiene fórmulas de
// identificador, iniciales de juego ni políticas de contraseña de Trez. Mide
// habilidades, no conocimiento previo del negocio.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'evaluations');
const FORM = (process.argv[2] || 'A').toUpperCase();

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(hashSeed(`trez-aptitud-operativa-${FORM}`));

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pad(value, width) {
  return String(value).padStart(width, '0');
}

// ---------------------------------------------------------------------------
// Sección A — aplicación de regla y verificación de cálculo
// ---------------------------------------------------------------------------

const BONO_UMBRAL = 100;
const BONO_TASA = 0.1;

const bonoRegla = (ganados) => (ganados >= BONO_UMBRAL ? ganados * BONO_TASA : 0);
const pagoEsperado = (apostados, ganados) => ganados - apostados + bonoRegla(ganados);

// causa: OK | C1 bono omitido | C2 bono incorrecto | C3 bono indebido
//        | C4 resta incorrecta (param = desviación firmada)
const BANCO_SECCION_A = [
  { apostados: 50, ganados: 200, causa: 'OK' },
  { apostados: 60, ganados: 180, causa: 'OK' },
  { apostados: 25, ganados: 200, causa: 'OK' },
  { apostados: 70, ganados: 250, causa: 'OK' },
  { apostados: 15, ganados: 130, causa: 'OK' },
  { apostados: 45, ganados: 170, causa: 'OK' },
  { apostados: 100, ganados: 200, causa: 'OK' },
  { apostados: 55, ganados: 190, causa: 'C4', param: 10 },
  { apostados: 20, ganados: 140, causa: 'OK' },
  { apostados: 65, ganados: 220, causa: 'C4', param: -1 },
  { apostados: 25, ganados: 160, causa: 'C2', param: 10 },
  { apostados: 30, ganados: 120, causa: 'OK' },
  { apostados: 80, ganados: 150, causa: 'C1' },
  { apostados: 25, ganados: 110, causa: 'OK' },
  { apostados: 50, ganados: 100, causa: 'OK' },
  { apostados: 15, ganados: 170, causa: 'C1' },
  { apostados: 30, ganados: 90, causa: 'OK' },
  { apostados: 40, ganados: 70, causa: 'OK' },
  { apostados: 50, ganados: 95, causa: 'OK' },
  { apostados: 70, ganados: 85, causa: 'OK' },
  { apostados: 45, ganados: 80, causa: 'OK' },
  { apostados: 85, ganados: 75, causa: 'OK' },
  { apostados: 100, ganados: 65, causa: 'OK' },
  { apostados: 60, ganados: 80, causa: 'C3', param: 8 },
];

const CAUSA_ETIQUETA = {
  C1: 'C1 — Bono omitido (correspondía bono y se aplicó 0)',
  C2: 'C2 — Bono incorrecto (el monto de bono no es el 10% de Créditos Ganados)',
  C3: 'C3 — Bono indebido (se aplicó bono con Créditos Ganados menores a 100)',
  C4: 'C4 — Resta incorrecta entre Créditos Ganados y Créditos Apostados',
};

function materializar(item) {
  const { apostados, ganados, causa, param = 0 } = item;
  const bono = bonoRegla(ganados);
  const esperado = pagoEsperado(apostados, ganados);
  let procesado;
  let bonoAplicado;

  switch (causa) {
    case 'OK':
      procesado = esperado;
      bonoAplicado = bono;
      break;
    case 'C1':
      if (bono <= 0) throw new Error('C1 requiere una fila con bono aplicable');
      bonoAplicado = 0;
      procesado = ganados - apostados;
      break;
    case 'C2':
      if (bono <= 0) throw new Error('C2 requiere una fila con bono aplicable');
      if (param === bono) throw new Error('C2 requiere un bono distinto al correcto');
      bonoAplicado = param;
      procesado = ganados - apostados + param;
      break;
    case 'C3':
      if (ganados >= BONO_UMBRAL) throw new Error('C3 requiere Créditos Ganados < 100');
      if (param <= 0) throw new Error('C3 requiere un bono indebido positivo');
      bonoAplicado = param;
      procesado = ganados - apostados + param;
      break;
    case 'C4':
      if (param === 0) throw new Error('C4 requiere una desviación distinta de cero');
      bonoAplicado = bono;
      procesado = esperado + param;
      break;
    default:
      throw new Error(`causa desconocida: ${causa}`);
  }

  for (const [nombre, valor] of Object.entries({ bono, esperado, procesado, bonoAplicado })) {
    if (!Number.isInteger(valor)) {
      throw new Error(`valor no entero en ${nombre} para ${apostados}/${ganados}: ${valor}`);
    }
  }
  const esError = causa !== 'OK';
  if (esError === (procesado === esperado)) {
    throw new Error(`la causa ${causa} no coincide con la discrepancia de ${apostados}/${ganados}`);
  }

  return { apostados, ganados, causa, bono, esperado, procesado, bonoAplicado, esError };
}

function construirSeccionA() {
  const items = BANCO_SECCION_A.map(materializar);
  const errores = shuffle(items.filter((item) => item.esError));
  const correctasBajas = shuffle(items.filter((item) => !item.esError && item.ganados < BONO_UMBRAL));
  const correctasAltas = shuffle(items.filter((item) => !item.esError && item.ganados >= BONO_UMBRAL));
  const plan = shuffle([2, 2, 1, 1, 0, 0]);

  const jugadores = shuffle(
    Array.from({ length: 8 }, (_, index) => `JUG${pad(100 + Math.floor(rng() * 800) + index, 3)}`),
  );

  const tablas = [];
  let contador = 0;

  for (const cantidadErrores of plan) {
    const filas = [];
    for (let i = 0; i < cantidadErrores; i += 1) filas.push(errores.pop());
    if (!filas.some((fila) => fila.ganados < BONO_UMBRAL) && correctasBajas.length > 0) {
      filas.push(correctasBajas.pop());
    }
    while (filas.length < 4) {
      const fuente = correctasAltas.length > 0 ? correctasAltas : correctasBajas;
      filas.push(fuente.pop());
    }
    tablas.push(
      shuffle(filas).map((fila) => {
        contador += 1;
        return {
          ...fila,
          tx: `TX${pad(contador, 3)}`,
          jugador: jugadores[Math.floor(rng() * jugadores.length)],
        };
      }),
    );
  }

  if (errores.length > 0) throw new Error('quedaron errores sin asignar');
  return tablas;
}

// ---------------------------------------------------------------------------
// Sección B — coincidencia exacta de identificadores
// ---------------------------------------------------------------------------

const REGISTRO_B = [
  'USR-4F8K-2093',
  'USR-7B2M-1150',
  'USR-9C1T-3047',
  'USR-2H6R-8821',
  'USR-5S3D-4460',
  'USR-4F8K-2O93',
  'USR-8G4W-7712',
  'USR-2H6R-8812',
  'USR-1L9Q-6304',
  'USR-9C1T-3O47',
  'USR-6Z0N-5583',
  'USR-3K7V-2298',
  'USR-5S3D-4462',
  'USR-8G4W-7T12',
  'USR-1I9Q-6304',
  'USR-6Z0N-5S83',
];

const CONSULTAS_B = [
  'USR-9C1T-3047',
  'USR-2H6R-8812',
  'USR-4F8K-2O93',
  'USR-6Z0N-5583',
  'USR-8G4W-7T12',
  'USR-5S3D-4461',
  'USR-1L9O-6304',
  'USR-3K7V-2289',
];

function construirSeccionB() {
  if (new Set(REGISTRO_B).size !== REGISTRO_B.length) {
    throw new Error('el registro de la Sección B tiene identificadores repetidos');
  }
  const registro = shuffle(REGISTRO_B);
  const consultas = shuffle(CONSULTAS_B).map((consulta) => {
    const indice = registro.indexOf(consulta);
    return { consulta, respuesta: indice === -1 ? 'NO EXISTE' : String(indice + 1) };
  });
  const presentes = consultas.filter((item) => item.respuesta !== 'NO EXISTE').length;
  if (presentes !== 5) throw new Error('la Sección B debe tener 5 coincidencias reales');
  return { registro, consultas };
}

// ---------------------------------------------------------------------------
// Sección C — conciliación entre dos registros independientes
// ---------------------------------------------------------------------------

const REGISTRO_JUEGO_C = [
  { ref: 'MOV-1015', jugador: 'USR-4F8K-2093', tipo: 'Carga', monto: 120 },
  { ref: 'MOV-1029', jugador: 'USR-7B2M-1150', tipo: 'Carga', monto: 250 },
  { ref: 'MOV-1036', jugador: 'USR-9C1T-3047', tipo: 'Retiro', monto: 75 },
  { ref: 'MOV-1042', jugador: 'USR-2H6R-8821', tipo: 'Carga', monto: 300 },
  { ref: 'MOV-1050', jugador: 'USR-5S3D-4460', tipo: 'Retiro', monto: 60 },
  { ref: 'MOV-1063', jugador: 'USR-8G4W-7712', tipo: 'Carga', monto: 200 },
  { ref: 'MOV-1071', jugador: 'USR-1L9Q-6304', tipo: 'Retiro', monto: 45 },
  { ref: 'MOV-1084', jugador: 'USR-6Z0N-5583', tipo: 'Carga', monto: 140 },
  { ref: 'MOV-1090', jugador: 'USR-3K7V-2298', tipo: 'Retiro', monto: 95 },
];

const REGISTRO_SISTEMA_C = [
  { ref: 'MOV-1015', jugador: 'USR-4F8K-2093', tipo: 'Carga', monto: 120 },
  { ref: 'MOV-1029', jugador: 'USR-7B2M-1150', tipo: 'Carga', monto: 520 },
  { ref: 'MOV-1036', jugador: 'USR-9C1T-3047', tipo: 'Retiro', monto: 75 },
  { ref: 'MOV-1050', jugador: 'USR-5S3D-4460', tipo: 'Retiro', monto: 60 },
  { ref: 'MOV-1057', jugador: 'USR-2H6R-8812', tipo: 'Carga', monto: 180 },
  { ref: 'MOV-1063', jugador: 'USR-8G4W-7712', tipo: 'Carga', monto: 200 },
  { ref: 'MOV-1063', jugador: 'USR-8G4W-7712', tipo: 'Carga', monto: 200 },
  { ref: 'MOV-1071', jugador: 'USR-1L9Q-6304', tipo: 'Retiro', monto: 45 },
  { ref: 'MOV-1084', jugador: 'USR-6Z0N-5583', tipo: 'Carga', monto: 145 },
  { ref: 'MOV-1090', jugador: 'USR-3K7V-2298', tipo: 'Retiro', monto: 95 },
];

const CLAVE_C = {
  faltaEnSistema: ['MOV-1042'],
  faltaEnJuego: ['MOV-1057'],
  duplicado: ['MOV-1063'],
  montoDistinto: ['MOV-1029', 'MOV-1084'],
};

function construirSeccionC() {
  const juego = shuffle(REGISTRO_JUEGO_C);
  const sistema = shuffle(REGISTRO_SISTEMA_C);

  const refsJuego = REGISTRO_JUEGO_C.map((fila) => fila.ref);
  const refsSistema = REGISTRO_SISTEMA_C.map((fila) => fila.ref);
  const soloJuego = refsJuego.filter((ref) => !refsSistema.includes(ref));
  const soloSistema = refsSistema.filter((ref) => !refsJuego.includes(ref));
  const duplicados = [...new Set(refsSistema.filter((ref, i) => refsSistema.indexOf(ref) !== i))];
  const montos = REGISTRO_JUEGO_C.filter((fila) => {
    const par = REGISTRO_SISTEMA_C.find((otra) => otra.ref === fila.ref);
    return par && par.monto !== fila.monto;
  }).map((fila) => fila.ref);

  const iguales = (a, b) => a.slice().sort().join() === b.slice().sort().join();
  if (
    !iguales(soloJuego, CLAVE_C.faltaEnSistema) ||
    !iguales(soloSistema, CLAVE_C.faltaEnJuego) ||
    !iguales(duplicados, CLAVE_C.duplicado) ||
    !iguales(montos, CLAVE_C.montoDistinto)
  ) {
    throw new Error('la clave declarada de la Sección C no coincide con los datos');
  }

  return { juego, sistema, clave: CLAVE_C };
}

// ---------------------------------------------------------------------------
// Sección D — decisión y motivo
// ---------------------------------------------------------------------------

const MOTIVOS_D = {
  M1: 'M1 — La identidad o la cuenta no coincide con la solicitud',
  M2: 'M2 — El movimiento ya fue procesado (duplicado)',
  M3: 'M3 — Saldo insuficiente para la operación solicitada',
  M4: 'M4 — Evidencia ilegible, incompleta o ausente',
  M5: 'M5 — Los datos disponibles se contradicen entre sí',
  M6: 'M6 — Todo coincide, sin observaciones',
};

const BANCO_D = [
  {
    texto:
      'La solicitud pide cargar 150 créditos a USR-4F8K-2093. La cuenta encontrada en la plataforma es USR-4F8K-2093. El comprobante adjunto es legible e indica 150. No hay movimientos previos de ese monto para ese jugador hoy.',
    acción: 'APROBAR',
    motivo: 'M6',
    crítica: false,
  },
  {
    texto:
      'La solicitud pide cargar 200 créditos a USR-4F8K-2093. La única cuenta encontrada en la plataforma es USR-4F8K-2O93. El comprobante es legible e indica 200.',
    acción: 'DETENER Y ESCALAR',
    motivo: 'M1',
    crítica: true,
  },
  {
    texto:
      'Llega una solicitud de carga de 120 créditos para USR-7B2M-1150. El historial muestra una carga de 120 créditos para ese mismo jugador registrada hace 3 minutos, con el mismo número de comprobante.',
    acción: 'RECHAZAR',
    motivo: 'M2',
    crítica: false,
  },
  {
    texto:
      'La solicitud pide retirar 500 créditos de USR-9C1T-3047. El saldo visible en la plataforma para esa cuenta es de 320 créditos. La identidad está verificada.',
    acción: 'RECHAZAR',
    motivo: 'M3',
    crítica: false,
  },
  {
    texto:
      'La solicitud pide cargar créditos a USR-5S3D-4460. La imagen del comprobante está cortada: se distingue el nombre del jugador pero el monto no se puede leer con certeza.',
    acción: 'DETENER Y ESCALAR',
    motivo: 'M4',
    crítica: true,
  },
  {
    texto:
      'La solicitud escrita pide cargar 200 créditos a USR-8G4W-7712. El comprobante adjunto, legible, muestra 2000. La cuenta y la identidad coinciden.',
    acción: 'DETENER Y ESCALAR',
    motivo: 'M5',
    crítica: true,
  },
  {
    texto:
      'La solicitud pide retirar 45 créditos de USR-1L9Q-6304. La cuenta coincide, la identidad está verificada, el saldo es de 610 créditos y no hay retiros previos hoy para ese jugador.',
    acción: 'APROBAR',
    motivo: 'M6',
    crítica: false,
  },
  {
    texto:
      'La solicitud pide cargar 90 créditos a USR-6Z0N-5583. No se adjunto ningún comprobante y el registro no muestra evidencia del pago recibido.',
    acción: 'DETENER Y ESCALAR',
    motivo: 'M4',
    crítica: true,
  },
  {
    texto:
      'La solicitud pide cargar 75 créditos a USR-3K7V-2298. En la lista de hoy la misma referencia MOV-1102 aparece dos veces, ambas ya marcadas como procesadas.',
    acción: 'RECHAZAR',
    motivo: 'M2',
    crítica: false,
  },
];

function construirSeccionD() {
  const aprobar = shuffle(BANCO_D.filter((caso) => caso.acción === 'APROBAR'));
  const críticas = shuffle(BANCO_D.filter((caso) => caso.crítica));
  const resto = shuffle(BANCO_D.filter((caso) => !caso.crítica && caso.acción !== 'APROBAR'));

  // Composicion fija 2 aprobar / 2 rechazar / 2 detener. Ninguna respuesta
  // uniforme ("todo aprobado", "todo detenido") acierta mas de dos acciones.
  const elegidos = [
    aprobar.pop(),
    aprobar.pop(),
    resto.pop(),
    resto.pop(),
    críticas.pop(),
    críticas.pop(),
  ];
  if (elegidos.some((caso) => caso === undefined)) {
    throw new Error('el banco de la Sección D no alcanza para la composicion 2/2/2');
  }

  const casos = shuffle(elegidos);
  const cuenta = (acción) => casos.filter((caso) => caso.acción === acción).length;
  if (casos.filter((caso) => caso.crítica).length !== 2) {
    throw new Error('la Sección D debe tener exactamente dos casos críticos');
  }
  if (cuenta('APROBAR') !== 2 || cuenta('RECHAZAR') !== 2) {
    throw new Error('la Sección D debe quedar balanceada en 2/2/2');
  }
  return casos.map((caso, index) => ({ ...caso, número: index + 1 }));
}

// ---------------------------------------------------------------------------
// Sección E — transcripción exacta
// ---------------------------------------------------------------------------

const ALFABETO_E = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

function construirSeccionE() {
  return Array.from({ length: 5 }, () => {
    const bloque = Array.from(
      { length: 4 },
      () => ALFABETO_E[Math.floor(rng() * ALFABETO_E.length)],
    ).join('');
    const cola = pad(Math.floor(rng() * 10000), 4);
    return `USR-${bloque}-${cola}`;
  });
}

// ---------------------------------------------------------------------------
// Puntaje
// ---------------------------------------------------------------------------

const PUNTAJE = {
  A: { clasificacion: 24, valor: 6, causa: 6, total: 36 },
  B: { total: 16 },
  C: { total: 10 },
  D: { total: 18 },
  E: { total: 5 },
};
const PUNTAJE_TOTAL = PUNTAJE.A.total + PUNTAJE.B.total + PUNTAJE.C.total + PUNTAJE.D.total + PUNTAJE.E.total;

// ---------------------------------------------------------------------------
// Cuadernillo del candidato
// ---------------------------------------------------------------------------

function renderCuadernillo({ tablasA, seccionB, seccionC, casosD, idsE }) {
  const l = [];
  l.push(`# Prueba de Aptitud Operativa — Forma ${FORM}`);
  l.push('');
  l.push('Nombre del candidato: ______________________________   Fecha: ____________');
  l.push('');
  l.push('Duración total: 45 minutos. Cada sección indica su tiempo sugerido.');
  l.push('');
  l.push('## Antes de empezar');
  l.push('');
  l.push('- Esta prueba no evalúa conocimiento previo de ninguna plataforma ni de');
  l.push('  ningún procedimiento de la empresa. Todas las reglas que necesita están');
  l.push('  escritas en la prueba.');
  l.push('- Los identificadores, montos y registros son ficticios y neutros.');
  l.push('- Marcar como error algo que está correcto **resta puntos**. No marque por');
  l.push('  sospecha: marque por verificación.');
  l.push('- Escriba solo en la HOJA DE RESPUESTAS de cada sección.');
  l.push('- Puede usar lápiz y papel para sus cálculos. No use calculadora ni teléfono.');
  l.push('');
  l.push('---');
  l.push('');

  // ---- Sección A -----------------------------------------------------------
  l.push('## Sección A — Aplicación de regla y verificación de cálculo');
  l.push('');
  l.push('Tiempo sugerido: 18 minutos.');
  l.push('');
  l.push('### Reglas');
  l.push('');
  l.push('1. `Pago Esperado = (Créditos Ganados - Créditos Apostados) + Bono`');
  l.push('2. `Bono = 10% de Créditos Ganados` cuando `Créditos Ganados >= 100`.');
  l.push('   En cualquier otro caso `Bono = 0`.');
  l.push('3. Hay **error** cuando `Pago Procesado` es distinto del `Pago Esperado`.');
  l.push('4. La columna `Bono Aplicado` muestra lo que el sistema aplicó. **No es');
  l.push('   autoridad**: el valor correcto siempre se calcula con la regla 2.');
  l.push('5. Un `Pago Esperado` negativo es valido y no constituye un error por sí mismo.');
  l.push('');
  l.push('### Códigos de causa');
  l.push('');
  for (const [código, etiqueta] of Object.entries(CAUSA_ETIQUETA)) {
    l.push(`- \`${código}\` — ${etiqueta.split(' — ')[1]}`);
  }
  l.push('');
  l.push('### Datos');
  l.push('');
  tablasA.forEach((filas, indice) => {
    l.push(`**Tabla ${indice + 1}**`);
    l.push('');
    l.push('| ID Transacción | ID Jugador | Créditos Apostados | Créditos Ganados | Pago Procesado | Bono Aplicado |');
    l.push('| --- | --- | ---: | ---: | ---: | ---: |');
    for (const fila of filas) {
      l.push(`| ${fila.tx} | ${fila.jugador} | ${fila.apostados} | ${fila.ganados} | ${fila.procesado} | ${fila.bonoAplicado} |`);
    }
    l.push('');
  });
  l.push('### HOJA DE RESPUESTAS — Sección A');
  l.push('');
  l.push('Para cada transacción marque `OK` o `ERROR`. Solo si marca `ERROR`, escriba');
  l.push('tambien el Pago Esperado correcto y el código de causa.');
  l.push('');
  l.push('| ID | OK / ERROR | Pago Esperado correcto | Causa |');
  l.push('| --- | --- | --- | --- |');
  for (const filas of tablasA) {
    for (const fila of filas) l.push(`| ${fila.tx} |  |  |  |`);
  }
  l.push('');
  l.push('Resumen:');
  l.push('');
  l.push('- Transacciones con error: ______');
  l.push('- Tablas que contienen al menos un error: ______');
  l.push('- Tablas completamente correctas: ______');
  l.push('');
  l.push('---');
  l.push('');

  // ---- Sección B -----------------------------------------------------------
  l.push('## Sección B — Coincidencia exacta de identificadores');
  l.push('');
  l.push('Tiempo sugerido: 8 minutos.');
  l.push('');
  l.push('Para cada identificador solicitado, escriba el **número de fila** del registro');
  l.push('donde aparece **exactamente igual**, carácter por carácter. Si no aparece de');
  l.push('forma exacta, escriba `NO EXISTE`. Hay identificadores muy parecidos entre sí:');
  l.push('una sola diferencia de carácter significa que no es el mismo.');
  l.push('');
  l.push('### Registro de cuentas');
  l.push('');
  l.push('| Fila | Identificador |');
  l.push('| ---: | --- |');
  seccionB.registro.forEach((id, indice) => l.push(`| ${indice + 1} | \`${id}\` |`));
  l.push('');
  l.push('### HOJA DE RESPUESTAS — Sección B');
  l.push('');
  l.push('| # | Identificador solicitado | Fila o NO EXISTE |');
  l.push('| ---: | --- | --- |');
  seccionB.consultas.forEach((item, indice) => l.push(`| ${indice + 1} | \`${item.consulta}\` |  |`));
  l.push('');
  l.push('---');
  l.push('');

  // ---- Sección C -----------------------------------------------------------
  l.push('## Sección C — Conciliación entre dos registros');
  l.push('');
  l.push('Tiempo sugerido: 9 minutos.');
  l.push('');
  l.push('Los dos registros siguientes describen los movimientos del mismo dia, tomados');
  l.push('de dos sistemas independientes. Deberian coincidir, pero no coinciden.');
  l.push('Compare ambos y complete la hoja de respuestas.');
  l.push('');
  l.push('### Registro del juego');
  l.push('');
  l.push('| Referencia | Jugador | Tipo | Monto |');
  l.push('| --- | --- | --- | ---: |');
  for (const fila of seccionC.juego) {
    l.push(`| ${fila.ref} | \`${fila.jugador}\` | ${fila.tipo} | ${fila.monto} |`);
  }
  l.push('');
  l.push('### Registro del sistema');
  l.push('');
  l.push('| Referencia | Jugador | Tipo | Monto |');
  l.push('| --- | --- | --- | ---: |');
  for (const fila of seccionC.sistema) {
    l.push(`| ${fila.ref} | \`${fila.jugador}\` | ${fila.tipo} | ${fila.monto} |`);
  }
  l.push('');
  l.push('### HOJA DE RESPUESTAS — Sección C');
  l.push('');
  l.push('Escriba únicamente las referencias que correspondan. Si una categoría está');
  l.push('vacía, escriba `NINGUNA`. Escribir referencias de más resta puntos.');
  l.push('');
  l.push('| Categoría | Referencias |');
  l.push('| --- | --- |');
  l.push('| 1. Esta en el registro del juego pero falta en el del sistema |  |');
  l.push('| 2. Esta en el registro del sistema pero falta en el del juego |  |');
  l.push('| 3. Aparece registrada dos veces |  |');
  l.push('| 4. Aparece en ambos registros pero con monto distinto |  |');
  l.push('');
  l.push('---');
  l.push('');

  // ---- Sección D -----------------------------------------------------------
  l.push('## Sección D — Decisión y motivo');
  l.push('');
  l.push('Tiempo sugerido: 8 minutos.');
  l.push('');
  l.push('Para cada caso elija **una** acción y **un** código de motivo.');
  l.push('');
  l.push('Acciones posibles:');
  l.push('');
  l.push('- `APROBAR` — la operación puede procesarse tal como está.');
  l.push('- `RECHAZAR` — la operación no debe procesarse y la razón ya es clara.');
  l.push('- `DETENER Y ESCALAR` — no hay información suficiente o confiable para decidir;');
  l.push('  se entrega el caso a un responsable sin ejecutar nada.');
  l.push('');
  l.push('Códigos de motivo:');
  l.push('');
  for (const etiqueta of Object.values(MOTIVOS_D)) l.push(`- \`${etiqueta.split(' — ')[0]}\` — ${etiqueta.split(' — ')[1]}`);
  l.push('');
  l.push('### Casos');
  l.push('');
  for (const caso of casosD) {
    l.push(`**Caso ${caso.número}.** ${caso.texto}`);
    l.push('');
  }
  l.push('### HOJA DE RESPUESTAS — Sección D');
  l.push('');
  l.push('| Caso | Acción | Motivo |');
  l.push('| ---: | --- | --- |');
  for (const caso of casosD) l.push(`| ${caso.número} |  |  |`);
  l.push('');
  l.push('---');
  l.push('');

  // ---- Sección E -----------------------------------------------------------
  l.push('## Sección E — Transcripción exacta');
  l.push('');
  l.push('Tiempo sugerido: 2 minutos.');
  l.push('');
  l.push('Copie cada identificador exactamente como aparece. Un solo carácter distinto');
  l.push('invalida la respuesta.');
  l.push('');
  l.push('| # | Original | Su transcripción |');
  l.push('| ---: | --- | --- |');
  idsE.forEach((id, indice) => l.push(`| ${indice + 1} | \`${id}\` |  |`));
  l.push('');
  l.push('---');
  l.push('');
  l.push('Fin de la prueba. Revise que no haya dejado filas en blanco.');
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// Clave y rúbrica del evaluador
// ---------------------------------------------------------------------------

function renderClave({ tablasA, seccionB, seccionC, casosD, idsE }) {
  const l = [];
  const todasA = tablasA.flat();
  const erroresA = todasA.filter((fila) => fila.esError);
  const tablasConError = tablasA.filter((filas) => filas.some((fila) => fila.esError)).length;

  l.push(`# Clave y rúbrica — Prueba de Aptitud Operativa, Forma ${FORM}`);
  l.push('');
  l.push('**Documento interno. No entregar al candidato.**');
  l.push('');
  l.push(`Generado con: \`node scripts/generate-operations-aptitude-test.mjs ${FORM}\``);
  l.push('');
  l.push('## Sección A — clave');
  l.push('');
  l.push('| ID | Apostados | Ganados | Bono correcto | Pago Esperado | Pago Procesado | Veredicto | Causa |');
  l.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  tablasA.forEach((filas, indice) => {
    for (const fila of filas) {
      l.push(
        `| ${fila.tx} (T${indice + 1}) | ${fila.apostados} | ${fila.ganados} | ${fila.bono} | ` +
          `${fila.esperado} | ${fila.procesado} | ${fila.esError ? '**ERROR**' : 'OK'} | ${fila.esError ? fila.causa : '—'} |`,
      );
    }
  });
  l.push('');
  l.push('Resumen correcto:');
  l.push('');
  l.push(`- Transacciones con error: **${erroresA.length}** de ${todasA.length}`);
  l.push(`- Tablas con al menos un error: **${tablasConError}** de ${tablasA.length}`);
  l.push(`- Tablas completamente correctas: **${tablasA.length - tablasConError}**`);
  l.push('');
  l.push('Causas presentes en esta forma:');
  l.push('');
  for (const [código, etiqueta] of Object.entries(CAUSA_ETIQUETA)) {
    const cuantas = erroresA.filter((fila) => fila.causa === código).length;
    if (cuantas > 0) l.push(`- ${etiqueta} — ${cuantas} caso(s)`);
  }
  l.push('');
  l.push('## Sección B — clave');
  l.push('');
  l.push('| # | Solicitado | Respuesta correcta | Trampa |');
  l.push('| ---: | --- | --- | --- |');
  seccionB.consultas.forEach((item, indice) => {
    const gemelos = seccionB.registro
      .filter((id) => id !== item.consulta && id.length === item.consulta.length)
      .map((id) => ({ id, diferencias: [...id].filter((ch, i) => ch !== item.consulta[i]).length }))
      .filter((candidato) => candidato.diferencias > 0 && candidato.diferencias <= 2)
      .sort((a, b) => a.diferencias - b.diferencias);
    const trampa = gemelos.length
      ? gemelos
          .map((candidato) => `\`${candidato.id}\` (${candidato.diferencias} carácter${candidato.diferencias > 1 ? 'es' : ''})`)
          .join(', ')
      : '—';
    l.push(`| ${indice + 1} | \`${item.consulta}\` | ${item.respuesta} | ${trampa} |`);
  });
  l.push('');
  l.push('## Sección C — clave');
  l.push('');
  l.push(`1. Falta en el sistema: ${seccionC.clave.faltaEnSistema.join(', ')}`);
  l.push(`2. Falta en el juego: ${seccionC.clave.faltaEnJuego.join(', ')}`);
  l.push(`3. Duplicada: ${seccionC.clave.duplicado.join(', ')}`);
  l.push(`4. Monto distinto: ${seccionC.clave.montoDistinto.join(', ')} (250 vs 520 y 140 vs 145)`);
  l.push('');
  l.push('Total: 5 discrepancias. Cualquier referencia adicional es un falso positivo.');
  l.push('');
  l.push('## Sección D — clave');
  l.push('');
  l.push('| Caso | Acción correcta | Motivo | Crítico |');
  l.push('| ---: | --- | --- | --- |');
  for (const caso of casosD) {
    l.push(`| ${caso.número} | ${caso.acción} | ${caso.motivo} | ${caso.crítica ? '**sí**' : 'no'} |`);
  }
  l.push('');
  l.push('Un caso marcado como crítico es aquel en el que la evidencia no permite');
  l.push('actuar. Responder `APROBAR` en un caso crítico es una falla crítica.');
  l.push('');
  l.push('## Sección E — clave');
  l.push('');
  idsE.forEach((id, indice) => l.push(`${indice + 1}. \`${id}\``));
  l.push('');
  l.push('Se acepta solo la coincidencia exacta, carácter por carácter.');
  l.push('');
  l.push('## Rúbrica de puntaje');
  l.push('');
  l.push('| Sección | Concepto | Puntos |');
  l.push('| --- | --- | ---: |');
  l.push(`| A | Clasificación OK/ERROR correcta (1 por transacción) | ${PUNTAJE.A.clasificacion} |`);
  l.push(`| A | Pago Esperado correcto en cada fila con error (1 c/u) | ${PUNTAJE.A.valor} |`);
  l.push(`| A | Código de causa correcto en cada fila con error (1 c/u) | ${PUNTAJE.A.causa} |`);
  l.push('| A | **Penalización:** marcar ERROR en una fila correcta | −1 c/u |');
  l.push(`| B | Fila correcta o NO EXISTE correcto (2 por item) | ${PUNTAJE.B.total} |`);
  l.push(`| C | Discrepancia correcta en la categoría correcta (2 c/u) | ${PUNTAJE.C.total} |`);
  l.push('| C | **Penalización:** referencia listada de más | −2 c/u |');
  l.push(`| D | Acción correcta (2) + motivo correcto (1), por caso | ${PUNTAJE.D.total} |`);
  l.push(`| E | Transcripción exacta (1 c/u) | ${PUNTAJE.E.total} |`);
  l.push(`| | **Total** | **${PUNTAJE_TOTAL}** |`);
  l.push('');
  l.push('El resumen al final de la Sección A no suma puntos: se usa solo para detectar');
  l.push('a quien encontro las filas correctas pero no supo consolidarlas.');
  l.push('');
  l.push('Ningun puntaje de sección baja de 0 por penalizacion.');
  l.push('');
  l.push('## Perfil de habilidades');
  l.push('');
  l.push('Registre los cuatro subpuntajes por separado. El total solo no sirve para');
  l.push('decidir en que necesita apoyo la persona durante el entrenamiento.');
  l.push('');
  l.push('| Perfil | Secciones | Máximo | Habilidad del simulador que anticipa |');
  l.push('| --- | --- | ---: | --- |');
  l.push(`| Precisión de cálculo y regla | A | ${PUNTAJE.A.total} | Aplicar políticas de bono, saldo y monto sin desviarse |`);
  l.push(`| Coincidencia exacta | B + E | ${PUNTAJE.B.total + PUNTAJE.E.total} | Buscar y pegar el jugador exacto; no confundir cuentas parecidas |`);
  l.push(`| Conciliación cruzada | C | ${PUNTAJE.C.total} | Leer historial del juego contra historial del backend; detectar duplicados |`);
  l.push(`| Juicio y parada segura | D | ${PUNTAJE.D.total} | Verificar antes de mutar; detenerse con evidencia insuficiente |`);
  l.push('');
  l.push('## Falla crítica');
  l.push('');
  l.push('Responder `APROBAR` en cualquier caso crítico de la Sección D invalida el');
  l.push('resultado, sin importar el puntaje total. Una persona que procesa una');
  l.push('operación con evidencia contradictoria o identidad que no coincide genera una');
  l.push('pérdida real; ningún acierto aritmético compensa eso.');
  l.push('');
  l.push('## Umbrales sugeridos');
  l.push('');
  l.push('**PROPUESTOS — pendientes de aprobación de Trez.** No presentar estos cortes');
  l.push('como decisión final hasta que se validen contra resultados reales de cohortes.');
  l.push('');
  l.push('| Resultado | Condición |');
  l.push('| --- | --- |');
  l.push('| Apto | Total >= 80% y cada perfil >= 70% y 0 fallas críticas |');
  l.push('| Apto con observaciones | Total 65–79% y 0 fallas críticas |');
  l.push('| No apto | Total < 65% o cualquier falla crítica |');
  l.push('');
  l.push('Un "apto con observaciones" no es un rechazo: indica en que perfil debe');
  l.push('reforzarse a la persona durante los primeros módulos.');
  l.push('');
  return l.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const prueba = {
  tablasA: construirSeccionA(),
  seccionB: construirSeccionB(),
  seccionC: construirSeccionC(),
  casosD: construirSeccionD(),
  idsE: construirSeccionE(),
};

mkdirSync(OUT_DIR, { recursive: true });
const rutaCuadernillo = join(OUT_DIR, `prueba-aptitud-operativa-FORMA-${FORM}.md`);
const rutaClave = join(OUT_DIR, `prueba-aptitud-operativa-FORMA-${FORM}-CLAVE.md`);

writeFileSync(rutaCuadernillo, renderCuadernillo(prueba), 'utf8');
writeFileSync(rutaClave, renderClave(prueba), 'utf8');

console.log(`Forma ${FORM} generada:`);
console.log(`  cuadernillo: ${rutaCuadernillo}`);
console.log(`  clave:       ${rutaClave}`);
console.log(`  puntaje máximo: ${PUNTAJE_TOTAL}`);
