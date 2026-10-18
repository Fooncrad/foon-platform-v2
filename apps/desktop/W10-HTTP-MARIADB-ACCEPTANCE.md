# FOON Windows W10 — localhost HTTP + MariaDB acceptance

This stage follows confirmed W09 on Windows: 24/24 synthetic HTTP/SQLite tests passed.

## Exactly what W10 tests

The test uses:
- Real temporary SQLite gateway (`scripts/foon-lan-sqlite.mjs`) on a random local port.
- Real loopback HTTP receiver (`w10-http-mariadb-receiver.mjs`), running existing production `mysqlEdgeInboxAdapter`, `acceptAndSignEdgeEvent`, device receipt key derivation, and secure event validation.
- Local MariaDB 11.8 (`127.0.0.1:3306/foon_edge_test`) and a dedicated `foon_edge_runner` account.
- Original W08 `edge_sync_inbox`, plus a **new W10-only** test business table `w10_http_fixture_orders` to avoid running the full migration suite. NO real restaurant orders/prices/taxes/payment or production device records.

Before any write, the script requires **exactly** the two existing tables `edge_sync_inbox` and `w08_fixture_orders`, **exactly four** existing rows in each, the known dedicated account, and database-scoped privileges. It stores a digest of the W08 rows and verifies they remain unchanged after the test. Any unexpected state causes a fail-closed stop.

The receiver generates one synthetic order and four events, verifies the following scenarios over **real HTTP and real MariaDB**:
1. Offline receiver leaves four events pending in the temp SQLite Outbox.
2. MySQL durably commits before the HTTP response disappears; no local ACK occurs.
3. Receiver and MySQL pool restart against the same local DB; tampered signed receipt is rejected.
4. Valid signed replay acknowledges exactly four events; final order status is `completed`.
5. HTTP token, tenant, branch, device, digest and duplicate-replay protection reject unauthorized mutations.
6. Original W08 4+4 fixture rows remain intact.

This code does not change the existing `scripts/foon-edge-sync-bridge.mjs` HTTPS production restrictions. The fake HTTPS name `w10-sandbox.invalid` is intercepted **only in the injected test transport** and redirected to `127.0.0.1`. There is no cloud access.

## Run once on Windows

From `C:\Users\ejaan\Desktop\FOON-Windows-W05` after the clean W09 checkout:

```powershell
git fetch origin feat/foon-windows-w10-http-mariadb-20261019
git switch --track origin/feat/foon-windows-w10-http-mariadb-20261019
& ".\apps\desktop\run-w10-all-windows.ps1"
```

The **combined** runner runs W07/W08/W09/W10 **read-only/pure regression tests first**, then the one-time W10 local MariaDB/HTTP fixture, then a separate Node/Rust/Tauri NSIS baseline build gate (if the existing native toolchain and pinned Node resources are present). It then requests the exact confirmation `WRITE W10 LOCAL ONLY`, username `foon_edge_runner` and a hidden local password. W10 creates a single W10 fixture table, writes only synthetic test rows and leaves fixtures for inspection. It NEVER drops tables, grants permissions, or touches W05/W06 preserved SQLite. **DO NOT RERUN** the combined command once the W10 table exists (including after partial failures). If the database test succeeds but the native build later fails, run **only** `apps/desktop/run-w10-native-release-gates.ps1` after resolving the toolchain issue; this native gate makes no test database writes. If it fails, report the exact stage and safe error code before modifying test data.

## What remains before launch

W10 is **not** the live Next.js `/api/edge/sync` endpoint or merchant identity authorization in `edge_devices`. That route requires many tenant, role, catalog, subscription, pricing and audit tables and a separate review of complete platform migrations. The installed FOON Desktop W05/W06 durable instance is NOT cloud enrolled; its 12 original Outbox events remain untouched. The test does not demonstrate Internet outage handling with the installed UI, certified payments, printer routing or live Hostinger sync.

Next gates are: a dedicated migration-scoped disposable staging DB for the full Next.js endpoint and device enrollment; Windows key storage and a safe opt-in enrollment UI; real Windows packaging/install/uninstall, offline/reconnect/upgrade tests; independent tenant/branch and authorized merchant UAT; and human-approved production rollout. None may bypass the test isolation or automatic deployment ban.

No GitHub Actions, automatic merge, or Hostinger changes.

## No claim of finished installed application

Even a green native build is a **v0.1.4 baseline shell installer**; W10 HTTP/MariaDB sync is a test-only Node harness, not a customer-facing Tauri sync button. A production-ready desktop requires user-device enrollment, a permitted staging server, operator roles/policy tests, protected OS key storage, real printer/POS hardware, and merchant acceptance.
