-- Agregar campos para foto de fondo y opacidad por proyecto
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS foto_fondo text,
  ADD COLUMN IF NOT EXISTS opacidad_fondo integer DEFAULT 7;
