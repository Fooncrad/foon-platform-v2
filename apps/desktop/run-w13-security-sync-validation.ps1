#requires -Version 5.1
# W11-W13 consolidated local-only security and sync acceptance.
# No W08/W10 MariaDB scripts, no stored W05/W06 SQLite, no production network.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w13-opt-in-sync-scheduler-20261019") {
    throw "W13_BRANCH_REQUIRED"
}
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs"
)
Write-Host "W11-W13 SECURITY AND OFFLINE SCHEDULER PURE NODE TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W13_NODE_TESTS_FAILED" }
Write-Host "W12 WINDOWS DPAPI NATIVE TESTS — OFFLINE CARGO" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib windows_secret_store
    if ($LASTEXITCODE -ne 0) { throw "W12_DPAPI_RUST_TESTS_FAILED_OR_DEPENDENCIES_NOT_CACHED" }
} finally { Pop-Location }
Write-Host "W11 COMMERCIAL PACKAGE AUDIT (EXPECT BLOCK IF RAW .mjs STILL BUNDLED)" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$auditCode = $LASTEXITCODE
if ($auditCode -eq 2) {
    Write-Host "EXPECTED W11 COMMERCIAL RELEASE BLOCK: exposed backend source must be migrated" -ForegroundColor Yellow
} elseif ($auditCode -ne 0) {
    throw "W11_AUDIT_EXECUTION_ERROR"
} else {
    Write-Host "W11 FILE HYGIENE PASSED; this is NOT proof against reverse engineering" -ForegroundColor Yellow
}
Write-Host "W11-W13 TEST STAGES COMPLETED. NO PRODUCTION SYNC OR INSTALLER DEPLOYMENT." -ForegroundColor Green
