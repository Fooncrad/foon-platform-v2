#requires -Version 5.1
# W20 isolated Windows-only WinSQLite3 native read parity.
# NEVER open W05/W06 saved orders, W08/W10 MariaDB or any merchant DB.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne "feat/foon-windows-w20-native-readonly-outbox-20261019") {
    throw "W20_BRANCH_REQUIRED"
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw "W20_NODE24_REQUIRED" }
if ($env:FOON_W20_TEST_DB_PATH) { throw "W20_EXISTING_TEST_DB_ENV_NOT_ALLOWED" }
$tests = @(
    ".\apps\desktop\w11-distribution-policy.test.mjs",
    ".\apps\desktop\w12-native-key-safety.test.mjs",
    ".\apps\desktop\w17-native-receipt-parity.test.mjs",
    ".\apps\desktop\w18-native-key-receipt-boundary.test.mjs",
    ".\apps\desktop\w19-native-event-digest-parity.test.mjs",
    ".\apps\desktop\w20-native-readonly-outbox.test.mjs",
    ".\scripts\foon-edge-sync-scheduler.test.mjs",
    ".\scripts\foon-category-print-policy.test.mjs",
    ".\scripts\foon-local-print-outbox.test.mjs",
    ".\scripts\foon-print-test-coordinator.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W20_NODE_TEST_MISSING: $test"
    }
}
Write-Host "W11-W20 PURE NODE SECURITY TESTS AND TEMPORARY SQLITE REGRESSION" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W20_NODE_TESTS_FAILED" }
$fixtureScript = ".\apps\desktop\w20-temp-outbox-fixture.mjs"
$tempDb = $null
try {
    Write-Host "W20 CREATING A FRESH SYNTHETIC TEMP FIXTURE - NOT USER SQLITE" -ForegroundColor Cyan
    $createdOutput = @(& node $fixtureScript --create)
    if ($LASTEXITCODE -ne 0 -or $createdOutput.Count -ne 1) { throw "W20_FIXTURE_CREATION_FAILED" }
    $tempDb = [string]$createdOutput[0]
    if (-not (Test-Path -LiteralPath $tempDb -PathType Leaf)) { throw "W20_FIXTURE_NOT_FOUND" }
    $before = (Get-FileHash -LiteralPath $tempDb -Algorithm SHA256).Hash
    $snapshot = (& node $fixtureScript --inspect $tempDb | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $snapshot.total -ne 4 -or $snapshot.pending -ne 3) {
        throw "W20_SYNTHETIC_BASELINE_INVALID"
    }
    $env:FOON_W20_TEST_DB_PATH = $tempDb
    Write-Host "W12-W20 WINDOWS NATIVE RUST TESTS - READONLY WINSQLITE3" -ForegroundColor Cyan
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try {
        & cargo test --offline --lib
        if ($LASTEXITCODE -ne 0) { throw "W20_RUST_TESTS_FAILED_OR_WINSQLITE3_NOT_AVAILABLE" }
    } finally { Pop-Location }
    $after = (Get-FileHash -LiteralPath $tempDb -Algorithm SHA256).Hash
    if ($before -ne $after) { throw "W20_READONLY_FIXTURE_WAS_MODIFIED" }
    $verified = (& node $fixtureScript --inspect $tempDb | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0 -or $verified.pending -ne 3) {
        throw "W20_FIXTURE_CHANGED_AFTER_READ"
    }
    Write-Host "PASS: native read-only SQLite output and JS digests match; fixture unchanged" -ForegroundColor Green
    Write-Host "W11 COMMERCIAL BUNDLE SOURCE-LEAK AUDIT" -ForegroundColor Cyan
    & node ".\apps\desktop\w11-distribution-audit.mjs"
    $auditStatus = $LASTEXITCODE
    if ($auditStatus -eq 2) {
        Write-Host "EXPECTED: existing Node/MJS installer remains blocked for commercial release" -ForegroundColor Yellow
    } elseif ($auditStatus -ne 0) {
        throw "W20_DISTRIBUTION_AUDIT_ERROR"
    }
    Write-Host "W20 OFFLINE ACCEPTANCE PASSED - NO SAVED DB ACCESS OR OUTBOX ACK" -ForegroundColor Green
} finally {
    Remove-Item Env:FOON_W20_TEST_DB_PATH -ErrorAction SilentlyContinue
    if ($tempDb -and (Test-Path -LiteralPath $tempDb -PathType Leaf)) {
        & node $fixtureScript --cleanup $tempDb
        if ($LASTEXITCODE -ne 0) {
            Write-Host "W20 cleanup refused; only synthetic test files may remain in Temp." -ForegroundColor Yellow
        }
    }
}
