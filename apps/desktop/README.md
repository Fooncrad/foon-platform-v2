# FOON Desktop — Windows (batch W01)

This is **starter source code** for a Tauri 2 native Windows station, **not a production POS installer**. Existing Node 24 + SQLite FOON Edge scripts remain the operational engine; they are NOT yet bundled or automatically started in W01. The desktop UI is an offline static asset and only probes whether TCP `127.0.0.1:8788` has a listener. An open TCP port is **not** proof of trusted FOON Edge, authentication or sync.

## Release gates

- Produce a trusted official Windows 10/11 x64 package using Tauri 2, Rust stable, C++ build tools and WebView2.
- Package a private Node **24** runtime and the existing FOON Edge console, gateway, UI assets and SQLite sync worker (W02); merchants must not install Node or MySQL.
- Enroll devices and store keys in protected Windows state (W03), never WebView/local storage/frontend bundles or logs.
- Add native process lifecycle with verified service health, login, crash/reboot and reconnect acceptance (W04).
- Complete POS/KDS/customer LAN menu workflows (W05), then printer integration only after core website acceptance (W06). No offline card payment without provider-certified support.
- Build and test NSIS installation on a **real Windows machine** before declaring `FOON-Setup.exe` ready (W07).

## Local development (PowerShell on Windows)

From `apps/desktop` on an approved workstation with Node 24, Rust and the Windows native build tools:

```powershell
npm install
npm test
npm run desktop:build
```

The NSIS output is shell-only at `src-tauri/target/release/bundle/nsis/` if the toolchain is configured. Production secrets are never needed at build time. A read-only configuration check on a provisioned machine is `npm run preflight`; it intentionally fails closed without the private configuration.

## Tests and security

`desktop-gate.mjs` validates Windows/Node 24, HTTPS cloud URL, no TLS bypass, loopback gateway, LAN TLS, distinct ports, absolute private local data paths and matching tenant/branch operator identity. `desktop-gate.test.mjs` uses **synthetic** values only. Preflight prints code-only diagnostics, never tokens.

## FOON workflow

1. Test source locally outside GitHub Actions, preserving logs and exact SHA.
2. Commit small reviewed batches to a dedicated feature branch. Raise a PR after applicable Windows build and install checks; user merges manually.
3. No Hostinger deployment, production data changes or automatic merge from the Desktop branch.

**Verified:** 11/11 pure JavaScript validation tests pass in the available Node 22 Linux environment with simulated Windows Node 24 runtime; JSON config and frontend JS syntax checked. **Not verified:** Rust/Tauri build, native Windows install, actual SQLite gateway startup or cloud sync.
