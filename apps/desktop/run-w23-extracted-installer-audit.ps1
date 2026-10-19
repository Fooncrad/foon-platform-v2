#requires -Version 5.1
# W23: verify the exact already-built NSIS; never build/install/execute.
# No saved SQLite, MariaDB, production, or network requests.
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[0-9A-Fa-f]{64}$')]
    [string]$ExpectedSHA256
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'feat/foon-windows-w23-native-only-distribution-probe-20261019') {
    throw 'W23_BRANCH_REQUIRED'
}
$script:sevenZip = $null
$tool = Get-Command '7z.exe' -ErrorAction SilentlyContinue
if ($tool) { $script:sevenZip = $tool.Source }
if (-not $script:sevenZip) {
    $programDirs = @($env:ProgramFiles, [Environment]::GetFolderPath('ProgramFilesX86'))
    foreach ($dir in $programDirs) {
        if (-not $dir) { continue }
        $candidate = Join-Path $dir '7-Zip\7z.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $script:sevenZip = $candidate
            break
        }
    }
}
if (-not $script:sevenZip) {
    throw 'W23_7ZIP_REQUIRED: Install 7-Zip from its official source or with winget install --id 7zip.7zip -e, then retry. No rebuild is required.'
}
$packageDir = Join-Path $PSScriptRoot 'src-tauri\target\release\bundle\nsis'
$installer = Join-Path $packageDir 'FOON Native Security Probe_0.1.4_x64-setup.exe'
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw 'W23_EXPECTED_NSIS_NOT_FOUND'
}
$actualHash=(Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
if ($actualHash -ne $ExpectedSHA256.ToUpperInvariant()) {
    throw 'W23_NSIS_SHA256_MISMATCH: Refusing to inspect an unexpected installer.'
}
$policy = Join-Path $PSScriptRoot 'w23-extracted-file-policy.mjs'
if (-not (Test-Path -LiteralPath $policy -PathType Leaf)) {
    throw 'W23_POLICY_SOURCE_NOT_FOUND'
}
$tempRoot=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
$random=[guid]::NewGuid().ToString('N')
$scratch=Join-Path $tempRoot ("FOON-W23-Audit-" + $random)
New-Item -ItemType Directory -Path $scratch -ErrorAction Stop | Out-Null
$script:stage=0
$script:totalUncompressed=0L
$script:filesExamined=0
$script:maxUncompressed=268435456L
$script:maxFiles=5000

function Inspect-Archive {
    param([string]$Archive, [int]$Depth)
    if ($Depth -gt 4) { throw 'W23_ARCHIVE_NESTING_LIMIT' }
    $script:stage++
    $target=Join-Path $scratch ("extract-" + $script:stage)
    New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
    # Extract, never execute the installer or nested binaries.
    & $script:sevenZip x '-y' "-o$target" $Archive | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'W23_7ZIP_EXTRACTION_FAILED' }

    $nodes=@(Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction Stop)
    $files=@()
    foreach($entry in $nodes) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'W23_EXTRACTED_REPARSE_POINT_FORBIDDEN'
        }
        if ($entry.PSIsContainer) { continue }
        $script:totalUncompressed += [int64]$entry.Length
        $script:filesExamined++
        if ($script:totalUncompressed -gt $script:maxUncompressed -or $script:filesExamined -gt $script:maxFiles) {
            throw 'W23_EXTRACTED_RESOURCE_LIMIT'
        }
        $files += $entry
    }
    if ($files.Count -eq 0) { throw 'W23_EXTRACTED_ARCHIVE_EMPTY' }

    $manifestPaths=@()
    $nested=@()
    foreach($file in $files) {
        $rel=$file.FullName.Substring($target.Length).TrimStart('\','/')
        if ($rel -match '(?i)\.(?:7z|zip|tar|tgz|gz|cab|nupkg)$') {
            $nested += $file.FullName
        } else {
            $manifestPaths += $rel
        }
    }
    if ($manifestPaths.Count -gt 0) {
        $manifest=Join-Path $scratch ("manifest-" + $script:stage + ".json")
        $json=ConvertTo-Json -InputObject @($manifestPaths) -Compress -Depth 5
        [IO.File]::WriteAllText($manifest,$json,(New-Object System.Text.UTF8Encoding($false)))
        & node $policy $manifest
        if ($LASTEXITCODE -ne 0) { throw 'W23_UNSAFE_EXTRACTED_CONTENT' }
    }
    foreach($nestedArchive in $nested) {
        Inspect-Archive -Archive $nestedArchive -Depth ($Depth+1)
    }
}
try {
    Write-Host ('W23 auditing existing installer SHA256 ' + $actualHash) -ForegroundColor Cyan
    Inspect-Archive -Archive $installer -Depth 0
    Write-Host ('PASS: ' + $script:filesExamined + ' extracted files examined across ' + $script:stage + ' archives.') -ForegroundColor Green
    Write-Host 'No named unpacked Node runtime, raw backend source, secrets or uninspected nested archives found.' -ForegroundColor Green
    Write-Host 'DIAGNOSTIC ONLY: not POS, not DRM, and not commercial-release approval.' -ForegroundColor Yellow
    Write-Host 'Legacy W11 commercial installer remains BLOCKED.' -ForegroundColor Yellow
} finally {
    $scratchFull=[IO.Path]::GetFullPath($scratch)
    $expectedPath=Join-Path $tempRoot ("FOON-W23-Audit-" + $random)
    if ($scratchFull -eq $expectedPath -and
        $scratchFull.StartsWith((Join-Path $tempRoot 'FOON-W23-Audit-'),[StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $scratchFull -PathType Container)) {
        Remove-Item -LiteralPath $scratchFull -Recurse -Force
    }
}
