# FOON Windows W07 — isolated signed-ACK sync sandbox

Status: **test-only branch**, not a usable cloud synchronization feature for real merchants.

## Goal

Exercise the full existing trusted Node sync bridge against:
- an actual local SQLite gateway, seeded with disposable dummy orders;
- an *injected fake HTTPS cloud transport* that NEVER makes an Internet request;
- a second disposable SQLite database standing in for the cloud inbox/orders;
- signed server receipts generated only for committed synthetic inbox mutations.

No Tauri app binaries, production MySQL code, keys, W05/W06 files, or the actual Hostinger site are changed by W07. The installed Windows app remains **0.1.4** until an independently tested GUI/cloud integration phase.

## Tests

The W07 integration suite verifies:
1. Disconnected simulated cloud: zero ACKs and four local pending Outbox events;
2. Reconnect: four signed receipts verified and four ACKs written locally; four unique cloud inbox records, one completed order;
3. Duplicate/replayed synchronization: zero additional mutations;
4. Cloud commit followed by lost local ACK: event stays locally pending, cloud receiver reopens persistent sandbox DB, retry gets **original** signed receipt and ACK succeeds without duplicate mutation;
5. A receipt whose HMAC signature is altered is rejected, leaving local event pending until a valid retry;
6. Wrong device, tenant, branch, token, and same idempotency key with a different digest are rejected, without overwriting committed inbox events.

All generated credentials and test databases live within isolated random OS temporary directories and are deleted when their test completes. None are printed or committed. The tests call no actual HTTPS cloud endpoint. The central receiver **does not constitute a production MySQL inbox** or a trusted cloud gateway.

## Windows instructions, reusing existing W06 clone

From a clean checkout in:
C:\Users\ejaan\Desktop\FOON-Windows-W05

    $ErrorActionPreference="Stop"
    Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
    if (git status --porcelain) {throw "LOCAL_CHANGES_FOUND"}
    git fetch origin feat/foon-windows-w07-sync-sandbox-20261018
    if ($LASTEXITCODE -ne 0) {throw "W07_FETCH_FAILED"}
    git switch -c feat/foon-windows-w07-sync-sandbox-20261018 --track origin/feat/foon-windows-w07-sync-sandbox-20261018
    if ($LASTEXITCODE -ne 0) {throw "W07_BRANCH_FAILED"}
    Set-Location ".\apps\desktop"
    .\run-w07-windows.ps1

Expected successful end:
W07 SANDBOX TESTS PASSED
W05/W06 SAVED SQLITE LEFT UNCHANGED
NO PRODUCTION CLOUD OR MYSQL CONTACT

The script runs W01–W07 Node tests and existing bridge/worker tests, then cargo test outside GitHub Actions.

## Not implemented

- Real MySQL inbox and durable, server-side transaction/receipt signing
- Merchant/device enrollment; tenant, branch and operator access on real cloud requests
- Public HTTPS cloud connectivity, DNS pinning, revocation, conflict UI
- Production-grade circuit breakers, retry schedule, monitoring, billing/payment settlement
- Sending or clearing any of the **12 preserved W06 synthetic pending events**
- Windows installer rebuild: W07 is a dedicated simulated sync test addition, not a released application update

Never send the existing W06 pending Outbox entries to any sandbox endpoint. Do not merge, deploy, or enable production syncing on the basis of simulated test results.
