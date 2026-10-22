# FOON Windows: connected original-site preview (0.3.0)

This package runs the repository's **original Next.js standalone server and React routes**, not a separately reimplemented dashboard. The site keeps its existing translations, styles, database schema, authentication and server-side role checks. Feature behavior remains subject to the local database contents and configured external integrations.

## Build on Windows

Use Node 24 or newer. From the repository root:

```powershell
npm ci
npm run build
cd apps/windows
npm ci
npm test
npm run dist
```

The NSIS installer is written to `apps/windows/dist`. It does not publish, migrate a database, install a database service, register an updater, or change production. Staging refuses existing output to prevent mixed builds; remove only `apps/windows/staged` before rebuilding. Do not build from a checkout containing secrets in build output. The staging gate rejects environment files and common private-key/database extensions.

`npm --prefix apps/windows run test:smoke` is an opt-in Windows integration check requiring MariaDB binaries (default `C:/Program Files/MariaDB 11.8/bin`; override `FOON_TEST_MARIADB_BIN`). It creates its own database directory and Electron profile, applies the real migrations, registers a synthetic store through the original API, opens the dashboard, checks renderer isolation and the encrypted configuration, and relaunches from the vault. It stops its own processes and retains its newly created synthetic fixture for diagnosis. It never opens an installed database service. Set `FOON_WINDOWS_SMOKE_SCREENSHOT` to an output PNG path to capture the dashboard.

## Local setup

Provision a **separate local MySQL/MariaDB database** using the repository's migrations and a local account. Use a dedicated least-privilege runtime database user. Setup accepts only loopback MySQL addresses, preventing accidental configuration against the production database. Existing local databases, credentials and previous FOON installations are not imported or overwritten.

The initial setup asks for the local MySQL URL, checks the local website's database health, and stores the connection configuration using Electron safeStorage (Windows DPAPI). No credentials are exposed to the website renderer. An unreadable vault is preserved and setup requests a replacement; no plaintext fallback is allowed. The preview binds to loopback on port 43871, refuses an already occupied port, isolates the website renderer from Node/IPC, denies new windows and external navigation, and terminates its child server when the app exits.

Open **FOON → Connection settings** (Ctrl+,) to configure an existing installation. The optional cloud endpoint must be a public HTTPS `/api/edge/sync` URL. Select an enrollment file issued by `scripts/provision-edge-device.mjs` on the staging server. Only the native main process reads the file; its token and receipt key are saved inside the DPAPI vault and passed to the trusted local server, never returned through renderer IPC.

## Order connection contract

Apply migration `0156_desktop_sync_outbox.sql` to the separately provisioned local test database, and deploy the reviewed matching server code to **staging** before enabling enrollment. Local tenant, branch, actor and catalog UUIDs must already match staging. This package does not import accounts, password hashes or a cloud database dump, and a cloud grant never creates or promotes a local membership.

The original `createOrder`/`updateOrder` services insert an immutable MySQL outbox event inside the same transaction as the local order. When opted in, the server scheduler owns a per-device MySQL advisory lock, refreshes authenticated catalog identity and action permissions, and submits events in sequence over HTTPS. A valid cloud lease permits offline operations for at most eight hours. An expired/revoked device cannot create more business writes; existing pending data remains intact.

Only a signed receipt bound to the exact device, event sequence, order ID and payload digest marks an event synchronized. Network/ACK loss keeps the original event for bounded backoff and replay. HTTP conflicts stop the stream for review. The original order cards show localized pending/retrying/conflict/synced states. Changed cloud unit prices, currency, full checkout total (including VAT/fees), or previous order status produce conflicts instead of silent repricing/overwrites.

**Supported uplink:** unpaid plain takeaway orders from the enrolled actor, with whole-item quantities and matching restaurant-menu references, plus permitted status transitions. Payments, discounts, choices, guest metadata, delivery/dine-in/reservation/catalog-variant workflows and writes by another actor are retained as explicit review events and are not simplified or falsely ACKed. Conflict resolution remains an operator/development task; no automatic overwrite or discard button is supplied. This is not full bidirectional database synchronization.

Run `npm --prefix apps/windows run test:sync` on Windows after staging a build. It extends the fresh MariaDB/Electron smoke fixture with a second database and a CA-verified local HTTPS cloud handler, tests the real POS API/outbox, lost ACK/restart, revocation rollback, order-state conflict and checkout-total conflict. It does not call a production endpoint.

DPAPI protects the saved connection configuration, **not the MySQL data directory**. Use Windows disk encryption and a separately tested database backup policy. The website's existing encrypted offline POS profiles remain governed by their existing authorization and passphrase rules.

## Delivery limits — review before use

This is an unsigned engineering preview, not commercial readiness. Database provisioning, encrypted database backup/restore, durable upload storage outside the installation, external OAuth/popups/downloads/device permission workflows and signing/update acceptance remain open. Popup navigation, downloads and device permissions are deliberately disabled in this first shell and require scoped implementation and tests.

The packaged standalone server contains distributable JavaScript backend code. ASAR is packaging, not source encryption. This preview does not satisfy the separate native-only distribution/source-confidentiality experiments on the W11–W28 branches. Do not market or ship it as that native product.

**Schema-wide replication and cloud-to-local business-data import are not implemented.** The MySQL order uplink above reuses the existing authenticated Edge API. Existing Edge SQLite/native Windows experiments remain separate; copying their code would not establish schema-wide safe reconciliation. No production deployment or real-account acceptance is implied by the isolated tests.

No claim of full offline module coverage, pixel comparison with production, or successful installation is implied by packaging. See `scripts/FOON-EDGE-SYNC.md` for the existing sync safety contract.
