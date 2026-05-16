require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  console.log('🔄 Reclasificando todas las transacciones según reglas...');

  // Obtener todas las reglas
  const { rows: reglas } = await pool.query(`
    SELECT patron, categoria_key FROM reglas_categoria ORDER BY LENGTH(patron) DESC
  `);

  let totalActualizadas = 0;

  // Para cada regla, buscar transacciones que coincidan y actualizar
  for (const regla of reglas) {
    const { rowCount } = await pool.query(`
      UPDATE transacciones
      SET categoria_key = $1
      WHERE UPPER(descripcion) LIKE UPPER('%' || $2 || '%')
      AND categoria_key IS NULL
    `, [regla.categoria_key, regla.patron]);

    if (rowCount > 0) {
      console.log(`   ✓ ${regla.patron} → ${regla.categoria_key}: ${rowCount} transacción(es)`);
      totalActualizadas += rowCount;
    }
  }

  // Casos específicos de reclasificación por cambios recientes
  const r1 = await pool.query(`
    UPDATE transacciones
    SET categoria_key = 'vacile'
    WHERE UPPER(descripcion) LIKE '%IPANEMA%'
    AND categoria_key != 'vacile'
  `);

  const r2 = await pool.query(`
    UPDATE transacciones
    SET categoria_key = 'vacaciones'
    WHERE UPPER(descripcion) LIKE '%LATAM%'
    AND categoria_key != 'vacaciones'
  `);

  const r3 = await pool.query(`
    UPDATE transacciones
    SET categoria_key = 'electronica'
    WHERE UPPER(descripcion) LIKE '%MAXI TECHNOLOGY%'
    AND categoria_key != 'electronica'
  `);

  totalActualizadas += r1.rowCount + r2.rowCount + r3.rowCount;

  console.log(`\n✅ Total: ${totalActualizadas} transacción(es) reclasificada(s)`);
  console.log(`   - Ipanema → Vacile: ${r1.rowCount}`);
  console.log(`   - LATAM → Vacaciones: ${r2.rowCount}`);
  console.log(`   - Maxi Technology → Electrónica: ${r3.rowCount}`);

  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
