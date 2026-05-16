INSERT INTO reglas_categoria (patron, categoria_key, es_ingreso, descripcion_amigable) VALUES
  ('CLAUDE.AI', 'comercio_digital', false, 'Claude.ai (IA)'),
  ('CLAUDE', 'comercio_digital', false, 'Claude.ai (IA)'),
  ('MEGA LIMITED', 'comercio_digital', false, 'Mega.nz'),
  ('NETFLIX', 'comercio_digital', false, 'Netflix'),
  ('SPOTIFY', 'comercio_digital', false, 'Spotify'),
  ('OPENAI', 'comercio_digital', false, 'OpenAI / ChatGPT'),
  ('AMAZON', 'comercio_digital', false, 'Amazon'),
  ('GOOGLE', 'comercio_digital', false, 'Google'),
  ('APPLE', 'comercio_digital', false, 'Apple'),
  ('MICROSOFT', 'comercio_digital', false, 'Microsoft'),
  ('PROMO MASTERCARD', 'otras_transferencias', true, 'Cashback Mastercard')
ON CONFLICT DO NOTHING;
