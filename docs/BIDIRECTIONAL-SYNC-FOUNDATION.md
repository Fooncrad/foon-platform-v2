# FOON two-way synchronization: foundation and release guard
Status: CONTRACT ONLY — NO ACTIVE SYNC (2026-10-22)
This work is on an isolated branch above Windows PR #205, not in cloud main.
## Target
All eligible business entities must eventually sync both directions, including categories, items, variants, media, translations, pricing, inventory movements, orders, bookings, tables, business settings and permitted customer references. Never sync passwords, card secrets, private customer keys, raw provider tokens or permission grants without separate server-side controls.
## Invariant
Event UUID for replay prevention; tenant/branch/actor scope checked server-side; per-entity optimistic version; cursor-scoped pull snapshots; durable outbox/inbox within business transactions; atomic idempotency ledger; conflict review; media via authenticated content-addressed uploads; local authorization and cloud revocation.
## What is implemented
`lib/platform/bidirectional-sync-contract.mjs` exports pure validation, optimistic conflict and digest/cursor primitives, with targeted unit tests. This is intentionally NOT a writable API endpoint, database journal, broad row replication or a live integration.
## Required before any activation
1. Design and migrate local/cloud change tables and per-device cursor, scoped by tenant, branch and partition. Plan safe initial snapshot and historic data matching.
2. Per-entity adapters & transaction-safe mutation hooks. Ordering/deletes, media upload, inventory movement and irreversible payments need specialized rules.
3. Authenticated push + pull endpoints: device registration, receipt signing, tenant RBAC/plan checks, 401/403/409 controls, no redirects, reject HTML/preview pages and unsafe transport.
4. Version-aware staging integration test including reconnection, races, duplicate replay, branch isolation, device revocation, compensation, offline age limits, read/write entitlement.
5. Hostinger preview redirect issue fixed and verified on staging. Keep operator's sync pause.
6. Source and signed Windows installer separated from Hostinger API updater distribution, backup/rollback policy reviewed.
No database or production change occurs from this branch until these gates are met.

## Pull cursor correctness (new)
The 0157 migration includes `foon_sync_scope_locks`: every journal writer must acquire the same tenant/branch InnoDB row mutex inside its existing transaction *before allocating* the journal auto-increment identifier, and hold it through commit or rollback. Without commit serialization, transaction B can commit id=12 while A's id=11 remains uncommitted; a polling device advances cursor to 12 and silently misses 11. The mutex prevents this within a scope. All future adapters must use `appendScopedChange` and the same transactional connection; direct inserts bypassing the mutex are forbidden.
This is a source-level concurrency contract; it still requires a real two-session MariaDB integration test and does not authorize syncing live data.

## Authorization-to-transaction service (latest)
`lib/platform/bidirectional-sync-service.mjs` gates each push with a server-verified device context and an explicitly provided business-entity adapter, then records an event and applies its authorized business mutation inside the same DB transaction. Failure rolls back both. Stale or duplicate events do not call the adapter. The pull adapter enforces read grants and tenant/branch scope before calling the journal reader. These functions are **not exposed as HTTP endpoints** and do not establish device authentication; callers must build trusted context from a verified enrollment and current DB grants.
**Critical:** do not call the service with user-submitted `verifiedContext`, arbitrary business adapters or full customer/payment secrets. Schema-aware allowlists, real database tests, durable typed adapters and end-to-end provisioning are still missing; live synchronization remains disabled.

## Entity-specific pull authorization
The journal read service now requires both `sync.read` and a per-entity read grant (e.g. `catalog.read`, `orders.read`, `customers.read`); a device with generic sync read may not download staff/customer contents. A filtered pull still advances over unviewable events: a device whose grants expand later requires an authorized initial snapshot/reconciliation, not a promise that skipped historic data will magically reappear. Sensitive payloads must additionally be projected/redacted by typed adapters before any production endpoint is enabled; full event payloads are NOT production-safe.

## Hostinger preview redirect safety (2026-10-22)
A standalone transport helper `lib/platform/bidirectional-sync-transport.mjs` now requires HTTPS, the dedicated `/api/sync/v1/push` or `/api/sync/v1/pull` pathname, bearer authorization, JSON MIME, successful HTTP status and an explicit `ok:true` response. It sets `redirect:"error"`; HTML preview pages, redirects, unauthorized errors and malformed JSON MUST NOT cause outbox ACK. Its endpoint does **not exist yet**, and helper use is not wired to the Windows worker. This is a fail-closed preparatory contract, not a fix for Hostinger routing.
Before enabling any live device: deploy authenticated server endpoints to staging, test actual Hostinger behavior and signed receipts, validate DNS/IP egress, enforce bounded timeouts, and preserve pending events on failures. Operators have paused sync; this remains unchanged.

## Push receipt and pull cursor validation (new)
`lib/platform/bidirectional-sync-wire-contract.mjs` adds pure wire-response checks. A response with `ok:true` is insufficient to ACK a local event: its receipt must match event UUID, tenant, branch, digest, outcome and next version. A matching receipt is marked **unverified** until a trusted signed-receipt verifier confirms it; no ACK is implemented here. Pull batches require monotonically increasing event IDs and exact tenant/branch scope; their cursor is a candidate and may be persisted only after the local typed business adapter transaction commits. This module does not enable HTTP routes, apply data or unlock sync. Run `npm run test:bidirectional-sync` on a clean checkout and then DB/Windows integration before review.

## Pulled-row verification before delivery
`bidirectional-sync-journal.mjs` includes tenant/branch/source-device IDs in the SELECT. `bidirectional-sync-service.mjs` filters entity-level permissions before `prepareSyncPullEvents` validates each returned journal row's scope, JSON payload and event digest (including actor ID). Corrupt or mismatched rows fail the whole request rather than becoming accepted Windows updates. Additional regression fixtures test branch mismatch, actor substitution and payload corruption. Tests are committed but not yet run in a clean Node environment. This is an internal read service only: no HTTP endpoint, no signed receipt and no production activation.

## Zero-row business writes cannot become journal success
`recordAuthorizedChange` now requires the typed `applyBusinessChange` callback to return literal `true` before committing the transaction; undefined, zero affected rows or unconfirmed outcomes trigger rollback. `requireAffectedBusinessWrite` is an opt-in helper that rejects no-op/multi-row writes, but it is not an authorization or SQL allowlisting replacement. Callers must scope every statement to authenticated tenant and branch, validate domain invariants, and invoke the helper only with trusted, fixed SQL. Add MariaDB transaction and concurrency integration tests before enabling live synchronization. Tests are checked into source but have not been executed here.

## Isolated inventory movement adapter
`lib/platform/bidirectional-sync-inventory.mjs` adds an intentionally isolated `foon_sync_inventory_projection` adapter and tests. It performs a tenant/branch/item-scoped locked read and conditional atomic quantity update within the caller transaction, rejects missing stock, negative balances and zero-row writes. Journal event replay is ignored before business application. **This projection is not the actual FOON catalog inventory.** It is not wired to checkout, POS, merchant stock or HTTP, and no migration has been applied to any database. Before deploying, add verified physical item ownership, decimal units/variants, signed device authentication, server-side typed adapters, real MariaDB transaction tests and release gates.

## Transaction-bound isolated inventory entrypoint
`recordAuthorizedInventoryMovement` now composes the verified-device permission gate, journal deduplication, guarded stock projection update and single transaction commit/rollback. The new unit tests cover one authorized stock movement and denial of a cross-branch movement before transaction start. This operates **only** on the independent staging projection, not real business stock, POS, orders or a live HTTP endpoint. Integration tests on MariaDB and Windows, signed device credential checks and typed production catalog adapters are still required before any release.

## Transaction cleanup hardening
`recordAuthorizedChange` now uses a single `finally` cleanup path: successful commit marks the transaction completed; stale or duplicate events and business failures get exactly one rollback; a failed commit also triggers rollback attempt instead of returning a false success. Unit regression cases cover failed commit and single rollback. This is a source-level safety change; it does not establish the database driver's response to network loss during commit. Such a case still requires event-ID reconciliation before retry or ACK.

## Offline pull atomicity tests
Added `scripts/bidirectional-sync-local-receiver.test.mjs` to the sync suite. It covers one atomic batch commit, rejected server-verification flag, wrong-branch events, stale pull cursors, unconfirmed local writes and failed cursor updates. The receiver stores its cursor only inside the same transaction as typed event application. **The `verifiedServer:true` flag is a trusted-caller contract, not a signature verification implementation.** An authenticated verifier and production-specific event adapters must be wired before accepting network data. These tests are committed but have not been executed in this environment.

## Signed pull batches
`applyVerifiedPullBatch` no longer accepts a boolean `verifiedServer` flag. A pinned Ed25519 server public key and base64url signature are required; `verifySignedPullBatch` binds signature to device ID, tenant, branch, after cursor, next cursor and event contents using a domain-separated deterministic message. Tampered batches fail before any transaction. The public key must originate from trusted enrollment/configuration, never from a network response. The cloud signing endpoint and credential provisioning are not yet implemented; live sync stays disabled. Unit tests exercise locally generated Ed25519 signatures but have not been run in this environment.
