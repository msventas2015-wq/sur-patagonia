-- Corregir tipo de columna antiguedad (estaba como bigint, debe ser TEXT)
ALTER TABLE propiedades ALTER COLUMN antiguedad TYPE TEXT USING antiguedad::TEXT;
ALTER TABLE propiedades ALTER COLUMN condicion TYPE TEXT USING condicion::TEXT;
