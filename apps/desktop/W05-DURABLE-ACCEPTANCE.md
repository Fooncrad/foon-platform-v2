# FOON Windows W05 (0.1.3) — opt-in durable synthetic SQLite test

**Not a production POS, restaurant database, or cloud synchronization.**
This branch extends the verified Windows W04 (0.1.2) build, keeping all W04 transient demo behavior.

## Scope

- W04 **temporary** demo remains unchanged: its SQLite DB is deleted when its own child is stopped.
- New W05 **saved test** button reopens a persistent synthetic-only SQLite file under:
  %LOCALAPPDATA%\com.foon.desktop\w05-durable-test\orders.sqlite
- Saves a *nonsecret* random demo branch identity to demo-branch.txt on first start.
- Rejects an existing DB if its branch manifest is missing or malformed. Never invents a replacement ID for existing data.
- The app holds an exclusive OS lock on w05.lock while it owns the gateway. Concurrent attempts fail closed.
- Native gateway only connects to 127.0.0.1:8787 with a new random bearer on each launch. W05 restricts orders to its synthetic branch.
- The Node 24 gateway inherits **no cloud credentials**, receives no production tenant/device identity, and starts no cloud synchronization.
- Stopping W05 or closing the app kills only the gateway child owned by this instance; **W05 data is never automatically deleted**.
- No tokens or DB paths are sent to JavaScript.
- After a crash, a left-behind Node child may hold port 8787; W05 refuses to attach or kill unknown listeners. Report the PID; never automatically terminate others.

## Update existing W05 local repository (Windows PowerShell)

From C:\Users\<WindowsUser>\Desktop\FOON-Windows-W05:

    $ErrorActionPreference="Stop"
    Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
    if ((git status --porcelain)) { throw "W05_LOCAL_CHANGES_STOP" }
    git fetch origin feat/foon-windows-w05-durable-sqlite
    if ($LASTEXITCODE -ne 0) {throw "W05_FETCH_FAILED"}
    git merge --ff-only FETCH_HEAD
    if ($LASTEXITCODE -ne 0) {throw "W05_FAST_FORWARD_FAILED"}
    Set-Location ".\apps\desktop"

    node --test .\desktop-gate.test.mjs .\w02-sqlite.integration.test.mjs .\w02-native-health.test.mjs .\w03-demo-orders.test.mjs .\w04-launcher.test.mjs .\w05-durable.test.mjs .\w05-durable.integration.test.mjs
    if ($LASTEXITCODE -ne 0) {throw "W05_NODE_TESTS_FAILED"}

    .\prepare-w04.ps1
    if (-not (Test-Path ".\src-tauri\resources\edge-runtime\node.exe")) {throw "W05_NODE24_MISSING"}
    npm install
    if ($LASTEXITCODE -ne 0) {throw "W05_NPM_FAILED"}
    Push-Location .\src-tauri
    try {
        cargo test
        if ($LASTEXITCODE -ne 0) {throw "W05_RUST_TESTS_FAILED"}
    } finally { Pop-Location }
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) {throw "W05_BUILD_FAILED"}
    Write-Host "W05 BUILD OK - WINDOWS 0.1.3" -ForegroundColor Green

The expected NSIS installer name is FOON Desktop_0.1.3_x64-setup.exe.
**Do not report a successful Windows build until this actually completes.**

## Acceptance after installing W05

1. Ensure any previous FOON Desktop is closed and port 8787 is free.
2. Open FOON Desktop and click **تشغيل الاختبار المحفوظ** (W05), not W04.
3. Create one synthetic order, transition to completed; expect four pending Outbox events.
4. Click **إيقاف المحرك مع الاحتفاظ بالبيانات**, confirm port 8787 is no longer listening.
5. Close/reopen FOON Desktop. Click W05 Start again. Verify the *same* order ID and 4 pending events.
6. Repeat after reboot in an isolated test window.
7. Try launching another instance while one owns W05. It must NOT bind the same DB or take over unknown processes.

For development tests, separate test fixtures use random OS temp folders and remove only their own disposable fixture directories.
The W05 app data directory remains preserved: **never delete it as a cleanup step**.

## Boundaries

These tests do not establish power-loss resilience for real restaurant data. No merchant account provisioning, authenticated operator/branch access, background Windows Service/boot startup, DPAPI-backed long-term secrets, cloud inbox/outbox ACK, offline payments, printer, QR LAN access or Windows crash recovery guarantee is included.
Do not merge automatically; only after reviewing results from a Windows machine. Do not touch nfoodz.com or production MySQL.
