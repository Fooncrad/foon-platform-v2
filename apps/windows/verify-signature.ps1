param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [Parameter(Mandatory=$true)][string]$ExpectedThumbprint
)
$ErrorActionPreference="Stop"
if ($env:OS -ne "Windows_NT") { throw "Windows Authenticode verification requires Windows" }
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { throw "INSTALLER_MISSING" }
$expected = ($ExpectedThumbprint -replace '\s','').ToUpperInvariant()
if ($expected -notmatch '^[A-F0-9]{40}([A-F0-9]{24})?$') { throw "INVALID_CERTIFICATE_THUMBPRINT" }
$signature=Get-AuthenticodeSignature -LiteralPath $Installer
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) { throw "INSTALLER_SIGNATURE_NOT_TRUSTED: $($signature.Status)" }
$actual=$signature.SignerCertificate.Thumbprint.ToUpperInvariant()
if ($actual -ne $expected) { throw "WRONG_SIGNING_CERTIFICATE" }
$hash=(Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
Write-Host "SIGNATURE_OK $actual"
Write-Host "SHA256 $hash"
