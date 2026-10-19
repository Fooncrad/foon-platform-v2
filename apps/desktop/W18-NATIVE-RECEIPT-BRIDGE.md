# FOON W18 - Native protected credential + cloud receipt verification path

## Completed in source (not yet tested on Windows)

- `src-tauri/src/protected_receipt_path.rs` ties two earlier Windows-native components: W12 DPAPI `CURRENT_USER` unsealing and W17 CNG HMAC-SHA256 receipt verification.
- Native verification uses a temporary `DeviceSecret` which zeroizes its buffer on `Drop` and cannot be read by WebView. This module has **no Tauri command**.
- Requires the expected device ID, order ID, event sequence and event digest, then verifies the cryptographic receipt signature. No actual Outbox ACK is performed.
- Four new Rust tests cover: valid synthetic receipt, changed scope, altered signed fields, wrong or damaged DPAPI ciphertext, invalid/oversized JSON.
- Four Node static tests check native-only registration, data flow, absence of secret storage/network/export, and coverage.
- ASCII-only `run-w18-offline-acceptance.ps1` will rerun W11-W18 read-only/pure/temporary-DB checks and Windows Rust tests, then confirm W11 **still blocks** commercial release.
- Verified the committed source structure and expected checks through GitHub source readback; **actual W18 Node and Rust suites need Windows execution**.

## Security and compatibility boundaries

- W17 signed receipt verifier **is not a substitute** for independently deriving the event digest from the trusted local outbox. The caller must verify current tenant/branch/device authorization, event state and digest prior to ANY ACK.
- Per-device symmetric keys provide integrity under device-scoped trust, but cannot stop an attacker running as that Windows user from decrypting/abusing the local credential. DPAPI is an at-rest control, not DRM or isolation from a fully compromised user.
- No enrollment or local key file has been implemented; W18 only accepts a W12 ciphertext object already created in native Rust.
- The original W05/W06 persistent SQLite, W08/W10 local MariaDB fixtures, network credentials, Hostinger and production are not opened or changed.
- The old v0.1.4 NSIS still includes clear-text Node `.mjs` backend sources, so the W11 commercial release **must remain blocked**. W18 does not remove or overwrite that runtime.

## Windows acceptance command

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w18-protected-receipt-path-20261019
git switch --track origin/feat/foon-windows-w18-protected-receipt-path-20261019
& ".\apps\desktop\run-w18-offline-acceptance.ps1"
```

Do **not** rerun one-time W08/W10 MariaDB integrations, publish or distribute NSIS, use CI for verification, or auto-merge.

## Remaining before an actual proprietary Windows deployment

1. Move event digest computation and trusted SQLite WAL/outbox state machine into native Rust with rigorous serialization parity and recovery tests. Keep the W05/W06 DB unchanged until a separate backup + authorized migration plan exists.
2. Implement server-issued, revocable, expiring tenant+branch+device enrollment and a DPAPI ciphertext file store with strict Windows ACLs; never embed production signing master keys in the executable.
3. Wire the native receipt verifier into real outbox ACK transaction only after trusted state validation, replay protection and offline recovery staging tests.
4. Replace bundled Node gateway business logic with a native executable/service, rerun W11 on actual NSIS **including content extraction**, audit WebView permissions and scripts, sign installer, and approve release manually.
5. Wire the POS/KDS printer workers to real authorized Windows hardware and separate customer/platform invoice printers under audited roles.
