// ============================================================
// SERVER — Finanzas App Express + PostgreSQL
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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

// ---- SESIONES ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'finanzas_secret_local',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

// ---- LOGIN / LOGOUT ----
app.post('/api/login', async (req, res) => {
  const { usuario, contrasena } = req.body;
  const userOk = usuario === process.env.APP_USER;
  const passOk = userOk && bcrypt.compareSync(contrasena, process.env.APP_PASSWORD_HASH);
  if (userOk && passOk) {
    req.session.autenticado = true;
    req.session.usuario = usuario;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session.autenticado) return res.json({ usuario: req.session.usuario });
  res.status(401).json({ error: 'No autenticado' });
});

// ---- HEALTH CHECK (público, antes del auth) ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- MIDDLEWARE AUTH — protege todas las rutas /api/* excepto login/logout/health ----
app.use('/api', (req, res, next) => {
  // req.path aquí es relativo al montaje /api, ej: /login /logout /health
  if (['/login', '/logout', '/health', '/me'].includes(req.path)) return next();
  if (!req.session.autenticado) return res.status(401).json({ error: 'No autenticado' });
  next();
});

// ---- ARCHIVOS ESTÁTICOS ----
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz: redirige a login si no está autenticado
app.get('/', (req, res) => {
  if (!req.session.autenticado) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    const { rows: meses }  = await pool.query('SELECT * FROM meses ORDER BY id');
    const { rows: costos } = await pool.query('SELECT * FROM costos_financieros');
    const { rows: alertas } = await pool.query('SELECT * FROM alertas_mes ORDER BY mes_id');

    // Calcular gasto real DESDE TRANSACCIONES (excluye cuota 00/X y pagos/ingresos)
    const { rows: txnResumen } = await pool.query(`
      SELECT mes_id,
        SUM(CASE WHEN NOT es_ingreso AND descripcion NOT LIKE '%[cuota 00/%' THEN monto ELSE 0 END) AS gasto_txn,
        SUM(CASE WHEN NOT es_ingreso AND descripcion LIKE '%[cuota 00/%' THEN monto ELSE 0 END)     AS proximo_ciclo,
        SUM(CASE WHEN es_ingreso THEN monto ELSE 0 END)                                             AS ingresos_txn,
        COUNT(CASE WHEN NOT es_ingreso THEN 1 END)                                                  AS num_movimientos
      FROM transacciones GROUP BY mes_id
    `);
    const txnMap = {};
    txnResumen.forEach(t => txnMap[t.mes_id] = {
      gasto_txn:      parseInt(t.gasto_txn) || 0,
      proximo_ciclo:  parseInt(t.proximo_ciclo) || 0,
      ingresos_txn:   parseInt(t.ingresos_txn) || 0,
      num_movimientos: parseInt(t.num_movimientos) || 0,
      tiene_datos: true
    });

    const costosMap = {};
    costos.forEach(c => costosMap[c.mes_id] = { tc: parseInt(c.tc), lc: parseInt(c.lc), total: parseInt(c.total) });

    const alertasMap = {};
    alertas.forEach(a => {
      if (!alertasMap[a.mes_id]) alertasMap[a.mes_id] = [];
      alertasMap[a.mes_id].push(a.texto);
    });

    const result = meses.map(m => {
      const txn = txnMap[m.id] || {};
      // Para meses con transacciones reales, usar gasto calculado; si no, usar seed
      const gasto_real = txn.gasto_txn || parseInt(m.gasto_real);
      return {
        id: m.id,
        label: m.label,
        gasto_real,
        gasto_seed: parseInt(m.gasto_real),    // original del seed
        gasto_txn:  txn.gasto_txn || null,      // calculado de transacciones
        proximo_ciclo: txn.proximo_ciclo || 0,
        ingresos_txn: txn.ingresos_txn || 0,
        num_movimientos: txn.num_movimientos || 0,
        tiene_transacciones: !!txn.tiene_datos,
        mes_abierto: m.mes_abierto,
        ingresos_extras: parseInt(m.ingresos_extras),
        notas: m.notas,
        costos_financieros: costosMap[m.id] || { tc: 0, lc: 0, total: 0 },
        alertas: alertasMap[m.id] || []
      };
    });

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

// ---- ANÁLISIS GASTO REAL vs CUOTAS POR MES ----
app.get('/api/meses/:id/analisis', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT
        -- Total egresos del mes (excluye cuota 00/X que se cobra el próximo mes)
        SUM(CASE WHEN NOT es_ingreso
          AND NOT (descripcion ~* '\\[cuota 0+/(\\d+)\\]')
          THEN monto ELSE 0 END) AS total_egresos,

        -- Cuotas heredadas: cuota >= 02/X (pagos de compras de meses anteriores)
        SUM(CASE WHEN NOT es_ingreso
          AND descripcion ~* '\\[cuota (0[2-9]|[1-9]\\d)/(\\d+)\\]'
          THEN monto ELSE 0 END) AS cuotas_heredadas,

        -- Primera cuota: cuota 01/X (compra nueva con cuotas, iniciada este mes)
        SUM(CASE WHEN NOT es_ingreso
          AND descripcion ~* '\\[cuota 01/(\\d+)\\]'
          THEN monto ELSE 0 END) AS cuotas_nuevas,

        -- Compras al contado (sin cuotas, pago inmediato)
        SUM(CASE WHEN NOT es_ingreso
          AND descripcion NOT LIKE '%[cuota%'
          THEN monto ELSE 0 END) AS gasto_contado,

        -- Próximo mes (cuota 00/X, ya aparece pero se cobra después)
        SUM(CASE WHEN NOT es_ingreso
          AND descripcion ~* '\\[cuota 0+/(\\d+)\\]'
          THEN monto ELSE 0 END) AS proximo_mes,

        -- Total ingresos del mes
        SUM(CASE WHEN es_ingreso THEN monto ELSE 0 END) AS total_ingresos,

        COUNT(CASE WHEN NOT es_ingreso THEN 1 END) AS num_egresos,
        COUNT(CASE WHEN es_ingreso THEN 1 END) AS num_ingresos

      FROM transacciones
      WHERE mes_id = $1
    `, [id]);

    // Detalle de cuotas heredadas (las más importantes)
    const { rows: detalleCuotas } = await pool.query(`
      SELECT descripcion, monto, fuente,
        (regexp_match(descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[1] AS cuota_actual,
        (regexp_match(descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[2] AS cuota_total
      FROM transacciones
      WHERE mes_id = $1
        AND NOT es_ingreso
        AND descripcion ~* '\\[cuota (0[2-9]|[1-9]\\d)/(\\d+)\\]'
      ORDER BY monto DESC
    `, [id]);

    const r = rows[0];
    let cuotas_heredadas = parseInt(r.cuotas_heredadas) || 0;
    let detalle = detalleCuotas.map(d => ({ ...d, monto: parseInt(d.monto) }));

    // Si no hay cuotas heredadas importadas, proyectarlas desde meses anteriores
    // Buscar cuotas activas de meses previos que aún continúen en este mes
    if (cuotas_heredadas === 0) {
      const { rows: proyectadas } = await pool.query(`
        WITH cuotas_activas AS (
          SELECT
            descripcion,
            monto,
            fuente,
            (regexp_match(descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[1]::int AS cuota_actual,
            (regexp_match(descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[2]::int AS cuota_total,
            mes_id
          FROM transacciones
          WHERE NOT es_ingreso
            AND descripcion ~* '\\[cuota \\d+/\\d+\\]'
            AND mes_id < $1
        )
        SELECT descripcion, monto, fuente, cuota_actual, cuota_total, mes_id,
          -- Cuántos meses faltan = cuota_total - cuota_actual
          (cuota_total - cuota_actual) AS meses_restantes
        FROM cuotas_activas
        WHERE cuota_actual > 0           -- excluir cuota 00
          AND cuota_actual < cuota_total -- aún no terminada
          -- La cuota más reciente de esa descripción
          AND (descripcion, mes_id) IN (
            SELECT descripcion, MAX(mes_id)
            FROM cuotas_activas
            WHERE cuota_actual > 0 AND cuota_actual < cuota_total
            GROUP BY descripcion
          )
          -- Y que siga vigente este mes (cuota_actual + diferencia de meses <= cuota_total)
          AND (cuota_actual + (
            (EXTRACT(YEAR FROM $1::date) - EXTRACT(YEAR FROM (mes_id || '-01')::date)) * 12 +
            (EXTRACT(MONTH FROM $1::date) - EXTRACT(MONTH FROM (mes_id || '-01')::date))
          )) <= cuota_total
        ORDER BY monto DESC
      `, [id + '-01']);

      if (proyectadas.length > 0) {
        cuotas_heredadas = proyectadas.reduce((s, p) => s + parseInt(p.monto), 0);
        detalle = proyectadas.map(p => ({
          descripcion: p.descripcion,
          monto: parseInt(p.monto),
          fuente: p.fuente,
          cuota_actual: String(parseInt(p.cuota_actual) + parseInt(
            (new Date(id + '-01').getFullYear() - new Date(p.mes_id + '-01').getFullYear()) * 12 +
            (new Date(id + '-01').getMonth() - new Date(p.mes_id + '-01').getMonth())
          )).padStart(2, '0'),
          cuota_total: String(p.cuota_total).padStart(2, '0'),
          proyectado: true
        }));
      }
    }

    res.json({
      total_egresos:    parseInt(r.total_egresos) || 0,
      cuotas_heredadas,
      cuotas_nuevas:    parseInt(r.cuotas_nuevas) || 0,
      gasto_contado:    parseInt(r.gasto_contado) || 0,
      proximo_mes:      parseInt(r.proximo_mes) || 0,
      total_ingresos:   parseInt(r.total_ingresos) || 0,
      gasto_nuevo:      (parseInt(r.gasto_contado) || 0) + (parseInt(r.cuotas_nuevas) || 0),
      detalle_cuotas:   detalle
    });
  } catch (err) {
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

// ---- RESUMEN TC POR MES (detalle con cuotas) ----
app.get('/api/resumen-tc', async (req, res) => {
  try {
    const { mes_id } = req.query;
    const params = [];
    let where = `WHERE t.fuente IN ('cartola_credito','cartola_inter')`;
    if (mes_id) { params.push(mes_id); where += ` AND t.mes_id = $1`; }
    const { rows } = await pool.query(`
      SELECT
        t.id, t.fuente, t.descripcion, t.monto, t.categoria_key,
        TO_CHAR(t.fecha, 'DD/MM') AS fecha_fmt,
        c.label AS categoria_label, c.color AS categoria_color,
        -- Extraer cuota actual del patrón [cuota NN/NN]
        CASE WHEN t.descripcion ~* '\\[cuota (\\d+)/(\\d+)\\]'
          THEN (regexp_match(t.descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[1]
          ELSE NULL END AS cuota_actual,
        CASE WHEN t.descripcion ~* '\\[cuota (\\d+)/(\\d+)\\]'
          THEN (regexp_match(t.descripcion, '\\[cuota (\\d+)/(\\d+)\\]', 'i'))[2]
          ELSE NULL END AS cuota_total
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
      ${where}
      ORDER BY t.fuente, t.es_ingreso ASC, t.monto DESC
    `, params);

    const result = rows.map(r => {
      const esProximoMes = r.cuota_actual === '00';
      const montoTotal   = parseInt(r.monto);
      // Para cuota 00/X el monto almacenado es el total de la compra.
      // La cuota mensual = monto_total / total_cuotas
      const cuotaMensual = esProximoMes && r.cuota_total
        ? Math.round(montoTotal / parseInt(r.cuota_total))
        : montoTotal;
      return {
        ...r,
        monto:         montoTotal,
        cuota_mensual: cuotaMensual,
        proximo_mes:   esProximoMes
      };
    });

    res.json(result);
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
      SELECT t.*,
        c.label AS categoria_label, c.color AS categoria_color,
        (t.descripcion LIKE '%[cuota 00/%') AS es_proximo_ciclo
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
      WHERE 1=1
    `;
    const params = [];
    if (mes_id) { params.push(mes_id); query += ` AND t.mes_id = $${params.length}`; }
    if (categoria_key === '__sin_categoria__') {
      query += ` AND t.categoria_key IS NULL`;
    } else if (categoria_key) {
      params.push(categoria_key); query += ` AND t.categoria_key = $${params.length}`;
    }
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
        -- Excluir cuota 00/X de egresos (se cobran el próximo ciclo, no este mes)
        SUM(CASE WHEN NOT t.es_ingreso AND t.descripcion NOT LIKE '%[cuota 00/%' THEN t.monto ELSE 0 END) AS egresos,
        SUM(CASE WHEN t.es_ingreso THEN t.monto ELSE 0 END) AS ingresos,
        SUM(CASE WHEN NOT t.es_ingreso AND t.descripcion LIKE '%[cuota 00/%' THEN t.monto ELSE 0 END) AS proximo_ciclo
      FROM transacciones t
      LEFT JOIN categorias c ON t.categoria_key = c.key
    `;
    const params = [];
    if (mes_id) { params.push(mes_id); query += ` WHERE t.mes_id = $1`; }
    query += ' GROUP BY t.categoria_key, c.label, c.color ORDER BY egresos DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      egresos:       parseInt(r.egresos) || 0,
      ingresos:      parseInt(r.ingresos) || 0,
      proximo_ciclo: parseInt(r.proximo_ciclo) || 0,
      num_transacciones: parseInt(r.num_transacciones)
    })));
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
