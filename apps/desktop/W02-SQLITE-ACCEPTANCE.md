# FOON Windows W02 — isolated SQLite persistence gate

Status: **isolated persistence test + native authenticated health screen**. The native Tauri application does NOT start FOON Edge or create orders yet. A passing test is necessary but not sufficient for releasing an offline POS.

## Why this batch

W01 is a Tauri shell and only detects a possible listener on port 8788. Before installing, supervising or trusting a background service on Windows, verify that the **existing** SQLite WAL gateway survives an ordinary process stop and restart, does not duplicate orders, enforces authenticated loopback access and retains unsynchronized outbox events.

## Run on a trusted Windows workstation

This repository branch contains both the desktop and gateway code; the earlier W01 zip alone does **not** contain `scripts/foon-lan-sqlite.mjs`.

```powershell
$path = "$env:USERPROFILE\Desktop\FOON-Windows-W02-source"
git clone --depth 1 --branch feat/foon-windows-w02-sqlite-smoke-20261018 https://github.com/Fooncrad/foon-platform-v2.git $path
if ($LASTEXITCODE -ne 0) { throw "GIT_CLONE_FAILED" }
Set-Location $path
node --test .\apps\desktop\w02-sqlite.integration.test.mjs
```

Requires modern Node with built-in `node:sqlite`. Node 26 may run this test, but **production engine packaging targets Node 24**. Install Node 24 as a private runtime only when W02 packaging is ready; never overwrite global Node solely to run the harness.

This test creates **temporary synthetic credentials and a temporary SQLite file** under the OS temp directory. It starts an authenticated server bound to `127.0.0.1`, creates and transitions a local sample order, checks unauthorized access, replay/idempotency and outbox events, restarts the server against the same database, verifies persistence and finally removes the test files. It makes **no calls** to `nfoodz.com`, does not change the live database, does not seed customer data and does not test cloud synchronization. Never paste operator tokens or real customer information into a terminal transcript.

## W02 stages not completed

- Bundle a vetted Node 24 runtime and necessary Edge/SQLite sources inside the signed installation deliverable.
- Provision a tenant/branch/device after authenticated, audited enrollment from the actual merchant.
- Implement secure per-user/per-device credential storage protected by Windows ACL/DPAPI or equivalent.
- Start/stop a managed Windows child process with crash-recovery, health and version checks; no secret or untrusted command injection.
- Bind the Tauri UI only to an **authenticated** local endpoint. A TCP listener on 8788 is not sufficient identity proof.
- Test actual order issuance and KDS interaction from the desktop UI, offline operation, power-loss recovery, signed cloud acknowledgement and cross-tenant isolation.
- Build and install the updated NSIS on Windows and verify uninstall, upgrade and rollback, plus Node 24 acceptance.

Manual review and test first. No GitHub Actions, auto-merge, automatic Hostinger deployment or production migration.

## W02 native gateway health — follow-up build gate

This unmerged branch adds a native Rust-only read-only check of `http://127.0.0.1:8787/health` using `FOON_LAN_TOKEN` from the **native process environment only**. The token is never returned to JavaScript or printed. The client requires a successful HTTP response with `storage=sqlite-wal-full`; a raw open port is not accepted as proof. A successful bearer response is **not** an OS process identity guarantee.

With the current W01 installer, no gateway credentials or background service are configured, so the expected UI is **"محرك الطلبات غير مهيأ"**. Do not paste production tokens into PowerShell, source code, GitHub, chat, or browser storage merely to make the indicator green.

On Windows, test this precise branch in a **new** folder without overwriting W01/W02:

```powershell
$path = "$env:USERPROFILE\Desktop\FOON-Windows-W02-native"
git clone --depth 1 --branch feat/foon-windows-w02-native-gateway-health-20261018 https://github.com/Fooncrad/foon-platform-v2.git $path
if ($LASTEXITCODE -ne 0) { throw "GIT_CLONE_FAILED" }
Set-Location $path
node --test .\apps\desktop\w02-sqlite.integration.test.mjs .\apps\desktop\w02-native-health.test.mjs
if ($LASTEXITCODE -ne 0) { throw "LOCAL_TESTS_FAILED" }
Set-Location .\apps\desktop
npm install
if ($LASTEXITCODE -ne 0) { throw "NPM_INSTALL_FAILED" }
npm run desktop:build
if ($LASTEXITCODE -ne 0) { throw "WINDOWS_BUILD_FAILED" }
```

**Do not merge** until the six Node test cases and real Windows Rust/NSIS build pass, and the screenshot shows the unconfigured state without exposing any secret. This branch changes only `apps/desktop/`; it must not modify `nfoodz.com`, customer data, store enrollment, or server settings.
