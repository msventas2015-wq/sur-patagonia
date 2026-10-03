-- QA ONLY. Before any functional use; aborts if pre-existing data changed or new records exist.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.propiedades,public.captaciones,private.propiedad_codigo_publico_reserva IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.qa_marca_descartable WHERE singleton AND project_ref='rsjwqmpseknvydistgfr') THEN RAISE EXCEPTION 'QA_IDENTITY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.captaciones) OR (SELECT count(*) FROM public.propiedades)<>10 OR (SELECT count(*) FROM private.propiedad_codigo_publico_reserva)<>10 OR (SELECT md5(coalesce(jsonb_agg(to_jsonb(p)-'codigo_interno'-'codigo_publico' ORDER BY p.id)::text,'[]')) FROM public.propiedades p)<>'cf46653d2b89d3e24315af1e33808b71' THEN RAISE EXCEPTION 'ROLLBACK_NOT_ALLOWED_AFTER_USE'; END IF;
END $guard$;
DROP TRIGGER z90_propiedad_identidad_v1 ON public.propiedades;
DROP FUNCTION private.propiedad_identidad_guard_v1();
DROP FUNCTION private.propiedad_codigo_publico_generar_v1(uuid,text,text);
ALTER TABLE public.propiedades DROP COLUMN codigo_publico,DROP COLUMN codigo_interno;
DROP TABLE private.propiedad_codigo_publico_reserva;
DROP TABLE public.captaciones;
NOTIFY pgrst,'reload schema';
COMMIT;
