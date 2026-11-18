-- Preparación aditiva. La vista sirve únicamente la presentación de proyectos activos.
-- Su dueño lee la tabla. La condición de estado es obligatoria para todos los lectores.
CREATE VIEW public.proyectos_publicos_v1 WITH (security_barrier=true) AS
SELECT p.id,p.slug,p.nombre,p.estado,p.categoria,p.tipo_propiedad,p.destacado,p.created_at,
  p.tagline,p.descripcion,p.provincia,p.ciudad,p.descripcion_ubicacion,p.distancia_km,
  p.tipo_acceso,p.acceso_desc,p.latitud,p.longitud,p.hectareas_total,p.cantidad_lotes,
  p.sup_min_m2,p.sup_max_m2,p.zonificacion,p.altura_max,p.fos,p.reglamento_obs,p.servicios,
  p.fecha_entrega,p.cronograma,p.precio_desde,p.precio_hasta,p.monto_reserva,p.condiciones_venta,
  p.financiacion,p.foto_portada,p.fotos,p.foto_atmosfera,p.foto_fondo,p.opacidad_fondo,
  p.video_url,p.masterplan_url,p.brochure_url,p.mapa_imagen_url,p.mapa_zonas,p.mapa_pin_estilo,
  p.mapa_activo,p.plano_activo,p.rep_activo,p.contacto_nombre,p.contacto_whatsapp,p.contacto_email,
  CASE WHEN p.rep_activo IS FALSE THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'nombre',r.item->>'nombre','empresa',r.item->>'empresa','ciudad',r.item->>'ciudad',
      'zona',r.item->>'zona','logo_url',r.item->>'logo_url')) ORDER BY r.pos)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(p.representantes))='array'
      THEN to_jsonb(p.representantes) ELSE '[]'::jsonb END) WITH ORDINALITY r(item,pos)
    WHERE jsonb_typeof(r.item)='object'
  ),'[]'::jsonb) END AS representantes,
  CASE WHEN theme.obj IS NOT NULL THEN (
    SELECT coalesce(jsonb_object_agg(entry.key,
      CASE WHEN entry.key='miniweb' AND jsonb_typeof(entry.value)='object' THEN (
        SELECT coalesce(jsonb_object_agg(m.key,m.value),'{}'::jsonb)
        FROM jsonb_each(entry.value) m
        WHERE m.key IN ('version','bloques','controlBloques','paleta','activa','estilo','selector',
          'ficha','densidad','presentacion','alineacion','altura','columnas','medio','videoActivo',
          'modulos','lotes','recorrido','recursos')
      ) ELSE entry.value END),'{}'::jsonb)::text
    FROM jsonb_each(theme.obj) entry
    WHERE entry.key IN ('paleta','titulo','cuerpo','colorTitulo','colorAccento','colorTexto',
      'colorCuerpo','elementos','miniweb')
  ) WHEN btrim(p.tema) ~ '^[[:alpha:]][[:alnum:]_-]*$'
    AND lower(btrim(p.tema)) NOT IN ('true','false','null') THEN btrim(p.tema) END AS tema
FROM public.proyectos p
CROSS JOIN LATERAL (SELECT CASE WHEN left(btrim(p.tema,E' \t\r\n'),1)='{'
  AND pg_catalog.pg_input_is_valid(p.tema,'jsonb') THEN p.tema::jsonb END AS obj) theme
WHERE p.estado='activo';

REVOKE ALL ON public.proyectos_publicos_v1 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.proyectos_publicos_v1 TO anon,authenticated;
