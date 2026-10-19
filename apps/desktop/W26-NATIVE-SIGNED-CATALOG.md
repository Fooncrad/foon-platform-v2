# FOON Windows W26 — native ECDSA P-256 signed catalog verification

## Verified baseline

The user's Windows W25 report ended `W25 ISOLATED TESTS COMPLETE - NO REAL INVENTORY OR PRODUCTION POS CHANGE`. W11 deliberately still blocks the legacy commercial installer containing readable backend Node source.

## W26 scope

- Adds a **native Windows CNG ECDSA P-256** signature verifier for small versioned, scoped, expiring catalog snapshots (`native_signed_catalog.rs`). No asymmetric private key is present in the Rust code or customer binary. No direct Tauri/WebView command.
- Synthetic messages use an explicit `FOON-CATALOG-V1` domain prefix and canonical JSON array including revision, tenant, branch, issued/expiry timestamps and ordered item arrays (ID, price in minor units, currency, enabled, quantity). This avoids JS vs Rust object key-order ambiguity.
- A signature cannot be accepted for the wrong tenant/branch, a prior/equal revision, an expired/future/overlong lease, malformed fields, duplicate IDs, bad currency or tampered stock/price.
- Only a **P-256 public key** is imported into Windows CNG. Node's private key is **generated anew in memory for the acceptance test** and is discarded with the test process. It is not committed, stored on disk, sent to production or provided to the WebView.
- `w26-native-signed-catalog-acceptance.mjs` uses Node `crypto.sign` with `dsaEncoding:'ieee-p1363'` (64-byte r||s), matched to Windows CNG's P-256 verifier. Fifteen isolated acceptance cases include valid, modified price/stock, forged tenant, mismatched trusted scope, expired/future lease, stale revision, excessive lease, duplicate item, unknown field, bad currency, wrong public key and forged signature.
- Six new pure Node static safety tests check Windows-only ECDSA implementation, exact canonical domain/field order, lease/revision guards, public-key-only structure and absence of SQLite/cloud/IPC side effects.
- `run-w26-native-signed-catalog.ps1` runs cumulative W23-W26 Node source checks, focused Rust unit tests, native-probe compilation, all fifteen ephemeral signature cases, and W11's expected commercial release blocker. It does NOT rerun W08/W10 database writers or open any saved database.

## Crucial limitations

**W26 has NOT been executed on Windows yet.** The CNG signature import/verification path and Node-Rust canonical parity require the user's Windows test log. Source-level structural checks do not count as execution.

This is a **verification proof only**; it does not fetch, save or activate a real catalog, nor sign/rotate/revoke real cloud keys. Production must pin the trusted public key(s) independently in the native app or an authenticated enrollment channel. Never trust a public key supplied alongside an untrusted snapshot. Production must also read trusted current time and durable monotonic revision from OS/device storage, not JavaScript or an untrusted server response. Enforce maximum snapshot size and use a tested policy for offline expiry, clock rollback, stock reconciliation and cancellation.

Existing W24/W25 synthetic SQLite writer still only opens freshly created OS-temp fixtures. W26 does not use any database, Outbox ACK, physical printer, cloud, MariaDB or production tenant settings.

Do not modify W05/W06's existing 3 saved synthetic orders and 12 pending Outbox events. Do not rerun W08/W10 one-shot MariaDB writes or deploy/merge automatically. W11 legacy commercial NSIS remains blocked; a passing W23 diagnostic installer inventory is NOT POS authorization.

## Windows test

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w26-signed-catalog-verifier-20261019
git switch --track origin/feat/foon-windows-w26-signed-catalog-verifier-20261019
& ".\apps\desktop\run-w26-native-signed-catalog.ps1"
```

## After W26

Separate work: enroll trusted pinned cloud catalog public keys, use verified revision+lease store on an isolated clone, persist snapshot/stock with an atomic native transaction, and only then expose a guarded authenticated merchant POS flow. No production installation until native printer/sync/backup/migration and extracted-installer security gates pass.
