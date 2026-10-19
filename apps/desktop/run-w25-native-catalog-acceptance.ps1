#requires -Version 5.1
# W25 synthetic-only catalog price and stock reservation inside native Rust.
# NEVER touch W05/W06 saved SQLite or W08/W10 MariaDB.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w25-native-catalog-stock-20261019') {
    throw 'W25_BRANCH_REQUIRED'
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw 'W25_NODE24_REQUIRED' }
if ($env:FOON_W24_TEST_DB_PATH -or $env:FOON_W25_TEST_DB_PATH -or $env:FOON_LAN_DB) {
    throw 'W25_EXISTING_DATABASE_ENVIRONMENT_REFUSED'
}
$tests = @(
    '.\apps\desktop\w23-native-probe-audit.test.mjs',
    '.\apps\desktop\w23-extracted-file-policy.test.mjs',
    '.\apps\desktop\w24-native-order-outbox.test.mjs',
    '.\apps\desktop\w25-native-catalog-safety.test.mjs'
)
foreach($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W25_TEST_MISSING: $test"
    }
}
Write-Host 'W23-W25 PURE SECURITY REGRESSIONS (NO CUSTOMER DB)' -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'W25_NODE_SAFETY_TESTS_FAILED' }
Write-Host 'W25 WINDOWS NATIVE RUST COMPILE + UNIT TESTS' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'src-tauri')
try {
    & cargo test --offline --lib native_order_outbox::tests::
    if ($LASTEXITCODE -ne 0) { throw 'W25_RUST_UNIT_TESTS_FAILED' }
    & cargo check --offline --lib --features native-probe
    if ($LASTEXITCODE -ne 0) { throw 'W25_PROBE_FEATURE_REGRESSION_FAILED' }
} finally { Pop-Location }
Write-Host 'W24 COMPATIBILITY: 7 NATIVE ORDER / OUTBOX TRANSACTIONS IN TEMP DB' -ForegroundColor Cyan
& node '.\apps\desktop\w24-native-order-outbox-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W25_W24_REGRESSION_FAILED' }
Write-Host 'W25 CATALOG: 13 NATIVE PRICE, STOCK, ROLLBACK AND SCOPE CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w25-native-catalog-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W25_NATIVE_CATALOG_TESTS_FAILED' }
Write-Host 'W11 SOURCE EXPOSURE RELEASE GATE' -ForegroundColor Cyan
& node '.\apps\desktop\w11-distribution-audit.mjs'
$audit=$LASTEXITCODE
if ($audit -eq 2) {
    Write-Host 'EXPECTED: old commercial Node/MJS installer is still BLOCKED.' -ForegroundColor Yellow
} elseif ($audit -ne 0) {
    throw 'W25_COMMERCIAL_RELEASE_AUDIT_UNEXPECTED_FAILURE'
}
Write-Host 'W25 ISOLATED TESTS COMPLETE - NO REAL INVENTORY OR PRODUCTION POS CHANGE.' -ForegroundColor Green
