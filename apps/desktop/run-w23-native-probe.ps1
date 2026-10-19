#requires -Version 5.1
# W23 distinct TEST-ONLY native shell build without bundled Node backend.
# No W05/W06 saved SQLite, no W08/W10 MariaDB, no live printers/cloud.
param([switch]$BuildProbe)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w23-native-only-distribution-probe-20261019') {
    throw 'W23_BRANCH_REQUIRED'
}
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($LASTEXITCODE -ne 0 -or $major -lt 24) { throw 'W23_NODE24_REQUIRED' }
$tests = @(
    '.\apps\desktop\w11-distribution-policy.test.mjs',
    '.\apps\desktop\w23-native-probe-audit.test.mjs'
)
Write-Host 'W23 SAFETY REGRESSIONS - NO SAVED DATABASE WRITES' -ForegroundColor Cyan
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'W23_NODE_TESTS_FAILED' }
& node '.\apps\desktop\w23-native-probe-audit.mjs'
if ($LASTEXITCODE -ne 0) { throw 'W23_NATIVE_PROBE_STATIC_AUDIT_FAILED' }
Write-Host 'W23 RUST TEST COMPILATION WITH NATIVE-PROBE FEATURE' -ForegroundColor Cyan
Push-Location (Join-Path $PSScriptRoot 'src-tauri')
try {
    & cargo test --offline --lib --features native-probe -- --skip native_outbox_readonly::tests::native_reader_reports_only_pending_rows_with_node_compatible_digests
    if ($LASTEXITCODE -ne 0) { throw 'W23_PROBE_RUST_TEST_FAILED' }
} finally { Pop-Location }
Write-Host 'PASS: native-probe feature compiled; W05 legacy build left unchanged.' -ForegroundColor Green
if (-not $BuildProbe) {
    Write-Host 'NSIS build not requested. To build ONLY the isolated probe, run this file with -BuildProbe.' -ForegroundColor Yellow
    Write-Host 'W11 commercial installer remains BLOCKED. Native probe is NOT a POS.' -ForegroundColor Yellow
    return
}
$tauri = Join-Path $PSScriptRoot 'node_modules\.bin\tauri.cmd'
if (-not (Test-Path -LiteralPath $tauri -PathType Leaf)) {
    throw 'W23_LOCAL_TAURI_CLI_MISSING' 
}
$started = Get-Date
Write-Host 'W23 NSIS NATIVE SECURITY PROBE BUILD (NO INSTALL)' -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
    & $tauri build --features native-probe --config './src-tauri/tauri.native-probe.conf.json'
    if ($LASTEXITCODE -ne 0) { throw 'W23_ISOLATED_NSIS_PROBE_BUILD_FAILED' }
} finally { Pop-Location }
$folder = Join-Path $PSScriptRoot 'src-tauri\target\release\bundle\nsis'
$installers = @(Get-ChildItem -LiteralPath $folder -Filter 'FOON Native Security Probe*setup.exe' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $started.AddMinutes(-1) } | Sort-Object LastWriteTime -Descending)
if ($installers.Count -ne 1) {
    throw 'W23_NATIVE_PROBE_INSTALLER_NOT_UNIQUELY_IDENTIFIED'
}
$installer = $installers[0]
Write-Host ('ISOLATED TEST PROBE: ' + $installer.Name) -ForegroundColor Cyan
Write-Host ('SHA256: ' + (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash)
$sevenZip = Get-Command '7z.exe' -ErrorAction SilentlyContinue
if ($sevenZip) {
    $listing = @(& $sevenZip.Source l -slt $installer.FullName)
    if ($LASTEXITCODE -ne 0) { throw 'W23_NSIS_ARCHIVE_LISTING_FAILED' }
    $forbidden = @($listing | Where-Object { $_ -match '(?i)(edge-runtime|foon-lan-sqlite|receipt-signature|\.mjs($|\s)|node\.exe($|\s))' })
    if ($forbidden.Count -ne 0) { throw 'W23_NSIS_CONTAINS_LEGACY_BACKEND_RESOURCE' }
    Write-Host 'W23 NSIS archive listing contains no named legacy Node backend resources.' -ForegroundColor Green
} else {
    Write-Host 'Independent installer extraction audit NOT performed (7z.exe unavailable).' -ForegroundColor Yellow
}
Write-Host 'W23 SECURITY PROBE BUILT - NOT POS, NOT COMMERCIAL APPROVAL, DO NOT DISTRIBUTE.' -ForegroundColor Yellow
