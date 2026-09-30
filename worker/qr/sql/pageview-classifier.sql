-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Classifies a real navigation, not a landing ACK. The caller must preserve
-- this transaction until its visit and outcome are written.
CREATE FUNCTION private.qr_pagina_clasificar_v1(
  p_path text,
  p_propiedad_id uuid,
  p_proyecto_slug text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF p_path IN ('/','/propiedades','/proyectos','/servicios')
    AND p_propiedad_id IS NULL AND p_proyecto_slug IS NULL THEN
    RETURN true;
  END IF;

  IF p_path='/propiedad' AND p_propiedad_id IS NOT NULL
    AND p_proyecto_slug IS NULL THEN
    PERFORM 1 FROM public.propiedades p
    WHERE p.id=p_propiedad_id AND p.activa IS TRUE FOR SHARE OF p;
    RETURN FOUND;
  END IF;

  IF p_path='/proyecto-mini' AND p_propiedad_id IS NULL
    AND p_proyecto_slug IS NOT NULL
    AND char_length(p_proyecto_slug)<=120
    AND p_proyecto_slug ~ '^[a-z0-9][a-z0-9-]*$' THEN
    PERFORM 1 FROM public.proyectos p
    WHERE p.slug=p_proyecto_slug AND p.estado='activo' FOR SHARE OF p;
    RETURN FOUND;
  END IF;

  RETURN false;
END
$fn$;

REVOKE ALL ON FUNCTION private.qr_pagina_clasificar_v1(text,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
