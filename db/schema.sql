-- ============================================================
-- ESQUEMA FINANZAS APP — PostgreSQL
-- ============================================================

-- Categorías disponibles
CREATE TABLE IF NOT EXISTS categorias (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  descripcion TEXT
);

-- Meses del historial
CREATE TABLE IF NOT EXISTS meses (
  id TEXT PRIMARY KEY,           -- ej: "2025-01"
  label TEXT NOT NULL,           -- ej: "Enero 2025"
  gasto_real INTEGER NOT NULL,
  mes_abierto BOOLEAN DEFAULT FALSE,
  ingresos_extras INTEGER DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Desglose por categoría de cada mes
CREATE TABLE IF NOT EXISTS desglose (
  id SERIAL PRIMARY KEY,
  mes_id TEXT REFERENCES meses(id) ON DELETE CASCADE,
  categoria_key TEXT REFERENCES categorias(key),
  monto INTEGER NOT NULL DEFAULT 0
);

-- Costos financieros por mes
CREATE TABLE IF NOT EXISTS costos_financieros (
  mes_id TEXT PRIMARY KEY REFERENCES meses(id) ON DELETE CASCADE,
  tc INTEGER DEFAULT 0,
  lc INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);

-- Alertas por mes
CREATE TABLE IF NOT EXISTS alertas_mes (
  id SERIAL PRIMARY KEY,
  mes_id TEXT REFERENCES meses(id) ON DELETE CASCADE,
  texto TEXT NOT NULL
);

-- Alertas globales
CREATE TABLE IF NOT EXISTS alertas_globales (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,            -- 'rojo' | 'amarillo' | 'verde'
  titulo TEXT NOT NULL,
  detalle TEXT NOT NULL,
  impacto TEXT NOT NULL,
  estado TEXT NOT NULL
);

-- Cuotas TC activas
CREATE TABLE IF NOT EXISTS cuotas_activas (
  id SERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  cuota INTEGER NOT NULL,
  cuotas_restantes INTEGER NOT NULL,
  total_pendiente INTEGER NOT NULL,
  fin TEXT NOT NULL,
  prioridad TEXT NOT NULL        -- 'alta' | 'media' | 'baja'
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_desglose_mes ON desglose(mes_id);
CREATE INDEX IF NOT EXISTS idx_alertas_mes_id ON alertas_mes(mes_id);
