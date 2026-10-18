#requires -Version 5.1
# FOON W11 confidentiality: one-time read-only source-exposure audit.
# A "blocked" result is EXPECTED for the existing v0.1.4 Node-backed shell;
# never share its NSIS installer as a protected commercial distribution.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root
$current = (& git branch --show-current).Trim()
if ($current -ne "feat/foon-windows-w11-source-exposure-guard-20261019") {
    throw "W11_AUDIT_BRANCH_REQUIRED"
}
Write-Host "W11 - PURE SECURITY POLICY TESTS" -ForegroundColor Cyan
& node --test ".\apps\desktop\w11-distribution-policy.test.mjs"
if ($LASTEXITCODE -ne 0) { throw "W11_AUDIT_UNIT_TESTS_FAILED" }
Write-Host "W11 - INSPECT ACTUAL STAGED DESKTOP FILES (READ ONLY)" -ForegroundColor Cyan
& node ".\apps\desktop\w11-distribution-audit.mjs"
$code = $LASTEXITCODE
if ($code -eq 2) {
    Write-Host "EXPECTED SECURITY GATE: CURRENT v0.1.4 PACKAGE IS NOT CLEARED FOR COMMERCIAL DISTRIBUTION" -ForegroundColor Yellow
    Write-Host "Node .mjs sources can be extracted; migrate sensitive local logic to an audited native Rust engine first." -ForegroundColor Yellow
    Write-Host "NO FILES DELETED, NO DATABASE WRITES, NO DEPLOYMENT" -ForegroundColor Cyan
} elseif ($code -eq 0) {
    Write-Host "W11 HYGIENE GATE PASSED - this NEVER guarantees protection against reverse engineering." -ForegroundColor Green
} else {
    throw "W11_AUDIT_EXECUTION_FAILED"
}
