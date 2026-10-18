# FOON Windows W08 — existing MySQL sync adapter validation

W08 starts as an **audit and test phase**, not new cloud endpoints or merchant production deployment.

## Why
W07 verified ACK/replay against a disposable SQLite simulation. The project ALREADY has:
- app/api/edge/sync/route.ts (disabled by default via FOON_EDGE_PLAIN_TAKEAWAY_ENABLED)
- lib/platform/edge-sync-http.mjs and edge-device-auth.mjs
- lib/platform/edge-sync-mysql-adapter.mjs and edge-sync-service.mjs
- migrations/0073_edge_sync_inbox.sql and 0075_edge_devices.sql
- scripts/foon-edge-cloud.integration.test.mjs (real MySQL test, requires a separately authorized local fixture database).
Do not duplicate these modules.

## Stage 1: pure cloud-adapter regression tests
Run apps/desktop/run-w08-cloud-adapter-tests.ps1 on the W08 branch. It uses fake database connections, local synthetic SQLite for W07 test, and deliberately does NOT run migrations or contact real MySQL. Tests include authorization, tenant/branch/device isolation, unique inbox keys, replay, receipt signatures, and conflict handling.

## Stage 2: real local MariaDB integration — NOT AUTHORIZED OR EXECUTED YET
A separate local MariaDB database named foon_edge_test on 127.0.0.1 is required. The existing foon-edge-cloud.integration.test.mjs calls scripts/migrate.mjs against that database and creates/drops additional isolated collation fixture databases. Therefore it is MUTATING, not read-only. It must NOT be run against production, any existing merchant dataset, or a database used by unrelated tests.

Before running stage 2:
- Review test code and migration list against the local MariaDB version and privileges.
- Create and explicitly authorize a brand-new, disposable test-only database with no merchant data, restricted to loopback and dedicated credentials.
- Verify the test user cannot access any database except the designated fixtures.
- Never copy or print production DATABASE_URL, device keys, or tokens.
- Run using EDGE_TEST_DATABASE_URL only after explicit operator approval.
- Confirm transaction rollbacks, durable inbox receipts, duplicate replay, device revocation, branch/tenant separation, and proper local ACK behavior.
- Clean only the test fixtures you created and verified. Preserve W05/W06 durable test data and the 12 outstanding Outbox events.

## Not claimed
- A live HTTPS sync connection between FOON Desktop and Hostinger
- Production MySQL ingestion acceptance, schema migration or server key provisioning
- End-to-end real merchant/employee POS workflows
- Safe automatic sync at boot or certified payment reconciliations

No GitHub Actions, automatic merge, production database changes, or deployment.
