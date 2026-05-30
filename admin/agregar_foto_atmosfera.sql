-- Agregar campo foto de atmósfera a la tabla proyectos
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS foto_atmosfera text;
