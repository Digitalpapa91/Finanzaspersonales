// ============================================================
// MÓDULO: Importador de cartola Itaú (XLS/XLSX)
// ============================================================
const XLSX = require('xlsx');

// Movimientos internos a ignorar completamente
const IGNORAR = [
  'ABONO DESDE LINEA DE CREDITO',
  'CARGO CTACTE POR TRASPASO LC',
  'RETENCION ',
  'DEVOLUCION RETENCION'
];

// Convertir serial de Excel a fecha ISO (YYYY-MM-DD)
function excelDateToISO(serial) {
  if (!serial || isNaN(serial)) return null;
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return null;
  const y = date.y;
  const m = String(date.m).padStart(2, '0');
  const d = String(date.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Generar hash único para deduplicación
function generarHash(fechaISO, monto, descripcion) {
  const desc = (descripcion || '').toUpperCase().trim().replace(/\s+/g, ' ');
  return `${fechaISO}|${Math.abs(monto)}|${desc}`;
}

// Determinar el mes_id a partir de una fecha ISO
function getMesId(fechaISO) {
  if (!fechaISO) return null;
  return fechaISO.slice(0, 7); // "YYYY-MM"
}

// Auto-categorizar según reglas
async function categorizarAutomatico(descripcion, esIngreso, pool) {
  const descUp = (descripcion || '').toUpperCase();
  const { rows } = await pool.query(
    'SELECT * FROM reglas_categoria WHERE activa = true ORDER BY LENGTH(patron) DESC'
  );
  for (const regla of rows) {
    if (descUp.includes(regla.patron.toUpperCase())) {
      return {
        categoria_key: regla.categoria_key,
        descripcion_amigable: regla.descripcion_amigable
      };
    }
  }
  return null;
}

// Parser principal de cartola Itaú
function parsearCartola(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Encontrar fila de encabezados (contiene "Fecha")
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase().includes('fecha')) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) throw new Error('No se encontró encabezado "Fecha" en el archivo');

  const movimientos = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const fechaRaw = row[0];
    const numDoc   = String(row[1] || '').trim();
    const descRaw  = String(row[2] || '').trim();
    const cargo    = parseFloat(row[3]) || 0;
    const abono    = parseFloat(row[4]) || 0;

    // Saltar filas vacías o sin fecha
    if (!fechaRaw || !descRaw) continue;
    if (isNaN(Number(fechaRaw))) continue;

    const fechaISO = excelDateToISO(Number(fechaRaw));
    if (!fechaISO) continue;

    const descUp = descRaw.toUpperCase();

    // Ignorar movimientos internos
    if (IGNORAR.some(ig => descUp.includes(ig))) continue;

    // Determinar si es cargo o abono
    const esCargo = cargo > 0;
    const esAbono = abono > 0 && !esCargo;
    if (!esCargo && !esAbono) continue;

    const monto = esCargo ? cargo : abono;
    const esIngreso = esAbono;

    movimientos.push({
      fecha: fechaISO,
      mes_id: getMesId(fechaISO),
      descripcion: descRaw,
      monto: Math.round(monto),
      es_ingreso: esIngreso,
      numero_doc: numDoc || null,
      hash: generarHash(fechaISO, monto, descRaw)
    });
  }

  return movimientos;
}

// Importar a la BD con deduplicación
async function importarCartola(buffer, fuente = 'cartola_debito', pool) {
  const movimientos = parsearCartola(buffer);

  let importados = 0;
  let duplicados = 0;
  let sin_categoria = 0;
  const detalle = [];

  for (const mov of movimientos) {
    // Verificar si ya existe (por hash)
    const { rows: existe } = await pool.query(
      'SELECT id FROM transacciones WHERE cartola_hash = $1',
      [mov.hash]
    );
    if (existe.length > 0) {
      duplicados++;
      continue;
    }

    // Auto-categorizar
    const cat = await categorizarAutomatico(mov.descripcion, mov.es_ingreso, pool);
    const categoria_key = cat?.categoria_key || null;
    if (!categoria_key) sin_categoria++;

    // Asegurar que el mes existe
    const { rows: mesExiste } = await pool.query('SELECT id FROM meses WHERE id = $1', [mov.mes_id]);
    if (!mesExiste.length) {
      // Crear mes automáticamente si no existe
      const [anio, mes] = mov.mes_id.split('-');
      const meses_es = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const label = `${meses_es[parseInt(mes)]} ${anio}`;
      await pool.query(
        'INSERT INTO meses (id, label, gasto_real, mes_abierto) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [mov.mes_id, label, 0, true]
      );
      await pool.query(
        'INSERT INTO costos_financieros (mes_id, tc, lc, total) VALUES ($1,0,0,0) ON CONFLICT DO NOTHING',
        [mov.mes_id]
      );
    }

    // Insertar transacción
    const { rows: inserted } = await pool.query(`
      INSERT INTO transacciones
        (mes_id, fecha, descripcion, monto, categoria_key, medio_pago, es_ingreso, fuente, cartola_hash, numero_doc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (cartola_hash) WHERE cartola_hash IS NOT NULL DO NOTHING
      RETURNING id
    `, [
      mov.mes_id,
      mov.fecha,
      mov.descripcion,
      mov.monto,
      categoria_key,
      fuente === 'cartola_debito' ? 'cuenta_corriente' : 'tarjeta_credito',
      mov.es_ingreso,
      fuente,
      mov.hash,
      mov.numero_doc
    ]);

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
        sin_categoria: !categoria_key
      });
    }
  }

  return { importados, duplicados, sin_categoria, total_archivo: movimientos.length, detalle };
}

module.exports = { importarCartola, parsearCartola };
