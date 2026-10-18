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

## Stage 1.5: read-only local MariaDB readiness check
Run `apps/desktop/run-w08-mariadb-preflight.ps1` from the W08 branch after creating a **brand-new, empty** local database called `foon_edge_test` and a dedicated non-root account with privileges only on `foon_edge_test.*`. The password is requested hidden by PowerShell; never paste it into chat or git.

The script first tests its fail-closed URL checks, verifies that port 3306 is listening locally, then opens a short-lived *read-only* MySQL connection solely to validate the selected database, scoped grants, empty schema and server version. It explicitly refuses any existing schema (including `schema_migrations`), global write grants, other database grants, root, remote hosts, and unexpected ports. A failed preflight MUST NOT be "fixed" by pointing it to `foon_v2_test`, Hostinger, a populated developer database, or by running migrations.

Example of **intended manual, local administrator-only setup** (not performed by this task; replace the placeholder with a strong private password chosen locally):

```sql
CREATE DATABASE foon_edge_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'foon_edge_runner'@'127.0.0.1' IDENTIFIED BY '<LOCAL_PRIVATE_PASSWORD>';
GRANT ALL PRIVILEGES ON foon_edge_test.* TO 'foon_edge_runner'@'127.0.0.1';
```

Do not run those statements against remote/Hostinger servers. If the database or user already exists, inspect first rather than overwriting it; do not delete any existing databases. Granting `*.*` is forbidden.

On MariaDB 11.8, SHOW GRANTS may include inherited `TO PUBLIC` grants on `test` and the escaped `test\\_%` fixture prefix even when the dedicated account has no direct grants outside `foon_edge_test`. The read-only W08 checker explicitly recognizes **only these two exact PUBLIC test namespaces**, prints a warning, and rejects unknown PUBLIC scopes, direct grants on any other database, any account-level global privileges, and an account recipient other than `foon_edge_runner`. No server-level grant changes are needed for the read-only preflight. PUBLIC rights are still real inherited rights and are NOT evidence of complete account isolation.

The stage 1.5 result is only a readiness check. **Passing does not authorize any migration or mutation.** Stage 2 remains blocked: the pre-existing integration test creates/drops an extra `foon_edge_collation_*` database and may require global CREATE DATABASE, which this safety gate intentionally forbids. Do not grant global privileges just to make the old test pass. First refactor Stage 2 to stay within owned disposable fixture namespaces with separately reviewed credentials.

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
