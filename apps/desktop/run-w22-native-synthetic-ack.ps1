#requires -Version 5.1
# FOON W22 synthetic-only, transactionally scoped native ACK acceptance.
# NO saved W05/W06 SQLite, W08/W10 MariaDB, production or real printer.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne "feat/foon-windows-w22-native-synthetic-ack-20261019") {
    throw "W22_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw "W22_NODE24_REQUIRED" }
if ($env:FOON_W20_TEST_DB_PATH -or $env:FOON_W21_TEST_DB_PATH -or $env:FOON_W22_TEST_DB_PATH) {
    throw "W22_TEST_DATABASE_OVERRIDE_FORBIDDEN"
}
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\apps\desktop\w18-native-key-receipt-boundary.test.mjs",
    ".\apps\desktop\w19-native-event-digest-parity.test.mjs",
    ".\apps\desktop\w20-native-readonly-outbox.test.mjs",
    ".\apps\desktop\w21-wal-integrity.test.mjs",
    ".\apps\desktop\w22-synthetic-ack-safety.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W22_REGRESSION_TEST_MISSING: $test"
    }
}
Write-Host "W11-W22 PURE NODE AND DISPOSABLE SQLITE TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W22_NODE_TESTS_FAILED" }
$testFixture = ".\apps\desktop\w20-temp-outbox-fixture.mjs"
$tempDb = $null
try {
    Write-Host "W20-W22 NATIVE RUST BASELINE WITH FRESH SYNTHETIC TEMP DATABASE" -ForegroundColor Cyan
    $created = @(& node $testFixture --create)
    if ($LASTEXITCODE -ne 0 -or $created.Count -ne 1) {
        throw "W22_RUST_BASELINE_FIXTURE_CREATE_FAILED"
    }
    $tempDb = [string]$created[0]
    if (-not (Test-Path -LiteralPath $tempDb -PathType Leaf)) {
        throw "W22_SYNTHETIC_BASELINE_NOT_FOUND"
    }
    $hashBefore = (Get-FileHash -LiteralPath $tempDb -Algorithm SHA256).Hash
    $env:FOON_W20_TEST_DB_PATH = $tempDb
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try {
        & cargo test --offline --lib
        if ($LASTEXITCODE -ne 0) { throw "W22_NATIVE_RUST_BASELINE_FAILED" }
    } finally { Pop-Location }
    if ($hashBefore -ne (Get-FileHash -LiteralPath $tempDb -Algorithm SHA256).Hash) {
        throw "W22_NATIVE_BASELINE_MODIFIED_READONLY_DB"
    }
} finally {
    Remove-Item Env:FOON_W20_TEST_DB_PATH -ErrorAction SilentlyContinue
    if ($tempDb -and (Test-Path -LiteralPath $tempDb -PathType Leaf)) {
        & node $testFixture --cleanup $tempDb
        if ($LASTEXITCODE -ne 0) {
            Write-Host "W22 could not clean an isolated synthetic baseline; no user data touched." -ForegroundColor Yellow
        }
    }
}
Write-Host "W22 NINE NATIVE SIGNED-ACK COMMIT / ROLLBACK / REPLAY CASES" -ForegroundColor Cyan
& node ".\apps\desktop\w22-native-ack-adversarial.mjs" --run
if ($LASTEXITCODE -ne 0) { throw "W22_NATIVE_TRANSACTION_ACCEPTANCE_FAILED" }
Write-Host "W11 COMMERCIAL SOURCE-EXPOSURE GATE" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$result = $LASTEXITCODE
if ($result -eq 2) {
    Write-Host "EXPECTED COMMERCIAL BLOCK: legacy JS backend is still extractable from NSIS." -ForegroundColor Yellow
} elseif ($result -ne 0) {
    throw "W22_COMMERCIAL_AUDIT_FAILED"
}
Write-Host "W22 TEST-ONLY SIGNED ACK SUITE COMPLETE; NO PRODUCTION ACK OR DEPLOYMENT" -ForegroundColor Green
