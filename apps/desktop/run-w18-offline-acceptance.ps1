#requires -Version 5.1
# W18 offline-only native credential + receipt boundary acceptance.
# No original W05/W06 SQLite, no W08/W10 MariaDB, no cloud or printing.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w18-protected-receipt-path-20261019") {
    throw "W18_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { throw "W18_NODE24_REQUIRED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\apps\desktop\w18-native-key-receipt-boundary.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W18_TEST_FILE_MISSING: $test"
    }
}
Write-Host "W11-W18 NODE SECURITY + TEMPORARY SQLITE REGRESSION - NO SAVED DB WRITES" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W18_NODE_TESTS_FAILED" }
Write-Host "W18 WINDOWS NATIVE RUST DPAPI + CNG TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib
    if ($LASTEXITCODE -ne 0) { throw "W18_RUST_TESTS_FAILED_OR_DEPENDENCIES_NOT_CACHED" }
} finally { Pop-Location }
Write-Host "W11 COMMERCIAL SOURCE-EXPOSURE SECURITY GATE" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$auditResult = $LASTEXITCODE
if ($auditResult -eq 2) {
    Write-Host "EXPECTED BLOCK: v0.1.4 still bundles readable backend MJS; customer installer NOT cleared." -ForegroundColor Yellow
} elseif ($auditResult -ne 0) {
    throw "W18_DISTRIBUTION_AUDIT_ERROR"
} else {
    Write-Host "No obvious source leaks found; this does NOT make compiled software unbreakable." -ForegroundColor Yellow
}
Write-Host "W18 OFFLINE ACCEPTANCE FINISHED - NO DB ACK, REAL PRINTER, MERGE OR DEPLOYMENT" -ForegroundColor Green
