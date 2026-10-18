#requires -Version 5.1
# Windows-only final baseline test and NSIS packaging; no downloads,
# npm install, production connection, DB write, installer execution or merge.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$current = (& git branch --show-current).Trim()
if ($current -ne "feat/foon-windows-w10-http-mariadb-20261019") {
    throw "W10_RELEASE_BRANCH_REQUIRED"
}
# Allow only known locally generated, untracked build outputs.
# Do not delete them, stage them, or ignore changes to tracked source.
# PS 5.1: use normal porcelain format, where untracked 'gen/' is one entry.
$pendingChanges = @(& git status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { throw "W10_RELEASE_GIT_STATUS_FAILED" }
$allowedUntracked = @(
    "?? apps/desktop/package-lock.json",
    "?? apps/desktop/src-tauri/Cargo.lock",
    "?? apps/desktop/src-tauri/gen/"
)
foreach ($change in $pendingChanges) {
    if ($change -cnotin $allowedUntracked) {
        Write-Host "W10 RELEASE: unexpected modified/untracked file detected." -ForegroundColor Yellow
        throw "W10_RELEASE_UNEXPECTED_WORKTREE_CHANGE"
    }
}
if ($pendingChanges.Count -gt 0) {
    Write-Host "W10 RELEASE: only 3 known untracked npm/Rust/Tauri generated artifacts are permitted; all preserved." -ForegroundColor Yellow
}
$tests = @(
    ".\apps\desktop\desktop-gate.test.mjs",
    ".\apps\desktop\w02-sqlite.integration.test.mjs",
    ".\apps\desktop\w02-native-health.test.mjs",
    ".\apps\desktop\w03-demo-orders.test.mjs",
    ".\apps\desktop\w04-launcher.test.mjs",
    ".\apps\desktop\w05-durable.test.mjs",
    ".\apps\desktop\w05-durable.integration.test.mjs",
    ".\apps\desktop\w06-recovery.test.mjs",
    ".\apps\desktop\w06-offline.integration.test.mjs",
    ".\apps\desktop\w07-sync-sandbox.integration.test.mjs",
    ".\apps\desktop\w08-mariadb-preflight.test.mjs",
    ".\apps\desktop\w08-mariadb-stage2-safety.test.mjs",
    ".\apps\desktop\w09-loopback-http.integration.test.mjs",
    ".\apps\desktop\w10-http-mariadb-guard.test.mjs",
    ".\apps\desktop\w10-http-mariadb-receiver.test.mjs",
    ".\scripts\foon-edge-sync-bridge.test.mjs",
    ".\scripts\foon-edge-sync-worker.test.mjs",
    ".\scripts\foon-edge-mysql-adapter.test.mjs",
    ".\scripts\foon-edge-accept.test.mjs",
    ".\scripts\foon-edge-service.test.mjs"
)
foreach ($test in $tests) {
    if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
        throw "W10_RELEASE_TEST_FILE_MISSING: $test"
    }
}
Write-Host "W10 FINAL VALIDATION - OFFLINE NODE TESTS, NO REAL DATABASE WRITES" -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W10_RELEASE_NODE_TESTS_FAILED" }

Write-Host "W10 FINAL VALIDATION - NATIVE RUST TESTS" -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot "src-tauri")
try {
    & cargo test
    if ($LASTEXITCODE -ne 0) { throw "W10_RELEASE_RUST_TESTS_FAILED" }
}
finally { Pop-Location }

$cli = Join-Path $PSScriptRoot "node_modules\.bin\tauri.cmd"
$runtime = Join-Path $PSScriptRoot "src-tauri\resources\edge-runtime\node.exe"
if (-not (Test-Path -LiteralPath $cli) -or -not (Test-Path -LiteralPath $runtime)) {
    throw "W10_RELEASE_LOCAL_BUILD_TOOLS_MISSING_USE_EXISTING_W06_PREPARE"
}
Write-Host "W10 FINAL VALIDATION - NSIS SHELL BUILD ONLY (NO INSTALL)" -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
    & npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw "W10_RELEASE_NSIS_BUILD_FAILED" }
}
finally { Pop-Location }

$installer = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis\FOON Desktop_0.1.4_x64-setup.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw "W10_RELEASE_INSTALLER_MISSING"
}
$file = Get-Item -LiteralPath $installer
$hash = Get-FileHash -LiteralPath $installer -Algorithm SHA256
Write-Host "W10 WINDOWS BASELINE SHELL BUILD PASSED" -ForegroundColor Green
Write-Host ("INSTALLER: " + $file.FullName) -ForegroundColor Green
Write-Host ("SIZE_BYTES: " + $file.Length)
Write-Host ("SHA256: " + $hash.Hash)
Write-Host "This is the baseline 0.1.4 demo shell, NOT a live cloud-sync product." -ForegroundColor Yellow
Write-Host "Manual Windows install / upgrade / uninstall acceptance and device enrollment still required." -ForegroundColor Yellow
Write-Host "NO DEPLOYMENT, AUTOMATIC MERGE OR PRODUCTION DATABASE USE" -ForegroundColor Cyan
