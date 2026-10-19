#requires -Version 5.1
# W17 isolated, offline-native receipt compatibility checks.
# No one-time MariaDB writer, no original W05/W06 SQLite, no real printer.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w17-native-receipt-verifier-20261019") {
    throw "W17_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { throw "W17_NODE24_REQUIRED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W17_MISSING_TEST: $test"
    }
}
Write-Host "W11-W17 PURE AND TEMPORARY SQLITE TESTS (NO SAVED DATABASE WRITES)" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W17_NODE_TESTS_FAILED" }
Write-Host "W12 WINDOWS DPAPI AND W17 NATIVE RECEIPT CRYPTO RUST TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib
    if ($LASTEXITCODE -ne 0) { throw "W17_WINDOWS_RUST_TESTS_FAILED_OR_DEPS_NOT_CACHED" }
} finally { Pop-Location }
Write-Host "W11 COMMERCIAL DISTRIBUTION EXPOSURE AUDIT" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$auditResult = $LASTEXITCODE
if ($auditResult -eq 2) {
    Write-Host "EXPECTED BLOCK: raw Node backend source still bundled in v0.1.4; do NOT distribute." -ForegroundColor Yellow
} elseif ($auditResult -ne 0) {
    throw "W17_SOURCE_EXPOSURE_AUDIT_FAILED"
}
Write-Host "W17 TESTS COMPLETE. NATIVE RECEIPT VERIFIER IS NOT CONNECTED TO REAL SYNC OR ACK." -ForegroundColor Green
