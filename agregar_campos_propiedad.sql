-- Agregar campos nuevos a la tabla propiedades
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS antiguedad TEXT,
  ADD COLUMN IF NOT EXISTS condicion TEXT,
  ADD COLUMN IF NOT EXISTS apto_credito BOOLEAN DEFAULT false;
