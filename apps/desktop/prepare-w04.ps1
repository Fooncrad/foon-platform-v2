#requires -Version 5.1
# Prepare ONLY redistributable, verified Node 24 and existing Edge sources for W04 NSIS.
# No user PATH edits, machine installs, production credentials or GitHub Actions.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtime = Join-Path $PSScriptRoot "src-tauri\resources\edge-runtime"
$tempFolder = Join-Path $env:TEMP ("FOON-W04-Prepare-" + [guid]::NewGuid().ToString("N"))
$version = "v24.22.0"
$base = "https://nodejs.org/dist/$version"
$nodePath = "win-x64/node.exe"

if (-not [Environment]::Is64BitOperatingSystem) { throw "WINDOWS_X64_REQUIRED" }
New-Item -Path $tempFolder -ItemType Directory | Out-Null
try {
    $checksums = Join-Path $tempFolder "SHASUMS256.txt"
    $downloaded = Join-Path $tempFolder "node.exe"
    Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -OutFile $checksums -UseBasicParsing
    $lines = Get-Content $checksums
    $entry = $lines | Where-Object { $_ -match "^[0-9a-fA-F]{64}\s+win-x64/node\.exe$" } | Select-Object -First 1
    if (-not $entry) { throw "OFFICIAL_NODE_CHECKSUM_MISSING" }
    $expected = ($entry -split "\s+")[0].ToLowerInvariant()
    Invoke-WebRequest -Uri "$base/$nodePath" -OutFile $downloaded -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "NODE_OFFICIAL_SHA256_MISMATCH" }

    $files = @(
        @{from="scripts\foon-lan-sqlite.mjs";to="scripts\foon-lan-sqlite.mjs"},
        @{from="scripts\foon-edge-sync-contract.mjs";to="scripts\foon-edge-sync-contract.mjs"},
        @{from="lib\platform\edge-sync-receipt-signature.mjs";to="lib\platform\edge-sync-receipt-signature.mjs"}
    )
    foreach ($file in $files) {
        $src = Join-Path $repo $file.from
        if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "EDGE_SOURCE_FILE_MISSING" }
    }

    New-Item -Path $runtime -ItemType Directory -Force | Out-Null
    foreach ($file in $files) {
        $dest = Join-Path $runtime $file.to
        New-Item -Path (Split-Path $dest -Parent) -ItemType Directory -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $repo $file.from) -Destination $dest -Force
    }
    Copy-Item -LiteralPath $downloaded -Destination (Join-Path $runtime "node.exe") -Force

    $runtimeVersion = & (Join-Path $runtime "node.exe") --version
    if ($LASTEXITCODE -ne 0 -or $runtimeVersion -ne $version) {
        throw "BUNDLED_NODE_VERSION_MISMATCH"
    }
    Write-Host "FOON W04 RUNTIME READY: $version" -ForegroundColor Green
    Write-Host "NODE SHA256 VERIFIED" -ForegroundColor Green
    Write-Host "EDGE SCRIPTS BUNDLED" -ForegroundColor Green
}
finally {
    Remove-Item -LiteralPath $tempFolder -Force -Recurse -ErrorAction SilentlyContinue
}
