#requires -Version 5.1
# W08 local-only, one-time MariaDB test writes; never touches FOON SQLite or cloud.
# This uses the existing empty foon_edge_test database and does not DROP tables.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w08-mysql-sync-validation-20261018") {
    throw "W08_STAGE2_BRANCH_REQUIRED"
}
if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\mysql2\package.json") -PathType Leaf)) {
    throw "W08_MYSQL2_MISSING_RUN_NPM_CI_FROM_PROJECT_ROOT"
}
if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) {
    throw "W08_LOCAL_MARIADB_NOT_LISTENING"
}

Write-Host "W08 STAGE 2 - PURE SAFETY TESTS (NO DATABASE WRITES)" -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot "w08-mariadb-stage2-safety.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "W08_STAGE2_SAFETY_TESTS_FAILED" }

Write-Host "W08 STAGE 2 - AUTHORIZED LOCAL TEST ONLY" -ForegroundColor Yellow
Write-Host "This WILL create edge_sync_inbox and w08_fixture_orders inside an EMPTY foon_edge_test database." -ForegroundColor Yellow
Write-Host "Synthetic test rows will remain for inspection; do not rerun after creation." -ForegroundColor Yellow
Write-Host "NO other databases, full migrations, Hostinger cloud, or FOON Desktop SQLite." -ForegroundColor Cyan
$confirmation = Read-Host "Type WRITE foon_edge_test to permit local test writes"
if ($confirmation -cne "WRITE foon_edge_test") { throw "W08_STAGE2_CONFIRMATION_REQUIRED" }

$username = Read-Host "Local test username (must be foon_edge_runner)"
if ($username -cne "foon_edge_runner") { throw "W08_STAGE2_USERNAME_REJECTED" }
$passwordSecure = Read-Host "Local test password (hidden)" -AsSecureString

$before = [Environment]::GetEnvironmentVariable("EDGE_TEST_DATABASE_URL", "Process")
$bstr = [IntPtr]::Zero
$passwordPlain = $null
$encodedPass = $null
$testUrl = $null
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrEmpty($passwordPlain)) { throw "W08_STAGE2_PASSWORD_REQUIRED" }
    $encodedPass = [Uri]::EscapeDataString($passwordPlain)
    $testUrl = "mysql://foon_edge_runner:" + $encodedPass + "@127.0.0.1:3306/foon_edge_test"
    [Environment]::SetEnvironmentVariable("EDGE_TEST_DATABASE_URL", $testUrl, "Process")
    $passwordPlain = $null
    $encodedPass = $null
    $testUrl = $null

    & node (Join-Path $PSScriptRoot "w08-mariadb-local-integration.mjs")
    if ($LASTEXITCODE -ne 0) { throw "W08_STAGE2_LOCAL_INTEGRATION_FAILED" }
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $passwordSecure = $null
    $passwordPlain = $null
    $encodedPass = $null
    $testUrl = $null
    [Environment]::SetEnvironmentVariable("EDGE_TEST_DATABASE_URL", $before, "Process")
}
