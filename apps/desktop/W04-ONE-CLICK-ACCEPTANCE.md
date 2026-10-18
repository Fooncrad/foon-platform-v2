# W04 — One-click SQLite demo for Windows x64

Status: unmerged review branch, NOT production-ready. W01–W03 passed real Windows checks; W04 Windows build and runtime are not yet confirmed.

## Features
- FOON Desktop buttons start/stop an isolated bundled Node.js 24 + SQLite test process. No PowerShell needed for everyday W04 test startup.
- Pinned official Node v24.22.0 downloaded during building and SHA256-checked against official Node release checksums. Node binaries and secrets stay out of Git.
- Refuse occupied port 8787 and existing merchant/cloud credentials. Application shuts down only its own child.
- Random credentials, synthetic orders, one random branch and a temporary SQLite database. No cloud synchronization.
- Automatic visual refresh every 8 seconds in the desktop window.
- Normal shutdown clears only the generated demo directory. Power-loss behavior is NOT yet proven and persistent real orders are out of scope.

## Windows build in apps/desktop PowerShell
Use a freshly extracted W04 ZIP. W03 must remain unchanged.

    $ErrorActionPreference = "Stop"
    node --test .\desktop-gate.test.mjs .\w02-sqlite.integration.test.mjs .\w02-native-health.test.mjs .\w03-demo-orders.test.mjs .\w04-launcher.test.mjs
    if ($LASTEXITCODE -ne 0) { throw "W04_NODE_TESTS_FAILED" }
    .\prepare-w04.ps1
    npm install
    if ($LASTEXITCODE -ne 0) { throw "NPM_INSTALL_FAILED" }
    npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw "W04_BUILD_FAILED" }

Expect 27 Node test cases (11 + 1 + 5 + 5 + 5). Rust/NSIS build is a separate Windows check. Run cargo test from src-tauri if needed.

## Direct EXE usage (after build)
Because the user tests the release EXE directly without installing, copy the verified runtime resources next to it first:

    $source = ".\src-tauri\resources\edge-runtime"
    $destination = ".\src-tauri\target\release\resources\edge-runtime"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item "$source\*" $destination -Recurse -Force
    if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { throw "PORT_8787_OCCUPIED_STOP_AND_REPORT" }
    Start-Process ".\src-tauri\target\release\foon-desktop.exe"

Use the new W04 Start button, then create a synthetic order, move it through statuses, check pending counts and Stop. Closing the window should stop the owned child. An existing service on 8787 is never killed automatically.

## W04 limits
This is an opt-in DEMO, not a completed restaurant POS or Windows service. No real merchant device enrollment, persistent production SQLite, Windows secret vault, offline card payment, power-loss recovery, true customer QR, cloud ACK or printer/KDS readiness has been proven.

No GitHub Actions, automatic merge, production DB changes or Hostinger deployment.
