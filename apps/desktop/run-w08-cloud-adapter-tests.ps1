#requires -Version 5.1
# W08 stage 1: pure adapter/security tests with fake connections and synthetic state.
# No network/database connection, schema migration, production changes, or GUI rebuild.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w08-mysql-sync-validation-20261018") {
    throw "W08_BRANCH_REQUIRED"
}
$tests = @(
    ".\scripts\foon-edge-accept.test.mjs",
    ".\scripts\foon-edge-central-validation.test.mjs",
    ".\scripts\foon-edge-http.test.mjs",
    ".\scripts\foon-edge-mysql-adapter.test.mjs",
    ".\scripts\foon-edge-service.test.mjs",
    ".\scripts\foon-edge-order-mutation.test.mjs",
    ".\scripts\foon-edge-create-order.test.mjs",
    ".\scripts\foon-edge-pricing.test.mjs",
    ".\scripts\foon-edge-receipt-signature.test.mjs",
    ".\scripts\foon-edge-sync-bridge.test.mjs",
    ".\scripts\foon-edge-sync-worker.test.mjs",
    ".\scripts\foon-edge-sync-contract.test.mjs",
    ".\apps\desktop\w07-sync-sandbox.integration.test.mjs"
)
foreach ($path in $tests) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "W08_MISSING_TEST: $path"
    }
}
Write-Host "W08 STEP 1 - EXISTING CLOUD ADAPTER AND DEVICE POLICY TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W08_CLOUD_ADAPTER_TESTS_FAILED" }
Write-Host "W08 CLOUD ADAPTER TESTS PASSED" -ForegroundColor Green
Write-Host "NO MYSQL CONNECTION OR PRODUCTION MUTATION" -ForegroundColor Green
Write-Host "REAL MYSQL INTEGRATION NOT YET VERIFIED" -ForegroundColor Yellow
