# FOON Windows W22 - TEST-ONLY native signed outbox acknowledgement

**Current verified baseline:** W21 passed 60/60 Node, 25/25 standard Windows Rust plus five isolated WAL adversarial Rust cases. The W11 commercial NSIS audit remains blocked due to extractable legacy Node .mjs backend files.

## W22 source

- `src-tauri/src/native_ack_sandbox.rs` is compiled ONLY with `#[cfg(all(test, windows))]`, so its SQLite mutation path is **not shipped in a normal executable**. It has no Tauri WebView command.
- Native code opens only a brand-new `ack-fixture.sqlite` inside an OS Temp subfolder named `FOON-W22-Fixture-` followed by exactly 32 hex digits. It rejects arbitrary merchant database paths and never uses CREATE when opening SQLite.
- The test-only ACK begins `BEGIN IMMEDIATE`, fetches exactly one outbox event, checks `event_seq`, order, tenant, branch, device, prior ACK state, recalculates the W19 digest from trusted event JSON, and verifies the W18 signed receipt with a synthetic W12 DPAPI-wrapped device key. Only then can one prepared UPDATE mark one row synced.
- Any invalid receipt or local scope mismatch aborts and triggers rollback. An injected post-UPDATE error proves that a write preceding a failed commit does not remain durable.
- Replaying an already acknowledged event is rejected and cannot update it twice. SQL arguments use bound parameters.
- No production master keys or real merchant device credentials are used.

## Acceptance cases

`w22-native-ack-adversarial.mjs` constructs nine fresh and isolated synthetic WAL fixtures with an original pending event, an unrelated pending event, and an unrelated previously acknowledged event. It invokes the ignored-by-default Rust synthetic-ACK test for: success plus replay, forced rollback, wrong tenant, wrong branch, wrong device, wrong event sequence, forged signature, changed stored JSON, and missing event. The Node harness verifies only the expected row changes and that unrelated rows remain identical.

`w22-synthetic-ack-safety.test.mjs` adds five pure static safety checks. `run-w22-native-synthetic-ack.ps1` runs W11-W22 regression tests, native baseline with an independently created W20 temporary fixture, nine W22 native transaction cases, and W11 commercial exposure audit. Synthetic databases are deleted only inside their own verified UUID-named temporary directories.

## Not completed

- W22 source and safety structure were read back from GitHub, but **W22 has NOT been run on Windows** yet. Compilation, FFI write support, SQLite WAL transaction behavior and safety assumptions must be verified by the Windows log.
- No durable merchant SQLite ACK has been implemented, migrated, enrolled, synchronized or modified. The W05/W06 3 synthetic saved orders and 12 pending Outbox events, and the W08/W10 local MariaDB fixtures must remain unchanged.
- Real per-device enrollment, branch-scoped issuance/expiry/revocation, Windows credential persistence with ACL review, event-level authorization, exact delivery idempotency and hardware printing are still separate work.
- The current commercial v0.1.4 installer still contains readable backend Node code. W11 blocks distribution and MUST NOT be bypassed.

## Windows validation

```powershell
cd "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w22-native-synthetic-ack-20261019
git switch --track origin/feat/foon-windows-w22-native-synthetic-ack-20261019
& ".\apps\desktop\run-w22-native-synthetic-ack.ps1"
```

Do not rerun one-time W08/W10 MariaDB scripts, share source archives or NSIS installers, run GitHub Actions or merge/deploy to production automatically.
