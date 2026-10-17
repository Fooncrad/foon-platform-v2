# FOON Desktop — Windows bootstrap (phase 1)

Status: **design/bootstrap only, not released, installed, tested or production-ready**.

## Integration decision

Build a signed Windows desktop shell with Tauri v2 and a React/Vite UI that talks to the **existing trusted FOON Edge Node/SQLite gateway**, rather than embedding the Next.js production site or creating an independent order database. Keep all cloud tenant, branch, employee and device authorization server-side. The existing `scripts/FOON-EDGE-SYNC.md` safety contract governs all synchronisation.

Proposed layout (not yet implemented):
- `apps/desktop/`: Windows shell, isolated operator UI, native lifecycle and updater.
- `scripts/foon-lan-gateway.mjs`: existing local LAN gateway; do not replace with an incompatible implementation.
- `scripts/foon-edge-sync-bridge.mjs`: existing trusted cloud synchronization bridge, with signed durable receipt verification.
- `app/api/`: central server endpoints; review existing device registration and sync routes before adding any.

## Phase 1 acceptance criteria

1. Installer launches a locally packaged, versioned Windows application **without loading nfoodz.com as a remote webview**.
2. First-run setup pairs a device to an authenticated tenant and branch online; pairing cannot grant elevated staff roles.
3. A local gateway starts and survives restarts; secrets live outside client JavaScript and webview storage.
4. The shell reports `online`, `local-only` and `disconnected` accurately, and shows `pending/retrying/conflict/synced` as distinct states.
5. After initial setup, sample product catalog and a cash POS transaction persist to local SQLite when the WAN is disconnected; no offline card authorization is claimed.
6. Offline order survives app restart; later synchronization applies it exactly once to cloud MySQL, with a verified durable receipt before local ACK.
7. Duplicate replay, wrong tenant/branch, revoked device and loss of ACK are rejected or reconciled safely.
8. No production migrations, deployments or automatic merges.

## Mandatory local verification

Use Node 24 and the disposable MariaDB test database only. At minimum run existing tests:
```sh
node --test scripts/foon-lan-sqlite.test.mjs
node --test scripts/foon-edge-sync-bridge.test.mjs
node --test scripts/foon-edge-sync-worker.test.mjs
node --test scripts/foon-edge-end-to-end.test.mjs
npm run typecheck
npm run build
```
Additional Tauri/Rust checks and a real Windows installer smoke test are required when the shell is implemented. **No GitHub Actions testing is required by this plan.** Test locally before opening a merge-ready PR.

## Explicit exclusions

No offline electronic card payment without certified provider support; no printer hardware phase yet; no forced cloud sync claims when offline; no live MySQL credentials in Windows assets. Do not expose privileged LAN gateway bearer tokens to embedded web content.

## Release gate

Only after independent local checks pass, publish an artifact from a controlled Windows build, create a PR to the reviewed target branch, and leave merge/deployment to the owner.
