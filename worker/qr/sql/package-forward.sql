-- QA-ONLY TRANSACTIONAL INSTALLER FOR BLINDAJE QR V1.9.
-- Execute with psql -X -v ON_ERROR_STOP=1 and the four variables documented
-- by package-precheck.sql/package-activate.sql. Any failure closes the session
-- with this transaction uncommitted.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
\ir package-precheck.sql
\ir ledger-schema.sql
\ir resolver-concurrency.sql
\ir rate-limit.sql
\ir resolver-read.sql
\ir resolver-register-core.sql
\ir runtime-boundary.sql
\ir campaign-legacy-seed.sql
\ir pageview-ledger.sql
\ir pageview-classifier.sql
\ir pageview-assertion.sql
\ir pageview-core.sql
\ir pageview-ack-core.sql
\ir contact-core.sql
\ir contact-boundary.sql
\ir pageview-boundary.sql
\ir active-destination-contract.sql
\ir p2-active-notification.sql
\ir crm-recorrido-reader.sql
\ir package-activate.sql
\ir package-postcheck.sql
COMMIT;
