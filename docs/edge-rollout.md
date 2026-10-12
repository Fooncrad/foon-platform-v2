# FOON Edge deployment and acceptance

Edge remains opt-in. Deploying the source alone does not enable device ingestion or prove restaurant readiness.

## Cloud deployment

1. Confirm checks on the exact release SHA, the Hostinger published SHA, and `/api/health`.
2. Review the existing schema and take a verified backup before any production schema change. Migration `0075_edge_devices.sql` creates the registry and `0077_employee_authorization.sql` adds the employee branch and permission tables required by current main; never reset customer data. Use a reviewed migration plan, not an automatic production seed. Run the read-only catalog integrity checker before relying on resource references from `0074`.
3. Set a server-only random `FOON_EDGE_MASTER_RECEIPT_KEY` with at least 48 bytes. Keep `FOON_EDGE_PLAIN_TAKEAWAY_ENABLED=false` until the isolated tests and initial device provisioning pass.
4. From an authorized trusted server terminal, run `scripts/provision-edge-device.mjs --tenant UUID --branch UUID --actor UUID --name NAME --output PRIVATE_FILE`. It verifies active tenant, branch, membership and actor. The output contains device credentials and must never be committed, logged, sent to a browser or attached to support tickets.
5. Assign a separate registered identity to each cashier/kitchen operator. The central API rechecks membership, role, branch and device inside the inbox transaction. Revoke via `edge_devices.enabled=FALSE` using an authorized maintenance procedure. Rotating the master receipt key requires re-provisioning local receipt keys.
6. Enable `FOON_EDGE_PLAIN_TAKEAWAY_ENABLED=true` only for the reviewed plain takeaway policy: no tax adjustments, discounts, choices or card payments. Do not use this mode where a fiscal rule or business policy requires an unsupported adjustment.

## Local restaurant station

Install Node 24 on a trusted host. Protect its disk, backups and configuration using OS permissions. Configure a private `FOON_EDGE_USERS_FILE` JSON array. Each entry needs `username`, `passwordHash`, `role`, `tenantId`, `branchId`, `deviceId`, `cloudToken`, and `signingSecret`; the last two values come from enrollment. All entries on one station must share a tenant and branch. Non-owner actors must have an enabled branch assignment and explicit pos.view/pos.create (cashier) or kitchen.view/kitchen.edit (kitchen) grants. Explicit denial overrides manage. Review these grants before enrollment; never infer authority from an email address. Password hashes use `scrypt:SALT:HASH`; `scripts/hash-edge-operator-password.mjs` reads a private password from stdin. Never place service tokens in browser storage.

Set private `FOON_LAN_TOKEN` and `FOON_EDGE_ACK_SECRET`, each at least 32 characters, plus `FOON_EDGE_CLOUD_SYNC_URL=https://nfoodz.com/api/edge/sync`. Use persistent `FOON_LAN_DB` and `FOON_EDGE_CATALOG_CACHE` paths on protected storage. Start `node scripts/start-edge-console.mjs` from the repository root.

The gateway binds to loopback port 8787 and the browser console to loopback port 8788. Other restaurant devices require an independently reviewed HTTPS reverse proxy, valid certificates and firewall restrictions. Do not expose the gateway token or ACK endpoint to browsers, disable TLS checks, or bind either service directly to an unrestricted network interface.

Initial online enrollment/catalog synchronization is required. Cached authorization lasts at most eight hours; expired grants fail closed. Known online revocation or role changes remove the cached grant immediately. Offline authorization cannot observe remote revocation until connectivity returns or the grant expires.

## Operator behavior

- Save a plain takeaway order locally; its menu estimate is not a fiscal invoice or evidence of electronic payment.
- The expected unit price/currency is bound to the event. A price change is rejected rather than silently repricing the customer's order.
- Local POS/KDS share persisted SQLite orders. Active cloud orders are imported without overwriting unsynchronized local work or accepting older cloud versions.
- Creation/status events keep their original device identity. Cloud receipts are verified against that identity and exact payload before ACK; receipt IDs remain stored locally.
- Conflicts retain the event and stop automatic resubmission. Explicit retry releases only the signed-in operator's own events, without changing the original payload or declaring cloud success. Resolve price/identity conflicts through an authorized operational review; do not delete the queue to clear an error.

## Required acceptance on the actual restaurant equipment

Check login and role restrictions, Arabic/English/French, 320px layout, online order visibility, local takeaway creation, kitchen status changes, Internet disconnect, gateway/host restart, reconnect, lost ACK and duplicate delivery. Compare one cloud business mutation with one durable receipt. Also check competing device updates, catalog/price conflicts, revocation, authorization expiry, disk-full/power-loss behavior and recovery from verified SQLite backups.

Printing/FOON Connect and offline card payment are separate projects. Taxes/discounts/options/table occupancy must follow a separately implemented and reviewed policy before those modes can be enabled locally.
