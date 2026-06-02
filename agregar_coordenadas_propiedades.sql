-- Agregar coordenadas a la tabla propiedades
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS latitud NUMERIC,
  ADD COLUMN IF NOT EXISTS longitud NUMERIC;
