-- Agrega columna "tema" a la tabla proyectos
-- Pegá esto en el SQL Editor de Supabase y hacé click en Run

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS tema text DEFAULT 'clasico';
