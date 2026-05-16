require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1. Actualizar Vacile — solo lo íntimo/nocturno
  await pool.query(`
    UPDATE categorias SET
      label = 'Vacile',
      color = '#ec4899',
      descripcion = 'Motel, cabañas, botillerías, bares, salidas nocturnas'
    WHERE key = 'vacile'
  `);

  // 2. Crear Entretención — cine, eventos, conciertos
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('entretencion', 'Entretención', '#f59e0b', 'Cine, conciertos, eventos, espectáculos, parques')
    ON CONFLICT (key) DO UPDATE SET label='Entretención', color='#f59e0b', descripcion='Cine, conciertos, eventos, espectáculos, parques'
  `);

  // 3. Actualizar reglas — Vacile conserva motel/cabañas/botillería
  await pool.query(`
    DELETE FROM reglas_categoria WHERE patron IN ('CINE','TICKETMASTER','PUNTOTICKET','CASINO','LOS CHIQUILLOS')
  `);

  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable) VALUES
      ('MOTEL', 'vacile', false, 'Motel'),
      ('CABANAS', 'vacile', false, 'Cabañas'),
      ('BOTILLERIA', 'vacile', false, 'Botillería'),
      ('CINE', 'entretencion', false, 'Cine'),
      ('TICKETMASTER', 'entretencion', false, 'Ticketmaster'),
      ('PUNTOTICKET', 'entretencion', false, 'PuntoTicket'),
      ('LOS CHIQUILLOS', 'entretencion', false, 'Los Chiquillos'),
      ('TEATRO', 'entretencion', false, 'Teatro'),
      ('CONCIERTO', 'entretencion', false, 'Concierto'),
      ('PARQUE', 'entretencion', false, 'Parque')
    ON CONFLICT DO NOTHING
  `);

  // 4. Reasignar transacciones existentes: cine/eventos → entretencion
  const { rowCount: r1 } = await pool.query(`
    UPDATE transacciones SET categoria_key = 'entretencion'
    WHERE categoria_key = 'vacile'
    AND (
      UPPER(descripcion) LIKE '%CINE%' OR
      UPPER(descripcion) LIKE '%TEATRO%' OR
      UPPER(descripcion) LIKE '%TICKETMASTER%' OR
      UPPER(descripcion) LIKE '%PUNTOTICKET%' OR
      UPPER(descripcion) LIKE '%LOS CHIQUILLOS%'
    )
  `);

  console.log(`✅ Listo:`);
  console.log(`   - Vacile: Motel, Cabañas, Botillerías`);
  console.log(`   - Entretención: Cine, Teatro, Conciertos, Eventos`);
  console.log(`   - ${r1} transacciones reasignadas a Entretención`);
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
