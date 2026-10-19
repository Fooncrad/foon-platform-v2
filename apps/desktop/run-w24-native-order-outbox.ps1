#requires -Version 5.1
# W24: native order + created event + durable Outbox test on disposable SQLite only.
# Never open W05/W06 saved data, run W08/W10 MariaDB writers, or deploy.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w24-native-order-outbox-20261019') {
    throw 'W24_BRANCH_REQUIRED'
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw 'W24_NODE24_REQUIRED' }
if ($env:FOON_W24_TEST_DB_PATH) { throw 'W24_EXISTING_FIXTURE_OVERRIDE_NOT_ALLOWED' }
$tests = @(
    '.\apps\desktop\w23-native-probe-audit.test.mjs',
    '.\apps\desktop\w23-extracted-file-policy.test.mjs',
    '.\apps\desktop\w24-native-order-outbox.test.mjs'
)
foreach($file in $tests) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "W24_NODE_TEST_NOT_FOUND: $file" }
}
Write-Host 'W23/W24 PURE SECURITY AND SOURCE REGRESSION TESTS' -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'W24_NODE_TESTS_FAILED' }
Write-Host 'W24 WINDOWS RUST UNIT TESTS (NO EXISTING SQLITE)' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'src-tauri')
try {
    & cargo test --offline --lib native_order_outbox::tests::
    if ($LASTEXITCODE -ne 0) { throw 'W24_NATIVE_UNIT_TESTS_FAILED' }
    & cargo check --offline --lib --features native-probe
    if ($LASTEXITCODE -ne 0) { throw 'W24_NATIVE_PROBE_REGRESSION_FAILED' }
} finally { Pop-Location }
Write-Host 'W24 SEVEN NATIVE SQLITE WAL ATOMIC ORDER AND OUTBOX CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w24-native-order-outbox-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W24_NATIVE_ORDER_TRANSACTION_TESTS_FAILED' }
Write-Host 'W11 COMMERCIAL SOURCE LEAK GUARD (LEGACY PACKAGE)' -ForegroundColor Cyan
& node '.\apps\desktop\w11-distribution-audit.mjs'
$code = $LASTEXITCODE
if ($code -eq 2) {
    Write-Host 'EXPECTED: original commercial installer is still BLOCKED for readable Node source.' -ForegroundColor Yellow
} elseif ($code -ne 0) {
    throw 'W24_COMMERCIAL_GUARD_UNEXPECTED_FAILURE'
}
Write-Host 'W24 ISOLATED NATIVE ORDER/OUTBOX TESTS COMPLETE. NO SAVED DATABASE OR CLOUD ACK.' -ForegroundColor Green
