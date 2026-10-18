# W06 — SQLite offline and crash recovery validation (FOON Desktop 0.1.4)

**Unmerged Windows test branch; NOT production POS or live cloud synchronization.**
Base: W05 saved synthetic SQLite, preserving data in:
%LOCALAPPDATA%\com.foon.desktop\w05-durable-test\orders.sqlite

## What is added

1. Explicit, native **W06 SQLite integrity** button runs ONLY while the W05 gateway is stopped. It runs a standalone bundled Node 24 inspector in read-only mode: PRAGMA integrity_check, PRAGMA foreign_key_check, and counts saved orders, events and unsynced Outbox events. Renderer receives counts, not DB path or tokens. It refuses an occupied 8787 port or locked DB. It never repairs, drops, migrates or deletes user data.
2. W06 disposable integration tests intercept *external outbound TCP* in test-only gateway child, create 25 dummy orders (100 Outbox events after status transitions), replay duplicates, simulate child SIGKILL, verify database integrity, restart with new token and confirm all unsynced events survived.
3. Corrupted fixture must fail the read-only check without file modifications.

## Windows local update (existing W05 clone)

Do not re-download a ZIP, delete W05 saved data or merge into main.

    $ErrorActionPreference="Stop"
    Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
    git status --short
    git fetch origin feat/foon-windows-w06-offline-recovery-20261018
    if ($LASTEXITCODE -ne 0) { throw "W06_FETCH_FAILED" }
    git switch -c feat/foon-windows-w06-offline-recovery-20261018 --track origin/feat/foon-windows-w06-offline-recovery-20261018
    if ($LASTEXITCODE -ne 0) { throw "W06_SWITCH_FAILED" }
    Set-Location .\apps\desktop
    .\run-w06-windows.ps1

Stop if the git working tree has changes; never overwrite your local work. The run script performs all baseline and W06 Node tests, verifies Node 24, bundles the read-only inspector, runs cargo test, and builds NSIS 0.1.4. Do not claim pass unless Windows output proves it.

## On-device acceptance

1. Stop W05 and close existing FOON Desktop, leaving the saved W05 SQLite file untouched.
2. Install the built 0.1.4 x64 NSIS installer.
3. BEFORE starting W05, click **فحص سلامة قاعدة W05 المحفوظة**; expect healthy storage, saved order count and unsynced event count (from the old example at least one synthetic order and four unsynced events).
4. Start W05; confirm the old order ID/status still match. Stop W05 with retained data.
5. Manually disconnect Wi-Fi/Ethernet if convenient. Start W05, add a NEW dummy order, complete it and confirm four additional Outbox events. This does NOT trigger any online sync.
6. Stop W05, reconnect your Wi-Fi/Ethernet and run the read-only W06 integrity check again.

## Boundaries

This phase does not certify physical power-loss recovery or real restaurant production operations. Node process SIGKILL and a test-time outbound TCP guard are controlled simulations, not a true disconnect certification. A crashed parent app might leave an unknown Node child listening on 8787; the launcher refuses takeover/kill of unknown listeners. No cloud MySQL ingestion, durable ACK validation, device registration, offline card payment, printers, network QR, Windows boot service or merchant login is included. No production DB changes, no GitHub Actions reliance, no merge, no Hostinger deployment.
