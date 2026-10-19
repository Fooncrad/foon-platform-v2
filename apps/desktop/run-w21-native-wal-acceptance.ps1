#requires -Version 5.1
# W21 offline synthetic-only WAL resilience and native SQLite read gate.
# NEVER touches W05/W06 saved SQLite, W08/W10 local MariaDB or production.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne "feat/foon-windows-w21-wal-integrity-20261019") {
    throw "W21_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw "W21_NODE24_REQUIRED" }
if ($env:FOON_W20_TEST_DB_PATH -or $env:FOON_W21_TEST_DB_PATH) {
    throw "W21_PREEXISTING_TEST_DB_OVERRIDE_FORBIDDEN"
}
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\apps\desktop\w18-native-key-receipt-boundary.test.mjs",
    ".\apps\desktop\w19-native-event-digest-parity.test.mjs",
    ".\apps\desktop\w20-native-readonly-outbox.test.mjs",
    ".\apps\desktop\w21-wal-integrity.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W21_NODE_TEST_MISSING: $test"
    }
}
Write-Host "W11-W21 PURE NODE AND DISPOSABLE SQLITE REGRESSION TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W21_NODE_REGRESSION_FAILED" }
$fixtureScript = ".\apps\desktop\w20-temp-outbox-fixture.mjs"
$fixtureDb = $null
try {
    Write-Host "W20 READ-ONLY BASELINE RUST TEST (FRESH TEMP FIXTURE)" -ForegroundColor Cyan
    $createdOutput = @(& node $fixtureScript --create)
    if ($LASTEXITCODE -ne 0 -or $createdOutput.Count -ne 1) {
        throw "W21_BASELINE_FIXTURE_CREATE_FAILED"
    }
    $fixtureDb = [string]$createdOutput[0]
    if (-not (Test-Path -LiteralPath $fixtureDb -PathType Leaf)) {
        throw "W21_BASELINE_TEMP_FIXTURE_NOT_FOUND"
    }
    $before = (Get-FileHash -LiteralPath $fixtureDb -Algorithm SHA256).Hash
    $env:FOON_W20_TEST_DB_PATH = $fixtureDb
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try {
        & cargo test --offline --lib
        if ($LASTEXITCODE -ne 0) { throw "W21_WINDOWS_NATIVE_RUST_BASELINE_FAILED" }
    } finally { Pop-Location }
    if ($before -ne (Get-FileHash -LiteralPath $fixtureDb -Algorithm SHA256).Hash) {
        throw "W21_BASELINE_READ_MODIFIED_DB"
    }
    Write-Host "PASS: native baseline read did not alter disposable DB" -ForegroundColor Green
} finally {
    Remove-Item Env:FOON_W20_TEST_DB_PATH -ErrorAction SilentlyContinue
    if ($fixtureDb -and (Test-Path -LiteralPath $fixtureDb -PathType Leaf)) {
        & node $fixtureScript --cleanup $fixtureDb
        if ($LASTEXITCODE -ne 0) {
            Write-Host "W21 baseline fixture cleanup declined; inspect ONLY temp fixture." -ForegroundColor Yellow
        }
    }
}
Write-Host "W21 FIVE LIVE WAL / CORRUPTION / DUPLICATE / ORPHAN NATIVE CASES" -ForegroundColor Cyan
& node ".\apps\desktop\w21-native-wal-adversarial.mjs" --run
if ($LASTEXITCODE -ne 0) { throw "W21_NATIVE_WAL_ADVERSARIAL_TESTS_FAILED" }
Write-Host "W11 COMMERCIAL SOURCE-EXPOSURE SECURITY GATE" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$audit = $LASTEXITCODE
if ($audit -eq 2) {
    Write-Host "EXPECTED BLOCK: legacy backend MJS still extractable; DO NOT distribute NSIS." -ForegroundColor Yellow
} elseif ($audit -ne 0) {
    throw "W21_COMMERCIAL_SOURCE_AUDIT_UNEXPECTED_ERROR"
} else {
    Write-Host "Source file hygiene passed; compiled code is still reversible." -ForegroundColor Yellow
}
Write-Host "W21 OFFLINE WAL ACCEPTANCE FINISHED - NO SAVED SQLITE OR REAL PRINTER" -ForegroundColor Green
