#requires -Version 5.1
# W15 isolated print queue acceptance only. Never opens W05/W06 or W08/W10.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w15-durable-print-outbox-20261019") {
    throw "W15_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 24) { throw "W15_NODE24_REQUIRED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W15_TEST_MISSING: $test"
    }
}
Write-Host "W11-W15 PURE/ISOLATED NODE VALIDATION. NO SAVED SQLITE OR MARIADB." -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W15_NODE_TESTS_FAILED" }
Write-Host "W12 WINDOWS NATIVE DPAPI TESTS (NO REAL CREDENTIALS)" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test --offline --lib windows_secret_store
    if ($LASTEXITCODE -ne 0) { throw "W12_DPAPI_RUST_TESTS_FAILED_OR_DEPS_NOT_CACHED" }
} finally { Pop-Location }
Write-Host "W11 RELEASE HYGIENE AUDIT (CURRENT LEGACY JS EXPECTED BLOCKED)" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$audit = $LASTEXITCODE
if ($audit -eq 2) {
    Write-Host "EXPECTED: commercial NSIS release blocked while legacy MJS backend remains extractable." -ForegroundColor Yellow
} elseif ($audit -ne 0) {
    throw "W11_RELEASE_AUDIT_FAILED_UNEXPECTEDLY"
}
Write-Host "W15 ISOLATED PRINT-QUEUE TESTS COMPLETE. NO ACTUAL PRINTING OR PRODUCTION DEPLOYMENT." -ForegroundColor Green
