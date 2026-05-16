// ============================================================
// MÓDULO: Importador de cartolas Itaú (XLS/XLSX)
// Soporta: Cuenta Corriente y Tarjeta de Crédito
// ============================================================
const XLSX = require('xlsx');

// ---- Movimientos internos a ignorar (Cuenta Corriente) ----
const IGNORAR_CC = [
  'ABONO DESDE LINEA DE CREDITO',
  'CARGO CTACTE POR TRASPASO LC',
  'RETENCION',
  'DEVOLUCION RETENCION'
];

// ---- Movimientos a ignorar (Tarjeta de Crédito) ----
// "MONTO CANCELADO" = pagos que ya aparecen en la CC cartola
const IGNORAR_TC = [
  'MONTO CANCELADO'
];

// Convertir serial de Excel a fecha ISO (YYYY-MM-DD)
function excelDateToISO(serial) {
  if (!serial || isNaN(serial)) return null;
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return null;
  return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
}

// Hash único para deduplicación: fecha + monto + descripcion normalizada
function generarHash(fechaISO, monto, descripcion, fuente) {
  const desc = (descripcion || '').toUpperCase().trim().replace(/\s+/g, ' ');
  // Incluir fuente en el hash para evitar colisiones entre CC y TC
  return `${fuente}|${fechaISO}|${Math.abs(monto)}|${desc}`;
}

function getMesId(fechaISO) {
  return fechaISO ? fechaISO.slice(0, 7) : null;
}

// Auto-categorizar según reglas de BD
async function categorizarAutomatico(descripcion, pool) {
  const descUp = (descripcion || '').toUpperCase();
  const { rows } = await pool.query(
    'SELECT * FROM reglas_categoria WHERE activa = true ORDER BY LENGTH(patron) DESC'
  );
  for (const r of rows) {
    if (descUp.includes(r.patron.toUpperCase())) {
      return { categoria_key: r.categoria_key, descripcion_amigable: r.descripcion_amigable };
    }
  }
  return null;
}

// ============================================================
// PARSER CUENTA CORRIENTE
// Columnas: Fecha | Documentos | Movimientos | Cargos | Abonos | Saldo
// ============================================================
function parsearCC(rows) {
  // Encontrar fila de encabezado (la que tiene "Fecha" en col 0 y "Cargos"/"Abonos" más adelante)
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).toLowerCase().trim() === 'fecha' && String(r[3]).toLowerCase().includes('cargo')) {
      headerRow = i; break;
    }
  }
  // Fallback: cualquier fila con "fecha"
  if (headerRow === -1) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).toLowerCase().includes('fecha')) { headerRow = i; break; }
    }
  }
  if (headerRow === -1) throw new Error('No se encontró encabezado en la cartola CC');

  const movimientos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const fechaRaw = row[0];
    const numDoc   = String(row[1] || '').trim();
    const descRaw  = String(row[2] || '').trim();
    const cargo    = parseFloat(row[3]) || 0;
    const abono    = parseFloat(row[4]) || 0;

    if (!fechaRaw || !descRaw || isNaN(Number(fechaRaw))) continue;
    const fechaISO = excelDateToISO(Number(fechaRaw));
    if (!fechaISO) continue;

    const descUp = descRaw.toUpperCase();
    if (IGNORAR_CC.some(ig => descUp.includes(ig))) continue;

    const esCargo = cargo > 0;
    const esAbono = abono > 0 && !esCargo;
    if (!esCargo && !esAbono) continue;

    const monto = esCargo ? cargo : abono;
    movimientos.push({
      fecha: fechaISO,
      mes_id: getMesId(fechaISO),
      descripcion: descRaw,
      monto: Math.round(monto),
      es_ingreso: esAbono,
      cuotas: null,
      numero_doc: numDoc || null
    });
  }
  return movimientos;
}

// ============================================================
// PARSER TARJETA DE CRÉDITO
// Columnas: Fecha compra | Fecha proceso | Descripción | Ciudad | Cuotas | Monto
// Secciones: Nacional (principal) e Internacional (ignorar por ahora)
// ============================================================
function parsearTC(rows) {
  // Encontrar fila de encabezado nacional: "Fecha compra"
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).toLowerCase().includes('fecha compra')) { headerRow = i; break; }
  }
  if (headerRow === -1) throw new Error('No se encontró encabezado "Fecha compra" en la cartola TC');

  // Detectar fila de fin de sección nacional
  let endRow = rows.length;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const cell = String(rows[i][0] || '').toLowerCase();
    if (cell.includes('internacionales') || cell.includes('internacional')) {
      endRow = i; break;
    }
  }

  const movimientos = [];
  for (let i = headerRow + 1; i < endRow; i++) {
    const row = rows[i];
    const fechaRaw = row[0];
    const descRaw  = String(row[2] || '').trim();
    const ciudad   = String(row[3] || '').trim();
    const cuotaStr = String(row[4] || '').trim(); // ej: "03/12" o ""
    const montoRaw = parseFloat(row[5]);

    if (!fechaRaw || !descRaw || isNaN(Number(fechaRaw))) continue;
    if (isNaN(montoRaw)) continue;

    const fechaISO = excelDateToISO(Number(fechaRaw));
    if (!fechaISO) continue;

    const descUp = descRaw.toUpperCase();

    // Ignorar pagos realizados a la TC (ya están en CC)
    if (IGNORAR_TC.some(ig => descUp.includes(ig))) continue;

    // Monto negativo = crédito/devolución → es ingreso
    const esIngreso = montoRaw < 0;
    const monto = Math.abs(Math.round(montoRaw));

    // Info de cuotas (ej: "03/12" = cuota 3 de 12)
    const cuotas = cuotaStr && cuotaStr.includes('/') ? cuotaStr : null;

    // Descripción enriquecida con cuotas si aplica
    const descFinal = cuotas
      ? `${descRaw.replace(/ \d+-\d+ CUOTA/i, '').trim()} [cuota ${cuotas}]`
      : descRaw;

    movimientos.push({
      fecha: fechaISO,
      mes_id: getMesId(fechaISO),
      descripcion: descFinal,
      descripcion_original: descRaw,
      monto,
      es_ingreso: esIngreso,
      cuotas,
      numero_doc: null,
      ciudad: ciudad || null
    });
  }
  return movimientos;
}

// ============================================================
// DETECTAR TIPO DE CARTOLA AUTOMÁTICAMENTE
// ============================================================
function detectarTipo(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const joined = rows[i].map(c => String(c).toLowerCase()).join('|');
    if (joined.includes('fecha operaci') || joined.includes('monto usd') || joined.includes('estado de cuenta internacional')) return 'tc_inter';
    if (joined.includes('fecha compra')) return 'tc';
    if (joined.includes('últimos movimientos') || joined.includes('ultimos movimientos')) return 'cc';
    if (joined.includes('tarjeta de crédito') || joined.includes('tarjeta de credito')) return 'tc';
    if (joined.includes('cuenta corriente')) return 'cc';
  }
  return 'cc';
}

// ============================================================
// IMPORTAR A LA BD CON DEDUPLICACIÓN
// ============================================================
async function importarCartola(buffer, fuente = 'cartola_debito', pool, tipoCambio = 950) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Auto-detectar tipo
  const tipoDetectado = detectarTipo(rows);
  const esTCInter = fuente === 'cartola_inter' || tipoDetectado === 'tc_inter';
  const esTC      = !esTCInter && (fuente === 'cartola_credito' || tipoDetectado === 'tc');

  let movimientos;
  if (esTCInter)     movimientos = parsearTCInter(rows, tipoCambio);
  else if (esTC)     movimientos = parsearTC(rows);
  else               movimientos = parsearCC(rows);

  const fuenteFinal = esTCInter ? 'cartola_inter' : esTC ? 'cartola_credito' : 'cartola_debito';
  const medioPago   = esTCInter || esTC ? 'tarjeta_credito' : 'cuenta_corriente';
  const tipoLabel   = esTCInter ? 'TC Internacional (USD)' : esTC ? 'Tarjeta de Crédito' : 'Cuenta Corriente';

  let importados   = 0;
  let duplicados   = 0;
  let sin_categoria = 0;
  const detalle    = [];

  for (const mov of movimientos) {
    const hash = generarHash(mov.fecha, mov.monto, mov.descripcion_original || mov.descripcion, fuenteFinal);

    // Verificar duplicado
    const { rows: existe } = await pool.query(
      'SELECT id FROM transacciones WHERE cartola_hash = $1', [hash]
    );
    if (existe.length > 0) { duplicados++; continue; }

    // Auto-categorizar
    const cat = await categorizarAutomatico(mov.descripcion_original || mov.descripcion, pool);
    const categoria_key = cat?.categoria_key || null;
    if (!categoria_key) sin_categoria++;

    // Crear mes si no existe
    if (mov.mes_id) {
      const { rows: mesExiste } = await pool.query('SELECT id FROM meses WHERE id=$1', [mov.mes_id]);
      if (!mesExiste.length) {
        const [anio, mes] = mov.mes_id.split('-');
        const nombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        await pool.query(
          'INSERT INTO meses (id, label, gasto_real, mes_abierto) VALUES ($1,$2,0,true) ON CONFLICT DO NOTHING',
          [mov.mes_id, `${nombres[parseInt(mes)]} ${anio}`]
        );
        await pool.query(
          'INSERT INTO costos_financieros (mes_id,tc,lc,total) VALUES ($1,0,0,0) ON CONFLICT DO NOTHING',
          [mov.mes_id]
        );
      }
    }

    // Insertar
    const notas = mov.monto_usd
      ? `USD $${mov.monto_usd} · TC $${mov.tipo_cambio}${mov.pais ? ' · ' + mov.pais : ''}`
      : mov.cuotas
        ? `Cuota ${mov.cuotas}${mov.ciudad ? ' · ' + mov.ciudad : ''}`
        : (mov.ciudad || null);
    const { rows: inserted } = await pool.query(`
      INSERT INTO transacciones
        (mes_id, fecha, descripcion, monto, categoria_key, medio_pago, es_ingreso, fuente, cartola_hash, numero_doc, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (cartola_hash) WHERE cartola_hash IS NOT NULL DO NOTHING
      RETURNING id
    `, [mov.mes_id, mov.fecha, mov.descripcion, mov.monto, categoria_key,
        medioPago, mov.es_ingreso, fuenteFinal, hash, mov.numero_doc, notas]);

    if (inserted.length > 0) {
      importados++;
      detalle.push({
        id: inserted[0].id,
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        monto: mov.monto,
        es_ingreso: mov.es_ingreso,
        categoria_key,
        categoria_label: cat?.descripcion_amigable || null,
        sin_categoria: !categoria_key,
        cuotas: mov.cuotas
      });
    }
  }

  return {
    importados, duplicados, sin_categoria,
    total_archivo: movimientos.length,
    tipo: tipoLabel,
    detalle
  };
}

// ============================================================
// PARSER TARJETA INTERNACIONAL (USD)
// Columnas: N°ref | - | Fecha | Descripción | Ciudad | País | Monto origen | Monto USD
// ============================================================
function parsearTCInter(rows, tipoCambio = 950) {
  // Encontrar fila de encabezado: contiene "Fecha operación"
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map(c => String(c).toLowerCase()).join('|');
    if (joined.includes('fecha operaci') || joined.includes('monto usd')) {
      headerRow = i; break;
    }
  }
  if (headerRow === -1) throw new Error('No se encontró encabezado en cartola internacional');

  // Ignorar
  const IGNORAR_INTER = ['TRASPASO DEUDA INTERNAC', 'PROMO MASTERCARD'];

  const movimientos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const refRaw  = String(row[0] || '').trim();
    const fechaRaw = row[2];
    const descRaw  = String(row[3] || '').trim();
    const ciudad   = String(row[4] || '').trim();
    const pais     = String(row[5] || '').trim();
    const montoUSD = parseFloat(row[7]);

    // Saltar filas sin referencia real o sin fecha válida
    if (!refRaw || refRaw === ' ' || !descRaw || descRaw === ' ') continue;
    if (!fechaRaw || isNaN(Number(fechaRaw))) continue;
    if (isNaN(montoUSD) || montoUSD === 0) continue;

    const fechaISO = excelDateToISO(Number(fechaRaw));
    if (!fechaISO) continue;

    const descUp = descRaw.toUpperCase();
    if (IGNORAR_INTER.some(ig => descUp.includes(ig))) continue;

    const esIngreso = montoUSD < 0;
    const usdAbs    = Math.abs(montoUSD);
    const montoCLP  = Math.round(usdAbs * tipoCambio);

    movimientos.push({
      fecha: fechaISO,
      mes_id: getMesId(fechaISO),
      descripcion: descRaw,
      monto: montoCLP,
      es_ingreso: esIngreso,
      cuotas: null,
      numero_doc: refRaw,
      ciudad: ciudad || null,
      pais: pais || null,
      monto_usd: usdAbs,
      tipo_cambio: tipoCambio
    });
  }
  return movimientos;
}

// Exportar parsers individuales también
module.exports = { importarCartola, parsearTCInter };
