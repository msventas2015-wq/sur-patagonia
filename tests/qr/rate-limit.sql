-- Isolated synthetic PostgreSQL database ONLY. Never run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA private;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.visitas(id uuid PRIMARY KEY);
CREATE TABLE public.canales(id uuid PRIMARY KEY);
CREATE TABLE public.referencias(id uuid PRIMARY KEY);
CREATE TABLE public.campanas(id uuid PRIMARY KEY);
CREATE TABLE public.propiedades(id uuid PRIMARY KEY);
CREATE TABLE public.proyectos(id uuid PRIMARY KEY);
\ir ../../worker/qr/sql/ledger-schema.sql
\ir ../../worker/qr/sql/rate-limit.sql

DO $test$
DECLARE
  v_hash bytea := decode(repeat('aa',32),'hex');
  v_other bytea := decode(repeat('bb',32),'hex');
  v record;
BEGIN
  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'resolver_network_code',v_hash,'2026-09-20 12:00:01+00',2);
  IF v.permitido IS DISTINCT FROM true OR v.contador<>1
    OR v.window_start<>timestamptz '2026-09-20 12:00:00+00'
    OR v.window_end<>timestamptz '2026-09-20 12:01:00+00' THEN
    RAISE EXCEPTION 'resolver_n_minus_1_failed';
  END IF;
  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'resolver_network_code',v_hash,'2026-09-20 12:00:40+00',2);
  IF v.permitido IS DISTINCT FROM true OR v.contador<>2 THEN
    RAISE EXCEPTION 'resolver_n_failed';
  END IF;
  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'resolver_network_code',v_hash,'2026-09-20 12:00:59.999999+00',2);
  IF v.permitido IS DISTINCT FROM false OR v.contador<>3 OR v.retry_after<1 THEN
    RAISE EXCEPTION 'resolver_n_plus_1_failed';
  END IF;
  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'resolver_network_code',v_hash,'2026-09-20 12:01:00+00',2);
  IF v.permitido IS DISTINCT FROM true OR v.contador<>1
    OR v.window_start<>timestamptz '2026-09-20 12:01:00+00' THEN
    RAISE EXCEPTION 'resolver_reset_failed';
  END IF;

  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'contacto_handoff',v_other,'2026-09-20 12:09:59+00',1);
  IF v.window_start<>timestamptz '2026-09-20 12:00:00+00'
    OR v.window_end<>timestamptz '2026-09-20 12:10:00+00' OR v.contador<>1 THEN
    RAISE EXCEPTION 'contact_bin_failed';
  END IF;
  SELECT * INTO v FROM private.qr_rate_consumir_v1(
    'contacto_handoff',v_other,'2026-09-20 12:10:00+00',1);
  IF v.window_start<>timestamptz '2026-09-20 12:10:00+00' OR v.contador<>1 THEN
    RAISE EXCEPTION 'contact_reset_failed';
  END IF;

  IF has_function_privilege('anon',
      'private.qr_rate_consumir_v1(text,bytea,timestamptz,integer)','EXECUTE')
    OR has_function_privilege('authenticated',
      'private.qr_rate_consumir_v1(text,bytea,timestamptz,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'private.qr_rate_consumir_v1(text,bytea,timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'premature_execute_grant';
  END IF;

  BEGIN
    PERFORM * FROM private.qr_rate_consumir_v1('unknown',v_hash,clock_timestamp(),1);
    RAISE EXCEPTION 'scope_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_RATE_SCOPE_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM private.qr_rate_consumir_v1('resolver_network',decode('aa','hex'),clock_timestamp(),1);
    RAISE EXCEPTION 'hash_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_RATE_HASH_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM private.qr_rate_consumir_v1('resolver_network',v_hash,'infinity',1);
    RAISE EXCEPTION 'time_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_RATE_TIME_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM private.qr_rate_consumir_v1('resolver_network',v_hash,clock_timestamp(),0);
    RAISE EXCEPTION 'limit_not_rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'QR_RATE_LIMIT_INVALID' THEN RAISE; END IF;
  END;
END
$test$;

ROLLBACK;
\echo 'PASS local rate-limit fixture; not QA and no runtime grant installed'
