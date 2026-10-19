#requires -Version 5.1
# W16 synthetic printer acceptance. NO production print driver or DB writes.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w16-print-job-coordinator-20261019") {
    throw "W16_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { throw "W16_NODE24_REQUIRED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W16_TEST_MISSING: $test"
    }
}
Write-Host "W11-W16 PURE AND DISPOSABLE SQLITE TESTS - NO STORED W05/W06 OR MARIADB" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W16_OFFLINE_REGRESSION_FAILED" }
Write-Host "W12 WINDOWS-ONLY RUST DPAPI UNIT TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib windows_secret_store
    if ($LASTEXITCODE -ne 0) { throw "W12_NATIVE_KEY_TESTS_FAILED_OR_CARGO_CACHE_MISSING" }
} finally { Pop-Location }
Write-Host "W11 COMMERCIAL RELEASE PROTECTION AUDIT" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$code = $LASTEXITCODE
if ($code -eq 2) {
    Write-Host "EXPECTED: commercial source-leak gate BLOCKS the extractable v0.1.4 JS installer." -ForegroundColor Yellow
} elseif ($code -ne 0) {
    throw "W11_RELEASE_AUDIT_UNEXPECTED_ERROR"
}
Write-Host "W11-W16 ISOLATED ACCEPTANCE GATES COMPLETED; NO REAL PRINTING OR DEPLOYMENT." -ForegroundColor Green
