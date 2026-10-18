#requires -Version 5.1
# Build/test W06 ONLY in the checked-out dev branch. No cloud access or production mutation.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w06-offline-recovery-20261018") {
    throw "W06_BRANCH_REQUIRED"
}
$tests = @(
    ".\desktop-gate.test.mjs",
    ".\w02-sqlite.integration.test.mjs",
    ".\w02-native-health.test.mjs",
    ".\w03-demo-orders.test.mjs",
    ".\w04-launcher.test.mjs",
    ".\w05-durable.test.mjs",
    ".\w05-durable.integration.test.mjs",
    ".\w06-recovery.test.mjs",
    ".\w06-offline.integration.test.mjs"
)
Write-Host "W06 STEP 1/4 - OFFLINE AND RECOVERY NODE TESTS" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) {throw "W06_NODE_TESTS_FAILED"}
Write-Host "W06 STEP 2/4 - BUNDLE PINNED NODE 24 + READ-ONLY INSPECTOR" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "prepare-w06.ps1")
$node = Join-Path $PSScriptRoot "src-tauri\resources\edge-runtime\node.exe"
$inspect = Join-Path $PSScriptRoot "src-tauri\resources\edge-runtime\scripts\w06-inspect-sqlite.mjs"
if (-not (Test-Path $node) -or -not (Test-Path $inspect)) { throw "W06_RESOURCE_MISSING" }
Write-Host "W06 STEP 3/4 - RUST TESTS" -ForegroundColor Cyan
& npm install
if ($LASTEXITCODE -ne 0) {throw "W06_NPM_INSTALL_FAILED"}
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test
    if ($LASTEXITCODE -ne 0) {throw "W06_CARGO_TESTS_FAILED"}
}
finally {Pop-Location}
Write-Host "W06 STEP 4/4 - WINDOWS NSIS BUILD" -ForegroundColor Cyan
& npm run desktop:build
if ($LASTEXITCODE -ne 0) {throw "W06_WINDOWS_BUILD_FAILED"}
$installer = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis\FOON Desktop_0.1.4_x64-setup.exe"
if (-not (Test-Path -LiteralPath $installer)) {throw "W06_INSTALLER_MISSING"}
Write-Host "W06 WINDOWS BUILD SUCCESSFUL" -ForegroundColor Green
Write-Host $installer -ForegroundColor Green
