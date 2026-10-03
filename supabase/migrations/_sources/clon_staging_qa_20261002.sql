-- QA ONLY. Source: production structural catalog on 2026-10-02. No rows copied.
-- Authorization: Mariano, "avancen con el CLON". Production is never a target.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.propiedades IN SHARE ROW EXCLUSIVE MODE;
DO $identity$ BEGIN
 IF current_database()<>'postgres' OR NOT EXISTS (SELECT 1 FROM private.qa_marca_descartable WHERE singleton AND project_ref='rsjwqmpseknvydistgfr') THEN RAISE EXCEPTION 'QA_IDENTITY_REQUIRED'; END IF;
 IF (SELECT count(*) FROM public.propiedades)<>10 OR (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'[]')) FROM public.propiedades p)<>'cf46653d2b89d3e24315af1e33808b71' THEN RAISE EXCEPTION 'QA_BASELINE_CHANGED'; END IF;
 IF to_regclass('public.captaciones') IS NOT NULL OR to_regclass('private.propiedad_codigo_publico_reserva') IS NOT NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='propiedades' AND column_name IN ('codigo_interno','codigo_publico')) THEN RAISE EXCEPTION 'QA_ADDITIVE_TARGET_ALREADY_EXISTS'; END IF;
 IF to_regprocedure('private.propiedad_codigo_publico_generar_v1(uuid,text,text)') IS NOT NULL OR to_regprocedure('private.propiedad_identidad_guard_v1()') IS NOT NULL THEN RAISE EXCEPTION 'QA_FUNCTION_ALREADY_EXISTS'; END IF;
 IF (SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.propiedades'::regclass AND tgname='propiedades_updated_at')<>'O' OR (SELECT md5(pg_get_functiondef(tgfoid)) FROM pg_trigger WHERE tgrelid='public.propiedades'::regclass AND tgname='propiedades_updated_at')<>md5($timestamp$CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
$timestamp$) THEN RAISE EXCEPTION 'QA_TIMESTAMP_TRIGGER_CHANGED'; END IF;
END $identity$;
CREATE TEMP TABLE clone_prop_baseline ON COMMIT DROP AS SELECT id,md5(to_jsonb(p)::text) hash FROM public.propiedades p;
CREATE TEMP TABLE clone_trigger_baseline ON COMMIT DROP AS SELECT tgname,md5(pg_get_triggerdef(oid)||tgenabled::text) hash FROM pg_trigger WHERE tgrelid='public.propiedades'::regclass AND NOT tgisinternal;

CREATE TABLE "public"."captaciones" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "creado_at" timestamp with time zone DEFAULT now() NOT NULL,
 "operacion" text NOT NULL,
 "tipo" text,
 "zona" text NOT NULL,
 "nombre" text NOT NULL,
 "telefono" text NOT NULL,
 "email" text NOT NULL,
 "comentario" text,
 "fuente" text,
 "origen" text DEFAULT 'web'::text NOT NULL,
 "estado" text DEFAULT 'nueva'::text NOT NULL,
 "notas" text,
 "propiedad_id" uuid,
 CONSTRAINT "captaciones_estado_check" CHECK ((estado = ANY (ARRAY['nueva'::text, 'contactado'::text, 'visitada'::text, 'captada'::text, 'descartada'::text]))),
 CONSTRAINT "captaciones_operacion_check" CHECK ((operacion = ANY (ARRAY['alquilar'::text, 'vender'::text, 'desarrollo'::text]))),
 CONSTRAINT "captaciones_origen_check" CHECK ((origen = ANY (ARRAY['web'::text, 'manual'::text]))),
 CONSTRAINT "captaciones_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."captaciones" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin captaciones" ON "public"."captaciones" AS PERMISSIVE FOR ALL TO "authenticated" USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'rol'::text) = 'admin'::text)) WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'rol'::text) = 'admin'::text));

CREATE POLICY "Insertar captacion web" ON "public"."captaciones" AS PERMISSIVE FOR INSERT TO "anon","authenticated" WITH CHECK ((origen = 'web'::text));

CREATE TABLE "private"."propiedad_codigo_publico_reserva" (
 "codigo_publico" text NOT NULL,
 "propiedad_id" uuid NOT NULL,
 "reservado_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
 CONSTRAINT "propiedad_codigo_publico_reserva_pkey" PRIMARY KEY (codigo_publico),
 CONSTRAINT "propiedad_codigo_publico_reserva_propiedad_id_key" UNIQUE (propiedad_id)
);

-- Deliberately avoid unnecessary anonymous SELECT/UPDATE/DELETE/TRUNCATE grants.
REVOKE ALL ON public.captaciones FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.captaciones TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.captaciones TO authenticated;
GRANT ALL ON public.captaciones TO service_role;
REVOKE ALL ON private.propiedad_codigo_publico_reserva FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.propiedad_codigo_publico_reserva TO service_role;
ALTER TABLE "private"."propiedad_codigo_publico_reserva" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.propiedades ADD COLUMN "codigo_interno" text;

ALTER TABLE public.propiedades ADD COLUMN "codigo_publico" text;

CREATE OR REPLACE FUNCTION private.propiedad_codigo_publico_generar_v1(p_propiedad_id uuid, p_operacion text, p_tipo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_operacion text;
  v_tipo text;
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_sufijo text := '';
  v_candidato text;
  v_intento integer;
  v_i integer;
begin
  select r.codigo_publico
  into v_candidato
  from private.propiedad_codigo_publico_reserva r
  where r.propiedad_id = p_propiedad_id;
  if found then
    return v_candidato;
  end if;

  v_operacion := case pg_catalog.lower(pg_catalog.btrim(coalesce(p_operacion, '')))
    when 'venta' then 'N'
    when 'alquiler' then 'K'
    when 'alquiler_temporario' then 'T'
    else 'Z'
  end;

  v_tipo := case pg_catalog.lower(pg_catalog.btrim(coalesce(p_tipo, '')))
    when 'casa' then 'R'
    when 'departamento' then 'M'
    when 'terreno' then 'V'
    when 'lote' then 'Q'
    when 'local' then 'S'
    when 'oficina' then 'H'
    when 'campo' then 'C'
    when 'galpon' then 'G'
    else 'Z'
  end;

  for v_intento in 1..32 loop
    v_bytes := pg_catalog.decode(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      'hex'
    );
    v_sufijo := '';
    for v_i in 0..4 loop
      v_sufijo := v_sufijo || pg_catalog.substr(
        v_alfabeto,
        (pg_catalog.get_byte(v_bytes, v_i) % pg_catalog.length(v_alfabeto)) + 1,
        1
      );
    end loop;
    v_candidato := v_operacion || v_tipo || '-' || v_sufijo;
    begin
      insert into private.propiedad_codigo_publico_reserva (
        codigo_publico,
        propiedad_id
      ) values (
        v_candidato,
        p_propiedad_id
      );
      return v_candidato;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'PROP_CODIGO_PUBLICO_NO_DISPONIBLE';
end
$function$
;

CREATE OR REPLACE FUNCTION private.propiedad_identidad_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.codigo_publico is not null then
      raise exception 'PROP_CODIGO_PUBLICO_AUTOMATICO';
    end if;
    new.codigo_publico := private.propiedad_codigo_publico_generar_v1(
      new.id,
      new.operacion,
      new.tipo
    );
  elsif old.codigo_publico is distinct from new.codigo_publico then
    raise exception 'PROP_CODIGO_PUBLICO_INMUTABLE';
  end if;

  if new.codigo_interno is not null then
    new.codigo_interno := pg_catalog.regexp_replace(
      pg_catalog.btrim(new.codigo_interno),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if new.codigo_interno = '' then
      new.codigo_interno := null;
    end if;
  end if;
  return new;
end
$function$
;

REVOKE ALL ON FUNCTION private.propiedad_codigo_publico_generar_v1(uuid,text,text),private.propiedad_identidad_guard_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.propiedad_codigo_publico_generar_v1(uuid,text,text),private.propiedad_identidad_guard_v1() TO service_role;
-- Follow the official E2 migration context used by prop_identidad_publica_interna.sql.
-- e2_contexto_abrir_v6 also removes obsolete internal telemetry (>24h).
-- A rehearsal ends in ROLLBACK; a real COMMIT requires authorization for that cleanup.
-- Mariano authorized exactly four obsolete contexts plus four associated marks.
LOCK TABLE private.e2_contextos_v6,private.e2_tocados_v6 IN SHARE ROW EXCLUSIVE MODE;
DO $housekeeping_count$ BEGIN
 IF (SELECT count(*) FROM private.e2_contextos_v6 WHERE opened_at<clock_timestamp()-interval '24 hours')<>4
 OR (SELECT count(*) FROM private.e2_tocados_v6 WHERE txid IN (SELECT txid FROM private.e2_contextos_v6 WHERE opened_at<clock_timestamp()-interval '24 hours'))<>4
 THEN RAISE EXCEPTION 'QA_HOUSEKEEPING_COUNT_CHANGED_STOP_REQUIRES_MARIANO'; END IF;
END $housekeeping_count$;
DO $migration_context$ BEGIN
 PERFORM private.e2_contexto_abrir_v6(null,gen_random_uuid(),'migracion_identidad_propiedad_v1',false);
 IF NOT private.e2_contexto_valido_v6() THEN RAISE EXCEPTION 'PROP_IDENTIDAD_E2_CONTEXTO_INVALIDO'; END IF;
END $migration_context$;
-- Preserve timestamps; all E2/QR guards remain enabled during this additive backfill.
ALTER TABLE public.propiedades DISABLE TRIGGER propiedades_updated_at;
UPDATE public.propiedades SET codigo_publico=private.propiedad_codigo_publico_generar_v1(id,operacion,tipo) WHERE codigo_publico IS NULL;
ALTER TABLE public.propiedades ENABLE TRIGGER propiedades_updated_at;
ALTER TABLE public.propiedades ALTER COLUMN codigo_publico SET NOT NULL;

ALTER TABLE public.propiedades ADD CONSTRAINT "propiedades_codigo_interno_no_vacio_ck" CHECK (((codigo_interno IS NULL) OR (btrim(codigo_interno) <> ''::text)));

ALTER TABLE public.propiedades ADD CONSTRAINT "propiedades_codigo_publico_formato_ck" CHECK ((codigo_publico ~ '^[NKTZ][RMVQSHCGZ]-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'::text));

CREATE UNIQUE INDEX propiedades_codigo_interno_norm_uq ON public.propiedades USING btree (upper(regexp_replace(btrim(codigo_interno), '[[:space:]]+'::text, ' '::text, 'g'::text))) WHERE (codigo_interno IS NOT NULL);

CREATE UNIQUE INDEX propiedades_codigo_publico_uq ON public.propiedades USING btree (codigo_publico) WHERE (codigo_publico IS NOT NULL);

CREATE TRIGGER z90_propiedad_identidad_v1 BEFORE INSERT OR UPDATE OF codigo_publico, codigo_interno ON public.propiedades FOR EACH ROW EXECUTE FUNCTION private.propiedad_identidad_guard_v1();

DO $postcheck$ BEGIN
 IF EXISTS (SELECT 1 FROM clone_prop_baseline b LEFT JOIN public.propiedades p USING(id) WHERE p.id IS NULL OR b.hash<>md5((to_jsonb(p)-'codigo_interno'-'codigo_publico')::text)) OR (SELECT count(*) FROM public.propiedades)<>10 THEN RAISE EXCEPTION 'QA_ORIGINAL_PROPERTY_CHANGED'; END IF;
 IF EXISTS (SELECT 1 FROM clone_trigger_baseline b LEFT JOIN pg_trigger t ON t.tgrelid='public.propiedades'::regclass AND t.tgname=b.tgname WHERE t.oid IS NULL OR b.hash<>md5(pg_get_triggerdef(t.oid)||t.tgenabled::text)) THEN RAISE EXCEPTION 'QA_ORIGINAL_TRIGGER_CHANGED'; END IF;
 IF EXISTS (SELECT 1 FROM public.propiedades WHERE codigo_publico IS NULL) THEN RAISE EXCEPTION 'QA_PUBLIC_CODE_MISSING'; END IF;
END $postcheck$;
NOTIFY pgrst,'reload schema';
SELECT jsonb_build_object('qa_only',true,'property_count',(SELECT count(*) FROM public.propiedades),'original_property_hash',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p)-'codigo_interno'-'codigo_publico' ORDER BY p.id)::text,'[]')) FROM public.propiedades p),'captaciones_rows',(SELECT count(*) FROM public.captaciones),'new_code_reservations',(SELECT count(*) FROM private.propiedad_codigo_publico_reserva)) AS postcheck;
COMMIT;
