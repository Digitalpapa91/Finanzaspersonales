require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1. Crear categoría Electrónica
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('electronica', 'Electrónica', '#06b6d4', 'Equipos electrónicos, computadoras, accesorios tech')
    ON CONFLICT (key) DO UPDATE SET label='Electrónica', color='#06b6d4', descripcion='Equipos electrónicos, computadoras, accesorios tech'
  `);

  // 2. Crear categoría Vacaciones
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('vacaciones', 'Vacaciones', '#f472b6', 'Viajes, vacaciones, boletos aéreos, hoteles')
    ON CONFLICT (key) DO UPDATE SET label='Vacaciones', color='#f472b6', descripcion='Viajes, vacaciones, boletos aéreos, hoteles'
  `);

  // 3. Actualizar Ipanema: otras_transferencias → vacile
  await pool.query(`
    DELETE FROM reglas_categoria WHERE patron = 'MOTEL IPANEMA'
  `);
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES ('MOTEL IPANEMA', 'vacile', false, 'Motel Ipanema')
    ON CONFLICT DO NOTHING
  `);

  // 4. Actualizar LATAM y LATAMCOM: transporte → vacaciones
  await pool.query(`
    DELETE FROM reglas_categoria WHERE patron IN ('LATAM', 'LATAMCOM')
  `);
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('LATAM', 'vacaciones', false, 'LATAM - Vuelo'),
      ('LATAMCOM', 'vacaciones', false, 'LATAM - Vuelo')
    ON CONFLICT DO NOTHING
  `);

  // 5. Agregar regla para Maxi Technology → electronica
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES ('MAXI TECHNOLOGY', 'electronica', false, 'Maxi Technology')
    ON CONFLICT DO NOTHING
  `);

  // 6. Reasignar transacciones existentes
  const r1 = await pool.query(`
    UPDATE transacciones SET categoria_key = 'vacile'
    WHERE categoria_key = 'otras_transferencias'
    AND UPPER(descripcion) LIKE '%IPANEMA%'
  `);

  const r2 = await pool.query(`
    UPDATE transacciones SET categoria_key = 'vacaciones'
    WHERE categoria_key = 'transporte'
    AND (UPPER(descripcion) LIKE '%LATAM%')
  `);

  console.log('✅ Correcciones aplicadas:');
  console.log(`   - Categoría Electrónica creada`);
  console.log(`   - Categoría Vacaciones creada`);
  console.log(`   - Ipanema → Vacile`);
  console.log(`   - LATAM → Vacaciones`);
  console.log(`   - Maxi Technology → Electrónica`);
  console.log(`   - ${r1.rowCount} transacciones Ipanema reasignadas`);
  console.log(`   - ${r2.rowCount} transacciones LATAM reasignadas`);
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
