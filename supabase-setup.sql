-- ============================================================
-- SUR PATAGONIA — Setup de base de datos en Supabase
-- Ejecutar este script en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. TABLA PROPIEDADES
CREATE TABLE IF NOT EXISTS propiedades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  precio NUMERIC,
  moneda TEXT DEFAULT 'USD',
  tipo TEXT NOT NULL, -- casa, departamento, terreno, lote, local, oficina
  operacion TEXT NOT NULL, -- venta, alquiler, alquiler_temporario
  ubicacion TEXT,
  ciudad TEXT,
  provincia TEXT DEFAULT 'Neuquén',
  dormitorios INT DEFAULT 0,
  banos INT DEFAULT 0,
  superficie_total NUMERIC,
  superficie_cubierta NUMERIC,
  imagenes TEXT[] DEFAULT '{}',
  destacada BOOLEAN DEFAULT FALSE,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA PROYECTOS (loteos y desarrollos para servicios de video)
CREATE TABLE IF NOT EXISTS proyectos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT, -- loteo, edificio, barrio_cerrado, country
  ubicacion TEXT,
  ciudad TEXT,
  video_url TEXT,
  imagen_portada TEXT,
  estado TEXT DEFAULT 'en_venta', -- en_venta, vendido, en_desarrollo
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA CONTACTOS (mensajes del formulario)
CREATE TABLE IF NOT EXISTS contactos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  mensaje TEXT,
  propiedad_id UUID REFERENCES propiedades(id),
  leido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TRIGGER para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER propiedades_updated_at
  BEFORE UPDATE ON propiedades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER proyectos_updated_at
  BEFORE UPDATE ON proyectos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer propiedades y proyectos activos
CREATE POLICY "Leer propiedades activas" ON propiedades
  FOR SELECT USING (activa = TRUE);

CREATE POLICY "Leer proyectos activos" ON proyectos
  FOR SELECT USING (activo = TRUE);

-- Cualquiera puede insertar contactos
CREATE POLICY "Insertar contactos" ON contactos
  FOR INSERT WITH CHECK (TRUE);

-- Solo usuarios autenticados pueden gestionar todo
CREATE POLICY "Admin propiedades" ON propiedades
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin proyectos" ON proyectos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admin contactos" ON contactos
  FOR ALL USING (auth.role() = 'authenticated');

-- 6. STORAGE BUCKET para imágenes
INSERT INTO storage.buckets (id, name, public)
VALUES ('imagenes', 'imagenes', TRUE)
ON CONFLICT DO NOTHING;

-- Política para que cualquiera pueda ver imágenes
CREATE POLICY "Ver imágenes" ON storage.objects
  FOR SELECT USING (bucket_id = 'imagenes');

-- Solo autenticados pueden subir imágenes
CREATE POLICY "Subir imágenes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'imagenes' AND auth.role() = 'authenticated');

CREATE POLICY "Eliminar imágenes" ON storage.objects
  FOR DELETE USING (bucket_id = 'imagenes' AND auth.role() = 'authenticated');

-- ============================================================
-- FIN DEL SCRIPT
-- Después de ejecutar esto, crear un usuario admin en:
-- Supabase Dashboard → Authentication → Users → Add User
-- ============================================================
