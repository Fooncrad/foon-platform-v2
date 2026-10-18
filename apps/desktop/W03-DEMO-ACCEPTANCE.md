# W03 — Native demonstration orders (not production POS)

**Status:** Source ready for Windows acceptance tests. This branch is NOT merged, not deployed and NOT tested on Windows yet. W01 native installer and W02 SQLite persistence/authenticated health were separately confirmed by the user on Windows.

## What W03 does

A new dedicated card in the installed Tauri 2 application displays **test orders only**. Click **"إضافة طلب وهمي"** to create a synthetic 9.50 SAR item locally; use the per-order button to move `new → preparing → ready → completed`. Orders list and pending-outbox event counts are fetched by Rust commands. The JavaScript UI neither stores nor receives the gateway bearer token.

**Guardrails in Rust:** commands reject unless `FOON_DESKTOP_DEMO_MODE=1`, a canonical `orders.sqlite` is directly inside a randomly named `FOON-W03-Demo-<32 hex>` directory below the OS temporary folder, the service is local loopback on 8787, the branch is an explicitly generated UUID, and tenant/branch/device/cloud-sync scope environment variables are empty. They return no full order payloads or customer information. Do not set these values for production use. Authenticated health alone does not prove OS process identity, device enrollment, payment settlement or cloud synchronization.

## Test and build outside GitHub Actions

Use [the W03 branch](https://github.com/Fooncrad/foon-platform-v2/tree/feat/foon-windows-w03-demo-orders-20261018) as a **new clean copy**. Do not overwrite W01/W02 source folders. From a PowerShell window within the extracted repository root:

```powershell
node --test .\apps\desktop\desktop-gate.test.mjs .\apps\desktop\w02-sqlite.integration.test.mjs .\apps\desktop\w02-native-health.test.mjs .\apps\desktop\w03-demo-orders.test.mjs
if ($LASTEXITCODE -ne 0) { throw "W03_TESTS_FAILED" }
Set-Location .\apps\desktop
npm install
if ($LASTEXITCODE -ne 0) { throw "W03_NPM_FAILED" }
npm run desktop:build
if ($LASTEXITCODE -ne 0) { throw "W03_BUILD_FAILED" }
```

Target: **22 Node tests** (11 W01 + 1 W02 SQLite + 5 W02 native health + 5 W03 demo), then Rust release/NSIS build. The actual total is determined by the test runner; investigate any failure. A static code review is not a substitute for these execution results.

## Start the demo with automatic cleanup

After closing older FOON Desktop windows and confirming port 8787 is free, run from the same `apps/desktop` folder:

```powershell
.\start-w03-demo.ps1
```

The script creates new random tokens/branch and a throwaway SQLite file, starts the loopback Node gateway, launches Tauri and waits for the app to exit. When it exits, it stops **only the child it started**, clears demo environment variables and deletes its own temp files.

If `PORT_8787_OCCUPIED_STOP_VERIFIED_PRIOR_DEMO_MANUALLY` appears, **stop**. The script will not shut down any pre-existing service. Inspect the owning process first; never kill by guessed PID.

### Required demonstration acceptance

1. App shows W03 test status and a New button only with demo mode active, while W02 health displays an authenticated SQLite response.
2. Create one order through the app; it appears as `new` with 1 pending event. SQLite health counter increases.
3. Change to `preparing` then `ready`, with expected pending counts increasing; no invalid status transition.
4. Close app; automatic cleanup happens and no test credentials or process remain.
5. Without demo mode or with a non-temp database path, **no order actions become enabled**.
6. No production customers, prices, cloud account access or external payments are involved.

**Out of scope:** automatic Windows service startup, company enrollment, shared operator accounts, KDS/printing, real payments or direct customer ordering, offline router menu and receipt-backed cloud synchronization. Each requires separate reviewed implementation and tests.
