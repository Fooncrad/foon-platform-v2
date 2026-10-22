# Prepares a USB delivery folder for the *unsigned engineering preview*.
# Does not change Windows security, databases, or production deployments.
param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { throw "INSTALLER_MISSING" }
$src = (Resolve-Path -LiteralPath $Installer).Path
if ([IO.Path]::GetExtension($src).ToLowerInvariant() -ne '.exe') { throw "INSTALLER_MUST_BE_EXE" }
$info = Get-Item -LiteralPath $src
if ($info.Length -lt 1000000) { throw "INSTALLER_TOO_SMALL" }
if (-not (Test-Path -LiteralPath $Destination -PathType Container)) { throw "DESTINATION_MISSING" }
$targetRoot = (Resolve-Path -LiteralPath $Destination).Path
$target = Join-Path $targetRoot $info.Name
if (Test-Path -LiteralPath $target) { throw "DESTINATION_INSTALLER_EXISTS" }
$manifestPath = Join-Path $targetRoot "FOON-DELIVERY-README.txt"
if (Test-Path -LiteralPath $manifestPath) { throw "DESTINATION_MANIFEST_EXISTS" }
$sourceHash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
$signature = Get-AuthenticodeSignature -LiteralPath $src
Copy-Item -LiteralPath $src -Destination $target -ErrorAction Stop
$copiedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
if ($sourceHash -ne $copiedHash) {
 Remove-Item -LiteralPath $target -Force
 throw "USB_COPY_HASH_MISMATCH"
}
$manifest = @(
 "FOON Windows Engineering Preview 0.3.0",
 "Installer: $($info.Name)",
 "SHA256: $copiedHash",
 "Signature status: $($signature.Status)",
 "Build type: engineering preview, not production certified",
 "Requires separately configured local MariaDB",
 "Does not include full two-way synchronization",
 "Never disable Windows antivirus or SmartScreen to install",
 "Do not use production customer data for demonstration"
) -join [Environment]::NewLine
[IO.File]::WriteAllText($manifestPath,$manifest,[Text.UTF8Encoding]::new($true))
Write-Host "DELIVERY_COPY_VERIFIED $target"
Write-Host "SHA256 $copiedHash"
Write-Host "SIGNATURE_STATUS $($signature.Status)"
