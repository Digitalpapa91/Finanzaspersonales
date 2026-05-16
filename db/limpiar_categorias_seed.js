require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Mapa: categoria vieja → categoria nueva
const REMAP = {
  'latam_cuota':          'vacaciones',
  'ipanema_cuota':        'vacile',
  'maxi_technology':      'electronica',
  'haulmerpunto':         'hogar_articulos',
  'tokuspa_comunidad':    'vivienda_arriendo',
  'avance_reestructurado':'costos_financieros_tc',
};

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Reasignar transacciones
    for (const [vieja, nueva] of Object.entries(REMAP)) {
      const { rowCount } = await client.query(
        `UPDATE transacciones SET categoria_key = $1 WHERE categoria_key = $2`,
        [nueva, vieja]
      );
      if (rowCount > 0) console.log(`   txn: ${vieja} → ${nueva}: ${rowCount} fila(s)`);
    }

    // 2. Reasignar desglose (datos mensuales del seed)
    for (const [vieja, nueva] of Object.entries(REMAP)) {
      const { rowCount } = await client.query(
        `UPDATE desglose SET categoria_key = $1 WHERE categoria_key = $2`,
        [nueva, vieja]
      );
      if (rowCount > 0) console.log(`   desglose: ${vieja} → ${nueva}: ${rowCount} fila(s)`);
    }

    // 3. Eliminar reglas que apuntan a categorías obsoletas, luego las categorías
    const keysViejas = Object.keys(REMAP);
    await client.query(
      `DELETE FROM reglas_categoria WHERE categoria_key = ANY($1)`,
      [keysViejas]
    );
    await client.query(
      `DELETE FROM categorias WHERE key = ANY($1)`,
      [keysViejas]
    );
    console.log(`   categorías eliminadas: ${keysViejas.join(', ')}`);

    // 4. Aplicar TODAS las reglas sobre transacciones sin categoría
    const { rows: reglas } = await client.query(
      `SELECT patron, categoria_key FROM reglas_categoria ORDER BY LENGTH(patron) DESC`
    );

    let reclasificadas = 0;
    for (const r of reglas) {
      const { rowCount } = await client.query(
        `UPDATE transacciones SET categoria_key = $1
         WHERE categoria_key IS NULL
         AND UPPER(descripcion) LIKE UPPER('%' || $2 || '%')`,
        [r.categoria_key, r.patron]
      );
      reclasificadas += rowCount;
    }
    console.log(`   sin categoría reclasificadas por reglas: ${reclasificadas}`);

    // 5. Verificar cuántas siguen sin categoría
    const { rows: sc } = await client.query(
      `SELECT COUNT(*) as total FROM transacciones WHERE categoria_key IS NULL`
    );
    console.log(`   transacciones aún sin categoría: ${sc[0].total}`);

    await client.query('COMMIT');
    console.log('\n✅ Limpieza completa.');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error, rollback:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
