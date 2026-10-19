#requires -Version 5.1
# W19 Windows native digest tests. Reads only source and disposable fixtures.
# Does not access W05/W06 SQLite, W08/W10 MariaDB, or real printers.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w19-native-event-digest-20261019") {
    throw "W19_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw "W19_NODE24_REQUIRED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\apps\desktop\w18-native-key-receipt-boundary.test.mjs",
    ".\apps\desktop\w19-native-event-digest-parity.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W19_TEST_MISSING: $test"
    }
}
Write-Host "W11-W19 NODE PARITY + TEMP SQLITE TESTS (NO SAVED DATA WRITES)" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W19_NODE_REGRESSION_FAILED" }
Write-Host "W12/W17/W18/W19 WINDOWS RUST DPAPI-CNG-SHA256 TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib
    if ($LASTEXITCODE -ne 0) { throw "W19_NATIVE_RUST_TESTS_FAILED_OR_CACHE_MISSING" }
} finally { Pop-Location }
Write-Host "W11 COMMERCIAL SOURCE EXPOSURE AUDIT" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$securityCode = $LASTEXITCODE
if ($securityCode -eq 2) {
    Write-Host "EXPECTED: legacy Node backend remains extractable; DO NOT SHIP WINDOWS NSIS." -ForegroundColor Yellow
} elseif ($securityCode -ne 0) {
    throw "W19_SECURITY_AUDIT_UNEXPECTED_ERROR"
}
Write-Host "W19 OFFLINE ACCEPTANCE COMPLETE - NO OUTBOX ACK OR PRODUCTION CONNECTION" -ForegroundColor Green
