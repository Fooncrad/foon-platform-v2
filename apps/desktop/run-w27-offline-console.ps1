#requires -Version 5.1
# W27 strictly isolated local tests. Never open saved W05/W06 databases or cloud.
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$branch = (& git branch --show-current).Trim()
if ($branch -ne "feat/foon-windows-w27-offline-isolation-20261022") { throw "W27_BRANCH_REQUIRED" }
$version = (& node -p "process.versions.node").Trim()
if ($LASTEXITCODE -ne 0 -or -not $version.StartsWith("24.")) { throw "W27_NODE_24_REQUIRED" }
$tests = @(
 "scripts/foon-edge-offline-policy.test.mjs",
 "scripts/foon-edge-offline-console.integration.test.mjs",
 "scripts/foon-edge-console.test.mjs",
 "scripts/foon-edge-console-tls.test.mjs"
)
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw "W27_LOCAL_ACCEPTANCE_FAILED" }
Write-Host "W27 ISOLATED OFFLINE TESTS COMPLETE - NOT RELEASE APPROVAL" -ForegroundColor Green
