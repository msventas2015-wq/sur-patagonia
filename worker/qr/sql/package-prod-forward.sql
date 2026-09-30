-- Production installation in compatibility mode. No legacy browser ACL is
-- removed here; public cutover and hardening are separate operations.
-- Requires an explicit production authorization and fresh catalogue precheck.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='7s';
SET LOCAL statement_timeout='110s';
\ir package-prod-precheck.sql
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
\ir package-prod-activate.sql
\ir package-prod-postcheck.sql
COMMIT;
