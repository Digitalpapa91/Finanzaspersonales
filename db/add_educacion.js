require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('educacion', 'Educación', '#6366f1', 'Colegios, universidades, cursos, libros, capacitaciones')
    ON CONFLICT (key) DO UPDATE SET label='Educación', color='#6366f1'
  `);
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('UDEMY', 'educacion', false, 'Udemy'),
      ('COURSERA', 'educacion', false, 'Coursera'),
      ('DUOLINGO', 'educacion', false, 'Duolingo'),
      ('PLATZI', 'educacion', false, 'Platzi'),
      ('ACADEMIA', 'educacion', false, 'Academia'),
      ('UNIVERSIDAD', 'educacion', false, 'Universidad'),
      ('COLEGIO', 'educacion', false, 'Colegio')
    ON CONFLICT DO NOTHING
  `);
  console.log('✅ Categoría Educación agregada con reglas.');
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
