# FOON Windows W27 — isolated offline-only FOON Edge launch (development)

This change is based on W26 signed-catalog test branch. It DOES NOT integrate W26 verification into production catalog caching; existing catalog data remains unsigned. **NOT APPROVED FOR LIVE STORES OR COMMERCIAL DISTRIBUTION.**

## What changed

- With `FOON_EDGE_OFFLINE_ONLY=1`, `start-edge-console.mjs` starts the **existing** local SQLite gateway and local console without validating a cloud endpoint, making DNS/HTTPS requests, starting periodic cloud polling, importing remote orders or writing fetched cloud catalogs. It still uses loopback HTTP for the local gateway.
- Before starting any local server it checks every configured operator has a cached, device/tenant/branch/role-matching catalog and an unexpired lease of at most **eight hours**; it refuses to silently expand offline entitlements.
- The status is explicitly `offline-only`. Pending Outbox rows stay local: **no cloud ACK** can occur from this launcher in offline-only mode.
- Normal online mode is unchanged. Any ambiguous `FOON_EDGE_OFFLINE_ONLY` value fails startup.
- No change to saved W05/W06 databases, to the production site, MySQL, Windows NSIS build, or printer handling.

## Safe isolated test sequence

Run on a Windows development machine, from the repo root (not production), with Node 24 and only synthetic operators/cache/database in an isolated temporary directory:

```powershell
node --test scripts/foon-edge-offline-policy.test.mjs
node --test scripts/foon-edge-console.test.mjs scripts/foon-edge-console-tls.test.mjs
```

For a live development instance set `FOON_EDGE_OFFLINE_ONLY=1` in **process environment only**, provide synthetic local `FOON_EDGE_USERS_FILE`, `FOON_EDGE_CATALOG_CACHE`, `FOON_LAN_DB`, secrets and two unused loopback ports, then run `node scripts/start-edge-console.mjs`. Leave `FOON_EDGE_CLOUD_SYNC_URL` unset deliberately to verify no online requirement. Check local login and SQLite Outbox with the network disconnected, then restart the process; do not write to W05/W06 data.

## Blockers before an internet-outage-ready product

This mode still needs previously cached *unexpired* authorization; it is **not** a fresh offline enrollment solution. Existing 8-hour expiration is intentional; do not lengthen the lease without a signed, device-bound authorization policy. The W26 ephemeral signed catalog proof is not yet pinned/persisted or integrated. Native packaging currently exposes Node/MJS source (W11 blocker) and lacks a secure bundled merchant runner, trusted LAN certificate enrollment, long-outage recovery, real printer acceptance and end-to-end Windows installation. W27 does not make merchant POS release-ready.
