-- ============================================================
-- MIGRACIÓN: Campos para importación de cartola
-- ============================================================

-- Agregar campos a transacciones
ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cartola_hash TEXT,
  ADD COLUMN IF NOT EXISTS es_ingreso BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS numero_doc TEXT;

-- Índice único para deduplicación: misma hash = mismo movimiento
CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_hash ON transacciones(cartola_hash)
  WHERE cartola_hash IS NOT NULL;

-- Tabla de reglas de auto-categorización (por patrón en descripción)
CREATE TABLE IF NOT EXISTS reglas_categoria (
  id SERIAL PRIMARY KEY,
  patron TEXT NOT NULL,           -- texto a buscar en descripción (uppercase)
  categoria_key TEXT REFERENCES categorias(key),
  es_ingreso BOOLEAN DEFAULT FALSE,
  descripcion_amigable TEXT,      -- nombre más legible
  activa BOOLEAN DEFAULT TRUE
);

-- Reglas base de Itaú / comercios comunes Chile
INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable) VALUES
  ('LIDER', 'supermercado', false, 'Líder'),
  ('JUMBO', 'supermercado', false, 'Jumbo'),
  ('UNIMARC', 'supermercado', false, 'Unimarc'),
  ('SANTA ISABEL', 'supermercado', false, 'Santa Isabel'),
  ('ACUENTA', 'supermercado', false, 'Acuenta'),
  ('WALMART', 'supermercado', false, 'Walmart'),
  ('UBER TRIP', 'transporte', false, 'Uber'),
  ('UBER EATS', 'restaurantes', false, 'Uber Eats'),
  ('CABIFY', 'transporte', false, 'Cabify'),
  ('INDRIVER', 'transporte', false, 'InDriver'),
  ('SHELL', 'transporte', false, 'Shell Combustible'),
  ('COPEC', 'transporte', false, 'Copec Combustible'),
  ('ENTEL', 'telecomunicaciones', false, 'Entel'),
  ('WOM', 'telecomunicaciones', false, 'WOM'),
  ('CLARO', 'telecomunicaciones', false, 'Claro'),
  ('MOVISTAR', 'telecomunicaciones', false, 'Movistar'),
  ('MERCADOPAGO', 'comercio_digital', false, 'MercadoPago'),
  ('PAYU', 'comercio_digital', false, 'PayU'),
  ('FLOW', 'comercio_digital', false, 'Flow'),
  ('SODIMAC', 'hogar_articulos', false, 'Sodimac'),
  ('EASY', 'hogar_articulos', false, 'Easy'),
  ('FARMACIA', 'salud', false, 'Farmacia'),
  ('CRUZ VERDE', 'salud', false, 'Cruz Verde'),
  ('SALCOBRAND', 'salud', false, 'Salcobrand'),
  ('AHUMADA', 'salud', false, 'Farmacia Ahumada'),
  ('ENEL', 'servicios_basicos', false, 'Enel'),
  ('AGUAS', 'servicios_basicos', false, 'Agua'),
  ('METROGAS', 'servicios_basicos', false, 'Gas'),
  ('FLIXBUS', 'transporte', false, 'Flixbus'),
  ('LATAM', 'transporte', false, 'LATAM'),
  ('PAGO TARJETA DE CREDITO', 'cuotas_tc_anteriores', false, 'Pago Tarjeta Crédito'),
  ('LIQUID INTERESES PACTADOS', 'costos_financieros_tc', false, 'Intereses LC'),
  ('IMP/SOBREG', 'costos_financieros_tc', false, 'Cargo sobregiro'),
  ('TOKUSPA', 'tokuspa_comunidad', false, 'Tokuspa/Comunidad'),
  ('TRANSFERENCIA DE', 'otras_transferencias', true, 'Transferencia recibida'),
  ('TRANSFERENCIA A', 'otras_transferencias', false, 'Transferencia enviada'),
  ('TRANSF. A', 'otras_transferencias', false, 'Transferencia enviada')
ON CONFLICT DO NOTHING;
