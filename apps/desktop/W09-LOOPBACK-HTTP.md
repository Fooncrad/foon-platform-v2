# FOON Windows W09 — loopback HTTP outage and reconciliation sandbox

**Status:** Implementation committed to a feature branch; Windows execution result is required before considering the stage verified. No merges or deployment.

## Scope

W08 proved local MariaDB's isolated inbox/transaction logic on 2026-10-19, with four synthetic inbox events and orders inside \`foon_edge_test\`. Do **not** rerun W08's one-time writer (the database is no longer empty).

W09 specifically exercises **actual HTTP/TCP** between:
- The existing FOON LAN gateway \`scripts/foon-lan-sqlite.mjs\` running as a child process on loopback, with a NEW disposable temp SQLite database.
- A test-only HTTP receiver \`apps/desktop/w09-loopback-http-receiver.mjs\`, listening **only on 127.0.0.1** and using W07's durable disposable SQLite inbox.
- The EXISTING \`syncLocalOutbox\` bridge. Its production \`validateCloudEndpoint\` still requires HTTPS, forbids local/private IPs and enforces approved cloud endpoint rules. W09 uses a test-only injected \`fetchImpl\` that sends the reserved synthetic \`https://w09-sandbox.invalid/edge/sync\` traffic to the loopback receiver; no weakening or production configuration changes.

These tests run in a fresh OS temporary directory per test and remove only that temporary directory. They do **not** read, change, delete or ACK W05/W06 saved desktop orders or the 12 original pending Outbox events. They also do not touch W08's test MariaDB tables or Hostinger MySQL.

## Verification cases

1. **Offline/online recovery:** Save one synthetic order plus \`created → preparing → ready → completed\` as four pending events; stop HTTP receiver; verify zero ACK; forcibly restart gateway and verify durable four-event Outbox; restart receiver and ACK exactly four, preserving one final order without duplicates.
2. **Post-commit lost HTTP response:** Close the HTTP response AFTER remote durable commit. Local Outbox remains pending; restart the receiver against same sandbox SQLite file; replay returns original signed receipt and finishes without duplicate central mutations.
3. **Tampered HTTP receipts:** Replace the signature in the receiver's *response only*, after durable commit; local verifies signature and refuses ACK. Restore good receipt and replay.
4. **HTTP scope and authentication:** Wrong bearer token, device ID, tenant, branch and digest must all fail without mutating remote inbox.
5. **Production guard:** The existing shared bridge must still reject direct HTTP/local/private test endpoint settings.

The child SQLite gateway also loads W06's test-only outbound-connection guard. Test runner temporarily clears DB connection environment variables, restoring them afterward. All loopback ports are test allocated; not exposed on LAN.

## Running once on Windows

From your existing \`C:\Users\ejaan\Desktop\FOON-Windows-W05\` checkout:

\`\`\`powershell
git fetch origin feat/foon-windows-w09-loopback-http-recovery-20261019
git switch --track origin/feat/foon-windows-w09-loopback-http-recovery-20261019
& ".\apps\desktop\run-w09-windows.ps1"
\`\`\`

No passwords, root access, migration, cloud or MariaDB credentials are required. If the W09 branch is already checked out, use \`git pull --ff-only origin feat/foon-windows-w09-loopback-http-recovery-20261019\` instead of \`git switch --track\`.

## Boundaries

- W09 covers the **underlying Node LAN gateway**, not wiring the Windows desktop UI buttons, and not an actual Internet outage controlled by the test.
- HTTP receiver is a local SQLite **simulation**, not the production Next.js HTTP endpoint or cloud MySQL. Passing W09 **does not prove** end-to-end sync of a real merchant order from installed Windows Desktop to a live server.
- No automatic job, daemon or background sync is enabled. No GitHub Actions, merge, PR or deployment occurs from running tests.
- Next phase should separately test a guarded local Next.js/HTTP endpoint backed by the already reviewed MariaDB fixtures, then only after authorization plan for a staging cloud integration.
