#requires -Version 5.1
# FOON W28 persistent development station. NO live tenants, real payment or cloud.
# Accept a cloned/extracted W28 repository; no Git/Internet dependency at runtime.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$launcher = Join-Path $root 'scripts\start-edge-durable-lab.mjs'
$manifest = Join-Path $root 'scripts\foon-desktop-cloud-ui-inventory.mjs'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf) -or
    -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
  throw 'W28_SOURCE_ARCHIVE_REQUIRED'
}
if ($env:FOON_LAN_DB -or $env:FOON_EDGE_USERS_FILE -or $env:FOON_EDGE_CLOUD_SYNC_URL) {
  throw 'W28_PRODUCTION_OR_EXISTING_ENVIRONMENT_REFUSED'
}
$node = (Get-Command node -ErrorAction Stop).Source
$version = (& $node -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or -not ($version.StartsWith('24.') -or $version.StartsWith('26.'))) {
  throw 'W28_NODE24_OR26_REQUIRED'
}
if ($version.StartsWith('26.')) {
  Write-Warning 'Node 26 is development diagnostics only; Node 24 must be qualified before any release.'
}
Set-Location -LiteralPath $root
Write-Host 'FOON W28 DEVELOPMENT STATION - PERSISTENT SQLITE' -ForegroundColor Cyan
Write-Host 'Original merchant CSS and source-derived modules. Offline-only local loopback.' -ForegroundColor Cyan
Write-Host 'No database deletion on stop. No cloud sync. Not merchant production.' -ForegroundColor Yellow
& $node $launcher '--development-only'
if ($LASTEXITCODE -ne 0) { throw 'W28_DEVELOPMENT_STATION_FAILED' }
