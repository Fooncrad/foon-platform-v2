#requires -Version 5.1
# W06: reuse checksum-verified W04 Node24 and bundle only a read-only synthetic SQLite inspector.
# Does not touch merchant DB, network settings, production or existing W05 user data.
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "prepare-w04.ps1")
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "W04_RUNTIME_PREPARATION_FAILED" }
$from = Join-Path $PSScriptRoot "w06-inspect-sqlite.mjs"
$to = Join-Path $PSScriptRoot "src-tauri\resources\edge-runtime\scripts\w06-inspect-sqlite.mjs"
if (-not (Test-Path -LiteralPath $from -PathType Leaf)) { throw "W06_INSPECT_SOURCE_MISSING" }
Copy-Item -LiteralPath $from -Destination $to -Force
if (-not (Test-Path -LiteralPath $to -PathType Leaf)) { throw "W06_INSPECT_BUNDLE_MISSING" }
Write-Host "W06 READ-ONLY INSPECTOR BUNDLED" -ForegroundColor Green
