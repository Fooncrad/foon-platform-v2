#requires -Version 5.1
# W26 catalog lease revisions and expiry: disposable SQLite only.
# NEVER open W05/W06 saved data or W08/W10 MariaDB and never deploy.
$ErrorActionPreference = 'Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$branch=(& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w26-catalog-lease-expiry-20261019') {
    throw 'W26_BRANCH_REQUIRED'
}
$major=[int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw 'W26_NODE24_REQUIRED' }
foreach($key in @('FOON_LAN_DB','FOON_W24_TEST_DB_PATH','FOON_W25_TEST_DB_PATH','FOON_W26_TEST_DB_PATH')) {
    if ([Environment]::GetEnvironmentVariable($key,'Process')) {
        throw ('W26_EXISTING_DATABASE_OVERRIDE_FORBIDDEN: '+$key)
    }
}
$tests=@(
    '.\apps\desktop\w23-native-probe-audit.test.mjs',
    '.\apps\desktop\w23-extracted-file-policy.test.mjs',
    '.\apps\desktop\w24-native-order-outbox.test.mjs',
    '.\apps\desktop\w25-native-catalog-safety.test.mjs',
    '.\apps\desktop\w26-catalog-lease-safety.test.mjs'
)
foreach($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw ('W26_MISSING_TEST: '+$test)
    }
}
Write-Host 'W23-W26 STATIC NODE SECURITY REGRESSION' -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'W26_NODE_SECURITY_FAILED' }
Write-Host 'W26 NATIVE RUST TESTS AND PROBE FEATURE CHECK' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'src-tauri')
try {
    & cargo test --offline --lib native_order_outbox::tests::
    if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_UNIT_TESTS_FAILED' }
    & cargo check --offline --lib --features native-probe
    if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_PROBE_REGRESSION_FAILED' }
} finally { Pop-Location }
Write-Host 'W24 SEVEN ATOMIC ORDER + OUTBOX TEMP SQLITE CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w24-native-order-outbox-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W26_W24_BASELINE_REGRESSION_FAILED' }
Write-Host 'W25 THIRTEEN CATALOG PRICE + STOCK TEMP SQLITE CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w25-native-catalog-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W26_W25_BASELINE_REGRESSION_FAILED' }
Write-Host 'W26 ELEVEN LEASE EXPIRY + REVISION + SCOPE TEMP SQLITE CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w26-catalog-lease-adversarial.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_CATALOG_LEASE_CASES_FAILED' }
Write-Host 'W11 COMMERCIAL RELEASE SOURCE EXPOSURE BLOCK' -ForegroundColor Cyan
& node '.\apps\desktop\w11-distribution-audit.mjs'
$audit=$LASTEXITCODE
if ($audit -eq 2) {
    Write-Host 'EXPECTED: old Node/MJS commercial installer is still BLOCKED.' -ForegroundColor Yellow
} elseif ($audit -ne 0) {
    throw 'W26_RELEASE_AUDIT_UNEXPECTED_FAILURE'
}
Write-Host 'W26 OFFLINE ACCEPTANCE COMPLETE - NO REAL CATALOG OR PRODUCTION ACK.' -ForegroundColor Green
