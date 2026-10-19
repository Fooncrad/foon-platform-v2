#requires -Version 5.1
# W26 synthetic asymmetric catalog signature acceptance - no database access.
# Never run W08/W10 MariaDB or touch saved W05/W06 SQLite/outbox.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w26-signed-catalog-verifier-20261019') {
    throw 'W26_BRANCH_REQUIRED'
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw 'W26_NODE24_REQUIRED' }
if ($env:FOON_W26_SIGNED_DOCUMENT -or $env:FOON_W26_TEST_PUBLIC_XY -or $env:FOON_LAN_DB) {
    throw 'W26_PREEXISTING_CREDENTIAL_OR_DB_ENV_REFUSED'
}
$tests = @(
    '.\apps\desktop\w23-native-probe-audit.test.mjs',
    '.\apps\desktop\w23-extracted-file-policy.test.mjs',
    '.\apps\desktop\w24-native-order-outbox.test.mjs',
    '.\apps\desktop\w25-native-catalog-safety.test.mjs',
    '.\apps\desktop\w26-signed-catalog-safety.test.mjs'
)
foreach($item in $tests) {
    if (-not (Test-Path -LiteralPath $item -PathType Leaf)) {
        throw "W26_NODE_TEST_MISSING: $item"
    }
}
Write-Host 'W23-W26 PURE NODE SECURITY REGRESSION (NO SQLITE WRITES)' -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'W26_NODE_TESTS_FAILED' }
Write-Host 'W26 NATIVE WINDOWS CNG RUST VERIFIER UNIT TESTS' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'src-tauri')
try {
    & cargo test --offline --lib native_signed_catalog::tests::
    if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_RUST_UNIT_FAILED' }
    & cargo check --offline --lib --features native-probe
    if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_PROBE_REGRESSION_FAILED' }
} finally { Pop-Location }
Write-Host 'W26 15 EPHEMERAL SIGNED CATALOG ECDSA P256 CASES' -ForegroundColor Cyan
& node '.\apps\desktop\w26-native-signed-catalog-acceptance.mjs' --run
if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_SIGNATURE_PARITY_FAILED' }
Write-Host 'W11 COMMERCIAL NODE SOURCE EXPOSURE AUDIT' -ForegroundColor Cyan
& node '.\apps\desktop\w11-distribution-audit.mjs'
$status = $LASTEXITCODE
if ($status -eq 2) {
    Write-Host 'EXPECTED BLOCK: legacy Node/MJS installer is NOT commercially distributable.' -ForegroundColor Yellow
} elseif ($status -ne 0) {
    throw 'W26_LEGACY_DISTRIBUTION_AUDIT_UNEXPECTED_ERROR'
}
Write-Host 'W26 CATALOG SIGNATURE PROOF COMPLETE - NO PRODUCTION SNAPSHOT, SQLite, ACK OR DEPLOYMENT' -ForegroundColor Green
