#requires -Version 5.1
# W27 follow-up: W26 native signature tests with a temporary, non-shipping
# Tauri resource placeholder. NO production DB, cloud, installer, or downloads.
$ErrorActionPreference = 'Stop'
$desktop = $PSScriptRoot
$root = (Resolve-Path -LiteralPath (Join-Path $desktop '..\..')).Path
$native = Join-Path $desktop 'src-tauri'
$resources = Join-Path $native 'resources\edge-runtime'
$testMarker = Join-Path $resources 'W26-SYNTHETIC-TEST-ONLY.txt'
$madeDir = $false
$madeMarker = $false
$priorOffline = $env:CARGO_NET_OFFLINE

if (-not (Test-Path -LiteralPath (Join-Path $root 'scripts\foon-edge-offline-policy.mjs') -PathType Leaf)) {
    throw 'W27_SOURCE_REQUIRED'
}
if (-not (Test-Path -LiteralPath (Join-Path $native 'Cargo.toml') -PathType Leaf)) {
    throw 'W26_CARGO_MANIFEST_MISSING'
}
if (@('FOON_LAN_DB','FOON_W24_TEST_DB_PATH','FOON_W25_TEST_DB_PATH',
       'FOON_W26_SIGNED_DOCUMENT','FOON_W26_TEST_PUBLIC_XY') |
        Where-Object { [Environment]::GetEnvironmentVariable($_, 'Process') }) {
    throw 'W26_PREEXISTING_TEST_DB_OR_SIGNATURE_ENV_REFUSED'
}
$nodeVersion = (& node -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0 -or -not ($nodeVersion.StartsWith('24.') -or $nodeVersion.StartsWith('26.'))) {
    throw 'W26_NODE_24_OR_26_REQUIRED'
}
if ($nodeVersion.StartsWith('26.')) {
    Write-Warning 'Node 26 diagnostic only; Node 24 still required for Windows release acceptance.'
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'W26_CARGO_NOT_INSTALLED' }
Set-Location -LiteralPath $root
$env:CARGO_NET_OFFLINE = 'true'
try {
    if (-not (Test-Path -LiteralPath $resources)) {
        New-Item -ItemType Directory -Path $resources -Force | Out-Null
        $madeDir = $true
    }
    $dirInfo = Get-Item -LiteralPath $resources
    if ($dirInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'W26_UNSAFE_RESOURCE_DIRECTORY_LINK'
    }
    $existing = @(Get-ChildItem -LiteralPath $resources -File -Recurse -Force)
    if ($existing.Count -eq 0) {
        if (Test-Path -LiteralPath $testMarker) { throw 'W26_TEST_MARKER_CONFLICT' }
        [System.IO.File]::WriteAllText($testMarker,
          'W26 SYNTHETIC TEST RESOURCE ONLY - NOT A RUNTIME OR MERCHANT BUILD')
        $madeMarker = $true
    }
    Write-Host 'W26 NODE SOURCE SAFETY TEST' -ForegroundColor Cyan
    & node --test (Join-Path $desktop 'w26-signed-catalog-safety.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'W26_NODE_TEST_FAILED' }

    Write-Host 'W26 RUST CNG UNIT TESTS (OFFLINE)' -ForegroundColor Cyan
    Push-Location -LiteralPath $native
    try {
        & cargo test --offline --lib 'native_signed_catalog::tests::'
        if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_RUST_FAILED' }
    }
    finally { Pop-Location }

    Write-Host 'W26 15 EPHEMERAL P-256 SIGNATURE CASES (OFFLINE)' -ForegroundColor Cyan
    & node (Join-Path $desktop 'w26-native-signed-catalog-acceptance.mjs') --run
    if ($LASTEXITCODE -ne 0) { throw 'W26_NATIVE_SIGNATURE_FAILED' }

    Write-Host 'W26 SIGNATURE TESTS PASSED - TEST ONLY; NO COMMERCIAL RELEASE' -ForegroundColor Green
}
finally {
    $env:CARGO_NET_OFFLINE = $priorOffline
    if ($madeMarker) {
        Remove-Item -LiteralPath $testMarker -Force -ErrorAction SilentlyContinue
    }
    if ($madeDir -and (Test-Path -LiteralPath $resources) -and
        @(Get-ChildItem -LiteralPath $resources -Force).Count -eq 0) {
        Remove-Item -LiteralPath $resources -ErrorAction SilentlyContinue
    }
}
