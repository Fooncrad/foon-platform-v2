# FOON Windows W28 — Original cloud UI baseline + durable offline development station

**Exact visual reference:** source commit `5e1b369d660b197bf645cc52dc7de7f01d07443a` on production `main` (October 22, 2026).
W28 vendors the **unmodified** 4 CSS files from that commit in `apps/desktop/cloud-parity/main-5e1b369d/`, and stores the **complete** merchant section/role translation inventory of the same commit. No cloud source or production database is changed. This does **not** certify pixel-perfect or functional 100% parity.

## Guaranteed coverage inventory

- **26/26 cloud merchant navigation entries captured**, including room service, pickup points and public storefront controls absent in earlier W27 source.
- **15/15 configured merchant activities captured**.
- **8/8 order channels captured**.
- Exact source SVG geometry is used for the supported sidebar icon set.
- RTL Arabic, English LTR, French LTR switcher retained; original merchant CSS and per-activity color palette loaded from the same snapshot.
- Original module role visibility used when populating local sidebar, with a server-side session required. Do not infer access from a disabled item.

### Offline operations actually implemented

W27-based **POS, orders and KDS** local demonstration only, with fake items, no real cashier settlement, no live store database, no cloud sync and no printer. Modules marked not yet ported are intentionally disabled but visible to permitted roles so feature omissions cannot masquerade as a finished build.

Remaining **23 source-defined merchant modules are inventoried, not implemented** offline. Their actual workflows, local APIs, grants, settings and resources must be ported one by one from current cloud code, without silently ignoring a section. Equivalent support for all 8 order channels, invoices, taxes, kitchen routing, media and translation of dynamic content is NOT yet verified.

## Persistent development runner

From repository root or `apps/desktop`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\desktop\run-w28-development.ps1
```

- Requires Node 24 (Node 26 only for diagnostic development), Windows x64 and an extracted W28 source tree, but does not need Internet while running.
- Will use **only** `%LOCALAPPDATA%\FOON\W28-DEVELOPMENT-ONLY`. It refuses any existing production-related `FOON_...` process environment.
- Generates synthetic cashier/kitchen identities and displays the development password once. Save it in a password manager, not chat.
- Uses loopback ports 8787/8788 by default (may be overridden via `FOON_W28_GATEWAY_PORT` / `FOON_W28_CONSOLE_PORT`).
- Orders/events/Outbox remain on disk after stopping, **unlike W27's disposable temp lab**. Device identity and receipts keys are kept separate from W05/W06 or any merchant data.
- **DO NOT delete SQLite WAL/SHM or modify data while process is running.** Abrupt process exit can leave `station.lock`; investigate the old process before manually resolving a stale lock.
- Initial synthetic cache has a **7-hour** lease. On expiry startup is deliberately blocked. Do not work around by editing timestamps; a trusted, pinned, device-bound signed long-outage grant is still required for real operations.
- Password hashes are scrypt, but Windows filesystem ACL hardening and protected native key storage are not completed for this demo.

### Development password rotation

If the one-time password was copied into chat or a shared log, **stop W28** using Ctrl+C, then run the following from the downloaded W28 source root after refreshing the source to the current branch:

```powershell
node .\scripts\foon-edge-w28-rotate-synthetic-passwords.mjs --development-only
```

The command changes only each synthetic user's password hash in `users.json`, prints **four newly generated distinct passwords once locally**, and keeps device identities, signing keys, cached catalogs, SQLite orders and Outbox unchanged. It refuses to run while `station.lock` exists. Do not upload console passwords. This is *not* production credential provisioning or Windows ACL hardening.

### SQLite WAL-consistent backups

In a separate PowerShell window, while the station is running or stopped:

```powershell
node .\scripts\foon-edge-durable-development-backup.mjs --development-only
```

This performs a read-only SQLite online backup and a separate integrity check into the profile's `backups` subfolder; **no file-level copying of a live WAL** and no modification of original pending Outbox. Restore flow and scheduled backup retention are pending, do not mistake this for business disaster recovery.

## No-release gates

1. **Functional reuse of the original React/Next.js modules**, and a local API+permissions/data adapter — not yet completed. CSS parity alone is insufficient.
2. Real tenant/branch device enrollment, hard-authenticated offline grants, secure Windows key isolation and anti-clock-rollback.
3. All activity modules/checkout channels, tax/VAT/excise, invoices, payment restrictions, printers and images/assets.
4. All-day or multi-day unattended operation, local Wi-Fi QR, health supervision/auto-start and recovery after crash/reboot.
5. Secure commercial packaging (W11 source-exposure blocker), Node24 qualification and Windows/NSIS full-machine acceptance.
6. Cloud ACK synchronization and conflicts only after original cloud comes back; test using synthetic isolated receiver first.

This is a **stacked development PR based on W27**, not a PR ready to merge into `main` and not an EXE. Do not deploy to real shops or merge automatically.
