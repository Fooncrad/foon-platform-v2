#requires -Version 5.1
# W08: READ ONLY preflight. Never runs migrations or reads W05/W06 SQLite data.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w08-mysql-sync-validation-20261018") {
    throw "W08_BRANCH_REQUIRED"
}

$script = Join-Path $PSScriptRoot "w08-mariadb-readonly-preflight.mjs"
if (-not (Test-Path -LiteralPath $script)) {
    throw "W08_PREFLIGHT_SCRIPT_MISSING"
}

Write-Host "W08 - TEST PRE-FLIGHT SAFETY GATES" -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot "w08-mariadb-preflight.test.mjs")
if ($LASTEXITCODE -ne 0) {
    throw "W08_PREFLIGHT_SAFETY_TESTS_FAILED"
}

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\mysql2\package.json") -PathType Leaf)) {
    throw "W08_MYSQL2_MISSING_RUN_NPM_CI_FROM_PROJECT_ROOT"
}

if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) {
    throw "W08_LOCAL_MARIADB_NOT_LISTENING_ON_3306"
}

Write-Host "W08 - LOCAL TEST DATABASE READ-ONLY PREFLIGHT" -ForegroundColor Cyan
Write-Host "Requires existing empty foon_edge_test database and a dedicated scoped user." -ForegroundColor Yellow
Write-Host "No database is created or modified by this check." -ForegroundColor Cyan

$username = Read-Host "Local MariaDB test username (not root)"
if ([string]::IsNullOrWhiteSpace($username) -or $username -match '[^a-zA-Z0-9_]') {
    throw "W08_INVALID_TEST_USERNAME"
}
if ($username.ToLowerInvariant() -eq "root") {
    throw "W08_ROOT_USER_FORBIDDEN"
}

$passwordSecure = Read-Host "Local MariaDB test password (hidden)" -AsSecureString
$bstr = [IntPtr]::Zero
$before = [Environment]::GetEnvironmentVariable("EDGE_TEST_DATABASE_URL", "Process")

try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrEmpty($passwordPlain)) {throw "W08_EMPTY_TEST_PASSWORD"}

    $encodedUser = [uri]::EscapeDataString($username)
    $encodedPass = [uri]::EscapeDataString($passwordPlain)
    $testUrl = "mysql://" + $encodedUser + ":" + $encodedPass + "@127.0.0.1:3306/foon_edge_test"
    [Environment]::SetEnvironmentVariable("EDGE_TEST_DATABASE_URL", $testUrl, "Process")
    $passwordPlain = $null
    $encodedPass = $null
    $testUrl = $null

    & node $script
    if ($LASTEXITCODE -ne 0) {
        throw "W08_MYSQL_PREFLIGHT_FAILED"
    }
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $passwordSecure = $null
    [Environment]::SetEnvironmentVariable("EDGE_TEST_DATABASE_URL", $before, "Process")
}
