#requires -Version 5.1
# W07 tests: disposable mock cloud and local SQLite only.
# No deployment, no real cloud sync, no deletion of W05/W06 user data.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$current = (& git branch --show-current).Trim()
if ($current -ne "feat/foon-windows-w07-sync-sandbox-20261018") {
    throw "W07_BRANCH_REQUIRED"
}

$tests = @(
    ".\desktop-gate.test.mjs",
    ".\w02-sqlite.integration.test.mjs",
    ".\w02-native-health.test.mjs",
    ".\w03-demo-orders.test.mjs",
    ".\w04-launcher.test.mjs",
    ".\w05-durable.test.mjs",
    ".\w05-durable.integration.test.mjs",
    ".\w06-recovery.test.mjs",
    ".\w06-offline.integration.test.mjs",
    ".\w07-sync-sandbox.integration.test.mjs",
    "..\..\scripts\foon-edge-sync-bridge.test.mjs",
    "..\..\scripts\foon-edge-sync-worker.test.mjs"
)

Write-Host "W07 STEP 1 - NODE LOCAL / SIMULATED CLOUD TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W07_NODE_TESTS_FAILED" }

Write-Host "W07 STEP 2 - RUST BASELINE" -ForegroundColor Cyan
Push-Location ".\src-tauri"
try {
    & cargo test
    if ($LASTEXITCODE -ne 0) { throw "W07_RUST_TESTS_FAILED" }
}
finally { Pop-Location }

Write-Host "W07 SANDBOX TESTS PASSED" -ForegroundColor Green
Write-Host "W05/W06 SAVED SQLITE LEFT UNCHANGED" -ForegroundColor Green
Write-Host "NO PRODUCTION CLOUD OR MYSQL CONTACT" -ForegroundColor Green
