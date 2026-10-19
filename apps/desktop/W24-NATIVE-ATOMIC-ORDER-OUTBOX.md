# FOON Windows W24 - native atomic order + event + outbox transaction (isolated)

## Baseline proven on the user's Windows

W23 diagnostic security-probe NSIS built at 2.00 MiB, passed 12/12 initial Node and 19/19 selected Rust tests, then its exact SHA256-pinned installer was extracted and independently inspected with 7-Zip: 8 extracted files, none of the named Node backend scripts, executables, or sensitive extensions detected. This does NOT mean the existing commercial POS app is ready or that compiled code is impossible to reverse engineer.

## W24 implementation

- `src-tauri/src/native_order_outbox.rs` implements one Rust WinSQLite3 transaction for three atomic writes: `orders`, `events` (kind `created`), and unsynced `outbox` referencing the new event sequence.
- Uses `BEGIN IMMEDIATE`, SQLite bound parameters, RAII `ROLLBACK` on all early exits, and `COMMIT` only after all three writes plus W19 event digest checks succeed.
- Enforces session-specific `PRAGMA foreign_keys=ON`, `busy_timeout=5000`, `synchronous=FULL` to preserve foreign keys and durable WAL commits on the native connection rather than trusting Node's connection settings.
- Refuses duplicate order IDs instead of creating duplicate outbox events. This initial stage reports duplicates as conflicts; a future native API should implement a fully specified idempotency-key/intent comparison.
- Checks the tenant/branch/device scope against an authoritative synthetic `scope_lock` table inside the fixture before inserting anything.
- Opens ONLY existing `orders.sqlite` files in a uniquely named `FOON-W24-Fixture-<32 hex>` directory directly under OS Temp, with real-path/symlink/file size validation; there is no SQLite OPEN_CREATE, no arbitrary database path, no Tauri/HTTP command and no production connection.
- `w24-native-order-outbox-acceptance.mjs` creates seven disposable SQLite WAL databases, calls targeted native Rust tests, and verifies that only the successful case contains exactly one order, one matching created event and one unsynced outbox item. Three deliberately injected failures prove rollback after each of the writes, and wrong tenant/branch/device are refused.
- Six additional static Node safety tests check the native guard, path isolation, scope, transaction and continuing W11 commercial block.
- `run-w24-native-order-outbox.ps1` runs isolated W23/W24 Node tests, targeted Rust tests, a native-probe compilation regression check, seven W24 synthetic transaction scenarios and the W11 source exposure audit.

## Boundaries and remaining work

**W24 source is uploaded but its Windows Rust/SQLite tests have not yet run.** Source readback checks are not a substitute for execution. This module is compiled as Windows native code but intentionally not reachable from the actual merchant POS because enrollment, authorization and production DB migration are not finished.

The current payload validation is a STRICTLY TRUSTED-CALLER precondition, not a complete merchant catalog, payment, stock, price or option validator. Business rules and source authorization must be implemented before exposing a real order creation API. The initial fixture-only `scope_lock` is NOT an automatic migration of the existing tenant schema.

Original W05/W06 SQLite containing the 3 synthetic orders and 12 pending Outbox events, local W08/W10 MariaDB, the previous demo Node installer, and Hostinger production remain untouched. No ACK on existing events; no external network, hardware printer or cloud publication.

## Windows test

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w24-native-order-outbox-20261019
git switch --track origin/feat/foon-windows-w24-native-order-outbox-20261019
& ".\apps\desktop\run-w24-native-order-outbox.ps1"
```

Do not rerun the W08/W10 MariaDB one-time writer scripts. The previous W11 commercial source exposure gate must remain blocking, even though the separate W23 diagnostic NSIS passed its extracted-file audit. No GitHub Actions, automatic merge or deployment.

## Next milestone

Build native device enrollment plus a real native merchant database ownership and backup/migration strategy. Only after independent cloned-data tests can this atomic writer be safely exposed by an authenticated UI and connected to receipt-verified Outbox ACK, a native printer daemon, catalog validation and the full desktop POS.
