-- ============================================================
-- SUR PATAGONIA — Tabla site_config
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS site_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  label TEXT,
  tipo  TEXT DEFAULT 'imagen' -- 'imagen' | 'video' | 'tipografia'
);

-- Habilitar RLS
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública (el sitio web la necesita)
CREATE POLICY "Lectura pública" ON site_config
  FOR SELECT USING (true);

-- Solo usuarios autenticados pueden modificar
CREATE POLICY "Solo admin puede modificar" ON site_config
  FOR ALL USING (auth.role() = 'authenticated');

-- ── Valores iniciales ─────────────────────────────────────────

INSERT INTO site_config (key, value, label, tipo) VALUES
  -- Imágenes
  ('img_hero_scroll_1',    'assets/127.jpg',             'Scroll imagen 1',        'imagen'),
  ('img_hero_scroll_2',    'assets/DJI_0113.jpg',        'Scroll imagen 2',        'imagen'),
  ('img_hero_scroll_3',    'assets/13.jpg',              'Scroll imagen 3',        'imagen'),
  ('img_hero_scroll_4',    'assets/a.jpg',               'Scroll imagen 4',        'imagen'),
  ('img_servicios_bg',     'assets/DESEMBOQUE-24.jpg',   'Fondo Nuestros Servicios','imagen'),
  ('img_stats_bg',         'assets/17.jpg',              'Fondo sección estadísticas','imagen'),
  ('img_acordeon_comprar', 'assets/DJI_0269.jpg',        'Acordeón — Comprá',      'imagen'),
  ('img_acordeon_alquiler','assets/127.jpg',             'Acordeón — Alquilá',     'imagen'),
  ('img_acordeon_prop',    'assets/DESEMBOQUE-24.jpg',   'Acordeón — Propietario', 'imagen'),

  -- Videos YouTube (solo el ID)
  ('video_hero',           'VMkGpUK7E2Q',                'Video Hero (ID YouTube)', 'video'),
  ('video_audiovisual',    '7bxKpIxdhXU',                'Video Audiovisual (ID YouTube)', 'video'),

  -- Tipografía títulos
  ('font_titulos',         'Cormorant Garamond',         'Tipografía títulos',     'tipografia')

ON CONFLICT (key) DO NOTHING;
