#requires -Version 5.1
# W10 full one-time acceptance runner. If W10 MariaDB stage succeeds, DO NOT
# re-run this file: re-run only run-w10-native-release-gates.ps1 when needed.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$current = (& git branch --show-current).Trim()
if ($current -ne "feat/foon-windows-w10-http-mariadb-20261019") {
    throw "W10_FULL_BRANCH_REQUIRED"
}

Write-Host "FOON WINDOWS - W10 CONTINUOUS ACCEPTANCE" -ForegroundColor Cyan
Write-Host "Stage 1: safety regression + one-time local HTTP/MariaDB integration." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "run-w10-windows.ps1")
if ($LASTEXITCODE -ne 0 -or -not $?) { throw "W10_FULL_DATABASE_STAGE_FAILED" }

Write-Host "Stage 2: complete offline Node and Rust tests + Windows NSIS build." -ForegroundColor Cyan
Write-Host "If this second stage fails, DO NOT rerun Stage 1; use run-w10-native-release-gates.ps1 only." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "run-w10-native-release-gates.ps1")
if ($LASTEXITCODE -ne 0 -or -not $?) { throw "W10_FULL_NATIVE_STAGE_FAILED" }

Write-Host "FOON W10 COMBINED ACCEPTANCE FINISHED" -ForegroundColor Green
Write-Host "W10 local test and baseline Windows shell packaging passed." -ForegroundColor Green
Write-Host "This is NOT a production cloud-sync acceptance or merchant-ready installer." -ForegroundColor Yellow
