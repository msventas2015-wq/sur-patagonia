-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER.
-- Commercial rows are append-only and have no runtime purge path. The
-- anonymous handoff is an optional fixed 400-day memory (v1.6-v1.9), not the
-- ten-year commercial retention policy and never a sliding renewal.

CREATE SEQUENCE private.qr_event_seq_v1 AS bigint NO CYCLE;

CREATE TABLE private.qr_resoluciones_v1 (
  request_id uuid PRIMARY KEY,
  event_seq bigint UNIQUE NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
  payload_key_id text NOT NULL CHECK (payload_key_id='v1'),
  resultado text NOT NULL CHECK (resultado IN (
    'tracked','rate_limited','unknown_or_inactive','channel_inactive','base_destination_invalid'
  )),
  alerta text NULL CHECK (alerta IS NULL OR alerta IN (
    'campaign_overlap_fallback','campaign_destination_fallback'
  )),
  http_status integer NOT NULL,
  destino_seguro text NULL,
  ingreso_id uuid NULL,
  rate_limited_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_resolucion_outcome_v1 CHECK (
    (resultado='tracked' AND http_status=200 AND destino_seguro IS NOT NULL
      AND ingreso_id IS NOT NULL AND rate_limited_until IS NULL)
    OR
    (resultado='rate_limited' AND http_status=429 AND destino_seguro IS NULL
      AND ingreso_id IS NULL AND rate_limited_until IS NOT NULL)
    OR
    (resultado IN ('unknown_or_inactive','channel_inactive','base_destination_invalid')
      AND http_status=404 AND destino_seguro IS NULL
      AND ingreso_id IS NULL AND rate_limited_until IS NULL)
  ),
  CONSTRAINT qr_resolucion_alerta_v1 CHECK (alerta IS NULL OR resultado='tracked'),
  UNIQUE (ingreso_id),
  UNIQUE (request_id,event_seq,payload_hash,payload_key_id,ingreso_id)
);

CREATE TABLE private.qr_ingresos_v1 (
  id uuid PRIMARY KEY,
  event_seq bigint UNIQUE NOT NULL,
  request_id uuid UNIQUE NOT NULL,
  visita_id uuid UNIQUE NOT NULL REFERENCES public.visitas(id) ON DELETE RESTRICT,
  referencia_id uuid NOT NULL REFERENCES public.referencias(id) ON DELETE RESTRICT,
  canal_id uuid NOT NULL REFERENCES public.canales(id) ON DELETE RESTRICT,
  campana_id uuid NULL REFERENCES public.campanas(id) ON DELETE RESTRICT,
  codigo text NOT NULL CHECK (codigo ~ '^[a-z0-9-]{2,80}$'),
  via text NOT NULL CHECK (via IN ('qr','link')),
  destino_base text NOT NULL CHECK (destino_base LIKE '/%' AND destino_base NOT LIKE '//%'),
  destino_efectivo text NOT NULL CHECK (destino_efectivo LIKE '/%' AND destino_efectivo NOT LIKE '//%'),
  destino_fuente text NOT NULL CHECK (
    (destino_fuente='base' AND campana_id IS NULL)
    OR (destino_fuente='campana' AND campana_id IS NOT NULL)
  ),
  pagina text NOT NULL CHECK (pagina IN ('/','/propiedades','/proyectos','/servicios','/propiedad','/proyecto-mini')),
  propiedad_id uuid NULL REFERENCES public.propiedades(id) ON DELETE RESTRICT,
  proyecto_id uuid NULL REFERENCES public.proyectos(id) ON DELETE RESTRICT,
  proyecto_slug_snapshot text NULL,
  landing_id uuid UNIQUE NOT NULL,
  landing_pageview_request_id uuid UNIQUE NOT NULL,
  handoff_hash bytea UNIQUE NOT NULL CHECK (octet_length(handoff_hash)=32),
  handoff_key_id text NOT NULL CHECK (handoff_key_id ~ '^[A-Za-z0-9_-]{1,32}$'),
  handoff_expira timestamptz NOT NULL,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
  payload_key_id text NOT NULL CHECK (payload_key_id='v1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_ingreso_contenido_v1 CHECK (
    (pagina IN ('/','/propiedades','/proyectos','/servicios')
      AND propiedad_id IS NULL AND proyecto_id IS NULL AND proyecto_slug_snapshot IS NULL)
    OR
    (pagina='/propiedad' AND propiedad_id IS NOT NULL
      AND proyecto_id IS NULL AND proyecto_slug_snapshot IS NULL)
    OR
    (pagina='/proyecto-mini' AND propiedad_id IS NULL
      AND proyecto_id IS NOT NULL AND proyecto_slug_snapshot ~ '^[a-z0-9][a-z0-9-]*$')
  ),
  CONSTRAINT qr_ingreso_handoff_fijo_v1 CHECK (handoff_expira=created_at+interval '400 days'),
  UNIQUE (id,request_id,event_seq,payload_hash,payload_key_id)
);

CREATE TABLE private.qr_campana_control_v1 (
  campana_id uuid PRIMARY KEY REFERENCES public.campanas(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version>=1),
  definicion_congelada_at timestamptz NULL,
  congelada_por text NULL CHECK (
    congelada_por IS NULL OR congelada_por IN ('primer_ingreso','primer_token','legacy_seed')
  ),
  congelada_por_ingreso_id uuid NULL UNIQUE,
  archivada_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ultimo_request_id uuid NULL,
  CONSTRAINT qr_campana_control_congelamiento_v1 CHECK (
    (definicion_congelada_at IS NULL AND congelada_por IS NULL
      AND congelada_por_ingreso_id IS NULL)
    OR
    (definicion_congelada_at IS NOT NULL AND congelada_por='primer_ingreso'
      AND congelada_por_ingreso_id IS NOT NULL)
    OR
    (definicion_congelada_at IS NOT NULL
      AND congelada_por IN ('primer_token','legacy_seed')
      AND congelada_por_ingreso_id IS NULL)
  ),
  CONSTRAINT qr_campana_control_archivo_v1 CHECK (
    archivada_at IS NULL OR definicion_congelada_at IS NOT NULL
  )
);

ALTER TABLE private.qr_campana_control_v1
  ADD CONSTRAINT qr_campana_control_ingreso_v1
  FOREIGN KEY (congelada_por_ingreso_id)
  REFERENCES private.qr_ingresos_v1(id)
  ON DELETE RESTRICT;

ALTER TABLE private.qr_resoluciones_v1
  ADD CONSTRAINT qr_resolucion_ingreso_v1
  FOREIGN KEY (ingreso_id,request_id,event_seq,payload_hash,payload_key_id)
  REFERENCES private.qr_ingresos_v1(id,request_id,event_seq,payload_hash,payload_key_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE private.qr_ingresos_v1
  ADD CONSTRAINT qr_ingreso_resolucion_v1
  FOREIGN KEY (request_id,event_seq,payload_hash,payload_key_id,id)
  REFERENCES private.qr_resoluciones_v1(request_id,event_seq,payload_hash,payload_key_id,ingreso_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE private.qr_rate_buckets_v1 (
  scope text NOT NULL CHECK (scope IN (
    'resolver_network_code','resolver_network','resolver_code','pageview_network',
    'contacto_network','contacto_handoff','report_network','report_network_token','report_token'
  )),
  bucket_hash bytea NOT NULL CHECK (octet_length(bucket_hash)=32),
  window_start timestamptz NOT NULL,
  contador integer NOT NULL CHECK (contador>0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope,bucket_hash,window_start)
);

CREATE FUNCTION private.qr_append_only_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  RAISE EXCEPTION 'QR_LEDGER_APPEND_ONLY';
END
$fn$;

CREATE TRIGGER qr_resoluciones_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_resoluciones_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_resoluciones_no_truncate_v1
BEFORE TRUNCATE ON private.qr_resoluciones_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_ingresos_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_ingresos_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_ingresos_no_truncate_v1
BEFORE TRUNCATE ON private.qr_ingresos_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();

REVOKE ALL ON SEQUENCE private.qr_event_seq_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_resoluciones_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_ingresos_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_campana_control_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_rate_buckets_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_append_only_guard_v1() FROM PUBLIC,anon,authenticated,service_role;

-- No runtime EXECUTE/grants or purge routine are supplied by this component.
-- The complete package must additionally protect linked public rows, install
-- the gated owner-only core and prove rollback/reapply in QA.
