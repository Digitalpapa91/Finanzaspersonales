-- ============================================================
-- MIGRACIÓN: Tabla de transacciones individuales
-- ============================================================

CREATE TABLE IF NOT EXISTS transacciones (
  id SERIAL PRIMARY KEY,
  mes_id TEXT REFERENCES meses(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL,
  categoria_key TEXT REFERENCES categorias(key) NOT NULL,
  medio_pago TEXT DEFAULT 'cuenta_corriente', -- 'cuenta_corriente' | 'tarjeta_credito' | 'efectivo' | 'transferencia'
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transacciones_mes ON transacciones(mes_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_categoria ON transacciones(categoria_key);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha);

-- sin_categorizar se mantiene solo para datos históricos (desglose)
-- El formulario de transacciones la excluye automáticamente
