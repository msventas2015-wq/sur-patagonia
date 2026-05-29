-- Agregar campos tipo de propiedad y financiación
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS tipo_propiedad text,
  ADD COLUMN IF NOT EXISTS financiacion   text;
