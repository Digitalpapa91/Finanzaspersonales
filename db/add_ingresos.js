require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Agregar categoría Aportes
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('aportes', 'Aportes', '#10b981', 'Aportes personales, depósitos, transferencias recibidas')
    ON CONFLICT (key) DO UPDATE SET label='Aportes', color='#10b981', descripcion='Aportes personales, depósitos, transferencias recibidas'
  `);

  // Agregar categoría Venta de productos
  await pool.query(`
    INSERT INTO categorias (key, label, color, descripcion)
    VALUES ('venta_productos', 'Venta de productos', '#8b5cf6', 'Ventas de productos, ingresos por ventas')
    ON CONFLICT (key) DO UPDATE SET label='Venta de productos', color='#8b5cf6', descripcion='Ventas de productos, ingresos por ventas'
  `);

  // Agregar reglas para Aportes
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('APORTE', 'aportes', true, 'Aporte'),
      ('DEPOSITO', 'aportes', true, 'Depósito'),
      ('TRANSFER RECIBIDA', 'aportes', true, 'Transferencia recibida'),
      ('SALARIO', 'aportes', true, 'Salario'),
      ('BONIFICACION', 'aportes', true, 'Bonificación'),
      ('ABONO DESDE', 'aportes', true, 'Abono')
    ON CONFLICT DO NOTHING
  `);

  // Agregar reglas para Venta de productos
  await pool.query(`
    INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable)
    VALUES
      ('VENTA', 'venta_productos', true, 'Venta'),
      ('MERCADOPAGO INGRESO', 'venta_productos', true, 'MercadoPago - Ingreso'),
      ('PAYPAL', 'venta_productos', true, 'PayPal'),
      ('STRIPE', 'venta_productos', true, 'Stripe')
    ON CONFLICT DO NOTHING
  `);

  console.log('✅ Categorías Aportes y Venta de productos agregadas con reglas.');
  await pool.end();
}

run().catch(e => { console.error('❌', e.message); pool.end(); });
