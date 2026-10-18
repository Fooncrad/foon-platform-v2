#requires -Version 5.1
# W12 native unit tests only. No credential provisioning, no saved SQLite,
# no MariaDB, no network sync, no certificate creation, no NSIS distribution.
$ErrorActionPreference="Stop"
$root=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$branch=(& git branch --show-current).Trim()
if($branch -ne "feat/foon-windows-w12-native-dpapi-20261019"){
    throw "W12_BRANCH_REQUIRED"
}
Write-Host "W12 KEY ISOLATION PURE STATIC CHECKS (NO DATABASE WRITES)" -ForegroundColor Cyan
& node --test ".\apps\desktop\w11-distribution-policy.test.mjs" ".\apps\desktop\w12-native-key-safety.test.mjs"
if($LASTEXITCODE -ne 0){throw "W12_STATIC_SECURITY_TESTS_FAILED"}
Write-Host "W12 WINDOWS USER-SCOPED DPAPI RUST TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try{
    & cargo test --lib windows_secret_store
    if($LASTEXITCODE -ne 0){throw "W12_WINDOWS_DPAPI_TESTS_FAILED"}
}finally{Pop-Location}
Write-Host "W12 NATIVE PROTECTION PROOF PASSED, NOT YET DEVICE ENROLLMENT OR PRODUCTION CREDENTIAL STORAGE" -ForegroundColor Green
Write-Host "W05/W06 SAVED SQLITE AND W08/W10 TEST MYSQL UNCHANGED" -ForegroundColor Green
