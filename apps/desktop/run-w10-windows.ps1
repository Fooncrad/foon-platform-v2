#requires -Version 5.1
# W10 one-time localhost HTTP -> MariaDB fixture. Uses exactly foon_edge_test
# and preserves W08 4+4. Never run the W08 writer or migrate.mjs here.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w10-http-mariadb-20261019") {
    throw "W10_BRANCH_REQUIRED"
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 24) {throw "W10_NODE_24_REQUIRED"}
if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\mysql2\package.json") -PathType Leaf)) {
    throw "W10_MYSQL2_MISSING_FROM_PROJECT_ROOT"
}
if (-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)) {
    throw "W10_LOCAL_MARIADB_NOT_LISTENING"
}

$pureTests = @(
    ".\apps\desktop\w10-http-mariadb-guard.test.mjs",
    ".\apps\desktop\w10-http-mariadb-receiver.test.mjs",
    ".\apps\desktop\w09-loopback-http.integration.test.mjs",
    ".\apps\desktop\w07-sync-sandbox.integration.test.mjs",
    ".\apps\desktop\w08-mariadb-stage2-safety.test.mjs",
    ".\scripts\foon-edge-sync-bridge.test.mjs",
    ".\scripts\foon-edge-sync-worker.test.mjs"
)
foreach($test in $pureTests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W10_MISSING_SAFETY_TEST: $test"
    }
}
$names = @("DATABASE_URL","EDGE_TEST_DATABASE_URL","FOON_EDGE_MASTER_RECEIPT_KEY")
$previous = @{}
$secure = $null
$pointer = [IntPtr]::Zero
try {
    foreach($name in $names) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name,"Process")
        [Environment]::SetEnvironmentVariable($name,$null,"Process")
    }
    Write-Host "W10 - LOCAL HTTP / OFFLINE RECOVERY REGRESSION TESTS" -ForegroundColor Cyan
    & node --test @pureTests
    if ($LASTEXITCODE -ne 0) {throw "W10_PURE_TESTS_FAILED"}

    Write-Host "W10 - ONE-TIME LOCAL MARIADB HTTP INTEGRATION" -ForegroundColor Yellow
    Write-Host "Authorized local database foon_edge_test has W08 4+4 rows; these must remain intact." -ForegroundColor Yellow
    Write-Host "This test creates w10_http_fixture_orders and 4 new inbox events. It NEVER drops tables." -ForegroundColor Yellow
    Write-Host "If a W10 table exists, the test refuses. Do not rerun after a partial write." -ForegroundColor Yellow
    $confirm = Read-Host "Type WRITE W10 LOCAL ONLY to run local synthetic test writes"
    if ($confirm -cne "WRITE W10 LOCAL ONLY") {throw "W10_EXPLICIT_CONFIRMATION_REQUIRED"}
    $username = Read-Host "Dedicated localhost username"
    if ($username -cne "foon_edge_runner") {throw "W10_USERNAME_REJECTED"}
    $secure = Read-Host "Local MariaDB password (hidden)" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $rawPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrEmpty($rawPassword)) {throw "W10_PASSWORD_REQUIRED"}
    $uriPassword = [Uri]::EscapeDataString($rawPassword)
    $rawPassword = $null
    $url = "mysql://foon_edge_runner:" + $uriPassword + "@127.0.0.1:3306/foon_edge_test"
    $uriPassword = $null
    [Environment]::SetEnvironmentVariable("EDGE_TEST_DATABASE_URL",$url,"Process")
    $url = $null

    & node (Join-Path $PSScriptRoot "w10-http-mariadb.integration.mjs")
    if ($LASTEXITCODE -ne 0) {throw "W10_LOCAL_HTTP_MYSQL_TEST_FAILED"}
    Write-Host "W10 WINDOW OF DEVELOPMENT COMPLETE: LOOPBACK HTTP + MYSQL INTEGRATION VERIFIED" -ForegroundColor Green
    Write-Host "W05/W06 ORIGINAL SQLITE, W08 MYSQL FIXTURES AND PRODUCTION LEFT UNCHANGED" -ForegroundColor Green
}
finally {
    if ($pointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    $secure = $null
    $rawPassword = $null
    $uriPassword = $null
    $url = $null
    foreach($name in $names) {
        [Environment]::SetEnvironmentVariable($name,$previous[$name],"Process")
    }
}
