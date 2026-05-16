require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('vacile', 'Vacile / Entretención', '#ec4899', 'Salidas, bares, eventos, cine, conciertos, motel, cabañas, ocio')
    ON CONFLICT (key) DO UPDATE SET label='Vacile / Entretención', color='#ec4899'
  `);
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('MOTEL', 'vacile', false, 'Motel'),
      ('CABANAS MARVENTO', 'vacile', false, 'Cabañas Marvento'),
      ('BOTILLERIA PERELY', 'vacile', false, 'Botillería Perely'),
      ('LOS CHIQUILLOS', 'vacile', false, 'Los Chiquillos'),
      ('CINE', 'vacile', false, 'Cine'),
      ('TICKETMASTER', 'vacile', false, 'Ticketmaster'),
      ('PUNTOTICKET', 'vacile', false, 'PuntoTicket'),
      ('CASINO', 'vacile', false, 'Casino')
    ON CONFLICT DO NOTHING
  `);
  // Reasignar transacciones que ya fueron categorizadas como "otras_transferencias" pero son vacile
  await pool.query(`
    UPDATE transacciones SET categoria_key = 'vacile'
    WHERE categoria_key = 'otras_transferencias'
    AND (
      UPPER(descripcion) LIKE '%MOTEL%' OR
      UPPER(descripcion) LIKE '%CABANAS%' OR
      UPPER(descripcion) LIKE '%BOTILLERIA%'
    )
  `);
  console.log('✅ Categoría Vacile agregada con reglas y transacciones reasignadas.');
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
