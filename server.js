// ============================================================
// SERVER — Finanzas App Express + PostgreSQL
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const { importarCartola } = require('./api/importar');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- HEALTH CHECK ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- RESUMEN GENERAL ----
app.get('/api/resumen', async (req, res) => {
  try {
    const { rows: meses } = await pool.query('SELECT * FROM meses ORDER BY id');
    const { rows: costos } = await pool.query('SELECT * FROM costos_financieros');
    const { rows: anual } = await pool.query(`
      SELECT
        SUBSTRING(id,1,4) AS anio,
        SUM(gasto_real) AS total,
        AVG(gasto_real) AS promedio,
        COUNT(*) AS num_meses,
        SUM(ingresos_extras) AS ingresos
      FROM meses
      GROUP BY anio
      ORDER BY anio
    `);

    const costosMap = {};
    costos.forEach(c => costosMap[c.mes_id] = c);

    const total = meses.reduce((s, m) => s + parseInt(m.gasto_real), 0);
    const promedio = Math.round(total / meses.length);
    const max = meses.reduce((a, b) => parseInt(a.gasto_real) > parseInt(b.gasto_real) ? a : b);
    const min = meses.reduce((a, b) => parseInt(a.gasto_real) < parseInt(b.gasto_real) ? a : b);
    const totalFinanciero = costos.reduce((s, c) => s + parseInt(c.total), 0);
    const ultimo = meses[meses.length - 1];

    res.json({
      total, promedio,
      max: { label: max.label, valor: parseInt(max.gasto_real) },
      min: { label: min.label, valor: parseInt(min.gasto_real) },
      total_financiero: totalFinanciero,
      ultimo: { label: ultimo.label, valor: parseInt(ultimo.gasto_real), abierto: ultimo.mes_abierto },
      num_meses: meses.length,
      por_anio: anual.map(a => ({ anio: a.anio, total: parseInt(a.total), promedio: Math.round(a.promedio), meses: parseInt(a.num_meses) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- TODOS LOS MESES (para gráficas) ----
app.get('/api/meses', async (req, res) => {
  try {
    const { rows: meses } = await pool.query('SELECT * FROM meses ORDER BY id');
    const { rows: costos } = await pool.query('SELECT * FROM costos_financieros');
    const { rows: alertas } = await pool.query('SELECT * FROM alertas_mes ORDER BY mes_id');

    const costosMap = {};
    costos.forEach(c => costosMap[c.mes_id] = { tc: parseInt(c.tc), lc: parseInt(c.lc), total: parseInt(c.total) });

    const alertasMap = {};
    alertas.forEach(a => {
      if (!alertasMap[a.mes_id]) alertasMap[a.mes_id] = [];
      alertasMap[a.mes_id].push(a.texto);
    });

    const result = meses.map(m => ({
      id: m.id,
      label: m.label,
      gasto_real: parseInt(m.gasto_real),
      mes_abierto: m.mes_abierto,
      ingresos_extras: parseInt(m.ingresos_extras),
      notas: m.notas,
      costos_financieros: costosMap[m.id] || { tc: 0, lc: 0, total: 0 },
      alertas: alertasMap[m.id] || []
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- MES ESPECÍFICO CON DESGLOSE ----
app.get('/api/meses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: mes } = await pool.query('SELECT * FROM meses WHERE id=$1', [id]);
    if (!mes.length) return res.status(404).json({ error: 'Mes no encontrado' });

    const { rows: desglose } = await pool.query(`
      SELECT d.categoria_key, d.monto, c.label, c.color
      FROM desglose d
      LEFT JOIN categorias c ON d.categoria_key = c.key
      WHERE d.mes_id = $1
      ORDER BY d.monto DESC
    `, [id]);

    const { rows: costos } = await pool.query('SELECT * FROM costos_financieros WHERE mes_id=$1', [id]);
    const { rows: alertas } = await pool.query('SELECT texto FROM alertas_mes WHERE mes_id=$1', [id]);

    res.json({
      ...mes[0],
      gasto_real: parseInt(mes[0].gasto_real),
      ingresos_extras: parseInt(mes[0].ingresos_extras),
      desglose: desglose.map(d => ({ ...d, monto: parseInt(d.monto) })),
      costos_financieros: costos[0] ? { tc: parseInt(costos[0].tc), lc: parseInt(costos[0].lc), total: parseInt(costos[0].total) } : { tc: 0, lc: 0, total: 0 },
      alertas: alertas.map(a => a.texto)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---- CATEGORÍAS ----
app.get('/api/categorias', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categorias ORDER BY key');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ESTADÍSTICAS POR CATEGORÍA ----
app.get('/api/categorias/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.categoria_key,
        c.label,
        c.color,
        SUM(CASE WHEN d.monto > 0 THEN d.monto ELSE 0 END) AS total,
        AVG(CASE WHEN d.monto > 0 THEN d.monto ELSE NULL END) AS promedio,
        COUNT(DISTINCT d.mes_id) AS meses_con_gasto
      FROM desglose d
      LEFT JOIN categorias c ON d.categoria_key = c.key
      GROUP BY d.categoria_key, c.label, c.color
      ORDER BY total DESC
    `);
    const numMeses = (await pool.query('SELECT COUNT(*) FROM meses')).rows[0].count;
    res.json(rows.map(r => ({
      key: r.categoria_key,
      label: r.label,
      color: r.color,
      total: parseInt(r.total),
      promedio_mes: Math.round(parseInt(r.total) / parseInt(numMeses)),
      meses_con_gasto: parseInt(r.meses_con_gasto)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CUOTAS ACTIVAS ----
app.get('/api/cuotas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cuotas_activas ORDER BY prioridad DESC, total_pendiente DESC');
    res.json(rows.map(r => ({ ...r, cuota: parseInt(r.cuota), total_pendiente: parseInt(r.total_pendiente) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ALERTAS GLOBALES ----
app.get('/api/alertas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alertas_globales ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- AGREGAR NUEVO MES ----
app.post('/api/meses', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, label, gasto_real, mes_abierto, ingresos_extras, notas, desglose, costos_financieros, alertas } = req.body;
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO meses (id, label, gasto_real, mes_abierto, ingresos_extras, notas) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, label, gasto_real, mes_abierto || false, ingresos_extras || 0, notas || null]
    );
    if (costos_financieros) {
      await client.query(
        'INSERT INTO costos_financieros (mes_id, tc, lc, total) VALUES ($1,$2,$3,$4)',
        [id, costos_financieros.tc || 0, costos_financieros.lc || 0, costos_financieros.total || 0]
      );
    }
    if (desglose) {
      for (const [cat_key, monto] of Object.entries(desglose)) {
        if (monto !== 0) {
          await client.query('INSERT INTO desglose (mes_id, categoria_key, monto) VALUES ($1,$2,$3)', [id, cat_key, monto]);
        }
      }
    }
    if (alertas && alertas.length) {
      for (const texto of alertas) {
        await client.query('INSERT INTO alertas_mes (mes_id, texto) VALUES ($1,$2)', [id, texto]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- TRANSACCIONES — listar (con filtros opcionales) ----
app.get('/api/transacciones', async (req, res) => {
  try {
    const { mes_id, categoria_key } = req.query;
    let query = `
      SELECT t.*, c.label AS categoria_label, c.color AS categoria_color
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
      WHERE 1=1
    `;
    const params = [];
    if (mes_id) { params.push(mes_id); query += ` AND t.mes_id = $${params.length}`; }
    if (categoria_key) { params.push(categoria_key); query += ` AND t.categoria_key = $${params.length}`; }
    query += ' ORDER BY t.fecha DESC, t.id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => ({ ...r, monto: parseInt(r.monto) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- TRANSACCIONES — agregar ----
app.post('/api/transacciones', async (req, res) => {
  try {
    const { mes_id, fecha, descripcion, monto, categoria_key, medio_pago, notas } = req.body;
    if (!mes_id || !fecha || !descripcion || !monto || !categoria_key) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: mes_id, fecha, descripcion, monto, categoria_key' });
    }
    const { rows } = await pool.query(
      'INSERT INTO transacciones (mes_id, fecha, descripcion, monto, categoria_key, medio_pago, notas) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [mes_id, fecha, descripcion, parseInt(monto), categoria_key, medio_pago || 'cuenta_corriente', notas || null]
    );
    res.status(201).json({ ...rows[0], monto: parseInt(rows[0].monto) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- TRANSACCIONES — editar ----
app.put('/api/transacciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, descripcion, monto, categoria_key, medio_pago, notas } = req.body;
    const { rows } = await pool.query(
      'UPDATE transacciones SET fecha=$1, descripcion=$2, monto=$3, categoria_key=$4, medio_pago=$5, notas=$6 WHERE id=$7 RETURNING *',
      [fecha, descripcion, parseInt(monto), categoria_key, medio_pago, notas, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Transacción no encontrada' });
    res.json({ ...rows[0], monto: parseInt(rows[0].monto) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- TRANSACCIONES — eliminar ----
app.delete('/api/transacciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM transacciones WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- RESUMEN POR CATEGORÍA con transacciones ----
app.get('/api/transacciones/por-categoria', async (req, res) => {
  try {
    const { mes_id } = req.query;
    let query = `
      SELECT
        t.categoria_key,
        c.label, c.color,
        COUNT(*) AS num_transacciones,
        SUM(t.monto) AS total
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
    `;
    const params = [];
    if (mes_id) { params.push(mes_id); query += ` WHERE t.mes_id = $1`; }
    query += ' GROUP BY t.categoria_key, c.label, c.color ORDER BY total DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => ({ ...r, total: parseInt(r.total), num_transacciones: parseInt(r.num_transacciones) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- IMPORTAR CARTOLA ----
app.post('/api/importar', upload.single('cartola'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const fuente      = req.body.fuente || 'cartola_debito';
    const tipoCambio  = parseFloat(req.body.tipo_cambio) || 950;
    const resultado   = await importarCartola(req.file.buffer, fuente, pool, tipoCambio);
    res.json(resultado);
  } catch (err) {
    console.error('Error importando cartola:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- CATEGORÍAS SIN ASIGNAR (para revisar tras importar) ----
app.get('/api/transacciones/sin-categoria', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, c.label AS categoria_label
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
      WHERE t.categoria_key IS NULL
      ORDER BY t.fecha DESC
    `);
    res.json(rows.map(r => ({ ...r, monto: parseInt(r.monto) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ASIGNAR CATEGORÍA A TRANSACCIÓN ----
app.patch('/api/transacciones/:id/categoria', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoria_key } = req.body;
    await pool.query('UPDATE transacciones SET categoria_key=$1 WHERE id=$2', [categoria_key, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- REGLAS DE CATEGORIZACIÓN ----
app.get('/api/reglas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reglas_categoria WHERE activa=true ORDER BY patron');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- CATCH ALL → sirve el HTML ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Finanzas App corriendo en http://localhost:${PORT}`);
});
