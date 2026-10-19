# FOON Windows W21 - read-only WAL integrity and adversarial outbox fixtures

## Proven baseline

W20 passed **54/54 Node** and **25/25 Windows Rust** tests using a fresh synthetic SQLite fixture; original saved W05/W06 orders and W08/W10 MariaDB remained unchanged. A W11 commercial release audit still blocks distribution because v0.1.4 bundles readable backend .mjs files.

## W21 implementation

- The native WinSQLite3 read-only pending-outbox SELECT now uses a **LEFT JOIN** instead of an INNER JOIN: a pending outbox reference missing its underlying event must produce a hard error instead of being silently dropped from the returned batch.
- An in-memory BTreeSet rejects a repeated event_seq among pending outbox rows. The cap of 32 pending rows and `SQLITE_OPEN_READONLY` remain in force.
- A deliberately **ignored-by-default** Rust test `native_outbox_readonly::tests::w21_fixture_boundary` can run only when given an explicitly created isolated temp fixture by W21's synthetic test driver.
- `w21-native-wal-adversarial.mjs` creates five unique synthetic OS Temp databases, turns on SQLite WAL, keeps the write connection open while invoking Rust, and verifies SHA256 hashes of the main database and its WAL file remain unchanged across the native read.
- The five scenarios are: **active WAL with a newly committed valid event**, **invalid JSON payload**, **orphaned pending reference**, **duplicated pending event reference**, and **33 pending events exceeding the 32-event limit**.
- Cleanup removes only allowlisted files inside that invocation's fresh UUID-named `FOON-W20-Fixture-*` temp directory. It cannot accept any path argument from the user.
- `w21-wal-integrity.test.mjs` contributes six pure static safety checks.
- `run-w21-native-wal-acceptance.ps1` runs cumulative W11-W21 Node tests, the W20 Rust baseline with a fresh disposable file, all five adversarial Rust WAL scenarios and the W11 commercial source-leak gate. The PowerShell source uses ASCII only for compatibility with Windows PowerShell 5.1.

## Not yet completed

**W21 has not been executed on the user's Windows computer yet.** GitHub readback verified code structure and hardcoded safety boundaries only. Native runtime compatibility and read-only WAL behavior must be established by the forthcoming Windows log.

## Scope and limitations

- These tests do not open, ACK, reset, migrate or delete the original W05/W06 3 orders and 12 pending outbox events.
- They do not use the W08/W10 one-time MariaDB writers, production credentials, Hostinger, or the internet.
- Production SQLite ACL and tenant/branch/device authorization, native event writer, transactional ACK, enrollment, physical printers and fully native Windows runtime are still future work.
- The synthetic WAL file read test checks that Rust did not modify the SQLite database/WAL; SQLite may legitimately modify its shared-memory coordination file. Do not confuse this with a guarantee of safety for arbitrary production SQLite files.
- The W11 source exposure scanner **must remain blocking** until JS backend code is no longer shipped in the customer's NSIS file and an extracted-installer audit passes.

## One Windows test command

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w21-wal-integrity-20261019
git switch --track origin/feat/foon-windows-w21-wal-integrity-20261019
& ".\apps\desktop\run-w21-native-wal-acceptance.ps1"
```

If the script reports a failure, do not rerun any W08/W10 write test. W21's synthetic temp fixtures may be inspected or safely recreated independently after any code fixes. No auto-merge, GitHub Actions testing or production deployment.
