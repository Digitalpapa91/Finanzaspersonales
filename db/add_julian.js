require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('julian', 'Julián', '#f97316', 'Transferencia mensual a Julián Cerda')
    ON CONFLICT (key) DO UPDATE SET label='Julián', color='#f97316', descripcion='Transferencia mensual a Julián Cerda'
  `);

  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('JULIAN CERDA', 'julian', false, 'Julián Cerda'),
      ('JULIAN', 'julian', false, 'Julián')
    ON CONFLICT DO NOTHING
  `);

  // Reasignar transacciones existentes
  const { rowCount } = await pool.query(`
    UPDATE transacciones SET categoria_key = 'julian'
    WHERE UPPER(descripcion) LIKE '%JULIAN%CERDA%'
    OR UPPER(descripcion) LIKE '%JULIAN CERDA%'
  `);

  console.log('✅ Categoría Julián creada.');
  console.log(`   ${rowCount} transacción(es) reasignada(s).`);
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
