-- ============================================================
-- Sur Patagonia — Agregar columnas faltantes a tabla proyectos
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- Todas usan IF NOT EXISTS, se puede correr más de una vez sin error
-- ============================================================

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS foto_atmosfera  text,
  ADD COLUMN IF NOT EXISTS foto_fondo      text,
  ADD COLUMN IF NOT EXISTS opacidad_fondo  integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS tipo_propiedad  text,
  ADD COLUMN IF NOT EXISTS financiacion    text,
  ADD COLUMN IF NOT EXISTS tema            text DEFAULT 'clasico';
