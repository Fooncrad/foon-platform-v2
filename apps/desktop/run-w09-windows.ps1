#requires -Version 5.1
# W09 localhost-only HTTP sync tests. No MariaDB access, deployment, or use of
# W05/W06 persistent SQLite. Do not run GitHub Actions.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w09-loopback-http-recovery-20261019") {
    throw "W09_BRANCH_REQUIRED"
}
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 24) { throw "W09_NODE_24_OR_LATER_REQUIRED" }
$tests = @(
    ".\apps\desktop\w09-loopback-http.integration.test.mjs",
    ".\apps\desktop\w07-sync-sandbox.integration.test.mjs",
    ".\scripts\foon-edge-sync-bridge.test.mjs",
    ".\scripts\foon-edge-sync-worker.test.mjs",
    ".\apps\desktop\w08-mariadb-stage2-safety.test.mjs"
)
foreach($path in $tests) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "W09_MISSING_TEST: $path"
    }
}
# Database URLs must not leak into test child processes. This is process-local
# and restored immediately, even if Node fails.
$names = @("DATABASE_URL","EDGE_TEST_DATABASE_URL","FOON_EDGE_MASTER_RECEIPT_KEY")
$old = @{}
try {
    foreach ($name in $names) {
        $old[$name] = [Environment]::GetEnvironmentVariable($name,"Process")
        [Environment]::SetEnvironmentVariable($name,$null,"Process")
    }
    Write-Host "W09 - LOCAL HTTP / SQLITE RECOVERY VALIDATION" -ForegroundColor Cyan
    Write-Host "Loopback only, fresh disposable temp SQLite, no MariaDB." -ForegroundColor Cyan
    & node --test @tests
    if ($LASTEXITCODE -ne 0) { throw "W09_LOOPBACK_HTTP_TESTS_FAILED" }
    Write-Host "W09 LOOPBACK HTTP RECOVERY TESTS PASSED" -ForegroundColor Green
    Write-Host "W08 LOCAL MYSQL TEST TABLES AND W05/W06 SAVED SQLITE UNTOUCHED" -ForegroundColor Green
    Write-Host "NO INTERNET, PRODUCTION HOSTINGER, GITHUB ACTIONS, OR CLOUD DEPLOYMENT" -ForegroundColor Green
}
finally {
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name,$old[$name],"Process")
    }
}
