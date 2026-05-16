require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('ropa', 'Ropa', '#a855f7', 'Ropa, calzado, accesorios, vestuario')
    ON CONFLICT (key) DO UPDATE SET label='Ropa', color='#a855f7', descripcion='Ropa, calzado, accesorios, vestuario'
  `);

  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('ZARA', 'ropa', false, 'Zara'),
      ('H&M', 'ropa', false, 'H&M'),
      ('RIPLEY', 'ropa', false, 'Ripley'),
      ('PARIS', 'ropa', false, 'Paris'),
      ('FALABELLA TIENDA', 'ropa', false, 'Falabella Tienda'),
      ('KOMAX', 'ropa', false, 'Komax'),
      ('CALZADO', 'ropa', false, 'Calzado'),
      ('TENNIS', 'ropa', false, 'Tennis'),
      ('ADIDAS', 'ropa', false, 'Adidas'),
      ('NIKE', 'ropa', false, 'Nike'),
      ('FORUS', 'ropa', false, 'Forus'),
      ('LA POLAR', 'ropa', false, 'La Polar'),
      ('TRICOT', 'ropa', false, 'Tricot')
    ON CONFLICT DO NOTHING
  `);

  const { rowCount } = await pool.query(`
    UPDATE transacciones SET categoria_key = 'ropa'
    WHERE categoria_key IS NULL
    AND (
      UPPER(descripcion) LIKE '%ZARA%' OR
      UPPER(descripcion) LIKE '%RIPLEY%' OR
      UPPER(descripcion) LIKE '%KOMAX%' OR
      UPPER(descripcion) LIKE '%CALZADO%' OR
      UPPER(descripcion) LIKE '%TENNIS%' OR
      UPPER(descripcion) LIKE '%TRICOT%' OR
      UPPER(descripcion) LIKE '%LA POLAR%' OR
      UPPER(descripcion) LIKE '%FORUS%'
    )
  `);

  console.log('✅ Categoría Ropa creada.');
  console.log(`   ${rowCount} transacción(es) reasignada(s).`);
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
