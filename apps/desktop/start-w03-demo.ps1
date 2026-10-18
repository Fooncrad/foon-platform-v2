#requires -Version 5.1
# FOON W03: isolated demo launcher only. Never use production credentials or DB.
$ErrorActionPreference = "Stop"
$gatewayProcess = $null
$demo = $null
try {
    $repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    $gateway = Join-Path $repo "scripts\foon-lan-sqlite.mjs"
    $app = Join-Path $repo "apps\desktop\src-tauri\target\release\foon-desktop.exe"
    if (!(Test-Path $gateway) -or !(Test-Path $app)) { throw "W03_FILES_OR_BUILD_MISSING" }

    $occupied = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    if ($occupied) {
        $owner = $occupied | Select-Object -First 1
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($owner.OwningProcess)"
        Write-Host "Port 8787 is occupied by PID $($owner.OwningProcess), $($process.Name)." -ForegroundColor Yellow
        throw "PORT_8787_OCCUPIED_STOP_VERIFIED_PRIOR_DEMO_MANUALLY"
    }

    if (Get-Process foon-desktop -ErrorAction SilentlyContinue) {
        throw "CLOSE_OLD_DESKTOP_WINDOWS_FIRST"
    }

    function New-Secret {
        $bytes = New-Object byte[] 48
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        ([BitConverter]::ToString($bytes) -replace "-", "").ToLowerInvariant()
    }

    $demo = Join-Path $env:TEMP ("FOON-W03-Demo-" + [guid]::NewGuid().ToString("N"))
    New-Item -Path $demo -ItemType Directory | Out-Null
    $env:FOON_DESKTOP_DEMO_MODE = "1"
    $env:FOON_DESKTOP_DEMO_BRANCH_ID = [guid]::NewGuid().ToString()
    $env:FOON_LAN_DB = Join-Path $demo "orders.sqlite"
    $env:FOON_LAN_TOKEN = New-Secret
    $env:FOON_EDGE_ACK_SECRET = New-Secret
    $env:FOON_LAN_HOST = "127.0.0.1"
    $env:FOON_LAN_PORT = "8787"
    $env:FOON_EDGE_TENANT_ID = ""
    $env:FOON_EDGE_BRANCH_ID = ""
    $env:FOON_EDGE_DEVICE_ID = ""
    $env:FOON_EDGE_CLOUD_SYNC_URL = ""
    $env:FOON_EDGE_RECEIPT_KEYS = "{}"
    $env:FOON_EDGE_RECEIPT_SIGNING_KEY = ""
    $node = (Get-Command node -ErrorAction Stop).Source

    $gatewayProcess = Start-Process -FilePath $node -ArgumentList ('"' + $gateway + '"') -PassThru -WindowStyle Hidden
    $headers = @{ Authorization = "Bearer $env:FOON_LAN_TOKEN" }
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 150
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -Headers $headers -TimeoutSec 2
            if ($health.storage -eq "sqlite-wal-full" -and $health.ok) { $ready = $true; break }
        } catch {
            if ($gatewayProcess.HasExited) { break }
        }
    }
    if (-not $ready) { throw "W03_SQLITE_DEMO_NOT_READY" }
    Write-Host "W03 SQLITE DEMO READY — no cloud synchronization" -ForegroundColor Green
    Write-Host "No production accounts or databases are configured."
    Write-Host "Use the app to create one demo order and advance its status. Close the app to clean up."
    $desktopProcess = Start-Process -FilePath $app -PassThru
    Wait-Process -Id $desktopProcess.Id
}
catch {
    Write-Host "W03 TEST STOPPED: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($gatewayProcess -and -not $gatewayProcess.HasExited) {
        Stop-Process -Id $gatewayProcess.Id -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 700
    }
    foreach ($key in @(
        "FOON_DESKTOP_DEMO_MODE","FOON_DESKTOP_DEMO_BRANCH_ID","FOON_LAN_DB",
        "FOON_LAN_TOKEN","FOON_EDGE_ACK_SECRET","FOON_EDGE_TENANT_ID",
        "FOON_EDGE_BRANCH_ID","FOON_EDGE_DEVICE_ID","FOON_EDGE_CLOUD_SYNC_URL",
        "FOON_EDGE_RECEIPT_KEYS","FOON_EDGE_RECEIPT_SIGNING_KEY",
        "FOON_LAN_HOST","FOON_LAN_PORT"
    )) {
        [Environment]::SetEnvironmentVariable($key,$null,"Process")
    }
    if ($demo -and (Test-Path $demo)) {
        Remove-Item -LiteralPath $demo -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "W03 DEMO CLEANUP FINISHED"
}
