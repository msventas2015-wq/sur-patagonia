\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END
$roles$;
CREATE TABLE public.contactos(id uuid,origen text);
ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insertar contactos" ON public.contactos
  AS PERMISSIVE FOR INSERT TO anon,authenticated
  WITH CHECK (origen='web'::text);
CREATE TEMP TABLE policy_backup(snapshot jsonb NOT NULL);
INSERT INTO policy_backup
SELECT to_jsonb(p) FROM pg_policies p
WHERE p.schemaname='public' AND p.tablename='contactos'
  AND p.policyname='Insertar contactos';
DROP POLICY "Insertar contactos" ON public.contactos;

DO $restore$
DECLARE
  p jsonb;
  roles_sql text;
  using_sql text:='';
  check_sql text:='';
BEGIN
  SELECT snapshot INTO STRICT p FROM policy_backup;
  SELECT string_agg(
    CASE WHEN value='public' THEN 'PUBLIC' ELSE quote_ident(value) END,', '
    ORDER BY ordinality
  ) INTO roles_sql
  FROM jsonb_array_elements_text(p->'roles') WITH ORDINALITY AS r(value,ordinality);
  IF p->>'qual' IS NOT NULL THEN using_sql:=format(' USING (%s)',p->>'qual'); END IF;
  IF p->>'with_check' IS NOT NULL THEN check_sql:=format(' WITH CHECK (%s)',p->>'with_check'); END IF;
  EXECUTE format('CREATE POLICY %I ON public.contactos AS %s FOR %s TO %s%s%s',
    p->>'policyname',p->>'permissive',p->>'cmd',roles_sql,using_sql,check_sql);
END
$restore$;

DO $assert$
DECLARE expected jsonb; actual jsonb;
BEGIN
  SELECT snapshot INTO STRICT expected FROM policy_backup;
  SELECT to_jsonb(p) INTO actual FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename='contactos'
    AND p.policyname='Insertar contactos';
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'policy restore mismatch: expected %, actual %',expected,actual;
  END IF;
END
$assert$;
ROLLBACK;
\echo 'PASS exact contact policy rollback'
