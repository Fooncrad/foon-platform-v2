# FOON Windows W20 - native read-only SQLite outbox adapter (synthetic only)

## Current state

W19 passed 49/49 Node and 22/22 Rust tests on the user's Windows machine. W20 is a new isolated proof and HAS NOT been run on Windows yet. It is not a production SQLite replacement.

## What W20 implements

- `src-tauri/src/native_outbox_readonly.rs`: Windows-only Rust reader built against the Windows-provided WinSQLite3 C API, so no additional direct Cargo dependencies are required.
- Uses SQLite OPEN_READONLY and FULLMUTEX with a single hardcoded SELECT joining `outbox` and `events`. Only unsynced rows are included; maximum 32.
- Accepts **only** `events.sqlite` directly inside a unique `FOON-W20-Fixture-` + 32 hexadecimal character child of Windows OS Temp, with canonical-path/symlink/file-size checks. It rejects all W05/W06 merchant paths and any arbitrary database.
- Computes W19 native SHA256 digests from trusted raw JSON payload order. Returns only `outbox_seq`, `event_seq` and digest; not the body, device ID, customer data or keys.
- `w20-temp-outbox-fixture.mjs`: constructs FOUR synthetic events in a new disposable SQLite file (THREE pending and ONE previously ACKed). JS reads and verifies the fixture against known W19 digests. Explicit cleanup is limited to the verified synthetic folder.
- `w20-native-readonly-outbox.test.mjs`: five static Node regression tests for path confinement, SELECT-only behavior, distinct event vs outbox sequence and no Tauri export.
- `run-w20-native-sqlite-tests.ps1`: runs W11–W20 Node regressions, builds a **fresh temporary fixture**, executes native Windows Rust tests offline with that isolated fixture, verifies the SQLite file SHA256 stayed unchanged, checks the W11 commercial bundle gate and removes the synthetic fixture it created.

## Important security boundaries

- This is an isolated **read-only** adapter. It does not authenticate a merchant or authorize an actual Outbox ACK. The reader sees only synthetic events made for W20; no W05/W06 saved SQLite, no W08/W10 MariaDB, no external websites, no real printers.
- No new device token is created or stored; neither real server signing keys nor tenant secrets are involved.
- The `FOON_W20_TEST_DB_PATH` environment variable is used only during the test, and the runner refuses an existing override.
- The Windows-native WinSQLite3 import has not yet been compiled on the user's Windows build. If it is missing or incompatible, fix the adapter without editing saved databases or rerunning one-time MariaDB tests.
- Do not assume this module validates all historical legacy event schemas; W19 raw JSON compaction/ordering and additional cross-language fixtures must be reviewed first.
- TOCTOU between verification and opening a temporary test file is not a security boundary suitable for real merchant databases. The production native service requires OS file handles, ACLs, reliable identity and a separate data-safe migration plan.
- W11 still BLOCKS the old v0.1.4 commercial NSIS installer because it contains cleartext Node `.mjs` server sources. W20 does NOT remove or replace the legacy installer.

## Safe Windows verification

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w20-native-readonly-outbox-20261019
git switch --track origin/feat/foon-windows-w20-native-readonly-outbox-20261019
& ".\apps\desktop\run-w20-native-sqlite-tests.ps1"
```

## After W20

Next: expand native Rust read-only outbox coverage (ordering, WAL recovery, corrupted/legacy rows), compare against JS in an isolated fixture, then design an authorized native database-writer/ACK transaction flow preserving W05/W06 and per-tenant/branch/device scopes. Native business logic and installer hardening are still mandatory before commercial release. Never publish or merge automatically.
