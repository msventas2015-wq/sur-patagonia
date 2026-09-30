-- LOCAL COMPONENT, NOT A MIGRATION/INSTALLER. Requires ledger-schema.sql.
-- A landing ACK absorbs the existing QR ingress; it is never a second visit.

ALTER TABLE private.qr_ingresos_v1
  ADD CONSTRAINT qr_ingreso_landing_snapshot_v1
  UNIQUE(id,landing_id,landing_pageview_request_id,pagina);

CREATE TABLE private.qr_aterrizajes_v1 (
  ingreso_id uuid PRIMARY KEY,
  landing_id uuid UNIQUE NOT NULL,
  pageview_request_id uuid UNIQUE NOT NULL,
  path text NOT NULL CHECK (path IN (
    '/','/propiedades','/proyectos','/servicios','/propiedad','/proyecto-mini'
  )),
  propiedad_id uuid NULL,
  proyecto_slug_snapshot text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_aterrizaje_content_shape_v1 CHECK (
    (path IN ('/','/propiedades','/proyectos','/servicios')
      AND propiedad_id IS NULL AND proyecto_slug_snapshot IS NULL)
    OR (path='/propiedad' AND propiedad_id IS NOT NULL
      AND proyecto_slug_snapshot IS NULL)
    OR (path='/proyecto-mini' AND propiedad_id IS NULL
      AND proyecto_slug_snapshot IS NOT NULL)
  ),
  CONSTRAINT qr_aterrizaje_ingreso_snapshot_v1
    FOREIGN KEY (ingreso_id,landing_id,pageview_request_id,path)
    REFERENCES private.qr_ingresos_v1(
      id,landing_id,landing_pageview_request_id,pagina
    ) ON DELETE RESTRICT,
  UNIQUE (pageview_request_id,ingreso_id)
);

CREATE TABLE private.qr_navegaciones_v1 (
  request_id uuid PRIMARY KEY,
  resultado text NOT NULL CHECK (resultado IN (
    'landing_absorbed','pageview_tracked','pageview_direct',
    'rate_limited','payload_invalid'
  )),
  http_status integer NOT NULL,
  visita_id uuid UNIQUE NULL REFERENCES public.visitas(id) ON DELETE RESTRICT,
  ingreso_id uuid NULL REFERENCES private.qr_ingresos_v1(id) ON DELETE RESTRICT,
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
  payload_key_id text NOT NULL CHECK (payload_key_id='v1'),
  rate_limited_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT qr_navegacion_outcome_v1 CHECK (
    (resultado='landing_absorbed' AND http_status=200 AND visita_id IS NULL
      AND ingreso_id IS NOT NULL AND rate_limited_until IS NULL)
    OR (resultado='pageview_tracked' AND http_status=200 AND visita_id IS NOT NULL
      AND ingreso_id IS NOT NULL AND rate_limited_until IS NULL)
    OR (resultado='pageview_direct' AND http_status=200 AND visita_id IS NOT NULL
      AND ingreso_id IS NULL AND rate_limited_until IS NULL)
    OR (resultado='rate_limited' AND http_status=429 AND visita_id IS NULL
      AND ingreso_id IS NULL AND rate_limited_until IS NOT NULL)
    OR (resultado='payload_invalid' AND http_status=400 AND visita_id IS NULL
      AND ingreso_id IS NULL AND rate_limited_until IS NULL)
  )
);

CREATE FUNCTION private.qr_navegacion_ack_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NEW.resultado='landing_absorbed' AND NOT EXISTS (
    SELECT 1 FROM private.qr_aterrizajes_v1 a
    WHERE a.pageview_request_id=NEW.request_id AND a.ingreso_id=NEW.ingreso_id
  ) THEN RAISE EXCEPTION 'QR_LANDING_ACK_MISMATCH'; END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION private.qr_aterrizaje_ack_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_ingreso private.qr_ingresos_v1%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.qr_navegaciones_v1 n
    WHERE n.request_id=NEW.pageview_request_id AND n.ingreso_id=NEW.ingreso_id
      AND n.resultado='landing_absorbed'
  ) THEN RAISE EXCEPTION 'QR_LANDING_ACK_MISMATCH'; END IF;
  SELECT * INTO v_ingreso FROM private.qr_ingresos_v1
  WHERE id=NEW.ingreso_id;
  IF NOT FOUND
    OR NEW.propiedad_id IS DISTINCT FROM v_ingreso.propiedad_id
    OR NEW.proyecto_slug_snapshot IS DISTINCT FROM v_ingreso.proyecto_slug_snapshot THEN
    RAISE EXCEPTION 'QR_LANDING_CONTENT_MISMATCH';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION private.qr_navegacion_landing_request_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF NEW.resultado IN ('pageview_tracked','pageview_direct','rate_limited')
    AND EXISTS(SELECT 1 FROM private.qr_ingresos_v1
      WHERE landing_pageview_request_id=NEW.request_id) THEN
    RAISE EXCEPTION 'QR_LANDING_REQUEST_NOT_NAVIGATION';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION private.qr_ingreso_landing_request_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM private.qr_navegaciones_v1
    WHERE request_id=NEW.landing_pageview_request_id
      AND resultado IN ('pageview_tracked','pageview_direct','rate_limited')) THEN
    RAISE EXCEPTION 'QR_LANDING_REQUEST_NOT_NAVIGATION';
  END IF;
  RETURN NEW;
END
$fn$;

-- The pageview ledger may point only at the visit actually written for that
-- outcome. A later CRM/admin update cannot silently rewrite that evidence.
CREATE FUNCTION private.qr_navegacion_visita_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v public.visitas%ROWTYPE; i private.qr_ingresos_v1%ROWTYPE;
BEGIN
  IF NEW.resultado NOT IN ('pageview_tracked','pageview_direct') THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.visitas WHERE id=NEW.visita_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_PAGEVIEW_VISIT_MISMATCH'; END IF;
  IF NEW.resultado='pageview_direct' THEN
    IF v.canal_ref IS NOT NULL OR v.canal_via IS NOT NULL THEN
      RAISE EXCEPTION 'QR_PAGEVIEW_VISIT_MISMATCH';
    END IF;
  ELSE
    SELECT * INTO i FROM private.qr_ingresos_v1 WHERE id=NEW.ingreso_id;
    IF NOT FOUND OR v.canal_ref IS DISTINCT FROM i.codigo OR v.canal_via IS NOT NULL THEN
      RAISE EXCEPTION 'QR_PAGEVIEW_VISIT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION private.qr_visita_enlazada_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM private.qr_ingresos_v1 WHERE visita_id=OLD.id)
    OR EXISTS(SELECT 1 FROM private.qr_navegaciones_v1 WHERE visita_id=OLD.id) THEN
    RAISE EXCEPTION 'QR_LINKED_VISIT_IMMUTABLE';
  END IF;
  RETURN OLD;
END
$fn$;

CREATE CONSTRAINT TRIGGER qr_navegacion_ack_guard_v1
AFTER INSERT ON private.qr_navegaciones_v1
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.qr_navegacion_ack_guard_v1();
CREATE CONSTRAINT TRIGGER qr_aterrizaje_ack_guard_v1
AFTER INSERT ON private.qr_aterrizajes_v1
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.qr_aterrizaje_ack_guard_v1();
CREATE CONSTRAINT TRIGGER qr_navegacion_landing_request_guard_v1
AFTER INSERT ON private.qr_navegaciones_v1
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.qr_navegacion_landing_request_guard_v1();
CREATE CONSTRAINT TRIGGER qr_ingreso_landing_request_guard_v1
AFTER INSERT ON private.qr_ingresos_v1
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.qr_ingreso_landing_request_guard_v1();
CREATE CONSTRAINT TRIGGER qr_navegacion_visita_guard_v1
AFTER INSERT ON private.qr_navegaciones_v1
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.qr_navegacion_visita_guard_v1();
CREATE TRIGGER qr_visita_enlazada_guard_v1
BEFORE UPDATE OR DELETE ON public.visitas
FOR EACH ROW EXECUTE FUNCTION private.qr_visita_enlazada_guard_v1();

CREATE TRIGGER qr_aterrizajes_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_aterrizajes_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_aterrizajes_no_truncate_v1
BEFORE TRUNCATE ON private.qr_aterrizajes_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_navegaciones_append_only_v1
BEFORE UPDATE OR DELETE ON private.qr_navegaciones_v1
FOR EACH ROW EXECUTE FUNCTION private.qr_append_only_guard_v1();
CREATE TRIGGER qr_navegaciones_no_truncate_v1
BEFORE TRUNCATE ON private.qr_navegaciones_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.qr_append_only_guard_v1();

REVOKE ALL ON TABLE private.qr_aterrizajes_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.qr_navegaciones_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_navegacion_ack_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_aterrizaje_ack_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_navegacion_visita_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_visita_enlazada_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_navegacion_landing_request_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.qr_ingreso_landing_request_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
