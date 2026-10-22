# FOON Windows: original-site preview

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

DPAPI protects the saved connection configuration, **not the MySQL data directory**. Use Windows disk encryption and a separately tested database backup policy. The website's existing encrypted offline POS profiles remain governed by their existing authorization and passphrase rules.

## Delivery limits — review before use

This is an unsigned engineering preview, not commercial readiness. Database provisioning, encrypted database backup/restore, durable upload storage outside the installation, external OAuth/popups/downloads/device permission workflows and signing/update acceptance remain open. Popup navigation, downloads and device permissions are deliberately disabled in this first shell and require scoped implementation and tests.

The packaged standalone server contains distributable JavaScript backend code. ASAR is packaging, not source encryption. This preview does not satisfy the separate native-only distribution/source-confidentiality experiments on the W11–W28 branches. Do not market or ship it as that native product.

The existing website offline POS/API code is bundled unchanged. **Replication of the local MySQL database to the cloud is not implemented.** Existing Edge SQLite/native Windows experiments are on separate development branches; copying their code into this package would not establish schema-wide safe reconciliation. Do not import real customer data or enable cloud synchronization before authenticated identity, branch/role isolation, conflict handling, signed durable receipts and restart/replay tests pass end to end.

No claim of full offline module coverage, pixel comparison with production, or successful installation is implied by packaging. See `scripts/FOON-EDGE-SYNC.md` for the existing sync safety contract.
