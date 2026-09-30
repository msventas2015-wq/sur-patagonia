-- BLINDAJE QR V1.9 COMPONENT.
-- Admin-only, keyset-paginated chronology for facts that can be legitimately
-- linked to one person. It never guesses identity from IP, names or orphaned
-- browser tokens and it is never granted to collaborator roles.

CREATE FUNCTION public.rpc_admin_recorrido_persona_v1(
  p_persona_id uuid,
  p_before_at timestamptz DEFAULT NULL,
  p_before_key text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_rows jsonb; v_limit integer; v_next_at timestamptz; v_next_key text; v_has_more boolean;
BEGIN
  IF NOT private.e2_es_admin_vivo_v6() THEN RAISE EXCEPTION 'E2_ADMIN_VIVO_REQUERIDO'; END IF;
  IF p_persona_id IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>200
    OR (p_before_at IS NULL)<>(p_before_key IS NULL) THEN
    RAISE EXCEPTION 'QR_RECORRIDO_ARGUMENTOS_INVALIDOS';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.personas p WHERE p.id=p_persona_id) THEN
    RAISE EXCEPTION 'QR_RECORRIDO_PERSONA_INEXISTENTE';
  END IF;
  v_limit:=p_limit;
  WITH
  contactos_persona AS (
    SELECT c.* FROM public.contactos c WHERE c.persona_id=p_persona_id
  ),
  ingresos_persona AS (
    SELECT DISTINCT q.ingreso_id
    FROM private.qr_contactos_v1 q
    JOIN contactos_persona c ON c.id=q.contacto_id
    WHERE q.ingreso_id IS NOT NULL
  ),
  hechos AS (
    SELECT
      i.created_at AS ocurrido_at,
      '01-ingreso-'||i.id::text AS orden_key,
      'ingreso'::text AS tipo,
      i.created_at AS registrado_at,
      'ingreso_demostrado_por_consulta'::text AS evidencia,
      jsonb_build_object(
        'ingreso_id',i.id,'event_seq',i.event_seq,'referencia_id',i.referencia_id,
        'canal_id',i.canal_id,'codigo',i.codigo,'via',i.via,'campana_id',i.campana_id,
        'destino',i.destino_efectivo,'pagina',i.pagina,'propiedad_id',i.propiedad_id,
        'proyecto_id',i.proyecto_id,'proyecto_slug',i.proyecto_slug_snapshot
      ) AS detalle
    FROM private.qr_ingresos_v1 i JOIN ingresos_persona x ON x.ingreso_id=i.id

    UNION ALL
    SELECT
      n.created_at,
      '02-navegacion-'||n.request_id::text,
      'navegacion',n.created_at,
      CASE n.resultado WHEN 'landing_absorbed' THEN 'aterrizaje_del_ingreso'
        WHEN 'pageview_tracked' THEN 'navegacion_vinculada' ELSE 'navegacion_registrada' END,
      jsonb_build_object('request_id',n.request_id,'resultado',n.resultado,
        'ingreso_id',n.ingreso_id,'visita_id',n.visita_id,
        'pagina',coalesce(a.path,v.pagina),
        'propiedad_id',coalesce(a.propiedad_id,v.propiedad_id),
        'proyecto_slug',a.proyecto_slug_snapshot)
    FROM private.qr_navegaciones_v1 n
    JOIN ingresos_persona x ON x.ingreso_id=n.ingreso_id
    LEFT JOIN private.qr_aterrizajes_v1 a
      ON a.pageview_request_id=n.request_id AND a.ingreso_id=n.ingreso_id
    LEFT JOIN public.visitas v ON v.id=n.visita_id
    WHERE n.resultado IN ('landing_absorbed','pageview_tracked')

    UNION ALL
    SELECT
      coalesce(c.fecha,c.created_at),
      '03-consulta-'||c.id::text,
      'consulta',c.created_at,
      CASE WHEN q.resultado='contacto_atribuido' THEN 'consulta_con_ingreso_verificado'
        ELSE 'consulta_directa_o_sin_prueba_de_canal' END,
      jsonb_build_object('contacto_id',c.id,'estado',c.estado,'origen',c.origen,
        'propiedad_id',c.propiedad_id,'proyecto_slug',c.proyecto_slug,
        'canal_ref',c.canal_ref,'canal_via',c.canal_via,
        'resultado_qr',q.resultado,'ingreso_id',q.ingreso_id,'consulta_at',q.event_at)
    FROM contactos_persona c
    LEFT JOIN private.qr_contactos_v1 q ON q.contacto_id=c.id

    UNION ALL
    SELECT
      e.fecha_evento,
      '04-crm-'||e.id::text,
      'crm',e.created_at,
      'evento_crm',
      jsonb_build_object('evento_id',e.id,'contacto_id',e.contacto_id,
        'tipo_evento',e.tipo_evento,'estado_anterior',e.estado_anterior,
        'estado_nuevo',e.estado_nuevo,'origen',e.origen,'actor_id',e.actor_id,
        'propiedad_id',e.propiedad_id,'proyecto_slug',e.proyecto_slug,
        'canal_ref',e.canal_ref,'canal_via',e.canal_via,'nota',e.nota,
        'metadata',e.metadata,'fecha_programada',e.fecha_programada)
    FROM public.crm_eventos e
    WHERE e.persona_id=p_persona_id
      OR e.contacto_id IN (SELECT id FROM contactos_persona)

    UNION ALL
    SELECT
      d.created_at,
      '05-destino-'||d.request_id::text,
      'cambio_destino_qr',d.created_at,
      'cambio_posterior_con_historia_preservada',
      jsonb_build_object('request_id',d.request_id,'referencia_id',d.referencia_id,
        'canal_id',d.canal_id,'destino_anterior',d.destino_anterior,
        'destino_nuevo',d.destino_nuevo,'actor_user_id',d.actor_user_id,
        'motivo',d.motivo,'mensaje_id',d.mensaje_id)
    FROM private.qr_destino_cambios_v1 d
    WHERE EXISTS (
      SELECT 1 FROM private.qr_ingresos_v1 i
      JOIN ingresos_persona x ON x.ingreso_id=i.id
      WHERE i.referencia_id=d.referencia_id AND i.created_at<=d.created_at
    )
  ),
  pagina AS (
    SELECT * FROM hechos h
    WHERE p_before_at IS NULL OR (h.ocurrido_at,h.orden_key)<(p_before_at,p_before_key)
    ORDER BY h.ocurrido_at DESC,h.orden_key DESC
    LIMIT v_limit+1
  ),
  entregadas AS (
    SELECT * FROM pagina ORDER BY ocurrido_at DESC,orden_key DESC LIMIT v_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo',tipo,'ocurrido_at',ocurrido_at,'registrado_at',registrado_at,
    'evidencia',evidencia,'detalle',detalle
  ) ORDER BY ocurrido_at DESC,orden_key DESC),'[]'::jsonb),
    (SELECT ocurrido_at FROM entregadas ORDER BY ocurrido_at,orden_key LIMIT 1),
    (SELECT orden_key FROM entregadas ORDER BY ocurrido_at,orden_key LIMIT 1),
    (SELECT count(*)>v_limit FROM pagina)
  INTO v_rows,v_next_at,v_next_key,v_has_more FROM entregadas;

  RETURN jsonb_build_object(
    'persona_id',p_persona_id,
    'items',v_rows,
    'has_more',v_has_more,
    'next_cursor',CASE WHEN v_has_more THEN
      jsonb_build_object('before_at',v_next_at,'before_key',v_next_key) ELSE NULL END
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_admin_recorrido_persona_v1(uuid,timestamptz,text,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_recorrido_persona_v1(uuid,timestamptz,text,integer)
  TO authenticated;
