#requires -Version 5.1
# FOON W11-W14 consolidated local-only security, sync, print and DPAPI gate.
# No W08/W10 MariaDB writer, no original W05/W06 SQLite, no real printers.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w14-category-print-routing-20261019") {
    throw "W14_BRANCH_REQUIRED"
}
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs"
)
Write-Host "W11-W14 PURE NODE SECURITY, SYNC AND PRINT TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W14_NODE_SECURITY_PRINT_TESTS_FAILED" }
Write-Host "W12 WINDOWS DPAPI RUST TESTS - OFFLINE CARGO" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib windows_secret_store
    if ($LASTEXITCODE -ne 0) { throw "W12_WINDOWS_DPAPI_TESTS_NOT_PASSED" }
} finally { Pop-Location }
Write-Host "W11 SOURCE EXPOSURE AUDIT, EXPECT COMMERCIAL BLOCK" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$auditCode = $LASTEXITCODE
if ($auditCode -eq 2) {
    Write-Host "CURRENT v0.1.4 PACKAGE NOT SAFE FOR COMMERCIAL RELEASE: raw backend source exposed" -ForegroundColor Yellow
} elseif ($auditCode -ne 0) {
    throw "W11_AUDIT_EXECUTION_FAILED"
} else {
    Write-Host "SOURCE HYGIENE CHECK PASSED; STILL NOT IMPOSSIBLE TO REVERSE ENGINEER" -ForegroundColor Yellow
}
Write-Host "W11-W14 LOCAL GATES COMPLETE, NO MERGE OR DEPLOYMENT" -ForegroundColor Green
