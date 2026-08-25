-- ══════════════════════════════════════════════════════════════
-- MAPA INTERACTIVO DE LOTES — migración SQL
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar imagen del mapa a la tabla proyectos
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS mapa_imagen_url TEXT;

-- 2. Agregar coordenadas y zona a la tabla lotes
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS mapa_x FLOAT;   -- porcentaje 0-100 del ancho de la imagen
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS mapa_y FLOAT;   -- porcentaje 0-100 del alto de la imagen
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS tipo_lote VARCHAR(50); -- Laguna / Bosque / Río / Complejo turístico
