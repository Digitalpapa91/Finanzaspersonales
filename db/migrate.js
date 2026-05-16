require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Ejecutando migración...');
    const sql = fs.readFileSync(path.join(__dirname, 'migrate_transacciones.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ Migración completada.');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
