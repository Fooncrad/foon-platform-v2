# FOON W23 — Native-only Windows source-exposure probe

## Why this exists

The user's W22 synthetic signed ACK transaction suite passed. The W11 distribution audit correctly still rejects legacy NSIS v0.1.4 because it bundles extractable Node/MJS backend sources. To investigate the real bundle boundary without disabling the existing tests or risking the saved W05/W06 database, W23 implements a separate **NON-POS security probe build**.

## Source and configurations

- `src-tauri/tauri.native-probe.conf.json` overrides Tauri resources with an **empty array**, disables the global Tauri JavaScript bridge, sets a strict no-script/no-network CSP, and uses a distinct installation ID `com.foon.desktop.nativeprobe` with an independent product name.
- `ui-native-probe/` is a tiny, static HTML/CSS front end without JavaScript, cloud communication, orders, payment, or printer controls.
- Rust's `native-probe` Cargo feature excludes the W04-W06 Node gateway launcher module and synthetic order module at **compile time**. This build registers **zero Tauri invoke commands**.
- The original default Tauri config, `desktop:release` W11 blocking audit and saved POS shell remain UNCHANGED. No attempt is made to hide or obfuscate the original Node code and call it proprietary.
- `w23-native-probe-audit.mjs` and `w23-native-probe-audit.test.mjs` fail closed if a resource, frontend script, browser/global IPC bridge, shared application identity or unsafe config is reintroduced.
- `run-w23-native-probe.ps1` (ASCII/PS5.1) runs static safety checks and native Rust test compilation using `native-probe`; optional `-BuildProbe` builds a separate NSIS **without installation** and lists package contents when local 7z.exe is available.

## Current limitations

- W23 IS NOT the missing commercial POS engine. It deliberately has no order forms, SQLite writer, sync service, KDS, printer connector, customer receipt or production server route.
- Tauri JSON override and feature-specific Rust packaging must still be tested on the user's Windows machine. This branch's commit structure was checked in GitHub, **but the NSIS contents have NOT been extracted and verified**.
- Even a successfully built native Rust exe is not impossible to reverse engineer. Device, branch and tenant authorization must still be verified by the remote server.
- The FOON production source repository is currently public unless its owner changes the visibility. The security probe doesn't fix GitHub source visibility.
- The legacy W11 audit MUST remain blocked, and the W23 probe MUST NOT be shipped to customers as the FOON Desktop POS.
- The user's W05/W06 original SQLite (3 synthetic orders, 12 pending Outbox), W08/W10 local MariaDB fixtures, Hostinger and production have not been altered. Never rerun the W08/W10 one-shot DB writers.

## Safe Windows test

```powershell
Set-Location "$env:USERPROFILE\Desktop\FOON-Windows-W05"
git fetch origin feat/foon-windows-w23-native-only-distribution-probe-20261019
git switch --track origin/feat/foon-windows-w23-native-only-distribution-probe-20261019
& ".\apps\desktop\run-w23-native-probe.ps1"
```

An optional separate package build is available after the first test passes:

```powershell
& ".\apps\desktop\run-w23-native-probe.ps1" -BuildProbe
```

Neither command installs the NSIS package, modifies saved SQLite, authorizes a production ACK, or changes the main app release. The native-probe Windows installer is a diagnostic artifact and must not be distributed.

## Future product migration

Port production-class order validation, local SQLite WAL/outbox writes, signed ACK and printer queue into a protected native Rust service with independent device enrollment, rotation/revocation and tenant scoping. Replace the old bundled Node runtime in the full product, validate migration/rollback on cloned fixtures, and repeat W11 plus a real extracted-installer audit before customer release.

## W23 post-build independent extraction audit

The user's Windows machine successfully built the 2.00 MiB independent probe. 12/12 Node and 19/19 selected Rust tests passed. As 7z.exe was absent, NSIS content extraction was not verified.

Known built installer SHA256: 2571034EFE767E1F16FD9EA1E70977CF30D8FCFC38A94E23B5586526640E2F19.

Install 7-Zip separately if unavailable, for example with winget install --id 7zip.7zip -e.

After pulling the current W23 branch, run:

~~~powershell
node --test .\apps\desktop\w23-extracted-file-policy.test.mjs
& '.\apps\desktop\run-w23-extracted-installer-audit.ps1' -ExpectedSHA256 '2571034EFE767E1F16FD9EA1E70977CF30D8FCFC38A94E23B5586526640E2F19'
~~~

The verifier checks the exact known SHA256, then recursively extracts the existing NSIS and nested archives into a new temporary folder and rejects exposed Node backend modules, script files, secrets and databases. It never rebuilds or installs the program, and cleanup is limited to that randomly created temp directory.

This is a test-only package inventory, NOT certification, POS completion, security of compiled code, or authority to release the legacy installer. W11 commercial gate stays blocked. No saved W05/W06 SQLite, W08/W10 MariaDB, cloud or printer access.
